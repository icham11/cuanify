export const BOOKING_STATUS_OPTIONS = [
  { value: "In Production", label: "In Production" },
  { value: "Ready", label: "Ready" },
  { value: "Delivery", label: "Delivery" },
  { value: "Completed", label: "Completed" },
  { value: "Cancelled", label: "Cancelled" },
] as const;

export const BOOKING_STATUS_FILTER_OPTIONS = [
  ...BOOKING_STATUS_OPTIONS,
  { value: "Delivered", label: "Delivered" },
  { value: "DP Paid", label: "DP" },
  { value: "Paid", label: "Lunas" },
] as const;

const BOOKING_STATUS_FILTER_ALIASES: Record<string, readonly string[]> = {
  "In Production": [
    "In Production",
    "Inquiry",
    "Quoted",
    "DP Paid",
    "Confirmed",
  ],
  Completed: ["Completed", "Complete"],
  Cancelled: ["Cancelled", "Canceled"],
};

const BOOKING_PAYMENT_STATUS_FILTER_ALIASES: Record<string, readonly string[]> = {
  "DP Paid": ["DP Paid"],
  Paid: ["Paid"],
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

export function getBookingPaymentStatusFilterAliases(
  status?: string | null,
): string[] {
  const normalized = typeof status === "string" ? status.trim() : "";
  if (!normalized) return [];
  return [...(BOOKING_PAYMENT_STATUS_FILTER_ALIASES[normalized] ?? [])];
}

export function bookingStatusFilterMatchesBlank(
  status?: string | null,
): boolean {
  const normalized = typeof status === "string" ? status.trim() : "";
  return normalized === "Inquiry" || normalized === "In Production";
}

export function isBookingPaymentStatusFilter(status?: string | null): boolean {
  return getBookingPaymentStatusFilterAliases(status).length > 0;
}

export function matchesBookingStatusFilter(
  currentStatus?: string | null,
  selectedStatus?: string | null,
  paymentStatus?: string | null,
): boolean {
  const normalizedSelected =
    typeof selectedStatus === "string" ? selectedStatus.trim() : "";
  if (!normalizedSelected) return true;

  if (isBookingPaymentStatusFilter(normalizedSelected)) {
    const normalizedPaymentStatus =
      typeof paymentStatus === "string" ? paymentStatus.trim() : "";
    return getBookingPaymentStatusFilterAliases(normalizedSelected).includes(
      normalizedPaymentStatus,
    );
  }

  const normalizedCurrent =
    typeof currentStatus === "string" ? currentStatus.trim() : "";

  const allowedStatuses = getBookingStatusFilterAliases(normalizedSelected);
  if (allowedStatuses.includes(normalizedCurrent)) {
    return true;
  }

  return (
    bookingStatusFilterMatchesBlank(normalizedSelected) && !normalizedCurrent
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
