import { normalizeOrderStatus } from "@/lib/bookings/order-status";
import { buildDashboardProductName } from "@/lib/products/dashboard-name";
import type { BakeryBusinessSettings } from "@/lib/bakery/settings";

const BUSINESS_TIME_ZONE = "Asia/Jakarta";

export type BakeryFinancialOrderItem = {
  productName?: string;
  size?: string;
  quantity?: number;
  basePrice?: number;
  selectedPrice?: number;
  lineTotal?: number;
};

export type BakeryFinancialOrder = {
  deliveryDate?: string;
  product?: string;
  totalPrice?: number;
  totalPaidAmount?: number;
  dpPaidAmount?: number;
  finalPaidAmount?: number;
  paymentStatus?: string;
  orderStatus?: string;
  paymentTransactions?: Array<{
    timestamp?: string | Date | null;
    amount?: number;
    type?: string;
    note?: string;
  }>;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
  items?: BakeryFinancialOrderItem[];
};

export type BakeryFinancialProduct = {
  name: string;
  cogs?: number;
};

export type BakeryTopProduct = {
  productName: string;
  quantitySold: number;
  revenue: number;
};

export type BakeryFinancialSummary = {
  filteredOrders: BakeryFinancialOrder[];
  totalOrders: number;
  paidOrdersCount: number;
  bookedRevenue: number;
  totalRevenue: number;
  totalCashFlowIn: number;
  cogsCost: number;
  totalOperationalCost: number;
  totalCost: number;
  grossProfit: number;
  netProfit: number;
  itemsWithMissingCogs: number;
  isCogsAccurate: boolean;
  topProducts: BakeryTopProduct[];
};

