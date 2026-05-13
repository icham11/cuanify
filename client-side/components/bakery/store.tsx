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
  ShippingQuoteResponse,
  ShippingResiResponse,
  ShippingShipment,
} from "@/lib/bookings/shipping-types";
import {
  summarizeProductionTokensByItems,
} from "@/lib/bookings/operations";
import {
  estimateOperationalWeightGram,
  parseServiceChargeFromNotes,
  resolveShippingParcelCount,
} from "@/lib/bookings/delivery-rules";
import { invalidateApiCache } from "@/lib/api/client";
import { normalizeOrderStatus } from "@/lib/bookings/order-status";
import {
  getJakartaTodayIsoDate,
  inferScheduledProviderFromQuote,
  isDueForScheduledShipment,
  isGrabOrGojekOrder,
  isScheduledShipmentOrder,
} from "@/lib/bookings/shipping-schedule";
import { normalizeDateInput } from "@/lib/helpers/date-normalization";
import { useBakerySettings } from "@/hooks/useBakerySettings";
import { fetchAuthMe } from "@/lib/auth/auth-me-client";
import {
  distributeProductionTokens,
  getProductionStagePercentagesFromTemplates,
  normalizeProductionStageAssignments,
  PRODUCTION_STAGE_ORDER,
  resolvePrimaryProductionCategory,
  resolveProductionStageTemplatesForCategory,
  type ProductionStage,
  type ProductionStageAssignment,
} from "@/lib/bookings/production-stages";

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
  insuranceFee?: number;
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
  sales_channel?: "direct" | "tokopedia" | "shopee";
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  assignedStaffUserId?: number | null;
  assignedStaffName?: string;
  productionAssignedAt?: string | null;
  productionStages?: ProductionStageAssignment[];
  statusHistory: OrderStatusLog[];
  automationLogs?: OrderAutomationLog[];
  whatsAppParsedData?: ParsedWhatsAppOrder;
  imageUrl?: string;
  imageUrls?: string[];
  referenceImages?: ParsedWhatsAppOrder["referenceImages"];
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
  insuranceFee?: number;
  manualAdjustment: number;
  dpPaidAmount: number;
  finalPaidAmount: number;
  totalPrice: number;
  sales_channel: "direct" | "tokopedia" | "shopee";
  downPaymentAmount: number;
  remainingBalance: number;
  paymentStatus: PaymentStatus;
  whatsAppParsedData?: ParsedWhatsAppOrder;
  imageUrl?: string;
  imageUrls?: string[];
  referenceImages?: ParsedWhatsAppOrder["referenceImages"];
  shippingQuote?: ShippingQuote | null;
}

