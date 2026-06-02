import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { AuthError, ForbiddenError, requireAuth } from "@/lib/auth/session";
import {
  isPrismaConnectionTimeout,
  prismaConnectionErrorResponse,
} from "@/lib/prisma-errors";
import { z } from "zod";
import {
  ensureCapacityTable,
  consumeToken,
  getCapacityForDate,
  releaseToken,
  DEFAULT_MAX_TOKEN,
  calculateOrderTokenFromItems,
} from "@/lib/bookings/token-capacity-service";
import { BAKERY_STAFF_DAILY_TOKEN_LIMIT } from "@/lib/bookings/config";
import {
  getCalendarStatus,
  isPastDate,
} from "@/lib/calendar/getCalendarStatus";
import { normalizeDateInput } from "@/lib/helpers/date-normalization";
import {
  getJakartaTodayIsoDate,
  resolveShippingProvider,
} from "@/lib/bookings/shipping-schedule";
import {
  sendOrderToWhatsApp,
  type SendOrderToWhatsAppResult,
  type SendOrderToWhatsAppInput,
} from "@/lib/whatsapp/sendOrderToWhatsApp";
import { syncBakeryOrderInventory } from "@/lib/bookings/inventory-sync";
import {
  detailFieldDefinitions,
  type WhatsAppOrderType,
} from "@/lib/bookings/whatsapp-parser";
import {
  getBakeryBusinessSettings,
  getCachedBakeryBusinessSettings,
  getStaffTokenLimitForUser,
} from "@/lib/bakery/settings";
import { calculateShippingInsuranceFee } from "@/lib/bookings/shipping-insurance";
import {
  resolveDeliveryMethodLabel,
  resolveOrderDeliveryMethod,
} from "@/lib/bookings/delivery-method";
import {
  buildOrderFingerprint,
  normalizeBookingReference,
} from "@/lib/bookings/order-fingerprint";
import {
  distributeProductionTokens,
  getProductionStagePercentagesFromTemplates,
  normalizeProductionStageKey,
  PRODUCTION_STAGE_ORDER,
  resolvePrimaryProductionCategory,
  resolveProductionStageTemplatesForCategory,
  type ProductionStageAssignment,
  type ProductionStage,
} from "@/lib/bookings/production-stages";
import { loadEffectiveBookingCatalog } from "@/lib/bookings/catalog-config-server";
import { flattenCatalogProductsForDashboard } from "@/lib/bookings/product-sync";
import { buildDashboardProductName } from "@/lib/products/dashboard-name";
import { calculateOrderFinancialBreakdown } from "@/lib/bookings/financial-breakdown";

// ─── Custom Error for capacity-full rejections ───────────────────────────────

class CapacityFullError extends Error {
  public readonly date: string;
  public readonly usedToken: number;
  public readonly maxToken: number;
  public readonly tokenNeeded: number;

  constructor(
    message: string,
    date: string,
    usedToken: number,
    maxToken: number,
    tokenNeeded: number,
  ) {
    super(message);
    this.name = "CapacityFullError";
    this.date = date;
    this.usedToken = usedToken;
    this.maxToken = maxToken;
    this.tokenNeeded = tokenNeeded;
  }
}

class CapacityCutoffError extends Error {
  public readonly date: string;
  public readonly cutoffHour: number;

  constructor(date: string, cutoffHour: number) {
    super(
      `Pemesanan H-1 sudah ditutup (setelah jam ${String(cutoffHour).padStart(2, "0")}:00)`,
    );
    this.name = "CapacityCutoffError";
    this.date = date;
    this.cutoffHour = cutoffHour;
  }
}

class CapacityBlockedDateError extends Error {
  public readonly date: string;

  constructor(date: string) {
    super("Hari libur owner aktif, tidak menerima order baru");
    this.name = "CapacityBlockedDateError";
    this.date = date;
  }
}

class PastDateError extends Error {
  public readonly date: string;

  constructor(date: string) {
    super("Tanggal sudah terlewat");
    this.name = "PastDateError";
    this.date = date;
  }
}

const INACTIVE_STATUSES = ["Cancelled", "Completed", "Delivery", "Delivered"];
const STAFF_DAILY_TOKEN_LIMIT = BAKERY_STAFF_DAILY_TOKEN_LIMIT;
const STAFF_DAILY_TOKEN_LIMIT_MESSAGE =
  "Token harian staff melebihi limit assignment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SNAPSHOT_SOURCE_TYPE = "bakery_orders_snapshot";

export type JsonRecord = Record<string, unknown>;

export interface NormalizedOrder {
  id: string;
  bookingCode: string;
  resi: string;
  createdAt?: string;
  updatedAt?: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  deliveryDate: string;
  deliverySlot: string;
  notes: string;
  basePrice: number;
  designAdjustmentTotal: number;
  addOnTotal: number;
  productAdjustment: number;
  nonProductAdjustment: number;
  productSubtotal: number;
  productDiscountAmount: number;
  serviceCharge: number;
  deliveryFee: number;
  manualAdjustment: number;
  dpPaidAmount: number;
  finalPaidAmount: number;
  totalPaidAmount: number;
  downPaymentAmount: number;
  remainingBalance: number;
  product: string;
  totalPrice: number;
  insuranceFee: number;
  sales_channel: string;
  paymentStatus: string;
  orderStatus: string;
  assignedStaffUserId: number | null;
  assignedStaffName: string;
  productionAssignedAt: string | null;
  shippingQuote: unknown;
  shipment: unknown;
  simulations: unknown;
  whatsAppParsedData: unknown;
  imageUrl?: string;
  imageUrls?: string[];
  referenceImages?: Array<{
    url: string;
    label?: string;
    note?: string;
    orderIndex?: number;
  }>;
  statusHistory: JsonRecord[];
  automationLogs: JsonRecord[];
  paymentTransactions: JsonRecord[];
  productionStages: ProductionStageAssignment[];
  items: JsonRecord[];
  deliveryAddresses: JsonRecord[];
}

export interface DbOrderRow {
  order_uuid: string | null;
  external_id: string;
  booking_code: string | null;
  resi: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  delivery_date: string | null;
  delivery_slot: string | null;
  notes: string | null;
  base_price: unknown;
  design_adjustment_total: unknown;
  add_on_total: unknown;
  product_adjustment: unknown;
  non_product_adjustment: unknown;
  product_subtotal: unknown;
  product_discount_amount: unknown;
  service_charge: unknown;
  delivery_fee: unknown;
  manual_adjustment: unknown;
  dp_paid_amount: unknown;
  final_paid_amount: unknown;
  total_paid_amount: unknown;
  down_payment_amount: unknown;
  remaining_balance: unknown;
  product: string | null;
  total_price: unknown;
  insurance_fee: unknown;
  sales_channel: string | null;
  payment_status: string | null;
  order_status: string | null;
  assigned_staff_user_id: number | null;
  assigned_staff_name: string | null;
  production_assigned_at: unknown;
  shipping_quote: unknown;
  shipment: unknown;
  simulations: unknown;
  whatsapp_parsed_data: unknown;
  status_history: unknown;
  automation_logs: unknown;
  payment_transactions: unknown;
  created_at: Date;
  updated_at: Date;
}

export interface DbItemRow {
  order_external_id: string;
  item_index: number;
  payload: unknown;
}

export interface DbAddressRow {
  order_external_id: string;
  address_index: number;
  payload: unknown;
}

export interface DbProductionStageRow {
  order_id: string;
  stage: ProductionStage;
  staff_id: string | null;
  token_amount: unknown;
}

type BookingCourierFilter = "" | "grab-gojek" | "paxel";
type BookingOrderSourceFilter = "" | "customer" | "admin";

function parseBookingCourierFilter(
  value: string | null,
): BookingCourierFilter | null {
  if (value === null) return "";
  if (value === "" || value === "grab-gojek" || value === "paxel") {
    return value;
  }
  return null;
}

function parseBookingOrderSourceFilter(
  value: string | null,
): BookingOrderSourceFilter | null {
  if (value === null) return "";
  if (value === "" || value === "customer" || value === "admin") {
    return value;
  }
  return null;
}

function resolveBookingOrderSource(order: {
  notes?: string | null;
  shippingQuote?: unknown;
}): BookingOrderSourceFilter | "" {
  const shippingQuote = order.shippingQuote as
    | {
        provider?: string | null;
        courierCode?: string | null;
        courierServiceCode?: string | null;
        courierServiceName?: string | null;
      }
    | null
    | undefined;
  const deliveryMethod = resolveOrderDeliveryMethod({
    notes: order.notes,
    shippingQuote,
  });

  if (!deliveryMethod || deliveryMethod === "PICKUP") return "";
  if (deliveryMethod === "CUSTOMER_APP_COURIER") return "customer";
  if (
    deliveryMethod.startsWith("ASSISTED_") ||
    deliveryMethod === "REGULAR_JNE_JNT"
  ) {
    return "admin";
  }

  return "";
}

function matchesBookingCourierFilter(
  order: {
    notes?: string | null;
    shippingQuote?: unknown;
  },
  courierFilter: BookingCourierFilter,
): boolean {
  if (!courierFilter) return true;
  const provider = resolveShippingProvider({
    notes: order.notes,
    shippingQuote: order.shippingQuote as
      | {
          provider?: string | null;
          courierCode?: string | null;
          courierServiceCode?: string | null;
          courierServiceName?: string | null;
        }
      | null
      | undefined,
  });
  if (courierFilter === "grab-gojek") {
    return provider === "GRAB" || provider === "GOJEK";
  }
  return provider === "PAXEL";
}

function matchesBookingOrderSourceFilter(
  order: {
    notes?: string | null;
    shippingQuote?: unknown;
  },
  orderSourceFilter: BookingOrderSourceFilter,
): boolean {
  if (!orderSourceFilter) return true;
  return resolveBookingOrderSource(order) === orderSourceFilter;
}

interface ExistingAssignmentState {
  external_id: string;
  order_status: string | null;
  assigned_staff_user_id: number | null;
}

interface StaffValidationOrder {
  id: string;
  orderStatus: string;
  assignedStaffUserId: number | null;
  deliveryDate: string;
  productionStages?: ProductionStageAssignment[];
  items: JsonRecord[];
}

type AssignableStaffTargetOrder = Pick<
  StaffValidationOrder,
  "id" | "assignedStaffUserId" | "productionStages"
>;

type SnapshotSource = "rows" | "snapshot-fallback" | "snapshot-newer-than-rows";
type SnapshotStore = Pick<typeof prisma, "businessDocument">;
let bakeryTablesEnsuredPromise: Promise<void> | null = null;

const normalizedOrderSchema = z.object({
  id: z.string().trim().min(1, "id is required"),
  bookingCode: z.string(),
  resi: z.string(),
  createdAt: z.string().optional().catch(""),
  updatedAt: z.string().optional().catch(""),
  customerName: z.string(),
  customerPhone: z.string(),
  customerAddress: z.string(),
  deliveryDate: z.string(),
  deliverySlot: z.string(),
  notes: z.string(),
  basePrice: z.number().finite().min(0, "basePrice must be >= 0"),
  designAdjustmentTotal: z
    .number()
    .finite()
    .min(0, "designAdjustmentTotal must be >= 0"),
  addOnTotal: z.number().finite().min(0, "addOnTotal must be >= 0"),
  productAdjustment: z.number().finite(),
  nonProductAdjustment: z.number().finite(),
  productSubtotal: z.number().finite().min(0, "productSubtotal must be >= 0"),
  productDiscountAmount: z
    .number()
    .finite()
    .min(0, "productDiscountAmount must be >= 0"),
  serviceCharge: z.number().finite().min(0, "serviceCharge must be >= 0"),
  deliveryFee: z.number().finite().min(0, "deliveryFee must be >= 0"),
  manualAdjustment: z.number().finite(),
  dpPaidAmount: z.number().finite().min(0, "dpPaidAmount must be >= 0"),
  finalPaidAmount: z.number().finite().min(0, "finalPaidAmount must be >= 0"),
  totalPaidAmount: z.number().finite().min(0, "totalPaidAmount must be >= 0"),
  downPaymentAmount: z
    .number()
    .finite()
    .min(0, "downPaymentAmount must be >= 0"),
  remainingBalance: z.number().finite().min(0, "remainingBalance must be >= 0"),
  product: z.string(),
  totalPrice: z.number().finite().min(0, "totalPrice must be >= 0"),
  sales_channel: z.enum(["direct", "tokopedia", "shopee"]),
  paymentStatus: z.string().trim().min(1, "paymentStatus is required"),
  orderStatus: z.string().trim().min(1, "orderStatus is required"),
  assignedStaffUserId: z.number().int().positive().nullable(),
  assignedStaffName: z.string(),
  productionAssignedAt: z.string().nullable(),
  shippingQuote: z.unknown().nullable(),
  shipment: z.unknown().nullable(),
  simulations: z.unknown().nullable(),
  whatsAppParsedData: z.unknown().nullable(),
  imageUrl: z.string().optional().catch(""),
  imageUrls: z.array(z.string()).optional().catch([]),
  referenceImages: z
    .array(
      z.object({
        url: z.string(),
        label: z.string().optional(),
        note: z.string().optional(),
        orderIndex: z.number().optional(),
      }),
    )
    .optional()
    .catch([]),
  statusHistory: z.array(z.record(z.string(), z.unknown())),
  automationLogs: z.array(z.record(z.string(), z.unknown())),
  paymentTransactions: z.array(z.record(z.string(), z.unknown())),
  productionStages: z.array(
    z.object({
      stage: z.enum(PRODUCTION_STAGE_ORDER),
      staffId: z.number().int().positive().nullable(),
      tokenAmount: z.number().finite().min(0),
      percentage: z.number().finite().min(0).max(100),
    }),
  ),
  items: z.array(z.record(z.string(), z.unknown())),
  deliveryAddresses: z.array(z.record(z.string(), z.unknown())),
});

type ParsedOrderInput = z.infer<typeof normalizedOrderSchema>;
type ParsedOrder = ParsedOrderInput & { insuranceFee: number };

function formatValidationIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "root";
    return `${path}: ${issue.message}`;
  });
}

function parseOrdersContent(content: string | null | undefined): unknown[] {
  if (!content) return [];
  try {
    const parsed = JSON.parse(content) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function snapshotMatchesRowOrders(
  snapshotOrders: unknown[],
  rowOrders: Array<{ id: string }>,
): boolean {
  if (snapshotOrders.length !== rowOrders.length) {
    return false;
  }

  const snapshotIds = new Set(
    snapshotOrders
      .map((entry) => asRecord(entry))
      .filter((entry): entry is JsonRecord => Boolean(entry))
      .map((entry) => asString(entry.id).trim())
      .filter(Boolean),
  );

  if (snapshotIds.size !== rowOrders.length) {
    return false;
  }

  return rowOrders.every((order) => snapshotIds.has(order.id));
}

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }
  return false;
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveOrderFinancialFields(input: {
  basePrice?: unknown;
  designAdjustmentTotal?: unknown;
  addOnTotal?: unknown;
  productAdjustment?: unknown;
  nonProductAdjustment?: unknown;
  productSubtotal?: unknown;
  productDiscountAmount?: unknown;
  serviceCharge?: unknown;
  deliveryFee?: unknown;
  insuranceFee?: unknown;
  totalPrice?: unknown;
  manualAdjustment?: unknown;
  notes?: unknown;
}) {
  return calculateOrderFinancialBreakdown({
    basePrice: asNumber(input.basePrice),
    designAdjustmentTotal: asNumber(input.designAdjustmentTotal),
    addOnTotal: asNumber(input.addOnTotal),
    productAdjustment: asNumber(input.productAdjustment),
    nonProductAdjustment:
      input.nonProductAdjustment === undefined || input.nonProductAdjustment === null
        ? undefined
        : asNumber(input.nonProductAdjustment),
    productSubtotal:
      input.productSubtotal === undefined || input.productSubtotal === null
        ? undefined
        : asNumber(input.productSubtotal),
    productDiscountAmount:
      input.productDiscountAmount === undefined ||
      input.productDiscountAmount === null
        ? undefined
        : asNumber(input.productDiscountAmount),
    serviceCharge:
      input.serviceCharge === undefined || input.serviceCharge === null
        ? undefined
        : asNumber(input.serviceCharge),
    deliveryFee: asNumber(input.deliveryFee),
    insuranceFee: asNumber(input.insuranceFee),
    totalPrice: asNumber(input.totalPrice),
    legacyManualAdjustment: asNumber(input.manualAdjustment),
    notes: asString(input.notes),
  });
}

function asPositiveIntOrNull(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function normalizeSalesChannel(
  value: unknown,
): "direct" | "tokopedia" | "shopee" {
  const normalized = asString(value).trim().toLowerCase();
  if (normalized === "tokopedia" || normalized === "shopee") return normalized;
  return "direct";
}

function normalizeIncomingSalesChannel(value: unknown): string {
  return asString(value).trim().toLowerCase();
}

function normalizeProductTokenLookupKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function getProductTokenLookupKeys(item: {
  productName?: unknown;
  size?: unknown;
}): string[] {
  const productName = asString(item.productName).trim();
  const size = asString(item.size).trim();
  if (!productName) return [];

  const variants = new Set<string>();
  variants.add(productName);
  if (size) {
    variants.add(`${productName} - ${size}`);
  }
  variants.add(
    buildDashboardProductName({
      productName,
      variantLabel: size,
      variantCount: 1,
    }),
  );

  return [...variants]
    .map((value) => normalizeProductTokenLookupKey(value))
    .filter(Boolean);
}

async function loadOrderProductTokenLookup(
  businessId: number, // ID bisnis UMKM yang terikat
): Promise<Map<string, number>> { // Mengembalikan peta nama produk ke nilai token kapasitas
  const lookup = new Map<string, number>(); // Inisialisasi Map kosong untuk pencarian token

  try { // Mulai blok penanganan kesalahan kueri database
    // Ambil data produk secara sequential dari database untuk menghindari race condition pool koneksi
    const products = await prisma.product.findMany({
      where: {
        businessId, // Filter berdasarkan ID bisnis aktif
        deletedAt: null, // Hanya ambil produk yang belum dihapus secara soft-delete
      },
      select: {
        name: true, // Ambil properti nama produk
        productionToken: true, // Ambil properti kapasitas token produksi harian
      },
    });

    // Iterasi daftar produk untuk dimasukkan ke Map pencarian token
    for (const product of products) {
      // Ambil nilai token produksi, pastikan minimal bernilai 0
      const token = Math.max(0, Number(product.productionToken || 0));
      // Jika token tidak bernilai positif, lewati produk ini
      if (token <= 0) continue;
      // Normalisasi nama produk sebagai kunci pencarian di Map
      lookup.set(normalizeProductTokenLookupKey(product.name), token);
    }
  } catch (dbError) { // Tangkap kesalahan jika kueri database gagal
    // Cetak log peringatan agar dev mengetahui adanya kegagalan kueri produk db
    console.warn(`[loadOrderProductTokenLookup] DB query failed, using catalog fallback:`, dbError);
  }

  try { // Mulai blok penanganan kesalahan untuk loading booking catalog
    // Muat konfigurasi catalog produk efektif secara sequential (tidak paralel)
    const effectiveCatalog = await loadEffectiveBookingCatalog(businessId);

    // Iterasi produk katalog yang sudah di-flatten untuk melengkapi Map pencarian token
    for (const item of flattenCatalogProductsForDashboard(
      effectiveCatalog.productCatalog, // Gunakan product catalog dari konfigurasi efektif
    )) {
      // Ambil nilai token produksi dari item catalog, pastikan minimal bernilai 0
      const token = Math.max(0, Number(item.productionToken || 0));
      // Jika token tidak bernilai positif, lewati item ini
      if (token <= 0) continue;
      // Normalisasi nama produk sebagai kunci pencarian
      const key = normalizeProductTokenLookupKey(item.name);
      // Jika Map belum memiliki kunci tersebut, tambahkan nilainya
      if (!lookup.has(key)) {
        lookup.set(key, token);
      }
    }
  } catch (catalogError) { // Tangkap kesalahan jika pemuatan catalog gagal
    // Cetak log peringatan agar kegagalan catalog dapat dianalisis di terminal
    console.warn(`[loadOrderProductTokenLookup] Catalog config load failed:`, catalogError);
  }

  // Kembalikan Map hasil pencarian token yang berhasil di-resolve
  return lookup;
}

function hydrateOrderItemWithProductToken<T extends JsonRecord>(
  item: T,
  productTokenLookup: Map<string, number>,
): T {
  const currentCustomToken = asNumber(item.customTokenPerUnit);
  if (currentCustomToken > 0 || productTokenLookup.size === 0) {
    return item;
  }

  for (const key of getProductTokenLookupKeys(item)) {
    const token = productTokenLookup.get(key);
    if (token && token > 0) {
      return {
        ...item,
        customTokenPerUnit: token,
      };
    }
  }

  return item;
}

function hydrateOrderItemsWithProductTokens<T extends JsonRecord>(
  items: T[],
  productTokenLookup: Map<string, number>,
): T[] {
  return items.map((item) =>
    hydrateOrderItemWithProductToken(item, productTokenLookup),
  );
}

function hydrateSnapshotOrdersWithProductTokens(
  orders: unknown[],
  productTokenLookup: Map<string, number>,
): unknown[] {
  return orders.map((entry) => {
    const record = asRecord(entry);
    if (!record) return entry;

    return {
      ...record,
      items: hydrateOrderItemsWithProductTokens(
        asArrayOfRecords(record.items),
        productTokenLookup,
      ),
    };
  });
}

function resolveInsuranceProvider(args: {
  shippingQuote: unknown;
  shipment: unknown;
}): string {
  const shippingQuote = asRecord(args.shippingQuote);
  const shipment = asRecord(args.shipment);

  const candidates = [
    shippingQuote?.provider,
    shippingQuote?.courierCode,
    shippingQuote?.courier,
    shipment?.provider,
    shipment?.courierCode,
    shipment?.courier,
  ];

  for (const candidate of candidates) {
    const value = asString(candidate).trim();
    if (value) return value;
  }

  return "";
}

function computeInsuranceFee(args: {
  shippingQuote: unknown;
  shipment: unknown;
  totalPrice: unknown;
}): number {
  return calculateShippingInsuranceFee({
    provider: resolveInsuranceProvider({
      shippingQuote: args.shippingQuote,
      shipment: args.shipment,
    }),
    transactionValue: Math.max(0, asNumber(args.totalPrice)),
  });
}

function deterministicUuid(input: string): string {
  const hash = crypto.createHash("md5").update(input).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

function orderTaskUuid(businessId: number, orderId: string): string {
  return deterministicUuid(`order:${businessId}:${orderId}`);
}

function productionTaskUuid(orderUuid: string, stage: ProductionStage): string {
  return deterministicUuid(`production-task:${orderUuid}:${stage}`);
}

function staffUuid(staffUserId: number | null): string | null {
  return staffUserId ? deterministicUuid(`staff:${staffUserId}`) : null;
}

function buildStaffIdByUuid(staffUserIds: number[]): Map<string, number> {
  return new Map(
    staffUserIds.map((id) => [deterministicUuid(`staff:${id}`), id]),
  );
}

function normalizeProductionStages(
  value: unknown,
): ProductionStageAssignment[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      const record = asRecord(entry);
      if (!record) return null;
      const stage = normalizeProductionStageKey(record.stage);
      if (!stage) return null;

      return {
        stage,
        staffId: asPositiveIntOrNull(record.staffId ?? record.staff_id),
        tokenAmount: asNumber(record.tokenAmount ?? record.token_amount),
        percentage: asNumber(record.percentage),
      };
    })
    .filter((entry): entry is ProductionStageAssignment => Boolean(entry));
}

function stableSerializeForComparison(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerializeForComparison(entry)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableSerializeForComparison(record[key])}`,
      )
      .join(",")}}`;
  }

  return JSON.stringify(value ?? null);
}

