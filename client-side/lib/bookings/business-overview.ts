import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { buildDashboardProductName } from "@/lib/bookings/product-sync";

interface BakeryOrderRow {
  external_id: string;
  payment_status: string | null;
  total_price: unknown;
}

interface BakeryOrderItemRow {
  order_external_id: string;
  payload: unknown;
}

interface ParsedBakeryOrderItem {
  productName: string;
  size: string;
  quantity: number;
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

function parseBakeryOrderItem(payload: unknown): ParsedBakeryOrderItem | null {
  const record = asRecord(payload);
  if (!record) return null;

  const productName = asString(record.productName).trim();
  if (!productName) return null;

  return {
    productName,
    size: asString(record.size).trim(),
    quantity: Math.max(0, toNumber(record.quantity)),
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
    FROM latest_orders
    WHERE business_id = ${businessId}
      AND LOWER(COALESCE(order_status, '')) = 'completed'
      AND deleted_at IS NULL
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
  let totalCost = 0;

  bakeryOrderItems.forEach((row) => {
    if (!paidOrderIdSet.has(row.order_external_id)) return;

    const item = parseBakeryOrderItem(row.payload);
    if (!item || item.quantity <= 0) return;

    const productCost =
      buildProductNameCandidates(item)
        .map((candidate) => productCostMap.get(normalizeText(candidate)))
        .find((value) => typeof value === "number") ?? 0;

    totalCost += productCost * item.quantity;
  });

  const paidOrders = bakeryOrderRows;
  const totalRevenue = paidOrders.reduce(
    (sum, row) => sum + toNumber(row.total_price),
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
