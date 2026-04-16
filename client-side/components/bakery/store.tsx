"use client";

import {
  createContext,
  useRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { toast } from "sonner";
import {
  detailFieldDefinitions,
  type ParsedWhatsAppOrder,
  type WhatsAppOrderType,
} from "@/lib/bookings/whatsapp-parser";
import { buildOrderRecapWhatsAppText } from "@/lib/bookings/whatsapp-message-template";
import type {
  BookingAutomationEvent,
  BookingAutomationOrderPayload,
  BookingAutomationResponse,
} from "@/lib/bookings/automation-types";
import type {
  ShippingQuote,
  ShippingResiResponse,
  ShippingShipment,
} from "@/lib/bookings/shipping-types";
import { calculateDownPayment } from "@/lib/bookings/config";
import { isWithinBusinessHours } from "@/lib/bookings/operations";
import { estimateOperationalWeightGram } from "@/lib/bookings/delivery-rules";
import { normalizeOrderStatus } from "@/lib/bookings/order-status";
import {
  getJakartaTodayIsoDate,
  isDueForScheduledShipment,
  isGrabOrGojekOrder,
  isScheduledShipmentOrder,
} from "@/lib/bookings/shipping-schedule";
import { normalizeDateInput } from "@/lib/helpers/date-normalization";
import { useBakerySettings } from "@/hooks/useBakerySettings";

export type OrderStatus =
  | "Inquiry"
  | "Quoted"
  | "DP Paid"
  | "Confirmed"
  | "In Production"
  | "Ready"
  | "Delivery"
  | "Completed"
  | "Cancelled"
  | "Delivered";

export type PaymentStatus = "Pending" | "DP Paid" | "Paid";

export interface PaymentTransaction {
  id: string;
  timestamp: string;
  amount: number;
  type: "DP" | "Final";
  note?: string;
  userId?: number | null;
  actorName?: string;
}

export interface OrderStatusLog {
  id: string;
  status: OrderStatus;
  timestamp: string;
  note: string;
  userId?: number | null;
  actorName?: string;
}

export interface OrderAutomationLog {
  id: string;
  eventType: BookingAutomationEvent;
  timestamp: string;
  success: boolean;
  summary: string;
}

export interface OrderItem {
  id: string;
  category: string;
  subcategory: string;
  productName: string;
  size: string;
  quantity: number;
  tokenDifficulty?:
    | "SIMPLE"
    | "NORMAL"
    | "HARD"
    | "ADVANCED"
    | "EXPERT"
    | "MEDIUM"
    | "DIFFICULT";
  customTokenPerUnit?: number;
  basePrice: number;
  productType?: "COOKIE" | "BOUQUET" | "CAKE" | "CUPCAKE" | "TOWER";
  selectedPrice?: number;
  cookiePrice?: number;
  designCount?: number;
  additionalDesignCount?: number;
  additionalCost?: number;
  bouquetType?: "HAND" | "STANDING";
  bouquetCost?: number;
  cakeDiameterCm?: number;
  cakeHeightCm?: number;
  cakeType?: "DUMMY" | "REAL";
  cupcakePackType?: "DOZEN" | "INDIVIDUAL";
  hasCookieTopper?: boolean;
  lineTotal?: number;
  addOns: string[];
  addOnQuantities?: Record<string, number>;
  addOnTotal: number;
  notes?: string;
}

export interface DeliveryAddress {
  id: string;
  label: string;
  area: string;
  addressLine: string;
}

export interface BakeryOrder {
  id: string;
  resi: string;
  bookingCode: string;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  deliveryDate: string;
  deliverySlot: string;
  cakeType?: string;
  size?: string;
  addOns?: string;
  notes?: string;
  basePrice?: number;
  addOnTotal?: number;
  deliveryFee?: number;
  manualAdjustment?: number;
  dpPaidAmount?: number;
  finalPaidAmount?: number;
  totalPaidAmount?: number;
  downPaymentAmount?: number;
  remainingBalance?: number;
  paymentTransactions?: PaymentTransaction[];
  items: OrderItem[];
  deliveryAddresses: DeliveryAddress[];
  product: string;
  totalPrice: number;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  assignedStaffUserId?: number | null;
  assignedStaffName?: string;
  productionAssignedAt?: string | null;
  statusHistory: OrderStatusLog[];
  automationLogs?: OrderAutomationLog[];
  whatsAppParsedData?: ParsedWhatsAppOrder;
  shippingQuote?: ShippingQuote | null;
  shippingReferenceId?: string;
  shipment?: ShippingShipment | null;
  simulations?: {
    whatsappSent: boolean;
    productionWhatsappSent: boolean;
    customerWhatsappSent: boolean;
    calendarEventCreated: boolean;
    calendarEventId?: string;
    calendarEventLink?: string;
    googleSheetsSynced: boolean;
    googleSheetsRange?: string;
    lastAutomationMessage?: string;
    lastAutomationAt?: string;
  };
}

export interface NewOrderInput {
  customerName: string;
  customerPhone: string;
  deliveryDate: string;
  deliverySlot: string;
  notes?: string;
  items: OrderItem[];
  deliveryAddresses: DeliveryAddress[];
  basePrice: number;
  addOnTotal: number;
  deliveryFee: number;
  manualAdjustment: number;
  dpPaidAmount: number;
  finalPaidAmount: number;
  totalPrice: number;
  downPaymentAmount: number;
  remainingBalance: number;
  paymentStatus: PaymentStatus;
  whatsAppParsedData?: ParsedWhatsAppOrder;
  shippingQuote?: ShippingQuote | null;
}

interface OrdersContextValue {
  orders: BakeryOrder[];
  addOrder: (order: NewOrderInput) => Promise<void>;
  updateOrderStatus: (id: string, status: OrderStatus) => Promise<void>;
  assignOrderToStaff: (
    id: string,
    staff: { userId: number; name: string },
  ) => void;
  clearOrderAssignee: (id: string) => void;
  updatePaymentStatus: (id: string, status: PaymentStatus) => void;
  recordPayment: (
    id: string,
    payload: {
      dpPaidAmount: number;
      finalPaidAmount: number;
      note?: string;
    },
  ) => void;
  updateOrderSchedule: (
    id: string,
    deliveryDate: string,
    deliverySlot: string,
  ) => void;
  syncOrderCalendar: (id: string) => Promise<void>;
  getCustomerMessagePreview: (id: string) => string;
  setOrderShipment: (id: string, shipment: ShippingShipment) => void;
}

const OrdersContext = createContext<OrdersContextValue | null>(null);

const initialOrders: BakeryOrder[] = [];
const STORAGE_KEY = "bakeryOrdersState";
const STORAGE_EVENT = "bakeryOrdersUpdated";
const RAW_BOOKINGS_API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "";
const NORMALIZED_BOOKINGS_API_BASE = RAW_BOOKINGS_API_BASE.replace(/\/+$/, "");
const ORDERS_SYNC_ENDPOINT = NORMALIZED_BOOKINGS_API_BASE
  ? `${NORMALIZED_BOOKINGS_API_BASE}/api/bookings/orders`
  : "/api/bookings/orders";
const INITIAL_SNAPSHOT = JSON.stringify(initialOrders);
const SERVER_SYNC_POLL_INTERVAL_MS = 15000;
const LOCAL_WRITE_STALE_GUARD_MS = 2500;
let hasHydrated = false;

type OrdersSyncResponse = {
  success?: boolean;
  error?: string;
  details?: string[] | string;
  data?: {
    mode?: string;
    itemCount?: number;
  };
};

function normalizeParsedOrderTypeKey(
  value?: string,
): WhatsAppOrderType | null {
  const normalized = (value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (normalized === "cake") return "cake";
  if (normalized === "cookies") return "cookies";
  if (normalized === "cupcakes") return "cupcakes";
  if (normalized === "buket") return "buket";
  if (normalized === "cookies_tower") return "cookies_tower";

  return null;
}

function mapProductTypeToDetailOrderType(
  productType?: OrderItem["productType"],
): WhatsAppOrderType | null {
  if (productType === "CAKE") return "cake";
  if (productType === "COOKIE") return "cookies";
  if (productType === "CUPCAKE") return "cupcakes";
  if (productType === "BOUQUET") return "buket";
  if (productType === "TOWER") return "cookies_tower";
  return null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatAddOnSummary(
  addOns: string[],
  addOnQuantities?: Record<string, number>,
): string {
  if (addOns.length === 0) return "";

  return addOns
    .map((addOn) => {
      const quantity = Number(addOnQuantities?.[addOn] || 0);
      if (!Number.isInteger(quantity) || quantity <= 1) return addOn;
      return `${quantity}x ${addOn}`;
    })
    .join(", ");
}

function resolveItemSubtotal(item: OrderItem): number {
  if (Number(item.lineTotal) > 0) return Number(item.lineTotal);
  return (Number(item.basePrice || 0) + Number(item.addOnTotal || 0)) * Math.max(0, Number(item.quantity || 0));
}

function getParsedDetailsForMessage(
  parsed: ParsedWhatsAppOrder | undefined,
  item: OrderItem,
): Record<string, string> {
  const detailOrderType =
    mapProductTypeToDetailOrderType(item.productType) ||
    normalizeParsedOrderTypeKey(parsed?.orderType);

  if (detailOrderType && parsed?.detailsByOrderType?.[detailOrderType]) {
    return parsed.detailsByOrderType[detailOrderType] ?? {};
  }

  return parsed?.details ?? {};
}

function buildMessageDetailLines(order: BakeryOrder, item: OrderItem) {
  const parsed = order.whatsAppParsedData;
  const detailOrderType =
    mapProductTypeToDetailOrderType(item.productType) ||
    normalizeParsedOrderTypeKey(parsed?.orderType);
  const fieldDefinitions = detailOrderType
    ? detailFieldDefinitions[detailOrderType]
    : [];
  const parsedDetails = getParsedDetailsForMessage(parsed, item);

  return fieldDefinitions
    .map((field) => {
      let value = (parsedDetails[field.key] || "").trim();

      if (!value && item.notes) {
        const match = item.notes.match(
          new RegExp(`${escapeRegex(field.label)}\\s*[:=-]\\s*([^\\n]+)`, "i"),
        );
        if (match?.[1]) {
          value = match[1].trim();
        }
      }

      return value ? { label: field.label, value } : null;
    })
    .filter((entry): entry is { label: string; value: string } => Boolean(entry));
}

function resolveShippingMethodLabel(order: BakeryOrder): string {
  const parsedMethod = order.whatsAppParsedData?.common?.deliveryMethod?.trim();
  if (parsedMethod) return parsedMethod;

  if (order.shippingQuote?.provider || order.shippingQuote?.courierServiceName) {
    return [
      order.shippingQuote?.provider,
      order.shippingQuote?.courierServiceName,
    ]
      .filter(Boolean)
      .join(" ");
  }

  return "-";
}

function resolveRecipientName(order: BakeryOrder): string {
  return order.whatsAppParsedData?.common?.recipientName?.trim() || order.customerName || "-";
}

function resolveRecipientPhone(order: BakeryOrder): string {
  return order.whatsAppParsedData?.common?.recipientPhone?.trim() || order.customerPhone || "-";
}

function resolveFullAddress(order: BakeryOrder): string {
  return (
    order.whatsAppParsedData?.common?.fullAddress?.trim() ||
    order.deliveryAddresses?.[0]?.addressLine ||
    order.customerAddress ||
    "-"
  );
}

function inferDeliveryMethodFromNotes(notes?: string): string | undefined {
  const match = notes?.match(/delivery\s*method\s*:\s*([^\n]+)/i);
  const raw = (match?.[1] || "").trim().toLowerCase();
  if (!raw) return undefined;

  if (raw.includes("pickup")) return "PICKUP";
  if (raw.includes("customer")) return "CUSTOMER_APP_COURIER";
  if (raw.includes("gosend") || raw.includes("go send")) {
    return "ASSISTED_GOSEND";
  }
  if (raw.includes("gocar") || raw.includes("go car")) {
    return "ASSISTED_GOCAR";
  }
  if (raw.includes("grab")) return "ASSISTED_GRAB";
  if (raw.includes("paxel")) return "ASSISTED_PAXEL";
  if (
    raw.includes("same day") ||
    raw.includes("same-day") ||
    raw.includes("sameday")
  ) {
    return "ASSISTED_SAME_DAY";
  }
  if (raw.includes("jne") || raw.includes("j&t") || raw.includes("jnt")) {
    return "REGULAR_JNE_JNT";
  }

  return undefined;
}

function toBookingDatePart(deliveryDate: string): string {
  const normalizedDate = normalizeDateInput(deliveryDate);
  if (!normalizedDate) {
    return "000000";
  }

  const isoMatch = normalizedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!isoMatch) return "000000";

  const yearShort = isoMatch[1].slice(-2);
  return `${isoMatch[3]}${isoMatch[2]}${yearShort}`;
}

function extractSequenceForDate(code: string, datePart: string): number {
  const normalized = code.replace(/\s+/g, "").toUpperCase();
  if (!normalized || !datePart || datePart === "000000") return 0;
  const pattern = new RegExp(`^[A-Z]{2}\\d{3}-${datePart}-(\\d{3})$`);
  const match = normalized.match(pattern);
  if (!match?.[1]) return 0;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getDailyBookingSequence(
  orders: BakeryOrder[],
  deliveryDate: string,
): number {
  const datePart = toBookingDatePart(deliveryDate);
  const max = orders.reduce((currentMax, order) => {
    const fromBooking = extractSequenceForDate(
      order.bookingCode || "",
      datePart,
    );
    const fromResi = extractSequenceForDate(order.resi || "", datePart);
    return Math.max(currentMax, fromBooking, fromResi);
  }, 0);
  return max + 1;
}

function generateBookingCode(
  customerName: string,
  customerPhone: string,
  deliveryDate: string,
  sequence: number,
) {
  const initials = customerName
    .replace(/[^a-zA-Z]/g, "")
    .slice(0, 2)
    .toUpperCase()
    .padEnd(2, "X");
  const phoneDigits = customerPhone.replace(/\D/g, "");
  const lastThree = phoneDigits.slice(-3).padStart(3, "0");
  const datePart = toBookingDatePart(deliveryDate);
  const sequencePart = String(sequence).padStart(3, "0");
  return `${initials}${lastThree}-${datePart}-${sequencePart}`;
}

function generateShippingReferenceId(
  bookingCode: string,
  orderId: string,
): string {
  const normalizedBookingCode = bookingCode
    .trim()
    .replace(/[^A-Z0-9-]/gi, "")
    .toUpperCase();
  const normalizedOrderId = orderId.trim().replace(/[^A-Z0-9-]/gi, "");
  const uniquePart = Date.now().toString(36).toUpperCase();
  return [
    normalizedBookingCode || "BOOKING",
    normalizedOrderId || "ORDER",
    uniquePart,
  ]
    .filter(Boolean)
    .join("-");
}

function appendStatusLog(
  history: OrderStatusLog[] | undefined,
  status: OrderStatus,
  note: string,
  actor?: { userId: number | null; name: string },
) {
  return [
    ...(history ?? []),
    {
      id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      status,
      timestamp: new Date().toISOString(),
      note,
      userId: actor?.userId ?? null,
      actorName: actor?.name || "System",
    },
  ];
}

function appendAutomationLog(
  history: OrderAutomationLog[] | undefined,
  eventType: BookingAutomationEvent,
  success: boolean,
  summary: string,
) {
  return [
    ...(history ?? []),
    {
      id: `automation-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      eventType,
      timestamp: new Date().toISOString(),
      success,
      summary,
    },
  ];
}

function normalizeMoney(value: number | undefined | null): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed));
}

function inferPaymentStatus(
  totalPrice: number,
  totalPaidAmount: number,
): PaymentStatus {
  if (totalPaidAmount <= 0) return "DP Paid";
  if (totalPaidAmount >= Math.max(0, normalizeMoney(totalPrice))) return "Paid";
  return "DP Paid";
}

function buildAutomationPayload(
  order: BakeryOrder,
): BookingAutomationOrderPayload {
  return {
    id: order.id,
    bookingCode: order.bookingCode || "",
    resi: order.resi || "",
    customerName: order.customerName || "",
    customerPhone: order.customerPhone || "",
    deliveryDate: order.deliveryDate || "",
    deliverySlot: order.deliverySlot || "",
    paymentStatus: order.paymentStatus,
    orderStatus: order.orderStatus,
    totalPrice: Number(order.totalPrice || 0),
    deliveryFee: Number(order.deliveryFee || 0),
    notes: order.notes || "",
    items: (order.items ?? []).map((item) => ({
      id: item.id,
      category: item.category,
      subcategory: item.subcategory,
      productName: item.productName,
      size: item.size,
      quantity: Number(item.quantity || 0),
      tokenDifficulty: item.tokenDifficulty,
      productType: item.productType,
      selectedPrice: item.selectedPrice,
      basePrice: Number(item.basePrice || 0),
      cookiePrice: item.cookiePrice,
      designCount: item.designCount,
      additionalDesignCount: item.additionalDesignCount,
      additionalCost: item.additionalCost,
      bouquetType: item.bouquetType,
      bouquetCost: item.bouquetCost,
      cakeDiameterCm: item.cakeDiameterCm,
      cakeHeightCm: item.cakeHeightCm,
      cakeType: item.cakeType,
      cupcakePackType: item.cupcakePackType,
      hasCookieTopper: item.hasCookieTopper,
      lineTotal:
        Number(item.lineTotal || 0) ||
        Number(item.basePrice || 0) + Number(item.addOnTotal || 0),
      notes: item.notes || "",
    })),
    deliveryAddresses: (order.deliveryAddresses ?? []).map((address) => ({
      id: address.id,
      label: address.label,
      area: address.area,
      addressLine: address.addressLine,
    })),
  };
}

function summarizeAutomationResult(result: BookingAutomationResponse): {
  success: boolean;
  message: string;
} {
  const actions = [
    { name: "Calendar", result: result.calendar },
    { name: "WA Produksi", result: result.fonnteProduction },
    { name: "WA Customer", result: result.fonnteCustomer },
    { name: "Sheets", result: result.sheets },
  ];
  const effective = actions.filter((item) => !item.result.skipped);
  const successCount = effective.filter((item) => item.result.ok).length;
  const failCount = effective.length - successCount;

  if (effective.length === 0) {
    return {
      success: true,
      message: "Tidak ada automasi aktif untuk event ini.",
    };
  }

  if (failCount === 0) {
    return {
      success: true,
      message: `Automasi berhasil (${successCount}/${effective.length}).`,
    };
  }

  const failedDetails = effective
    .filter((item) => !item.result.ok)
    .map((item) => `${item.name}: ${item.result.message}`)
    .join(" | ");

  return {
    success: false,
    message: `Automasi selesai dengan kendala (${successCount} berhasil, ${failCount} gagal). ${failedDetails}`,
  };
}

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => callback();
  window.addEventListener("storage", handler);
  window.addEventListener(STORAGE_EVENT, handler as EventListener);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(STORAGE_EVENT, handler as EventListener);
  };
}

function getSnapshot() {
  if (typeof window === "undefined") return INITIAL_SNAPSHOT;
  if (!hasHydrated) return INITIAL_SNAPSHOT;
  return window.localStorage.getItem(STORAGE_KEY) ?? INITIAL_SNAPSHOT;
}

function getServerSnapshot() {
  return INITIAL_SNAPSHOT;
}

function parseSnapshot(snapshot: string): BakeryOrder[] {
  try {
    const parsed = JSON.parse(snapshot) as BakeryOrder[];
    return Array.isArray(parsed) ? parsed : initialOrders;
  } catch {
    return initialOrders;
  }
}

function areOrdersSnapshotsEqual(
  left: BakeryOrder[],
  right: BakeryOrder[],
): boolean {
  if (left.length !== right.length) return false;
  return JSON.stringify(left) === JSON.stringify(right);
}

function writeOrdersSnapshot(nextOrders: BakeryOrder[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextOrders));
  window.dispatchEvent(new Event(STORAGE_EVENT));
}

function parseOrdersSyncError(
  payload: OrdersSyncResponse,
  fallback: string,
): string {
  if (payload.error) return payload.error;
  if (Array.isArray(payload.details) && payload.details.length > 0) {
    return payload.details.join("; ");
  }
  if (typeof payload.details === "string" && payload.details.trim()) {
    return payload.details;
  }
  return fallback;
}

export function OrdersProvider({ children }: { children: React.ReactNode }) {
  const { settings: bakerySettings } = useBakerySettings();
  const blockedDates = bakerySettings?.blockedDates;
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const orders = useMemo<BakeryOrder[]>(
    () => parseSnapshot(snapshot),
    [snapshot],
  );
  const [actorIdentity, setActorIdentity] = useState<{
    userId: number | null;
    name: string;
  }>({
    userId: null,
    name: "System",
  });
  const hydrationInFlightRef = useRef(false);
  const lastLocalWriteAtRef = useRef(0);
  const scheduledShipmentRunInFlightRef = useRef(false);
  const processingShipmentIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hasHydrated) {
      hasHydrated = true;
      window.dispatchEvent(new Event(STORAGE_EVENT));
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let isMounted = true;

    const fetchActorIdentity = async () => {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          data?: { userId?: number; name?: string };
        };
        const parsedId = Number(payload.data?.userId);
        if (!Number.isFinite(parsedId)) return;
        if (!isMounted) return;
        setActorIdentity({
          userId: parsedId,
          name: payload.data?.name?.trim() || `User #${parsedId}`,
        });
      } catch {
        // Keep default actor when identity endpoint is unavailable.
      }
    };

    void fetchActorIdentity();
    return () => {
      isMounted = false;
    };
  }, []);

  const syncOrdersToServer = useCallback(async (nextOrders: BakeryOrder[]) => {
    if (typeof window === "undefined") {
      return null as OrdersSyncResponse | null;
    }

    const requestBody = { orders: nextOrders };
    console.info("[bookings][frontend] sync request", {
      endpoint: ORDERS_SYNC_ENDPOINT,
      method: "POST",
      orderCount: nextOrders.length,
      ids: nextOrders.map((order) => order.id),
    });

    let response: Response;
    try {
      response = await fetch(ORDERS_SYNC_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Network error while syncing bookings.";
      throw new Error(`Network error saat sinkron booking: ${message}`);
    }

    const payload = (await response
      .json()
      .catch(() => ({}))) as OrdersSyncResponse;

    console.info("[bookings][frontend] sync response", {
      endpoint: ORDERS_SYNC_ENDPOINT,
      status: response.status,
      ok: response.ok,
      success: payload.success ?? false,
      mode: payload.data?.mode,
      itemCount: payload.data?.itemCount,
      error: payload.error,
    });

    if (!response.ok || !payload.success) {
      const fallback = `Booking sync failed (${response.status}).`;
      const message = parseOrdersSyncError(payload, fallback);
      throw new Error(message);
    }

    return payload;
  }, []);

  const hydrateOrdersFromServer = useCallback(
    async (force = false) => {
      if (typeof window === "undefined") return;
      if (hydrationInFlightRef.current) return;

      hydrationInFlightRef.current = true;
      const localSnapshot = window.localStorage.getItem(STORAGE_KEY);
      const localOrders = parseSnapshot(localSnapshot ?? INITIAL_SNAPSHOT);

      try {
        const response = await fetch(ORDERS_SYNC_ENDPOINT, {
          method: "GET",
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as {
          success?: boolean;
          data?: { orders?: BakeryOrder[] };
        };

        if (!response.ok || !payload.success) return;

        const serverOrders = Array.isArray(payload.data?.orders)
          ? payload.data.orders
          : [];

        if (serverOrders.length > 0) {
          const recentlyChangedLocally =
            !force &&
            Date.now() - lastLocalWriteAtRef.current <
              LOCAL_WRITE_STALE_GUARD_MS;
          if (recentlyChangedLocally) return;

          if (!areOrdersSnapshotsEqual(localOrders, serverOrders)) {
            writeOrdersSnapshot(serverOrders);
          }
          return;
        }

        if (localOrders.length > 0) {
          void syncOrdersToServer(localOrders).catch((error) => {
            console.warn("[bookings][frontend] hydrate sync failed", {
              endpoint: ORDERS_SYNC_ENDPOINT,
              message: error instanceof Error ? error.message : String(error),
            });
          });
        }
      } catch {
        // Keep local snapshot if server is unreachable.
      } finally {
        hydrationInFlightRef.current = false;
      }
    },
    [syncOrdersToServer],
  );

  useEffect(() => {
    void hydrateOrdersFromServer();
  }, [hydrateOrdersFromServer]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const pollId = window.setInterval(() => {
      void hydrateOrdersFromServer();
    }, SERVER_SYNC_POLL_INTERVAL_MS);

    const handleFocus = () => {
      void hydrateOrdersFromServer();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void hydrateOrdersFromServer();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(pollId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [hydrateOrdersFromServer]);

  const persistOrders = useCallback(
    (nextOrders: BakeryOrder[]) => {
      if (typeof window === "undefined") return;
      const previousSnapshot =
        window.localStorage.getItem(STORAGE_KEY) ?? INITIAL_SNAPSHOT;
      lastLocalWriteAtRef.current = Date.now();
      writeOrdersSnapshot(nextOrders);
      void syncOrdersToServer(nextOrders).catch((error) => {
        const message =
          error instanceof Error
            ? error.message
            : "Gagal sinkron perubahan booking ke server.";

        // Revert optimistic local state so role-based guardrail failures
        // do not leave this browser out of sync from server truth.
        const rollbackOrders = parseSnapshot(previousSnapshot);
        writeOrdersSnapshot(rollbackOrders);
        lastLocalWriteAtRef.current = 0;
        void hydrateOrdersFromServer(true);

        console.warn("[bookings][frontend] persist sync failed", {
          endpoint: ORDERS_SYNC_ENDPOINT,
          message,
        });
        toast.error(`Perubahan dibatalkan karena sinkron gagal: ${message}`);
      });
    },
    [hydrateOrdersFromServer, syncOrdersToServer],
  );

  const runAutomationsForOrder = useCallback(
    async (eventType: BookingAutomationEvent, orderId: string) => {
      if (typeof window === "undefined") return;

      const currentSnapshot =
        window.localStorage.getItem(STORAGE_KEY) ?? INITIAL_SNAPSHOT;
      const currentOrders = parseSnapshot(currentSnapshot);
      const targetOrder = currentOrders.find((item) => item.id === orderId);
      if (!targetOrder) return;

      try {
        const response = await fetch("/api/bookings/automations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            eventType,
            order: buildAutomationPayload(targetOrder),
          }),
        });

        const payload = (await response.json().catch(() => ({}))) as
          | BookingAutomationResponse
          | { error?: string; details?: string };

        if (!response.ok || !("success" in payload)) {
          const errorMessage =
            "error" in payload && payload.error
              ? payload.error
              : "Automation API failed.";
          throw new Error(errorMessage);
        }

        const summary = summarizeAutomationResult(payload);
        const nextOrders = currentOrders.map((order) => {
          if (order.id !== orderId) return order;

          return {
            ...order,
            simulations: {
              whatsappSent:
                order.simulations?.whatsappSent ||
                payload.fonnteCustomer.ok ||
                payload.fonnteProduction.ok,
              productionWhatsappSent:
                order.simulations?.productionWhatsappSent ||
                payload.fonnteProduction.ok,
              customerWhatsappSent:
                order.simulations?.customerWhatsappSent ||
                payload.fonnteCustomer.ok,
              calendarEventCreated:
                order.simulations?.calendarEventCreated || payload.calendar.ok,
              calendarEventId:
                payload.calendar.externalId ||
                order.simulations?.calendarEventId,
              calendarEventLink:
                payload.calendar.externalLink ||
                order.simulations?.calendarEventLink,
              googleSheetsSynced:
                order.simulations?.googleSheetsSynced || payload.sheets.ok,
              googleSheetsRange:
                payload.sheets.externalId ||
                order.simulations?.googleSheetsRange,
              lastAutomationMessage: summary.message,
              lastAutomationAt: new Date().toISOString(),
            },
            automationLogs: appendAutomationLog(
              order.automationLogs,
              eventType,
              summary.success,
              summary.message,
            ),
          };
        });

        persistOrders(nextOrders);
        if (summary.success) {
          toast.success(summary.message);
        } else {
          toast.warning(summary.message);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Automation run failed.";
        const nextOrders = currentOrders.map((order) => {
          if (order.id !== orderId) return order;

          return {
            ...order,
            simulations: {
              whatsappSent: order.simulations?.whatsappSent ?? false,
              productionWhatsappSent:
                order.simulations?.productionWhatsappSent ?? false,
              customerWhatsappSent:
                order.simulations?.customerWhatsappSent ?? false,
              calendarEventCreated:
                order.simulations?.calendarEventCreated ?? false,
              calendarEventId: order.simulations?.calendarEventId,
              calendarEventLink: order.simulations?.calendarEventLink,
              googleSheetsSynced:
                order.simulations?.googleSheetsSynced ?? false,
              googleSheetsRange: order.simulations?.googleSheetsRange,
              lastAutomationMessage: message,
              lastAutomationAt: new Date().toISOString(),
            },
            automationLogs: appendAutomationLog(
              order.automationLogs,
              eventType,
              false,
              message,
            ),
          };
        });
        persistOrders(nextOrders);
        toast.error(`Automasi gagal: ${message}`);
      }
    },
    [persistOrders],
  );

  const createShipmentForOrder = useCallback(
    async (orderId: string) => {
      if (typeof window === "undefined") return;
      if (processingShipmentIdsRef.current.has(orderId)) return;

      processingShipmentIdsRef.current.add(orderId);
      try {
        const currentSnapshot =
          window.localStorage.getItem(STORAGE_KEY) ?? INITIAL_SNAPSHOT;
        const currentOrders = parseSnapshot(currentSnapshot);
        const order = currentOrders.find((item) => item.id === orderId);
        if (!order || order.shipment || !order.shippingQuote) return;

        const primaryAddress =
          order.deliveryAddresses?.[0]?.addressLine ||
          order.customerAddress ||
          "";
        if (!primaryAddress) return;

        const items = (order.items ?? []).map((item) => ({
          name: `${item.productName} (${item.size})`,
          quantity: Math.max(1, Number(item.quantity) || 1),
          weightGram: estimateOperationalWeightGram(item),
          value: Math.max(
            1000,
            Math.round((item.basePrice || 0) + (item.addOnTotal || 0)),
          ),
        }));

        if (!items.length) return;

        try {
          const shippingReferenceId =
            order.shippingReferenceId ||
            generateShippingReferenceId(
              order.bookingCode || order.id,
              order.id,
            );

          if (!order.shippingReferenceId) {
            const updatedOrders = currentOrders.map((entry) =>
              entry.id === orderId
                ? {
                    ...entry,
                    shippingReferenceId,
                  }
                : entry,
            );
            persistOrders(updatedOrders);
          }

          const destinationLatitude = Number.isFinite(
            order.shippingQuote?.destinationLatitude,
          )
            ? Number(order.shippingQuote?.destinationLatitude)
            : undefined;
          const destinationLongitude = Number.isFinite(
            order.shippingQuote?.destinationLongitude,
          )
            ? Number(order.shippingQuote?.destinationLongitude)
            : undefined;

          const response = await fetch("/api/bookings/shipping/create-resi", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              orderId: order.id,
              bookingCode: order.bookingCode || order.id,
              referenceId: shippingReferenceId,
              customerName: order.customerName,
              customerPhone: order.customerPhone,
              destinationAddress: primaryAddress,
              destinationPostalCode:
                order.shippingQuote?.destinationPostalCode ||
                primaryAddress.match(/\b\d{5}\b/)?.[0],
              destinationLatitude,
              destinationLongitude,
              deliveryDate: order.deliveryDate,
              deliveryTime: order.deliverySlot,
              selectedQuote: order.shippingQuote,
              items,
              totalValue: Math.max(1000, Math.round(order.totalPrice || 0)),
            }),
          });

          const payload = (await response
            .json()
            .catch(() => ({}))) as ShippingResiResponse;

          if (!response.ok || !payload.success || !payload.shipment) {
            throw new Error(payload.error || "Gagal membuat resi otomatis.");
          }

          const latestSnapshot =
            window.localStorage.getItem(STORAGE_KEY) ?? INITIAL_SNAPSHOT;
          const latestOrders = parseSnapshot(latestSnapshot);
          const nextOrders = latestOrders.map((entry) => {
            if (entry.id !== orderId) return entry;
            return {
              ...entry,
              resi:
                payload.shipment?.trackingNumber ||
                entry.resi ||
                entry.bookingCode,
              shipment: payload.shipment,
            };
          });

          persistOrders(nextOrders);
          if (payload.warning) {
            toast.warning(payload.warning);
          }
          toast.success(
            `Resi otomatis dibuat: ${payload.shipment.trackingNumber}`,
          );
        } catch (error: unknown) {
          const message =
            error instanceof Error
              ? error.message
              : "Resi otomatis belum bisa dibuat.";
          toast.warning(
            `Booking tersimpan, tapi resi belum otomatis: ${message}`,
          );
        }
      } finally {
        processingShipmentIdsRef.current.delete(orderId);
      }
    },
    [persistOrders],
  );

  const runScheduledShipmentCreation = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (scheduledShipmentRunInFlightRef.current) return;

    scheduledShipmentRunInFlightRef.current = true;
    try {
      const currentSnapshot =
        window.localStorage.getItem(STORAGE_KEY) ?? INITIAL_SNAPSHOT;
      const currentOrders = parseSnapshot(currentSnapshot);
      const todayJakarta = getJakartaTodayIsoDate();

      const dueOrderIds = currentOrders
        .filter((order) => isDueForScheduledShipment(order, todayJakarta))
        .map((order) => order.id);

      for (const dueOrderId of dueOrderIds) {
        await createShipmentForOrder(dueOrderId);
      }
    } finally {
      scheduledShipmentRunInFlightRef.current = false;
    }
  }, [createShipmentForOrder]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const run = () => {
      void runScheduledShipmentCreation();
    };

    run();
    const intervalId = window.setInterval(run, 60000);
    const handleFocus = () => run();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        run();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [runScheduledShipmentCreation]);

  const addOrder = useCallback(
    async (order: NewOrderInput) => {
      const deliveryMethod = inferDeliveryMethodFromNotes(order.notes);
      if (
        !isWithinBusinessHours(
          order.deliveryDate,
          order.deliverySlot,
          undefined,
          {
            deliveryMethod,
            items: order.items,
            blockedDates,
          },
        )
      ) {
        throw new Error(
          "Selected slot is outside business hours (Mon-Sat 10:00-22:00, Sun 10:00-15:00).",
        );
      }

      const localMaxId = orders.reduce((max, item) => {
        const parsed = Number(item.id);
        return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
      }, 9300);
      const timestampId = Date.now();
      const id = String(Math.max(localMaxId + 1, timestampId));
      const sequence = getDailyBookingSequence(orders, order.deliveryDate);
      const bookingCode = generateBookingCode(
        order.customerName,
        order.customerPhone,
        order.deliveryDate,
        sequence,
      );

      const normalizedTotalPrice = normalizeMoney(order.totalPrice);
      const normalizedDpPaid = normalizeMoney(order.dpPaidAmount);
      const normalizedFinalPaid = normalizeMoney(order.finalPaidAmount);
      const normalizedTotalPaid = Math.min(
        normalizedTotalPrice,
        normalizedDpPaid + normalizedFinalPaid,
      );

      if (normalizedTotalPaid <= 0) {
        throw new Error(
          "Booking harus sudah dibayar minimal DP sebelum disimpan.",
        );
      }

      const inferredPaymentStatus = inferPaymentStatus(
        normalizedTotalPrice,
        normalizedTotalPaid,
      );

      const newOrder: BakeryOrder = {
        id,
        resi: "",
        bookingCode,
        shippingReferenceId: generateShippingReferenceId(bookingCode, id),
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        customerAddress: order.deliveryAddresses[0]?.addressLine ?? "",
        deliveryDate: order.deliveryDate,
        deliverySlot: order.deliverySlot,
        notes: order.notes,
        basePrice: order.basePrice,
        addOnTotal: order.addOnTotal,
        deliveryFee: order.deliveryFee,
        manualAdjustment: order.manualAdjustment,
        dpPaidAmount: normalizedDpPaid,
        finalPaidAmount: normalizedFinalPaid,
        totalPaidAmount: normalizedTotalPaid,
        downPaymentAmount: normalizedDpPaid,
        remainingBalance: Math.max(0, normalizedTotalPrice - normalizedTotalPaid),
        paymentTransactions: [
          ...(normalizedDpPaid > 0
            ? [
                {
                  id: `pay-${id}-dp`,
                  timestamp: new Date().toISOString(),
                  amount: normalizedDpPaid,
                  type: "DP" as const,
                  note: "Initial DP recorded on create",
                  userId: actorIdentity.userId,
                  actorName: actorIdentity.name,
                },
              ]
            : []),
          ...(normalizedFinalPaid > 0
            ? [
                {
                  id: `pay-${id}-final`,
                  timestamp: new Date().toISOString(),
                  amount: normalizedFinalPaid,
                  type: "Final" as const,
                  note: "Initial final payment recorded on create",
                  userId: actorIdentity.userId,
                  actorName: actorIdentity.name,
                },
              ]
            : []),
        ],
        items: order.items,
        deliveryAddresses: order.deliveryAddresses,
        cakeType: order.items[0]?.subcategory,
        size: order.items[0]?.size,
        addOns: order.items.flatMap((item) => item.addOns).join(", "),
        product: `${order.items.length} item(s)`,
        totalPrice: normalizedTotalPrice,
        paymentStatus: inferredPaymentStatus,
        orderStatus: "In Production",
        assignedStaffUserId: null,
        assignedStaffName: "",
        productionAssignedAt: null,
        whatsAppParsedData: order.whatsAppParsedData,
        shippingQuote: order.shippingQuote ?? null,
        shipment: null,
        automationLogs: [],
        statusHistory: [
          {
            id: `log-${id}-created`,
            status: "In Production",
            timestamp: new Date().toISOString(),
            note: "Booking dibuat dan langsung masuk produksi",
            userId: actorIdentity.userId,
            actorName: actorIdentity.name,
          },
        ],
        simulations: {
          whatsappSent: false,
          productionWhatsappSent: false,
          customerWhatsappSent: false,
          calendarEventCreated: false,
          googleSheetsSynced: false,
        },
      };
      const nextOrders = [newOrder, ...orders];

      await syncOrdersToServer(nextOrders);
      writeOrdersSnapshot(nextOrders);

      toast.success(`Booking masuk produksi: ${bookingCode}`);
      if (isScheduledShipmentOrder(newOrder)) {
        const todayJakarta = getJakartaTodayIsoDate();
        if (isDueForScheduledShipment(newOrder, todayJakarta)) {
          void createShipmentForOrder(id);
        } else {
          toast.message(
            "Order Grab/Gojek/Paxel dijadwalkan. Resi akan dibuat otomatis di hari pengiriman.",
          );
        }
      } else {
        void createShipmentForOrder(id);
      }
      void runAutomationsForOrder("order_confirmed", id);
    },
    [
      orders,
      actorIdentity,
      runAutomationsForOrder,
      createShipmentForOrder,
      syncOrdersToServer,
      blockedDates,
    ],
  );

  const updateOrderStatus = useCallback(
    async (id: string, status: OrderStatus) => {
      const requestedStatus = normalizeOrderStatus(status) as OrderStatus;
      const targetOrder = orders.find((order) => order.id === id);
      const sequence = targetOrder
        ? getDailyBookingSequence(orders, targetOrder.deliveryDate)
        : 1;
      let hasChanged = false;
      let triggeredEvent: BookingAutomationEvent | null = null;

      const nextOrders: BakeryOrder[] = orders.map((order) => {
        if (order.id !== id || order.orderStatus === requestedStatus)
          return order;
        hasChanged = true;

        let bookingCode = order.bookingCode || "";
        const resi = order.resi || "";
        let note = `Status changed to ${requestedStatus}`;

        if (requestedStatus === "In Production") {
          bookingCode =
            bookingCode ||
            generateBookingCode(
              order.customerName,
              order.customerPhone,
              order.deliveryDate,
              sequence,
            );
          note = "Order masuk produksi";

          if (
            ["Inquiry", "Quoted", "DP Paid", "Confirmed"].includes(
              order.orderStatus,
            )
          ) {
            triggeredEvent = "order_confirmed";
          }
        } else if (requestedStatus === "Completed") {
          triggeredEvent = "order_completed";
        }

        return {
          ...order,
          bookingCode,
          resi,
          orderStatus: requestedStatus,
          statusHistory: appendStatusLog(
            order.statusHistory,
            requestedStatus,
            note,
            actorIdentity,
          ),
        };
      });

      if (!hasChanged) return;
      persistOrders(nextOrders);
      if (requestedStatus === "In Production") {
        toast.success("Order masuk produksi. Menjalankan automasi...");
      } else {
        toast.message("Order status updated");
      }

      if (triggeredEvent) {
        await runAutomationsForOrder(triggeredEvent, id);
      }
    },
    [orders, persistOrders, runAutomationsForOrder, actorIdentity],
  );

  const assignOrderToStaff = useCallback(
    (id: string, staff: { userId: number; name: string }) => {
      const target = orders.find((order) => order.id === id);
      if (!target) return;
      if (target.assignedStaffUserId === staff.userId) return;
      const isTransfer =
        Boolean(target.assignedStaffUserId) &&
        target.assignedStaffUserId !== staff.userId;

      const nowIso = new Date().toISOString();
      const nextOrders = orders.map((order) => {
        if (order.id !== id) return order;
        return {
          ...order,
          assignedStaffUserId: staff.userId,
          assignedStaffName: staff.name,
          productionAssignedAt: order.productionAssignedAt || nowIso,
          statusHistory: appendStatusLog(
            order.statusHistory,
            order.orderStatus,
            `Order diambil oleh ${staff.name}`,
            actorIdentity,
          ),
        };
      });

      persistOrders(nextOrders);
      if (isTransfer) {
        toast.success("Order berhasil dipindahkan");
      } else {
        toast.success(`Order di-assign ke ${staff.name}`);
      }
    },
    [orders, persistOrders, actorIdentity],
  );

  const clearOrderAssignee = useCallback(
    (id: string) => {
      const target = orders.find((order) => order.id === id);
      if (!target || !target.assignedStaffUserId) return;

      const nextOrders = orders.map((order) => {
        if (order.id !== id) return order;
        return {
          ...order,
          assignedStaffUserId: null,
          assignedStaffName: "",
          productionAssignedAt: null,
          statusHistory: appendStatusLog(
            order.statusHistory,
            order.orderStatus,
            "Assignment staff produksi dilepas",
            actorIdentity,
          ),
        };
      });

      persistOrders(nextOrders);
      toast.message("Assignment staff dilepas");
    },
    [orders, persistOrders, actorIdentity],
  );

  const updatePaymentStatus = useCallback(
    (id: string, status: PaymentStatus) => {
      const targetOrder = orders.find((order) => order.id === id);
      const hasGojekGrabTag = targetOrder
        ? isGrabOrGojekOrder(targetOrder)
        : false;

      const nextOrders: BakeryOrder[] = orders.map((order) => {
        if (order.id !== id) return order;
        const total = normalizeMoney(order.totalPrice);
        const suggestedDp = calculateDownPayment(total);
        const previousDpPaid = normalizeMoney(order.dpPaidAmount);
        const previousFinalPaid = normalizeMoney(order.finalPaidAmount);
        let dpPaidAmount = previousDpPaid;
        let finalPaidAmount = previousFinalPaid;

        if (status === "Pending") {
          dpPaidAmount = 0;
          finalPaidAmount = 0;
        } else if (status === "DP Paid") {
          dpPaidAmount = suggestedDp;
          finalPaidAmount = 0;
        } else {
          dpPaidAmount = 0;
          finalPaidAmount = total;
        }

        const totalPaidAmount = Math.min(total, dpPaidAmount + finalPaidAmount);
        const remainingBalance = Math.max(0, total - totalPaidAmount);
        const nowIso = new Date().toISOString();
        const deltaDp = normalizeMoney(dpPaidAmount - previousDpPaid);
        const deltaFinal = normalizeMoney(finalPaidAmount - previousFinalPaid);

        const appendedTransactions: PaymentTransaction[] = [];
        if (deltaDp !== 0) {
          const direction = deltaDp > 0 ? "added" : "adjusted";
          appendedTransactions.push({
            id: `pay-${id}-dp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            timestamp: nowIso,
            amount: deltaDp,
            type: "DP",
            note: `Status set to ${status} (DP ${direction})`,
            userId: actorIdentity.userId,
            actorName: actorIdentity.name,
          });
        }

        if (deltaFinal !== 0) {
          const direction = deltaFinal > 0 ? "added" : "adjusted";
          appendedTransactions.push({
            id: `pay-${id}-final-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            timestamp: nowIso,
            amount: deltaFinal,
            type: "Final",
            note: `Status set to ${status} (Final ${direction})`,
            userId: actorIdentity.userId,
            actorName: actorIdentity.name,
          });
        }

        const existingTransactions = Array.isArray(order.paymentTransactions)
          ? order.paymentTransactions
          : [];

        return {
          ...order,
          paymentStatus: status,
          dpPaidAmount,
          finalPaidAmount,
          totalPaidAmount,
          downPaymentAmount: dpPaidAmount,
          remainingBalance,
          paymentTransactions: [
            ...existingTransactions,
            ...appendedTransactions,
          ],
        };
      });
      persistOrders(nextOrders);
      toast.message(
        hasGojekGrabTag
          ? "Payment status updated (order Grab/Gojek)"
          : "Payment status updated",
      );
    },
    [orders, persistOrders, actorIdentity],
  );

  const recordPayment = useCallback(
    (
      id: string,
      payload: {
        dpPaidAmount: number;
        finalPaidAmount: number;
        note?: string;
      },
    ) => {
      const targetOrder = orders.find((order) => order.id === id);
      const hasGojekGrabTag = targetOrder
        ? isGrabOrGojekOrder(targetOrder)
        : false;

      const nextOrders: BakeryOrder[] = orders.map((order) => {
        if (order.id !== id) return order;

        const total = normalizeMoney(order.totalPrice);
        const previousDpPaid = normalizeMoney(order.dpPaidAmount);
        const previousFinalPaid = normalizeMoney(order.finalPaidAmount);
        const nextDpPaid = normalizeMoney(payload.dpPaidAmount);
        const nextFinalPaid = normalizeMoney(payload.finalPaidAmount);
        const totalPaidAmount = Math.min(total, nextDpPaid + nextFinalPaid);
        const remainingBalance = Math.max(0, total - totalPaidAmount);
        const inferredStatus = inferPaymentStatus(total, totalPaidAmount);

        const deltaDp = normalizeMoney(nextDpPaid - previousDpPaid);
        const deltaFinal = normalizeMoney(nextFinalPaid - previousFinalPaid);
        const nowIso = new Date().toISOString();

        const appendedTransactions: PaymentTransaction[] = [];
        if (deltaDp !== 0) {
          const direction = deltaDp > 0 ? "added" : "adjusted";
          appendedTransactions.push({
            id: `pay-${id}-dp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            timestamp: new Date().toISOString(),
            amount: deltaDp,
            type: "DP",
            note: payload.note || `DP ${direction}`,
            userId: actorIdentity.userId,
            actorName: actorIdentity.name,
          });
        }

        if (deltaFinal !== 0) {
          const direction = deltaFinal > 0 ? "added" : "adjusted";
          appendedTransactions.push({
            id: `pay-${id}-final-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            timestamp: nowIso,
            amount: deltaFinal,
            type: "Final",
            note: payload.note || `Final payment ${direction}`,
            userId: actorIdentity.userId,
            actorName: actorIdentity.name,
          });
        }

        const existingTransactions = Array.isArray(order.paymentTransactions)
          ? order.paymentTransactions
          : [];

        return {
          ...order,
          paymentStatus: inferredStatus,
          dpPaidAmount: nextDpPaid,
          finalPaidAmount: nextFinalPaid,
          totalPaidAmount,
          downPaymentAmount: nextDpPaid,
          remainingBalance,
          paymentTransactions: [
            ...existingTransactions,
            ...appendedTransactions,
          ],
        };
      });

      persistOrders(nextOrders);
      toast.success(
        hasGojekGrabTag
          ? "Payment amounts recorded (order Grab/Gojek)"
          : "Payment amounts recorded",
      );
    },
    [orders, persistOrders, actorIdentity],
  );

  const updateOrderSchedule = useCallback(
    (id: string, deliveryDate: string, deliverySlot: string) => {
      const targetOrder = orders.find((order) => order.id === id);
      const deliveryMethod = inferDeliveryMethodFromNotes(targetOrder?.notes);
      if (
        !isWithinBusinessHours(deliveryDate, deliverySlot, undefined, {
          deliveryMethod,
          items: targetOrder?.items ?? [],
          blockedDates,
        })
      ) {
        toast.error(
          "Selected slot is outside business hours (Mon-Sat 10:00-22:00, Sun 10:00-15:00).",
        );
        return;
      }

      const nextOrders: BakeryOrder[] = orders.map((order) => {
        if (order.id !== id) return order;
        return {
          ...order,
          deliveryDate,
          deliverySlot,
          statusHistory: appendStatusLog(
            order.statusHistory,
            order.orderStatus,
            `Rescheduled to ${deliveryDate} ${deliverySlot}`,
            actorIdentity,
          ),
        };
      });
      persistOrders(nextOrders);
      toast.success("Order schedule updated");
      void runAutomationsForOrder("order_rescheduled", id);

      const updatedOrder = nextOrders.find((order) => order.id === id);
      if (
        updatedOrder &&
        isDueForScheduledShipment(updatedOrder, getJakartaTodayIsoDate())
      ) {
        void createShipmentForOrder(id);
      }
    },
    [
      orders,
      persistOrders,
      runAutomationsForOrder,
      actorIdentity,
      createShipmentForOrder,
      blockedDates,
    ],
  );

  const syncOrderCalendar = useCallback(
    async (id: string) => {
      await runAutomationsForOrder("order_calendar_sync", id);
    },
    [runAutomationsForOrder],
  );

  const setOrderShipment = useCallback(
    (id: string, shipment: ShippingShipment) => {
      const nextOrders: BakeryOrder[] = orders.map((order) => {
        if (order.id !== id) return order;
        return {
          ...order,
          resi: shipment.trackingNumber || order.resi || order.bookingCode,
          shipment,
        };
      });
      persistOrders(nextOrders);
      toast.success(`Resi tersimpan: ${shipment.trackingNumber}`);
    },
    [orders, persistOrders],
  );

  const getCustomerMessagePreview = useCallback(
    (id: string) => {
      const order = orders.find((item) => item.id === id);
      if (!order) return "Order not found.";

      const dpAmount =
        order.downPaymentAmount ?? calculateDownPayment(order.totalPrice ?? 0);
      const remainingBalance =
        order.paymentStatus === "Paid"
          ? 0
          : (order.remainingBalance ??
            Math.max(0, (order.totalPrice ?? 0) - dpAmount));

      return buildOrderRecapWhatsAppText({
        items: (order.items ?? []).map((item) => ({
          productName: item.productName || "-",
          unitPrice: item.basePrice,
          quantity: item.quantity,
          addOnText: formatAddOnSummary(item.addOns ?? [], item.addOnQuantities),
          subtotal: resolveItemSubtotal(item),
          orderLabel: item.productName || "-",
          detailLines: buildMessageDetailLines(order, item),
        })),
        deliveryFee: order.deliveryFee,
        manualAdjustment: order.manualAdjustment,
        totalPrice: order.totalPrice,
        downPaymentAmount: dpAmount,
        remainingBalance,
        deliveryDate: order.deliveryDate,
        bookingCode: order.bookingCode || "PENDING",
        deliveryTime: order.deliverySlot,
        shippingMethod: resolveShippingMethodLabel(order),
        recipientName: resolveRecipientName(order),
        recipientPhone: resolveRecipientPhone(order),
        fullAddress: resolveFullAddress(order),
      });
    },
    [orders],
  );

  const value = useMemo(
    () => ({
      orders,
      addOrder,
      updateOrderStatus,
      assignOrderToStaff,
      clearOrderAssignee,
      updatePaymentStatus,
      recordPayment,
      updateOrderSchedule,
      syncOrderCalendar,
      getCustomerMessagePreview,
      setOrderShipment,
    }),
    [
      orders,
      addOrder,
      updateOrderStatus,
      assignOrderToStaff,
      clearOrderAssignee,
      updatePaymentStatus,
      recordPayment,
      updateOrderSchedule,
      syncOrderCalendar,
      getCustomerMessagePreview,
      setOrderShipment,
    ],
  );

  return (
    <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>
  );
}

export function useOrders() {
  const context = useContext(OrdersContext);
  if (!context) {
    throw new Error("useOrders must be used within OrdersProvider");
  }
  return context;
}