function haveComparableValuesChanged(current: unknown, next: unknown): boolean {
  return (
    stableSerializeForComparison(current) !== stableSerializeForComparison(next)
  );
}

function resolveParsedBookingReference(
  whatsAppParsedData: unknown,
): string {
  const parsedData = asRecord(whatsAppParsedData);
  const common = asRecord(parsedData?.common);
  const rawReference = String(common?.bookingCode ?? "").trim();
  if (!rawReference) return "";

  const normalized = normalizeBookingReference(rawReference);
  if (!normalized) return "";

  const alphanumericOnly = normalized.replace(/[^a-z0-9]/g, "");
  if (!alphanumericOnly) return "";

  const placeholderTokens = new Set([
    "booking",
    "kodebooking",
    "kodebookings",
    "bookingcode",
    "kode",
  ]);
  if (placeholderTokens.has(alphanumericOnly)) return "";

  if (!/[a-z]/i.test(rawReference) || !/\d/.test(rawReference)) {
    return "";
  }

  return normalized;
}

function buildParsedOrderFingerprint(order: {
  customerName?: unknown;
  customerPhone?: unknown;
  deliveryDate?: unknown;
  deliverySlot?: unknown;
  notes?: unknown;
  basePrice?: unknown;
  designAdjustmentTotal?: unknown;
  addOnTotal?: unknown;
  productAdjustment?: unknown;
  nonProductAdjustment?: unknown;
  productSubtotal?: unknown;
  productDiscountAmount?: unknown;
  serviceCharge?: unknown;
  deliveryFee?: unknown;
  insuranceFee?: unknown;
  manualAdjustment?: unknown;
  dpPaidAmount?: unknown;
  finalPaidAmount?: unknown;
  totalPrice?: unknown;
  sales_channel?: unknown;
  items?: unknown[];
  deliveryAddresses?: unknown[];
}): string {
  return buildOrderFingerprint({
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    deliveryDate:
      normalizeDateInput(asString(order.deliveryDate)) ??
      asString(order.deliveryDate),
    deliverySlot: order.deliverySlot,
    notes: order.notes,
    basePrice: order.basePrice,
    addOnTotal: order.addOnTotal,
    deliveryFee: order.deliveryFee,
    insuranceFee: order.insuranceFee,
    manualAdjustment: order.manualAdjustment,
    dpPaidAmount: order.dpPaidAmount,
    finalPaidAmount: order.finalPaidAmount,
    totalPrice: order.totalPrice,
    sales_channel: order.sales_channel,
    items: Array.isArray(order.items) ? order.items : [],
    deliveryAddresses: Array.isArray(order.deliveryAddresses)
      ? order.deliveryAddresses
      : [],
  });
}

function serializeProductionStagesForComparison(
  stages: ProductionStageAssignment[] | undefined,
): string {
  const normalizedByStage = new Map(
    (stages ?? []).map((stage) => [
      stage.stage,
      {
        stage: stage.stage,
        staffId: asPositiveIntOrNull(stage.staffId),
        tokenAmount: Math.max(0, asNumber(stage.tokenAmount)),
      },
    ]),
  );

  return stableSerializeForComparison(
    PRODUCTION_STAGE_ORDER.map((stageKey) => {
      const stage = normalizedByStage.get(stageKey);
      return {
        stage: stageKey,
        staffId: stage?.staffId ?? null,
        tokenAmount: stage?.tokenAmount ?? 0,
      };
    }),
  );
}

function mergeStaffClaimableProductionStages(params: {
  existingStages: ProductionStageAssignment[];
  incomingStages: ProductionStageAssignment[];
  userId: number;
  isPrivilegedRequest?: boolean;
}) {
  const {
    existingStages,
    incomingStages,
    userId,
    isPrivilegedRequest = false,
  } = params;
  const fallbackStages =
    existingStages.length > 0 ? existingStages : incomingStages;
  const incomingByStage = new Map(
    incomingStages.map((stage) => [stage.stage, stage]),
  );
  let claimedByUser = false;

  const mergedStages = fallbackStages.map((stage) => {
    const incoming = incomingByStage.get(stage.stage) ?? stage;

    const currentStaffId = asPositiveIntOrNull(stage.staffId);
    const nextStaffId = asPositiveIntOrNull(incoming.staffId);

    if (isPrivilegedRequest) {
      claimedByUser = true;
      return {
        ...incoming,
        staffId: nextStaffId,
      };
    }

    if (currentStaffId === null && nextStaffId === userId) {
      claimedByUser = true;
      return {
        ...incoming,
        staffId: userId,
      };
    }

    if (currentStaffId === userId && nextStaffId === null) {
      claimedByUser = true;
      return {
        ...incoming,
        staffId: null,
      };
    }

    return {
      ...incoming,
      staffId: currentStaffId,
    };
  });

  return {
    mergedStages,
    claimedByUser,
  };
}

function getOrderStaffTokenAssignmentsForLimit(
  order: Pick<
    StaffValidationOrder,
    | "assignedStaffUserId"
    | "deliveryDate"
    | "items"
    | "orderStatus"
    | "productionStages"
  >,
) {
  const stageAssignments = (order.productionStages ?? [])
    .filter((stage) => stage.staffId && stage.tokenAmount > 0)
    .map((stage) => ({
      staffUserId: Number(stage.staffId),
      token: Math.max(0, Math.round(Number(stage.tokenAmount) || 0)),
    }));

  if (stageAssignments.length > 0) return stageAssignments;
  if (!order.assignedStaffUserId) return [];

  return [
    {
      staffUserId: order.assignedStaffUserId,
      token: calculateOrderTokenForLimit(order),
    },
  ];
}

function collectAssignedStaffUserIds(
  order: Pick<StaffValidationOrder, "assignedStaffUserId" | "productionStages">,
): number[] {
  const assignedIds = new Set<number>();

  if (order.assignedStaffUserId) {
    assignedIds.add(order.assignedStaffUserId);
  }

  for (const stage of order.productionStages ?? []) {
    const staffId = asPositiveIntOrNull(stage.staffId);
    if (staffId) {
      assignedIds.add(staffId);
    }
  }

  return [...assignedIds].sort((left, right) => left - right);
}

function collectAssignmentTargetsBySlot(
  order: Pick<StaffValidationOrder, "assignedStaffUserId" | "productionStages">,
): Map<string, number | null> {
  const targets = new Map<string, number | null>([
    ["order", asPositiveIntOrNull(order.assignedStaffUserId)],
  ]);

  for (const stage of order.productionStages ?? []) {
    targets.set(`stage:${stage.stage}`, asPositiveIntOrNull(stage.staffId));
  }

  return targets;
}

function assignedStaffTargetsChanged(
  current: Pick<
    StaffValidationOrder,
    "assignedStaffUserId" | "productionStages"
  >,
  next: Pick<StaffValidationOrder, "assignedStaffUserId" | "productionStages">,
) {
  const currentIds = collectAssignedStaffUserIds(current);
  const nextIds = collectAssignedStaffUserIds(next);

  if (currentIds.length !== nextIds.length) return true;

  return currentIds.some(
    (staffUserId, index) => staffUserId !== nextIds[index],
  );
}

function sanitizeAssignableStaffTargets<
  T extends AssignableStaffTargetOrder,
>(params: { orders: T[]; assignableStaffUserIds: Set<number> }) {
  const { orders, assignableStaffUserIds } = params;

  return orders.map((order) => {
    const productionStages = (order.productionStages ?? []).map((stage) => {
      const staffId = asPositiveIntOrNull(stage.staffId);
      if (!staffId || assignableStaffUserIds.has(staffId)) {
        return stage;
      }

      return {
        ...stage,
        staffId: null,
      };
    });

    const uniqueStageAssignees = [
      ...new Set(
        productionStages
          .map((stage) => asPositiveIntOrNull(stage.staffId))
          .filter((staffId): staffId is number => Boolean(staffId)),
      ),
    ];
    const topLevelAssignee = asPositiveIntOrNull(order.assignedStaffUserId);
    const sanitizedAssignedStaffUserId =
      uniqueStageAssignees.length === 1
        ? uniqueStageAssignees[0]
        : topLevelAssignee && assignableStaffUserIds.has(topLevelAssignee)
          ? topLevelAssignee
          : null;

    return {
      ...order,
      assignedStaffUserId: sanitizedAssignedStaffUserId,
      productionStages,
    } as T;
  });
}

function ensureAssignableStaffTargets<
  T extends AssignableStaffTargetOrder,
>(params: {
  orders: T[];
  existingOrders?: T[];
  assignableStaffUserIds: Set<number>;
}) {
  const { orders, existingOrders = [], assignableStaffUserIds } = params;
  const existingOrdersMap = new Map<string, AssignableStaffTargetOrder>(
    existingOrders.map((order) => [order.id, order]),
  );

  for (const order of orders) {
    const existingOrder = existingOrdersMap.get(order.id);
    if (existingOrder && !assignedStaffTargetsChanged(existingOrder, order)) {
      continue;
    }

    const nextTargets = collectAssignmentTargetsBySlot(order);
    const currentTargets = existingOrder
      ? collectAssignmentTargetsBySlot(existingOrder)
      : new Map<string, number | null>();
    const invalidTargetIds = [...nextTargets.entries()]
      .filter(([, staffUserId]) => staffUserId !== null)
      .filter(([slotKey, staffUserId]) => {
        if (staffUserId === null) return false;
        if (assignableStaffUserIds.has(staffUserId)) return false;
        return currentTargets.get(slotKey) !== staffUserId;
      })
      .map(([, staffUserId]) => Number(staffUserId));
    if (invalidTargetIds.length === 0) continue;

    throw new ForbiddenError(
      "Assignment produksi hanya boleh ke role Staff. Owner, Admin, dan Cashier tidak bisa di-assign.",
    );
  }
}

function toIsoOrNull(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function asArrayOfRecords(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asRecord(entry))
    .filter((entry): entry is JsonRecord => Boolean(entry));
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => asString(entry).trim()).filter(Boolean);
}

function parseJsonField(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

const PRIORITY_IMAGE_VALUE_KEYS = [
  "croppedImageUrl",
  "croppedUrl",
  "selectedCroppedImageUrl",
  "selectedImageUrl",
];

const PRIORITY_IMAGE_LIST_KEYS = [
  "croppedImageUrls",
  "croppedUrls",
  "selectedImageUrls",
];

const IMAGE_VALUE_KEYS = [
  "imageUrl",
  "productImageUrl",
  "designImageUrl",
  "thumbnailUrl",
  "photoUrl",
  "sourceImageUrl",
];

const IMAGE_LIST_KEYS = [
  "uploadedImageUrls",
  "imageUrls",
  "referenceImageUrls",
];

const IMAGE_COLLECTION_KEYS = [
  "selectedImages",
  "croppedImages",
  "designSelections",
  "designImages",
  "referenceImages",
  "attachments",
];

const IMAGE_LABEL_KEYS = [
  "label",
  "name",
  "title",
  "characterName",
  "productName",
  "alt",
  "caption",
  "text",
];

const IMAGE_ORDER_KEYS = ["orderIndex", "slotIndex", "position", "index"];

const DESIGN_REQUEST_KEYS = [
  "bouquetDesign",
  "cakeDesign",
  "designTheme",
  "design",
  "selectedDesign",
];

function parseImageOrderIndex(value: unknown): number | undefined {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(asString(value), 10);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

function pushReferenceImage(
  target: Array<{
    url: string;
    label?: string;
    note?: string;
    orderIndex?: number;
  }>,
  url: unknown,
  options?: {
    label?: unknown;
    note?: unknown;
    orderIndex?: unknown;
  },
) {
  const parsedUrl = asString(url);
  if (!parsedUrl) return;

  const label = asString(options?.label).trim() || undefined;
  const note = asString(options?.note).trim() || undefined;
  const orderIndex = parseImageOrderIndex(options?.orderIndex);
  target.push({ url: parsedUrl, label, note, orderIndex });
}

function collectReferenceImagesFromValue(
  target: Array<{
    url: string;
    label?: string;
    note?: string;
    orderIndex?: number;
  }>,
  value: unknown,
  options?: {
    label?: unknown;
    note?: unknown;
    orderIndex?: unknown;
  },
) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectReferenceImagesFromValue(target, entry, options);
    }
    return;
  }

  const record = asRecord(value);
  if (!record) {
    pushReferenceImage(target, value, options);
    return;
  }

  const resolvedLabel =
    IMAGE_LABEL_KEYS.map((key) => record[key]).find((entry) =>
      asString(entry),
    ) ?? options?.label;
  const resolvedNote = record.note ?? options?.note;
  const resolvedOrderIndex =
    IMAGE_ORDER_KEYS.map((key) => record[key]).find((entry) =>
      Number.isFinite(parseImageOrderIndex(entry)),
    ) ?? options?.orderIndex;

  for (const key of [
    ...PRIORITY_IMAGE_VALUE_KEYS,
    ...IMAGE_VALUE_KEYS,
    "url",
    "src",
  ]) {
    pushReferenceImage(target, record[key], {
      label: resolvedLabel,
      note: resolvedNote,
      orderIndex: resolvedOrderIndex,
    });
  }

  for (const key of [...PRIORITY_IMAGE_LIST_KEYS, ...IMAGE_LIST_KEYS]) {
    collectReferenceImagesFromValue(target, record[key], {
      label: resolvedLabel,
      note: resolvedNote,
      orderIndex: resolvedOrderIndex,
    });
  }

  for (const key of IMAGE_COLLECTION_KEYS) {
    collectReferenceImagesFromValue(target, record[key], {
      label: resolvedLabel,
      note: resolvedNote,
      orderIndex: resolvedOrderIndex,
    });
  }
}

class DuplicateOrderError extends Error {
  public readonly existingOrderId: string;
  public readonly existingBookingCode: string;
  public readonly duplicateReason:
    | "same-booking"
    | "parsed-booking-reference";
  public readonly duplicateParsedBookingReference: string | null;

  constructor(args: {
    existingOrderId: string;
    existingBookingCode: string;
    duplicateReason?: "same-booking" | "parsed-booking-reference";
    duplicateParsedBookingReference?: string | null;
    message?: string;
  }) {
    super(
      args.message ||
        `Duplicate booking detected. Existing order: ${args.existingBookingCode || args.existingOrderId}.`,
    );
    this.name = "DuplicateOrderError";
    this.existingOrderId = args.existingOrderId;
    this.existingBookingCode = args.existingBookingCode;
    this.duplicateReason = args.duplicateReason ?? "same-booking";
    this.duplicateParsedBookingReference =
      args.duplicateParsedBookingReference ?? null;
  }
}

type QueuedWhatsAppNotification = {
  orderId: string;
  bookingCode: string;
  payload: SendOrderToWhatsAppInput;
};

type PersistedWhatsAppNotificationResult = SendOrderToWhatsAppResult & {
  orderId: string;
  bookingCode: string;
};

function buildWhatsAppNotificationSummary(
  result: PersistedWhatsAppNotificationResult,
): string {
  if (result.ok) {
    return "WA produksi berhasil dikirim.";
  }

  return `WA produksi gagal: ${result.message}`;
}

