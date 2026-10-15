import { createHash } from "node:crypto";
import { StockDocumentType, InventoryMovementType, Prisma } from "@prisma/client";
import { simulateFIFOCost, deductFIFO } from "@/lib/inventory/engine";
import { buildDashboardProductName } from "@/lib/products/dashboard-name";
import { getProductFieldAvailability } from "@/lib/products/prisma-product-capabilities";
import { normalizeProductNameKey } from "@/lib/products/uniqueness";
import { toJsonb } from "./json-safe";

const BAKERY_ORDER_INVENTORY_SOURCE_TYPE = "bakery_order_inventory_sync";
const INVENTORY_PENDING_STATUSES = new Set(["Inquiry", "Quoted", "Cancelled"]);

type Tx = Prisma.TransactionClient;

interface BakeryOrderInventoryItem {
  category?: string;
  subcategory?: string;
  productName?: string;
  size?: string;
  quantity?: number;
  productId?: number | null;
}

interface BakeryInventorySyncInput {
  businessId: number;
  orderId: string;
  orderStatus: string;
  items: BakeryOrderInventoryItem[];
}

interface StoredInventoryDeduction {
  ingredientId: number;
  ingredientName: string;
  ingredientUnit: string;
  quantity: number;
  breakdown: Array<{
    batchId: number;
    quantity: number;
    costPerUnit: number;
  }>;
}

// Pengurangan stok produk jadi (Product.manualStock, yang tampil di halaman
// Products). quantity = jumlah yang benar-benar dipotong, agar restore tepat.
interface StoredProductStockDeduction {
  productId: number;
  productName: string;
  quantity: number;
}

interface StoredInventoryState {
  version: 1;
  orderId: string;
  orderStatus: string;
  hash: string;
  deductions: StoredInventoryDeduction[];
  // Hanya order yang dibuat setelah fitur ini aktif yang memotong stok produk.
  // Order lama (state tanpa flag) tidak dipotong agar stok tidak terhitung dobel.
  productStockTracked?: boolean;
  productStockDeductions?: StoredProductStockDeduction[];
  unresolvedProducts: string[];
  updatedAt: string;
}

function normalizeText(value: string | undefined): string {
  return String(value || "").trim();
}

function buildBookedProductName(item: BakeryOrderInventoryItem): string {
  return buildDashboardProductName({
    productName: normalizeText(item.productName),
    variantLabel: normalizeText(item.size),
    variantCount: 999,
  });
}

function resolveItemProductId(item: BakeryOrderInventoryItem): number | null {
  const productId = Number(item.productId);
  return Number.isInteger(productId) && productId > 0 ? productId : null;
}

// Nama produk di Products bisa "Nama - Ukuran" atau cukup "Nama" (produk satu
// varian Standard/Start From), jadi coba keduanya berurutan.
function buildProductNameCandidates(item: BakeryOrderInventoryItem): string[] {
  const productName = normalizeText(item.productName);
  const size = normalizeText(item.size);
  if (!productName) return [];

  const candidates = size
    ? [buildBookedProductName(item), productName]
    : [productName];
  return Array.from(new Set(candidates));
}

function shouldConsumeInventory(status: string): boolean {
  return !INVENTORY_PENDING_STATUSES.has(status);
}

function buildOrderHash(input: BakeryInventorySyncInput): string {
  // Hanya status aktif vs pending yang memengaruhi stok; perpindahan antar status
  // aktif (In Production -> Ready -> Completed) tidak perlu restore + potong ulang.
  const normalized = {
    orderId: input.orderId,
    orderStatus: shouldConsumeInventory(input.orderStatus)
      ? "ACTIVE"
      : "PENDING",
    items: input.items
      .map((item) => ({
        category: normalizeText(item.category),
        subcategory: normalizeText(item.subcategory),
        productName: normalizeText(item.productName),
        size: normalizeText(item.size),
        quantity: Math.max(0, Number(item.quantity || 0)),
        productId: resolveItemProductId(item),
      }))
      .filter((item) => item.productName && item.quantity > 0)
      .sort((a, b) => {
        const left = `${a.subcategory}|${a.productName}|${a.size}`;
        const right = `${b.subcategory}|${b.productName}|${b.size}`;
        return left.localeCompare(right);
      }),
  };

  return createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");
}