function normalizeText(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toMonthKey(dateValue: string): string {
  return String(dateValue || "").slice(0, 7);
}

function toBusinessDateKey(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date =
    value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getMonthKeysInRange(fromDate: string, toDate: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    return [];
  }

  const [fromYear, fromMonth] = fromDate.split("-").map(Number);
  const [toYear, toMonth] = toDate.split("-").map(Number);

  if (!fromYear || !fromMonth || !toYear || !toMonth) return [];

  const months: string[] = [];
  let cursor = new Date(fromYear, fromMonth - 1, 1);
  const end = new Date(toYear, toMonth - 1, 1);

  while (cursor <= end) {
    months.push(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
    );
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  return months;
}

function getPaymentIn(order: BakeryFinancialOrder): number {
  if (Array.isArray(order.paymentTransactions) && order.paymentTransactions.length > 0) {
    return order.paymentTransactions.reduce((sum, transaction) => {
      const amount = Number(transaction?.amount || 0);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);
  }

  const totalPaid = Number(order.totalPaidAmount ?? 0);
  if (totalPaid > 0) return totalPaid;
  return Number(order.dpPaidAmount ?? 0) + Number(order.finalPaidAmount ?? 0);
}

function getCappedTotalPaid(order: BakeryFinancialOrder): number {
  const totalPrice = Math.max(0, Number(order.totalPrice || 0));
  const totalPaid = Math.max(0, getPaymentIn(order));
  if (totalPrice <= 0) return totalPaid;
  return Math.min(totalPrice, totalPaid);
}

function isCancelledOrder(order: BakeryFinancialOrder): boolean {
  return normalizeOrderStatus(order.orderStatus) === "Cancelled";
}

function isOrderPaid(order: BakeryFinancialOrder): boolean {
  const paymentStatus = String(order.paymentStatus || "").trim().toLowerCase();
  return paymentStatus === "paid" || paymentStatus === "dp paid" || getPaymentIn(order) > 0;
}

function buildProductCostMap(products: BakeryFinancialProduct[]): Map<string, number> {
  const map = new Map<string, number>();
  products.forEach((product) => {
    const name = String(product.name || "").trim();
    if (!name) return;
    map.set(normalizeText(name), Math.max(0, Number(product.cogs || 0)));
  });
  return map;
}

function isDateKeyWithinRange(
  dateKey: string,
  fromDate: string,
  toDate: string,
) {
  if (!dateKey) return false;
  if (fromDate && dateKey < fromDate) return false;
  if (toDate && dateKey > toDate) return false;
  return true;
}

function getPaymentAmountInRange(
  order: BakeryFinancialOrder,
  fromDate: string,
  toDate: string,
): number {
  const transactions = Array.isArray(order.paymentTransactions)
    ? order.paymentTransactions
    : [];

  if (transactions.length > 0) {
    return transactions.reduce((sum, transaction) => {
      const dateKey = toBusinessDateKey(transaction?.timestamp ?? null);
      if (!isDateKeyWithinRange(dateKey, fromDate, toDate)) return sum;

      const amount = Number(transaction?.amount || 0);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);
  }

  const fallbackDateKey =
    String(order.deliveryDate || "").trim() ||
    toBusinessDateKey(order.createdAt) ||
    toBusinessDateKey(order.updatedAt);

  if (!isDateKeyWithinRange(fallbackDateKey, fromDate, toDate)) {
    return 0;
  }

  return getCappedTotalPaid(order);
}

function buildProductNameCandidates(
  item: BakeryFinancialOrderItem,
  orderProductName?: string,
): string[] {
  const productName = String(item.productName || "").trim();
  const orderProduct = String(orderProductName || "").trim();
  const size = String(item.size || "").trim();
  const candidates = new Set<string>();

  if (productName) {
    candidates.add(productName);
  }

  if (orderProduct) {
    candidates.add(orderProduct);
  }

  const baseNames = [productName, orderProduct].filter(Boolean);
  baseNames.forEach((baseName) => {
    if (!size) return;
    candidates.add(`${baseName} - ${size}`);
    candidates.add(`${baseName}-${size}`);
    candidates.add(
      buildDashboardProductName({
        productName: baseName,
        variantLabel: size,
        variantCount: 999,
      }),
    );
  });

  return Array.from(candidates);
}

export function filterBakeryOrdersByDateRange(
  orders: BakeryFinancialOrder[],
  fromDate: string,
  toDate: string,
): BakeryFinancialOrder[] {
  return orders.filter((order) => {
    const deliveryDate = String(order.deliveryDate || "");
    if (!deliveryDate) return false;
    if (fromDate && deliveryDate < fromDate) return false;
    if (toDate && deliveryDate > toDate) return false;
    if (isCancelledOrder(order)) return false;
    return true;
  });
}

export function calculateOperationalCostForDateRange(args: {
  settings: BakeryBusinessSettings | null;
  fromDate: string;
  toDate: string;
}) {
  const months = getMonthKeysInRange(args.fromDate, args.toDate);
  const monthSet = new Set(months);
  const settings = args.settings;
  const staffPayrollRows = (settings?.staffSettings ?? []).filter(
    (entry) => entry.isActive,
  );
  const staffCostPerMonth = staffPayrollRows.reduce(
    (sum, entry) => sum + Number(entry.takeHomePay || 0),
    0,
  );
  const staffCost = staffCostPerMonth * months.length;
  const expenseRows = (settings?.monthlyExpenses ?? []).filter((entry) =>
    monthSet.has(entry.monthKey),
  );
  const refundCost = expenseRows
    .filter((entry) => entry.category === "refund")
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const adsCost = expenseRows
    .filter((entry) => entry.category === "ads")
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const customExpenseTotal = expenseRows
    .filter((entry) => entry.category === "custom")
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const totalOperationalCost =
    staffCost + refundCost + adsCost + customExpenseTotal;

  return {
    months,
    staffPayrollRows,
    expenseRows,
    staffCost,
    refundCost,
    adsCost,
    customExpenseTotal,
    totalOperationalCost,
  };
}

export function calculateBakeryFinancialSummary(args: {
  orders: BakeryFinancialOrder[];
  products: BakeryFinancialProduct[];
  settings?: BakeryBusinessSettings | null;
  fromDate: string;
  toDate: string;
}): BakeryFinancialSummary {
  const filteredOrders = filterBakeryOrdersByDateRange(
    args.orders,
    args.fromDate,
    args.toDate,
  );
  const productCostMap = buildProductCostMap(args.products);
  const bookedRevenue = filteredOrders.reduce(
    (sum, order) => sum + Math.max(0, Number(order.totalPrice || 0)),
    0,
  );
  let totalRevenue = 0;
  let totalCashFlowIn = 0;
  let cogsCost = 0;
  let itemsWithMissingCogs = 0;
  let paidOrdersCount = 0;
  const topProductsMap = new Map<
    string,
    { productName: string; quantitySold: number; revenue: number }
  >();

  args.orders.forEach((order) => {
    if (isCancelledOrder(order)) return;

    const totalPrice = Math.max(0, Number(order.totalPrice || 0));
    const paymentAmountInRange = getPaymentAmountInRange(
      order,
      args.fromDate,
      args.toDate,
    );
    if (paymentAmountInRange === 0) return;

    if (paymentAmountInRange > 0) {
      paidOrdersCount += 1;
    }

    totalRevenue += paymentAmountInRange;
    totalCashFlowIn += paymentAmountInRange;

    const recognitionRatio =
      totalPrice > 0
        ? Math.max(-1, Math.min(1, paymentAmountInRange / totalPrice))
        : 0;

    (order.items || []).forEach((item) => {
      const quantity = Math.max(1, Number(item.quantity || 1));
      const matchedCogs =
        buildProductNameCandidates(item, order.product)
          .map((candidate) => productCostMap.get(normalizeText(candidate)) ?? 0)
          .find((value) => value > 0) ?? 0;

      if (matchedCogs > 0) {
        cogsCost += matchedCogs * quantity * recognitionRatio;
      } else {
        itemsWithMissingCogs += 1;
      }

      const productName =
        String(item.productName || "").trim() ||
        String(order.product || "").trim() ||
        "Produk";
      const revenue =
        Number(
          item.lineTotal ||
            item.selectedPrice ||
            Number(item.basePrice || 0) * quantity ||
            0,
        ) || 0;
      const current = topProductsMap.get(productName) ?? {
        productName,
        quantitySold: 0,
        revenue: 0,
      };
      current.quantitySold += quantity * Math.max(0, recognitionRatio);
      current.revenue += revenue * recognitionRatio;
      topProductsMap.set(productName, current);
    });
  });

  const operational = calculateOperationalCostForDateRange({
    settings: args.settings ?? null,
    fromDate: args.fromDate,
    toDate: args.toDate,
  });
  const totalCost = cogsCost + operational.totalOperationalCost;
  const grossProfit = totalRevenue - cogsCost;
  const netProfit = totalRevenue - totalCost;

  return {
    filteredOrders,
    totalOrders: filteredOrders.length,
    paidOrdersCount,
    bookedRevenue,
    totalRevenue,
    totalCashFlowIn,
    cogsCost,
    totalOperationalCost: operational.totalOperationalCost,
    totalCost,
    grossProfit,
    netProfit,
    itemsWithMissingCogs,
    isCogsAccurate: itemsWithMissingCogs === 0,
    topProducts: Array.from(topProductsMap.values()).sort(
      (left, right) => right.revenue - left.revenue,
    ),
  };
}

export function getMonthKeyFromDateValue(dateValue: string): string {
  return toMonthKey(dateValue);
}
