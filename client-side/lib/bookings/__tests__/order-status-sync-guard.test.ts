import { describe, expect, it } from "vitest";
import { shouldPreserveExistingOrderStatusForStaleSync } from "@/lib/bookings/order-status-sync-guard";

describe("shouldPreserveExistingOrderStatusForStaleSync", () => {
  it("preserves the existing status when a stale payload tries to overwrite it", () => {
    expect(
      shouldPreserveExistingOrderStatusForStaleSync({
        incomingStatus: "In Production",
        incomingUpdatedAt: "2026-06-26T08:00:00.000Z",
        existingStatus: "Completed",
        existingUpdatedAt: new Date("2026-06-26T08:05:00.000Z"),
      }),
    ).toBe(true);
  });

  it("allows newer payloads to update the status", () => {
    expect(
      shouldPreserveExistingOrderStatusForStaleSync({
        incomingStatus: "Completed",
        incomingUpdatedAt: "2026-06-26T08:06:00.000Z",
        existingStatus: "In Production",
        existingUpdatedAt: new Date("2026-06-26T08:05:00.000Z"),
      }),
    ).toBe(false);
  });

  it("does nothing when the status is unchanged", () => {
    expect(
      shouldPreserveExistingOrderStatusForStaleSync({
        incomingStatus: "Completed",
        incomingUpdatedAt: "2026-06-26T08:06:00.000Z",
        existingStatus: "Completed",
        existingUpdatedAt: new Date("2026-06-26T08:05:00.000Z"),
      }),
    ).toBe(false);
  });
});
