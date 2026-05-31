import type { BakeryOrder } from "@/components/bakery/store";

export type CashFlowCustomerEntry = {
  customerName: string;
  customerPhone: string;
  amountToday: number;
  orderCount: number;
  transactionCount: number;
  paymentLabel: string;
  shortInfo: string;
  bookingCode: string;
};

export type CashFlowHistoryEntry = {
  dateKey: string;
  totalAmount: number;
  customerCount: number;
  transactionCount: number;
};

export function toJakartaDateKey(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value || "1970";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
}

export function buildCashFlowBreakdownForDate(
  orders: BakeryOrder[],
  dateKey: string,
): CashFlowCustomerEntry[] {
  const grouped = new Map<
    string,
    {
      customerName: string;
      customerPhone: string;
      amountToday: number;
      transactionCount: number;
      orderIds: Set<string>;
      bookingCodes: Set<string>;
      productLabels: string[];
      paymentTypes: Set<string>;
    }
  >();

  for (const order of orders) {
    const datedTransactions = (order.paymentTransactions ?? []).filter(
      (transaction) => toJakartaDateKey(transaction.timestamp) === dateKey,
    );

    if (datedTransactions.length === 0) continue;

    const customerName = (order.customerName || "").trim() || "Customer";
    const customerPhone = (order.customerPhone || "").trim();
    const key = `${customerName.toLowerCase()}||${customerPhone.toLowerCase()}`;
    const existing = grouped.get(key) ?? {
      customerName,
      customerPhone,
      amountToday: 0,
      transactionCount: 0,
      orderIds: new Set<string>(),
      bookingCodes: new Set<string>(),
      productLabels: [],
      paymentTypes: new Set<string>(),
    };

    for (const transaction of datedTransactions) {
      existing.amountToday += Number(transaction.amount || 0);
      existing.transactionCount += 1;
      existing.paymentTypes.add(transaction.type || "Payment");
    }

    existing.orderIds.add(order.id);
    if (order.bookingCode) {
      existing.bookingCodes.add(order.bookingCode);
    }

    const productLabel =
      order.items?.[0]?.productName?.trim() ||
      order.product?.trim() ||
      "Order custom";
    if (
      productLabel &&
      !existing.productLabels.some(
        (label) => label.toLowerCase() === productLabel.toLowerCase(),
      )
    ) {
      existing.productLabels.push(productLabel);
    }

    grouped.set(key, existing);
  }

  return Array.from(grouped.values())
    .map((entry) => ({
      customerName: entry.customerName,
      customerPhone: entry.customerPhone,
      amountToday: entry.amountToday,
      orderCount: entry.orderIds.size,
      transactionCount: entry.transactionCount,
      paymentLabel:
        entry.paymentTypes.size > 1
          ? "DP + pelunasan"
          : entry.paymentTypes.has("Final")
            ? "Pelunasan"
            : "DP",
      shortInfo: entry.productLabels.slice(0, 2).join(" - "),
      bookingCode:
        entry.bookingCodes.size === 1
          ? Array.from(entry.bookingCodes)[0] || ""
          : `${entry.bookingCodes.size} booking`,
    }))
    .sort((left, right) => right.amountToday - left.amountToday);
}

export function buildCashFlowHistory(
  orders: BakeryOrder[],
  options?: { limit?: number; monthKey?: string },
): {
  breakdownByDate: Map<string, CashFlowCustomerEntry[]>;
  history: CashFlowHistoryEntry[];
} {
  const breakdownByDate = new Map<string, CashFlowCustomerEntry[]>();
  const dateKeys = new Set<string>();

  orders.forEach((order) => {
    (order.paymentTransactions ?? []).forEach((transaction) => {
      const dateKey = toJakartaDateKey(transaction.timestamp);
      if (dateKey) {
        dateKeys.add(dateKey);
      }
    });
  });

  Array.from(dateKeys).forEach((dateKey) => {
    breakdownByDate.set(dateKey, buildCashFlowBreakdownForDate(orders, dateKey));
  });

  const limit = Math.max(1, options?.limit ?? 30);
  const monthKey = String(options?.monthKey || "").trim();
  const history = Array.from(breakdownByDate.entries())
    .map(([dateKey, entries]) => ({
      dateKey,
      totalAmount: entries.reduce((sum, entry) => sum + entry.amountToday, 0),
      customerCount: entries.length,
      transactionCount: entries.reduce(
        (sum, entry) => sum + entry.transactionCount,
        0,
      ),
    }))
    .filter((entry) =>
      monthKey ? entry.dateKey.startsWith(`${monthKey}-`) : true,
    )
    .filter((entry) => entry.totalAmount > 0)
    .sort((left, right) => right.dateKey.localeCompare(left.dateKey))
    .slice(0, limit);

  return {
    breakdownByDate,
    history,
  };
}
