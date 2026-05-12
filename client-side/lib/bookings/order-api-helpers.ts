import { z } from "zod";
import { normalizeDateInput } from "@/lib/helpers/date-normalization";
import type { ProductionStageAssignment, ProductionStage } from "@/lib/bookings/production-stages";
import {
  normalizeProductionStageKey,
  PRODUCTION_STAGE_ORDER,
} from "@/lib/bookings/production-stages";
import type { SendOrderToWhatsAppInput } from "@/lib/whatsapp/sendOrderToWhatsApp";
import { calculateShippingInsuranceFee } from "@/lib/bookings/shipping-insurance";
import { detailFieldDefinitions, type WhatsAppOrderType } from "@/lib/bookings/whatsapp-parser";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import { ForbiddenError } from "@/lib/auth/session";
import { BAKERY_STAFF_DAILY_TOKEN_LIMIT } from "@/lib/bookings/config";

const SNAPSHOT_SOURCE_TYPE = "bakery_orders_snapshot";
const INACTIVE_STATUSES = ["Cancelled", "Completed", "Delivery", "Delivered"];
const STAFF_DAILY_TOKEN_LIMIT = BAKERY_STAFF_DAILY_TOKEN_LIMIT;
const STAFF_DAILY_TOKEN_LIMIT_MESSAGE = "Token harian staff melebihi limit assignment";
import { summarizeProductionTokensByItems, type BookingItemForOperations, evaluateProductionTokenCapacity } from "@/lib/bookings/operations";
import { calculateOrderTokenFromItems } from "@/lib/bookings/token-capacity-service";
import { normalizeProductionStageAssignments } from "@/lib/bookings/production-stages";

export type JsonRecord = Record<string, unknown>;

export interface NormalizedOrder {
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
  deletedAt: string | null;
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
  deleted_at: Date | null;
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

export interface ExistingAssignmentState {
  external_id: string;
  order_status: string | null;
  assigned_staff_user_id: number | null;
}

export interface StaffValidationOrder {
  id: string;
  orderStatus: string;
  assignedStaffUserId: number | null;
  deliveryDate: string;
  productionStages?: ProductionStageAssignment[];
  items: JsonRecord[];
}

export type SnapshotSource = "rows" | "snapshot-fallback" | "snapshot-newer-than-rows";
export type SnapshotStore = Pick<typeof prisma, "businessDocument">;

export const normalizedOrderSchema = z.object({
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
  deletedAt: z.string().nullable().catch(null),
});

export type ParsedOrderInput = z.infer<typeof normalizedOrderSchema>;
export type ParsedOrder = ParsedOrderInput & { insuranceFee: number };

export function formatValidationIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "root";
    return `${path}: ${issue.message}`;
  });
}

