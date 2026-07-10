export interface CalendarMergeOrder {
  id?: string;
  bookingCode?: string;
  resi?: string;
  deliveryDate?: string;
  deliverySlot?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface MergeCalendarOrdersOptions<T extends CalendarMergeOrder> {
  startDate?: string;
  endDate?: string;
  resolveDateKey?: (order: T) => string;
}

function getOrderKey(order: CalendarMergeOrder): string {
  return (
    String(order.id || "").trim() ||
    String(order.bookingCode || "").trim() ||
    String(order.resi || "").trim()
  );
}

function getOrderFreshness(order: CalendarMergeOrder): number {
  const updatedAt = Date.parse(String(order.updatedAt || ""));
  if (Number.isFinite(updatedAt)) return updatedAt;

  const createdAt = Date.parse(String(order.createdAt || ""));
  return Number.isFinite(createdAt) ? createdAt : 0;
}

function defaultResolveDateKey(order: CalendarMergeOrder): string {
  return String(order.deliveryDate || "").slice(0, 10);
}

function isWithinRange(
  dateKey: string,
  startDate?: string,
  endDate?: string,
): boolean {
  if (!dateKey) return false;
  if (startDate && dateKey < startDate) return false;
  if (endDate && dateKey > endDate) return false;
  return true;
}

export function mergeCalendarOrdersForDisplay<T extends CalendarMergeOrder>(
  serverOrders: readonly T[],
  localOrders: readonly T[],
  options: MergeCalendarOrdersOptions<T> = {},
): T[] {
  const resolveDateKey = options.resolveDateKey ?? defaultResolveDateKey;
  const mergedByKey = new Map<string, T>();
  const unkeyed: T[] = [];

  for (const order of [...serverOrders, ...localOrders]) {
    const dateKey = resolveDateKey(order);
    if (!isWithinRange(dateKey, options.startDate, options.endDate)) continue;

    const key = getOrderKey(order);
    if (!key) {
      unkeyed.push(order);
      continue;
    }

    const existing = mergedByKey.get(key);
    if (!existing) {
      mergedByKey.set(key, order);
      continue;
    }

    if (getOrderFreshness(order) > getOrderFreshness(existing)) {
      mergedByKey.set(key, order);
    }
  }

  return [...mergedByKey.values(), ...unkeyed].sort((left, right) => {
    const leftDate = resolveDateKey(left);
    const rightDate = resolveDateKey(right);
    if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
    return String(left.deliverySlot || "").localeCompare(
      String(right.deliverySlot || ""),
    );
  });
}
