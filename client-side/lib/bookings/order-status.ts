export const BOOKING_STATUS_OPTIONS = [
  { value: "In Production", label: "In Production" },
  { value: "Ready", label: "Ready" },
  { value: "Delivery", label: "Delivery" },
  { value: "Completed", label: "Completed" },
  { value: "Cancelled", label: "Cancelled" },
] as const;

export const BOOKING_STATUS_FILTER_OPTIONS = [
  { value: "Inquiry", label: "Inquiry" },
  ...BOOKING_STATUS_OPTIONS,
  { value: "Delivered", label: "Delivered" },
] as const;

const BOOKING_STATUS_FILTER_ALIASES: Record<string, readonly string[]> = {
  Inquiry: ["Inquiry"],
  Completed: ["Completed", "Complete"],
  Cancelled: ["Cancelled", "Canceled"],
};

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

  if (normalized === "Canceled") {
    return "Cancelled";
  }

  return normalized;
}

export function getBookingStatusFilterAliases(status?: string | null): string[] {
  const normalized = typeof status === "string" ? status.trim() : "";
  if (!normalized) return [];
  return [...(BOOKING_STATUS_FILTER_ALIASES[normalized] ?? [normalized])];
}

export function bookingStatusFilterMatchesBlank(
  status?: string | null,
): boolean {
  return (typeof status === "string" ? status.trim() : "") === "Inquiry";
}

export function matchesBookingStatusFilter(
  currentStatus?: string | null,
  selectedStatus?: string | null,
): boolean {
  const normalizedSelected =
    typeof selectedStatus === "string" ? selectedStatus.trim() : "";
  if (!normalizedSelected) return true;

  const normalizedCurrent =
    typeof currentStatus === "string" ? currentStatus.trim() : "";

  if (bookingStatusFilterMatchesBlank(normalizedSelected)) {
    return !normalizedCurrent || normalizedCurrent === "Inquiry";
  }

  return getBookingStatusFilterAliases(normalizedSelected).includes(
    normalizedCurrent,
  );
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
