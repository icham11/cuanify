import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { buildDashboardProductName } from "@/lib/products/dashboard-name";
import type { DailySalesEntry } from "@/lib/forecasting/utils";

type BakeryOrderRow = {
  external_id: string;
  total_price: unknown;
  dp_paid_amount: unknown;
  final_paid_amount: unknown;
  total_paid_amount: unknown;
  payment_status: string | null;
  order_status: string | null;
  delivery_date: string | null;
  created_at: Date;
};

type BakeryOrderItemRow = {
  order_external_id: string;
  payload: unknown;
};

type ProductRecord = {
  id: number;
  name: string;
  cogs: unknown;
  category: { id: number; name: string } | null;
};

type ParsedItem = {
  productName: string;
  size: string;
  quantity: number;
  basePrice: number;
  addOnTotal: number;
  lineTotal: number;
};

export type BakeryProductAnalytics = {
  productId: number | null;
  productName: string;
  quantitySold: number;
  revenue: number;
  cost: number;
  profit: number;
  profitMargin: number;
  categoryId: number | null;
  categoryName: string;
};

export type BakeryCategoryAnalytics = {
  categoryId: number | null;
  categoryName: string;
  quantitySold: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  contribution: number;
};

export type BakeryDailyPoint = {
  date: string;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  growthRate: number;
};

export type BakeryHealthPoint = {
  date: string;
  revenueScore: number;
  profitScore: number;
  wasteScore: number;
  stabilityScore: number;
  overallScore: number;
  classification: string;
};

export type BakeryForecastProductSeries = {
  productId: number;
  entries: DailySalesEntry[];
  historicalPrices: number[];
};

export type BakeryPaymentSummary = {
  totalOrderCount: number;
  dpOrderCount: number;
  paidOrderCount: number;
  dpRevenue: number;
  paidRevenue: number;
  dpCashIn: number;
  paidCashIn: number;
};

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

function toJakartaDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function parseBakeryItem(payload: unknown): ParsedItem | null {
  const record = asRecord(payload);
  if (!record) return null;

  const productName = asString(record.productName).trim();
  if (!productName) return null;

  const quantity = Math.max(0, toNumber(record.quantity));
  const basePrice = Math.max(0, toNumber(record.basePrice));
  const addOnTotal = Math.max(0, toNumber(record.addOnTotal));
  const lineTotalRaw = Math.max(0, toNumber(record.lineTotal));

  return {
    productName,
    size: asString(record.size).trim(),
    quantity,
    basePrice,
    addOnTotal,
    lineTotal:
      lineTotalRaw > 0 ? lineTotalRaw : (basePrice + addOnTotal) * quantity,
  };
}

function buildProductCandidates(item: ParsedItem): string[] {
  const candidates = new Set<string>();
  if (item.productName) candidates.add(item.productName);

  if (item.productName && item.size) {
    candidates.add(`${item.productName} - ${item.size}`);
    candidates.add(
      buildDashboardProductName({
        productName: item.productName,
        variantLabel: item.size,
        variantCount: 999,
      }),
    );
  }

  return Array.from(candidates);
}

async function loadBusinessProducts(
  businessId: number,
): Promise<Map<string, ProductRecord>> {
  const products = await prisma.product.findMany({
    where: { businessId },
    select: {
      id: true,
      name: true,
      cogs: true,
      category: { select: { id: true, name: true } },
    },
  });

  const map = new Map<string, ProductRecord>();
  products.forEach((product) => {
    map.set(normalizeText(product.name), product);
  });

  return map;
}

