import { describe, expect, it } from "vitest";
import type { BakeryOrder } from "@/components/bakery/store";
import {
  getLegacyBackfillCutoffDateKey,
  isLegacyBackfillOrder,
} from "../legacy-backfill";
import {
  buildCashFlowBreakdownForDate,
  buildCashFlowHistory,
} from "@/lib/bakery/dashboard-cashflow";
import {
  calculateBakeryFinancialSummary,
  type BakeryFinancialOrder,
} from "@/lib/bakery/financial-summary";

describe("legacy backfill order detection", () => {
  it("computes the cutoff one calendar month before the input date", () => {
    expect(getLegacyBackfillCutoffDateKey("2026-10-05")).toBe("2026-09-05");
    expect(getLegacyBackfillCutoffDateKey("2026-01-15")).toBe("2025-12-15");
    expect(getLegacyBackfillCutoffDateKey("2026-03-31")).toBe("2026-02-28");
  });

  it("flags orders delivered more than one month before input", () => {
    expect(isLegacyBackfillOrder("2026-09-04", "2026-10-05")).toBe(true);
    expect(isLegacyBackfillOrder("2026-06-01", "2026-10-05")).toBe(true);
  });

  it("does not flag recent past, today, or future orders", () => {
    expect(isLegacyBackfillOrder("2026-09-05", "2026-10-05")).toBe(false);
    expect(isLegacyBackfillOrder("2026-09-30", "2026-10-05")).toBe(false);
    expect(isLegacyBackfillOrder("2026-10-05", "2026-10-05")).toBe(false);
    expect(isLegacyBackfillOrder("2026-10-12", "2026-10-05")).toBe(false);
  });

  it("uses the Jakarta date of the createdAt timestamp", () => {
    // 2026-10-04T18:00Z = 5 Okt 01:00 WIB → cutoff 5 Sep
    expect(
      isLegacyBackfillOrder("2026-09-04", "2026-10-04T18:00:00.000Z"),
    ).toBe(true);
    expect(isLegacyBackfillOrder(new Date("2026-09-04T00:00:00Z"), new Date("2026-10-04T18:00:00Z"))).toBe(true);
  });

  it("treats orders without dates as regular orders", () => {
    expect(isLegacyBackfillOrder("", "2026-10-05")).toBe(false);
    expect(isLegacyBackfillOrder("2026-06-01", null)).toBe(false);
  });
});

function createOrder(overrides: Partial<BakeryOrder>): BakeryOrder {
  return {
    id: overrides.id || "order-1",
    resi: "",
    bookingCode: "",
    customerName: "",
    customerPhone: "",
    deliveryDate: "",
    deliverySlot: "",
    items: [],
    deliveryAddresses: [],
    product: "",
    totalPrice: 0,
    paymentStatus: "Pending",
    orderStatus: "In Production",
    statusHistory: [],
    ...overrides,
  };
}

describe("legacy backfill orders are excluded from dashboard cashflow", () => {
  const regularOrder = createOrder({
    id: "regular",
    customerName: "Maya",
    deliveryDate: "2026-10-12",
    createdAt: "2026-10-05T03:00:00.000Z",
    totalPrice: 100000,
    paymentTransactions: [
      { id: "tx-1", timestamp: "2026-10-05T03:00:00.000Z", amount: 100000, type: "Final" },
    ],
  });
  const legacyOrder = createOrder({
    id: "legacy",
    customerName: "Budi",
    deliveryDate: "2026-07-01",
    createdAt: "2026-10-05T03:00:00.000Z",
    orderStatus: "Completed",
    totalPrice: 250000,
    paymentTransactions: [
      { id: "tx-2", timestamp: "2026-10-05T03:00:00.000Z", amount: 250000, type: "Final" },
    ],
  });

  it("skips legacy orders in the daily breakdown", () => {
    const breakdown = buildCashFlowBreakdownForDate(
      [regularOrder, legacyOrder],
      "2026-10-05",
    );
    expect(breakdown).toHaveLength(1);
    expect(breakdown[0]?.customerName).toBe("Maya");
    expect(breakdown[0]?.amountToday).toBe(100000);
  });

  it("skips legacy orders in the cashflow history", () => {
    const { history } = buildCashFlowHistory([regularOrder, legacyOrder]);
    expect(history).toEqual([
      expect.objectContaining({ dateKey: "2026-10-05", totalAmount: 100000 }),
    ]);
  });
});

describe("legacy backfill orders in the financial report", () => {
  const legacyOrder: BakeryFinancialOrder = {
    deliveryDate: "2026-07-01",
    totalPrice: 100000,
    totalPaidAmount: 100000,
    paymentStatus: "Paid",
    orderStatus: "Completed",
    createdAt: new Date("2026-10-05T03:00:00.000Z"),
    items: [
      { productName: "Kue Coklat", quantity: 1, basePrice: 100000, lineTotal: 100000 },
    ],
  };

  it("does not count legacy orders as cashflow in the input month", () => {
    const result = calculateBakeryFinancialSummary({
      orders: [legacyOrder],
      products: [{ name: "Kue Coklat", cogs: 5000 }],
      fromDate: "2026-10-01",
      toDate: "2026-10-31",
    });
    expect(result.totalCashFlowIn).toBe(0);
  });

  it("still recognizes revenue in the original delivery month", () => {
    const result = calculateBakeryFinancialSummary({
      orders: [legacyOrder],
      products: [{ name: "Kue Coklat", cogs: 5000 }],
      fromDate: "2026-07-01",
      toDate: "2026-07-31",
    });
    expect(result.totalCashFlowIn).toBe(0);
    expect(result.totalRevenue).toBeGreaterThan(0);
  });
});
