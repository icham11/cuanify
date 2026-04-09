export const BOOKING_STATUS_OPTIONS = [
  { value: "In Production", label: "In Production" },
  { value: "Ready", label: "Ready" },
  { value: "Delivery", label: "Delivery" },
  { value: "Completed", label: "Completed" },
  { value: "Cancelled", label: "Cancelled" },
] as const;

const LEGACY_PRE_PRODUCTION_STATUSES = new Set([
  "Inquiry",
  "Quoted",
  "DP Paid",
  "Confirmed",
]);

const CLOSED_ORDER_STATUSES = new Set([
  "Delivery",
  "Delivered",
  "Completed",
  "Cancelled",
]);

export function normalizeOrderStatus(status?: string | null): string {
  if (!status || LEGACY_PRE_PRODUCTION_STATUSES.has(status)) {
    return "In Production";
  }

  if (status === "Delivered") {
    return "Delivery";
  }

  return status;
}

export function isClosedOrderStatus(status?: string | null): boolean {
  return CLOSED_ORDER_STATUSES.has(normalizeOrderStatus(status));
}

export function isOpenOrderStatus(status?: string | null): boolean {
  return !isClosedOrderStatus(status);
}