async function ensureBakeryReportColumns(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE bakery_orders
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
  `);
}

function getAnalyticsDateKeyForOrder(order: BakeryOrderRow): string {
  const normalizedDeliveryDate = (order.delivery_date || "").trim();
  if (normalizedDeliveryDate) return normalizedDeliveryDate;
  return toJakartaDateKey(order.created_at);
}

async function loadReportableBakeryOrders(
  businessId: number,
  startDate: Date,
  endDate: Date,
): Promise<BakeryOrderRow[]> {
  await ensureBakeryReportColumns();

  const startKey = toJakartaDateKey(startDate);
  const endKey = toJakartaDateKey(endDate);

  return prisma.$queryRaw<BakeryOrderRow[]>`
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
    SELECT
      external_id,
      total_price,
      dp_paid_amount,
      final_paid_amount,
      total_paid_amount,
      payment_status,
      order_status,
      delivery_date,
      created_at
    FROM latest_orders
    WHERE business_id = ${businessId}
      AND deleted_at IS NULL
      AND LOWER(COALESCE(order_status, '')) <> 'cancelled'
      AND (
        LOWER(COALESCE(payment_status, '')) IN ('dp paid', 'paid')
        OR COALESCE(total_paid_amount, 0) > 0
      )
      AND COALESCE(
        NULLIF(TRIM(delivery_date), ''),
        TO_CHAR((created_at AT TIME ZONE 'Asia/Jakarta')::date, 'YYYY-MM-DD')
      )::date BETWEEN ${startKey}::date AND ${endKey}::date
    ORDER BY created_at ASC
  `;
}

async function loadBakeryOrderItems(
  businessId: number,
  orderIds: string[],
): Promise<BakeryOrderItemRow[]> {
  if (orderIds.length === 0) return [];

  return prisma.$queryRaw<BakeryOrderItemRow[]>`
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
          AND item.order_external_id IN (${Prisma.join(orderIds)})
      ) ranked_items
      WHERE ranked_items.rn = 1
    )
    SELECT order_external_id, payload
    FROM latest_items
  `;
}

export async function hasBakeryOrders(businessId: number): Promise<boolean> {
  await ensureBakeryReportColumns();

  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM bakery_orders
    WHERE business_id = ${businessId}
      AND deleted_at IS NULL
      AND LOWER(COALESCE(order_status, '')) <> 'cancelled'
      AND (
        LOWER(COALESCE(payment_status, '')) IN ('dp paid', 'paid')
        OR COALESCE(total_paid_amount, 0) > 0
      )
  `;
  return Number(rows[0]?.count ?? 0) > 0;
}

export async function getBakeryPaymentSummary(
  businessId: number,
  startDate: Date,
  endDate: Date,
): Promise<BakeryPaymentSummary> {
  const orders = await loadReportableBakeryOrders(businessId, startDate, endDate);

  return orders.reduce<BakeryPaymentSummary>(
    (acc, order) => {
      const paymentStatus = normalizePaymentStatus(order.payment_status);
      const totalPrice = toNumber(order.total_price);
      const totalPaidAmount = toNumber(order.total_paid_amount);

      acc.totalOrderCount += 1;

      if (paymentStatus === "paid") {
        acc.paidOrderCount += 1;
        acc.paidRevenue += totalPrice;
        acc.paidCashIn += totalPaidAmount;
        return acc;
      }

      acc.dpOrderCount += 1;
      acc.dpRevenue += totalPrice;
      acc.dpCashIn += totalPaidAmount;
      return acc;
    },
    {
      totalOrderCount: 0,
      dpOrderCount: 0,
      paidOrderCount: 0,
      dpRevenue: 0,
      paidRevenue: 0,
      dpCashIn: 0,
      paidCashIn: 0,
    },
  );
}

