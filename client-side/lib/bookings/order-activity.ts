export interface OrderActivityLike {
  createdAt?: string | null;
  updatedAt?: string | null;
  productionAssignedAt?: string | null;
  statusHistory?: Array<{ timestamp?: string | null }>;
  paymentTransactions?: Array<{ timestamp?: string | null }>;
  automationLogs?: Array<{ timestamp?: string | null }>;
}

export function getLatestOrderActivityTimestamp(
  order: OrderActivityLike,
): number {
  const candidates = [
    Date.parse(order.updatedAt ?? ""),
    Date.parse(order.createdAt ?? ""),
    ...(order.statusHistory ?? []).map((entry) => Date.parse(entry.timestamp ?? "")),
    ...(order.paymentTransactions ?? []).map((entry) =>
      Date.parse(entry.timestamp ?? ""),
    ),
    ...(order.automationLogs ?? []).map((entry) =>
      Date.parse(entry.timestamp ?? ""),
    ),
    Date.parse(order.productionAssignedAt ?? ""),
  ];

  return candidates.reduce((latest, current) => {
    return Number.isFinite(current) ? Math.max(latest, current) : latest;
  }, 0);
}
