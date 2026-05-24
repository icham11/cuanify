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

const FULFILLED_ORDER_STATUSES = new Set([
  "Delivery",
  "Delivered",
  "Completed",
]);

export function normalizeOrderStatus(status?: string | null): string {
  const normalized = typeof status === "string" ? status.trim() : "";

  if (!normalized || LEGACY_PRE_PRODUCTION_STATUSES.has(normalized)) {
    return "In Production";
  }

  if (normalized === "Delivered") {
    return "Delivery";
  }

  if (normalized === "Complete") {
    return "Completed";
  }

  return normalized;
}

export function isClosedOrderStatus(status?: string | null): boolean {
  return CLOSED_ORDER_STATUSES.has(normalizeOrderStatus(status));
}

export function isOpenOrderStatus(status?: string | null): boolean {
  return !isClosedOrderStatus(status);
}

export function isFulfilledOrderStatus(status?: string | null): boolean {
  return FULFILLED_ORDER_STATUSES.has(normalizeOrderStatus(status));
}
