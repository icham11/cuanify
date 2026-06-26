import { describe, expect, it } from "vitest";
import { canUpdateLockedHistoricalOrderStatus } from "@/lib/bookings/historical-order-status-lock";

describe("canUpdateLockedHistoricalOrderStatus", () => {
  const referenceDate = new Date("2026-06-26T08:00:00+07:00");

  it("allows ready status for a locked previous-month order", () => {
    expect(
      canUpdateLockedHistoricalOrderStatus({
        deliveryDate: "2026-05-28",
        currentStatus: "In Production",
        requestedStatus: "Ready",
        referenceDate,
      }),
    ).toBe(true);
  });

  it("allows delivery status for a locked previous-month order", () => {
    expect(
      canUpdateLockedHistoricalOrderStatus({
        deliveryDate: "2026-05-28",
        currentStatus: "In Production",
        requestedStatus: "Delivery",
        referenceDate,
      }),
    ).toBe(true);
  });

  it("allows completed status for a locked previous-month order", () => {
    expect(
      canUpdateLockedHistoricalOrderStatus({
        deliveryDate: "2026-05-28",
        currentStatus: "In Production",
        requestedStatus: "Completed",
        referenceDate,
      }),
    ).toBe(true);
  });

  it("allows cancelled status for a locked previous-month order", () => {
    expect(
      canUpdateLockedHistoricalOrderStatus({
        deliveryDate: "2026-05-28",
        currentStatus: "In Production",
        requestedStatus: "Cancelled",
        referenceDate,
      }),
    ).toBe(true);
  });

  it("does not lock current-month orders", () => {
    expect(
      canUpdateLockedHistoricalOrderStatus({
        deliveryDate: "2026-06-20",
        currentStatus: "In Production",
        requestedStatus: "Ready",
        referenceDate,
      }),
    ).toBe(true);
  });
});
