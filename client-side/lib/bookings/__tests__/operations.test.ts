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
  checkSlotAvailability,
  countConcurrentOrdersForSlot,
  DAILY_PRODUCTION_TOKEN_LIMIT,
  evaluateProductionTokenCapacity,
  SLOT_MAX_ORDERS_PER_HOUR,
  summarizeProductionTokensByItems,
} from "../operations";

describe("Booking operations — token helpers", () => {
  it("summarizeProductionTokensByItems should use the shared calculator for mixed items", () => {
    const total = summarizeProductionTokensByItems([
      { category: "Cake", quantity: 1 },
      { category: "Buket", subcategory: "Hand Bouquet", quantity: 1 },
      { category: "Cookies", tokenDifficulty: "simple", quantity: 3 },
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
          items: [{ category: "Cookies", tokenDifficulty: "simple", quantity: 3 }],
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

  it("should cap concurrent active orders in the same date and hour at 3 regardless of order type", () => {
    const orders = [
      {
        id: "cake-1",
        deliveryDate: "2026-06-10",
        deliverySlot: "10:00",
        orderStatus: "In Production",
        items: [{ category: "Cake", quantity: 1 }],
      },
      {
        id: "cookies-1",
        deliveryDate: "2026-06-10",
        deliverySlot: "10:00",
        orderStatus: "In Production",
        items: [{ category: "Cookies", quantity: 12, tokenDifficulty: "simple" }],
      },
      {
        id: "seasonal-1",
        deliveryDate: "2026-06-10",
        deliverySlot: "10:00",
        orderStatus: "Ready",
        items: [{ category: "Seasonal Event", productName: "Noel Box", quantity: 1 }],
      },
    ];

    expect(
      countConcurrentOrdersForSlot({
        orders,
        deliveryDate: "2026-06-10",
        deliverySlot: "10:00",
        targetItems: [{ category: "Cookies", quantity: 1 }],
      }),
    ).toBe(SLOT_MAX_ORDERS_PER_HOUR);

    expect(
      checkSlotAvailability("2026-06-10", "10:00", "SEASONAL", {
        orders,
      }),
    ).toBe("FULL");
  });
});