async function loadStoredInventoryState(
  tx: Tx,
  businessId: number,
  orderId: string,
): Promise<{ id: number; metadata: StoredInventoryState } | null> {
  const rows = await tx.$queryRaw<Array<{ id: number; metadata: unknown }>>`
    SELECT id, metadata
    FROM "BusinessDocument"
    WHERE "businessId" = ${businessId}
      AND "sourceType" = ${BAKERY_ORDER_INVENTORY_SOURCE_TYPE}
      AND content = ${`bakery-order:${orderId}`}
    ORDER BY "updatedAt" DESC
    LIMIT 1
  `;

  const row = rows[0];
  if (!row?.metadata || typeof row.metadata !== "object") {
    return null;
  }

  const metadata = row.metadata as Partial<StoredInventoryState>;
  if (!Array.isArray(metadata.deductions) || typeof metadata.hash !== "string") {
    return null;
  }

  return {
    id: row.id,
    metadata: {
      version: 1,
      orderId,
      orderStatus: typeof metadata.orderStatus === "string" ? metadata.orderStatus : "",
      hash: metadata.hash,
      deductions: metadata.deductions.map((deduction) => ({
        ingredientId: Number(deduction.ingredientId || 0),
        ingredientName: String(deduction.ingredientName || ""),
        ingredientUnit: String(deduction.ingredientUnit || ""),
        quantity: Number(deduction.quantity || 0),
        breakdown: Array.isArray(deduction.breakdown)
          ? deduction.breakdown.map((entry) => ({
              batchId: Number(entry.batchId || 0),
              quantity: Number(entry.quantity || 0),
              costPerUnit: Number(entry.costPerUnit || 0),
            }))
          : [],
      })),
      productStockTracked: metadata.productStockTracked === true,
      productStockDeductions: Array.isArray(metadata.productStockDeductions)
        ? metadata.productStockDeductions.map((deduction) => ({
            productId: Number(deduction.productId || 0),
            productName: String(deduction.productName || ""),
            quantity: Number(deduction.quantity || 0),
          }))
        : [],
      unresolvedProducts: Array.isArray(metadata.unresolvedProducts)
        ? metadata.unresolvedProducts.map((value) => String(value))
        : [],
      updatedAt:
        typeof metadata.updatedAt === "string"
          ? metadata.updatedAt
          : new Date().toISOString(),
    },
  };
}

async function persistInventoryState(
  tx: Tx,
  params: {
    businessId: number;
    orderId: string;
    contentHash: string;
    state: StoredInventoryState;
    existingId?: number;
  },
) {
  const content = `bakery-order:${params.orderId}`;
  const metadataJson = toJsonb(params.state);

  if (params.existingId) {
    await tx.$executeRaw`
      UPDATE "BusinessDocument"
      SET content = ${content},
          "contentHash" = ${params.contentHash},
          metadata = ${metadataJson}::jsonb,
          "updatedAt" = NOW()
      WHERE id = ${params.existingId}
    `;
    return;
  }

  await tx.$executeRaw`
    INSERT INTO "BusinessDocument"
      ("businessId", content, "contentHash", "sourceType", metadata, "chunkIndex", "createdAt", "updatedAt")
    VALUES
      (${params.businessId}, ${content}, ${params.contentHash}, ${BAKERY_ORDER_INVENTORY_SOURCE_TYPE}, ${metadataJson}::jsonb, 0, NOW(), NOW())
  `;
}

