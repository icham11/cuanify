/**
 * Booking operations — token capacity helper tests
 *
 * These tests keep the shared production-token calculator and the
 * capacity helper aligned with the backend booking flow.
 */

declare const describe: {
  (name: string, fn: () => void): void;
  skip: (name: string, fn: () => void) => void;
};
declare const it: (name: string, fn: () => void | Promise<void>) => void;
declare const expect: (value: unknown) => {
  toBe: (expected: unknown) => void;
  toEqual: (expected: unknown) => void;
};

import {
  DAILY_PRODUCTION_TOKEN_LIMIT,
  evaluateProductionTokenCapacity,
  summarizeProductionTokensByItems,
} from "../operations";

describe("Booking operations — token helpers", () => {
  it("summarizeProductionTokensByItems should use the shared calculator for mixed items", () => {
    const total = summarizeProductionTokensByItems([
      { category: "Cake", quantity: 1 },
      { category: "Buket", subcategory: "Hand Bouquet", quantity: 1 },
      { category: "Cookies", difficulty: "simple", quantity: 3 },
      { category: "Cupcakes", productName: "Dozen Box", quantity: 1 },
    ]);

    expect(total).toBe(147);
  });

  it("evaluateProductionTokenCapacity should ignore inactive orders and count only active ones", () => {
    const result = evaluateProductionTokenCapacity({
      orders: [
        {
          id: "done",
          deliveryDate: "2026-04-30",
          deliverySlot: "10:00",
          orderStatus: "Completed",
          items: [{ category: "Cake", quantity: 1 }],
        },
        {
          id: "active",
          deliveryDate: "2026-04-30",
          deliverySlot: "10:00",
          orderStatus: "In Production",
          items: [{ category: "Cookies", difficulty: "simple", quantity: 3 }],
        },
        {
          id: "cancelled",
          deliveryDate: "2026-04-30",
          deliverySlot: "10:00",
          orderStatus: "Cancelled",
          items: [{ category: "Buket", subcategory: "Hand Bouquet", quantity: 1 }],
        },
      ],
      deliveryDate: "2026-04-30",
      incomingItems: [{ category: "Cake", quantity: 1 }],
      carryOverDays: 0,
    });

    expect(result.usedToday).toBe(3);
    expect(result.incoming).toBe(100);
    expect(result.allowed).toBe(DAILY_PRODUCTION_TOKEN_LIMIT);
    expect(result.isOverflow).toBe(false);
    expect(result.planned).toBe(103);
  });
});
