import {
  isFulfilledOrderStatus,
  normalizeOrderStatus,
} from "@/lib/bookings/order-status";
import { getLatestOrderActivityTimestamp } from "@/lib/bookings/order-activity";

type ReportsStatusHistoryEntry = {
  status?: string | null;
  timestamp?: string | null;
};

type ReportsTimestampEntry = {
  timestamp?: string | null;
};

export type ReportsOrderLike = {
  deliveryDate?: string | null;
  orderStatus?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  productionAssignedAt?: string | null;
  statusHistory?: ReportsStatusHistoryEntry[];
  paymentTransactions?: ReportsTimestampEntry[];
  automationLogs?: ReportsTimestampEntry[];
};

function getDeliveryDateCutoffTimestamp(deliveryDate: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) return 0;
  return Date.parse(`${deliveryDate}T23:59:59.999+07:00`);
}

function getFulfilledOrderTimestamp(order: ReportsOrderLike): number {
  const fulfilledTimestamps = (order.statusHistory ?? [])
    .filter((entry) => isFulfilledOrderStatus(entry.status))
    .map((entry) => Date.parse(entry.timestamp ?? ""))
    .filter((value) => Number.isFinite(value));

  if (fulfilledTimestamps.length > 0) {
    return Math.max(...fulfilledTimestamps);
  }

  if (isFulfilledOrderStatus(order.orderStatus)) {
    return getLatestOrderActivityTimestamp(order);
  }

  return 0;
}

export function isLateOrderForReports(
  order: ReportsOrderLike,
  todayDateKey: string,
): boolean {
  const deliveryDate = String(order.deliveryDate || "").trim();
  if (!deliveryDate || deliveryDate >= todayDateKey) return false;

  const status = normalizeOrderStatus(order.orderStatus);
  if (status === "Cancelled") return false;
  if (!isFulfilledOrderStatus(status)) return true;

  const cutoffTimestamp = getDeliveryDateCutoffTimestamp(deliveryDate);
  if (!Number.isFinite(cutoffTimestamp) || cutoffTimestamp <= 0) return true;

  const fulfilledAt = getFulfilledOrderTimestamp(order);
  if (!Number.isFinite(fulfilledAt) || fulfilledAt <= 0) return true;

  return fulfilledAt > cutoffTimestamp;
}

export function isCompletedOrderForReports(status?: string | null): boolean {
  return isFulfilledOrderStatus(status);
}