async function restorePreviousInventory(
  tx: Tx,
  businessId: number,
  orderId: string,
  deductions: StoredInventoryDeduction[],
) {
  if (deductions.length === 0) return;

  const stockDocument = await tx.stockDocument.create({
    data: {
      businessId,
      type: StockDocumentType.Production,
      notes: `Auto restore bakery inventory for order ${orderId}`,
    },
  });

  for (const deduction of deductions) {
    for (const entry of deduction.breakdown) {
      const batch = await tx.inventoryBatch.findUnique({
        where: { id: entry.batchId },
      });

      if (batch) {
        await tx.inventoryBatch.update({
          where: { id: batch.id },
          data: {
            remainingQty: Number(batch.remainingQty) + entry.quantity,
          },
        });
      } else {
        await tx.inventoryBatch.create({
          data: {
            ingredientId: deduction.ingredientId,
            remainingQty: entry.quantity,
            costPerUnit: entry.costPerUnit,
          },
        });
      }

      await tx.inventoryMovement.create({
        data: {
          ingredientId: deduction.ingredientId,
          ingredientNameSnapshot: deduction.ingredientName,
          ingredientUnitSnapshot: deduction.ingredientUnit,
          stockDocumentId: stockDocument.id,
          quantity: entry.quantity,
          costPerUnit: entry.costPerUnit,
          type: InventoryMovementType.In,
        },
      });
    }
  }
}

type ResolvedOrderProduct = {
  productId: number;
  productName: string;
  quantity: number;
  recipes: Array<{
    ingredientId: number;
    quantity: number;
    ingredient: { name: string; unit: string };
  }>;
};

async function resolveOrderProducts(
  tx: Tx,
  businessId: number,
  items: BakeryOrderInventoryItem[],
): Promise<{
  resolved: ResolvedOrderProduct[];
  unresolvedProducts: string[];
}> {
  const requestedProducts = items
    .map((item) => ({
      quantity: Math.max(0, Number(item.quantity || 0)),
      productId: resolveItemProductId(item),
      nameCandidates: buildProductNameCandidates(item),
      dashboardName: buildBookedProductName(item),
    }))
    .filter((item) => item.nameCandidates.length > 0 && item.quantity > 0);

  if (requestedProducts.length === 0) {
    return { resolved: [], unresolvedProducts: [] };
  }

  const candidateNames = Array.from(
    new Set(requestedProducts.flatMap((item) => item.nameCandidates)),
  );
  const candidateIds = Array.from(
    new Set(
      requestedProducts
        .map((item) => item.productId)
        .filter((id): id is number => id !== null),
    ),
  );

  const products = await tx.product.findMany({
    where: {
      businessId,
      deletedAt: null,
      OR: [
        ...(candidateIds.length > 0 ? [{ id: { in: candidateIds } }] : []),
        ...candidateNames.map((name) => ({
          name: { equals: name, mode: "insensitive" as const },
        })),
      ],
    },
    select: {
      id: true,
      name: true,
      recipes: {
        select: {
          ingredientId: true,
          quantity: true,
          ingredient: {
            select: {
              name: true,
              unit: true,
            },
          },
        },
      },
    },
  });

  const productById = new Map(products.map((product) => [product.id, product]));
  const productByName = new Map<string, (typeof products)[number]>();
  products.forEach((product) => {
    productByName.set(normalizeProductNameKey(product.name), product);
  });

  const resolvedById = new Map<number, ResolvedOrderProduct>();
  const unresolvedProducts: string[] = [];

  for (const requested of requestedProducts) {
    const matched =
      (requested.productId !== null
        ? productById.get(requested.productId)
        : undefined) ??
      requested.nameCandidates
        .map((name) => productByName.get(normalizeProductNameKey(name)))
        .find(Boolean);

    if (!matched) {
      unresolvedProducts.push(requested.dashboardName);
      continue;
    }

    const current = resolvedById.get(matched.id) ?? {
      productId: matched.id,
      productName: matched.name,
      quantity: 0,
      recipes: matched.recipes.map((recipe) => ({
        ingredientId: recipe.ingredientId,
        quantity: Number(recipe.quantity),
        ingredient: recipe.ingredient,
      })),
    };
    current.quantity += requested.quantity;
    resolvedById.set(matched.id, current);
  }

  return {
    resolved: Array.from(resolvedById.values()),
    unresolvedProducts: Array.from(new Set(unresolvedProducts)),
  };
}

