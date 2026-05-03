import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { AuthError, ForbiddenError, requireAuth } from "@/lib/auth/session";
import { evaluateProductionTokenCapacity } from "@/lib/bookings/operations";
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
  sendOrderToWhatsApp,
  type SendOrderToWhatsAppInput,
} from "@/lib/whatsapp/sendOrderToWhatsApp";
import { syncBakeryOrderInventory } from "@/lib/bookings/inventory-sync";
import {
  detailFieldDefinitions,
  type WhatsAppOrderType,
} from "@/lib/bookings/whatsapp-parser";
import {
  getBakeryBusinessSettings,
  getStaffTokenLimitForUser,
} from "@/lib/bakery/settings";
import { calculateShippingInsuranceFee } from "@/lib/bookings/shipping-insurance";
import {
  distributeProductionTokens,
  type ProductionStageAssignment,
  type ProductionStage,
} from "@/lib/bookings/production-stages";

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

type JsonRecord = Record<string, unknown>;

interface NormalizedOrder {
  id: string;
  bookingCode: string;
  resi: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  deliveryDate: string;
  deliverySlot: string;
  notes: string;
  basePrice: number;
  addOnTotal: number;
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
  statusHistory: JsonRecord[];
  automationLogs: JsonRecord[];
  paymentTransactions: JsonRecord[];
  productionStages: ProductionStageAssignment[];
  items: JsonRecord[];
  deliveryAddresses: JsonRecord[];
}

