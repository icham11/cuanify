import { describe, expect, it } from "vitest";

import {
  bookingStatusFilterMatchesBlank,
  getBookingStatusFilterAliases,
  isClosedOrderStatus,
  isFulfilledOrderStatus,
  matchesBookingStatusFilter,
  normalizeOrderStatus,
} from "@/lib/bookings/order-status";

describe("order status helpers", () => {
  it("normalizes legacy and variant statuses", () => {
    expect(normalizeOrderStatus("Inquiry")).toBe("In Production");
    expect(normalizeOrderStatus("Delivered")).toBe("Delivery");
    expect(normalizeOrderStatus(" Complete ")).toBe("Completed");
  });

  it("treats final statuses as closed", () => {
    expect(isClosedOrderStatus("Completed")).toBe(true);
    expect(isClosedOrderStatus("Delivered")).toBe(true);
    expect(isClosedOrderStatus("Delivery")).toBe(true);
    expect(isClosedOrderStatus("Cancelled")).toBe(true);
    expect(isClosedOrderStatus("Ready")).toBe(false);
    expect(isClosedOrderStatus("In Production")).toBe(false);
  });

  it("treats non-cancelled final statuses as fulfilled", () => {
    expect(isFulfilledOrderStatus("Completed")).toBe(true);
    expect(isFulfilledOrderStatus("Delivered")).toBe(true);
    expect(isFulfilledOrderStatus("Delivery")).toBe(true);
    expect(isFulfilledOrderStatus("Cancelled")).toBe(false);
    expect(isFulfilledOrderStatus("Ready")).toBe(false);
  });

  it("keeps booking status filter aliases scoped to filter behavior", () => {
    expect(bookingStatusFilterMatchesBlank("Inquiry")).toBe(true);
    expect(getBookingStatusFilterAliases("Completed")).toEqual([
      "Completed",
      "Complete",
    ]);
    expect(getBookingStatusFilterAliases("Cancelled")).toEqual([
      "Cancelled",
      "Canceled",
    ]);
    expect(matchesBookingStatusFilter(undefined, "Inquiry")).toBe(true);
    expect(matchesBookingStatusFilter("Inquiry", "Inquiry")).toBe(true);
    expect(matchesBookingStatusFilter("Complete", "Completed")).toBe(true);
    expect(matchesBookingStatusFilter("Canceled", "Cancelled")).toBe(true);
    expect(matchesBookingStatusFilter("Quoted", "In Production")).toBe(false);
  });
});