async function buildInventoryDeductions(
  tx: Tx,
  resolvedProducts: ResolvedOrderProduct[],
): Promise<StoredInventoryDeduction[]> {
  const ingredientTotals = new Map<
    number,
    {
      ingredientName: string;
      ingredientUnit: string;
      quantity: number;
    }
  >();

  for (const product of resolvedProducts) {
    for (const recipe of product.recipes) {
      const current = ingredientTotals.get(recipe.ingredientId) ?? {
        ingredientName: recipe.ingredient.name,
        ingredientUnit: recipe.ingredient.unit,
        quantity: 0,
      };

      current.quantity += recipe.quantity * product.quantity;
      ingredientTotals.set(recipe.ingredientId, current);
    }
  }

  const deductions: StoredInventoryDeduction[] = [];

  for (const [ingredientId, summary] of ingredientTotals.entries()) {
    if (summary.quantity <= 0) continue;

    const { breakdown } = await simulateFIFOCost(tx, ingredientId, summary.quantity);
    deductions.push({
      ingredientId,
      ingredientName: summary.ingredientName,
      ingredientUnit: summary.ingredientUnit,
      quantity: summary.quantity,
      breakdown,
    });
  }

  return deductions;
}

async function canTrackProductStock(): Promise<boolean> {
  try {
    const { hasManualStock } = await getProductFieldAvailability();
    return hasManualStock;
  } catch {
    return false;
  }
}

// Potong stok produk sebanyak pesanan, maksimal sisa stok (tidak sampai minus),
// dan catat jumlah yang benar-benar dipotong.
async function applyProductStockDeductions(
  tx: Tx,
  resolvedProducts: ResolvedOrderProduct[],
): Promise<StoredProductStockDeduction[]> {
  const deductions: StoredProductStockDeduction[] = [];

  for (const product of resolvedProducts) {
    if (product.quantity <= 0) continue;

    const rows = await tx.$queryRaw<Array<{ deducted: number }>>`
      WITH current_stock AS (
        SELECT id, GREATEST("manualStock", 0) AS stock
        FROM "Product"
        WHERE id = ${product.productId}
        FOR UPDATE
      )
      UPDATE "Product" p
      SET "manualStock" = p."manualStock" - LEAST(${product.quantity}::int, current_stock.stock),
          "updatedAt" = NOW()
      FROM current_stock
      WHERE p.id = current_stock.id
        AND current_stock.stock > 0
      RETURNING LEAST(${product.quantity}::int, current_stock.stock)::int AS deducted
    `;

    const deducted = Number(rows[0]?.deducted ?? 0);
    if (deducted > 0) {
      deductions.push({
        productId: product.productId,
        productName: product.productName,
        quantity: deducted,
      });
    }
  }

  return deductions;
}

async function restoreProductStockDeductions(
  tx: Tx,
  deductions: StoredProductStockDeduction[],
) {
  for (const deduction of deductions) {
    if (deduction.quantity <= 0) continue;
    await tx.$executeRaw`
      UPDATE "Product"
      SET "manualStock" = "manualStock" + ${deduction.quantity}::int,
          "updatedAt" = NOW()
      WHERE id = ${deduction.productId}
    `;
  }
}

async function applyInventoryDeductions(
  tx: Tx,
  businessId: number,
  orderId: string,
  deductions: StoredInventoryDeduction[],
) {
  if (deductions.length === 0) return;

  const stockDocument = await tx.stockDocument.create({
    data: {
      businessId,
      type: StockDocumentType.Production,
      notes: `Auto consume bakery inventory for order ${orderId}`,
    },
  });

  for (const deduction of deductions) {
    await deductFIFO(
      tx,
      deduction.ingredientId,
      deduction.breakdown,
      stockDocument.id,
    );
  }
}

