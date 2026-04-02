import { addDays } from "date-fns";
import {
  normalizeDateInput,
  parseSafeDate,
  toIsoDateString,
} from "@/lib/helpers/date-normalization";

export const BAKERY_ORDERS_STORAGE_KEY = "bakeryOrdersState";
export const BAKERY_ORDERS_STORAGE_EVENT = "bakeryOrdersUpdated";

export interface LocalBakeryItem {
  productName?: string;
  size?: string;
  quantity?: number;
}

export interface LocalBakeryAddress {
  label?: string;
  area?: string;
  addressLine?: string;
}

export interface LocalBakeryShippingQuote {
  provider?: string;
  courierServiceName?: string;
  price?: number;
  eta?: string;
  distanceKm?: number;
}

export interface LocalBakeryShipment {
  trackingNumber?: string;
  status?: string;
  externalOrderId?: string;
}

export interface LocalBakerySimulations {
  productionWhatsappSent?: boolean;
  customerWhatsappSent?: boolean;
  calendarEventCreated?: boolean;
  googleSheetsSynced?: boolean;
}

export interface LocalBakeryOrder {
  id: string;
  bookingCode?: string;
  resi?: string;
  customerName?: string;
  customerPhone?: string;
  deliveryDate?: string;
  deliverySlot?: string;
  items?: LocalBakeryItem[];
  deliveryAddresses?: LocalBakeryAddress[];
  paymentStatus?: string;
  orderStatus?: string;
  basePrice?: number;
  addOnTotal?: number;
  deliveryFee?: number;
  manualAdjustment?: number;
  totalPrice?: number;
  downPaymentAmount?: number;
  remainingBalance?: number;
  shippingQuote?: LocalBakeryShippingQuote | null;
  shipment?: LocalBakeryShipment | null;
  simulations?: LocalBakerySimulations;
}

export interface LocalBakerySummary {
  totalOrders: number;
  inquiry: number;
  confirmed: number;
  inProduction: number;
  completed: number;
  cancelled: number;
  withResi: number;
  withoutResi: number;
  withShippingQuote: number;
  pendingAutomation: number;
  deliveryToday: number;
  deliveryTomorrow: number;
  lateOpenOrders: number;
  totalRevenue: number;
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeOrder(raw: unknown): LocalBakeryOrder | null {
  if (!raw || typeof raw !== "object") return null;
  const order = raw as Record<string, unknown>;
  const id = typeof order.id === "string" ? order.id : "";
  if (!id) return null;

  return {
    id,
    bookingCode: typeof order.bookingCode === "string" ? order.bookingCode : "",
    resi: typeof order.resi === "string" ? order.resi : "",
    customerName: typeof order.customerName === "string" ? order.customerName : "",
    customerPhone: typeof order.customerPhone === "string" ? order.customerPhone : "",
    deliveryDate:
      typeof order.deliveryDate === "string"
        ? (normalizeDateInput(order.deliveryDate) ?? order.deliveryDate.trim())
        : "",
    deliverySlot: typeof order.deliverySlot === "string" ? order.deliverySlot : "",
    items: Array.isArray(order.items)
      ? order.items.map((item) => {
          const source = item as Record<string, unknown>;
          return {
            productName: typeof source.productName === "string" ? source.productName : "",
            size: typeof source.size === "string" ? source.size : "",
            quantity: asNumber(source.quantity),
          };
        })
      : [],
    deliveryAddresses: Array.isArray(order.deliveryAddresses)
      ? order.deliveryAddresses.map((address) => {
          const source = address as Record<string, unknown>;
          return {
            label: typeof source.label === "string" ? source.label : "",
            area: typeof source.area === "string" ? source.area : "",
            addressLine: typeof source.addressLine === "string" ? source.addressLine : "",
          };
        })
      : [],
    paymentStatus: typeof order.paymentStatus === "string" ? order.paymentStatus : "",
    orderStatus: typeof order.orderStatus === "string" ? order.orderStatus : "",
    basePrice: asNumber(order.basePrice),
    addOnTotal: asNumber(order.addOnTotal),
    deliveryFee: asNumber(order.deliveryFee),
    manualAdjustment: asNumber(order.manualAdjustment),
    totalPrice: asNumber(order.totalPrice),
    downPaymentAmount: asNumber(order.downPaymentAmount),
    remainingBalance: asNumber(order.remainingBalance),
    shippingQuote:
      order.shippingQuote && typeof order.shippingQuote === "object"
        ? {
            provider:
              typeof (order.shippingQuote as Record<string, unknown>).provider === "string"
                ? ((order.shippingQuote as Record<string, unknown>).provider as string)
                : "",
            courierServiceName:
              typeof (order.shippingQuote as Record<string, unknown>).courierServiceName === "string"
                ? ((order.shippingQuote as Record<string, unknown>).courierServiceName as string)
                : "",
            price: asNumber((order.shippingQuote as Record<string, unknown>).price),
            eta:
              typeof (order.shippingQuote as Record<string, unknown>).eta === "string"
                ? ((order.shippingQuote as Record<string, unknown>).eta as string)
                : "",
            distanceKm: asNumber((order.shippingQuote as Record<string, unknown>).distanceKm),
          }
        : null,
    shipment:
      order.shipment && typeof order.shipment === "object"
        ? {
            trackingNumber:
              typeof (order.shipment as Record<string, unknown>).trackingNumber === "string"
                ? ((order.shipment as Record<string, unknown>).trackingNumber as string)
                : "",
            status:
              typeof (order.shipment as Record<string, unknown>).status === "string"
                ? ((order.shipment as Record<string, unknown>).status as string)
                : "",
            externalOrderId:
              typeof (order.shipment as Record<string, unknown>).externalOrderId === "string"
                ? ((order.shipment as Record<string, unknown>).externalOrderId as string)
                : "",
          }
        : null,
    simulations:
      order.simulations && typeof order.simulations === "object"
        ? {
            productionWhatsappSent: Boolean(
              (order.simulations as Record<string, unknown>).productionWhatsappSent
            ),
            customerWhatsappSent: Boolean(
              (order.simulations as Record<string, unknown>).customerWhatsappSent
            ),
            calendarEventCreated: Boolean(
              (order.simulations as Record<string, unknown>).calendarEventCreated
            ),
            googleSheetsSynced: Boolean(
              (order.simulations as Record<string, unknown>).googleSheetsSynced
            ),
          }
        : undefined,
  };
}

export function parseLocalBakeryOrders(snapshot: string | null): LocalBakeryOrder[] {
  if (!snapshot) return [];
  try {
    const parsed = JSON.parse(snapshot) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => normalizeOrder(entry))
      .filter((entry): entry is LocalBakeryOrder => Boolean(entry));
  } catch {
    return [];
  }
}

