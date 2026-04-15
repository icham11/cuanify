import { normalizeDateInput } from "@/lib/helpers/date-normalization";
import type { ShippingProvider } from "@/lib/bookings/shipping-types";

type ShippingQuoteLike = {
  provider?: string | null;
};

type ShippingScheduleOrderLike = {
  deliveryDate?: string | null;
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
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Jakarta",
  });
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

  return normalizedDeliveryDate <= todayIsoDate;
}

export function isTodayScheduledReminderOrder(
  order: ShippingScheduleOrderLike,
  todayIsoDate: string,
): boolean {
  if (!isScheduledShipmentOrder(order)) return false;
  if (isDeliveredOrCancelled(order.orderStatus)) return false;

  const normalizedDeliveryDate = normalizeDateInput(order.deliveryDate || "");
  return normalizedDeliveryDate === todayIsoDate;
}
