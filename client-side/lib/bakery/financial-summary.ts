import { normalizeOrderStatus } from "@/lib/bookings/order-status";
import { resolveShippingParcelCount } from "@/lib/bookings/delivery-rules";
import { buildDashboardProductName } from "@/lib/products/dashboard-name";
import type { BakeryBusinessSettings } from "@/lib/bakery/settings";
import { calculateOrderFinancialBreakdown } from "@/lib/bookings/financial-breakdown";

const BUSINESS_TIME_ZONE = "Asia/Jakarta";

export type BakeryFinancialOrderItem = {
  category?: string;
  subcategory?: string;
  productName?: string;
  size?: string;
  quantity?: number;
  basePrice?: number;
  selectedPrice?: number;
  lineTotal?: number;
  addOnTotal?: number;
};

export type BakeryFinancialOrder = {
  id?: string;
  deliveryDate?: string;
  product?: string;
  basePrice?: number;
  addOnTotal?: number;
  totalPrice?: number;
  designAdjustmentTotal?: number;
  productAdjustment?: number;
  nonProductAdjustment?: number;
  productSubtotal?: number;
  productDiscountAmount?: number;
  serviceCharge?: number;
  deliveryFee?: number;
  insuranceFee?: number;
  manualAdjustment?: number;
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

type ProductCostEntry = {
  normalizedName: string;
  cogs: number;
};

export type BakeryTopProduct = {
  productName: string;
  quantitySold: number;
  revenue: number;
};

export type BakeryCogsBreakdown = {
  productName: string;
  quantity: number;
  cogsPerItem: number;
  totalCogs: number;
};

export type BakeryFinancialSummary = {
  filteredOrders: BakeryFinancialOrder[];
  totalOrders: number;
  paidOrdersCount: number;
  bookedRevenue: number;
  totalRevenue: number;
  totalCashFlowIn: number;
  cogsCost: number;
  cancelledRevenue: number;
  cancelledCogsCost: number;
  returnRefundAmount: number;
  totalOperationalCost: number;
  totalCost: number;
  grossProfit: number;
  netProfit: number;
  itemsWithMissingCogs: number;
  isCogsAccurate: boolean;
  topProducts: BakeryTopProduct[];
  cogsBreakdown: BakeryCogsBreakdown[];
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
    value instanceof Date
      ? value
      : typeof value === "string"
        ? new Date(value)
        : null;
  if (!date || Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getMonthKeysInRange(fromDate: string, toDate: string): string[] {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(fromDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(toDate)
  ) {
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
  if (
    Array.isArray(order.paymentTransactions) &&
    order.paymentTransactions.length > 0
  ) {
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

function buildProductCostMap(
  products: BakeryFinancialProduct[],
): Map<string, number> {
  const map = new Map<string, number>();
  products.forEach((product) => {
    const name = String(product.name || "").trim();
    if (!name) return;
    map.set(normalizeText(name), Math.max(0, Number(product.cogs || 0)));
  });
  return map;
}

function buildProductCostEntries(
  products: BakeryFinancialProduct[],
): ProductCostEntry[] {
  return products
    .map((product) => ({
      normalizedName: normalizeText(String(product.name || "").trim()),
      cogs: Math.max(0, Number(product.cogs || 0)),
    }))
    .filter((entry) => entry.normalizedName.length > 0 && entry.cogs > 0);
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

  const fallbackDateKey =
    String(order.deliveryDate || "").trim() ||
    toBusinessDateKey(order.createdAt) ||
    toBusinessDateKey(order.updatedAt);

  if (transactions.length > 0) {
    return transactions.reduce((sum, transaction) => {
      // Prefer transaction timestamp; if missing/invalid, fall back to
      // the order-level fallbackDateKey so undated transactions are
      // still considered when the order falls into the requested range.
      const dateKey =
        toBusinessDateKey(transaction?.timestamp ?? null) || fallbackDateKey;
      if (!isDateKeyWithinRange(dateKey, fromDate, toDate)) return sum;

      const amount = Number(transaction?.amount || 0);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);
  }

  if (!isDateKeyWithinRange(fallbackDateKey, fromDate, toDate)) {
    return 0;
  }

  return getCappedTotalPaid(order);
}

function getRevenueAmountInRange(
  order: BakeryFinancialOrder,
  fromDate: string,
  toDate: string,
): number {
  // Revenue is recognized from the sales value on delivery date,
  // independent from when or whether the cash has been paid in.
  const deliveryDateKey = String(order.deliveryDate || "").trim();

  if (
    !deliveryDateKey ||
    !isDateKeyWithinRange(deliveryDateKey, fromDate, toDate)
  ) {
    return 0;
  }

  const financialBreakdown = calculateOrderFinancialBreakdown({
    basePrice: order.basePrice,
    designAdjustmentTotal: order.designAdjustmentTotal,
    addOnTotal: order.addOnTotal,
    productAdjustment: order.productAdjustment,
    nonProductAdjustment: order.nonProductAdjustment,
    productSubtotal: order.productSubtotal,
    productDiscountAmount: order.productDiscountAmount,
    serviceCharge: order.serviceCharge,
    deliveryFee: order.deliveryFee,
    insuranceFee: order.insuranceFee,
    totalPrice: order.totalPrice,
    legacyManualAdjustment: order.manualAdjustment,
  });

  return financialBreakdown.productNetRevenue;
}

function getCashFlowInAmountInRange(
  order: BakeryFinancialOrder,
  fromDate: string,
  toDate: string,
): number {
  // Cashflow in this report follows when the booking is created.
  const bookingDateKey =
    toBusinessDateKey(order.createdAt) || toBusinessDateKey(order.updatedAt);

  if (bookingDateKey) {
    if (!isDateKeyWithinRange(bookingDateKey, fromDate, toDate)) {
      return 0;
    }

    return getCappedTotalPaid(order);
  }

  // Legacy fallback for records that do not carry booking timestamps yet.
  return getPaymentAmountInRange(order, fromDate, toDate);
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
    candidates.add(`${productName} - Seasonal`);
    candidates.add(`${productName} - Seasonal Event`);
  }

  if (orderProduct) {
    candidates.add(orderProduct);
  }

  if (size) {
    candidates.add(size);
    candidates.add(
      size
        .replace(/\(([^)]+)\)/g, " - $1")
        .replace(/\s+/g, " ")
        .trim(),
    );
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

function resolveMatchedCogs(args: {
  item: BakeryFinancialOrderItem;
  orderProductName?: string;
  productCostMap: Map<string, number>;
  productCostEntries: ProductCostEntry[];
}): number {
  const normalizedCandidates = Array.from(
    new Set(
      buildProductNameCandidates(args.item, args.orderProductName)
        .map((candidate) => normalizeText(candidate))
        .filter((candidate) => candidate.length > 0),
    ),
  );

  for (const candidate of normalizedCandidates) {
    const exactMatch = args.productCostMap.get(candidate) ?? 0;
    if (exactMatch > 0) {
      return exactMatch;
    }
  }

  const scoredMatches = args.productCostEntries
    .map((entry) => {
      let bestScore = -1;

      normalizedCandidates.forEach((candidate) => {
        if (candidate.length < 8) return;
        if (
          !entry.normalizedName.includes(candidate) &&
          !candidate.includes(entry.normalizedName)
        ) {
          return;
        }

        const score =
          1000 - Math.abs(entry.normalizedName.length - candidate.length);
        if (score > bestScore) {
          bestScore = score;
        }
      });

      return bestScore >= 0 ? { ...entry, score: bestScore } : null;
    })
    .filter((entry): entry is ProductCostEntry & { score: number } =>
      Boolean(entry),
    )
    .sort((left, right) => right.score - left.score);

  if (scoredMatches.length === 0) {
    return 0;
  }

  if (
    scoredMatches.length > 1 &&
    scoredMatches[0].score === scoredMatches[1].score &&
    scoredMatches[0].normalizedName !== scoredMatches[1].normalizedName
  ) {
    return 0;
  }

  return scoredMatches[0].cogs;
}

function resolveFinancialItemQuantity(item: BakeryFinancialOrderItem): number {
  return Math.max(
    1,
    resolveShippingParcelCount({
      category: item.category,
      subcategory: item.subcategory,
      productName: item.productName,
      size: item.size,
      quantity: item.quantity,
    }),
  );
}

export function filterBakeryOrdersByDateRange(
  orders: BakeryFinancialOrder[],
  fromDate: string,
  toDate: string,
): BakeryFinancialOrder[] {
  return orders.filter((order) => {
    // Include orders that have either recognized revenue or incoming cash in range.
    const hasRevenue = getRevenueAmountInRange(order, fromDate, toDate) > 0;
    const hasCashFlow = getCashFlowInAmountInRange(order, fromDate, toDate) > 0;
    
    return hasRevenue || hasCashFlow;
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
  const adsCost = expenseRows
    .filter((entry) => entry.category === "ads")
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const customExpenseTotal = expenseRows
    .filter((entry) => entry.category === "custom")
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const totalOperationalCost =
    staffCost + adsCost + customExpenseTotal;

  return {
    months,
    staffPayrollRows,
    expenseRows,
    staffCost,
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
  const productCostEntries = buildProductCostEntries(args.products);
  const bookedRevenue = filteredOrders.reduce(
    (sum, order) => {
      const netRevenue = calculateOrderFinancialBreakdown({
        basePrice: order.basePrice,
        designAdjustmentTotal: order.designAdjustmentTotal,
        addOnTotal: order.addOnTotal,
        productAdjustment: order.productAdjustment,
        nonProductAdjustment: order.nonProductAdjustment,
        productSubtotal: order.productSubtotal,
        productDiscountAmount: order.productDiscountAmount,
        serviceCharge: order.serviceCharge,
        deliveryFee: order.deliveryFee,
        insuranceFee: order.insuranceFee,
        totalPrice: order.totalPrice,
        legacyManualAdjustment: order.manualAdjustment,
      }).productNetRevenue;
      return sum + netRevenue * (isCancelledOrder(order) ? -1 : 1);
    },
    0,
  );
  let totalRevenue = 0;
  let totalCashFlowIn = 0;
  let cogsCost = 0;
  let cancelledRevenue = 0;
  let cancelledCogsCost = 0;
  let itemsWithMissingCogs = 0;
  let paidOrdersCount = 0;
  const topProductsMap = new Map<
    string,
    { productName: string; quantitySold: number; revenue: number }
  >();
  const cogsBreakdownMap = new Map<
    string,
    { productName: string; quantity: number; cogsPerItem: number; totalCogs: number }
  >();

  filteredOrders.forEach((order) => {
    const orderIsCancelled = isCancelledOrder(order);

    // Calculate revenue based on delivery date
    const revenueAmountInRange = getRevenueAmountInRange(
      order,
      args.fromDate,
      args.toDate,
    );
    
    // Calculate cashflow based on booking created date
    const cashFlowInAmountInRange = getCashFlowInAmountInRange(
      order,
      args.fromDate,
      args.toDate,
    );

    if (revenueAmountInRange === 0 && cashFlowInAmountInRange === 0) return;

    if (cashFlowInAmountInRange > 0) {
      paidOrdersCount += 1;
    }

    if (orderIsCancelled) {
      totalRevenue -= revenueAmountInRange;
      cancelledRevenue += revenueAmountInRange;
    } else {
      totalRevenue += revenueAmountInRange;
    }
    totalCashFlowIn += cashFlowInAmountInRange;

    // recognitionRatio represents portion of the order that should be
    // recognised as revenue in the requested range based on delivery date.
    // Use 0..1 to avoid negative recognition which caused inconsistent signs
    // between revenue/COGS and quantity.
    const recognitionRatio = revenueAmountInRange > 0 ? 1 : 0;
    const orderProductNetRevenue = calculateOrderFinancialBreakdown({
      basePrice: order.basePrice,
      designAdjustmentTotal: order.designAdjustmentTotal,
      addOnTotal: order.addOnTotal,
      productAdjustment: order.productAdjustment,
      nonProductAdjustment: order.nonProductAdjustment,
      productSubtotal: order.productSubtotal,
      productDiscountAmount: order.productDiscountAmount,
      serviceCharge: order.serviceCharge,
      deliveryFee: order.deliveryFee,
      insuranceFee: order.insuranceFee,
      totalPrice: order.totalPrice,
      legacyManualAdjustment: order.manualAdjustment,
    }).productNetRevenue;
    const itemGrossRevenueEntries = (order.items || []).map((item) => {
      const baseRevenue =
        Number(
          item.lineTotal ||
            item.selectedPrice ||
            Number(item.basePrice || 0) * resolveFinancialItemQuantity(item) ||
            0,
        ) || 0;
      const addOnRevenue = Number(item.addOnTotal || 0);
      return Math.max(0, baseRevenue + addOnRevenue);
    });
    const orderItemGrossRevenueTotal = itemGrossRevenueEntries.reduce(
      (sum, value) => sum + value,
      0,
    );

    (order.items || []).forEach((item, itemIndex) => {
      const quantity = resolveFinancialItemQuantity(item);
      const matchedCogs = resolveMatchedCogs({
        item,
        orderProductName: order.product,
        productCostMap,
        productCostEntries,
      });

      const productName =
        String(item.productName || "").trim() ||
        String(order.product || "").trim() ||
        "Produk";

      if (matchedCogs > 0) {
        const itemCogs = matchedCogs * quantity * recognitionRatio;
        if (orderIsCancelled) {
          cancelledCogsCost += itemCogs;
        } else {
          cogsCost += itemCogs;
          const breakdownKey = `${productName}-${matchedCogs}`;
          const currentBreakdown = cogsBreakdownMap.get(breakdownKey) ?? {
            productName,
            quantity: 0,
            cogsPerItem: matchedCogs,
            totalCogs: 0,
          };
          currentBreakdown.quantity += quantity * Math.max(0, recognitionRatio);
          currentBreakdown.totalCogs += itemCogs;
          cogsBreakdownMap.set(breakdownKey, currentBreakdown);
        }
      } else {
        itemsWithMissingCogs += 1;
      }

      if (orderIsCancelled) {
        return;
      }

      const grossItemRevenue = itemGrossRevenueEntries[itemIndex] ?? 0;
      const revenueShare =
        orderItemGrossRevenueTotal > 0
          ? grossItemRevenue / orderItemGrossRevenueTotal
          : (order.items?.length ?? 0) > 0
            ? 1 / (order.items?.length ?? 1)
            : 0;
      const revenue = orderProductNetRevenue * revenueShare;
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
  const returnRefundAmount = cancelledCogsCost;
  const totalCost =
    cogsCost + operational.totalOperationalCost - returnRefundAmount;
  const grossProfit = totalRevenue - cogsCost + returnRefundAmount;
  const netProfit = totalRevenue - totalCost;

  return {
    filteredOrders,
    totalOrders: filteredOrders.length,
    paidOrdersCount,
    bookedRevenue,
    totalRevenue,
    totalCashFlowIn,
    cogsCost,
    cancelledRevenue,
    cancelledCogsCost,
    returnRefundAmount,
    totalOperationalCost: operational.totalOperationalCost,
    totalCost,
    grossProfit,
    netProfit,
    itemsWithMissingCogs,
    isCogsAccurate: itemsWithMissingCogs === 0,
    topProducts: Array.from(topProductsMap.values()).sort(
      (left, right) => right.revenue - left.revenue,
    ),
    cogsBreakdown: Array.from(cogsBreakdownMap.values()).sort(
      (left, right) => right.totalCogs - left.totalCogs,
    ),
  };
}

export function getMonthKeyFromDateValue(dateValue: string): string {
  return toMonthKey(dateValue);
}
