import { NextRequest, NextResponse } from "next/server";
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
import { getBakeryBusinessSettings } from "@/lib/bakery/settings";

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

  constructor(date: string) {
    super("Pemesanan H-1 sudah ditutup (setelah jam 10 pagi)");
    this.name = "CapacityCutoffError";
    this.date = date;
  }
}

class CapacityBlockedDateError extends Error {
  public readonly date: string;

  constructor(date: string) {
    super("Tanggal libur admin, tidak menerima pesanan");
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

const INACTIVE_STATUSES = ["Cancelled", "Completed", "Delivered"];
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
  items: JsonRecord[];
  deliveryAddresses: JsonRecord[];
}

interface DbOrderRow {
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
  items: JsonRecord[];
}

type SnapshotSource = "rows" | "snapshot-fallback";
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
  items: z.array(z.record(z.string(), z.unknown())),
  deliveryAddresses: z.array(z.record(z.string(), z.unknown())),
});

type ParsedOrder = z.infer<typeof normalizedOrderSchema>;

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

  return {
    customerName: asString(order.customerName) || "Customer",
    phone: asString(order.customerPhone),
    deliveryDate: asString(order.deliveryDate),
    deliveryTime: asString(order.deliverySlot),
    item: itemSummary || asString(order.product),
    notes: asString(order.notes),
    address,
    bookingCode: asString(order.bookingCode),
    orderType,
    templateKey,
    productTags,
    recipientName:
      asString(common?.recipientName) ||
      asString(order.customerName) ||
      "Customer",
    recipientPhone:
      asString(common?.recipientPhone) || asString(order.customerPhone),
    shippingMethod: asString(common?.deliveryMethod),
    imageUrl: imageUrls[0] || "",
    imageUrls,
    referenceImages,
    requestedImageLabels: extractRequestedImageLabels(order),
    templateFields: buildTemplateFields(order, templateKey, itemSummary),
    slotNotes: buildTemplateSlotNotes(order),
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
            !["Cancelled", "Completed", "Delivered"].includes(
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
    if (!order.assignedStaffUserId || !order.deliveryDate) continue;
    if (INACTIVE_STATUSES.includes(order.orderStatus || "")) continue;

    const token = calculateOrderTokenForLimit(order);
    if (token <= 0) continue;

    const key = `${order.assignedStaffUserId}:${order.deliveryDate}`;
    usage.set(key, (usage.get(key) ?? 0) + token);
  }

  return usage;
}

export function validateAssignmentTransitionRules(params: {
  orders: StaffValidationOrder[];
  existingAssignments: ExistingAssignmentState[];
  roleName: string;
  userId: number;
}) {
  const { orders, existingAssignments, roleName, userId } = params;
  const isOwnerRequest = roleName === "Owner";
  const isStaffRequest = roleName === "Staff";
  const existingAssignmentMap = new Map(
    existingAssignments.map((row) => [row.external_id, row]),
  );

  for (const order of orders) {
    const existing = existingAssignmentMap.get(order.id);
    if (!existing) continue;

    const currentStatus = existing.order_status ?? "Inquiry";
    const statusChanged = currentStatus !== order.orderStatus;
    const currentAssignee = asPositiveIntOrNull(
      existing.assigned_staff_user_id,
    );
    const nextAssignee = order.assignedStaffUserId;

    if (statusChanged && !nextAssignee) {
      throw new ForbiddenError("Order must be assigned before changing status");
    }

    if (currentAssignee === nextAssignee) {
      continue;
    }

    if (currentAssignee !== null && nextAssignee === null) {
      throw new ForbiddenError(
        "Order yang sudah diambil tidak bisa dilepas. Gunakan transfer oleh owner.",
      );
    }

    if (!isOwnerRequest) {
      const isStaffClaimOwnUnassignedOrder =
        isStaffRequest && currentAssignee === null && nextAssignee === userId;

      if (!isStaffClaimOwnUnassignedOrder) {
        throw new ForbiddenError(
          "Hanya owner yang dapat memindahkan assignment order.",
        );
      }
    }
  }
}