export async function getBakeryProductAnalytics(
  businessId: number,
  startDate: Date,
  endDate: Date,
): Promise<BakeryProductAnalytics[]> {
  const [orders, productsByName] = await Promise.all([
    loadReportableBakeryOrders(businessId, startDate, endDate),
    loadBusinessProducts(businessId),
  ]);

  if (orders.length === 0) return [];

  const orderIds = orders.map((order) => order.external_id);
  const items = await loadBakeryOrderItems(businessId, orderIds);
  const byProduct = new Map<string, BakeryProductAnalytics>();

  items.forEach((row) => {
    const item = parseBakeryItem(row.payload);
    if (!item || item.quantity <= 0) return;

    const matchedProduct =
      buildProductCandidates(item)
        .map((candidate) => productsByName.get(normalizeText(candidate)))
        .find(Boolean) ?? null;

    const key = matchedProduct
      ? `${matchedProduct.id}`
      : normalizeText(
          item.size ? `${item.productName} - ${item.size}` : item.productName,
        );
    const revenue = item.lineTotal;
    const cost = toNumber(matchedProduct?.cogs) * item.quantity;
    const existing = byProduct.get(key);

    if (existing) {
      existing.quantitySold += item.quantity;
      existing.revenue += revenue;
      existing.cost += cost;
      existing.profit = existing.revenue - existing.cost;
      existing.profitMargin =
        existing.revenue > 0 ? (existing.profit / existing.revenue) * 100 : 0;
      return;
    }

    byProduct.set(key, {
      productId: matchedProduct?.id ?? null,
      productName:
        matchedProduct?.name ??
        (item.size ? `${item.productName} - ${item.size}` : item.productName),
      quantitySold: item.quantity,
      revenue,
      cost,
      profit: revenue - cost,
      profitMargin: revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0,
      categoryId: matchedProduct?.category?.id ?? null,
      categoryName: matchedProduct?.category?.name ?? "Uncategorized",
    });
  });

  return Array.from(byProduct.values())
    .map((product) => ({
      ...product,
      profitMargin: Math.round(product.profitMargin * 100) / 100,
    }))
    .sort((left, right) => right.revenue - left.revenue);
}

export async function getBakeryCategoryAnalytics(
  businessId: number,
  startDate: Date,
  endDate: Date,
): Promise<{ categories: BakeryCategoryAnalytics[]; summary: { totalRevenue: number; totalProfit: number; totalQty: number } }> {
  const products = await getBakeryProductAnalytics(businessId, startDate, endDate);
  const byCategory = new Map<string, BakeryCategoryAnalytics>();

  products.forEach((product) => {
    const key = `${product.categoryId ?? "uncategorized"}::${product.categoryName}`;
    const existing = byCategory.get(key);
    if (existing) {
      existing.quantitySold += product.quantitySold;
      existing.revenue += product.revenue;
      existing.cost += product.cost;
      existing.profit = existing.revenue - existing.cost;
      existing.margin =
        existing.revenue > 0 ? (existing.profit / existing.revenue) * 100 : 0;
      return;
    }

    byCategory.set(key, {
      categoryId: product.categoryId,
      categoryName: product.categoryName,
      quantitySold: product.quantitySold,
      revenue: product.revenue,
      cost: product.cost,
      profit: product.profit,
      margin: product.revenue > 0 ? (product.profit / product.revenue) * 100 : 0,
      contribution: 0,
    });
  });

  const categories = Array.from(byCategory.values()).sort(
    (left, right) => right.revenue - left.revenue,
  );
  const totalRevenue = categories.reduce((sum, category) => sum + category.revenue, 0);
  const totalProfit = categories.reduce((sum, category) => sum + category.profit, 0);
  const totalQty = categories.reduce((sum, category) => sum + category.quantitySold, 0);

  return {
    categories: categories.map((category) => ({
      ...category,
      margin: Math.round(category.margin * 10) / 10,
      contribution:
        totalRevenue > 0
          ? Math.round((category.revenue / totalRevenue) * 1000) / 10
          : 0,
    })),
    summary: {
      totalRevenue,
      totalProfit,
      totalQty,
    },
  };
}