export function parseOrdersContent(content: string | null | undefined): unknown[] {
  if (!content) return [];
  try {
    const parsed = JSON.parse(content) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function normalizeOrderProductionStages<T extends {
  items?: JsonRecord[];
  productionStages?: ProductionStageAssignment[] | null;
}>(order: T): T & { productionStages: ProductionStageAssignment[] } {
  const totalTokens = summarizeProductionTokensByItems(
    (order.items ?? []) as unknown as BookingItemForOperations[],
  );
  return {
    ...order,
    productionStages: normalizeProductionStageAssignments({
      totalTokens,
      stages: order.productionStages ?? [],
    }),
  };
}

export function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

export function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function asPositiveIntOrNull(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export function normalizeSalesChannel(value: unknown): "direct" | "tokopedia" | "shopee" {
  const normalized = asString(value).trim().toLowerCase();
  if (normalized === "tokopedia" || normalized === "shopee") return normalized;
  return "direct";
}

export function normalizeIncomingSalesChannel(value: unknown): string {
  return asString(value).trim().toLowerCase();
}

export function resolveInsuranceProvider(args: {
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

export function computeInsuranceFee(args: {
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

export function deterministicUuid(input: string): string {
  const hash = crypto.createHash("md5").update(input).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

export function orderTaskUuid(businessId: number, orderId: string): string {
  return deterministicUuid(`order:${businessId}:${orderId}`);
}

export function productionTaskUuid(orderUuid: string, stage: ProductionStage): string {
  return deterministicUuid(`production-task:${orderUuid}:${stage}`);
}

export function staffUuid(staffUserId: number | null): string | null {
  return staffUserId ? deterministicUuid(`staff:${staffUserId}`) : null;
}

export function buildStaffIdByUuid(staffUserIds: number[]): Map<string, number> {
  return new Map(staffUserIds.map((id) => [deterministicUuid(`staff:${id}`), id]));
}

export function normalizeProductionStages(value: unknown): ProductionStageAssignment[] {
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

export function mergeStaffClaimableProductionStages(params: {
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

export function getOrderStaffTokenAssignmentsForLimit(
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

export function toIsoOrNull(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function asArrayOfRecords(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asRecord(entry))
    .filter((entry): entry is JsonRecord => Boolean(entry));
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => asString(entry).trim()).filter(Boolean);
}

export function parseJsonField(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

export const PRIORITY_IMAGE_VALUE_KEYS = [
  "croppedImageUrl",
  "croppedUrl",
  "selectedCroppedImageUrl",
  "selectedImageUrl",
];

export const PRIORITY_IMAGE_LIST_KEYS = [
  "croppedImageUrls",
  "croppedUrls",
  "selectedImageUrls",
];

export const IMAGE_VALUE_KEYS = [
  "imageUrl",
  "productImageUrl",
  "designImageUrl",
  "thumbnailUrl",
  "photoUrl",
  "sourceImageUrl",
];

export const IMAGE_LIST_KEYS = [
  "uploadedImageUrls",
  "imageUrls",
  "referenceImageUrls",
];

export const IMAGE_COLLECTION_KEYS = [
  "selectedImages",
  "croppedImages",
  "designSelections",
  "designImages",
  "referenceImages",
  "attachments",
];

export const IMAGE_LABEL_KEYS = [
  "label",
  "name",
  "title",
  "characterName",
  "productName",
  "alt",
  "caption",
  "text",
];

export const IMAGE_ORDER_KEYS = ["orderIndex", "slotIndex", "position", "index"];

export const DESIGN_REQUEST_KEYS = [
  "bouquetDesign",
  "cakeDesign",
  "designTheme",
  "design",
  "selectedDesign",
];

export function parseImageOrderIndex(value: unknown): number | undefined {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(asString(value), 10);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

export function pushReferenceImage(
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

export function collectReferenceImagesFromValue(
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

export function dedupeReferenceImages(
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

export function normalizeReferenceImages(
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

export function extractNotificationReferenceImages(order: NormalizedOrder) {
  const references: Array<{
    url: string;
    label?: string;
    note?: string;
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
export function collectProductTags(order: NormalizedOrder): string[] {
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

export function inferTemplateKeyFromSignals(
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

export function extractRequestedImageLabels(order: NormalizedOrder): string[] {
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

export function normalizeParsedOrderTypeKey(value: unknown): string {
  const normalized = asString(value)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (normalized === "buket_hand" || normalized === "buket_standing") {
    return "buket";
  }

  return normalized;
}

export function formatTemplateDate(value: unknown): string {
  const trimmed = asString(value).trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return trimmed;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

export function formatTemplateTime(value: unknown): string {
  return asString(value)
    .trim()
    .replace(/\s*wib$/i, "");
}

export function getParsedCommonFields(order: NormalizedOrder): JsonRecord | null {
  const parsedData = asRecord(order.whatsAppParsedData);
  return asRecord(parsedData?.common);
}

export function getParsedDetailsForTemplate(
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

export function mapProductTypeToDetailOrderType(
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

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function getParsedDetailsForItem(
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

export function buildCaptionItemDetailLines(
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

export function formatCaptionAddOns(item: JsonRecord): string {
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

export function resolveCaptionItemSubtotal(item: JsonRecord): number {
  const lineTotal = asNumber(item.lineTotal);
  if (lineTotal > 0) return lineTotal;

  const basePrice = asNumber(item.selectedPrice) || asNumber(item.basePrice);
  const addOnTotal = asNumber(item.addOnTotal);
  const quantity = Math.max(0, asNumber(item.quantity) || 0);

  return (basePrice + addOnTotal) * quantity;
}

export function buildCaptionItems(
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

export function resolveShippingMethodLabel(
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

export function resolvePreferredBookingCode(
  order: NormalizedOrder,
  common: JsonRecord | null,
): string {
  return asString(common?.bookingCode).trim() || asString(order.bookingCode);
}

export function buildTemplateFields(
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

export function buildTemplateSlotNotes(order: NormalizedOrder): string[] {
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

export function normalizeWhatsAppCaptionValue(value: unknown): string {
  return asString(value)
    .replace(/\s+/g, " ")
    .trim();
}

export function buildWhatsAppCustomerNotes(order: NormalizedOrder): string {
  return normalizeWhatsAppCaptionValue(order.notes);
}

export function buildWhatsAppDesignNotes(order: NormalizedOrder): string {
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

export function toWhatsAppPayload(order: NormalizedOrder): SendOrderToWhatsAppInput {
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

export function extractErrorDetails(error: unknown): {
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

export function toTokenOpsOrders(orders: NormalizedOrder[]) {
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

export function validateDailyTokenCapacity(orders: NormalizedOrder[]) {
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

export function calculateOrderTokenForLimit(
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

export function buildStaffDailyTokenMap(
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

export function validateAssignmentTransitionRules(params: {
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

    if (statusChanged && !nextAssignee && nextStatus !== "Cancelled") {
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
  if (limit <= 0) return;

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

    const incomingToken = calculateOrderTokenForLimit(order);
    if (incomingToken <= 0) continue;

    const staffDayKey = `${nextAssignee}:${order.deliveryDate}`;
    const projectedToken = projectedStaffDailyTokenMap.get(staffDayKey) ?? 0;
    const tokenBeforeAssignment = Math.max(0, projectedToken - incomingToken);

    // Allow assigning one oversized order as the first workload of the day.
    if (projectedToken > limit && tokenBeforeAssignment > 0) {
      throw new ForbiddenError(
        `${STAFF_DAILY_TOKEN_LIMIT_MESSAGE}. Staff ${nextAssignee} pada ${order.deliveryDate}: ${projectedToken}/${limit} token.`,
      );
    }
  }
}

export async function readOrdersSnapshot(businessId: number) {
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

export function getSnapshotSource(value: unknown): SnapshotSource | null {
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

export async function upsertOrdersSnapshot(
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

export function normalizeOrder(raw: unknown, index: number): NormalizedOrder | null {
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
    imageUrl: asString(record.imageUrl).trim(),
    imageUrls: asStringArray(record.imageUrls),
    referenceImages: normalizeReferenceImages(record.referenceImages),
    statusHistory: asArrayOfRecords(record.statusHistory),
    automationLogs: asArrayOfRecords(record.automationLogs),
    paymentTransactions: asArrayOfRecords(record.paymentTransactions),
    productionStages: normalizeProductionStages(record.productionStages),
    items: asArrayOfRecords(record.items),
    deliveryAddresses: asArrayOfRecords(record.deliveryAddresses),
    deletedAt: toIsoOrNull(record.deletedAt),
  };
}
