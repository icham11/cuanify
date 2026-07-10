import { describe, expect, it } from "vitest";
import { mergeCalendarOrdersForDisplay } from "../calendar-orders";

describe("mergeCalendarOrdersForDisplay", () => {
  it("keeps local orders in the visible calendar range when server rows are empty", () => {
    const orders = mergeCalendarOrdersForDisplay(
      [],
      [
        {
          id: "syifa-local",
          customerName: "Syifa",
          deliveryDate: "2026-09-10",
          updatedAt: "2026-07-10T03:00:00.000Z",
        },
      ],
      {
        startDate: "2026-09-01",
        endDate: "2026-09-30",
      },
    );

    expect(orders).toHaveLength(1);
    expect(orders[0]?.deliveryDate).toBe("2026-09-10");
  });

  it("prefers the fresher local order over a stale server row with the same id", () => {
    const orders = mergeCalendarOrdersForDisplay(
      [
        {
          id: "order-1",
          customerName: "Old",
          deliveryDate: "2026-09-10",
          deliverySlot: "09:00",
          updatedAt: "2026-07-09T03:00:00.000Z",
        },
      ],
      [
        {
          id: "order-1",
          customerName: "Syifa",
          deliveryDate: "2026-09-10",
          deliverySlot: "09:00",
          updatedAt: "2026-07-10T03:00:00.000Z",
        },
      ],
      {
        startDate: "2026-09-01",
        endDate: "2026-09-30",
      },
    );

    expect(orders).toHaveLength(1);
    expect(orders[0]?.customerName).toBe("Syifa");
  });

  it("filters merged orders to the requested calendar range", () => {
    const orders = mergeCalendarOrdersForDisplay(
      [],
      [
        {
          id: "order-in-range",
          deliveryDate: "2026-09-10",
        },
        {
          id: "order-out-range",
          deliveryDate: "2026-10-10",
        },
      ],
      {
        startDate: "2026-09-01",
        endDate: "2026-09-30",
      },
    );

    expect(orders.map((order) => order.id)).toEqual(["order-in-range"]);
  });
});