export function validateProjectedStaffDailyTokenLimit(params: {
  orders: StaffValidationOrder[];
  existingAssignments: ExistingAssignmentState[];
  limit?: number;
}) {
  const {
    orders,
    existingAssignments,
    limit = STAFF_DAILY_TOKEN_LIMIT,
  } = params;
  const projectedStaffDailyTokenMap = buildStaffDailyTokenMap(orders);
  const existingAssignmentMap = new Map(
    existingAssignments.map((row) => [row.external_id, row]),
  );

  for (const order of orders) {
    const existing = existingAssignmentMap.get(order.id);
    if (!existing) continue;

    const currentAssignee = asPositiveIntOrNull(
      existing.assigned_staff_user_id,
    );
    const nextAssignee = order.assignedStaffUserId;
    if (!nextAssignee || currentAssignee === nextAssignee) continue;

    if (!order.deliveryDate) continue;
    if (INACTIVE_STATUSES.includes(order.orderStatus || "")) continue;

    const staffDayKey = `${nextAssignee}:${order.deliveryDate}`;
    const projectedToken = projectedStaffDailyTokenMap.get(staffDayKey) ?? 0;
    if (projectedToken > limit) {
      throw new ForbiddenError(
        `${STAFF_DAILY_TOKEN_LIMIT_MESSAGE}. Staff ${nextAssignee} pada ${order.deliveryDate}: ${projectedToken}/${limit} token.`,
      );
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
      updatedAt: true,
    },
  });
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
    totalPrice: asNumber(record.totalPrice),
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
          items: itemsMap.get(row.external_id) ?? [],
          deliveryAddresses: addressesMap.get(row.external_id) ?? [],
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
    };
    if (!Array.isArray(body.orders)) {
      return NextResponse.json(
        { error: "Invalid payload. 'orders' must be an array." },
        { status: 400 },
      );
    }

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
      if (!order.deliveryDate) return order;

      const normalizedDeliveryDate = normalizeDateInput(order.deliveryDate);
      if (!normalizedDeliveryDate) {
        dateNormalizationIssues.push(
          `order ${order.id}: deliveryDate '${order.deliveryDate}' is invalid. Use YYYY-MM-DD.`,
        );
        return order;
      }

      if (normalizedDeliveryDate === order.deliveryDate) {
        return order;
      }

      return {
        ...order,
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

    validateAssignmentTransitionRules({
      orders,
      existingAssignments: existingAssignmentRows,
      roleName,
      userId,
    });

    if (isStaffRequest) {
      const existingRows = await prisma.$queryRaw<DbOrderRow[]>`
        SELECT
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

      const existingOrders: ParsedOrder[] = existingRows.map((row) => ({
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

      const unauthorizedDelete = existingOrders
        .map((order) => order.id)
        .filter((id) => !incomingById.has(id));
      if (unauthorizedDelete.length > 0) {
        return NextResponse.json(
          {
            error:
              "Role Staff tidak diizinkan menghapus booking/order melalui endpoint ini.",
            details: unauthorizedDelete.map((id) => `delete denied: ${id}`),
          },
          { status: 403 },
        );
      }

      const staffUpdatableStatuses = new Set([
        "In Production",
        "Ready",
        "Delivered",
        "Completed",
      ]);

      orders = existingOrders.map((existingOrder) => {
        const incomingOrder = incomingById.get(existingOrder.id);
        if (!incomingOrder) return existingOrder;

        const currentAssignee = existingOrder.assignedStaffUserId;
        const nextAssignee = incomingOrder.assignedStaffUserId;
        const statusChanged =
          incomingOrder.orderStatus !== existingOrder.orderStatus;

        const assigneeChangeAllowed =
          currentAssignee === nextAssignee ||
          (currentAssignee === null && nextAssignee === userId);

        if (!assigneeChangeAllowed) {
          throw new ForbiddenError(
            `Staff assignment denied for order ${existingOrder.id}. Staff hanya boleh ambil order unassigned miliknya sendiri. Pelepasan/transfer hanya owner.`,
          );
        }

        if (statusChanged && !nextAssignee) {
          throw new ForbiddenError(
            "Order must be assigned before changing status",
          );
        }

        if (
          statusChanged &&
          !staffUpdatableStatuses.has(incomingOrder.orderStatus)
        ) {
          throw new ForbiddenError(
            `Status update denied for order ${existingOrder.id}. Staff hanya boleh set status ke In Production, Ready, Delivered, atau Completed.`,
          );
        }

        if (statusChanged && nextAssignee !== userId) {
          throw new ForbiddenError(
            `Status update denied for order ${existingOrder.id}. Staff hanya boleh mengubah status order yang di-assign ke dirinya sendiri.`,
          );
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
        }

        return {
          ...existingOrder,
          orderStatus: statusChanged
            ? incomingOrder.orderStatus
            : existingOrder.orderStatus,
          assignedStaffUserId: nextAssignee,
          assignedStaffName: nextAssignedName,
          productionAssignedAt: nextAssignedAt,
        };
      });
    }

    validateProjectedStaffDailyTokenLimit({
      orders,
      existingAssignments: existingAssignmentRows,
      limit: bakerySettings.staffDailyTokenLimit,
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
          let deletedOrderCount = 0;
          let upsertedOrderCount = 0;
          let insertedItemCount = 0;
          let insertedAddressCount = 0;
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

          const existingIds = new Set(
            existingRows.map((row) => row.external_id),
          );
          const existingOrderMap = new Map(
            existingRows.map((row) => [row.external_id, row]),
          );
          const incomingIds = new Set(orders.map((order) => order.id));

          // ── Release tokens for deleted orders ──
          for (const externalId of existingIds) {
            if (incomingIds.has(externalId)) continue;
            const oldOrder = existingOrderMap.get(externalId);
            if (oldOrder && oldOrder.delivery_date && oldOrder.token_used > 0) {
              await releaseToken(
                businessId,
                oldOrder.delivery_date,
                oldOrder.token_used,
                tx,
              );
            }
            await tx.$executeRaw`
            DELETE FROM bakery_order_items
            WHERE business_id = ${businessId} AND order_external_id = ${externalId}
          `;
            await tx.$executeRaw`
            DELETE FROM bakery_order_addresses
            WHERE business_id = ${businessId} AND order_external_id = ${externalId}
          `;
            await tx.$executeRaw`
            DELETE FROM bakery_orders
            WHERE business_id = ${businessId} AND external_id = ${externalId}
          `;
            deletedOrderCount += 1;
          }

          for (const order of orders) {
            upsertedOrderCount += 1;

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
                },
              );

              if (status === "BLOCKED") {
                throw new CapacityBlockedDateError(order.deliveryDate);
              }

              if (status === "CUTOFF") {
                throw new CapacityCutoffError(order.deliveryDate);
              }
            }

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
              }
            }

            // Consume tokens for active orders with a delivery date
            let finalTokenUsed = 0;
            if (isActiveStatus && order.deliveryDate && tokenForOrder > 0) {
              const shouldConsume =
                !existingOrder ||
                !wasActive ||
                existingOrder.delivery_date !== (order.deliveryDate || null) ||
                existingOrder.token_used !== tokenForOrder;

              if (shouldConsume) {
                const consumeResult = await consumeToken(
                  businessId,
                  order.deliveryDate,
                  tokenForOrder,
                  tx,
                );
                if (!consumeResult.success) {
                  // Capacity full — reject this entire sync
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
              } else {
                // No change needed, keep existing token
                finalTokenUsed = existingOrder?.token_used ?? 0;
              }
            }

            await tx.$executeRaw`
            INSERT INTO bakery_orders (
              business_id,
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

            const isNewOrder = !existingOrder;
            if (isNewOrder && isActiveStatus) {
              createdOrdersForWhatsApp.push(toWhatsAppPayload(order));
            }
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
                AND order_status NOT IN (${INACTIVE_STATUSES[0]}, ${INACTIVE_STATUSES[1]}, ${INACTIVE_STATUSES[2]})
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
                  AND bo.delivery_date::date = pc.date
                  AND bo.order_status NOT IN (${INACTIVE_STATUSES[0]}, ${INACTIVE_STATUSES[1]}, ${INACTIVE_STATUSES[2]})
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
        waNotificationQueued: createdOrdersForWhatsApp.length,
      });

      // Fire-and-forget to avoid blocking order sync response.
      for (const orderPayload of createdOrdersForWhatsApp) {
        void sendOrderToWhatsApp(orderPayload);
      }

      return NextResponse.json({
        success: true,
        data: {
          mode: "rows",
          itemCount: orders.length,
          durationMs,
          ...summaryStats,
          waNotificationQueued: createdOrdersForWhatsApp.length,
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
            details: `Tanggal ${rowError.date} termasuk cutoff H-1 setelah jam 10 pagi.`,
          },
          { status: 409 },
        );
      }

      if (rowError instanceof CapacityBlockedDateError) {
        return NextResponse.json(
          {
            error: rowError.message,
            details: `Tanggal ${rowError.date} merupakan tanggal libur yang diblokir admin.`,
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
          details: `Tanggal ${error.date} termasuk cutoff H-1 setelah jam 10 pagi.`,
        },
        { status: 409 },
      );
    }

    if (error instanceof CapacityBlockedDateError) {
      return NextResponse.json(
        {
          error: error.message,
          details: `Tanggal ${error.date} merupakan tanggal libur yang diblokir admin.`,
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
