import { describe, expect, it } from "vitest";
import {
  isCompletedOrderForReports,
  isLateOrderForReports,
  type ReportsOrderLike,
} from "../reports-orders";

describe("reports order helpers", () => {
  const todayDateKey = "2026-05-25";

  function buildOrder(
    overrides: Partial<ReportsOrderLike> = {},
  ): ReportsOrderLike {
    return {
      deliveryDate: "2026-05-20",
      orderStatus: "In Production",
      statusHistory: [],
      ...overrides,
    };
  }

  it("keeps overdue active orders in the late report", () => {
    expect(isLateOrderForReports(buildOrder(), todayDateKey)).toBe(true);
  });

  it("keeps overdue orders recorded after they are completed late", () => {
    const order = buildOrder({
      orderStatus: "Completed",
      statusHistory: [
        {
          status: "Completed",
          timestamp: "2026-05-21T09:00:00.000+07:00",
        },
      ],
    });

    expect(isLateOrderForReports(order, todayDateKey)).toBe(true);
  });

  it("does not mark fulfilled orders as late when they were finished on time", () => {
    const order = buildOrder({
      orderStatus: "Completed",
      statusHistory: [
        {
          status: "Completed",
          timestamp: "2026-05-20T18:30:00.000+07:00",
        },
      ],
    });

    expect(isLateOrderForReports(order, todayDateKey)).toBe(false);
  });

  it("excludes cancelled overdue orders from the late report", () => {
    expect(
      isLateOrderForReports(
        buildOrder({
          orderStatus: "Cancelled",
        }),
        todayDateKey,
      ),
    ).toBe(false);
  });

  it("treats delivery and completed as finished orders in reports", () => {
    expect(isCompletedOrderForReports("Completed")).toBe(true);
    expect(isCompletedOrderForReports("Delivered")).toBe(true);
    expect(isCompletedOrderForReports("Delivery")).toBe(true);
    expect(isCompletedOrderForReports("Ready")).toBe(false);
  });
});
