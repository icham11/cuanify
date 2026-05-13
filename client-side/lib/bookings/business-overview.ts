import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { buildDashboardProductName } from "@/lib/products/dashboard-name";
import {
  buildEffectiveAddOnCatalog,
  normalizeCatalogAdminState,
} from "@/lib/bookings/catalog-state";

interface BakeryOrderRow {
  external_id: string;
  payment_status: string | null;
  total_price: unknown;
  total_paid_amount: unknown;
}

interface BakeryOrderItemRow {
  order_external_id: string;
  payload: unknown;
}

interface ParsedBakeryOrderItem {
  category: string;
  productName: string;
  size: string;
  quantity: number;
  addOns: string[];
  addOnQuantities: Record<string, number>;
  customAddOns: Array<{ label: string; cogs: number; quantity: number }>;
}

export interface BusinessOverviewCounts {
  products: number;
  ingredients: number;
  categories: number;
  sales: number;
}

export interface BusinessOverviewStats {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  paidSalesCount: number;
  marginAvg: number | null;
}

export interface BusinessOverviewSummary {
  counts: BusinessOverviewCounts;
  stats: BusinessOverviewStats;
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function normalizePaymentStatus(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

function parseBakeryOrderItem(payload: unknown): ParsedBakeryOrderItem | null {
  const record = asRecord(payload);
  if (!record) return null;

  const productName = asString(record.productName).trim();
  if (!productName) return null;

  return {
    category: asString(record.category).trim(),
    productName,
    size: asString(record.size).trim(),
    quantity: Math.max(0, toNumber(record.quantity)),
    addOns: Array.isArray(record.addOns)
      ? record.addOns.filter((entry): entry is string => typeof entry === "string")
      : [],
    addOnQuantities:
      asRecord(record.addOnQuantities)
        ? Object.fromEntries(
            Object.entries(asRecord(record.addOnQuantities) ?? {}).map(([key, value]) => [
              key,
              Math.max(1, toNumber(value)),
            ]),
          )
        : {},
    customAddOns: Array.isArray(record.customAddOns)
      ? record.customAddOns
          .map((entry) => {
            const row = asRecord(entry);
            if (!row) return null;
            return {
              label: asString(row.label).trim(),
              cogs: Math.max(0, toNumber(row.cogs)),
              quantity: Math.max(1, toNumber(row.quantity) || 1),
            };
          })
          .filter((entry): entry is { label: string; cogs: number; quantity: number } => Boolean(entry))
      : [],
  };
}

function buildProductNameCandidates(item: ParsedBakeryOrderItem): string[] {
  const candidates = new Set<string>();
  const rawProductName = item.productName.trim();
  const rawSize = item.size.trim();

  if (rawProductName) {
    candidates.add(rawProductName);
  }

  if (rawProductName && rawSize) {
    candidates.add(`${rawProductName} - ${rawSize}`);
    candidates.add(
      buildDashboardProductName({
        productName: rawProductName,
        variantLabel: rawSize,
        variantCount: 999,
      }),
    );
  }

  const normalizedSize = rawSize.toLowerCase();
  if (
    rawProductName &&
    rawSize &&
    !["standard", "start from"].includes(normalizedSize)
  ) {
    candidates.add(`${rawProductName}-${rawSize}`);
  }

  return Array.from(candidates);
}

async function getBakeryOverview(
  businessId: number,
  counts: Pick<BusinessOverviewCounts, "products" | "ingredients" | "categories">,
): Promise<BusinessOverviewSummary | null> {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE bakery_orders
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
  `);

  const bakeryOrderRows = await prisma.$queryRaw<BakeryOrderRow[]>`
    WITH latest_orders AS (
      SELECT *
      FROM (
        SELECT
          bo.*,
          ROW_NUMBER() OVER (
            PARTITION BY bo.business_id, bo.external_id
            ORDER BY bo.updated_at DESC, bo.id DESC
          ) AS rn
        FROM bakery_orders bo
        WHERE bo.business_id = ${businessId}
      ) ranked_orders
      WHERE ranked_orders.rn = 1
    )
    SELECT external_id, payment_status, total_price
         , total_paid_amount
    FROM latest_orders
    WHERE business_id = ${businessId}
      AND deleted_at IS NULL
      AND LOWER(COALESCE(order_status, '')) <> 'cancelled'
      AND (
        LOWER(COALESCE(payment_status, '')) IN ('dp paid', 'paid')
        OR COALESCE(total_paid_amount, 0) > 0
      )
  `;

  if (bakeryOrderRows.length === 0) {
    return null;
  }

  const paidOrderIds = bakeryOrderRows.map((row) => row.external_id);

  const bakeryOrderItems = paidOrderIds.length
    ? await prisma.$queryRaw<BakeryOrderItemRow[]>`
        WITH latest_items AS (
          SELECT *
          FROM (
            SELECT
              item.*,
              ROW_NUMBER() OVER (
                PARTITION BY item.business_id, item.order_external_id, item.item_index
                ORDER BY item.created_at DESC, item.id DESC
              ) AS rn
            FROM bakery_order_items item
            WHERE item.business_id = ${businessId}
              AND item.order_external_id IN (${Prisma.join(paidOrderIds)})
          ) ranked_items
          WHERE ranked_items.rn = 1
        )
        SELECT order_external_id, payload
        FROM latest_items
      `
    : [];

  const configRows = await prisma.$queryRaw<Array<{ metadata: unknown }>>`
    SELECT metadata
    FROM "BusinessDocument"
    WHERE "businessId" = ${businessId}
      AND "sourceType" = 'bakery_catalog_config'
    ORDER BY "updatedAt" DESC
    LIMIT 1
  `;
  const addOnCatalog = buildEffectiveAddOnCatalog(
    normalizeCatalogAdminState(configRows[0]?.metadata ?? {}),
  );
  const addOnCostMap = new Map<string, number>();
  Object.entries(addOnCatalog).forEach(([category, addOns]) => {
    addOns.forEach((addOn) => {
      addOnCostMap.set(
        `${normalizeText(category)}||${normalizeText(addOn.id)}`,
        toNumber(addOn.cogs),
      );
    });
  });

  const products = await prisma.product.findMany({
    where: { businessId },
    select: {
      id: true,
      name: true,
      cogs: true,
    },
  });

  const productCostMap = new Map<string, number>();
  products.forEach((product) => {
    productCostMap.set(normalizeText(product.name), toNumber(product.cogs));
  });

  const paidOrderIdSet = new Set(paidOrderIds);
  const paidOrderRatioMap = new Map<string, number>();
  bakeryOrderRows.forEach((row) => {
    const totalPrice = Math.max(0, toNumber(row.total_price));
    const paidAmount = Math.min(totalPrice, Math.max(0, toNumber(row.total_paid_amount)));
    const ratio = totalPrice > 0 ? Math.min(1, paidAmount / totalPrice) : 0;
    paidOrderRatioMap.set(row.external_id, ratio);
  });
  let totalCost = 0;

  bakeryOrderItems.forEach((row) => {
    if (!paidOrderIdSet.has(row.order_external_id)) return;

    const item = parseBakeryOrderItem(row.payload);
    if (!item || item.quantity <= 0) return;
    const recognitionRatio = paidOrderRatioMap.get(row.order_external_id) ?? 0;

    const productCost =
      buildProductNameCandidates(item)
        .map((candidate) => productCostMap.get(normalizeText(candidate)))
        .find((value) => typeof value === "number") ?? 0;

    totalCost += productCost * item.quantity * recognitionRatio;

    const normalizedCategory = normalizeText(item.category);
    item.addOns.forEach((addOnId) => {
      const units = Math.max(1, toNumber(item.addOnQuantities[addOnId]) || 1);
      const addOnCost =
        addOnCostMap.get(
          `${normalizedCategory}||${normalizeText(addOnId)}`,
        ) ?? 0;
      totalCost += addOnCost * units * recognitionRatio;
    });

    item.customAddOns.forEach((addOn) => {
      totalCost +=
        Math.max(0, addOn.cogs) *
        Math.max(1, addOn.quantity) *
        recognitionRatio;
    });
  });

  const paidOrders = bakeryOrderRows.filter(
    (row) =>
      normalizePaymentStatus(row.payment_status) === "paid" ||
      toNumber(row.total_paid_amount) > 0,
  );
  const totalRevenue = paidOrders.reduce(
    (sum, row) =>
      sum +
      Math.min(
        Math.max(0, toNumber(row.total_price)),
        Math.max(0, toNumber(row.total_paid_amount)),
      ),
    0,
  );
  const totalProfit = totalRevenue - totalCost;

  return {
    counts: {
      ...counts,
      sales: bakeryOrderRows.length,
    },
    stats: {
      totalRevenue,
      totalCost,
      totalProfit,
      paidSalesCount: paidOrders.length,
      marginAvg: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : null,
    },
  };
}

async function getLegacySalesOverview(
  businessId: number,
  counts: Pick<BusinessOverviewCounts, "products" | "ingredients" | "categories">,
): Promise<BusinessOverviewSummary> {
  const [revenueAgg, paidSalesCount, totalSalesCount] = await Promise.all([
    prisma.sale.aggregate({
      where: { businessId, paymentStatus: "Paid" },
      _sum: { totalRevenue: true, totalCost: true },
    }),
    prisma.sale.count({ where: { businessId, paymentStatus: "Paid" } }),
    prisma.sale.count({ where: { businessId } }),
  ]);

  const totalRevenue = Number(revenueAgg._sum.totalRevenue ?? 0);
  const totalCost = Number(revenueAgg._sum.totalCost ?? 0);
  const totalProfit = totalRevenue - totalCost;

  return {
    counts: {
      ...counts,
      sales: totalSalesCount,
    },
    stats: {
      totalRevenue,
      totalCost,
      totalProfit,
      paidSalesCount,
      marginAvg: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : null,
    },
  };
}

export async function getBusinessOverviewSummary(
  businessId: number,
): Promise<BusinessOverviewSummary> {
  const [products, ingredients, categories] = await Promise.all([
    prisma.product.count({
      where: {
        businessId,
        deletedAt: null,
      },
    }),
    prisma.ingredient.count({ where: { businessId } }),
    prisma.category.count({
      where: {
        businessId,
        products: {
          some: {
            deletedAt: null,
          },
        },
      },
    }),
  ]);

  const baseCounts = { products, ingredients, categories };
  const bakeryOverview = await getBakeryOverview(businessId, baseCounts);

  if (bakeryOverview) {
    return bakeryOverview;
  }

  return getLegacySalesOverview(businessId, baseCounts);
}