export async function getBakeryDailyAnalytics(
  businessId: number,
  startDate: Date,
  endDate: Date,
): Promise<{ data: BakeryDailyPoint[]; totals: { revenue: number; cost: number; profit: number } }> {
  const [orders, productsByName] = await Promise.all([
    loadReportableBakeryOrders(businessId, startDate, endDate),
    loadBusinessProducts(businessId),
  ]);

  const revenueByDate = new Map<string, number>();
  orders.forEach((order) => {
    const key = getAnalyticsDateKeyForOrder(order);
    revenueByDate.set(key, (revenueByDate.get(key) ?? 0) + toNumber(order.total_price));
  });

  const costByDate = new Map<string, number>();

  const orderIds = orders.map((order) => order.external_id);
  const items = await loadBakeryOrderItems(businessId, orderIds);
  const orderDateMap = new Map<string, string>();
  orders.forEach((order) => {
    orderDateMap.set(order.external_id, getAnalyticsDateKeyForOrder(order));
  });

  items.forEach((row) => {
    const item = parseBakeryItem(row.payload);
    if (!item || item.quantity <= 0) return;
    const dateKey = orderDateMap.get(row.order_external_id);
    if (!dateKey) return;

    const matched =
      buildProductCandidates(item)
        .map((candidate) => productsByName.get(normalizeText(candidate)))
        .find(Boolean) ?? null;

    const cost = toNumber(matched?.cogs) * item.quantity;
    costByDate.set(dateKey, (costByDate.get(dateKey) ?? 0) + cost);
  });

  const result: BakeryDailyPoint[] = [];
  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  let previousRevenue = 0;
  while (cursor <= end) {
    const key = toJakartaDateKey(cursor);
    const revenue = revenueByDate.get(key) ?? 0;
    const cost = costByDate.get(key) ?? 0;
    const profit = revenue - cost;
    const growthRate =
      previousRevenue > 0
        ? ((revenue - previousRevenue) / previousRevenue) * 100
        : revenue > 0
          ? 100
          : 0;

    result.push({
      date: key,
      revenue,
      cost,
      profit,
      margin: revenue > 0 ? (profit / revenue) * 100 : 0,
      growthRate,
    });

    previousRevenue = revenue;
    cursor.setDate(cursor.getDate() + 1);
  }

  const totals = result.reduce(
    (acc, point) => {
      acc.revenue += point.revenue;
      acc.cost += point.cost;
      acc.profit += point.profit;
      return acc;
    },
    { revenue: 0, cost: 0, profit: 0 },
  );

  return {
    data: result.map((point) => ({
      ...point,
      margin: Math.round(point.margin * 10) / 10,
      growthRate: Math.round(point.growthRate * 100) / 100,
    })),
    totals,
  };
}

export async function getBakeryGrowthAnalytics(
  businessId: number,
  year: number,
  month: number,
) {
  const currentStart = new Date(year, month - 1, 1);
  const currentEnd = new Date(year, month, 0, 23, 59, 59, 999);
  const prevStart = new Date(year, month - 2, 1);
  const prevEnd = new Date(year, month - 1, 0, 23, 59, 59, 999);

  const [current, previous] = await Promise.all([
    getBakeryDailyAnalytics(businessId, currentStart, currentEnd),
    getBakeryDailyAnalytics(businessId, prevStart, prevEnd),
  ]);

  const currentRevenue = current.totals.revenue;
  const prevRevenue = previous.totals.revenue;
  const currentProfit = current.totals.profit;
  const prevProfit = previous.totals.profit;

  const revenueGrowth =
    prevRevenue > 0 ? ((currentRevenue - prevRevenue) / prevRevenue) * 100 : currentRevenue > 0 ? 100 : 0;
  const profitGrowth =
    prevProfit > 0 ? ((currentProfit - prevProfit) / prevProfit) * 100 : currentProfit > 0 ? 100 : 0;

  return {
    currentRevenue,
    prevRevenue,
    revenueGrowth: Math.round(revenueGrowth * 100) / 100,
    currentProfit,
    prevProfit,
    profitGrowth: Math.round(profitGrowth * 100) / 100,
  };
}