interface OrdersContextValue {
  orders: BakeryOrder[];
  addOrder: (order: NewOrderInput) => Promise<string>;
  updateOrderStatus: (id: string, status: OrderStatus) => Promise<void>;
  assignOrderToStaff: (
    id: string,
    staff: { userId: number; name: string },
  ) => void;
  assignProductionStageStaff: (
    id: string,
    stage: ProductionStageAssignment["stage"],
    staff: { userId: number; name: string } | null,
  ) => void;
  assignProductionStagesStaff: (
    id: string,
    assignments: Partial<
      Record<ProductionStage, { userId: number; name: string } | null>
    >,
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
  reloadOrdersFromServer: () => Promise<void>;
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
const LOCAL_WRITE_STALE_GUARD_MS = 2500;
const ORDERS_SYNC_DEBOUNCE_MS = 450;
const SERVER_HYDRATION_INTERVAL_MS = 10000;
const SHIPMENT_RETRY_BACKOFF_MS = 5 * 60 * 1000;
const SHIPMENT_WARNING_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * HTTP status code yang dikembalikan proxy saat role tidak punya akses.
 * Digunakan untuk membedakan "error sistem" vs "dibatasi role" agar
 * Staff tidak menerima toast warning yang tidak relevan.
 */
const ROLE_FORBIDDEN_HTTP_STATUS = 403;

/**
 * Error khusus yang dilempar saat API menolak request karena pembatasan role.
 * Berbeda dari error jaringan/server sehingga bisa di-handle secara terpisah.
 */
class RoleForbiddenError extends Error {
  constructor(message = "Akses API tidak diizinkan untuk role ini.") {
    super(message);
    this.name = "RoleForbiddenError";
  }
}

/**
 * Substring yang digunakan server saat kapasitas produksi penuh (HTTP 409).
 * Digunakan untuk mendeteksi error ini dari response tanpa parsing JSON yang berat.
 */
const CAPACITY_FULL_ERROR_SUBSTRING = "capacity full";

/**
 * Error khusus untuk "Production capacity full" dari background sync.
 * Berbeda dari error user-triggered agar tidak spam toast ke user.
 * Background sync tidak perlu menampilkan error ini — kapasitas penuh
 * adalah kondisi valid yang tidak perlu tindakan user.
 */
class CapacityFullSyncError extends Error {
  constructor(message = "Production capacity full.") {
    super(message);
    this.name = "CapacityFullSyncError";
  }
}

class OrdersSyncRequestError extends Error {
  public readonly status: number | null;
  public readonly retryable: boolean;

  constructor(
    message: string,
    options?: { status?: number | null; retryable?: boolean },
  ) {
    super(message);
    this.name = "OrdersSyncRequestError";
    this.status = options?.status ?? null;
    this.retryable = options?.retryable ?? false;
  }
}
const AUTO_REQUOTE_ERROR_KEYWORDS = [
  "courier price is not found",
  "check your origin and destination location",
  "courier price not found",
];
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

function shouldAutoRefreshQuote(errorMessage: string): boolean {
  const normalized = errorMessage.trim().toLowerCase();
  if (!normalized) return false;

  return AUTO_REQUOTE_ERROR_KEYWORDS.some((keyword) =>
    normalized.includes(keyword),
  );
}

function pickRetryQuoteForProvider(
  quotes: ShippingQuote[],
  currentQuote: ShippingQuote,
): ShippingQuote | null {
  const providerQuotes = quotes
    .filter((quote) => quote.provider === currentQuote.provider)
    .sort((left, right) => left.price - right.price);

  if (providerQuotes.length === 0) {
    return null;
  }

  const exactServiceQuote = providerQuotes.find(
    (quote) =>
      quote.courierCode === currentQuote.courierCode &&
      quote.courierServiceCode === currentQuote.courierServiceCode,
  );
  if (exactServiceQuote) {
    return exactServiceQuote;
  }

  const sameCourierQuote = providerQuotes.find(
    (quote) => quote.courierCode === currentQuote.courierCode,
  );

  return sameCourierQuote || providerQuotes[0] || null;
}

function normalizeParsedOrderTypeKey(value?: string): WhatsAppOrderType | null {
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
  return (
    (Number(item.basePrice || 0) + Number(item.addOnTotal || 0)) *
    Math.max(0, Number(item.quantity || 0))
  );
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
    .filter((entry): entry is { label: string; value: string } =>
      Boolean(entry),
    );
}

function resolveShippingMethodLabel(order: BakeryOrder): string {
  const parsedMethod = order.whatsAppParsedData?.common?.deliveryMethod?.trim();
  if (parsedMethod) return parsedMethod;

  if (
    order.shippingQuote?.provider ||
    order.shippingQuote?.courierServiceName
  ) {
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
  return (
    order.whatsAppParsedData?.common?.recipientName?.trim() ||
    order.customerName ||
    "-"
  );
}

function resolveRecipientPhone(order: BakeryOrder): string {
  return (
    order.whatsAppParsedData?.common?.recipientPhone?.trim() ||
    order.customerPhone ||
    "-"
  );
}

function resolveFullAddress(order: BakeryOrder): string {
  return (
    order.whatsAppParsedData?.common?.fullAddress?.trim() ||
    order.deliveryAddresses?.[0]?.addressLine ||
    order.customerAddress ||
    "-"
  );
}

function resolvePreferredBookingCode(order: BakeryOrder): string {
  return (
    order.whatsAppParsedData?.common?.bookingCode?.trim() ||
    order.bookingCode ||
    "PENDING"
  );
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

function buildHistoricalOrderTimestamp(
  deliveryDate: string,
  deliverySlot: string,
): string | null {
  const normalizedDate = normalizeDateInput(deliveryDate);
  if (!normalizedDate) return null;

  const slot = /^\d{2}:\d{2}$/.test(deliverySlot || "")
    ? deliverySlot
    : "10:00";
  const timestamp = new Date(`${normalizedDate}T${slot}:00+07:00`);
  if (!Number.isFinite(timestamp.getTime())) return null;
  return timestamp.toISOString();
}

function isHistoricalBackfillOrder(deliveryDate: string): boolean {
  const normalizedDate = normalizeDateInput(deliveryDate);
  if (!normalizedDate) return false;
  return normalizedDate < getJakartaTodayIsoDate();
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
  if (totalPaidAmount <= 0) return "Pending";
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
    imageUrl: order.whatsAppParsedData?.imageUrl,
    imageUrls: order.whatsAppParsedData?.uploadedImageUrls,
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
    if (!Array.isArray(parsed)) return initialOrders;
    return parsed.map((order) => ({
      ...order,
      productionStages: normalizeProductionStageAssignments({
        totalTokens: summarizeProductionTokensByItems(order.items ?? []),
        stages: order.productionStages ?? [],
      }),
    }));
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

function getLatestOrderActivityTimestamp(order: BakeryOrder): number {
  const candidates = [
    ...(order.statusHistory ?? []).map((entry) => Date.parse(entry.timestamp)),
    ...(order.paymentTransactions ?? []).map((entry) =>
      Date.parse(entry.timestamp),
    ),
    ...(order.automationLogs ?? []).map((entry) => Date.parse(entry.timestamp)),
    Date.parse(order.productionAssignedAt ?? ""),
  ];

  return candidates.reduce((latest, current) => {
    return Number.isFinite(current) ? Math.max(latest, current) : latest;
  }, 0);
}

function mergeOrdersPreferLatestLocal(
  localOrders: BakeryOrder[],
  serverOrders: BakeryOrder[],
): BakeryOrder[] {
  const localById = new Map(localOrders.map((order) => [order.id, order]));
  const mergedOrders = serverOrders.map((serverOrder) => {
    const localOrder = localById.get(serverOrder.id);
    if (!localOrder) return serverOrder;

    const localLatest = getLatestOrderActivityTimestamp(localOrder);
    const serverLatest = getLatestOrderActivityTimestamp(serverOrder);

    return localLatest > serverLatest ? localOrder : serverOrder;
  });

  const serverIds = new Set(serverOrders.map((order) => order.id));
  const localOnlyOrders = localOrders.filter((order) => !serverIds.has(order.id));

  return [...mergedOrders, ...localOnlyOrders];
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

export function OrdersProvider({
  children,
  enabled = true,
}: {
  children: React.ReactNode;
  enabled?: boolean;
}) {
  const { settings: bakerySettings } = useBakerySettings({ enabled });
  const defaultDpPercentage = bakerySettings?.defaultDpPercentage ?? 50;
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
  const syncDebounceTimerRef = useRef<number | null>(null);
  const syncQueuedOrdersRef = useRef<BakeryOrder[] | null>(null);
  const syncRollbackSnapshotRef = useRef<string | null>(null);
  const syncInFlightRef = useRef(false);
  const processingShipmentIdsRef = useRef<Set<string>>(new Set());
  const shipmentRetryBackoffUntilRef = useRef<Map<string, number>>(new Map());
  const shipmentWarningStateRef = useRef<
    Map<string, { message: string; at: number }>
  >(new Map());

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    if (!hasHydrated) {
      hasHydrated = true;
      window.dispatchEvent(new Event(STORAGE_EVENT));
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    let isMounted = true;

    const fetchActorIdentity = async () => {
      try {
        const payload = await fetchAuthMe();
        const parsedId = Number(payload?.userId);
        if (!Number.isFinite(parsedId)) return;
        if (!isMounted) return;
        setActorIdentity({
          userId: parsedId,
          name: payload?.name?.trim() || `User #${parsedId}`,
        });
      } catch {
        // Keep default actor when identity endpoint is unavailable.
      }
    };

    void fetchActorIdentity();
    return () => {
      isMounted = false;
    };
  }, [enabled]);

  const syncOrdersToServer = useCallback(async (nextOrders: BakeryOrder[]) => {
    if (typeof window === "undefined") {
      return null as OrdersSyncResponse | null;
    }

    const requestBody = {
      orders: nextOrders.map((order) => {
        const {
          insuranceFee: _insuranceFee,
          shippingQuote,
          ...safeOrder
        } = order;
        const safeShippingQuote = shippingQuote
          ? ((quoteWithInsurance) => {
              const { insuranceFee: _quoteInsuranceFee, ...quote } =
                quoteWithInsurance;
              void _quoteInsuranceFee;
              return quote;
            })(shippingQuote)
          : shippingQuote;
        void _insuranceFee;
        return { ...safeOrder, shippingQuote: safeShippingQuote };
      }),
    };
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
      throw new OrdersSyncRequestError(
        `Network error saat sinkron booking: ${message}`,
        { retryable: true },
      );
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

      // Jika server menolak karena kapasitas produksi penuh (HTTP 409),
      // lempar CapacityFullSyncError agar background sync tidak spam toast ke user.
      // Kapasitas penuh adalah kondisi valid — bukan kesalahan yang perlu dilaporkan.
      if (
        response.status === 409 &&
        message.toLowerCase().includes(CAPACITY_FULL_ERROR_SUBSTRING)
      ) {
        throw new CapacityFullSyncError(message);
      }

      throw new OrdersSyncRequestError(message, {
        status: response.status,
        retryable: response.status >= 500 || response.status === 429,
      });
    }

    invalidateApiCache(
      /\/api\/(bookings\/orders|bakery\/settings|products|businesses|sales|ingredients|debts)/,
    );

    return payload;
  }, []);

  const scheduleQueuedOrdersSync = useCallback((
    delayMs: number,
    runner: () => Promise<void>,
  ) => {
    if (typeof window === "undefined") return;
    if (syncDebounceTimerRef.current) {
      window.clearTimeout(syncDebounceTimerRef.current);
    }

    syncDebounceTimerRef.current = window.setTimeout(() => {
      syncDebounceTimerRef.current = null;
      void runner();
    }, delayMs);
  }, []);

  const fetchLatestOrdersFromServer = useCallback(async () => {
    if (!enabled) return null as BakeryOrder[] | null;
    if (typeof window === "undefined") return null as BakeryOrder[] | null;

    try {
      const response = await fetch(ORDERS_SYNC_ENDPOINT, {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        data?: { orders?: BakeryOrder[] };
      };

      if (!response.ok || !payload.success) return null;
      if (!Array.isArray(payload.data?.orders)) return [];
      return parseSnapshot(JSON.stringify(payload.data.orders));
    } catch {
      return null;
    }
  }, [enabled]);

  const hydrateOrdersFromServer = useCallback(
    async (force = false) => {
      if (!enabled) return;
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

          const mergedOrders = mergeOrdersPreferLatestLocal(
            localOrders,
            serverOrders,
          );

          if (!areOrdersSnapshotsEqual(localOrders, mergedOrders)) {
            writeOrdersSnapshot(mergedOrders);
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
    [enabled, syncOrdersToServer],
  );

  useEffect(() => {
    if (!enabled) return;
    void hydrateOrdersFromServer();
  }, [enabled, hydrateOrdersFromServer]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    const intervalId = window.setInterval(() => {
      void hydrateOrdersFromServer();
    }, SERVER_HYDRATION_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [enabled, hydrateOrdersFromServer]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    return () => {
      if (syncDebounceTimerRef.current) {
        window.clearTimeout(syncDebounceTimerRef.current);
        syncDebounceTimerRef.current = null;
      }
    };
  }, [enabled]);

  const flushQueuedOrdersSync = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (syncInFlightRef.current) return;

    const queuedOrders = syncQueuedOrdersRef.current;
    if (!queuedOrders) return;

    const rollbackSnapshot =
      syncRollbackSnapshotRef.current ??
      window.localStorage.getItem(STORAGE_KEY) ??
      INITIAL_SNAPSHOT;

    syncQueuedOrdersRef.current = null;
    syncRollbackSnapshotRef.current = null;
    syncInFlightRef.current = true;

    try {
      await syncOrdersToServer(queuedOrders);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Gagal sinkron perubahan booking ke server.";

      if (!syncQueuedOrdersRef.current) {
        if (
          error instanceof OrdersSyncRequestError &&
          error.retryable
        ) {
          syncQueuedOrdersRef.current = queuedOrders;
          syncRollbackSnapshotRef.current = rollbackSnapshot;
          scheduleQueuedOrdersSync(2_000, flushQueuedOrdersSync);
        } else {
          const rollbackOrders = parseSnapshot(rollbackSnapshot);
          writeOrdersSnapshot(rollbackOrders);
          lastLocalWriteAtRef.current = 0;
          void hydrateOrdersFromServer(true);
        }
      }

      console.warn("[bookings][frontend] persist sync failed", {
        endpoint: ORDERS_SYNC_ENDPOINT,
        message,
      });

      if (!(error instanceof CapacityFullSyncError)) {
        if (error instanceof OrdersSyncRequestError && error.retryable) {
          toast.error(
            `Sinkron server sedang gagal sementara. Input tetap disimpan lokal: ${message}`,
          );
        } else {
          toast.error(`Perubahan dibatalkan karena sinkron gagal: ${message}`);
        }
      }
    } finally {
      syncInFlightRef.current = false;

      if (syncQueuedOrdersRef.current) {
        void flushQueuedOrdersSync();
      }
    }
  }, [hydrateOrdersFromServer, scheduleQueuedOrdersSync, syncOrdersToServer]);

  const persistOrders = useCallback(
    (nextOrders: BakeryOrder[], options?: { syncToServer?: boolean }) => {
      if (typeof window === "undefined") return;
      const shouldSyncToServer = options?.syncToServer !== false;
      const previousSnapshot =
        window.localStorage.getItem(STORAGE_KEY) ?? INITIAL_SNAPSHOT;
      lastLocalWriteAtRef.current = Date.now();
      writeOrdersSnapshot(nextOrders);
      if (!shouldSyncToServer) return;
      syncQueuedOrdersRef.current = nextOrders;
      syncRollbackSnapshotRef.current = previousSnapshot;

      scheduleQueuedOrdersSync(ORDERS_SYNC_DEBOUNCE_MS, flushQueuedOrdersSync);

      /*
        console.warn("[bookings][frontend] persist sync failed", {
          endpoint: ORDERS_SYNC_ENDPOINT,
          message,
        });

        // Kapasitas produksi penuh — ini kondisi valid dari sistem, bukan error user.
        // Tidak perlu toast.error agar halaman marketplace/production tidak spam notif.
        if (error instanceof CapacityFullSyncError) {
          return;
        }

        toast.error(`Perubahan dibatalkan karena sinkron gagal: ${message}`);
      });
      */
    },
    [flushQueuedOrdersSync, scheduleQueuedOrdersSync],
  );

  const getLatestOrdersSnapshot = useCallback((): BakeryOrder[] => {
    if (typeof window === "undefined") return orders;
    const currentSnapshot =
      window.localStorage.getItem(STORAGE_KEY) ?? INITIAL_SNAPSHOT;
    return parseSnapshot(currentSnapshot);
  }, [orders]);

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

      const nowMs = Date.now();
      const retryAt = shipmentRetryBackoffUntilRef.current.get(orderId) || 0;
      if (retryAt > nowMs) return;

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
          quantity: resolveShippingParcelCount(item),
          weightGram: estimateOperationalWeightGram(item),
          value: Math.max(
            1000,
            Math.round((item.basePrice || 0) + (item.addOnTotal || 0)),
          ),
        }));

        if (!items.length) return;

        const selectedQuoteProvider = inferScheduledProviderFromQuote(
          order.shippingQuote,
        );
        if (!selectedQuoteProvider) return;
        const selectedQuote: ShippingQuote = {
          ...order.shippingQuote,
          provider: selectedQuoteProvider,
        };

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
            persistOrders(updatedOrders, { syncToServer: false });
          }

          const fallbackPostalCode =
            order.shippingQuote?.destinationPostalCode ||
            primaryAddress.match(/\b\d{5}\b/)?.[0];

          const submitCreateResi = async (
            quote: ShippingQuote,
          ): Promise<ShippingResiResponse> => {
            const destinationLatitude = Number.isFinite(
              quote.destinationLatitude,
            )
              ? Number(quote.destinationLatitude)
              : undefined;
            const destinationLongitude = Number.isFinite(
              quote.destinationLongitude,
            )
              ? Number(quote.destinationLongitude)
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
                  quote.destinationPostalCode || fallbackPostalCode,
                destinationLatitude,
                destinationLongitude,
                deliveryDate: order.deliveryDate,
                deliveryTime: order.deliverySlot,
                selectedQuote: quote,
                items,
                totalValue: Math.max(1000, Math.round(order.totalPrice || 0)),
              }),
            });

            const payload = (await response
              .json()
              .catch(() => ({}))) as ShippingResiResponse;

            // Jika server menolak karena pembatasan role (403 dari proxy),
            // lempar RoleForbiddenError agar tidak menampilkan toast warning ke Staff.
            if (response.status === ROLE_FORBIDDEN_HTTP_STATUS) {
              const forbiddenMsg =
                (payload as unknown as { error?: string }).error ??
                "Akses pembuatan resi tidak diizinkan untuk role ini.";
              throw new RoleForbiddenError(forbiddenMsg);
            }

            if (!response.ok || !payload.success || !payload.shipment) {
              throw new Error(payload.error || "Gagal membuat resi otomatis.");
            }

            return payload;
          };

          const refreshQuoteForRetry = async (
            currentQuote: ShippingQuote,
          ): Promise<ShippingQuote> => {
            const quoteResponse = await fetch("/api/bookings/shipping/quote", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                destinationAddress: primaryAddress,
                destinationPostalCode: fallbackPostalCode,
                destinationLatitude: Number.isFinite(
                  currentQuote.destinationLatitude,
                )
                  ? Number(currentQuote.destinationLatitude)
                  : undefined,
                destinationLongitude: Number.isFinite(
                  currentQuote.destinationLongitude,
                )
                  ? Number(currentQuote.destinationLongitude)
                  : undefined,
                items,
                totalValue: Math.max(1000, Math.round(order.totalPrice || 0)),
              }),
            });

            const quotePayload = (await quoteResponse
              .json()
              .catch(() => ({}))) as ShippingQuoteResponse;

            if (
              !quoteResponse.ok ||
              !quotePayload.success ||
              !quotePayload.quotes?.length
            ) {
              throw new Error(
                quotePayload.error ||
                  "Gagal memperbarui quote kurir untuk retry otomatis.",
              );
            }

            const refreshedQuotes = quotePayload.quotes.map((quote) => ({
              ...quote,
              destinationPostalCode:
                quote.destinationPostalCode ||
                quotePayload.destinationPostalCode ||
                fallbackPostalCode,
              destinationLatitude: Number.isFinite(quote.destinationLatitude)
                ? quote.destinationLatitude
                : quotePayload.destinationLatitude,
              destinationLongitude: Number.isFinite(quote.destinationLongitude)
                ? quote.destinationLongitude
                : quotePayload.destinationLongitude,
              distanceSource:
                quote.distanceSource || quotePayload.distanceSource,
              warning: quote.warning || quotePayload.warning,
            }));

            const refreshedQuote = pickRetryQuoteForProvider(
              refreshedQuotes,
              currentQuote,
            );
            if (!refreshedQuote) {
              throw new Error(
                `Auto re-quote tidak menemukan layanan ${currentQuote.provider} untuk rute ini.`,
              );
            }

            const latestSnapshot =
              window.localStorage.getItem(STORAGE_KEY) ?? INITIAL_SNAPSHOT;
            const latestOrders = parseSnapshot(latestSnapshot);
            const ordersWithRefreshedQuote = latestOrders.map((entry) =>
              entry.id === orderId
                ? {
                    ...entry,
                    shippingQuote: refreshedQuote,
                  }
                : entry,
            );
            persistOrders(ordersWithRefreshedQuote, { syncToServer: false });

            return refreshedQuote;
          };

          let payload: ShippingResiResponse;
          try {
            payload = await submitCreateResi(selectedQuote);
          } catch (firstError: unknown) {
            const firstMessage =
              firstError instanceof Error
                ? firstError.message
                : "Gagal membuat resi otomatis.";

            if (!shouldAutoRefreshQuote(firstMessage)) {
              throw firstError;
            }

            const refreshedQuote = await refreshQuoteForRetry(selectedQuote);
            payload = await submitCreateResi(refreshedQuote);
          }

          if (!payload.shipment) {
            throw new Error("Gagal membuat resi otomatis.");
          }

          const createdShipment = payload.shipment;

          const latestSnapshot =
            window.localStorage.getItem(STORAGE_KEY) ?? INITIAL_SNAPSHOT;
          const latestOrders = parseSnapshot(latestSnapshot);
          const nextOrders = latestOrders.map((entry) => {
            if (entry.id !== orderId) return entry;
            return {
              ...entry,
              resi:
                createdShipment.trackingNumber ||
                entry.resi ||
                entry.bookingCode,
              shipment: createdShipment,
            };
          });

          persistOrders(nextOrders);
          shipmentRetryBackoffUntilRef.current.delete(orderId);
          shipmentWarningStateRef.current.delete(orderId);
          if (payload.warning) {
            toast.warning(payload.warning);
          }
          toast.success(
            `Resi otomatis dibuat: ${createdShipment.trackingNumber}`,
          );
        } catch (error: unknown) {
          // Jika error karena pembatasan role (Staff tidak punya akses endpoint
          // shipping), diam saja — tidak perlu tampilkan warning ke Staff.
          // Fitur buat resi otomatis hanya relevan untuk Owner/Admin.
          if (error instanceof RoleForbiddenError) {
            return;
          }

          const message =
            error instanceof Error
              ? error.message
              : "Resi otomatis belum bisa dibuat.";

          const now = Date.now();
          shipmentRetryBackoffUntilRef.current.set(
            orderId,
            now + SHIPMENT_RETRY_BACKOFF_MS,
          );

          const previousWarning = shipmentWarningStateRef.current.get(orderId);
          const shouldShowWarning =
            !previousWarning ||
            previousWarning.message !== message ||
            now - previousWarning.at >= SHIPMENT_WARNING_COOLDOWN_MS;

          if (shouldShowWarning) {
            shipmentWarningStateRef.current.set(orderId, {
              message,
              at: now,
            });
            toast.warning(
              `Booking tersimpan, tapi resi belum otomatis: ${message}`,
            );
          }
        }
      } finally {
        processingShipmentIdsRef.current.delete(orderId);
      }
    },
    [persistOrders],
  );

  const addOrder = useCallback(
    async (order: NewOrderInput) => {
      const latestServerOrders = await fetchLatestOrdersFromServer();
      const baseOrders = latestServerOrders ?? orders;

      const localMaxId = baseOrders.reduce((max, item) => {
        const parsed = Number(item.id);
        return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
      }, 9300);
      const timestampId = Date.now();
      const id = String(Math.max(localMaxId + 1, timestampId));
      const sequence = getDailyBookingSequence(baseOrders, order.deliveryDate);
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
      const isHistoricalBackfill = isHistoricalBackfillOrder(
        order.deliveryDate,
      );
      const historicalTimestamp = isHistoricalBackfill
        ? buildHistoricalOrderTimestamp(order.deliveryDate, order.deliverySlot)
        : null;
      const eventTimestamp = historicalTimestamp || new Date().toISOString();

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
        insuranceFee:
          order.insuranceFee ?? order.shippingQuote?.insuranceFee ?? 0,
        manualAdjustment: order.manualAdjustment,
        dpPaidAmount: normalizedDpPaid,
        finalPaidAmount: normalizedFinalPaid,
        totalPaidAmount: normalizedTotalPaid,
        downPaymentAmount: normalizedDpPaid,
        remainingBalance: Math.max(
          0,
          normalizedTotalPrice - normalizedTotalPaid,
        ),
        paymentTransactions: [
          ...(normalizedDpPaid > 0
            ? [
                {
                  id: `pay-${id}-dp`,
                  timestamp: eventTimestamp,
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
                  timestamp: eventTimestamp,
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
        sales_channel: order.sales_channel,
        paymentStatus: inferredPaymentStatus,
        orderStatus: "In Production",
        assignedStaffUserId: null,
        assignedStaffName: "",
        productionAssignedAt: null,
        productionStages: [],
        whatsAppParsedData: order.whatsAppParsedData,
        imageUrl: order.imageUrl ?? order.whatsAppParsedData?.imageUrl,
        imageUrls:
          order.imageUrls ?? order.whatsAppParsedData?.uploadedImageUrls ?? [],
        referenceImages:
          order.referenceImages ?? order.whatsAppParsedData?.referenceImages,
        shippingQuote: order.shippingQuote ?? null,
        shipment: null,
        automationLogs: [],
        statusHistory: [
          {
            id: `log-${id}-created`,
            status: "In Production",
            timestamp: eventTimestamp,
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
      const nextOrders = [newOrder, ...baseOrders];

      await syncOrdersToServer([newOrder]);
      writeOrdersSnapshot(nextOrders);

      toast.success(`Booking masuk produksi: ${bookingCode}`);
      if (isHistoricalBackfill) {
        toast.message(
          "Booking backfill historis disimpan. Laporan dan kalender internal akan ikut terbarui tanpa trigger operasional baru.",
        );
        return id;
      }
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
      // WA produksi sudah dikirim saat sync ke server (/api/bookings/orders).
      // Hindari double-send dengan hanya sync kalender di sisi frontend.
      void runAutomationsForOrder("order_calendar_sync", id);
      return id;
    },
    [
      orders,
      actorIdentity,
      runAutomationsForOrder,
      createShipmentForOrder,
      syncOrdersToServer,
      fetchLatestOrdersFromServer,
    ],
  );

  const updateOrderStatus = useCallback(
    async (id: string, status: OrderStatus) => {
      const requestedStatus = normalizeOrderStatus(status) as OrderStatus;
      const latestOrders = getLatestOrdersSnapshot();
      const targetOrder = latestOrders.find((order) => order.id === id);
      const sequence = targetOrder
        ? getDailyBookingSequence(latestOrders, targetOrder.deliveryDate)
        : 1;
      let hasChanged = false;
      let triggeredEvent: BookingAutomationEvent | null = null;

      const nextOrders: BakeryOrder[] = latestOrders.map((order) => {
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
    [
      getLatestOrdersSnapshot,
      persistOrders,
      runAutomationsForOrder,
      actorIdentity,
    ],
  );

  const assignOrderToStaff = useCallback(
    (id: string, staff: { userId: number; name: string }) => {
      const latestOrders = getLatestOrdersSnapshot();
      const target = latestOrders.find((order) => order.id === id);
      if (!target) return;
      if (target.assignedStaffUserId === staff.userId) return;
      const isTransfer =
        Boolean(target.assignedStaffUserId) &&
        target.assignedStaffUserId !== staff.userId;

      const nowIso = new Date().toISOString();
      const nextOrders = latestOrders.map((order) => {
        if (order.id !== id) return order;
        const totalTokens = summarizeProductionTokensByItems(order.items ?? []);
        const stageTemplates = resolveProductionStageTemplatesForCategory({
          category: resolvePrimaryProductionCategory(order.items ?? []),
          profiles: bakerySettings?.productionStageProfiles,
        });
        const productionStages = distributeProductionTokens({
          totalTokens,
          staffByStage: {
            lining: staff.userId,
            filling: staff.userId,
            finishing: staff.userId,
          },
          percentages:
            getProductionStagePercentagesFromTemplates(stageTemplates),
        });
        return {
          ...order,
          assignedStaffUserId: staff.userId,
          assignedStaffName: staff.name,
          productionAssignedAt: order.productionAssignedAt || nowIso,
          productionStages,
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
    [
      getLatestOrdersSnapshot,
      persistOrders,
      actorIdentity,
      bakerySettings?.productionStageProfiles,
    ],
  );

  const clearOrderAssignee = useCallback(
    (id: string) => {
      const latestOrders = getLatestOrdersSnapshot();
      const target = latestOrders.find((order) => order.id === id);
      if (!target || !target.assignedStaffUserId) return;

      const nextOrders = latestOrders.map((order) => {
        if (order.id !== id) return order;
        const totalTokens = summarizeProductionTokensByItems(order.items ?? []);
        return {
          ...order,
          assignedStaffUserId: null,
          assignedStaffName: "",
          productionAssignedAt: null,
          productionStages: distributeProductionTokens({
            totalTokens,
            staffByStage: {
              lining: null,
              filling: null,
              finishing: null,
            },
            percentages: getProductionStagePercentagesFromTemplates(
              resolveProductionStageTemplatesForCategory({
                category: resolvePrimaryProductionCategory(order.items ?? []),
                profiles: bakerySettings?.productionStageProfiles,
              }),
            ),
          }),
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
    [
      getLatestOrdersSnapshot,
      persistOrders,
      actorIdentity,
      bakerySettings?.productionStageProfiles,
    ],
  );

  const assignProductionStagesStaff = useCallback(
    (
      id: string,
      assignments: Partial<
        Record<ProductionStage, { userId: number; name: string } | null>
      >,
    ) => {
      const latestOrders = getLatestOrdersSnapshot();
      const nextOrders = latestOrders.map((order) => {
        if (order.id !== id) return order;
        const totalTokens = summarizeProductionTokensByItems(order.items ?? []);
        const currentByStage = new Map(
          (order.productionStages ?? []).map((entry) => [entry.stage, entry]),
        );
        const staffByStage = PRODUCTION_STAGE_ORDER.reduce(
          (acc, stageKey) => {
            if (Object.prototype.hasOwnProperty.call(assignments, stageKey)) {
              acc[stageKey] = assignments[stageKey]?.userId ?? null;
              return acc;
            }

            acc[stageKey] = currentByStage.get(stageKey)?.staffId ?? null;
            return acc;
          },
          {} as Record<ProductionStage, number | null>,
        );
        const productionStages = distributeProductionTokens({
          totalTokens,
          staffByStage,
          percentages: getProductionStagePercentagesFromTemplates(
            resolveProductionStageTemplatesForCategory({
              category: resolvePrimaryProductionCategory(order.items ?? []),
              profiles: bakerySettings?.productionStageProfiles,
            }),
          ),
        });
        const uniqueAssignees = [
          ...new Set(
            productionStages
              .map((entry) => Number(entry.staffId || 0))
              .filter((staffId) => Number.isInteger(staffId) && staffId > 0),
          ),
        ];
        const nextAssignedStaffUserId =
          uniqueAssignees.length === 1 ? uniqueAssignees[0] : null;
        // Determine staff name: prefer new staff, fallback to existing, handle multi-stage assignments
        let nextAssignedStaffName = "";
        if (nextAssignedStaffUserId !== null) {
          const assignedStaffFromPayload = Object.values(assignments).find(
            (entry) => entry?.userId === nextAssignedStaffUserId,
          );
          if (assignedStaffFromPayload) {
            nextAssignedStaffName = assignedStaffFromPayload.name;
          } else if (
            order.assignedStaffUserId === nextAssignedStaffUserId &&
            order.assignedStaffName
          ) {
            // Keep existing name if single assignee hasn't changed
            nextAssignedStaffName = order.assignedStaffName;
          } else {
            // For multi-stage or mixed assignments, use fallback
            nextAssignedStaffName = `Staff #${nextAssignedStaffUserId}`;
          }
        }
        const hasAnyStageAssignment = uniqueAssignees.length > 0;

        return {
          ...order,
          assignedStaffUserId: nextAssignedStaffUserId,
          assignedStaffName: nextAssignedStaffName,
          productionAssignedAt: hasAnyStageAssignment
            ? order.productionAssignedAt || new Date().toISOString()
            : null,
          productionStages,
        };
      });

      persistOrders(nextOrders);
      toast.success("Assignment proses berhasil diperbarui");
    },
    [
      getLatestOrdersSnapshot,
      persistOrders,
      bakerySettings?.productionStageProfiles,
    ],
  );

  const assignProductionStageStaff = useCallback(
    (
      id: string,
      stage: ProductionStageAssignment["stage"],
      staff: { userId: number; name: string } | null,
    ) => {
      assignProductionStagesStaff(id, { [stage]: staff });
    },
    [assignProductionStagesStaff],
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
        const suggestedDp = Math.round(total * (defaultDpPercentage / 100));
        const previousDpPaid = normalizeMoney(order.dpPaidAmount);
        const previousFinalPaid = normalizeMoney(order.finalPaidAmount);
        let dpPaidAmount = previousDpPaid;
        let finalPaidAmount = previousFinalPaid;
        const preservedDpPaid = Math.min(total, previousDpPaid);

        if (status === "Pending") {
          dpPaidAmount = 0;
          finalPaidAmount = 0;
        } else if (status === "DP Paid") {
          dpPaidAmount = Math.min(
            total,
            previousDpPaid > 0 ? previousDpPaid : suggestedDp,
          );
          finalPaidAmount = 0;
        } else {
          dpPaidAmount = preservedDpPaid;
          finalPaidAmount = Math.max(0, total - preservedDpPaid);
        }

        const totalPaidAmount = Math.min(total, dpPaidAmount + finalPaidAmount);
        const remainingBalance = Math.max(0, total - totalPaidAmount);
        const nowIso = new Date().toISOString();
        const eventTimestamp = isHistoricalBackfillOrder(order.deliveryDate)
          ? buildHistoricalOrderTimestamp(
              order.deliveryDate,
              order.deliverySlot,
            ) || nowIso
          : nowIso;
        const deltaDp = normalizeMoney(dpPaidAmount - previousDpPaid);
        const deltaFinal = normalizeMoney(finalPaidAmount - previousFinalPaid);

        const appendedTransactions: PaymentTransaction[] = [];
        if (deltaDp !== 0) {
          const direction = deltaDp > 0 ? "added" : "adjusted";
          appendedTransactions.push({
            id: `pay-${id}-dp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            timestamp: eventTimestamp,
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
            timestamp: eventTimestamp,
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
    [orders, persistOrders, actorIdentity, defaultDpPercentage],
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
        const eventTimestamp = isHistoricalBackfillOrder(order.deliveryDate)
          ? buildHistoricalOrderTimestamp(
              order.deliveryDate,
              order.deliverySlot,
            ) || nowIso
          : nowIso;

        const appendedTransactions: PaymentTransaction[] = [];
        if (deltaDp !== 0) {
          const direction = deltaDp > 0 ? "added" : "adjusted";
          appendedTransactions.push({
            id: `pay-${id}-dp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            timestamp: eventTimestamp,
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
            timestamp: eventTimestamp,
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
      shipmentRetryBackoffUntilRef.current.delete(id);
      shipmentWarningStateRef.current.delete(id);
      toast.success(`Resi tersimpan: ${shipment.trackingNumber}`);
    },
    [orders, persistOrders],
  );

  const getCustomerMessagePreview = useCallback(
    (id: string) => {
      const order = orders.find((item) => item.id === id);
      if (!order) return "Order not found.";

      const dpAmount =
        order.downPaymentAmount ??
        Math.round(
          Math.max(0, Number(order.totalPrice ?? 0)) *
            (defaultDpPercentage / 100),
        );
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
          addOnText: formatAddOnSummary(
            item.addOns ?? [],
            item.addOnQuantities,
          ),
          subtotal: resolveItemSubtotal(item),
          orderLabel: item.productName || "-",
          detailLines: buildMessageDetailLines(order, item),
        })),
        deliveryFee: order.deliveryFee,
        serviceCharge: parseServiceChargeFromNotes(order.notes),
        manualAdjustment: order.manualAdjustment,
        totalPrice: order.totalPrice,
        downPaymentAmount: dpAmount,
        remainingBalance,
        deliveryDate: order.deliveryDate,
        bookingCode: resolvePreferredBookingCode(order),
        deliveryTime: order.deliverySlot,
        shippingMethod: resolveShippingMethodLabel(order),
        recipientName: resolveRecipientName(order),
        recipientPhone: resolveRecipientPhone(order),
        fullAddress: resolveFullAddress(order),
      });
    },
    [orders, defaultDpPercentage],
  );

  const value = useMemo(
    () => ({
      orders,
      addOrder,
      updateOrderStatus,
      assignOrderToStaff,
      assignProductionStageStaff,
      assignProductionStagesStaff,
      clearOrderAssignee,
      updatePaymentStatus,
      recordPayment,
      updateOrderSchedule,
      syncOrderCalendar,
      getCustomerMessagePreview,
      setOrderShipment,
      reloadOrdersFromServer: () => hydrateOrdersFromServer(true),
    }),
    [
      orders,
      addOrder,
      updateOrderStatus,
      assignOrderToStaff,
      assignProductionStageStaff,
      assignProductionStagesStaff,
      clearOrderAssignee,
      updatePaymentStatus,
      recordPayment,
      updateOrderSchedule,
      syncOrderCalendar,
      getCustomerMessagePreview,
      setOrderShipment,
      hydrateOrdersFromServer,
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