interface DbOrderRow {
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
  add_on_total: unknown;
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

interface DbItemRow {
  order_external_id: string;
  item_index: number;
  payload: unknown;
}

interface DbAddressRow {
  order_external_id: string;
  address_index: number;
  payload: unknown;
}

interface DbProductionStageRow {
  order_id: string;
  stage: ProductionStage;
  staff_id: string | null;
  token_amount: unknown;
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

type SnapshotSource = "rows" | "snapshot-fallback" | "snapshot-newer-than-rows";
type SnapshotStore = Pick<typeof prisma, "businessDocument">;

const normalizedOrderSchema = z.object({
  id: z.string().trim().min(1, "id is required"),
  bookingCode: z.string(),
  resi: z.string(),
  customerName: z.string(),
  customerPhone: z.string(),
  customerAddress: z.string(),
  deliveryDate: z.string(),
  deliverySlot: z.string(),
  notes: z.string(),
  basePrice: z.number().finite().min(0, "basePrice must be >= 0"),
  addOnTotal: z.number().finite().min(0, "addOnTotal must be >= 0"),
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
  statusHistory: z.array(z.record(z.string(), z.unknown())),
  automationLogs: z.array(z.record(z.string(), z.unknown())),
  paymentTransactions: z.array(z.record(z.string(), z.unknown())),
  productionStages: z.array(
    z.object({
      stage: z.enum(["listing", "filling", "finishing"]),
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

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asPositiveIntOrNull(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function normalizeSalesChannel(value: unknown): "direct" | "tokopedia" | "shopee" {
  const normalized = asString(value).trim().toLowerCase();
  if (normalized === "tokopedia" || normalized === "shopee") return normalized;
  return "direct";
}

function normalizeIncomingSalesChannel(value: unknown): string {
  return asString(value).trim().toLowerCase();
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
  return new Map(staffUserIds.map((id) => [deterministicUuid(`staff:${id}`), id]));
}

function normalizeProductionStages(value: unknown): ProductionStageAssignment[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      const record = asRecord(entry);
      if (!record) return null;
      const stage = asString(record.stage).toLowerCase();
      if (stage !== "listing" && stage !== "filling" && stage !== "finishing") {
        return null;
      }

      return {
        stage,
        staffId: asPositiveIntOrNull(record.staffId ?? record.staff_id),
        tokenAmount: asNumber(record.tokenAmount ?? record.token_amount),
        percentage: asNumber(record.percentage),
      };
    })
    .filter((entry): entry is ProductionStageAssignment => Boolean(entry));
}

function mergeStaffClaimableProductionStages(params: {
  existingStages: ProductionStageAssignment[];
  incomingStages: ProductionStageAssignment[];
  userId: number;
}) {
  const { existingStages, incomingStages, userId } = params;
  const fallbackStages =
    existingStages.length > 0 ? existingStages : incomingStages;
  const incomingByStage = new Map(
    incomingStages.map((stage) => [stage.stage, stage]),
  );
  let claimedByUser = false;

  const mergedStages = fallbackStages.map((stage) => {
    const incoming = incomingByStage.get(stage.stage);
    if (!incoming) return stage;

    const currentStaffId = asPositiveIntOrNull(stage.staffId);
    const nextStaffId = asPositiveIntOrNull(incoming.staffId);
    const canClaimOwnUnassignedStage =
      currentStaffId === null && nextStaffId === userId;

    if (!canClaimOwnUnassignedStage) {
      return stage;
    }

    claimedByUser = true;
    return {
      ...stage,
      staffId: userId,
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
    "assignedStaffUserId" | "deliveryDate" | "items" | "orderStatus" | "productionStages"
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
  target: Array<{ url: string; label?: string; orderIndex?: number }>,
  url: unknown,
  options?: {
    label?: unknown;
    orderIndex?: unknown;
  },
) {
  const parsedUrl = asString(url);
  if (!parsedUrl) return;

  const label = asString(options?.label).trim() || undefined;
  const orderIndex = parseImageOrderIndex(options?.orderIndex);
  target.push({ url: parsedUrl, label, orderIndex });
}

function collectReferenceImagesFromValue(
  target: Array<{ url: string; label?: string; orderIndex?: number }>,
  value: unknown,
  options?: {
    label?: unknown;
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
      orderIndex: resolvedOrderIndex,
    });
  }

  for (const key of [...PRIORITY_IMAGE_LIST_KEYS, ...IMAGE_LIST_KEYS]) {
    collectReferenceImagesFromValue(target, record[key], {
      label: resolvedLabel,
      orderIndex: resolvedOrderIndex,
    });
  }

  for (const key of IMAGE_COLLECTION_KEYS) {
    collectReferenceImagesFromValue(target, record[key], {
      label: resolvedLabel,
      orderIndex: resolvedOrderIndex,
    });
  }
}

function dedupeReferenceImages(
  references: Array<{ url: string; label?: string; orderIndex?: number }>,
) {
  const byUrl = new Map<
    string,
    { url: string; label?: string; orderIndex?: number }
  >();

  for (const reference of references) {
    const key = reference.url.trim();
    if (!key) continue;

    const existing = byUrl.get(key);
    if (!existing) {
      byUrl.set(key, {
        url: key,
        label: reference.label?.trim() || undefined,
        orderIndex: reference.orderIndex,
      });
      continue;
    }

    if (!existing.label && reference.label?.trim()) {
      existing.label = reference.label.trim();
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

function extractNotificationReferenceImages(order: NormalizedOrder) {
  const references: Array<{
    url: string;
    label?: string;
    orderIndex?: number;
  }> = [];
  const parsedData = asRecord(order.whatsAppParsedData);

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
        const match = itemNotes.match(
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
    const productName = asString(item.productName) || `Item ${index + 1}`;
    const unitPrice = asNumber(item.selectedPrice) || asNumber(item.basePrice);
    const quantity = Math.max(0, asNumber(item.quantity) || 0);

    return {
      productName,
      unitPrice,
      quantity,
      addOnText: formatCaptionAddOns(item),
      subtotal: resolveCaptionItemSubtotal(item),
      orderLabel: productName,
      detailLines: buildCaptionItemDetailLines(order, item),
    };
  });
}

function resolveShippingMethodLabel(
  order: NormalizedOrder,
  common: JsonRecord | null,
): string {
  const parsedMethod = asString(common?.deliveryMethod).trim();
  if (parsedMethod) return parsedMethod;

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
  return asString(value)
    .replace(/\s+/g, " ")
    .trim();
}

function buildWhatsAppCustomerNotes(order: NormalizedOrder): string {
  return normalizeWhatsAppCaptionValue(order.notes);
}

function buildWhatsAppDesignNotes(order: NormalizedOrder): string {
  const parsedData = asRecord(order.whatsAppParsedData);
  const details = getParsedDetailsForTemplate(order);
  const labeledReferences = asArrayOfRecords(parsedData?.referenceImages)
    .map((entry) =>
      normalizeWhatsAppCaptionValue(
        IMAGE_LABEL_KEYS.map((key) => entry[key]).find((value) =>
          Boolean(asString(value)),
        ),
      ),
    )
    .filter(Boolean);

  const candidates = [
    ...DESIGN_REQUEST_KEYS.map((key) =>
      normalizeWhatsAppCaptionValue(details?.[key] ?? parsedData?.[key]),
    ),
    normalizeWhatsAppCaptionValue(details?.cookieDesign),
    normalizeWhatsAppCaptionValue(details?.colorTheme),
    ...labeledReferences,
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
    manualAdjustment: asNumber(order.manualAdjustment),
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

function toTokenOpsOrders(orders: NormalizedOrder[]) {
  return orders.map((order) => {
    const items = (order.items ?? []).map((item) => ({
      category: asString(item.category),
      subcategory: asString(item.subcategory),
      productName: asString(item.productName),
      size: asString(item.size),
      quantity: asNumber(item.quantity),
      tokenDifficulty: asString(item.tokenDifficulty) || undefined,
      customTokenPerUnit: asNumber(item.customTokenPerUnit) || undefined,
    }));

    return {
      id: order.id,
      deliveryDate: order.deliveryDate,
      deliverySlot: order.deliverySlot,
      orderStatus: order.orderStatus,
      items,
    };
  });
}

function validateDailyTokenCapacity(orders: NormalizedOrder[]) {
  const tokenOrders = toTokenOpsOrders(orders);
  const activeDates = Array.from(
    new Set(
      tokenOrders
        .filter(
          (order) =>
            Boolean(order.deliveryDate) &&
            !["Cancelled", "Completed", "Delivery", "Delivered"].includes(
              order.orderStatus || "",
            ),
        )
        .map((order) => order.deliveryDate),
    ),
  );

  const overflows = activeDates
    .map((deliveryDate) => {
      const capacity = evaluateProductionTokenCapacity({
        orders: tokenOrders,
        deliveryDate,
        incomingItems: [],
      });

      return {
        deliveryDate,
        used: capacity.usedToday,
        allowed: capacity.allowed,
        overflow: Math.max(0, capacity.usedToday - capacity.allowed),
      };
    })
    .filter((entry) => entry.overflow > 0);

  return {
    isValid: overflows.length === 0,
    overflows,
  };
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
}) {
  const { orders, existingAssignments, roleName, userId } = params;
  const isPrivilegedRequest = roleName === "Owner" || roleName === "Admin";
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
      throw new ForbiddenError("Order must be assigned before changing status");
    }

    if (currentAssignee === nextAssignee) {
      continue;
    }

    if (currentAssignee !== null && nextAssignee === null && !nextHasAssignment) {
      throw new ForbiddenError(
        "Order yang sudah diambil tidak bisa dilepas. Gunakan transfer oleh owner.",
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
      const incomingDelta = Math.max(0, assignment.token - previousTokenForStaff);
      if (incomingDelta <= 0) continue;

      const tokenBeforeAssignment = Math.max(0, projectedToken - incomingDelta);

      // Allow assigning one oversized order as the first workload of the day.
      if (projectedToken > effectiveLimit && tokenBeforeAssignment > 0) {
        throw new ForbiddenError(
          `${STAFF_DAILY_TOKEN_LIMIT_MESSAGE}. Staff ${assignment.staffUserId} pada ${order.deliveryDate}: ${projectedToken}/${effectiveLimit} token.`,
        );
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

function getSnapshotSource(value: unknown): SnapshotSource | null {
  const metadata = asRecord(value);
  const source = asString(metadata?.source);
  if (
    source === "rows" ||
    source === "snapshot-fallback" ||
    source === "snapshot-newer-than-rows"
  ) {
    return source;
  }
  return null;
}

async function upsertOrdersSnapshot(
  db: SnapshotStore,
  params: {
    businessId: number;
    userId: number;
    orders: NormalizedOrder[];
    source: SnapshotSource;
  },
) {
  const { businessId, userId, orders, source } = params;
  const existingSnapshot = await db.businessDocument.findFirst({
    where: {
      businessId,
      sourceType: SNAPSHOT_SOURCE_TYPE,
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });

  const content = JSON.stringify(orders);
  const metadata = {
    kind: SNAPSHOT_SOURCE_TYPE,
    itemCount: orders.length,
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

function normalizeOrder(raw: unknown, index: number): NormalizedOrder | null {
  const record = asRecord(raw);
  if (!record) return null;

  const id = asString(record.id).trim() || `legacy-${index + 1}`;

  const rawDeliveryDate = asString(record.deliveryDate);
  const normalizedDeliveryDate =
    normalizeDateInput(rawDeliveryDate) ?? rawDeliveryDate.trim();
  const sales_channel = normalizeIncomingSalesChannel(record.sales_channel);
  const totalPrice = asNumber(record.totalPrice);
  const insuranceFee = computeInsuranceFee({
    shippingQuote: record.shippingQuote ?? null,
    shipment: record.shipment ?? null,
    totalPrice,
  });

  return {
    id,
    bookingCode: asString(record.bookingCode),
    resi: asString(record.resi),
    customerName: asString(record.customerName),
    customerPhone: asString(record.customerPhone),
    customerAddress: asString(record.customerAddress),
    deliveryDate: normalizedDeliveryDate,
    deliverySlot: asString(record.deliverySlot),
    notes: asString(record.notes),
    basePrice: asNumber(record.basePrice),
    addOnTotal: asNumber(record.addOnTotal),
    deliveryFee: asNumber(record.deliveryFee),
    manualAdjustment: asNumber(record.manualAdjustment),
    dpPaidAmount: asNumber(record.dpPaidAmount),
    finalPaidAmount: asNumber(record.finalPaidAmount),
    totalPaidAmount: asNumber(record.totalPaidAmount),
    downPaymentAmount: asNumber(record.downPaymentAmount),
    remainingBalance: asNumber(record.remainingBalance),
    product: asString(record.product),
    totalPrice,
    insuranceFee,
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
    statusHistory: asArrayOfRecords(record.statusHistory),
    automationLogs: asArrayOfRecords(record.automationLogs),
    paymentTransactions: asArrayOfRecords(record.paymentTransactions),
    productionStages: normalizeProductionStages(record.productionStages),
    items: asArrayOfRecords(record.items),
    deliveryAddresses: asArrayOfRecords(record.deliveryAddresses),
  };
}

async function ensureBakeryTables() {
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
      delivery_date TEXT,
      delivery_slot TEXT,
      notes TEXT,
      base_price NUMERIC(14,2) NOT NULL DEFAULT 0,
      add_on_total NUMERIC(14,2) NOT NULL DEFAULT 0,
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
    END
    $$;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE bakery_orders
    ADD COLUMN IF NOT EXISTS order_uuid UUID;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS production_tasks (
      id UUID PRIMARY KEY,
      order_id UUID NOT NULL,
      stage TEXT NOT NULL CHECK (stage IN ('listing', 'filling', 'finishing')),
      staff_id UUID,
      token_amount DECIMAL(10,2) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (order_id, stage)
    );
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
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'production_tasks_order_stage_unique'
      ) THEN
        ALTER TABLE production_tasks
        ADD CONSTRAINT production_tasks_order_stage_unique
        UNIQUE (order_id, stage);
      END IF;
    END $$;
  `);

  // ── Ensure production_capacity table exists ──
  await ensureCapacityTable();
}

export async function GET() {
  try {
    const { businessId } = await requireAuth();

    let rowReadFailed = false;
    try {
      await ensureBakeryTables();

      const orderRows = await prisma.$queryRaw<DbOrderRow[]>`
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
          add_on_total,
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
        ORDER BY updated_at DESC
      `;

      if (orderRows.length > 0) {
        const itemRows = await prisma.$queryRaw<DbItemRow[]>`
          SELECT order_external_id, item_index, payload
          FROM bakery_order_items
          WHERE business_id = ${businessId}
          ORDER BY order_external_id ASC, item_index ASC
        `;

        const addressRows = await prisma.$queryRaw<DbAddressRow[]>`
          SELECT order_external_id, address_index, payload
          FROM bakery_order_addresses
          WHERE business_id = ${businessId}
          ORDER BY order_external_id ASC, address_index ASC
        `;

        const staffMembers = await prisma.businessMember.findMany({
          where: { businessId },
          select: { userId: true },
        });
        const staffIdByUuid = buildStaffIdByUuid(staffMembers.map((member) => member.userId));
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
          const current = stagesMap.get(externalId) ?? [];
          current.push({
            stage: row.stage,
            staffId: row.staff_id ? staffIdByUuid.get(row.staff_id) ?? null : null,
            tokenAmount: asNumber(row.token_amount),
            percentage: row.stage === "finishing" ? 50 : 25,
          });
          stagesMap.set(externalId, current);
        }

        const orders = orderRows.map((row) => ({
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
          basePrice: asNumber(row.base_price),
          addOnTotal: asNumber(row.add_on_total),
          deliveryFee: asNumber(row.delivery_fee),
          manualAdjustment: asNumber(row.manual_adjustment),
          dpPaidAmount: asNumber(row.dp_paid_amount),
          finalPaidAmount: asNumber(row.final_paid_amount),
          totalPaidAmount: asNumber(row.total_paid_amount),
          downPaymentAmount: asNumber(row.down_payment_amount),
          remainingBalance: asNumber(row.remaining_balance),
          product: row.product ?? "",
          totalPrice: asNumber(row.total_price),
          insuranceFee: asNumber(row.insurance_fee),
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
          statusHistory: parseJsonField(row.status_history) ?? [],
          automationLogs: parseJsonField(row.automation_logs) ?? [],
          paymentTransactions: parseJsonField(row.payment_transactions) ?? [],
          productionStages: stagesMap.get(row.external_id) ?? [],
          items: itemsMap.get(row.external_id) ?? [],
          deliveryAddresses: addressesMap.get(row.external_id) ?? [],
        }));

        const snapshot = await readOrdersSnapshot(businessId);
        const snapshotSource = getSnapshotSource(snapshot?.metadata);
        const rowUpdatedAt = orderRows[0]?.updated_at?.toISOString() ?? null;
        const snapshotUpdatedAt = snapshot?.updatedAt?.toISOString() ?? null;

        if (snapshotSource === "snapshot-fallback") {
          return NextResponse.json({
            success: true,
            data: {
              source: "snapshot-fallback",
              id: snapshot?.id ?? null,
              orders: parseOrdersContent(snapshot?.content),
              updatedAt: snapshotUpdatedAt,
            },
          });
        }

        if (
          snapshotUpdatedAt &&
          rowUpdatedAt &&
          new Date(snapshotUpdatedAt).getTime() > new Date(rowUpdatedAt).getTime()
        ) {
          return NextResponse.json({
            success: true,
            data: {
              source: "snapshot-newer-than-rows",
              id: snapshot?.id ?? null,
              orders: parseOrdersContent(snapshot?.content),
              updatedAt: snapshotUpdatedAt,
            },
          });
        }

        return NextResponse.json({
          success: true,
          data: {
            source: "rows",
            orders,
            updatedAt: rowUpdatedAt,
          },
        });
      }
    } catch (rowError) {
      rowReadFailed = true;
      const detail = extractErrorDetails(rowError);
      console.warn(
        "[api/bookings/orders] rows read failed, fallback to snapshot",
        {
          businessId,
          ...detail,
        },
      );
    }

    const snapshot = await readOrdersSnapshot(businessId);

    return NextResponse.json({
      success: true,
      data: {
        source: rowReadFailed ? "snapshot-fallback" : "snapshot",
        id: snapshot?.id ?? null,
        orders: parseOrdersContent(snapshot?.content),
        updatedAt: snapshot?.updatedAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

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
    };
    if (!Array.isArray(body.orders)) {
      return NextResponse.json(
        { error: "Invalid payload. 'orders' must be an array." },
        { status: 400 },
      );
    }
    const skipWhatsAppNotification = body.skipWhatsAppNotification === true;

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

    const dateNormalizationIssues: string[] = [];
    let orders: ParsedOrder[] = parsedOrders.data.map((order) => {
      const withComputedInsurance: ParsedOrder = {
        ...order,
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
    const bakerySettings = await getBakeryBusinessSettings(businessId);
    const shouldSendWhatsAppNotification =
      !skipWhatsAppNotification && bakerySettings.notifyProductionWhatsapp;
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

    await ensureBakeryTables();

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
    `;

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
          add_on_total,
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
        ORDER BY updated_at DESC
      `;

      const itemRows = await prisma.$queryRaw<DbItemRow[]>`
        SELECT order_external_id, item_index, payload
        FROM bakery_order_items
        WHERE business_id = ${businessId}
        ORDER BY order_external_id ASC, item_index ASC
      `;

      const addressRows = await prisma.$queryRaw<DbAddressRow[]>`
        SELECT order_external_id, address_index, payload
        FROM bakery_order_addresses
        WHERE business_id = ${businessId}
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
        const current = stagesMap.get(externalId) ?? [];
        current.push({
          stage: row.stage,
          staffId: row.staff_id ? staffIdByUuid.get(row.staff_id) ?? null : null,
          tokenAmount: asNumber(row.token_amount),
          percentage: row.stage === "finishing" ? 50 : 25,
        });
        stagesMap.set(externalId, current);
      }

      existingOrders = existingRows.map((row) => ({
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
        basePrice: asNumber(row.base_price),
        addOnTotal: asNumber(row.add_on_total),
        deliveryFee: asNumber(row.delivery_fee),
        manualAdjustment: asNumber(row.manual_adjustment),
        dpPaidAmount: asNumber(row.dp_paid_amount),
        finalPaidAmount: asNumber(row.final_paid_amount),
        totalPaidAmount: asNumber(row.total_paid_amount),
        downPaymentAmount: asNumber(row.down_payment_amount),
        remainingBalance: asNumber(row.remaining_balance),
        product: row.product ?? "",
        totalPrice: asNumber(row.total_price),
        insuranceFee: asNumber(row.insurance_fee),
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
        productionStages: stagesMap.get(row.external_id) ?? [],
        items: itemsMap.get(row.external_id) ?? [],
        deliveryAddresses: addressesMap.get(row.external_id) ?? [],
      }));

      const existingById = new Map(
        existingOrders.map((order) => [order.id, order]),
      );
      const incomingById = new Map(orders.map((order) => [order.id, order]));

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

      orders = existingOrders.map((existingOrder) => {
        const incomingOrder = incomingById.get(existingOrder.id);
        if (!incomingOrder) return existingOrder;

        const currentAssignee = existingOrder.assignedStaffUserId;
        const statusChanged =
          incomingOrder.orderStatus !== existingOrder.orderStatus;
        const { mergedStages, claimedByUser } =
          mergeStaffClaimableProductionStages({
            existingStages: existingOrder.productionStages,
            incomingStages: incomingOrder.productionStages,
            userId,
          });
        const viewerOwnsAnyStage = mergedStages.some(
          (stage) => stage.staffId === userId,
        );
        const nextAssignee = incomingOrder.assignedStaffUserId;

        const sameAssignee = currentAssignee === nextAssignee;
        const staffClaimingUnassignedOwnOrder =
          currentAssignee === null && nextAssignee === userId;

        // Staff payload can be stale for unrelated orders; keep server truth
        // and only apply changes that are explicitly allowed.
        if (!sameAssignee && !staffClaimingUnassignedOwnOrder) {
          return existingOrder;
        }

        if (statusChanged) {
          if (!nextAssignee && !viewerOwnsAnyStage) {
            return existingOrder;
          }
          if (!staffUpdatableStatuses.has(incomingOrder.orderStatus)) {
            return existingOrder;
          }
          if (nextAssignee && nextAssignee !== userId && !viewerOwnsAnyStage) {
            return existingOrder;
          }
        }

        let nextAssignedName = existingOrder.assignedStaffName;
        if (nextAssignee === null) {
          nextAssignedName = "";
        } else if (nextAssignee === userId) {
          nextAssignedName =
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
          ...existingOrder,
          orderStatus: statusChanged
            ? incomingOrder.orderStatus
            : existingOrder.orderStatus,
          assignedStaffUserId: nextAssignee,
          assignedStaffName: nextAssignedName,
          productionAssignedAt: nextAssignedAt,
          productionStages: mergedStages,
        };
      });
    } else {
      validateAssignmentTransitionRules({
        orders,
        existingAssignments: existingAssignmentRows,
        roleName,
        userId,
      });
    }

    orders = orders.map((order) => ({
      ...order,
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

    const tokenValidation = validateDailyTokenCapacity(orders);
    if (!tokenValidation.isValid) {
      return NextResponse.json(
        {
          error:
            "Payload ditolak karena melebihi kapasitas token produksi harian pada satu atau lebih tanggal.",
          details: tokenValidation.overflows.map((entry) => {
            return `Tanggal ${entry.deliveryDate}: ${entry.used}/${entry.allowed} (overflow ${entry.overflow})`;
          }),
        },
        { status: 409 },
      );
    }

    console.info("[api/bookings/orders] request received", {
      businessId,
      userId,
      orderCount: orders.length,
      ids: orders.map((order) => order.id),
    });

    const durationMs = Date.now() - requestStartedAt;
    try {
      await ensureBakeryTables();

      const transactionSummary = await prisma.$transaction(
        async (tx) => {
          const deletedOrderCount = 0;
          let upsertedOrderCount = 0;
          let insertedItemCount = 0;
          let insertedAddressCount = 0;
          const inventoryWarnings = new Set<string>();
          const createdOrdersForWhatsApp: SendOrderToWhatsAppInput[] = [];

          const existingRows = await tx.$queryRaw<
            {
              external_id: string;
              delivery_date: string | null;
              token_used: number;
              order_status: string | null;
            }[]
          >`
          SELECT external_id, delivery_date, token_used, order_status
          FROM bakery_orders
          WHERE business_id = ${businessId}
        `;

          const existingOrderMap = new Map(
            existingRows.map((row) => [row.external_id, row]),
          );

          // Keep existing rows that are missing from incoming payload.
          // Clients can send stale/partial snapshots across tabs/devices; hard
          // delete here can drop valid orders created/edited by other users.

          for (const order of orders) {
            upsertedOrderCount += 1;
            const orderUuid = orderTaskUuid(businessId, order.id);

            const orderLockKey = `bakery_orders:${businessId}:${order.id}`;
            await tx.$executeRaw`
              SELECT pg_advisory_xact_lock(hashtext(${orderLockKey}))
            `;

            const lockedExistingRows = await tx.$queryRaw<
              {
                external_id: string;
                delivery_date: string | null;
                token_used: number;
                order_status: string | null;
              }[]
            >`
              SELECT external_id, delivery_date, token_used, order_status
              FROM bakery_orders
              WHERE business_id = ${businessId}
                AND external_id = ${order.id}
              FOR UPDATE
            `;

            // ── Token capacity: calculate tokens for this order ──
            const orderItems = (order.items || []).map((item) => ({
              category: typeof item.category === "string" ? item.category : "",
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
                typeof item.quantity === "number" ? item.quantity : undefined,
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
            const staffByStage = Object.fromEntries(
              order.productionStages.map((stage) => [
                stage.stage,
                stage.staffId ?? order.assignedStaffUserId ?? null,
              ]),
            ) as Partial<Record<ProductionStage, number | null>>;
            const productionStages = distributeProductionTokens({
              totalTokens: tokenForOrder,
              staffByStage,
            });
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
            const existingOrder =
              lockedExistingRows[0] ?? existingOrderMap.get(order.id);
            const isActiveStatus = !INACTIVE_STATUSES.includes(
              order.orderStatus || "",
            );
            const wasActive = existingOrder
              ? !INACTIVE_STATUSES.includes(existingOrder.order_status || "")
              : false;

            const shouldValidateSchedule =
              isActiveStatus &&
              (!existingOrder ||
                !wasActive ||
                existingOrder.delivery_date !== (order.deliveryDate || null));

            // Enforce H-1 cutoff policy in backend as final authority.
            if (shouldValidateSchedule && order.deliveryDate) {
              if (isPastDate(order.deliveryDate)) {
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

              if (status === "CUTOFF") {
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
              existingOrder &&
              existingOrder.delivery_date &&
              existingOrder.token_used > 0 &&
              wasActive
            ) {
              // Release old tokens if date changed, status changed to inactive, or token amount changed
              const dateChanged =
                existingOrder.delivery_date !== (order.deliveryDate || null);
              const becameInactive = !isActiveStatus;
              const tokenChanged = existingOrder.token_used !== tokenForOrder;

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
            if (isActiveStatus && order.deliveryDate && tokenForOrder > 0) {
              const existingTokenUsed = existingOrder?.token_used ?? 0;
              const existingDeliveryDate = existingOrder?.delivery_date ?? null;
              const dateChanged = existingDeliveryDate !== (order.deliveryDate || null);
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
                    INSERT INTO production_capacity (business_id, date, max_token, used_token, created_at, updated_at)
                    VALUES (
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
                  finalTokenUsed = tokenForOrder;
                }
              } else {
                // Tidak ada perubahan — pertahankan token yang ada
                finalTokenUsed = existingOrder?.token_used ?? 0;
              }
            }

            await tx.$executeRaw`
            INSERT INTO bakery_orders (
              business_id,
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
              add_on_total,
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
              ${order.addOnTotal},
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
              add_on_total = EXCLUDED.add_on_total,
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
                  staff_id,
                  token_amount,
                  created_at
                ) VALUES (
                  ${productionTaskUuid(orderUuid, stage.stage)}::uuid,
                  ${orderUuid}::uuid,
                  ${stage.stage},
                  ${staffUuid(stage.staffId)}::uuid,
                  ${stage.tokenAmount},
                  NOW()
                )
                ON CONFLICT (order_id, stage)
                DO UPDATE SET
                  staff_id = EXCLUDED.staff_id,
                  token_amount = EXCLUDED.token_amount
              `;
            }

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

            const inventorySync = await syncBakeryOrderInventory(tx, {
              businessId,
              orderId: order.id,
              orderStatus: order.orderStatus || "",
              items: order.items.map((item) => ({
                category: typeof item.category === "string" ? item.category : "",
                subcategory:
                  typeof item.subcategory === "string" ? item.subcategory : "",
                productName:
                  typeof item.productName === "string" ? item.productName : "",
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

            const isNewOrder = !existingOrder;
            if (isNewOrder && isActiveStatus) {
              createdOrdersForWhatsApp.push(toWhatsAppPayload(order));
            }

            existingOrderMap.set(order.id, {
              external_id: order.id,
              delivery_date: order.deliveryDate || null,
              token_used: finalTokenUsed,
              order_status: order.orderStatus || null,
            });
          }

          // Hard reconcile token ledger to guarantee DB consistency.
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
              date,
              max_token,
              used_token,
              created_at,
              updated_at
            )
            SELECT
              ${businessId},
              active_tokens.delivery_date,
              ${DEFAULT_MAX_TOKEN},
              LEAST(${DEFAULT_MAX_TOKEN}, active_tokens.used_token),
              NOW(),
              NOW()
            FROM active_tokens
            ON CONFLICT (business_id, date)
            DO UPDATE SET
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

          await upsertOrdersSnapshot(tx, {
            businessId,
            userId,
            orders,
            source: "rows",
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
          maxWait: 10_000,
          timeout: 30_000,
        },
      );

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
        console.info("[api/bookings/orders] WA notification skipped by request", {
          businessId,
          userId,
          eligibleCount: createdOrdersForWhatsApp.length,
        });
      } else {
        // Wait for WA delivery so image generation/upload/send is not cut off by serverless teardown.
        await Promise.allSettled(
          createdOrdersForWhatsApp.map((orderPayload) =>
            sendOrderToWhatsApp(orderPayload),
          ),
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          mode: "rows",
          itemCount: orders.length,
          durationMs,
          ...summaryStats,
          waNotificationMode: shouldSendWhatsAppNotification ? "sent" : "skipped",
          waNotificationEligible: createdOrdersForWhatsApp.length,
          waNotificationQueued: shouldSendWhatsAppNotification
            ? createdOrdersForWhatsApp.length
            : 0,
          skipWhatsAppNotification: !shouldSendWhatsAppNotification,
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
            details: "Hari ini ditandai sebagai hari libur oleh owner, sehingga order baru ditutup.",
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
          details: "Hari ini ditandai sebagai hari libur oleh owner, sehingga order baru ditutup.",
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