export async function getBakeryHourlyAnalytics(businessId: number) {
  const now = new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const orders = await loadReportableBakeryOrders(businessId, since, now);
  const daily = await getBakeryDailyAnalytics(businessId, since, now);
  const totalCost = daily.totals.cost;
  const totalRevenue = daily.totals.revenue;

  const slots: Array<{ hour: string; revenue: number; profit: number; transactions: number }> = [];

  for (let i = 23; i >= 0; i -= 1) {
    const slotStart = new Date(now.getTime() - (i + 1) * 60 * 60 * 1000);
    const slotEnd = new Date(now.getTime() - i * 60 * 60 * 1000);
    const inSlot = orders.filter((order) => order.created_at >= slotStart && order.created_at < slotEnd);
    const revenue = inSlot.reduce((sum, order) => sum + toNumber(order.total_price), 0);
    const estimatedCost = totalRevenue > 0 ? (revenue / totalRevenue) * totalCost : 0;

    slots.push({
      hour: slotStart.toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
      revenue,
      profit: revenue - estimatedCost,
      transactions: inSlot.length,
    });
  }

  return {
    data: slots,
    totals: {
      revenue: slots.reduce((sum, slot) => sum + slot.revenue, 0),
      profit: slots.reduce((sum, slot) => sum + slot.profit, 0),
      transactions: slots.reduce((sum, slot) => sum + slot.transactions, 0),
    },
  };
}

export async function getBakeryWasteCostByDay(
  businessId: number,
  startDate: Date,
  endDate: Date,
): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<Array<{ date_key: string; total_waste_cost: unknown }>>`
    SELECT
      TO_CHAR((im."createdAt" AT TIME ZONE 'Asia/Jakarta')::date, 'YYYY-MM-DD') AS date_key,
      COALESCE(SUM(ABS(im.quantity) * im."costPerUnit"), 0)::numeric AS total_waste_cost
    FROM "InventoryMovement" im
    JOIN "StockDocument" sd ON sd.id = im."stockDocumentId"
    WHERE sd."businessId" = ${businessId}
      AND sd.type = 'Waste'
      AND im."createdAt" BETWEEN ${startDate} AND ${endDate}
    GROUP BY 1
    ORDER BY 1 ASC
  `;

  const result = new Map<string, number>();
  rows.forEach((row) => {
    result.set(row.date_key, toNumber(row.total_waste_cost));
  });
  return result;
}

function classifyHealthScore(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Healthy";
  if (score >= 40) return "Warning";
  return "Critical";
}

export async function getBakeryHealthSeries(
  businessId: number,
  days: number,
): Promise<BakeryHealthPoint[]> {
  const totalDays = Math.max(1, days);
  const now = new Date();
  const since = new Date(now);
  since.setDate(since.getDate() - (totalDays + 29));
  since.setHours(0, 0, 0, 0);

  const [daily, wasteByDay] = await Promise.all([
    getBakeryDailyAnalytics(businessId, since, now),
    getBakeryWasteCostByDay(businessId, since, now),
  ]);

  const points = daily.data;
  const series: BakeryHealthPoint[] = [];

  for (let i = Math.max(0, points.length - totalDays); i < points.length; i += 1) {
    const windowStart = Math.max(0, i - 29);
    const windowPoints = points.slice(windowStart, i + 1);

    const totalRevenue30d = windowPoints.reduce((sum, point) => sum + point.revenue, 0);
    const totalProfit30d = windowPoints.reduce((sum, point) => sum + point.profit, 0);
    const avgMargin = totalRevenue30d > 0 ? (totalProfit30d / totalRevenue30d) * 100 : 0;
    const avgDailyRevenue =
      windowPoints.length > 0 ? totalRevenue30d / windowPoints.length : 0;
    const revenueTarget = Math.max(avgDailyRevenue * 30 * 1.2, 100000);
    const revenueScore = Math.min(25, revenueTarget > 0 ? (totalRevenue30d / revenueTarget) * 25 : 0);

    const marginTarget = 50;
    const profitScore = Math.min(25, (avgMargin / marginTarget) * 25);

    const wasteCost30d = windowPoints.reduce(
      (sum, point) => sum + (wasteByDay.get(point.date) ?? 0),
      0,
    );
    const wastePercentage = totalRevenue30d > 0 ? (wasteCost30d / totalRevenue30d) * 100 : 0;
    const wasteScore = Math.max(0, 25 - wastePercentage * 5);

    let stabilityScore = 12.5;
    if (windowPoints.length >= 7) {
      const revenues = windowPoints.map((point) => point.revenue);
      const mean = revenues.reduce((sum, value) => sum + value, 0) / revenues.length;
      if (mean > 0) {
        const variance =
          revenues.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
          revenues.length;
        const coefficientOfVariation = Math.sqrt(variance) / mean;
        stabilityScore = Math.max(0, Math.min(25, 25 - coefficientOfVariation * 25));
      }
    }

    const overallScore = revenueScore + profitScore + wasteScore + stabilityScore;
    series.push({
      date: points[i].date,
      revenueScore,
      profitScore,
      wasteScore,
      stabilityScore,
      overallScore,
      classification: classifyHealthScore(overallScore),
    });
  }

  return series.map((point) => ({
    ...point,
    revenueScore: Math.round(point.revenueScore * 10) / 10,
    profitScore: Math.round(point.profitScore * 10) / 10,
    wasteScore: Math.round(point.wasteScore * 10) / 10,
    stabilityScore: Math.round(point.stabilityScore * 10) / 10,
    overallScore: Math.round(point.overallScore * 10) / 10,
  }));
}

