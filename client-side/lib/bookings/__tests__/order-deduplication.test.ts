import { describe, expect, it } from "vitest";

import { getLatestOrderActivityTimestamp } from "@/lib/bookings/order-activity";
import { choosePreferredOrderCandidate } from "@/lib/bookings/order-deduplication";

describe("order activity timestamp", () => {
  it("uses updatedAt when server payload strips status history", () => {
    const timestamp = getLatestOrderActivityTimestamp({
      createdAt: "2026-05-20T08:00:00.000Z",
      updatedAt: "2026-05-24T12:22:32.266Z",
      statusHistory: [],
      paymentTransactions: [],
      automationLogs: [],
      productionAssignedAt: null,
    });

    expect(timestamp).toBe(Date.parse("2026-05-24T12:22:32.266Z"));
  });
});

describe("order deduplication", () => {
  it("keeps the most recently updated duplicate so completed orders stay completed after polling", () => {
    const lateDuplicate = {
      id: "legacy-11-9306",
      bookingCode: "ALV-9306",
      resi: "",
      shippingReferenceId: "",
      orderStatus: "In Production",
      createdAt: "2026-04-17T06:01:35.964Z",
      updatedAt: "2026-05-24T11:10:22.729Z",
      statusHistory: [],
      paymentTransactions: [],
      automationLogs: [],
      productionAssignedAt: null,
    };
    const completedDuplicate = {
      ...lateDuplicate,
      id: "9306",
      orderStatus: "Completed",
      updatedAt: "2026-05-24T12:22:32.266Z",
    };

    expect(
      choosePreferredOrderCandidate(lateDuplicate, completedDuplicate),
    ).toMatchObject({
      id: "9306",
      orderStatus: "Completed",
    });
  });
});
