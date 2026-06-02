import { describe, expect, it } from "vitest";
import type { BakeryOrder } from "@/components/bakery/store";
import {
  buildCashFlowBreakdownForDate,
  buildCashFlowHistory,
  toJakartaDateKey,
} from "../dashboard-cashflow";

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

describe("dashboard cashflow helpers", () => {
  it("groups same-day transactions by customer and combines payment labels", () => {
    const orders: BakeryOrder[] = [
      createOrder({
        id: "order-1",
        bookingCode: "BK-001",
        customerName: "Maya",
        customerPhone: "08123",
        product: "Cake",
        items: [{ id: "item-1", category: "", subcategory: "", productName: "Chocolate Cake", size: "", quantity: 1, basePrice: 0, addOns: [], addOnTotal: 0 }],
        paymentTransactions: [
          { id: "tx-1", timestamp: "2026-05-16T01:00:00.000Z", amount: 100000, type: "DP" },
          { id: "tx-2", timestamp: "2026-05-16T03:00:00.000Z", amount: 50000, type: "Final" },
        ],
      }),
      createOrder({
        id: "order-2",
        bookingCode: "BK-002",
        customerName: "Maya",
        customerPhone: "08123",
        product: "Cookies",
        items: [{ id: "item-2", category: "", subcategory: "", productName: "Cookies", size: "", quantity: 1, basePrice: 0, addOns: [], addOnTotal: 0 }],
        paymentTransactions: [
          { id: "tx-3", timestamp: "2026-05-16T04:00:00.000Z", amount: 25000, type: "DP" },
        ],
      }),
    ];

    const breakdown = buildCashFlowBreakdownForDate(orders, "2026-05-16");

    expect(breakdown).toHaveLength(1);
    expect(breakdown[0]).toMatchObject({
      customerName: "Maya",
      amountToday: 175000,
      orderCount: 2,
      transactionCount: 3,
      paymentLabel: "DP + pelunasan",
      bookingCode: "2 booking",
    });
    expect(breakdown[0]?.shortInfo).toContain("Chocolate Cake");
  });

  it("builds history sorted by newest date and keeps previous days", () => {
    const orders: BakeryOrder[] = [
      createOrder({
        id: "order-1",
        bookingCode: "BK-001",
        customerName: "Maya",
        customerPhone: "08123",
        product: "Cake",
        paymentTransactions: [
          { id: "tx-1", timestamp: "2026-05-16T02:00:00.000Z", amount: 100000, type: "DP" },
          { id: "tx-2", timestamp: "2026-05-15T02:00:00.000Z", amount: 50000, type: "Final" },
        ],
      }),
      createOrder({
        id: "order-2",
        bookingCode: "BK-002",
        customerName: "Nina",
        customerPhone: "08124",
        product: "Cookies",
        paymentTransactions: [
          { id: "tx-3", timestamp: "2026-05-14T02:00:00.000Z", amount: 25000, type: "DP" },
        ],
      }),
    ];

    const result = buildCashFlowHistory(orders);

    expect(result.history.map((entry) => entry.dateKey)).toEqual([
      "2026-05-16",
      "2026-05-15",
      "2026-05-14",
    ]);
    expect(result.history[0]).toMatchObject({
      totalAmount: 100000,
      customerCount: 1,
      transactionCount: 1,
    });
    expect(result.breakdownByDate.get("2026-05-15")?.[0]?.customerName).toBe(
      "Maya",
    );
  });

  it("filters history to the requested month only", () => {
    const orders: BakeryOrder[] = [
      createOrder({
        id: "order-1",
        bookingCode: "BK-001",
        customerName: "Maya",
        customerPhone: "08123",
        paymentTransactions: [
          { id: "tx-1", timestamp: "2026-05-16T02:00:00.000Z", amount: 100000, type: "DP" },
          { id: "tx-2", timestamp: "2026-04-15T02:00:00.000Z", amount: 50000, type: "Final" },
        ],
      }),
    ];

    const result = buildCashFlowHistory(orders, { monthKey: "2026-05" });

    expect(result.history.map((entry) => entry.dateKey)).toEqual([
      "2026-05-16",
    ]);
    expect(result.breakdownByDate.get("2026-04-15")).toBeDefined();
  });

  it("converts timestamps into Jakarta date keys", () => {
    expect(toJakartaDateKey("2026-05-15T18:30:00.000Z")).toBe("2026-05-16");
    expect(toJakartaDateKey("")).toBe("");
  });

  it("falls back to booking timestamp and paid amount when transaction logs are missing", () => {
    const orders: BakeryOrder[] = [
      createOrder({
        id: "legacy-1",
        bookingCode: "BK-LEGACY",
        customerName: "Lina",
        customerPhone: "08199",
        createdAt: "2026-05-16T02:00:00.000Z",
        totalPrice: 120000,
        totalPaidAmount: 120000,
        paymentStatus: "Paid",
        product: "Brownies",
      }),
    ];

    const breakdown = buildCashFlowBreakdownForDate(orders, "2026-05-16");
    const history = buildCashFlowHistory(orders, { monthKey: "2026-05" });

    expect(breakdown).toHaveLength(1);
    expect(breakdown[0]).toMatchObject({
      customerName: "Lina",
      amountToday: 120000,
      orderCount: 1,
      transactionCount: 1,
      paymentLabel: "Pelunasan",
      bookingCode: "BK-LEGACY",
    });
    expect(history.history[0]).toMatchObject({
      dateKey: "2026-05-16",
      totalAmount: 120000,
      customerCount: 1,
      transactionCount: 1,
    });
  });
});