export async function getBakeryForecastInputs(
  businessId: number,
  since: Date,
  until: Date,
): Promise<{
  revenueSeries: DailySalesEntry[];
  productSeries: BakeryForecastProductSeries[];
  productPriceMap: Map<number, { sellingPrice: number; cogs: number }>;
}> {
  const [orders, productsByName, products] = await Promise.all([
    loadReportableBakeryOrders(businessId, since, until),
    loadBusinessProducts(businessId),
    prisma.product.findMany({
      where: { businessId, deletedAt: null, isActive: true },
      select: { id: true, sellingPrice: true, cogs: true },
    }),
  ]);

  const productPriceMap = new Map<number, { sellingPrice: number; cogs: number }>();
  products.forEach((product) => {
    productPriceMap.set(product.id, {
      sellingPrice: toNumber(product.sellingPrice),
      cogs: toNumber(product.cogs),
    });
  });

  const revenueByDate = new Map<string, number>();
  const orderDateMap = new Map<string, string>();
  orders.forEach((order) => {
    const dateKey = getAnalyticsDateKeyForOrder(order);
    orderDateMap.set(order.external_id, dateKey);
    revenueByDate.set(dateKey, (revenueByDate.get(dateKey) ?? 0) + toNumber(order.total_price));
  });

  const orderIds = orders.map((order) => order.external_id);
  const items = await loadBakeryOrderItems(businessId, orderIds);
  const productSeriesMap = new Map<number, { entries: DailySalesEntry[]; historicalPrices: number[] }>();

  items.forEach((row) => {
    const item = parseBakeryItem(row.payload);
    if (!item || item.quantity <= 0) return;

    const matchedProduct =
      buildProductCandidates(item)
        .map((candidate) => productsByName.get(normalizeText(candidate)))
        .find(Boolean) ?? null;
    if (!matchedProduct) return;

    const dateKey = orderDateMap.get(row.order_external_id);
    if (!dateKey) return;

    const bucket =
      productSeriesMap.get(matchedProduct.id) ?? {
        entries: [],
        historicalPrices: [],
      };
    const existing = bucket.entries.find((entry) => entry.date === dateKey);
    if (existing) {
      existing.qty += item.quantity;
    } else {
      bucket.entries.push({ date: dateKey, qty: item.quantity });
    }

    const unitPrice =
      item.quantity > 0 ? item.lineTotal / item.quantity : item.basePrice + item.addOnTotal;
    bucket.historicalPrices.push(unitPrice);
    productSeriesMap.set(matchedProduct.id, bucket);
  });

  return {
    revenueSeries: Array.from(revenueByDate.entries())
      .map(([date, qty]) => ({ date, qty }))
      .sort((left, right) => left.date.localeCompare(right.date)),
    productSeries: Array.from(productSeriesMap.entries()).map(([productId, value]) => ({
      productId,
      entries: value.entries.sort((left, right) => left.date.localeCompare(right.date)),
      historicalPrices: value.historicalPrices,
    })),
    productPriceMap,
  };
}