export function readLocalBakeryOrders(): LocalBakeryOrder[] {
  if (typeof window === "undefined") return [];
  return parseLocalBakeryOrders(window.localStorage.getItem(BAKERY_ORDERS_STORAGE_KEY));
}

export function summarizeLocalBakeryOrders(
  orders: LocalBakeryOrder[],
  todayIsoDate?: string
): LocalBakerySummary {
  const nowDate = normalizeDateInput(todayIsoDate ?? "") ?? toIsoDateString(new Date());
  const tomorrowBase = parseSafeDate(nowDate);
  const tomorrowIso = tomorrowBase ? toIsoDateString(addDays(tomorrowBase, 1)) : "";

  return orders.reduce<LocalBakerySummary>(
    (acc, order) => {
      const orderStatus = (order.orderStatus || "").toLowerCase();
      const isOpenOrder = !["completed", "delivered", "cancelled"].includes(orderStatus);
      const hasResi = Boolean(order.shipment?.trackingNumber);
      const hasQuote = Boolean(order.shippingQuote?.provider);
      const hasAutomationGap = Boolean(
        order.simulations &&
          (!order.simulations.productionWhatsappSent ||
            !order.simulations.customerWhatsappSent ||
            !order.simulations.calendarEventCreated ||
            !order.simulations.googleSheetsSynced)
      );

      acc.totalOrders += 1;
      acc.totalRevenue += asNumber(order.totalPrice);
      if (orderStatus === "inquiry") acc.inquiry += 1;
      if (orderStatus === "confirmed") acc.confirmed += 1;
      if (orderStatus === "in production") acc.inProduction += 1;
      if (orderStatus === "completed" || orderStatus === "delivered") acc.completed += 1;
      if (orderStatus === "cancelled") acc.cancelled += 1;
      if (hasResi) acc.withResi += 1;
      else acc.withoutResi += 1;
      if (hasQuote) acc.withShippingQuote += 1;
      if (hasAutomationGap) acc.pendingAutomation += 1;

      const normalizedDeliveryDate = normalizeDateInput(order.deliveryDate ?? "");
      if (normalizedDeliveryDate === nowDate) acc.deliveryToday += 1;
      if (normalizedDeliveryDate === tomorrowIso) acc.deliveryTomorrow += 1;
      if (normalizedDeliveryDate && normalizedDeliveryDate < nowDate && isOpenOrder) {
        acc.lateOpenOrders += 1;
      }

      return acc;
    },
    {
      totalOrders: 0,
      inquiry: 0,
      confirmed: 0,
      inProduction: 0,
      completed: 0,
      cancelled: 0,
      withResi: 0,
      withoutResi: 0,
      withShippingQuote: 0,
      pendingAutomation: 0,
      deliveryToday: 0,
      deliveryTomorrow: 0,
      lateOpenOrders: 0,
      totalRevenue: 0,
    }
  );
}