async function persistWhatsAppNotificationResults(params: {
  businessId: number;
  results: PersistedWhatsAppNotificationResult[];
}) {
  const { businessId, results } = params;
  if (results.length === 0) return;

  const existingRows = await prisma.$queryRaw<
    {
      external_id: string;
      simulations: unknown;
      automation_logs: unknown;
    }[]
  >`
    SELECT external_id, simulations, automation_logs
    FROM bakery_orders
    WHERE business_id = ${businessId}
      AND external_id IN (${Prisma.join(results.map((entry) => entry.orderId))})
  `;

  const existingById = new Map(
    existingRows.map((row) => [row.external_id, row]),
  );

  for (const result of results) {
    const existing = existingById.get(result.orderId);
    if (!existing) continue;

    const timestamp = new Date().toISOString();
    const summary = buildWhatsAppNotificationSummary(result);
    const currentSimulations = asRecord(existing.simulations) ?? {};
    const nextSimulations: JsonRecord = {
      ...currentSimulations,
      productionWhatsappSent: result.ok,
      lastAutomationMessage: summary,
      lastAutomationAt: timestamp,
    };
    if (result.ok) {
      nextSimulations.whatsappSent =
        asBoolean(currentSimulations.whatsappSent) || true;
    }

    const nextAutomationLogs = [
      ...asArrayOfRecords(existing.automation_logs),
      {
        id: `automation-${result.orderId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        eventType: "order_created",
        timestamp,
        success: result.ok,
        summary,
      },
    ];

    await prisma.$executeRaw`
      UPDATE bakery_orders
      SET
        simulations = ${JSON.stringify(nextSimulations)}::jsonb,
        automation_logs = ${JSON.stringify(nextAutomationLogs)}::jsonb,
        updated_at = NOW()
      WHERE business_id = ${businessId}
        AND external_id = ${result.orderId}
    `;
  }
}

function toFinancialOrderItems(value: unknown) {
  return asArrayOfRecords(value).map((item) => ({
    category: asString(item.category),
    subcategory: asString(item.subcategory),
    productName: asString(item.productName),
    size: asString(item.size),
    quantity: asNumber(item.quantity),
    basePrice: asNumber(item.basePrice),
    selectedPrice: asNumber(item.selectedPrice),
    lineTotal: asNumber(item.lineTotal),
  }));
}

function toFinancialOrderFromRecord(record: JsonRecord) {
  return {
    deliveryDate: asString(record.deliveryDate),
    product: asString(record.product),
    totalPrice: asNumber(record.totalPrice),
    totalPaidAmount: asNumber(record.totalPaidAmount),
    dpPaidAmount: asNumber(record.dpPaidAmount),
    finalPaidAmount: asNumber(record.finalPaidAmount),
    paymentStatus: asString(record.paymentStatus),
    orderStatus: asString(record.orderStatus),
    paymentTransactions: asArrayOfRecords(record.paymentTransactions).map(
      (transaction) => ({
        timestamp: asString(transaction.timestamp),
        amount: asNumber(transaction.amount),
        type: asString(transaction.type),
      }),
    ),
    createdAt: asString(record.createdAt),
    updatedAt: asString(record.updatedAt),
    items: toFinancialOrderItems(record.items),
  };
}

function dedupeReferenceImages(
  references: Array<{
    url: string;
    label?: string;
    note?: string;
    orderIndex?: number;
  }>,
) {
  const byUrl = new Map<
    string,
    { url: string; label?: string; note?: string; orderIndex?: number }
  >();

  for (const reference of references) {
    const key = reference.url.trim();
    if (!key) continue;

    const existing = byUrl.get(key);
    if (!existing) {
      byUrl.set(key, {
        url: key,
        label: reference.label?.trim() || undefined,
        note: reference.note?.trim() || undefined,
        orderIndex: reference.orderIndex,
      });
      continue;
    }

    if (!existing.label && reference.label?.trim()) {
      existing.label = reference.label.trim();
    }
    if (!existing.note && reference.note?.trim()) {
      existing.note = reference.note.trim();
    }
    if (
      existing.orderIndex === undefined &&
      reference.orderIndex !== undefined
    ) {
      existing.orderIndex = reference.orderIndex;
    }
  }

  return Array.from(byUrl.values());
}

function normalizeReferenceImages(
  value: unknown,
): Array<{ url: string; label?: string; note?: string; orderIndex?: number }> {
  return dedupeReferenceImages(
    asArrayOfRecords(value).reduce<
      Array<{ url: string; label?: string; note?: string; orderIndex?: number }>
    >((images, entry) => {
      const url = asString(entry.url).trim();
      if (!url) return images;

      images.push({
        url,
        label: asString(entry.label).trim() || undefined,
        note: asString(entry.note).trim() || undefined,
        orderIndex: parseImageOrderIndex(entry.orderIndex),
      });
      return images;
    }, []),
  );
}

function extractNotificationReferenceImages(order: NormalizedOrder) {
  const references: Array<{
    url: string;
    label?: string;
    note?: string;
    orderIndex?: number;
  }> = [];
  const parsedData = asRecord(order.whatsAppParsedData);

  pushReferenceImage(references, order.imageUrl);
  collectReferenceImagesFromValue(references, order.imageUrls);
  collectReferenceImagesFromValue(references, order.referenceImages);

  for (const key of PRIORITY_IMAGE_VALUE_KEYS) {
    pushReferenceImage(references, parsedData?.[key]);
  }
  for (const key of PRIORITY_IMAGE_LIST_KEYS) {
    collectReferenceImagesFromValue(references, parsedData?.[key]);
  }
  for (const key of IMAGE_COLLECTION_KEYS) {
    collectReferenceImagesFromValue(references, parsedData?.[key]);
  }
  for (const key of IMAGE_VALUE_KEYS) {
    pushReferenceImage(references, parsedData?.[key]);
  }
  for (const key of IMAGE_LIST_KEYS) {
    collectReferenceImagesFromValue(references, parsedData?.[key]);
  }

  for (const item of order.items) {
    for (const key of PRIORITY_IMAGE_VALUE_KEYS) {
      pushReferenceImage(references, item[key], {
        label: item.productName,
      });
    }
    for (const key of PRIORITY_IMAGE_LIST_KEYS) {
      collectReferenceImagesFromValue(references, item[key], {
        label: item.productName,
      });
    }
    for (const key of IMAGE_COLLECTION_KEYS) {
      collectReferenceImagesFromValue(references, item[key], {
        label: item.productName,
      });
    }
    for (const key of IMAGE_VALUE_KEYS) {
      pushReferenceImage(references, item[key], {
        label: item.productName,
      });
    }
    for (const key of IMAGE_LIST_KEYS) {
      collectReferenceImagesFromValue(references, item[key], {
        label: item.productName,
      });
    }
  }

  const shippingQuote = asRecord(order.shippingQuote);
  pushReferenceImage(references, shippingQuote?.imageUrl);

  const shipment = asRecord(order.shipment);
  pushReferenceImage(references, shipment?.imageUrl);

  return dedupeReferenceImages(references);
}

function resolvePersistedImageFields(order: NormalizedOrder) {
  const referenceImages = extractNotificationReferenceImages(order);
  const imageUrls = Array.from(
    new Set(
      [
        ...asStringArray(order.imageUrls),
        ...referenceImages.map((reference) => reference.url),
      ].filter((value) => value.trim().length > 0),
    ),
  );
  const imageUrl =
    asString(order.imageUrl).trim() ||
    imageUrls[0] ||
    referenceImages[0]?.url ||
    "";

  return {
    imageUrl,
    imageUrls,
    referenceImages,
  };
}
function collectProductTags(order: NormalizedOrder): string[] {
  const tags: string[] = [];
  const pushIfPresent = (value: unknown) => {
    const parsed = asString(value).trim();
    if (parsed) tags.push(parsed);
  };

  const parsedData = asRecord(order.whatsAppParsedData);
  pushIfPresent(parsedData?.orderType);
  pushIfPresent(order.product);

  for (const item of order.items) {
    pushIfPresent(item.category);
    pushIfPresent(item.subcategory);
    pushIfPresent(item.productName);
    pushIfPresent(item.size);
  }

  return Array.from(new Set(tags));
}

function inferTemplateKeyFromSignals(
  orderType: string,
  signals: string[],
): string {
  const normalizedOrderType = orderType
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const text = signals.join(" ").toLowerCase();

  if (normalizedOrderType === "cake") return "cake";
  if (normalizedOrderType === "cupcakes") return "cupcakes";
  if (normalizedOrderType === "cookies_tower") return "cookies_tower";

  if (normalizedOrderType === "cookies") {
    if (/\bbox\b/.test(text)) return "box";
    return "cookies";
  }

  if (normalizedOrderType === "buket") {
    if (/standing/.test(text)) return "buket_standing";
    return "buket_hand";
  }

  if (/cookies?\s*tower|tower/.test(text)) return "cookies_tower";
  if (/cupcakes?|cupcake/.test(text)) return "cupcakes";
  if (/standing\s*bouquet|standing/.test(text)) return "buket_standing";
  if (/buket|bouquet|hand\s*bouquet|flower/.test(text)) return "buket_hand";
  if (/\bbox\b/.test(text)) return "box";
  if (/cookies?|cookie/.test(text)) return "cookies";

  return "cake";
}

function extractRequestedImageLabels(order: NormalizedOrder): string[] {
  const parsedData = asRecord(order.whatsAppParsedData);
  const details = asRecord(parsedData?.details);
  const candidates = [
    ...asStringArray(parsedData?.requestedImageLabels),
    ...asArrayOfRecords(parsedData?.referenceImages).map((entry) =>
      asString(
        IMAGE_LABEL_KEYS.map((key) => entry[key]).find((value) =>
          Boolean(asString(value)),
        ),
      ),
    ),
    ...DESIGN_REQUEST_KEYS.map((key) => asString(details?.[key])),
    asString(order.notes),
  ]
    .filter(Boolean)
    .flatMap((entry) => entry.split(/\n|•|,|;/g))
    .map((entry) => entry.trim())
    .filter(Boolean);

  return Array.from(new Set(candidates));
}

function normalizeParsedOrderTypeKey(value: unknown): string {
  const normalized = asString(value)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (normalized === "buket_hand" || normalized === "buket_standing") {
    return "buket";
  }

  return normalized;
}

function formatTemplateDate(value: unknown): string {
  const trimmed = asString(value).trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return trimmed;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

function formatTemplateTime(value: unknown): string {
  return asString(value)
    .trim()
    .replace(/\s*wib$/i, "");
}

function getParsedCommonFields(order: NormalizedOrder): JsonRecord | null {
  const parsedData = asRecord(order.whatsAppParsedData);
  return asRecord(parsedData?.common);
}

function getParsedDetailsForTemplate(
  order: NormalizedOrder,
): JsonRecord | null {
  const parsedData = asRecord(order.whatsAppParsedData);
  const normalizedOrderType = normalizeParsedOrderTypeKey(
    parsedData?.orderType,
  );
  const detailsByOrderType = asRecord(parsedData?.detailsByOrderType);

  if (normalizedOrderType) {
    const typedDetails = asRecord(detailsByOrderType?.[normalizedOrderType]);
    if (typedDetails) return typedDetails;
  }

  return asRecord(parsedData?.details);
}

function mapProductTypeToDetailOrderType(
  productType: unknown,
): WhatsAppOrderType | null {
  const normalized = asString(productType).trim().toUpperCase();

  if (normalized === "CAKE") return "cake";
  if (normalized === "COOKIE") return "cookies";
  if (normalized === "CUPCAKE") return "cupcakes";
  if (normalized === "BOUQUET") return "buket";
  if (normalized === "TOWER") return "cookies_tower";

  return null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesDetailFieldLabel(
  line: string,
  field: { label: string; aliases?: string[] },
): boolean {
  const normalizedLine = line.trim();
  if (!normalizedLine) return false;

  const candidates = [field.label, ...(field.aliases ?? [])]
    .map((value) => value.trim())
    .filter(Boolean);

  return candidates.some((candidate) =>
    new RegExp(`^${escapeRegex(candidate)}\\s*[:=-]\\s*`, "i").test(
      normalizedLine,
    ),
  );
}

function extractDetailValueFromItemNotes(params: {
  itemNotes: string;
  field: { label: string; aliases?: string[] };
  fieldDefinitions: Array<{ label: string; aliases?: string[] }>;
}): string {
  const { itemNotes, field, fieldDefinitions } = params;
  if (!itemNotes.trim()) return "";

  const lines = itemNotes.replace(/\r\n/g, "\n").split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const currentLine = lines[index]?.trim() || "";
    if (!currentLine || !matchesDetailFieldLabel(currentLine, field)) {
      continue;
    }

    const labelCandidates = [field.label, ...(field.aliases ?? [])]
      .map((value) => value.trim())
      .filter(Boolean);
    const labelPattern = labelCandidates.map(escapeRegex).join("|");
    const firstLineValue =
      currentLine.match(
        new RegExp(`^(?:${labelPattern})\\s*[:=-]\\s*(.*)$`, "i"),
      )?.[1] ?? "";
    const collected = [firstLineValue.trim()].filter(Boolean);

    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      const nextLine = lines[nextIndex]?.trim() || "";
      if (!nextLine) {
        if (collected.length > 0) {
          collected.push("");
        }
        continue;
      }

      const isNextField = fieldDefinitions.some(
        (candidate) =>
          candidate.label !== field.label &&
          matchesDetailFieldLabel(nextLine, candidate),
      );
      if (isNextField) {
        break;
      }

      collected.push(nextLine);
    }

    return collected
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  return "";
}

function getParsedDetailsForItem(
  order: NormalizedOrder,
  item: JsonRecord,
): JsonRecord | null {
  const parsedData = asRecord(order.whatsAppParsedData);
  const detailsByOrderType = asRecord(parsedData?.detailsByOrderType);
  const detailOrderType =
    mapProductTypeToDetailOrderType(item.productType) ||
    (normalizeParsedOrderTypeKey(parsedData?.orderType) as WhatsAppOrderType);

  if (detailOrderType) {
    const typedDetails = asRecord(detailsByOrderType?.[detailOrderType]);
    if (typedDetails) return typedDetails;
  }

  return asRecord(parsedData?.details);
}

function buildCaptionItemDetailLines(
  order: NormalizedOrder,
  item: JsonRecord,
): Array<{ label: string; value: string }> {
  const detailOrderType =
    mapProductTypeToDetailOrderType(item.productType) ||
    (normalizeParsedOrderTypeKey(
      asRecord(order.whatsAppParsedData)?.orderType,
    ) as WhatsAppOrderType);
  const fieldDefinitions = detailOrderType
    ? detailFieldDefinitions[detailOrderType]
    : [];
  const parsedDetails = getParsedDetailsForItem(order, item);
  const itemNotes = asString(item.notes);

  return fieldDefinitions
    .map((field) => {
      let value = asString(parsedDetails?.[field.key]).trim();

      if (!value && itemNotes) {
        value = extractDetailValueFromItemNotes({
          itemNotes,
          field,
          fieldDefinitions,
        });
      }

      return value ? { label: field.label, value } : null;
    })
    .filter((entry): entry is { label: string; value: string } =>
      Boolean(entry),
    );
}

function formatCaptionAddOns(item: JsonRecord): string {
  const addOns = asStringArray(item.addOns);
  if (addOns.length === 0) return "";

  const quantities = asRecord(item.addOnQuantities);

  return addOns
    .map((addOn) => {
      const quantity = asPositiveIntOrNull(quantities?.[addOn]);
      if (!quantity || quantity <= 1) return addOn;
      return `${quantity}x ${addOn}`;
    })
    .join(", ");
}

function resolveCaptionItemSubtotal(item: JsonRecord): number {
  const lineTotal = asNumber(item.lineTotal);
  if (lineTotal > 0) return lineTotal;

  const basePrice = asNumber(item.selectedPrice) || asNumber(item.basePrice);
  const addOnTotal = asNumber(item.addOnTotal);
  const quantity = Math.max(0, asNumber(item.quantity) || 0);

  return (basePrice + addOnTotal) * quantity;
}

function buildCaptionItems(
  order: NormalizedOrder,
): NonNullable<SendOrderToWhatsAppInput["captionItems"]> {
  return order.items.map((rawItem, index) => {
    const item = asRecord(rawItem) ?? {};
    const rawProductName = asString(item.productName) || `Item ${index + 1}`;
    const itemSize = asString(item.size).trim();
    
    const productName = itemSize 
      ? `${rawProductName} - ${itemSize}`
      : rawProductName;

    const unitPrice = asNumber(item.selectedPrice) || asNumber(item.basePrice);
    const quantity = Math.max(0, asNumber(item.quantity) || 0);

    return {
      productName,
      unitPrice,
      quantity,
      addOnText: formatCaptionAddOns(item),
      subtotal: resolveCaptionItemSubtotal(item),
      orderLabel: productName,
      detailLines: itemSize
        ? buildCaptionItemDetailLines(order, item).filter((line) => line.label.toLowerCase().trim() !== "ukuran cake")
        : buildCaptionItemDetailLines(order, item),
    };
  });
}

function resolveShippingMethodLabel(
  order: NormalizedOrder,
  common: JsonRecord | null,
): string {
  const deliveryMethod = resolveOrderDeliveryMethod({
    parsedDeliveryMethod: asString(common?.deliveryMethod).trim(),
    notes: order.notes,
    shippingQuote: asRecord(order.shippingQuote),
  });
  if (deliveryMethod) {
    return resolveDeliveryMethodLabel(deliveryMethod);
  }

  const shippingQuote = asRecord(order.shippingQuote);
  const provider = asString(shippingQuote?.provider).trim();
  const service = asString(shippingQuote?.courierServiceName).trim();
  const label = [provider, service].filter(Boolean).join(" ").trim();

  return label;
}

function resolvePreferredBookingCode(
  order: NormalizedOrder,
  common: JsonRecord | null,
): string {
  return asString(common?.bookingCode).trim() || asString(order.bookingCode);
}

function buildTemplateFields(
  order: NormalizedOrder,
  templateKey: string,
  itemSummary: string,
): SendOrderToWhatsAppInput["templateFields"] {
  const common = getParsedCommonFields(order);
  const details = getParsedDetailsForTemplate(order);
  const dateTime = [
    formatTemplateDate(order.deliveryDate || common?.deliveryDate),
    formatTemplateTime(order.deliverySlot || common?.deliveryTime),
  ]
    .filter(Boolean)
    .join(" | ");

  const templateFields: NonNullable<
    SendOrderToWhatsAppInput["templateFields"]
  > = {
    dateTime,
    recipientName:
      asString(common?.recipientName) ||
      asString(order.customerName) ||
      "Customer",
    recipientPhone:
      asString(common?.recipientPhone) || asString(order.customerPhone),
  };

  if (templateKey === "cake") {
    templateFields.rightTop = asString(details?.cakeFlavor);
    templateFields.rightMiddle = asString(details?.cakeName);
    templateFields.rightBottom = asString(details?.cakeAge);
  } else if (templateKey === "cookies_tower") {
    templateFields.rightTop =
      asString(details?.designTheme) || asString(details?.colorTheme);
    templateFields.rightMiddle = asString(details?.towerName);
    templateFields.rightBottom = asString(details?.towerAge);
  } else if (templateKey === "cupcakes") {
    templateFields.rightTop = asString(details?.cupcakeFlavor);
    templateFields.rightMiddle =
      asString(details?.greetingCard) || asString(details?.toFromNotes);
  } else if (templateKey === "cookies") {
    templateFields.rightMiddle =
      asString(details?.toFromNotes) || asString(details?.greetingCard);
  } else if (templateKey === "box") {
    templateFields.rightTop = itemSummary || asString(order.product);
  } else if (templateKey === "buket_hand" || templateKey === "buket_standing") {
    templateFields.rightTop = asString(details?.bouquetPaperColor);
    templateFields.rightMiddle = asString(details?.flowerCount);
    templateFields.rightBottom = asString(details?.flowerColor);
  }

  return templateFields;
}

function buildTemplateSlotNotes(order: NormalizedOrder): string[] {
  const parsedData = asRecord(order.whatsAppParsedData);
  const explicitLabels = asArrayOfRecords(parsedData?.referenceImages)
    .map((entry) =>
      asString(
        IMAGE_LABEL_KEYS.map((key) => entry[key]).find((value) =>
          Boolean(asString(value)),
        ),
      ),
    )
    .map((label) => label.trim())
    .filter(Boolean);

  if (explicitLabels.length > 0) {
    return Array.from(new Set(explicitLabels));
  }

  return extractRequestedImageLabels(order)
    .map((label) => label.trim())
    .filter(Boolean);
}

function normalizeWhatsAppCaptionValue(value: unknown): string {
  return asString(value).replace(/\s+/g, " ").trim();
}

function buildWhatsAppCustomerNotes(order: NormalizedOrder): string {
  return normalizeWhatsAppCaptionValue(order.notes);
}

function buildWhatsAppDesignNotes(order: NormalizedOrder): string {
  const parsedData = asRecord(order.whatsAppParsedData);
  const details = getParsedDetailsForTemplate(order);
  const referenceNotes = [
    ...asArrayOfRecords(order.referenceImages),
    ...asArrayOfRecords(parsedData?.referenceImages),
  ]
    .map((entry) => normalizeWhatsAppCaptionValue(entry.note))
    .filter(Boolean);

  const candidates = [
    ...DESIGN_REQUEST_KEYS.map((key) =>
      normalizeWhatsAppCaptionValue(details?.[key] ?? parsedData?.[key]),
    ),
    normalizeWhatsAppCaptionValue(details?.cookieDesign),
    normalizeWhatsAppCaptionValue(details?.colorTheme),
    ...referenceNotes,
  ].filter(Boolean);

  return Array.from(new Set(candidates)).join(" | ");
}

function toWhatsAppPayload(order: NormalizedOrder): SendOrderToWhatsAppInput {
  const parsedData = asRecord(order.whatsAppParsedData);
  const itemSummary = order.items
    .map((item) => asString(item.productName))
    .filter(Boolean)
    .join(", ");

  const firstAddress = asRecord(order.deliveryAddresses[0]);
  const address =
    asString(firstAddress?.addressLine) || asString(order.customerAddress);
  const referenceImages = extractNotificationReferenceImages(order);
  const imageUrls = referenceImages.map((reference) => reference.url);
  const productTags = collectProductTags(order);
  const orderType = asString(parsedData?.orderType);
  const templateKey = inferTemplateKeyFromSignals(orderType, [
    ...productTags,
    asString(order.notes),
    itemSummary,
  ]);
  const common = getParsedCommonFields(order);
  const shippingMethod = resolveShippingMethodLabel(order, common);
  const fullAddress = asString(common?.fullAddress) || address;
  const bookingCode = resolvePreferredBookingCode(order, common);

  console.info("[api/bookings/orders] WA payload image sources", {
    orderId: order.id,
    parsedImageUrl: asString(parsedData?.imageUrl),
    topLevelImageUrl: order.imageUrl || "",
    topLevelImageCount: Array.isArray(order.imageUrls)
      ? order.imageUrls.length
      : 0,
    topLevelReferenceCount: Array.isArray(order.referenceImages)
      ? order.referenceImages.length
      : 0,
    extractedReferenceCount: referenceImages.length,
  });

  return {
    customerName: asString(order.customerName) || "Customer",
    phone: asString(order.customerPhone),
    deliveryDate: asString(order.deliveryDate),
    deliveryTime: asString(order.deliverySlot),
    item: itemSummary || asString(order.product),
    notes: asString(order.notes),
    address,
    bookingCode,
    orderType,
    templateKey,
    productTags,
    recipientName:
      asString(common?.recipientName) ||
      asString(order.customerName) ||
      "Customer",
    recipientPhone:
      asString(common?.recipientPhone) || asString(order.customerPhone),
    shippingMethod,
    fullAddress,
    deliveryFee: asNumber(order.deliveryFee),
    manualAdjustment: asNumber(
      order.nonProductAdjustment ?? order.manualAdjustment,
    ),
    totalPrice: asNumber(order.totalPrice),
    downPaymentAmount: asNumber(order.downPaymentAmount),
    remainingBalance: asNumber(order.remainingBalance),
    captionItems: buildCaptionItems(order),
    imageUrl: imageUrls[0] || "",
    imageUrls,
    referenceImages,
    requestedImageLabels: extractRequestedImageLabels(order),
    templateFields: buildTemplateFields(order, templateKey, itemSummary),
    slotNotes: buildTemplateSlotNotes(order),
    customerNotes: buildWhatsAppCustomerNotes(order),
    designNotes: buildWhatsAppDesignNotes(order),
  };
}

function extractErrorDetails(error: unknown): {
  message: string;
  name?: string;
  code?: string;
  meta?: unknown;
} {
  const message = error instanceof Error ? error.message : "Unknown error";
  const name = error instanceof Error ? error.name : undefined;
  const record = asRecord(error);
  const code = typeof record?.code === "string" ? record.code : undefined;
  const meta = record?.meta;
  return { message, name, code, meta };
}

function hasCapacityAffectingChange(
  current:
    | Pick<NormalizedOrder, "deliveryDate" | "orderStatus" | "items">
    | undefined,
  next: NormalizedOrder,
): boolean {
  if (!current) return true;

  const currentDate = current.deliveryDate || "";
  const nextDate = next.deliveryDate || "";
  if (currentDate !== nextDate) return true;

  const currentActive = !INACTIVE_STATUSES.includes(current.orderStatus || "");
  const nextActive = !INACTIVE_STATUSES.includes(next.orderStatus || "");
  if (currentActive !== nextActive) return true;

  return (
    JSON.stringify(current.items ?? []) !== JSON.stringify(next.items ?? [])
  );
}

function calculateOrderTokenForLimit(
  order: Pick<StaffValidationOrder, "items">,
): number {
  const orderItems = (order.items || []).map((item) => ({
    category: typeof item.category === "string" ? item.category : "",
    subcategory:
      typeof item.subcategory === "string" ? item.subcategory : undefined,
    productName:
      typeof item.productName === "string" ? item.productName : undefined,
    size: typeof item.size === "string" ? item.size : undefined,
    quantity: typeof item.quantity === "number" ? item.quantity : undefined,
    tokenDifficulty:
      typeof item.tokenDifficulty === "string"
        ? item.tokenDifficulty
        : undefined,
    customTokenPerUnit:
      typeof item.customTokenPerUnit === "number"
        ? item.customTokenPerUnit
        : undefined,
    cookieDifficultyBreakdown:
      typeof item.cookieDifficultyBreakdown === "string"
        ? item.cookieDifficultyBreakdown
        : undefined,
  }));

  return calculateOrderTokenFromItems(orderItems);
}

function buildStaffDailyTokenMap(
  orders: StaffValidationOrder[],
): Map<string, number> {
  const usage = new Map<string, number>();

  for (const order of orders) {
    if (!order.deliveryDate) continue;
    if (INACTIVE_STATUSES.includes(order.orderStatus || "")) continue;

    for (const assignment of getOrderStaffTokenAssignmentsForLimit(order)) {
      if (assignment.token <= 0) continue;
      const key = `${assignment.staffUserId}:${order.deliveryDate}`;
      usage.set(key, (usage.get(key) ?? 0) + assignment.token);
    }
  }

  return usage;
}

function validateAssignmentTransitionRules(params: {
  orders: StaffValidationOrder[];
  existingAssignments: ExistingAssignmentState[];
  roleName: string;
  userId: number;
  isPrivilegedRequest?: boolean;
}) {
  const {
    orders,
    existingAssignments,
    roleName,
    userId,
    isPrivilegedRequest = false,
  } = params;
  const isStaffRequest = roleName === "Staff";
  const existingAssignmentMap = new Map(
    existingAssignments.map((row) => [row.external_id, row]),
  );

  for (const order of orders) {
    const existing = existingAssignmentMap.get(order.id);
    if (!existing) continue;

    const currentStatus = existing.order_status ?? "Inquiry";
    const statusChanged = currentStatus !== order.orderStatus;
    const nextStatus = order.orderStatus ?? "";
    const currentAssignee = asPositiveIntOrNull(
      existing.assigned_staff_user_id,
    );
    const nextAssignee = order.assignedStaffUserId;
    const nextHasAssignment =
      getOrderStaffTokenAssignmentsForLimit(order).length > 0;

    if (statusChanged && !nextHasAssignment && nextStatus !== "Cancelled") {
      if (!isPrivilegedRequest) {
        throw new ForbiddenError(
          "Order must be assigned before changing status",
        );
      }
    }

    if (currentAssignee === nextAssignee) {
      continue;
    }

    if (
      currentAssignee !== null &&
      nextAssignee === null &&
      !nextHasAssignment &&
      !isPrivilegedRequest
    ) {
      throw new ForbiddenError(
        "Order yang sudah diambil tidak bisa dilepas. Gunakan transfer oleh owner/admin.",
      );
    }

    if (!isPrivilegedRequest) {
      const isStaffClaimOwnUnassignedOrder =
        isStaffRequest && currentAssignee === null && nextAssignee === userId;

      if (!isStaffClaimOwnUnassignedOrder) {
        throw new ForbiddenError(
          "Hanya owner/admin yang dapat memindahkan assignment order.",
        );
      }
    }
  }
}

function validateProjectedStaffDailyTokenLimit(params: {
  orders: StaffValidationOrder[];
  existingOrders: StaffValidationOrder[];
  limit?: number;
  limitByStaffUserId?: Map<number, number>;
}) {
  const {
    orders,
    existingOrders,
    limit = STAFF_DAILY_TOKEN_LIMIT,
    limitByStaffUserId,
  } = params;
  if (limit <= 0) return;

  const projectedStaffDailyTokenMap = buildStaffDailyTokenMap(orders);
  const existingOrdersMap = new Map(
    existingOrders.map((order) => [order.id, order]),
  );

  for (const order of orders) {
    const existing = existingOrdersMap.get(order.id);
    if (!existing) continue;

    if (!order.deliveryDate) continue;
    if (INACTIVE_STATUSES.includes(order.orderStatus || "")) continue;

    const previousAssignments = getOrderStaffTokenAssignmentsForLimit(existing);
    const previousByStaff = new Map<number, number>();
    for (const assignment of previousAssignments) {
      previousByStaff.set(
        assignment.staffUserId,
        (previousByStaff.get(assignment.staffUserId) ?? 0) + assignment.token,
      );
    }

    for (const assignment of getOrderStaffTokenAssignmentsForLimit(order)) {
      const effectiveLimit =
        limitByStaffUserId?.get(assignment.staffUserId) ?? limit;
      const staffDayKey = `${assignment.staffUserId}:${order.deliveryDate}`;
      const projectedToken = projectedStaffDailyTokenMap.get(staffDayKey) ?? 0;
      const previousTokenForStaff =
        previousByStaff.get(assignment.staffUserId) ?? 0;
      const incomingDelta = Math.max(
        0,
        assignment.token - previousTokenForStaff,
      );
      if (incomingDelta <= 0) continue;

      const tokenBeforeAssignment = Math.max(0, projectedToken - incomingDelta);

      // Allow assigning one oversized order as the first workload of the day.
      // But reject if staff already has work and new assignment would exceed limit.
      if (projectedToken > effectiveLimit) {
        // Only block if staff has previous work OR this is not their first task
        if (tokenBeforeAssignment > 0 || previousTokenForStaff > 0) {
          throw new ForbiddenError(
            `${STAFF_DAILY_TOKEN_LIMIT_MESSAGE}. Staff ${assignment.staffUserId} pada ${order.deliveryDate}: ${projectedToken}/${effectiveLimit} token.`,
          );
        }
      }
    }
  }
}

async function readOrdersSnapshot(businessId: number) {
  return prisma.businessDocument.findFirst({
    where: {
      businessId,
      sourceType: SNAPSHOT_SOURCE_TYPE,
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      content: true,
      metadata: true,
      updatedAt: true,
    },
  });
}

async function upsertOrdersSnapshot(
  db: SnapshotStore,
  params: {
    businessId: number;
    userId: number | null;
    orders: NormalizedOrder[];
    source: SnapshotSource;
    mergeWithExisting?: boolean;
  },
) {
  const { businessId, userId, orders, source, mergeWithExisting } = params;
  const existingSnapshot = await db.businessDocument.findFirst({
    where: {
      businessId,
      sourceType: SNAPSHOT_SOURCE_TYPE,
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, content: true },
  });

  let snapshotOrders = orders;
  if (mergeWithExisting && existingSnapshot?.content) {
    try {
      const parsedExisting = JSON.parse(existingSnapshot.content) as unknown;
      if (Array.isArray(parsedExisting)) {
        const mergedById = new Map<string, NormalizedOrder>();
        for (const entry of parsedExisting) {
          const normalized = normalizeOrder(entry, mergedById.size);
          if (!normalized) continue;
          mergedById.set(normalized.id, normalized);
        }
        for (const order of orders) {
          mergedById.set(order.id, order);
        }
        snapshotOrders = Array.from(mergedById.values());
      }
    } catch {
      snapshotOrders = orders;
    }
  }

  const content = JSON.stringify(snapshotOrders);
  const metadata = {
    kind: SNAPSHOT_SOURCE_TYPE,
    itemCount: snapshotOrders.length,
    updatedByUserId: userId,
    updatedAt: new Date().toISOString(),
    source,
  };

  if (existingSnapshot) {
    await db.businessDocument.update({
      where: { id: existingSnapshot.id },
      data: {
        content,
        metadata,
        sourceId: businessId,
        chunkIndex: 0,
      },
    });
    return;
  }

  await db.businessDocument.create({
    data: {
      businessId,
      sourceType: SNAPSHOT_SOURCE_TYPE,
      sourceId: businessId,
      content,
      chunkIndex: 0,
      metadata,
    },
  });
}

function extractDeliveryDateFromBookingReference(value: string) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) return "";

  const match = normalized.match(/-(\d{2})(\d{2})(\d{2})-(\d{3})$/);
  if (!match) return "";

  const [, day, month, year] = match;
  return normalizeDateInput(`20${year}-${month}-${day}`) ?? "";
}

function resolveIncomingOrderDeliveryDate(record: JsonRecord) {
  const rawDeliveryDate = asString(record.deliveryDate);
  const normalizedDeliveryDate =
    normalizeDateInput(rawDeliveryDate) ?? rawDeliveryDate.trim();
  if (normalizedDeliveryDate) {
    return normalizedDeliveryDate;
  }

  const fromBookingCode = extractDeliveryDateFromBookingReference(
    asString(record.bookingCode),
  );
  if (fromBookingCode) {
    return fromBookingCode;
  }

  const fromResi = extractDeliveryDateFromBookingReference(asString(record.resi));
  if (fromResi) {
    return fromResi;
  }

  const fromCreatedAt = normalizeDateInput(asString(record.createdAt));
  if (fromCreatedAt) {
    return fromCreatedAt;
  }

  return normalizeDateInput(asString(record.updatedAt)) ?? "";
}

function normalizeOrder(raw: unknown, index: number): NormalizedOrder | null {
  const record = asRecord(raw);
  if (!record) return null;

  const id = asString(record.id).trim() || `legacy-${index + 1}`;
  const normalizedDeliveryDate = resolveIncomingOrderDeliveryDate(record);
  const sales_channel = normalizeIncomingSalesChannel(record.sales_channel);
  const totalPrice = asNumber(record.totalPrice);
  const insuranceFee = computeInsuranceFee({
    shippingQuote: record.shippingQuote ?? null,
    shipment: record.shipment ?? null,
    totalPrice,
  });
  const financialBreakdown = resolveOrderFinancialFields({
    basePrice: record.basePrice,
    designAdjustmentTotal: record.designAdjustmentTotal,
    addOnTotal: record.addOnTotal,
    productAdjustment: record.productAdjustment,
    nonProductAdjustment: record.nonProductAdjustment,
    productSubtotal: record.productSubtotal,
    productDiscountAmount: record.productDiscountAmount,
    serviceCharge: record.serviceCharge,
    deliveryFee: record.deliveryFee,
    insuranceFee,
    manualAdjustment: record.manualAdjustment,
    notes: record.notes,
  });

  const normalizedOrder: NormalizedOrder = {
    id,
    bookingCode: asString(record.bookingCode),
    resi: asString(record.resi),
    createdAt: asString(record.createdAt),
    updatedAt: asString(record.updatedAt),
    customerName: asString(record.customerName),
    customerPhone: asString(record.customerPhone),
    customerAddress: asString(record.customerAddress),
    deliveryDate: normalizedDeliveryDate,
    deliverySlot: asString(record.deliverySlot),
    notes: asString(record.notes),
    basePrice: financialBreakdown.basePrice,
    designAdjustmentTotal: financialBreakdown.designAdjustmentTotal,
    addOnTotal: financialBreakdown.addOnTotal,
    productAdjustment: financialBreakdown.productAdjustment,
    nonProductAdjustment: financialBreakdown.nonProductAdjustment,
    productSubtotal: financialBreakdown.productSubtotal,
    productDiscountAmount: financialBreakdown.productDiscountAmount,
    serviceCharge: financialBreakdown.serviceCharge,
    deliveryFee: financialBreakdown.deliveryFee,
    manualAdjustment: financialBreakdown.nonProductAdjustment,
    dpPaidAmount: asNumber(record.dpPaidAmount),
    finalPaidAmount: asNumber(record.finalPaidAmount),
    totalPaidAmount: asNumber(record.totalPaidAmount),
    downPaymentAmount: asNumber(record.downPaymentAmount),
    remainingBalance: asNumber(record.remainingBalance),
    product: asString(record.product),
    totalPrice: financialBreakdown.totalPrice,
    insuranceFee: financialBreakdown.insuranceFee,
    sales_channel,
    paymentStatus: asString(record.paymentStatus),
    orderStatus: asString(record.orderStatus),
    assignedStaffUserId: asPositiveIntOrNull(record.assignedStaffUserId),
    assignedStaffName: asString(record.assignedStaffName),
    productionAssignedAt: toIsoOrNull(record.productionAssignedAt),
    shippingQuote: record.shippingQuote ?? null,
    shipment: record.shipment ?? null,
    simulations: record.simulations ?? null,
    whatsAppParsedData: record.whatsAppParsedData ?? null,
    imageUrl: asString(record.imageUrl).trim(),
    imageUrls: asStringArray(record.imageUrls),
    referenceImages: normalizeReferenceImages(record.referenceImages),
    statusHistory: asArrayOfRecords(record.statusHistory),
    automationLogs: asArrayOfRecords(record.automationLogs),
    paymentTransactions: asArrayOfRecords(record.paymentTransactions),
    productionStages: normalizeProductionStages(record.productionStages),
    items: asArrayOfRecords(record.items),
    deliveryAddresses: asArrayOfRecords(record.deliveryAddresses),
  };

  return {
    ...normalizedOrder,
    ...resolvePersistedImageFields(normalizedOrder),
  };
}

async function ensureBakeryTables() {
  // Allow disabling runtime DDL in environments where migrations are
  // applied ahead-of-time. This avoids long DDL runs during requests that
  // can cause connection timeouts with pooled DB proxies.
  if (process.env.SKIP_RUNTIME_DDL === "true") {
    // eslint-disable-next-line no-console
    console.log(
      "[DDL] SKIP_RUNTIME_DDL=true — skipping runtime bakery table ensures",
    );
    return;
  }

  if (bakeryTablesEnsuredPromise) {
    await bakeryTablesEnsuredPromise;
    return;
  }

  bakeryTablesEnsuredPromise = (async () => {
    await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS bakery_orders (
      id BIGSERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      external_id TEXT NOT NULL,
      booking_code TEXT,
      resi TEXT,
      customer_name TEXT,
      customer_phone TEXT,
      customer_address TEXT,
      delivery_date DATE,
      delivery_slot TEXT,
      notes TEXT,
      base_price NUMERIC(14,2) NOT NULL DEFAULT 0,
      design_adjustment_total NUMERIC(14,2) NOT NULL DEFAULT 0,
      add_on_total NUMERIC(14,2) NOT NULL DEFAULT 0,
      product_adjustment NUMERIC(14,2) NOT NULL DEFAULT 0,
      non_product_adjustment NUMERIC(14,2) NOT NULL DEFAULT 0,
      product_subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
      product_discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      service_charge NUMERIC(14,2) NOT NULL DEFAULT 0,
      delivery_fee NUMERIC(14,2) NOT NULL DEFAULT 0,
      manual_adjustment NUMERIC(14,2) NOT NULL DEFAULT 0,
      dp_paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      final_paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      total_paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      down_payment_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      remaining_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
      product TEXT,
      total_price NUMERIC(14,2) NOT NULL DEFAULT 0,
      insurance_fee NUMERIC(14,2) NOT NULL DEFAULT 0,
      sales_channel TEXT NOT NULL DEFAULT 'direct',
      deleted_at TIMESTAMPTZ,
      payment_status TEXT,
      order_status TEXT,
      shipping_quote JSONB,
      shipment JSONB,
      simulations JSONB,
      whatsapp_parsed_data JSONB,
      status_history JSONB,
      automation_logs JSONB,
      payment_transactions JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (business_id, external_id)
    );
  `);

    await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_bakery_orders_business_updated
    ON bakery_orders (business_id, updated_at DESC);
  `);

    await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_bakery_orders_business_delivery_date
    ON bakery_orders (business_id, delivery_date DESC);
  `);

    await prisma.$executeRawUnsafe(`
    DO $$ 
    BEGIN 
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='bakery_orders' AND column_name='delivery_date' AND data_type='text'
      ) THEN
        ALTER TABLE bakery_orders ALTER COLUMN delivery_date TYPE DATE USING NULLIF(BTRIM(delivery_date), '')::date;
      END IF;
    END $$;
  `);

    await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS bakery_order_items (
      id BIGSERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      order_external_id TEXT NOT NULL,
      item_index INTEGER NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

    await prisma.$executeRawUnsafe(`
    DO $$ 
    BEGIN 
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name='fk_bakery_order_items_order'
      ) THEN
        DELETE FROM bakery_order_items 
        WHERE NOT EXISTS (
          SELECT 1 FROM bakery_orders 
          WHERE bakery_orders.business_id = bakery_order_items.business_id 
            AND bakery_orders.external_id = bakery_order_items.order_external_id
        );

        ALTER TABLE bakery_order_items
        ADD CONSTRAINT fk_bakery_order_items_order
        FOREIGN KEY (business_id, order_external_id)
        REFERENCES bakery_orders(business_id, external_id)
        ON DELETE CASCADE;
      END IF;
    END $$;
  `);

    await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_bakery_order_items_lookup
    ON bakery_order_items (business_id, order_external_id, item_index);
  `);

    await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS bakery_order_addresses (
      id BIGSERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      order_external_id TEXT NOT NULL,
      address_index INTEGER NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

    await prisma.$executeRawUnsafe(`
    DO $$ 
    BEGIN 
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name='fk_bakery_order_addresses_order'
      ) THEN
        DELETE FROM bakery_order_addresses 
        WHERE NOT EXISTS (
          SELECT 1 FROM bakery_orders 
          WHERE bakery_orders.business_id = bakery_order_addresses.business_id 
            AND bakery_orders.external_id = bakery_order_addresses.order_external_id
        );

        ALTER TABLE bakery_order_addresses
        ADD CONSTRAINT fk_bakery_order_addresses_order
        FOREIGN KEY (business_id, order_external_id)
        REFERENCES bakery_orders(business_id, external_id)
        ON DELETE CASCADE;
      END IF;
    END $$;
  `);

    await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_bakery_order_addresses_lookup
    ON bakery_order_addresses (business_id, order_external_id, address_index);
  `);

    // ── Token capacity columns on bakery_orders ──
    await prisma.$executeRawUnsafe(`
    ALTER TABLE bakery_orders
    ADD COLUMN IF NOT EXISTS difficulty TEXT DEFAULT NULL;
  `);

    await prisma.$executeRawUnsafe(`
    ALTER TABLE bakery_orders
    ADD COLUMN IF NOT EXISTS token_used INTEGER NOT NULL DEFAULT 0;
  `);

    await prisma.$executeRawUnsafe(`
    ALTER TABLE bakery_orders
    ADD COLUMN IF NOT EXISTS assigned_staff_user_id INTEGER;
  `);

    await prisma.$executeRawUnsafe(`
    ALTER TABLE bakery_orders
    ADD COLUMN IF NOT EXISTS assigned_staff_name TEXT;
  `);

    await prisma.$executeRawUnsafe(`
    ALTER TABLE bakery_orders
    ADD COLUMN IF NOT EXISTS production_assigned_at TIMESTAMPTZ;
  `);

    await prisma.$executeRawUnsafe(`
    ALTER TABLE bakery_orders
    ADD COLUMN IF NOT EXISTS insurance_fee NUMERIC(14,2) NOT NULL DEFAULT 0;
  `);

    await prisma.$executeRawUnsafe(`
    ALTER TABLE bakery_orders
    ADD COLUMN IF NOT EXISTS design_adjustment_total NUMERIC(14,2) NOT NULL DEFAULT 0;
  `);

    await prisma.$executeRawUnsafe(`
    ALTER TABLE bakery_orders
    ADD COLUMN IF NOT EXISTS product_adjustment NUMERIC(14,2) NOT NULL DEFAULT 0;
  `);

    await prisma.$executeRawUnsafe(`
    ALTER TABLE bakery_orders
    ADD COLUMN IF NOT EXISTS non_product_adjustment NUMERIC(14,2) NOT NULL DEFAULT 0;
  `);

    await prisma.$executeRawUnsafe(`
    ALTER TABLE bakery_orders
    ADD COLUMN IF NOT EXISTS product_subtotal NUMERIC(14,2) NOT NULL DEFAULT 0;
  `);

    await prisma.$executeRawUnsafe(`
    ALTER TABLE bakery_orders
    ADD COLUMN IF NOT EXISTS product_discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
  `);

    await prisma.$executeRawUnsafe(`
    ALTER TABLE bakery_orders
    ADD COLUMN IF NOT EXISTS service_charge NUMERIC(14,2) NOT NULL DEFAULT 0;
  `);

    await prisma.$executeRawUnsafe(`
    ALTER TABLE bakery_orders
    ADD COLUMN IF NOT EXISTS sales_channel TEXT NOT NULL DEFAULT 'direct';
  `);

    await prisma.$executeRawUnsafe(`
    ALTER TABLE bakery_orders
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
  `);

    await prisma.$executeRawUnsafe(`
    UPDATE bakery_orders
    SET sales_channel = 'direct'
    WHERE sales_channel IS NULL
      OR sales_channel NOT IN ('direct', 'tokopedia', 'shopee');
  `);

    await prisma.$executeRawUnsafe(`
    UPDATE bakery_orders
    SET
      non_product_adjustment = COALESCE(non_product_adjustment, 0) + CASE
        WHEN COALESCE(non_product_adjustment, 0) = 0 THEN COALESCE(manual_adjustment, 0)
        ELSE 0
      END,
      product_subtotal = CASE
        WHEN COALESCE(product_subtotal, 0) > 0 THEN product_subtotal
        ELSE COALESCE(base_price, 0) + COALESCE(design_adjustment_total, 0) + COALESCE(add_on_total, 0) + COALESCE(product_adjustment, 0)
      END
    WHERE deleted_at IS NULL;
  `);

    await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'bakery_orders_sales_channel_check'
      ) THEN
        ALTER TABLE bakery_orders
          ADD CONSTRAINT bakery_orders_sales_channel_check
          CHECK (sales_channel IN ('direct', 'tokopedia', 'shopee'));
      END IF;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END
    $$;
  `);

    await prisma.$executeRawUnsafe(`
    ALTER TABLE bakery_orders
    ADD COLUMN IF NOT EXISTS order_uuid UUID;
  `);

    await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'production_stage') THEN
        IF EXISTS (
          SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'production_stage'
            AND e.enumlabel = 'listing'
        ) AND NOT EXISTS (
          SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'production_stage'
            AND e.enumlabel = 'lining'
        ) THEN
          ALTER TYPE production_stage RENAME VALUE 'listing' TO 'lining';
        ELSIF NOT EXISTS (
          SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'production_stage'
            AND e.enumlabel = 'lining'
        ) THEN
          ALTER TYPE production_stage ADD VALUE 'lining';
        END IF;
      END IF;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

    await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS production_tasks (
      id UUID PRIMARY KEY,
      order_id UUID NOT NULL,
      stage TEXT NOT NULL CHECK (stage IN ('lining', 'filling', 'finishing')),
      staff_id UUID,
      token_amount DECIMAL(10,2) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT production_tasks_order_stage_unique UNIQUE (order_id, stage)
    );
  `);

    await prisma.$executeRawUnsafe(`
    ALTER TABLE production_tasks
      DROP CONSTRAINT IF EXISTS production_tasks_stage_check;

    ALTER TABLE production_tasks
      ADD COLUMN IF NOT EXISTS "businessId" INTEGER;

    UPDATE production_tasks
    SET stage = 'lining'
    WHERE stage::text = 'listing';

    DO $$
    BEGIN
      ALTER TABLE production_tasks
        ADD CONSTRAINT production_tasks_stage_check
        CHECK (stage::text IN ('lining', 'filling', 'finishing'));
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

    await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_production_tasks_order_id
    ON production_tasks (order_id);
  `);

    await prisma.$executeRawUnsafe(`
    DELETE FROM production_tasks a
    USING production_tasks b
    WHERE a.order_id = b.order_id
      AND a.stage = b.stage
      AND a.ctid < b.ctid;

    DO $$
    DECLARE
      matching_constraint_name TEXT;
    BEGIN
      SELECT con.conname
      INTO matching_constraint_name
      FROM pg_constraint con
      WHERE con.conrelid = 'production_tasks'::regclass
        AND con.contype = 'u'
        AND con.conkey = ARRAY[
          (
            SELECT attnum
            FROM pg_attribute
            WHERE attrelid = 'production_tasks'::regclass
              AND attname = 'order_id'
          ),
          (
            SELECT attnum
            FROM pg_attribute
            WHERE attrelid = 'production_tasks'::regclass
              AND attname = 'stage'
          )
        ]::smallint[];

      IF matching_constraint_name IS NULL THEN
        ALTER TABLE production_tasks
          ADD CONSTRAINT production_tasks_order_stage_unique
          UNIQUE (order_id, stage);
      ELSIF matching_constraint_name <> 'production_tasks_order_stage_unique' THEN
        EXECUTE format(
          'ALTER TABLE production_tasks RENAME CONSTRAINT %I TO production_tasks_order_stage_unique',
          matching_constraint_name
        );
      END IF;
    EXCEPTION
      WHEN duplicate_table OR duplicate_object THEN NULL;
    END $$;
  `);

    await prisma.$executeRawUnsafe(`
    UPDATE production_tasks pt
    SET "businessId" = bo.business_id,
        staff_id = CASE
          WHEN pt.staff_id IS NULL AND bo.assigned_staff_user_id IS NOT NULL
            THEN (
              substr(md5('staff:' || bo.assigned_staff_user_id::text), 1, 8) || '-' ||
              substr(md5('staff:' || bo.assigned_staff_user_id::text), 9, 4) || '-' ||
              substr(md5('staff:' || bo.assigned_staff_user_id::text), 13, 4) || '-' ||
              substr(md5('staff:' || bo.assigned_staff_user_id::text), 17, 4) || '-' ||
              substr(md5('staff:' || bo.assigned_staff_user_id::text), 21, 12)
            )::uuid
          ELSE pt.staff_id
        END
    FROM bakery_orders bo
    WHERE bo.order_uuid = pt.order_id
      AND (pt."businessId" IS NULL OR (pt.staff_id IS NULL AND bo.assigned_staff_user_id IS NOT NULL));
  `);

    // ── Ensure production_capacity table exists ──
    await ensureCapacityTable();
  })();

  try {
    await bakeryTablesEnsuredPromise;
  } catch (error) {
    bakeryTablesEnsuredPromise = null;
    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
    // 1. Verifikasi autentikasi pengguna dan dapatkan businessId
    const { businessId } = await requireAuth();
    
    // 2. Parse query parameters dari URL
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode") || "list";
    const savedView = url.searchParams.get("view") || "all";
    const isFinancialMode = mode === "financial";
    const isCalendarMode = mode === "calendar";
    const isDashboardMode = mode === "dashboard";
    const isPaginatedBookingsListMode =
      url.searchParams.has("page") &&
      !isFinancialMode &&
      !isCalendarMode &&
      !isDashboardMode;
    
    // Parameter pencarian & filter (server-side)
    const searchQuery = url.searchParams.get("query") || "";
    const statusFilter = url.searchParams.get("status") || "";
    const dateFilter = url.searchParams.get("date") || "";
    const courierFilter =
      parseBookingCourierFilter(url.searchParams.get("courier")) ?? "";
    const orderSourceFilter =
      parseBookingOrderSourceFilter(url.searchParams.get("orderSource")) ?? "";
    const startDate = url.searchParams.get("startDate") || "";
    const endDate = url.searchParams.get("endDate") || "";
    const todayFilter =
      normalizeDateInput(url.searchParams.get("today") || "") ||
      getJakartaTodayIsoDate();

    // Parameter pagination
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
    const offset = (page - 1) * limit;

    // 3. Muat pemetaan token produk (tidak diperlukan pada financial mode)
    const productTokenLookup = isFinancialMode || isPaginatedBookingsListMode
      ? new Map<string, number>()
      : await loadOrderProductTokenLookup(businessId);
    let totalCount = 0;
    let totalPages = 0;
    let effectiveTotalCount = 0;
    let effectiveTotalPages = 0;

    try {
      // Pastikan tabel bakery_orders sudah ada
      await ensureBakeryTables();

      // 4. Bangun WHERE clause dinamis menggunakan Prisma.join untuk keamanan SQL injection
      const whereClauses: Prisma.Sql[] = [
        Prisma.sql`business_id = ${businessId}`,
        Prisma.sql`deleted_at IS NULL`,
      ];

      if (statusFilter) {
        whereClauses.push(Prisma.sql`order_status = ${statusFilter}`);
      }
      if (savedView === "active") {
        whereClauses.push(
          Prisma.sql`(order_status IS NULL OR order_status NOT IN ('Delivery', 'Delivered', 'Completed', 'Cancelled'))`,
        );
      }
      if (savedView === "late") {
        whereClauses.push(
          Prisma.sql`delivery_date < ${todayFilter}::date
            AND (order_status IS NULL OR order_status NOT IN ('Delivery', 'Delivered', 'Completed', 'Cancelled'))`,
        );
      }
      if (dateFilter) {
        whereClauses.push(Prisma.sql`delivery_date = ${dateFilter}::date`);
      }
      if (searchQuery) {
        const queryParam = `%${searchQuery}%`;
        whereClauses.push(Prisma.sql`(customer_name ILIKE ${queryParam} OR booking_code ILIKE ${queryParam} OR resi ILIKE ${queryParam} OR external_id ILIKE ${queryParam})`);
      }
      if (startDate && endDate) {
        whereClauses.push(Prisma.sql`delivery_date >= ${startDate}::date AND delivery_date <= ${endDate}::date`);
      } else if (isCalendarMode && !dateFilter) {
        // Guard: Jika mode calendar tanpa filter tanggal eksplisit,
        // batasi ke window ±90 hari dari hari ini agar tidak full table scan.
        // Frontend selalu kirim startDate/endDate untuk render kalender,
        // guard ini hanya safety net jika parameter tidak ada.
        whereClauses.push(
          Prisma.sql`delivery_date >= (CURRENT_DATE - INTERVAL '7 days')::date
            AND delivery_date <= (CURRENT_DATE + INTERVAL '90 days')::date`,
        );
      } else if (isDashboardMode && !dateFilter && !searchQuery && !statusFilter) {
        // Guard: Jika mode dashboard tanpa filter apapun,
        // batasi ke order dengan delivery date dalam 12 bulan ke depan + 2 bulan lalu
        // untuk menampilkan statistik yang relevan tanpa pull all-time data.
        whereClauses.push(
          Prisma.sql`delivery_date >= (CURRENT_DATE - INTERVAL '60 days')::date
            AND delivery_date <= (CURRENT_DATE + INTERVAL '365 days')::date`,
        );
      } else if (isFinancialMode && !startDate && !endDate) {
        // Guard: Jika mode financial tanpa filter tanggal, batasi maksimal 12 bulan terakhir
        // untuk mencegah full table scan pada seluruh riwayat transaksi.
        whereClauses.push(
          Prisma.sql`delivery_date >= (CURRENT_DATE - INTERVAL '365 days')::date`
        );
      } else if (!url.searchParams.has("page") && !isCalendarMode && !isDashboardMode && !isFinancialMode && !searchQuery) {
        whereClauses.push(
          Prisma.sql`delivery_date >= (CURRENT_DATE - INTERVAL '30 days')::date
            AND delivery_date <= (CURRENT_DATE + INTERVAL '90 days')::date`,
        );
      }

      const where = Prisma.sql`WHERE ${Prisma.join(whereClauses, " AND ")}`;

      // Guard khusus mode production (list tanpa param page):
      // Batasi ke 500 order terdekat berdasarkan delivery date agar tidak unlimited.
      // Ini mencegah query besar saat ada ratusan order historis.
      const isProductionListMode = !url.searchParams.has("page") && !isCalendarMode && !isDashboardMode && !isFinancialMode;
      const productionListLimit = 500;
      const needsPostHydrationBookingFilters =
        url.searchParams.has("page") &&
        !isCalendarMode &&
        !isDashboardMode &&
        !isFinancialMode &&
        Boolean(courierFilter || orderSourceFilter);

      // 5. Eksekusi query COUNT dinamis untuk mendapatkan total data pada server-side pagination
      if (!needsPostHydrationBookingFilters) {
        const countRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint as count
          FROM bakery_orders
          ${where}
        `;
        totalCount = Number(countRows[0]?.count || 0);
        totalPages = totalCount > 0 ? Math.ceil(totalCount / limit) : 0;
      }

      // 6. Ambil data baris pesanan dari database (kolom ringan, tidak memuat JSONB besar)
      let orderRows: DbOrderRow[] = [];

      if (isFinancialMode) {
        // Mode financial: hanya memuat kolom keuangan, tanpa items/addresses/JSONB berat
        orderRows = await prisma.$queryRaw<DbOrderRow[]>`
          SELECT
            external_id,
            delivery_date,
            dp_paid_amount,
            final_paid_amount,
            total_paid_amount,
            product,
            total_price,
            payment_status,
            order_status,
            payment_transactions,
            created_at,
            updated_at
          FROM bakery_orders
          ${where}
          ORDER BY delivery_date DESC
        `;
      } else {
        // Mode normal (list, calendar, atau dashboard): memuat kolom detail esensial
        // - Calendar mode: sudah terfilter oleh date range guard di atas
        // - Dashboard mode: sudah terfilter oleh date range guard di atas
        // - Production list (tanpa page): dibatasi ke productionListLimit order terdekat
        if (isCalendarMode || isDashboardMode || !url.searchParams.has("page")) {
          if (isProductionListMode) {
            // Mode production list — batasi ke N order aktif terdekat
            orderRows = await prisma.$queryRaw<DbOrderRow[]>`
              SELECT
                order_uuid,
                external_id,
                booking_code,
                resi,
                customer_name,
                customer_phone,
                customer_address,
                delivery_date,
                delivery_slot,
                notes,
                base_price,
                design_adjustment_total,
                add_on_total,
                product_adjustment,
                non_product_adjustment,
                product_subtotal,
                product_discount_amount,
                service_charge,
                delivery_fee,
                manual_adjustment,
                dp_paid_amount,
                final_paid_amount,
                total_paid_amount,
                down_payment_amount,
                remaining_balance,
                product,
                total_price,
                insurance_fee,
                sales_channel,
                payment_status,
                order_status,
                assigned_staff_user_id,
                assigned_staff_name,
                production_assigned_at,
                shipping_quote,
                shipment,
                simulations,
                payment_transactions,
                created_at,
                updated_at
              FROM bakery_orders
              ${where}
              ORDER BY delivery_date ASC, delivery_slot ASC
              LIMIT ${productionListLimit}
            `;
          } else {
            // Mode calendar / dashboard — sudah dibatasi oleh date range guard
            orderRows = await prisma.$queryRaw<DbOrderRow[]>`
              SELECT
                order_uuid,
                external_id,
                booking_code,
                resi,
                customer_name,
                customer_phone,
                customer_address,
                delivery_date,
                delivery_slot,
                notes,
                base_price,
                design_adjustment_total,
                add_on_total,
                product_adjustment,
                non_product_adjustment,
                product_subtotal,
                product_discount_amount,
                service_charge,
                delivery_fee,
                manual_adjustment,
                dp_paid_amount,
                final_paid_amount,
                total_paid_amount,
                down_payment_amount,
                remaining_balance,
                product,
                total_price,
                insurance_fee,
                sales_channel,
                payment_status,
                order_status,
                assigned_staff_user_id,
                assigned_staff_name,
                production_assigned_at,
                shipping_quote,
                shipment,
                simulations,
                payment_transactions,
                created_at,
                updated_at
              FROM bakery_orders
              ${where}
              ORDER BY delivery_date ASC, delivery_slot ASC
            `;
          }
        } else {
          // Default list: gunakan server-side pagination (LIMIT/OFFSET)
          if (needsPostHydrationBookingFilters) {
            orderRows = await prisma.$queryRaw<DbOrderRow[]>`
              SELECT
                order_uuid,
                external_id,
                booking_code,
                resi,
                customer_name,
                customer_phone,
                customer_address,
                delivery_date,
                delivery_slot,
                notes,
                base_price,
                design_adjustment_total,
                add_on_total,
                product_adjustment,
                non_product_adjustment,
                product_subtotal,
                product_discount_amount,
                service_charge,
                delivery_fee,
                manual_adjustment,
                dp_paid_amount,
                final_paid_amount,
                total_paid_amount,
                down_payment_amount,
                remaining_balance,
                product,
                total_price,
                insurance_fee,
                sales_channel,
                payment_status,
                order_status,
                assigned_staff_user_id,
                assigned_staff_name,
                production_assigned_at,
                shipping_quote,
                shipment,
                simulations,
                payment_transactions,
                created_at,
                updated_at
              FROM bakery_orders
              ${where}
              ORDER BY updated_at DESC
            `;
          } else {
            orderRows = await prisma.$queryRaw<DbOrderRow[]>`
              SELECT
                order_uuid,
                external_id,
                booking_code,
                resi,
                customer_name,
                customer_phone,
                customer_address,
                delivery_date,
                delivery_slot,
                notes,
                base_price,
                design_adjustment_total,
                add_on_total,
                product_adjustment,
                non_product_adjustment,
                product_subtotal,
                product_discount_amount,
                service_charge,
                delivery_fee,
                manual_adjustment,
                dp_paid_amount,
                final_paid_amount,
                total_paid_amount,
                down_payment_amount,
                remaining_balance,
                product,
                total_price,
                insurance_fee,
                sales_channel,
                payment_status,
                order_status,
                assigned_staff_user_id,
                assigned_staff_name,
                production_assigned_at,
                shipping_quote,
                shipment,
                simulations,
                payment_transactions,
                created_at,
                updated_at
              FROM bakery_orders
              ${where}
              ORDER BY updated_at DESC
              LIMIT ${limit} OFFSET ${offset}
            `;
          }
        }
      }

      effectiveTotalCount = totalCount;
      effectiveTotalPages = totalPages;

      if (isPaginatedBookingsListMode && needsPostHydrationBookingFilters) {
        const filteredOrderRows = orderRows.filter((row) => {
          const shippingQuote = parseJsonField(row.shipping_quote);
          return (
            matchesBookingCourierFilter(
              {
                notes: row.notes,
                shippingQuote,
              },
              courierFilter,
            ) &&
            matchesBookingOrderSourceFilter(
              {
                notes: row.notes,
                shippingQuote,
              },
              orderSourceFilter,
            )
          );
        });

        effectiveTotalCount = filteredOrderRows.length;
        effectiveTotalPages =
          effectiveTotalCount > 0 ? Math.ceil(effectiveTotalCount / limit) : 0;
        orderRows = filteredOrderRows.slice(offset, offset + limit);
      }

      // 7. Jika ada baris order yang ditemukan, muat items, alamat, dan tahapan produksinya
      if (orderRows.length > 0) {
        const externalIds = orderRows.map((r) => r.external_id);
        
        // Kueri items dengan aman sesuai baris order yang terpilih
        const itemRows = await prisma.$queryRaw<DbItemRow[]>`
          SELECT order_external_id, item_index, payload
          FROM bakery_order_items
          WHERE business_id = ${businessId}
            AND order_external_id IN (${Prisma.join(externalIds)})
          ORDER BY order_external_id ASC, item_index ASC
        `;

        const itemsMap = new Map<string, JsonRecord[]>();
        for (const row of itemRows) {
          const current = itemsMap.get(row.order_external_id) ?? [];
          const payload = asRecord(parseJsonField(row.payload));
          if (payload) current.push(payload);
          itemsMap.set(row.order_external_id, current);
        }

        // Mode financial: kembalikan data ringkas langsung tanpa join tabel alamat & staff
        if (isFinancialMode) {
          const orders = orderRows.map((row) => ({
            id: row.external_id,
            deliveryDate: normalizeDateInput(row.delivery_date) ?? "",
            product: row.product ?? "",
            totalPrice: asNumber(row.total_price),
            totalPaidAmount: asNumber(row.total_paid_amount),
            dpPaidAmount: asNumber(row.dp_paid_amount),
            finalPaidAmount: asNumber(row.final_paid_amount),
            paymentStatus: row.payment_status ?? "Pending",
            orderStatus: row.order_status ?? "Inquiry",
            paymentTransactions: asArrayOfRecords(
              parseJsonField(row.payment_transactions),
            ).map((transaction) => ({
              timestamp: asString(transaction.timestamp),
              amount: asNumber(transaction.amount),
              type: asString(transaction.type),
            })),
            createdAt: row.created_at.toISOString(),
            updatedAt: row.updated_at.toISOString(),
            items: toFinancialOrderItems(itemsMap.get(row.external_id) ?? []),
          }));

          return NextResponse.json({
            success: true,
            data: {
              source: "rows",
              orders,
              updatedAt: orderRows[0]?.updated_at?.toISOString() ?? null,
            },
          });
        }

        if (isPaginatedBookingsListMode) {
          const orderExternalByUuid = new Map(
            orderRows.map((row) => [
              row.order_uuid ?? orderTaskUuid(businessId, row.external_id),
              row.external_id,
            ]),
          );
          const orderUuids = [...orderExternalByUuid.keys()];
          const stageRows =
            orderUuids.length > 0
              ? await prisma.$queryRaw<DbProductionStageRow[]>`
                  SELECT order_id::text AS order_id, stage, staff_id::text AS staff_id, token_amount
                  FROM production_tasks
                  WHERE order_id::text IN (${Prisma.join(orderUuids)})
                  ORDER BY order_id ASC, stage ASC
                `
              : [];

          const stagesMap = new Map<string, ProductionStageAssignment[]>();
          for (const row of stageRows) {
            const externalId = orderExternalByUuid.get(row.order_id);
            if (!externalId) continue;
            const stage = normalizeProductionStageKey(row.stage);
            if (!stage) continue;
            const current = stagesMap.get(externalId) ?? [];
            current.push({
              stage,
              staffId: row.staff_id ? 1 : null,
              tokenAmount: asNumber(row.token_amount),
              percentage: 0,
            });
            stagesMap.set(externalId, current);
          }

          const orders = orderRows.map((row) => {
            const items = hydrateOrderItemsWithProductTokens(
              itemsMap.get(row.external_id) ?? [],
              productTokenLookup,
            );
            const financialBreakdown = resolveOrderFinancialFields({
              basePrice: row.base_price,
              designAdjustmentTotal: row.design_adjustment_total,
              addOnTotal: row.add_on_total,
              productAdjustment: row.product_adjustment,
              nonProductAdjustment: row.non_product_adjustment,
              productSubtotal: row.product_subtotal,
              productDiscountAmount: row.product_discount_amount,
              serviceCharge: row.service_charge,
              deliveryFee: row.delivery_fee,
              insuranceFee: row.insurance_fee,
              manualAdjustment: row.manual_adjustment,
              notes: row.notes,
            });

            const order: NormalizedOrder = {
              id: row.external_id,
              bookingCode: row.booking_code ?? "",
              resi: row.resi ?? "",
              createdAt: row.created_at.toISOString(),
              updatedAt: row.updated_at.toISOString(),
              customerName: row.customer_name ?? "",
              customerPhone: row.customer_phone ?? "",
              customerAddress: row.customer_address ?? "",
              deliveryDate: normalizeDateInput(row.delivery_date) ?? "",
              deliverySlot: row.delivery_slot ?? "",
              notes: row.notes ?? "",
              basePrice: financialBreakdown.basePrice,
              designAdjustmentTotal: financialBreakdown.designAdjustmentTotal,
              addOnTotal: financialBreakdown.addOnTotal,
              productAdjustment: financialBreakdown.productAdjustment,
              nonProductAdjustment: financialBreakdown.nonProductAdjustment,
              productSubtotal: financialBreakdown.productSubtotal,
              productDiscountAmount: financialBreakdown.productDiscountAmount,
              serviceCharge: financialBreakdown.serviceCharge,
              deliveryFee: financialBreakdown.deliveryFee,
              manualAdjustment: financialBreakdown.nonProductAdjustment,
              dpPaidAmount: asNumber(row.dp_paid_amount),
              finalPaidAmount: asNumber(row.final_paid_amount),
              totalPaidAmount: asNumber(row.total_paid_amount),
              downPaymentAmount: asNumber(row.down_payment_amount),
              remainingBalance: asNumber(row.remaining_balance),
              product: row.product ?? "",
              totalPrice: financialBreakdown.totalPrice,
              insuranceFee: financialBreakdown.insuranceFee,
              sales_channel: normalizeSalesChannel(row.sales_channel),
              paymentStatus: row.payment_status ?? "Pending",
              orderStatus: row.order_status ?? "Inquiry",
              assignedStaffUserId: asPositiveIntOrNull(
                row.assigned_staff_user_id,
              ),
              assignedStaffName: row.assigned_staff_name ?? "",
              productionAssignedAt: toIsoOrNull(row.production_assigned_at),
              shippingQuote: parseJsonField(row.shipping_quote),
              shipment: parseJsonField(row.shipment),
              simulations: parseJsonField(row.simulations),
              whatsAppParsedData: null,
              statusHistory: [],
              automationLogs: [],
              paymentTransactions: asArrayOfRecords(
                parseJsonField(row.payment_transactions),
              ),
              productionStages: stagesMap.get(row.external_id) ?? [],
              items,
              deliveryAddresses: [],
            };

            return {
              ...order,
              ...resolvePersistedImageFields(order),
            };
          });

          return NextResponse.json({
            success: true,
            data: {
              source: "rows",
              orders,
              updatedAt: orderRows[0]?.updated_at?.toISOString() ?? null,
              pagination: {
                totalCount: effectiveTotalCount,
                page,
                limit,
                totalPages: effectiveTotalPages || 1,
              },
            },
          });
        }

        // Mode normal: muat data alamat & tahapan produksi tugas staff
        // Fix: Gunakan cached settings dahulu (dari memory server-side) sebelum hit DB.
        // Settings jarang berubah — cache ini valid selama proses server berjalan.
        const bakerySettings =
          getCachedBakeryBusinessSettings(businessId) ??
          (await getBakeryBusinessSettings(businessId));

        
        const addressRows = await prisma.$queryRaw<DbAddressRow[]>`
          SELECT order_external_id, address_index, payload
          FROM bakery_order_addresses
          WHERE business_id = ${businessId}
            AND order_external_id IN (${Prisma.join(externalIds)})
          ORDER BY order_external_id ASC, address_index ASC
        `;
        
        const staffMembers = await prisma.businessMember.findMany({
          where: { businessId },
          select: { userId: true },
        });
        const staffIdByUuid = buildStaffIdByUuid(
          staffMembers.map((member) => member.userId),
        );
        
        const orderExternalByUuid = new Map(
          orderRows.map((row) => [
            row.order_uuid ?? orderTaskUuid(businessId, row.external_id),
            row.external_id,
          ]),
        );
        const orderUuids = [...orderExternalByUuid.keys()];
        
        const stageRows = orderUuids.length > 0
          ? await prisma.$queryRaw<DbProductionStageRow[]>`
              SELECT order_id::text AS order_id, stage, staff_id::text AS staff_id, token_amount
              FROM production_tasks
              WHERE order_id::text IN (${Prisma.join(orderUuids)})
              ORDER BY order_id ASC, stage ASC
            `
          : [];

        const addressesMap = new Map<string, JsonRecord[]>();
        for (const row of addressRows) {
          const current = addressesMap.get(row.order_external_id) ?? [];
          const payload = asRecord(parseJsonField(row.payload));
          if (payload) current.push(payload);
          addressesMap.set(row.order_external_id, current);
        }

        const stagesMap = new Map<string, ProductionStageAssignment[]>();
        for (const row of stageRows) {
          const externalId = orderExternalByUuid.get(row.order_id);
          if (!externalId) continue;
          const stage = normalizeProductionStageKey(row.stage);
          if (!stage) continue;
          const current = stagesMap.get(externalId) ?? [];
          current.push({
            stage,
            staffId: row.staff_id ? (staffIdByUuid.get(row.staff_id) ?? null) : null,
            tokenAmount: asNumber(row.token_amount),
            percentage: 0,
          });
          stagesMap.set(externalId, current);
        }

        // 8. Bentuk daftar pesanan ter-normalisasi yang sangat ringan
        const hydratedOrders = orderRows.map((row) => {
          const items = hydrateOrderItemsWithProductTokens(
            itemsMap.get(row.external_id) ?? [],
            productTokenLookup,
          );
          const financialBreakdown = resolveOrderFinancialFields({
            basePrice: row.base_price,
            designAdjustmentTotal: row.design_adjustment_total,
            addOnTotal: row.add_on_total,
            productAdjustment: row.product_adjustment,
            nonProductAdjustment: row.non_product_adjustment,
            productSubtotal: row.product_subtotal,
            productDiscountAmount: row.product_discount_amount,
            serviceCharge: row.service_charge,
            deliveryFee: row.delivery_fee,
            insuranceFee: row.insurance_fee,
            manualAdjustment: row.manual_adjustment,
            notes: row.notes,
          });
          const stagePercentages = getProductionStagePercentagesFromTemplates(
            resolveProductionStageTemplatesForCategory({
              category: resolvePrimaryProductionCategory(items),
              profiles: bakerySettings.productionStageProfiles,
            }),
          );

          const order: NormalizedOrder = {
            id: row.external_id,
            bookingCode: row.booking_code ?? "",
            resi: row.resi ?? "",
            createdAt: row.created_at.toISOString(),
            updatedAt: row.updated_at.toISOString(),
            customerName: row.customer_name ?? "",
            customerPhone: row.customer_phone ?? "",
            customerAddress: row.customer_address ?? "",
            deliveryDate: normalizeDateInput(row.delivery_date) ?? "",
            deliverySlot: row.delivery_slot ?? "",
            notes: row.notes ?? "",
            basePrice: financialBreakdown.basePrice,
            designAdjustmentTotal: financialBreakdown.designAdjustmentTotal,
            addOnTotal: financialBreakdown.addOnTotal,
            productAdjustment: financialBreakdown.productAdjustment,
            nonProductAdjustment: financialBreakdown.nonProductAdjustment,
            productSubtotal: financialBreakdown.productSubtotal,
            productDiscountAmount: financialBreakdown.productDiscountAmount,
            serviceCharge: financialBreakdown.serviceCharge,
            deliveryFee: financialBreakdown.deliveryFee,
            manualAdjustment: financialBreakdown.nonProductAdjustment,
            dpPaidAmount: asNumber(row.dp_paid_amount),
            finalPaidAmount: asNumber(row.final_paid_amount),
            totalPaidAmount: asNumber(row.total_paid_amount),
            downPaymentAmount: asNumber(row.down_payment_amount),
            remainingBalance: asNumber(row.remaining_balance),
            product: row.product ?? "",
            totalPrice: financialBreakdown.totalPrice,
            insuranceFee: financialBreakdown.insuranceFee,
            sales_channel: normalizeSalesChannel(row.sales_channel),
            paymentStatus: row.payment_status ?? "Pending",
            orderStatus: row.order_status ?? "Inquiry",
            assignedStaffUserId: asPositiveIntOrNull(row.assigned_staff_user_id),
            assignedStaffName: row.assigned_staff_name ?? "",
            productionAssignedAt: toIsoOrNull(row.production_assigned_at),
            shippingQuote: parseJsonField(row.shipping_quote),
            shipment: parseJsonField(row.shipment),
            simulations: parseJsonField(row.simulations),
            whatsAppParsedData: null, // Dikosongkan demi optimasi egress 8GB
            statusHistory: [], // Dikosongkan demi optimasi egress 8GB
            automationLogs: [], // Dikosongkan demi optimasi egress 8GB
            paymentTransactions: asArrayOfRecords(parseJsonField(row.payment_transactions)),
            productionStages: (stagesMap.get(row.external_id) ?? []).map(
              (stage) => ({
                ...stage,
                percentage: stagePercentages[stage.stage] ?? stage.percentage,
              }),
            ),
            items,
            deliveryAddresses: addressesMap.get(row.external_id) ?? [],
          };

          return {
            ...order,
            ...resolvePersistedImageFields(order),
          };
        });
        const filteredOrders = needsPostHydrationBookingFilters
          ? hydratedOrders.filter(
              (order) =>
                matchesBookingCourierFilter(order, courierFilter) &&
                matchesBookingOrderSourceFilter(order, orderSourceFilter),
            )
          : hydratedOrders;
        const orders = needsPostHydrationBookingFilters
          ? filteredOrders.slice(offset, offset + limit)
          : filteredOrders;
        effectiveTotalCount = needsPostHydrationBookingFilters
          ? filteredOrders.length
          : totalCount;
        effectiveTotalPages = Math.max(
          1,
          Math.ceil(effectiveTotalCount / limit),
        );

        // 9. Kembalikan data list bersama metadata pagination
        const rowUpdatedAt = orderRows[0]?.updated_at?.toISOString() ?? null;
        return NextResponse.json({
          success: true,
          data: {
            source: "rows",
            orders,
            updatedAt: rowUpdatedAt,
            pagination: {
              totalCount: effectiveTotalCount,
              page,
              limit,
              totalPages: effectiveTotalPages,
            },
          },
        });
      }
    } catch (rowError) {
      if (isPrismaConnectionTimeout(rowError)) {
        return prismaConnectionErrorResponse(
          "Koneksi database timeout saat memuat daftar order bakery.",
        );
      }

      const detail = extractErrorDetails(rowError);
      console.warn(
        "[api/bookings/orders] rows read failed in GET",
        {
          businessId,
          ...detail,
        },
      );
    }

    // Jika kosong, kembalikan array kosong dengan metadata pagination
    return NextResponse.json({
      success: true,
      data: {
        source: "rows",
        orders: [],
        updatedAt: null,
        pagination: {
          totalCount: effectiveTotalCount,
          page,
          limit,
          totalPages: effectiveTotalPages,
        },
      },
    });

  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (isPrismaConnectionTimeout(error)) {
      return prismaConnectionErrorResponse(
        "Koneksi database timeout saat memuat daftar order bakery.",
      );
    }

    console.error("GET /api/bookings/orders error:", error);
    return NextResponse.json(
      { error: "Failed to load bakery orders." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const requestStartedAt = Date.now();

  try {
    const { businessId, userId, role } = await requireAuth();
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return NextResponse.json(
        {
          error:
            "Invalid content type. Use 'application/json' for bookings sync payload.",
        },
        { status: 415 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      orders?: unknown;
      skipWhatsAppNotification?: unknown;
      changedOrderIds?: string[];
    };
    if (!Array.isArray(body.orders)) {
      return NextResponse.json(
        { error: "Invalid payload. 'orders' must be an array." },
        { status: 400 },
      );
    }
    const skipWhatsAppNotification = body.skipWhatsAppNotification === true;
    const changedOrderIdsSet = Array.isArray(body.changedOrderIds)
      ? new Set(body.changedOrderIds)
      : null;

    const normalizedOrders = body.orders
      .map((entry, index) => normalizeOrder(entry, index))
      .filter((entry): entry is NormalizedOrder => Boolean(entry));

    if (normalizedOrders.length !== body.orders.length) {
      return NextResponse.json(
        {
          error: "Invalid payload. One or more orders could not be normalized.",
        },
        { status: 400 },
      );
    }

    const parsedOrders = z
      .array(normalizedOrderSchema)
      .safeParse(normalizedOrders);
    if (!parsedOrders.success) {
      const details = formatValidationIssues(parsedOrders.error);
      console.warn("[api/bookings/orders] validation failed", {
        businessId,
        userId,
        detailCount: details.length,
        details,
      });
      return NextResponse.json(
        {
          error: "Validation error for bookings payload.",
          details,
        },
        { status: 400 },
      );
    }

    const productTokenLookup = await loadOrderProductTokenLookup(businessId);
    const dateNormalizationIssues: string[] = [];
    let orders: ParsedOrder[] = parsedOrders.data.map((order) => {
      const withComputedInsurance: ParsedOrder = {
        ...order,
        items: hydrateOrderItemsWithProductTokens(
          order.items,
          productTokenLookup,
        ),
        insuranceFee: computeInsuranceFee({
          shippingQuote: order.shippingQuote,
          shipment: order.shipment,
          totalPrice: order.totalPrice,
        }),
      };

      if (!order.deliveryDate) return withComputedInsurance;

      const normalizedDeliveryDate = normalizeDateInput(order.deliveryDate);
      if (!normalizedDeliveryDate) {
        dateNormalizationIssues.push(
          `order ${order.id}: deliveryDate '${order.deliveryDate}' is invalid. Use YYYY-MM-DD.`,
        );
        return withComputedInsurance;
      }

      if (normalizedDeliveryDate === order.deliveryDate) {
        return withComputedInsurance;
      }

      return {
        ...withComputedInsurance,
        deliveryDate: normalizedDeliveryDate,
      };
    });

    if (dateNormalizationIssues.length > 0) {
      return NextResponse.json(
        {
          error: "Validation error for deliveryDate.",
          details: dateNormalizationIssues,
        },
        { status: 400 },
      );
    }

    const roleName = role as unknown as string;
    const isStaffRequest = roleName === "Staff";
    const isPrivilegedRequest = roleName === "Owner" || roleName === "Admin";
    const canManageAssignments = isPrivilegedRequest;
    const bakerySettings = await getBakeryBusinessSettings(businessId);
    const canBackfillPastOrders =
      !bakerySettings.cutoffEnabled && (role === "Owner" || role === "Admin");

    // Root Cause: Staff was previously skipped if notifyProductionWhatsapp was false.
    // Solution: Allow Staff to bypass the setting just like Admin/Owner, or at least ensure they are considered.
    const shouldSendWhatsAppNotification =
      !skipWhatsAppNotification &&
      (bakerySettings.notifyProductionWhatsapp ||
        isPrivilegedRequest ||
        isStaffRequest);

    // Logging environment variables for debugging production issues
    if (shouldSendWhatsAppNotification) {
      const missingVars = [];
      if (!process.env.FONNTE_TOKEN) missingVars.push("FONNTE_TOKEN");
      if (!process.env.FONNTE_PRODUCTION_TARGET)
        missingVars.push("FONNTE_PRODUCTION_TARGET");
      if (
        !process.env.CLOUDINARY_URL &&
        (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY)
      ) {
        missingVars.push("CLOUDINARY_VARS");
      }

      if (missingVars.length > 0) {
        console.error(
          "[api/bookings/orders] WA Notification requested but missing env vars:",
          missingVars,
        );
      }
    }

    if (!shouldSendWhatsAppNotification) {
      console.info("[api/bookings/orders] WA notification will be skipped:", {
        skipWhatsAppNotification,
        notifyProductionWhatsapp: bakerySettings.notifyProductionWhatsapp,
        isPrivilegedRequest,
        isStaffRequest,
        businessId,
      });
    } else if (
      (isPrivilegedRequest || isStaffRequest) &&
      !bakerySettings.notifyProductionWhatsapp
    ) {
      console.info(
        "[api/bookings/orders] WA notification forced via Role Bypass",
        { role, businessId },
      );
    }
    let existingOrders: ParsedOrder[] = [];
    const staffLimitByUserId = new Map<number, number>(
      bakerySettings.staffSettings.map((entry) => [
        entry.userId,
        getStaffTokenLimitForUser({
          settings: bakerySettings,
          userId: entry.userId,
        }),
      ]),
    );

    const incomingOrderIds = Array.from(new Set(orders.map((o) => o.id)));
    const incomingBookingCodes = Array.from(
      new Set(orders.map((o) => o.bookingCode).filter(Boolean)),
    );
    const incomingResis = Array.from(
      new Set(orders.map((o) => o.resi).filter(Boolean)),
    );
    const incomingDeliveryDates = Array.from(
      new Set(orders.map((o) => o.deliveryDate).filter(Boolean)),
    );
    const incomingCustomerPhones = Array.from(
      new Set(orders.map((o) => o.customerPhone).filter(Boolean)),
    );

    const safeOrderIds =
      incomingOrderIds.length > 0 ? incomingOrderIds : ["__empty__"];
    const safeBookingCodes =
      incomingBookingCodes.length > 0 ? incomingBookingCodes : ["__empty__"];
    const safeResis = incomingResis.length > 0 ? incomingResis : ["__empty__"];
    const safeDeliveryDates =
      incomingDeliveryDates.length > 0
        ? incomingDeliveryDates
        : ["1970-01-01"];
    const safeCustomerPhones =
      incomingCustomerPhones.length > 0
        ? incomingCustomerPhones
        : ["__empty__"];

    await ensureBakeryTables();
    const assignableStaffMembers = await prisma.businessMember.findMany({
      where: {
        businessId,
        role: "Staff",
      },
      select: {
        userId: true,
        user: {
          select: {
            name: true,
          },
        },
      },
    });
    const assignableStaffUserIds = new Set<number>(
      assignableStaffMembers.map((member) => member.userId),
    );
    const assignableStaffNameByUserId = new Map<number, string>(
      assignableStaffMembers.map((member) => [
        member.userId,
        member.user.name?.trim() || `Staff #${member.userId}`,
      ]),
    );

    const existingAssignmentRows = await prisma.$queryRaw<
      {
        external_id: string;
        order_status: string | null;
        assigned_staff_user_id: number | null;
      }[]
    >`
      SELECT external_id, order_status, assigned_staff_user_id
      FROM bakery_orders
      WHERE business_id = ${businessId}
        AND (
          external_id IN (${Prisma.join(safeOrderIds)})
          OR booking_code IN (${Prisma.join(safeBookingCodes)})
          OR resi IN (${Prisma.join(safeResis)})
          OR delivery_date IN (${Prisma.join(safeDeliveryDates)})
          OR customer_phone IN (${Prisma.join(safeCustomerPhones)})
        )
    `;

    const existingCapacityRows = await prisma.$queryRaw<
      {
        external_id: string;
        delivery_date: string | null;
        order_status: string | null;
      }[]
    >`
      SELECT external_id, delivery_date, order_status
      FROM bakery_orders
      WHERE business_id = ${businessId}
        AND (
          external_id IN (${Prisma.join(safeOrderIds)})
          OR booking_code IN (${Prisma.join(safeBookingCodes)})
          OR resi IN (${Prisma.join(safeResis)})
          OR delivery_date IN (${Prisma.join(safeDeliveryDates)})
          OR customer_phone IN (${Prisma.join(safeCustomerPhones)})
        )
    `;

    const existingCapacityItemRows = await prisma.$queryRaw<DbItemRow[]>`
      SELECT oi.order_external_id, oi.item_index, oi.payload
      FROM bakery_order_items oi
      JOIN bakery_orders bo ON oi.order_external_id = bo.external_id AND oi.business_id = bo.business_id
      WHERE oi.business_id = ${businessId}
        AND (
          bo.external_id IN (${Prisma.join(safeOrderIds)})
          OR bo.booking_code IN (${Prisma.join(safeBookingCodes)})
          OR bo.resi IN (${Prisma.join(safeResis)})
          OR bo.delivery_date IN (${Prisma.join(safeDeliveryDates)})
          OR bo.customer_phone IN (${Prisma.join(safeCustomerPhones)})
        )
      ORDER BY oi.order_external_id ASC, oi.item_index ASC
    `;

    const existingAddressRows = await prisma.$queryRaw<DbAddressRow[]>`
      SELECT oa.order_external_id, oa.address_index, oa.payload
      FROM bakery_order_addresses oa
      JOIN bakery_orders bo ON oa.order_external_id = bo.external_id AND oa.business_id = bo.business_id
      WHERE oa.business_id = ${businessId}
        AND (
          bo.external_id IN (${Prisma.join(safeOrderIds)})
          OR bo.booking_code IN (${Prisma.join(safeBookingCodes)})
          OR bo.resi IN (${Prisma.join(safeResis)})
          OR bo.delivery_date IN (${Prisma.join(safeDeliveryDates)})
          OR bo.customer_phone IN (${Prisma.join(safeCustomerPhones)})
        )
      ORDER BY oa.order_external_id ASC, oa.address_index ASC
    `;

    const existingCapacityItemsMap = new Map<string, JsonRecord[]>();
    for (const row of existingCapacityItemRows) {
      const current = existingCapacityItemsMap.get(row.order_external_id) ?? [];
      const payload = asRecord(parseJsonField(row.payload));
      if (payload) {
        current.push(
          hydrateOrderItemWithProductToken(payload, productTokenLookup),
        );
      }
      existingCapacityItemsMap.set(row.order_external_id, current);
    }

    const existingAddressesMap = new Map<string, JsonRecord[]>();
    for (const row of existingAddressRows) {
      const current = existingAddressesMap.get(row.order_external_id) ?? [];
      const payload = asRecord(parseJsonField(row.payload));
      if (payload) current.push(payload);
      existingAddressesMap.set(row.order_external_id, current);
    }

    const existingDuplicateRows = await prisma.$queryRaw<
      {
        external_id: string;
        booking_code: string | null;
        resi: string | null;
        customer_name: string | null;
        customer_phone: string | null;
        delivery_date: string | null;
        delivery_slot: string | null;
        notes: string | null;
        base_price: unknown;
        design_adjustment_total: unknown;
        add_on_total: unknown;
        product_adjustment: unknown;
        non_product_adjustment: unknown;
        product_subtotal: unknown;
        product_discount_amount: unknown;
        service_charge: unknown;
        delivery_fee: unknown;
        insurance_fee: unknown;
        manual_adjustment: unknown;
        dp_paid_amount: unknown;
        final_paid_amount: unknown;
        total_price: unknown;
        sales_channel: string | null;
        whatsapp_parsed_data: unknown;
      }[]
    >`
      SELECT
        external_id,
        booking_code,
        resi,
        customer_name,
        customer_phone,
        delivery_date,
        delivery_slot,
        notes,
        base_price,
        design_adjustment_total,
        add_on_total,
        product_adjustment,
        non_product_adjustment,
        product_subtotal,
        product_discount_amount,
        service_charge,
        delivery_fee,
        insurance_fee,
        manual_adjustment,
        dp_paid_amount,
        final_paid_amount,
        total_price,
        sales_channel,
        whatsapp_parsed_data
      FROM bakery_orders
      WHERE business_id = ${businessId}
        AND (
          external_id IN (${Prisma.join(safeOrderIds)})
          OR booking_code IN (${Prisma.join(safeBookingCodes)})
          OR resi IN (${Prisma.join(safeResis)})
          OR delivery_date IN (${Prisma.join(safeDeliveryDates)})
          OR customer_phone IN (${Prisma.join(safeCustomerPhones)})
        )
    `;

    const existingFingerprintMatches = new Map<
      string,
      { existingOrderId: string; existingBookingCode: string }
    >();
    const existingParsedBookingCodeMatches = new Map<
      string,
      {
        existingOrderId: string;
        existingBookingCode: string;
        parsedBookingReference: string;
      }
    >();

    for (const row of existingDuplicateRows) {
      const orderFingerprint = buildParsedOrderFingerprint({
        customerName: row.customer_name,
        customerPhone: row.customer_phone,
        deliveryDate:
          normalizeDateInput(row.delivery_date ?? "") ??
          row.delivery_date ??
          "",
        deliverySlot: row.delivery_slot,
        basePrice: row.base_price,
        designAdjustmentTotal: row.design_adjustment_total,
        addOnTotal: row.add_on_total,
        productAdjustment: row.product_adjustment,
        nonProductAdjustment: row.non_product_adjustment,
        productSubtotal: row.product_subtotal,
        productDiscountAmount: row.product_discount_amount,
        serviceCharge: row.service_charge,
        deliveryFee: row.delivery_fee,
        insuranceFee: row.insurance_fee,
        manualAdjustment: row.manual_adjustment,
        dpPaidAmount: row.dp_paid_amount,
        finalPaidAmount: row.final_paid_amount,
        totalPrice: row.total_price,
        sales_channel: row.sales_channel,
        items: existingCapacityItemsMap.get(row.external_id) ?? [],
      });
      existingFingerprintMatches.set(orderFingerprint, {
        existingOrderId: row.external_id,
        existingBookingCode: row.booking_code || row.resi || row.external_id,
      });

      const parsedBookingReference = resolveParsedBookingReference(
        row.whatsapp_parsed_data,
      );
      if (parsedBookingReference) {
        existingParsedBookingCodeMatches.set(parsedBookingReference, {
          existingOrderId: row.external_id,
          existingBookingCode: row.booking_code || row.resi || row.external_id,
          parsedBookingReference,
        });
      }
    }

    const existingCapacityById = new Map(
      existingCapacityRows.map((row) => [
        row.external_id,
        {
          deliveryDate:
            normalizeDateInput(row.delivery_date ?? "") ??
            row.delivery_date ??
            "",
          orderStatus: row.order_status ?? "Inquiry",
          items: existingCapacityItemsMap.get(row.external_id) ?? [],
        },
      ]),
    );

    const seenIncomingCreateFingerprints = new Map<
      string,
      { existingOrderId: string; existingBookingCode: string }
    >();
    const seenIncomingParsedBookingReferences = new Map<
      string,
      {
        existingOrderId: string;
        existingBookingCode: string;
        parsedBookingReference: string;
      }
    >();

    for (const order of orders) {
      if (existingCapacityById.has(order.id)) continue;

      const duplicateFingerprint = buildParsedOrderFingerprint(order);
      const duplicateExisting =
        existingFingerprintMatches.get(duplicateFingerprint) ??
        seenIncomingCreateFingerprints.get(duplicateFingerprint);

      if (duplicateExisting) {
        throw new DuplicateOrderError({
          existingOrderId: duplicateExisting.existingOrderId,
          existingBookingCode: duplicateExisting.existingBookingCode,
          duplicateReason: "same-booking",
          message: `Duplicate booking detected. Order yang sama sudah ada dengan kode ${duplicateExisting.existingBookingCode}.`,
        });
      }

      seenIncomingCreateFingerprints.set(duplicateFingerprint, {
        existingOrderId: order.id,
        existingBookingCode: order.bookingCode || order.resi || order.id,
      });

      const parsedBookingReference = resolveParsedBookingReference(
        order.whatsAppParsedData,
      );
      if (!parsedBookingReference) continue;

      const duplicateParsedReference =
        existingParsedBookingCodeMatches.get(parsedBookingReference) ??
        seenIncomingParsedBookingReferences.get(parsedBookingReference);
      if (duplicateParsedReference) {
        throw new DuplicateOrderError({
          existingOrderId: duplicateParsedReference.existingOrderId,
          existingBookingCode: duplicateParsedReference.existingBookingCode,
          duplicateReason: "parsed-booking-reference",
          duplicateParsedBookingReference:
            duplicateParsedReference.parsedBookingReference,
          message: `Duplicate booking code parsed terdeteksi. Referensi ${duplicateParsedReference.parsedBookingReference} sudah dipakai oleh order ${duplicateParsedReference.existingBookingCode}.`,
        });
      }

      seenIncomingParsedBookingReferences.set(parsedBookingReference, {
        existingOrderId: order.id,
        existingBookingCode: order.bookingCode || order.resi || order.id,
        parsedBookingReference,
      });
    }

    if (isStaffRequest) {
      const existingRows = await prisma.$queryRaw<DbOrderRow[]>`
        SELECT
          order_uuid,
          external_id,
          booking_code,
          resi,
          customer_name,
          customer_phone,
          customer_address,
          delivery_date,
          delivery_slot,
          notes,
          base_price,
          design_adjustment_total,
          add_on_total,
          product_adjustment,
          non_product_adjustment,
          product_subtotal,
          product_discount_amount,
          service_charge,
          delivery_fee,
          manual_adjustment,
          dp_paid_amount,
          final_paid_amount,
          total_paid_amount,
          down_payment_amount,
          remaining_balance,
          product,
          total_price,
          insurance_fee,
          sales_channel,
          payment_status,
          order_status,
          assigned_staff_user_id,
          assigned_staff_name,
          production_assigned_at,
          shipping_quote,
          shipment,
          simulations,
          whatsapp_parsed_data,
          status_history,
          automation_logs,
          payment_transactions,
          created_at,
          updated_at
        FROM bakery_orders
        WHERE business_id = ${businessId}
          AND external_id IN (${Prisma.join(safeOrderIds)})
        ORDER BY updated_at DESC
      `;

      const itemRows = existingCapacityItemRows;
      const addressRows = existingAddressRows;

      const staffMembers = await prisma.businessMember.findMany({
        where: { businessId },
        select: { userId: true },
      });
      const staffIdByUuid = buildStaffIdByUuid(
        staffMembers.map((member) => member.userId),
      );
      const orderExternalByUuid = new Map(
        existingRows.map((row) => [
          row.order_uuid ?? orderTaskUuid(businessId, row.external_id),
          row.external_id,
        ]),
      );
      const orderUuids = [...orderExternalByUuid.keys()];
      const stageRows =
        orderUuids.length > 0
          ? await prisma.$queryRaw<DbProductionStageRow[]>`
              SELECT order_id::text AS order_id, stage, staff_id::text AS staff_id, token_amount
              FROM production_tasks
              WHERE order_id::text IN (${Prisma.join(orderUuids)})
              ORDER BY order_id ASC, stage ASC
            `
          : [];

      const itemsMap = new Map<string, JsonRecord[]>();
      for (const row of itemRows) {
        const current = itemsMap.get(row.order_external_id) ?? [];
        const payload = asRecord(parseJsonField(row.payload));
        if (payload) current.push(payload);
        itemsMap.set(row.order_external_id, current);
      }

      const addressesMap = new Map<string, JsonRecord[]>();
      for (const row of addressRows) {
        const current = addressesMap.get(row.order_external_id) ?? [];
        const payload = asRecord(parseJsonField(row.payload));
        if (payload) current.push(payload);
        addressesMap.set(row.order_external_id, current);
      }

      const stagesMap = new Map<string, ProductionStageAssignment[]>();
      for (const row of stageRows) {
        const externalId = orderExternalByUuid.get(row.order_id);
        if (!externalId) continue;
        const stage = normalizeProductionStageKey(row.stage);
        if (!stage) continue;
        const current = stagesMap.get(externalId) ?? [];
        current.push({
          stage,
          staffId: row.staff_id
            ? (staffIdByUuid.get(row.staff_id) ?? null)
            : null,
          tokenAmount: asNumber(row.token_amount),
          percentage: 0,
        });
        stagesMap.set(externalId, current);
      }

      existingOrders = existingRows.map((row) => {
        const items = hydrateOrderItemsWithProductTokens(
          itemsMap.get(row.external_id) ?? [],
          productTokenLookup,
        );
        const financialBreakdown = resolveOrderFinancialFields({
          basePrice: row.base_price,
          designAdjustmentTotal: row.design_adjustment_total,
          addOnTotal: row.add_on_total,
          productAdjustment: row.product_adjustment,
          nonProductAdjustment: row.non_product_adjustment,
          productSubtotal: row.product_subtotal,
          productDiscountAmount: row.product_discount_amount,
          serviceCharge: row.service_charge,
          deliveryFee: row.delivery_fee,
          insuranceFee: row.insurance_fee,
          manualAdjustment: row.manual_adjustment,
          notes: row.notes,
        });
        const stagePercentages = getProductionStagePercentagesFromTemplates(
          resolveProductionStageTemplatesForCategory({
            category: resolvePrimaryProductionCategory(items),
            profiles: bakerySettings.productionStageProfiles,
          }),
        );

        const order: ParsedOrder = {
          id: row.external_id,
          bookingCode: row.booking_code ?? "",
          resi: row.resi ?? "",
          customerName: row.customer_name ?? "",
          customerPhone: row.customer_phone ?? "",
          customerAddress: row.customer_address ?? "",
          deliveryDate:
            normalizeDateInput(row.delivery_date ?? "") ??
            row.delivery_date ??
            "",
          deliverySlot: row.delivery_slot ?? "",
          notes: row.notes ?? "",
          basePrice: financialBreakdown.basePrice,
          designAdjustmentTotal: financialBreakdown.designAdjustmentTotal,
          addOnTotal: financialBreakdown.addOnTotal,
          productAdjustment: financialBreakdown.productAdjustment,
          nonProductAdjustment: financialBreakdown.nonProductAdjustment,
          productSubtotal: financialBreakdown.productSubtotal,
          productDiscountAmount: financialBreakdown.productDiscountAmount,
          serviceCharge: financialBreakdown.serviceCharge,
          deliveryFee: financialBreakdown.deliveryFee,
          manualAdjustment: financialBreakdown.nonProductAdjustment,
          dpPaidAmount: asNumber(row.dp_paid_amount),
          finalPaidAmount: asNumber(row.final_paid_amount),
          totalPaidAmount: asNumber(row.total_paid_amount),
          downPaymentAmount: asNumber(row.down_payment_amount),
          remainingBalance: asNumber(row.remaining_balance),
          product: row.product ?? "",
          totalPrice: financialBreakdown.totalPrice,
          insuranceFee: financialBreakdown.insuranceFee,
          sales_channel: normalizeSalesChannel(row.sales_channel),
          paymentStatus: row.payment_status ?? "Pending",
          orderStatus: row.order_status ?? "Inquiry",
          assignedStaffUserId: asPositiveIntOrNull(row.assigned_staff_user_id),
          assignedStaffName: row.assigned_staff_name ?? "",
          productionAssignedAt: toIsoOrNull(row.production_assigned_at),
          shippingQuote: parseJsonField(row.shipping_quote),
          shipment: parseJsonField(row.shipment),
          simulations: parseJsonField(row.simulations),
          whatsAppParsedData: parseJsonField(row.whatsapp_parsed_data),
          statusHistory: asArrayOfRecords(parseJsonField(row.status_history)),
          automationLogs: asArrayOfRecords(parseJsonField(row.automation_logs)),
          paymentTransactions: asArrayOfRecords(
            parseJsonField(row.payment_transactions),
          ),
          productionStages: (stagesMap.get(row.external_id) ?? []).map(
            (stage) => ({
              ...stage,
              percentage: stagePercentages[stage.stage] ?? stage.percentage,
            }),
          ),
          items,
          deliveryAddresses: addressesMap.get(row.external_id) ?? [],
        };

        return {
          ...order,
          ...resolvePersistedImageFields(order),
        };
      });

      const existingById = new Map(
        existingOrders.map((order) => [order.id, order]),
      );

      const unauthorizedCreate = orders
        .map((order) => order.id)
        .filter((id) => !existingById.has(id));
      if (unauthorizedCreate.length > 0) {
        return NextResponse.json(
          {
            error:
              "Role Staff tidak diizinkan membuat booking/order baru melalui endpoint ini.",
            details: unauthorizedCreate.map((id) => `create denied: ${id}`),
          },
          { status: 403 },
        );
      }

      const staffUpdatableStatuses = new Set([
        "In Production",
        "Ready",
        "Delivery",
        "Delivered",
        "Completed",
      ]);

      const incomingIds = new Set(orders.map((order) => order.id));
      const mergedIncomingOrders = orders.map((incomingOrder) => {
        const existingOrder = existingById.get(incomingOrder.id);
        if (!existingOrder) return incomingOrder;

        const currentAssignee = existingOrder.assignedStaffUserId;
        const statusChanged =
          incomingOrder.orderStatus !== existingOrder.orderStatus;
        const { mergedStages, claimedByUser } =
          mergeStaffClaimableProductionStages({
            existingStages: existingOrder.productionStages,
            incomingStages: incomingOrder.productionStages,
            userId,
            isPrivilegedRequest: canManageAssignments,
          });
        const viewerOwnsAnyStage = mergedStages.some(
          (stage) => stage.staffId === userId,
        );
        const nextAssignee = incomingOrder.assignedStaffUserId;

        const sameAssignee = currentAssignee === nextAssignee;
        const staffClaimingUnassignedOwnOrder =
          currentAssignee === null && nextAssignee === userId;
        const staffClaimingOwnProductionStage = claimedByUser;

        // Staff payload can be stale for unrelated orders; keep server truth
        // and only apply changes that are explicitly allowed.
        if (
          !canManageAssignments &&
          !sameAssignee &&
          !staffClaimingUnassignedOwnOrder &&
          !staffClaimingOwnProductionStage
        ) {
          return {
            ...incomingOrder,
            orderStatus: existingOrder.orderStatus,
            assignedStaffUserId: existingOrder.assignedStaffUserId,
            assignedStaffName: existingOrder.assignedStaffName,
            productionAssignedAt: existingOrder.productionAssignedAt,
            productionStages: existingOrder.productionStages,
          };
        }

        if (statusChanged) {
          if (!nextAssignee && !viewerOwnsAnyStage) {
            return {
              ...incomingOrder,
              orderStatus: existingOrder.orderStatus,
              assignedStaffUserId: existingOrder.assignedStaffUserId,
              assignedStaffName: existingOrder.assignedStaffName,
              productionAssignedAt: existingOrder.productionAssignedAt,
              productionStages: existingOrder.productionStages,
            };
          }
          if (!staffUpdatableStatuses.has(incomingOrder.orderStatus)) {
            return {
              ...incomingOrder,
              orderStatus: existingOrder.orderStatus,
              assignedStaffUserId: existingOrder.assignedStaffUserId,
              assignedStaffName: existingOrder.assignedStaffName,
              productionAssignedAt: existingOrder.productionAssignedAt,
              productionStages: existingOrder.productionStages,
            };
          }
          if (nextAssignee && nextAssignee !== userId && !viewerOwnsAnyStage) {
            return {
              ...incomingOrder,
              orderStatus: existingOrder.orderStatus,
              assignedStaffUserId: existingOrder.assignedStaffUserId,
              assignedStaffName: existingOrder.assignedStaffName,
              productionAssignedAt: existingOrder.productionAssignedAt,
              productionStages: existingOrder.productionStages,
            };
          }
        }

        let nextAssignedName = existingOrder.assignedStaffName;
        if (nextAssignee === null) {
          nextAssignedName = "";
        } else if (nextAssignee === userId) {
          nextAssignedName =
            assignableStaffNameByUserId.get(userId) ||
            incomingOrder.assignedStaffName.trim() ||
            existingOrder.assignedStaffName ||
            `Staff #${userId}`;
        }

        let nextAssignedAt = existingOrder.productionAssignedAt;
        if (nextAssignee === null) {
          nextAssignedAt = null;
        } else if (nextAssignee === userId && currentAssignee === null) {
          nextAssignedAt =
            incomingOrder.productionAssignedAt || new Date().toISOString();
        } else if (nextAssignee === userId) {
          nextAssignedAt =
            incomingOrder.productionAssignedAt ||
            existingOrder.productionAssignedAt ||
            new Date().toISOString();
        } else if (claimedByUser && !existingOrder.productionAssignedAt) {
          nextAssignedAt = new Date().toISOString();
        }

        return {
          ...incomingOrder,
          orderStatus: statusChanged
            ? incomingOrder.orderStatus
            : incomingOrder.orderStatus,
          assignedStaffUserId: nextAssignee,
          assignedStaffName: nextAssignedName,
          productionAssignedAt: nextAssignedAt,
          productionStages: mergedStages,
        };
      });
      const missingExistingOrders = existingOrders.filter(
        (existingOrder) => !incomingIds.has(existingOrder.id),
      );
      orders = [...mergedIncomingOrders, ...missingExistingOrders];
    } else if (!canManageAssignments) {
      const existingByIdUnprivileged = new Map(
        existingOrders.map((order) => [order.id, order]),
      );

      orders = orders.map((incomingOrder) => {
        const existingOrder = existingByIdUnprivileged.get(incomingOrder.id);

        if (!existingOrder) {
          return {
            ...incomingOrder,
            assignedStaffUserId: null,
            assignedStaffName: "",
            productionAssignedAt: null,
            productionStages: [],
          };
        }

        return {
          ...incomingOrder,
          assignedStaffUserId: existingOrder.assignedStaffUserId,
          assignedStaffName: existingOrder.assignedStaffName,
          productionAssignedAt: existingOrder.productionAssignedAt,
          productionStages: existingOrder.productionStages,
        };
      });

      validateAssignmentTransitionRules({
        orders,
        existingAssignments: existingAssignmentRows,
        roleName,
        userId,
        isPrivilegedRequest: canManageAssignments,
      });
    } else {
      validateAssignmentTransitionRules({
        orders,
        existingAssignments: existingAssignmentRows,
        roleName,
        userId,
        isPrivilegedRequest: canManageAssignments,
      });
    }

    if (canManageAssignments) {
      orders = sanitizeAssignableStaffTargets({
        orders,
        assignableStaffUserIds,
      });
    }

    ensureAssignableStaffTargets({
      orders,
      existingOrders,
      assignableStaffUserIds,
    });

    orders = orders.map((order) => ({
      ...order,
      assignedStaffName: order.assignedStaffUserId
        ? (assignableStaffNameByUserId.get(order.assignedStaffUserId) ??
          order.assignedStaffName)
        : "",
      insuranceFee: computeInsuranceFee({
        shippingQuote: order.shippingQuote,
        shipment: order.shipment,
        totalPrice: order.totalPrice,
      }),
    }));

    validateProjectedStaffDailyTokenLimit({
      orders,
      existingOrders,
      limit: bakerySettings.staffDailyTokenLimit,
      limitByStaffUserId: staffLimitByUserId,
    });

    // Skip snapshot-wide preflight capacity rejection here.
    // The transactional capacity checks below are the authoritative guard and
    // avoid false positives when syncing assignment-only changes against
    // snapshots that are newer than the row store.

    console.info("[api/bookings/orders] request received", {
      businessId,
      userId,
      orderCount: orders.length,
      ids: orders.map((order) => order.id),
    });

    const durationMs = Date.now() - requestStartedAt;
    try {
      await ensureBakeryTables();

      let transactionSummary: {
        deletedOrderCount: number;
        upsertedOrderCount: number;
        insertedItemCount: number;
        insertedAddressCount: number;
        inventoryWarnings: string[];
        createdOrdersForWhatsApp: QueuedWhatsAppNotification[];
      };
      const maxDbRetries = Number(process.env.DB_RETRY_COUNT ?? 2);
      let _attempt = 0;
      while (true) {
        _attempt++;
        try {
          transactionSummary = await prisma.$transaction(
            async (tx) => {
              const deletedOrderCount = 0;
              let upsertedOrderCount = 0;
              let insertedItemCount = 0;
              let insertedAddressCount = 0;
              let capacityReconcileNeeded = false;
              const inventoryWarnings = new Set<string>();
              const createdOrdersForWhatsApp: QueuedWhatsAppNotification[] = [];

              const existingRows = await tx.$queryRaw<
                {
                  order_uuid: string | null;
                  external_id: string;
                  delivery_date: string | null;
                  token_used: number;
                  order_status: string | null;
                  assigned_staff_user_id: number | null;
                  simulations: unknown;
                }[]
              >`
          SELECT
            order_uuid,
            external_id,
            delivery_date,
            token_used,
            order_status,
            assigned_staff_user_id,
            simulations
          FROM bakery_orders
          WHERE business_id = ${businessId}
        `;

              const existingOrderMap = new Map(
                existingRows.map((row) => [row.external_id, row]),
              );
              const existingOrderExternalByUuid = new Map(
                existingRows.map((row) => [
                  row.order_uuid ?? orderTaskUuid(businessId, row.external_id),
                  row.external_id,
                ]),
              );
              const stageRows =
                existingOrderExternalByUuid.size > 0
                  ? await tx.$queryRaw<DbProductionStageRow[]>`
                  SELECT order_id::text AS order_id, stage, staff_id::text AS staff_id, token_amount
                  FROM production_tasks
                  WHERE order_id::text IN (${Prisma.join([...existingOrderExternalByUuid.keys()])})
                  ORDER BY order_id ASC, stage ASC
                `
                  : [];
              const staffIdByUuid = buildStaffIdByUuid([
                ...assignableStaffUserIds,
              ]);
              const existingStagesByExternalId = new Map<
                string,
                ProductionStageAssignment[]
              >();

              for (const row of stageRows) {
                const externalId = existingOrderExternalByUuid.get(
                  row.order_id,
                );
                if (!externalId) continue;
                const stage = normalizeProductionStageKey(row.stage);
                if (!stage) continue;

                const current =
                  existingStagesByExternalId.get(externalId) ?? [];
                current.push({
                  stage,
                  staffId: row.staff_id
                    ? (staffIdByUuid.get(row.staff_id) ?? null)
                    : null,
                  tokenAmount: asNumber(row.token_amount),
                  percentage: 0,
                });
                existingStagesByExternalId.set(externalId, current);
              }

              // Keep existing rows that are missing from incoming payload.
              // Clients can send stale/partial snapshots across tabs/devices; hard
              // delete here can drop valid orders created/edited by other users.

              for (const order of orders) {
                if (changedOrderIdsSet && !changedOrderIdsSet.has(order.id)) {
                  continue;
                }
                upsertedOrderCount += 1;
                const orderUuid = orderTaskUuid(businessId, order.id);

                const orderLockKey = `bakery_orders:${businessId}:${order.id}`;
                await tx.$executeRaw`
              SELECT pg_advisory_xact_lock(hashtext(${orderLockKey}))
            `;

                // REMOVED redundant FOR UPDATE query inside loop to speed up bulk upserts.
                // Data is already available in existingOrderMap and protected by advisory lock.

                // ── Token capacity: calculate tokens for this order ──
                const orderItems = (order.items || []).map((item) => ({
                  category:
                    typeof item.category === "string" ? item.category : "",
                  subcategory:
                    typeof item.subcategory === "string"
                      ? item.subcategory
                      : undefined,
                  productName:
                    typeof item.productName === "string"
                      ? item.productName
                      : undefined,
                  size: typeof item.size === "string" ? item.size : undefined,
                  quantity:
                    typeof item.quantity === "number"
                      ? item.quantity
                      : undefined,
                  tokenDifficulty:
                    typeof item.tokenDifficulty === "string"
                      ? item.tokenDifficulty
                      : undefined,
                  customTokenPerUnit:
                    typeof item.customTokenPerUnit === "number"
                      ? item.customTokenPerUnit
                      : undefined,
                  cookieDifficultyBreakdown:
                    typeof item.cookieDifficultyBreakdown === "string"
                      ? item.cookieDifficultyBreakdown
                      : undefined,
                }));
                const tokenForOrder = calculateOrderTokenFromItems(orderItems);
                const stageTemplates =
                  resolveProductionStageTemplatesForCategory({
                    category: resolvePrimaryProductionCategory(orderItems),
                    profiles: bakerySettings.productionStageProfiles,
                  });
                const staffByStage = PRODUCTION_STAGE_ORDER.reduce(
                  (acc, stageKey) => {
                    const matchingStage = order.productionStages.find(
                      (stage) => stage.stage === stageKey,
                    );
                    if (matchingStage) {
                      acc[stageKey] = matchingStage.staffId ?? null;
                    } else {
                      acc[stageKey] = order.assignedStaffUserId ?? null;
                    }
                    return acc;
                  },
                  {} as Record<ProductionStage, number | null>,
                );
                const productionStages = distributeProductionTokens({
                  totalTokens: tokenForOrder,
                  staffByStage,
                  percentages:
                    getProductionStagePercentagesFromTemplates(stageTemplates),
                });
                const existingCapacityOrder = existingCapacityById.get(
                  order.id,
                );
                const currentPersistedItems =
                  existingCapacityItemsMap.get(order.id) ?? [];
                const currentPersistedAddresses =
                  existingAddressesMap.get(order.id) ?? [];
                const currentPersistedStages =
                  existingStagesByExternalId.get(order.id) ?? [];
                const hasCapacityChange = hasCapacityAffectingChange(
                  existingCapacityOrder,
                  order,
                );
                const shouldRewriteProductionTasks =
                  !existingOrderMap.has(order.id) ||
                  serializeProductionStagesForComparison(
                    currentPersistedStages,
                  ) !==
                    serializeProductionStagesForComparison(productionStages);
                const shouldRewriteOrderItems =
                  !existingOrderMap.has(order.id) ||
                  haveComparableValuesChanged(
                    currentPersistedItems,
                    order.items,
                  );
                const shouldRewriteOrderAddresses =
                  !existingOrderMap.has(order.id) ||
                  haveComparableValuesChanged(
                    currentPersistedAddresses,
                    order.deliveryAddresses,
                  );
                const insuranceFee = computeInsuranceFee({
                  shippingQuote: order.shippingQuote,
                  shipment: order.shipment,
                  totalPrice: order.totalPrice,
                });

                // Determine difficulty label based on token per item ratio
                let difficulty: string | null = null;
                if (tokenForOrder > 0) {
                  const avgToken =
                    orderItems.length > 0
                      ? tokenForOrder / orderItems.length
                      : tokenForOrder;
                  if (avgToken >= 3) difficulty = "difficult";
                  else if (avgToken >= 2) difficulty = "medium";
                  else difficulty = "simple";
                }

                // ── Handle token changes for existing orders ──
                const existingOrder = existingOrderMap.get(order.id);
                const isActiveStatus = !INACTIVE_STATUSES.includes(
                  order.orderStatus || "",
                );
                const wasActive = existingOrder
                  ? !INACTIVE_STATUSES.includes(
                      existingOrder.order_status || "",
                    )
                  : false;

                const shouldValidateSchedule =
                  hasCapacityChange &&
                  isActiveStatus &&
                  (!existingOrder ||
                    !wasActive ||
                    existingOrder.delivery_date !==
                      (order.deliveryDate || null));

                // Enforce H-1 cutoff policy in backend as final authority.
                if (shouldValidateSchedule && order.deliveryDate) {
                  if (
                    !canBackfillPastOrders &&
                    isPastDate(order.deliveryDate)
                  ) {
                    throw new PastDateError(order.deliveryDate);
                  }

                  const capacity = await getCapacityForDate(
                    businessId,
                    order.deliveryDate,
                    tx,
                  );
                  const status = getCalendarStatus(
                    {
                      usedToken: capacity.usedToken,
                      maxToken: capacity.maxToken,
                      date: order.deliveryDate,
                    },
                    undefined,
                    {
                      blockedDates: bakerySettings.blockedDates,
                      cutoffHour: bakerySettings.cutoffHour,
                    },
                  );

                  if (status === "BLOCKED") {
                    throw new CapacityBlockedDateError(order.deliveryDate);
                  }

                  if (!canBackfillPastOrders && status === "CUTOFF") {
                    throw new CapacityCutoffError(
                      order.deliveryDate,
                      bakerySettings.cutoffHour,
                    );
                  }
                }

                // ── Release token lama jika ada perubahan pada order yang sudah ada ──
                // Kasus: tanggal berubah, status jadi inactive, atau jumlah token berubah.
                // Harus dilakukan sebelum consume token baru agar slot terbebas dulu.
                let tokenWasReleased = false;
                let releasedFromDate: string | null = null;

                if (
                  hasCapacityChange &&
                  existingOrder &&
                  existingOrder.delivery_date &&
                  existingOrder.token_used > 0 &&
                  wasActive
                ) {
                  // Release old tokens if date changed, status changed to inactive, or token amount changed
                  const dateChanged =
                    existingOrder.delivery_date !==
                    (order.deliveryDate || null);
                  const becameInactive = !isActiveStatus;
                  const tokenChanged =
                    existingOrder.token_used !== tokenForOrder;

                  if (dateChanged || becameInactive || tokenChanged) {
                    await releaseToken(
                      businessId,
                      existingOrder.delivery_date,
                      existingOrder.token_used,
                      tx,
                    );
                    tokenWasReleased = true;
                    releasedFromDate = existingOrder.delivery_date;
                  }
                }

                // ── Consume token baru untuk order aktif dengan tanggal delivery ──
                let finalTokenUsed = 0;
                if (
                  hasCapacityChange &&
                  isActiveStatus &&
                  order.deliveryDate &&
                  tokenForOrder > 0
                ) {
                  const existingTokenUsed = existingOrder?.token_used ?? 0;
                  const existingDeliveryDate =
                    existingOrder?.delivery_date ?? null;
                  const dateChanged =
                    existingDeliveryDate !== (order.deliveryDate || null);
                  const tokenChanged = existingTokenUsed !== tokenForOrder;
                  const wasAlreadyActive = existingOrder ? wasActive : false;

                  const shouldConsume =
                    !existingOrder ||
                    !wasAlreadyActive ||
                    dateChanged ||
                    tokenChanged;

                  if (shouldConsume) {
                    // Kasus khusus: token berubah, tanggal sama, order sudah ada dan aktif.
                    // Token lama sudah di-release di atas (tokenWasReleased = true).
                    // Gunakan atomic direct-set daripada consumeToken yang bisa gagal
                    // karena ledger stale setelah reconcile.
                    const tokenOnlySameDate =
                      tokenWasReleased &&
                      releasedFromDate === (order.deliveryDate || null) &&
                      !dateChanged;

                    if (tokenOnlySameDate) {
                      // Direct atomic set: kita tahu slot sudah dibebaskan, aman langsung tulis
                      await tx.$executeRaw`
                    INSERT INTO production_capacity (business_id, "businessId", date, max_token, used_token, created_at, updated_at)
                    VALUES (
                      ${businessId},
                      ${businessId},
                      ${order.deliveryDate}::date,
                      ${bakerySettings.dailyProductionTokenLimit},
                      LEAST(${bakerySettings.dailyProductionTokenLimit}, GREATEST(0, COALESCE(
                        (SELECT used_token FROM production_capacity WHERE business_id = ${businessId} AND date = ${order.deliveryDate}::date),
                        0
                      ) + ${tokenForOrder})),
                      NOW(),
                      NOW()
                    )
                    ON CONFLICT (business_id, date) DO UPDATE SET
                      "businessId" = EXCLUDED."businessId",
                      used_token = LEAST(
                        production_capacity.max_token,
                        GREATEST(0, production_capacity.used_token + ${tokenForOrder})
                      ),
                      updated_at = NOW()
                  `;
                      finalTokenUsed = tokenForOrder;
                    } else {
                      // Standard consume path: order baru atau tanggal berubah
                      const consumeResult = await consumeToken(
                        businessId,
                        order.deliveryDate,
                        tokenForOrder,
                        tx,
                      );
                      if (!consumeResult.success) {
                        if (isPrivilegedRequest) {
                          // Admin/Owner bypass: force consume tokens even if it exceeds max_token
                          await tx.$executeRaw`
                        UPDATE production_capacity
                        SET 
                          used_token = used_token + ${tokenForOrder},
                          updated_at = NOW()
                        WHERE business_id = ${businessId}
                          AND date = ${order.deliveryDate}::date
                      `;
                        } else {
                          // Kapasitas penuh — tolak seluruh sync ini
                          throw new CapacityFullError(
                            `Production capacity full for ${order.deliveryDate}. ` +
                              `Used: ${consumeResult.usedToken}/${consumeResult.maxToken}, ` +
                              `Needed: ${tokenForOrder} for order ${order.id}.`,
                            order.deliveryDate,
                            consumeResult.usedToken,
                            consumeResult.maxToken,
                            tokenForOrder,
                          );
                        }
                      }
                      finalTokenUsed = tokenForOrder;
                    }
                  } else {
                    // Tidak ada perubahan — pertahankan token yang ada
                    finalTokenUsed = existingOrder?.token_used ?? 0;
                  }
                  capacityReconcileNeeded = true;
                } else if (existingOrder) {
                  finalTokenUsed = existingOrder.token_used ?? 0;
                } else {
                  finalTokenUsed =
                    isActiveStatus && order.deliveryDate ? tokenForOrder : 0;
                }

                await tx.$executeRaw`
            INSERT INTO bakery_orders (
              business_id,
              "businessId",
              order_uuid,
              external_id,
              booking_code,
              resi,
              customer_name,
              customer_phone,
              customer_address,
              delivery_date,
              delivery_slot,
              notes,
              base_price,
              design_adjustment_total,
              add_on_total,
              product_adjustment,
              non_product_adjustment,
              product_subtotal,
              product_discount_amount,
              service_charge,
              delivery_fee,
              manual_adjustment,
              dp_paid_amount,
              final_paid_amount,
              total_paid_amount,
              down_payment_amount,
              remaining_balance,
              product,
              total_price,
              insurance_fee,
              sales_channel,
              payment_status,
              order_status,
              assigned_staff_user_id,
              assigned_staff_name,
              production_assigned_at,
              shipping_quote,
              shipment,
              simulations,
              whatsapp_parsed_data,
              status_history,
              automation_logs,
              payment_transactions,
              difficulty,
              token_used,
              updated_at
            ) VALUES (
              ${businessId},
              ${businessId},
              ${orderUuid}::uuid,
              ${order.id},
              ${order.bookingCode || null},
              ${order.resi || null},
              ${order.customerName || null},
              ${order.customerPhone || null},
              ${order.customerAddress || null},
              ${order.deliveryDate || null},
              ${order.deliverySlot || null},
              ${order.notes || null},
              ${order.basePrice},
              ${order.designAdjustmentTotal},
              ${order.addOnTotal},
              ${order.productAdjustment},
              ${order.nonProductAdjustment},
              ${order.productSubtotal},
              ${order.productDiscountAmount},
              ${order.serviceCharge},
              ${order.deliveryFee},
              ${order.manualAdjustment},
              ${order.dpPaidAmount},
              ${order.finalPaidAmount},
              ${order.totalPaidAmount},
              ${order.downPaymentAmount},
              ${order.remainingBalance},
              ${order.product || null},
              ${order.totalPrice},
              ${insuranceFee},
              ${order.sales_channel},
              ${order.paymentStatus || null},
              ${order.orderStatus || null},
              ${order.assignedStaffUserId},
              ${order.assignedStaffName || null},
              ${order.productionAssignedAt ? new Date(order.productionAssignedAt) : null},
              ${JSON.stringify(order.shippingQuote ?? null)}::jsonb,
              ${JSON.stringify(order.shipment ?? null)}::jsonb,
              ${JSON.stringify(order.simulations ?? null)}::jsonb,
              ${JSON.stringify(order.whatsAppParsedData ?? null)}::jsonb,
              ${JSON.stringify(order.statusHistory ?? [])}::jsonb,
              ${JSON.stringify(order.automationLogs ?? [])}::jsonb,
              ${JSON.stringify(order.paymentTransactions ?? [])}::jsonb,
              ${difficulty},
              ${finalTokenUsed},
              NOW()
            )
            ON CONFLICT (business_id, external_id)
            DO UPDATE SET
              "businessId" = EXCLUDED."businessId",
              booking_code = EXCLUDED.booking_code,
              order_uuid = EXCLUDED.order_uuid,
              resi = EXCLUDED.resi,
              customer_name = EXCLUDED.customer_name,
              customer_phone = EXCLUDED.customer_phone,
              customer_address = EXCLUDED.customer_address,
              delivery_date = EXCLUDED.delivery_date,
              delivery_slot = EXCLUDED.delivery_slot,
              notes = EXCLUDED.notes,
              base_price = EXCLUDED.base_price,
              design_adjustment_total = EXCLUDED.design_adjustment_total,
              add_on_total = EXCLUDED.add_on_total,
              product_adjustment = EXCLUDED.product_adjustment,
              non_product_adjustment = EXCLUDED.non_product_adjustment,
              product_subtotal = EXCLUDED.product_subtotal,
              product_discount_amount = EXCLUDED.product_discount_amount,
              service_charge = EXCLUDED.service_charge,
              delivery_fee = EXCLUDED.delivery_fee,
              manual_adjustment = EXCLUDED.manual_adjustment,
              dp_paid_amount = EXCLUDED.dp_paid_amount,
              final_paid_amount = EXCLUDED.final_paid_amount,
              total_paid_amount = EXCLUDED.total_paid_amount,
              down_payment_amount = EXCLUDED.down_payment_amount,
              remaining_balance = EXCLUDED.remaining_balance,
              product = EXCLUDED.product,
              total_price = EXCLUDED.total_price,
              insurance_fee = EXCLUDED.insurance_fee,
              sales_channel = EXCLUDED.sales_channel,
              payment_status = EXCLUDED.payment_status,
              order_status = EXCLUDED.order_status,
              assigned_staff_user_id = EXCLUDED.assigned_staff_user_id,
              assigned_staff_name = EXCLUDED.assigned_staff_name,
              production_assigned_at = EXCLUDED.production_assigned_at,
              shipping_quote = EXCLUDED.shipping_quote,
              shipment = EXCLUDED.shipment,
              simulations = EXCLUDED.simulations,
              whatsapp_parsed_data = EXCLUDED.whatsapp_parsed_data,
              status_history = EXCLUDED.status_history,
              automation_logs = EXCLUDED.automation_logs,
              payment_transactions = EXCLUDED.payment_transactions,
              difficulty = EXCLUDED.difficulty,
              token_used = EXCLUDED.token_used,
              updated_at = NOW()
          `;

                if (shouldRewriteProductionTasks) {
                  await tx.$executeRaw`
                DELETE FROM production_tasks
                WHERE order_id = ${orderUuid}::uuid
              `;

                  for (const stage of productionStages) {
                    await tx.$executeRaw`
                  INSERT INTO production_tasks (
                    id,
                    order_id,
                    stage,
                    "businessId",
                    staff_id,
                    token_amount,
                    created_at
                  ) VALUES (
                    ${productionTaskUuid(orderUuid, stage.stage)}::uuid,
                    ${orderUuid}::uuid,
                    ${stage.stage},
                    ${businessId},
                    ${staffUuid(stage.staffId)}::uuid,
                    ${stage.tokenAmount},
                    NOW()
                  )
                  ON CONFLICT (order_id, stage)
                  DO UPDATE SET
                    "businessId" = EXCLUDED."businessId",
                    staff_id = EXCLUDED.staff_id,
                    token_amount = EXCLUDED.token_amount
                `;
                  }
                }

                if (shouldRewriteOrderItems) {
                  await tx.$executeRaw`
              DELETE FROM bakery_order_items
              WHERE business_id = ${businessId} AND order_external_id = ${order.id}
            `;

                  for (let index = 0; index < order.items.length; index += 1) {
                    const item = order.items[index];
                    await tx.$executeRaw`
                INSERT INTO bakery_order_items (
                  business_id,
                  order_external_id,
                  item_index,
                  payload
                ) VALUES (
                  ${businessId},
                  ${order.id},
                  ${index},
                  ${JSON.stringify(item)}::jsonb
                )
              `;
                    insertedItemCount += 1;
                  }
                }

                if (shouldRewriteOrderAddresses) {
                  await tx.$executeRaw`
              DELETE FROM bakery_order_addresses
              WHERE business_id = ${businessId} AND order_external_id = ${order.id}
            `;

                  for (
                    let index = 0;
                    index < order.deliveryAddresses.length;
                    index += 1
                  ) {
                    const address = order.deliveryAddresses[index];
                    await tx.$executeRaw`
                INSERT INTO bakery_order_addresses (
                  business_id,
                  order_external_id,
                  address_index,
                  payload
                ) VALUES (
                  ${businessId},
                  ${order.id},
                  ${index},
                  ${JSON.stringify(address)}::jsonb
                )
              `;
                    insertedAddressCount += 1;
                  }
                }

                if (
                  shouldRewriteOrderItems ||
                  (existingOrder?.order_status ?? null) !==
                    (order.orderStatus || null)
                ) {
                  const inventorySync = await syncBakeryOrderInventory(tx, {
                    businessId,
                    orderId: order.id,
                    orderStatus: order.orderStatus || "",
                    items: order.items.map((item) => ({
                      category:
                        typeof item.category === "string" ? item.category : "",
                      subcategory:
                        typeof item.subcategory === "string"
                          ? item.subcategory
                          : "",
                      productName:
                        typeof item.productName === "string"
                          ? item.productName
                          : "",
                      size: typeof item.size === "string" ? item.size : "",
                      quantity:
                        typeof item.quantity === "number" ? item.quantity : 0,
                    })),
                  });

                  inventorySync.unresolvedProducts.forEach((name) => {
                    inventoryWarnings.add(
                      `Inventory sync skipped for "${name}" on order ${order.id}`,
                    );
                  });
                }

                // Root Cause: Strict !existingOrder check prevented WA for revived/updated orders.
                // Solution: Send WA if order is becoming active (was inactive/new and is now active).
                const wasInactive =
                  !existingOrder ||
                  INACTIVE_STATUSES.includes(existingOrder.order_status || "");
                const isBecomingActive = wasInactive && isActiveStatus;

                if (isBecomingActive) {
                  createdOrdersForWhatsApp.push({
                    orderId: order.id,
                    bookingCode: order.bookingCode || order.resi || order.id,
                    payload: toWhatsAppPayload(order),
                  });
                }

                existingOrderMap.set(order.id, {
                  order_uuid: orderUuid,
                  external_id: order.id,
                  delivery_date: order.deliveryDate || null,
                  token_used: finalTokenUsed,
                  order_status: order.orderStatus || null,
                  assigned_staff_user_id: order.assignedStaffUserId ?? null,
                  simulations: order.simulations ?? null,
                });
              }

              if (capacityReconcileNeeded) {
                // Hard reconcile token ledger only when schedule/status/items changed.
                await tx.$executeRaw`
              WITH active_tokens AS (
                SELECT
                  delivery_date::date AS delivery_date,
                  GREATEST(0, COALESCE(SUM(token_used), 0))::integer AS used_token
                FROM bakery_orders
                WHERE business_id = ${businessId}
                  AND delivery_date IS NOT NULL
                  AND deleted_at IS NULL
                  AND order_status NOT IN (${INACTIVE_STATUSES[0]}, ${INACTIVE_STATUSES[1]}, ${INACTIVE_STATUSES[2]}, ${INACTIVE_STATUSES[3]})
                GROUP BY delivery_date::date
              )
              INSERT INTO production_capacity (
                business_id,
                "businessId",
                date,
                max_token,
                used_token,
                created_at,
                updated_at
              )
              SELECT
                ${businessId},
                ${businessId},
                active_tokens.delivery_date,
                ${DEFAULT_MAX_TOKEN},
                LEAST(${DEFAULT_MAX_TOKEN}, active_tokens.used_token),
                NOW(),
                NOW()
              FROM active_tokens
              ON CONFLICT (business_id, date)
              DO UPDATE SET
                "businessId" = EXCLUDED."businessId",
                used_token = LEAST(
                  production_capacity.max_token,
                  GREATEST(0, EXCLUDED.used_token)
                ),
                updated_at = NOW()
            `;

                await tx.$executeRaw`
              UPDATE production_capacity pc
              SET used_token = 0,
                  updated_at = NOW()
              WHERE pc.business_id = ${businessId}
                AND NOT EXISTS (
                  SELECT 1
                  FROM bakery_orders bo
                  WHERE bo.business_id = pc.business_id
                    AND bo.delivery_date IS NOT NULL
                    AND bo.deleted_at IS NULL
                    AND bo.delivery_date::date = pc.date
                    AND bo.order_status NOT IN (${INACTIVE_STATUSES[0]}, ${INACTIVE_STATUSES[1]}, ${INACTIVE_STATUSES[2]}, ${INACTIVE_STATUSES[3]})
                    AND bo.token_used > 0
                )
            `;
              }

              await upsertOrdersSnapshot(tx, {
                businessId,
                userId,
                orders,
                source: "rows",
                mergeWithExisting: (changedOrderIdsSet?.size ?? 0) > 0,
              });

              return {
                deletedOrderCount,
                upsertedOrderCount,
                insertedItemCount,
                insertedAddressCount,
                inventoryWarnings: Array.from(inventoryWarnings),
                createdOrdersForWhatsApp,
              };
            },
            {
              maxWait: 30_000,
              timeout: 90_000,
            },
          );
          break;
        } catch (err) {
          if (isPrismaConnectionTimeout(err) && _attempt <= maxDbRetries) {
            // eslint-disable-next-line no-console
            console.warn(
              `[api/bookings/orders] DB timeout, retrying attempt ${_attempt}/${maxDbRetries}`,
            );
            // backoff before retrying
            // eslint-disable-next-line no-await-in-loop
            await new Promise((r) =>
              setTimeout(r, Math.min(5000, _attempt * 1000)),
            );
            continue;
          }
          throw err;
        }
      }

      const { createdOrdersForWhatsApp, ...summaryStats } = transactionSummary;

      console.info("[api/bookings/orders] database upsert complete", {
        businessId,
        userId,
        durationMs,
        ...summaryStats,
        waNotificationEligible: createdOrdersForWhatsApp.length,
        waNotificationQueued: shouldSendWhatsAppNotification
          ? createdOrdersForWhatsApp.length
          : 0,
        waNotificationMode: shouldSendWhatsAppNotification ? "sent" : "skipped",
      });

      if (!shouldSendWhatsAppNotification) {
        console.info(
          "[api/bookings/orders] WA notification skipped by request",
          {
            businessId,
            userId,
            eligibleCount: createdOrdersForWhatsApp.length,
          },
        );
      } else if (createdOrdersForWhatsApp.length > 0) {
        console.info(
          `[api/bookings/orders] Awaiting ${createdOrdersForWhatsApp.length} WA notifications...`,
        );
      }

      if (
        shouldSendWhatsAppNotification &&
        createdOrdersForWhatsApp.length > 0
      ) {
        const waSettledResults = await Promise.allSettled(
          createdOrdersForWhatsApp.map(
            async (notification: QueuedWhatsAppNotification) => {
            const result = await sendOrderToWhatsApp(notification.payload);
            return {
              orderId: notification.orderId,
              bookingCode: notification.bookingCode,
              ...result,
            } satisfies PersistedWhatsAppNotificationResult;
            },
          ),
        );
        const waNotificationResults = waSettledResults.map((result, index) => {
          if (result.status === "fulfilled") {
            return result.value;
          }

          return {
            orderId: createdOrdersForWhatsApp[index]?.orderId ?? "",
            bookingCode:
              createdOrdersForWhatsApp[index]?.bookingCode ??
              createdOrdersForWhatsApp[index]?.orderId ??
              "",
            ok: false,
            stage: "send" as const,
            message:
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason),
          } satisfies PersistedWhatsAppNotificationResult;
        });

        try {
          await persistWhatsAppNotificationResults({
            businessId,
            results: waNotificationResults,
          });
        } catch (statusPersistError) {
          console.error(
            "[api/bookings/orders] failed to persist WA notification status",
            {
              businessId,
              userId,
              error:
                statusPersistError instanceof Error
                  ? statusPersistError.message
                  : String(statusPersistError),
            },
          );
        }

        const failedResults = waNotificationResults.filter(
          (result) => !result.ok,
        );
        const waNotificationMode =
          failedResults.length === 0
            ? "sent"
            : failedResults.length === waNotificationResults.length
              ? "failed"
              : "partial";
        const warnings = failedResults.map(
          (failure) =>
            `WA produksi belum terkirim untuk ${failure.bookingCode || failure.orderId}: ${failure.message}`,
        );

        if (failedResults.length > 0) {
          console.error("[api/bookings/orders] WA notification failures", {
            businessId,
            userId,
            failureCount: failedResults.length,
            failures: failedResults.map((failure) => ({
              orderId: failure.orderId,
              bookingCode: failure.bookingCode,
              stage: failure.stage,
              message: failure.message,
            })),
          });
        }

        console.info(
          "[api/bookings/orders] WA notification dispatch completed.",
          {
            businessId,
            userId,
            count: waNotificationResults.length,
            failedCount: failedResults.length,
            mode: waNotificationMode,
          },
        );

        return NextResponse.json({
          success: true,
          data: {
            mode: "rows",
            itemCount: orders.length,
            durationMs,
            ...summaryStats,
            waNotificationMode,
            waNotificationEligible: createdOrdersForWhatsApp.length,
            waNotificationQueued: createdOrdersForWhatsApp.length,
            waNotificationResults,
            warnings,
            skipWhatsAppNotification: false,
          },
        });
      }

      return NextResponse.json({
        success: true,
        data: {
          mode: "rows",
          itemCount: orders.length,
          durationMs,
          ...summaryStats,
          waNotificationMode: "skipped",
          waNotificationEligible: createdOrdersForWhatsApp.length,
          waNotificationQueued: 0,
          waNotificationResults: [],
          skipWhatsAppNotification: true,
        },
      });
    } catch (rowError) {
      // ── Handle capacity-full errors with 409 ──
      if (rowError instanceof CapacityFullError) {
        return NextResponse.json(
          {
            error: "Production capacity full",
            details: rowError.message,
            capacity: {
              date: rowError.date,
              usedToken: rowError.usedToken,
              maxToken: rowError.maxToken,
              tokenNeeded: rowError.tokenNeeded,
            },
          },
          { status: 409 },
        );
      }

      if (rowError instanceof CapacityCutoffError) {
        return NextResponse.json(
          {
            error: rowError.message,
            details: `Tanggal ${rowError.date} termasuk cutoff H-1 setelah jam ${String(rowError.cutoffHour).padStart(2, "0")}:00.`,
          },
          { status: 409 },
        );
      }

      if (rowError instanceof CapacityBlockedDateError) {
        return NextResponse.json(
          {
            error: rowError.message,
            details:
              "Hari ini ditandai sebagai hari libur oleh owner, sehingga order baru ditutup.",
          },
          { status: 409 },
        );
      }

      if (rowError instanceof PastDateError) {
        return NextResponse.json(
          {
            error: "Tanggal sudah terlewat",
            details: `Tanggal ${rowError.date} berada di masa lalu.`,
          },
          { status: 400 },
        );
      }

      if (rowError instanceof DuplicateOrderError) {
        return NextResponse.json(
          {
            error: "Duplicate booking detected.",
            details: rowError.message,
            duplicateOrderId: rowError.existingOrderId,
            duplicateBookingCode: rowError.existingBookingCode,
            duplicateReason: rowError.duplicateReason,
            duplicateParsedBookingReference:
              rowError.duplicateParsedBookingReference,
          },
          { status: 409 },
        );
      }

      if (isPrismaConnectionTimeout(rowError)) {
        return prismaConnectionErrorResponse(
          "Koneksi database timeout saat menyimpan order bakery.",
        );
      }

      const detail = extractErrorDetails(rowError);
      console.warn(
        "[api/bookings/orders] rows write failed, fallback to snapshot",
        {
          businessId,
          userId,
          durationMs,
          ...detail,
        },
      );
    }

    await upsertOrdersSnapshot(prisma, {
      businessId,
      userId,
      orders,
      source: "snapshot-fallback",
    });

    return NextResponse.json({
      success: true,
      data: {
        mode: "snapshot-fallback",
        itemCount: orders.length,
        durationMs,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof CapacityFullError) {
      return NextResponse.json(
        {
          error: "Production capacity full",
          details: error.message,
          capacity: {
            date: error.date,
            usedToken: error.usedToken,
            maxToken: error.maxToken,
            tokenNeeded: error.tokenNeeded,
          },
        },
        { status: 409 },
      );
    }

    if (error instanceof CapacityCutoffError) {
      return NextResponse.json(
        {
          error: error.message,
          details: `Tanggal ${error.date} termasuk cutoff H-1 setelah jam ${String(error.cutoffHour).padStart(2, "0")}:00.`,
        },
        { status: 409 },
      );
    }

    if (error instanceof CapacityBlockedDateError) {
      return NextResponse.json(
        {
          error: error.message,
          details:
            "Hari ini ditandai sebagai hari libur oleh owner, sehingga order baru ditutup.",
        },
        { status: 409 },
      );
    }

    if (error instanceof PastDateError) {
      return NextResponse.json(
        {
          error: "Tanggal sudah terlewat",
          details: `Tanggal ${error.date} berada di masa lalu.`,
        },
        { status: 400 },
      );
    }

    if (error instanceof DuplicateOrderError) {
      return NextResponse.json(
        {
          error: "Duplicate booking detected.",
          details: error.message,
          duplicateOrderId: error.existingOrderId,
          duplicateBookingCode: error.existingBookingCode,
          duplicateReason: error.duplicateReason,
          duplicateParsedBookingReference:
            error.duplicateParsedBookingReference,
        },
        { status: 409 },
      );
    }

    if (isPrismaConnectionTimeout(error)) {
      return prismaConnectionErrorResponse(
        "Koneksi database timeout saat menyimpan order bakery.",
      );
    }

    const detail = extractErrorDetails(error);
    console.error("[api/bookings/orders] failed", {
      ...detail,
    });

    return NextResponse.json(
      {
        error: "Failed to persist bakery orders.",
        details:
          detail.message ||
          "Unexpected server error while writing to database.",
      },
      { status: 500 },
    );
  }
}