export async function syncBakeryOrderInventory(
  tx: Tx,
  input: BakeryInventorySyncInput,
) {
  const nextHash = buildOrderHash(input);
  const existing = await loadStoredInventoryState(tx, input.businessId, input.orderId);
  // Order baru (belum punya state) ikut memotong stok produk; order lama tidak.
  const productStockTracked = existing
    ? existing.metadata.productStockTracked === true
    : true;

  if (existing?.metadata.hash === nextHash) {
    return {
      changed: false,
      unresolvedProducts: existing.metadata.unresolvedProducts,
    };
  }

  if (existing?.metadata.deductions.length) {
    await restorePreviousInventory(
      tx,
      input.businessId,
      input.orderId,
      existing.metadata.deductions,
    );
  }

  if (existing?.metadata.productStockDeductions?.length) {
    await restoreProductStockDeductions(
      tx,
      existing.metadata.productStockDeductions,
    );
  }

  const shouldConsume = shouldConsumeInventory(input.orderStatus);
  const nextStateBase = {
    version: 1 as const,
    orderId: input.orderId,
    orderStatus: input.orderStatus,
    hash: nextHash,
    productStockTracked,
    updatedAt: new Date().toISOString(),
  };

  if (!shouldConsume) {
    await persistInventoryState(tx, {
      businessId: input.businessId,
      orderId: input.orderId,
      contentHash: nextHash,
      existingId: existing?.id,
      state: {
        ...nextStateBase,
        deductions: [],
        productStockDeductions: [],
        unresolvedProducts: [],
      },
    });

    return { changed: true, unresolvedProducts: [] };
  }

  const { resolved, unresolvedProducts } = await resolveOrderProducts(
    tx,
    input.businessId,
    input.items,
  );
  const deductions = await buildInventoryDeductions(tx, resolved);

  await applyInventoryDeductions(tx, input.businessId, input.orderId, deductions);

  const productStockDeductions =
    productStockTracked && (await canTrackProductStock())
      ? await applyProductStockDeductions(tx, resolved)
      : [];

  await persistInventoryState(tx, {
    businessId: input.businessId,
    orderId: input.orderId,
    contentHash: nextHash,
    existingId: existing?.id,
    state: {
      ...nextStateBase,
      deductions,
      productStockDeductions,
      unresolvedProducts,
    },
  });

  return {
    changed: true,
    unresolvedProducts,
  };
}

// Dipakai jalur yang hanya mengubah status (PATCH) atau menghapus order: item
// diambil dari bakery_order_items agar stok dipotong/dikembalikan dengan benar.
export async function syncBakeryOrderInventoryForStatus(
  tx: Tx,
  input: { businessId: number; orderId: string; orderStatus: string },
) {
  const rows = await tx.$queryRaw<Array<{ payload: unknown }>>`
    SELECT payload
    FROM bakery_order_items
    WHERE business_id = ${input.businessId}
      AND order_external_id = ${input.orderId}
    ORDER BY item_index ASC
  `;

  const items: BakeryOrderInventoryItem[] = rows.map((row) => {
    const raw =
      typeof row.payload === "string" ? safeParseJson(row.payload) : row.payload;
    const record =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    return {
      category: typeof record.category === "string" ? record.category : "",
      subcategory:
        typeof record.subcategory === "string" ? record.subcategory : "",
      productName:
        typeof record.productName === "string" ? record.productName : "",
      size: typeof record.size === "string" ? record.size : "",
      quantity: Number(record.quantity || 0),
      productId:
        typeof record.productId === "number" ? record.productId : null,
    };
  });

  return syncBakeryOrderInventory(tx, {
    businessId: input.businessId,
    orderId: input.orderId,
    orderStatus: input.orderStatus,
    items,
  });
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
