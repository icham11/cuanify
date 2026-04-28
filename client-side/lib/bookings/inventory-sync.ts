import { createHash } from "node:crypto";
import { StockDocumentType, InventoryMovementType, Prisma } from "@prisma/client";
import { simulateFIFOCost, deductFIFO } from "@/lib/inventory/engine";
import { buildDashboardProductName } from "@/lib/products/dashboard-name";

const BAKERY_ORDER_INVENTORY_SOURCE_TYPE = "bakery_order_inventory_sync";
const INVENTORY_PENDING_STATUSES = new Set(["Inquiry", "Quoted", "Cancelled"]);

type Tx = Prisma.TransactionClient;

interface BakeryOrderInventoryItem {
  category?: string;
  subcategory?: string;
  productName?: string;
  size?: string;
  quantity?: number;
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

interface StoredInventoryState {
  version: 1;
  orderId: string;
  orderStatus: string;
  hash: string;
  deductions: StoredInventoryDeduction[];
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

function shouldConsumeInventory(status: string): boolean {
  return !INVENTORY_PENDING_STATUSES.has(status);
}

function buildOrderHash(input: BakeryInventorySyncInput): string {
  const normalized = {
    orderId: input.orderId,
    orderStatus: shouldConsumeInventory(input.orderStatus)
      ? input.orderStatus
      : "PENDING",
    items: input.items
      .map((item) => ({
        category: normalizeText(item.category),
        subcategory: normalizeText(item.subcategory),
        productName: normalizeText(item.productName),
        size: normalizeText(item.size),
        quantity: Math.max(0, Number(item.quantity || 0)),
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
  const metadataJson = JSON.stringify(params.state);

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

async function buildInventoryDeductions(
  tx: Tx,
  businessId: number,
  items: BakeryOrderInventoryItem[],
): Promise<{
  deductions: StoredInventoryDeduction[];
  unresolvedProducts: string[];
}> {
  const requestedProducts = items
    .map((item) => ({
      quantity: Math.max(0, Number(item.quantity || 0)),
      subcategory: normalizeText(item.subcategory),
      dashboardName: buildBookedProductName(item),
    }))
    .filter((item) => item.dashboardName && item.quantity > 0);

  if (requestedProducts.length === 0) {
    return { deductions: [], unresolvedProducts: [] };
  }

  const dashboardNames = Array.from(
    new Set(requestedProducts.map((item) => item.dashboardName)),
  );

  const products = await tx.product.findMany({
    where: {
      businessId,
      deletedAt: null,
      OR: dashboardNames.map((name) => ({
        name: { equals: name, mode: "insensitive" },
      })),
    },
    include: {
      recipes: {
        include: {
          ingredient: {
            select: {
              id: true,
              name: true,
              unit: true,
            },
          },
        },
      },
      category: {
        select: {
          name: true,
        },
      },
    },
  });

  const normalizeKey = (value: string) => value.trim().toLowerCase();
  const productMap = new Map<string, (typeof products)[number]>();
  products.forEach((product) => {
    productMap.set(normalizeKey(product.name), product);
  });

  const ingredientTotals = new Map<
    number,
    {
      ingredientName: string;
      ingredientUnit: string;
      quantity: number;
    }
  >();
  const unresolvedProducts: string[] = [];

  for (const requested of requestedProducts) {
    const matched = productMap.get(normalizeKey(requested.dashboardName));
    if (!matched) {
      unresolvedProducts.push(requested.dashboardName);
      continue;
    }

    for (const recipe of matched.recipes) {
      const current = ingredientTotals.get(recipe.ingredientId) ?? {
        ingredientName: recipe.ingredient.name,
        ingredientUnit: recipe.ingredient.unit,
        quantity: 0,
      };

      current.quantity += Number(recipe.quantity) * requested.quantity;
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

  return {
    deductions,
    unresolvedProducts: Array.from(new Set(unresolvedProducts)),
  };
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

  const shouldConsume = shouldConsumeInventory(input.orderStatus);
  const nextStateBase = {
    version: 1 as const,
    orderId: input.orderId,
    orderStatus: input.orderStatus,
    hash: nextHash,
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
        unresolvedProducts: [],
      },
    });

    return { changed: true, unresolvedProducts: [] };
  }

  const { deductions, unresolvedProducts } = await buildInventoryDeductions(
    tx,
    input.businessId,
    input.items,
  );

  await applyInventoryDeductions(tx, input.businessId, input.orderId, deductions);

  await persistInventoryState(tx, {
    businessId: input.businessId,
    orderId: input.orderId,
    contentHash: nextHash,
    existingId: existing?.id,
    state: {
      ...nextStateBase,
      deductions,
      unresolvedProducts,
    },
  });

  return {
    changed: true,
    unresolvedProducts,
  };
}
