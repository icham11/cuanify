import { normalizeDateInput } from "@/lib/helpers/date-normalization";
import type { ShippingProvider } from "@/lib/bookings/shipping-types";

type ShippingQuoteLike = {
  provider?: string | null;
};

type ShippingScheduleOrderLike = {
  deliveryDate?: string | null;
  deliverySlot?: string | null;
  orderStatus?: string | null;
  notes?: string | null;
  shippingQuote?: ShippingQuoteLike | null;
  shipment?: unknown;
};

const SCHEDULED_SHIPPING_PROVIDERS: ShippingProvider[] = [
  "GOJEK",
  "GRAB",
  "PAXEL",
];

function inferDeliveryMethodFromNotes(notes?: string | null): string | undefined {
  const match = notes?.match(/delivery\s*method\s*:\s*([^\n]+)/i);
  const raw = (match?.[1] || "").trim().toLowerCase();
  if (!raw) return undefined;

  if (raw.includes("gosend") || raw.includes("go send")) {
    return "ASSISTED_GOSEND";
  }
  if (raw.includes("gocar") || raw.includes("go car")) {
    return "ASSISTED_GOCAR";
  }
  if (raw.includes("grab")) return "ASSISTED_GRAB";
  if (raw.includes("paxel")) return "ASSISTED_PAXEL";

  return undefined;
}

function resolveProviderFromDeliveryMethod(
  method?: string,
): ShippingProvider | null {
  if (!method) return null;
  if (method === "ASSISTED_GOSEND" || method === "ASSISTED_GOCAR") {
    return "GOJEK";
  }
  if (method === "ASSISTED_GRAB") return "GRAB";
  if (method === "ASSISTED_PAXEL") return "PAXEL";
  return null;
}

export function getJakartaTodayIsoDate(): string {
  return getJakartaClock().isoDate;
}

function getJakartaClock(referenceDate: Date = new Date()): {
  isoDate: string;
  minutesSinceMidnight: number;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(referenceDate);

  const year = parts.find((part) => part.type === "year")?.value || "1970";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  const hour = Number(parts.find((part) => part.type === "hour")?.value || "0");
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value || "0",
  );

  const safeHour = Number.isFinite(hour) ? Math.max(0, Math.min(23, hour)) : 0;
  const safeMinute = Number.isFinite(minute)
    ? Math.max(0, Math.min(59, minute))
    : 0;

  return {
    isoDate: `${year}-${month}-${day}`,
    minutesSinceMidnight: safeHour * 60 + safeMinute,
  };
}

function parseDeliverySlotToMinutes(slot?: string | null): number | null {
  const matched = String(slot || "").match(/(\d{1,2}):(\d{2})/);
  if (!matched) return null;

  const hour = Number(matched[1]);
  const minute = Number(matched[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;

  return hour * 60 + minute;
}

export function isScheduledShipmentProvider(provider?: string | null): boolean {
  if (!provider) return false;
  return SCHEDULED_SHIPPING_PROVIDERS.includes(
    provider.toUpperCase() as ShippingProvider,
  );
}

export function resolveShippingProvider(
  order: ShippingScheduleOrderLike,
): ShippingProvider | null {
  const quoteProvider = (order.shippingQuote?.provider || "").toUpperCase();
  if (isScheduledShipmentProvider(quoteProvider)) {
    return quoteProvider as ShippingProvider;
  }

  return resolveProviderFromDeliveryMethod(
    inferDeliveryMethodFromNotes(order.notes),
  );
}

export function isScheduledShipmentOrder(
  order: ShippingScheduleOrderLike,
): boolean {
  return isScheduledShipmentProvider(resolveShippingProvider(order));
}

export function isGrabOrGojekOrder(order: ShippingScheduleOrderLike): boolean {
  const provider = resolveShippingProvider(order);
  return provider === "GRAB" || provider === "GOJEK";
}

function isDeliveredOrCancelled(status?: string | null): boolean {
  const normalized = (status || "").trim().toLowerCase();
  return normalized === "delivered" || normalized === "cancelled";
}

export function isDueForScheduledShipment(
  order: ShippingScheduleOrderLike,
  todayIsoDate: string,
): boolean {
  if (!isScheduledShipmentOrder(order)) return false;
  if (!order.shippingQuote?.provider) return false;
  if (order.shipment) return false;
  if (isDeliveredOrCancelled(order.orderStatus)) return false;

  const normalizedDeliveryDate = normalizeDateInput(order.deliveryDate || "");
  if (!normalizedDeliveryDate) return false;

  if (normalizedDeliveryDate < todayIsoDate) {
    return true;
  }

  if (normalizedDeliveryDate > todayIsoDate) {
    return false;
  }

  const slotMinutes = parseDeliverySlotToMinutes(order.deliverySlot);
  if (slotMinutes === null) {
    return true;
  }

  return getJakartaClock().minutesSinceMidnight >= slotMinutes;
}

export function isTodayScheduledReminderOrder(
  order: ShippingScheduleOrderLike,
  todayIsoDate: string,
): boolean {
  if (!isScheduledShipmentOrder(order)) return false;
  if (order.shipment) return false;
  if (isDeliveredOrCancelled(order.orderStatus)) return false;

  const normalizedDeliveryDate = normalizeDateInput(order.deliveryDate || "");
  return normalizedDeliveryDate === todayIsoDate;
}
