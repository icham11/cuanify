"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { startOfDay } from "date-fns";
import {
  SubmitHandler,
  useFieldArray,
  useForm,
  useWatch,
} from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PriceSummaryCard from "@/components/bakery/bookings/PriceSummaryCard";
import { formatCurrency } from "@/components/orders/formatters";
import {
  useOrders,
  type NewOrderInput,
  type OrderItem,
} from "@/components/bakery/store";
import { toast } from "sonner";
import { Plus, Trash2, Upload } from "lucide-react";
import {
  buildWhatsAppTemplate,
  getDisplayFields,
  type BookingFormAutoFill,
  type ParsedWhatsAppDetectedItem,
  type ParsedWhatsAppOrder,
  type ParsedWhatsAppReferenceImage,
  type WhatsAppOrderType,
  type WhatsAppSourceType,
  WHATSAPP_ORDER_LABELS,
} from "@/lib/bookings/whatsapp-parser";
import {
  getDefaultCatalogSelection,
  type CatalogAddOn,
  type CatalogSelection,
  type PricelistCategory,
} from "@/lib/bookings/pricelist";
import {
  getFlavorAddOnIdsByCategory,
  getFlavorOptionsByCategory,
} from "@/lib/bookings/flavor-options";
import { useCatalogAdminState } from "@/lib/bookings/catalog-admin";
import {
  DAILY_PRODUCTION_TOKEN_LIMIT,
  checkSlotAvailability,
  countConcurrentOrdersByTypeForSlot,
  getSlotLimitByOrderType,
  getDeliverySlotsForDate,
  inferOrderTypeFromItems,
  isWithinBusinessHours,
  isDateBlockedForOrdering,
  summarizeProductionTokensByItems,
  type SlotAvailabilityStatus,
  type SlotOrderType,
} from "@/lib/bookings/operations";
import {
  BAKERY_BLOCKED_DATES,
  calculateDownPayment,
  getDownPaymentLabel,
} from "@/lib/bookings/config";
import { calculateOrderTokenFromItems } from "@/lib/bookings/order-token-calculator";
import {
  normalizeDateInput,
  parseSafeDate,
} from "@/lib/helpers/date-normalization";
import {
  DELIVERY_METHOD_OPTIONS,
  estimateOperationalWeightGram,
  getGrabCarOnlyReasons,
  isGrabCarOnlyItem,
  type DeliveryMethod,
  usesShippingEngine,
} from "@/lib/bookings/delivery-rules";
import { useCalendarCapacity } from "@/hooks/useCalendarCapacity";
import {
  getCalendarStatus,
  isPastDate,
} from "@/lib/calendar/getCalendarStatus";
import type {
  ShippingQuote,
  ShippingQuoteItemInput,
  ShippingQuoteResponse,
} from "@/lib/bookings/shipping-types";

const ADDRESS_LOCATION_KEYWORD_PATTERN =
  /\b(jl|jalan|gg|gang|blok|block|no|nomor|rt|rw|perum|perumahan|komplek|kompleks|cluster|apartemen|apartment|tower|unit|ruko|rumah|gedung|kav|kavling|kel|kelurahan|kec|kecamatan|kota|kab|kabupaten)\b/i;
const ADDRESS_NUMBER_PATTERN = /\b\d+[a-zA-Z]?\b/;
const ADDRESS_CONTACT_LABEL_PATTERN =
  /\b(nama\s+penerima|nama\s+customer|penerima|no\.?\s*(telp|hp)|nomor\s*(telp|hp)|telepon|phone|whatsapp|wa)\b/i;
const ADDRESS_PHONE_PATTERN = /(?:^|\D)(?:\+?62|0)\d{7,13}(?:\D|$)/;

function normalizeAddressText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizePostalCodeInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, 5);
}

function extractPostalCodeFromAddress(value: string): string {
  return value.match(/\b\d{5}\b/)?.[0] ?? "";
}

function areaLooksValid(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 3 && /[a-z]/i.test(trimmed);
}

function addressLooksStructured(value: string): boolean {
  const normalized = normalizeAddressText(value);
  if (!normalized) return false;

  const hasLocationKeyword = ADDRESS_LOCATION_KEYWORD_PATTERN.test(normalized);
  const hasNumber = ADDRESS_NUMBER_PATTERN.test(value);
  return hasLocationKeyword && hasNumber;
}

const defaultItemSelection = getDefaultCatalogSelection();

const itemSchema = z.object({
  category: z.string().min(1, "Category is required"),
  subcategory: z.string().min(1, "Subcategory is required"),
  productName: z.string().min(1, "Product is required"),
  size: z.string().min(1, "Size is required"),
  quantity: z.number().int().min(1, "Minimum quantity is 1"),
  tokenDifficulty: z
    .enum(["SIMPLE", "NORMAL", "HARD", "ADVANCED", "EXPERT"])
    .optional(),
  customTokenPerUnit: z.number().int().min(1).max(999).optional(),
  cookiePrice: z.number().min(0).optional(),
  addOns: z.array(z.string()),
  addOnQuantities: z
    .record(z.string(), z.number().int().min(1).max(999))
    .optional(),
  darkColorButtercreamColors: z
    .array(z.string())
    .max(3, "Maksimal 3 warna dark color buttercream.")
    .optional(),
  parsedUnitPrice: z.number().min(0).optional(),
  parsedSubtotal: z.number().min(0).optional(),
  pricingSource: z.enum(["RECAP"]).optional(),
  notes: z.string().max(400).optional().or(z.literal("")),
});

const addressSchema = z.object({
  label: z.string().min(1, "Address label is required"),
  area: z.string().default(""),
  postalCode: z
    .string()
    .default("")
    .refine(
      (value) =>
        value.trim().length === 0 ||
        sanitizePostalCodeInput(value).length === 5,
      "Kode pos harus 5 digit.",
    ),
  addressLine: z.string().min(5, "Address is too short"),
});

const bookingSchema = z
  .object({
    customerName: z.string().min(2, "Customer name is required"),
    phoneNumber: z.string().min(8, "Phone number is required"),
    deliveryDate: z.string().min(1, "Delivery date is required"),
    deliverySlot: z.string().min(1, "Delivery slot is required"),
    deliveryMethod: z.enum([
      "PICKUP",
      "CUSTOMER_APP_COURIER",
      "ASSISTED_GOSEND",
      "ASSISTED_GRAB",
      "ASSISTED_GOCAR",
      "ASSISTED_PAXEL",
      "ASSISTED_SAME_DAY",
      "REGULAR_JNE_JNT",
    ]),
    customNotes: z.string().max(1200).optional().or(z.literal("")),
    paymentStatus: z.enum(["DP Paid", "Paid"]),
    dpPaidAmount: z.number().default(0),
    finalPaidAmount: z.number().default(0),
    manualAdjustment: z.number().default(0),
    items: z.array(itemSchema).min(1, "At least one item is required"),
    deliveryAddresses: z
      .array(addressSchema)
      .min(1, "At least one address is required"),
  })
  .superRefine((values, ctx) => {
    values.deliveryAddresses.forEach((address, index) => {
      const postalCode = sanitizePostalCodeInput(address.postalCode || "");
      const embeddedPostalCode = extractPostalCodeFromAddress(
        address.addressLine || "",
      );

      if (address.postalCode.trim().length > 0 && postalCode.length !== 5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["deliveryAddresses", index, "postalCode"],
          message: "Kode pos harus 5 digit.",
        });
      }

      if (
        ADDRESS_CONTACT_LABEL_PATTERN.test(address.addressLine || "") ||
        ADDRESS_PHONE_PATTERN.test(address.addressLine || "")
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["deliveryAddresses", index, "addressLine"],
          message:
            "Alamat jangan dicampur dengan nama penerima atau nomor telepon.",
        });
      }

      if (usesShippingEngine(values.deliveryMethod) && index === 0) {
        if (!areaLooksValid(address.area || "")) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["deliveryAddresses", index, "area"],
            message:
              "Area wajib diisi minimal Kecamatan / Kota untuk metode shipping otomatis.",
          });
        }

        if (!postalCode && !embeddedPostalCode) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["deliveryAddresses", index, "postalCode"],
            message:
              "Isi kode pos 5 digit agar ongkir dan pembuatan resi lebih akurat.",
          });
        }

        if ((address.addressLine || "").trim().length < 15) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["deliveryAddresses", index, "addressLine"],
            message:
              "Alamat utama terlalu singkat untuk shipping. Isi alamat lengkap.",
          });
        } else if (!addressLooksStructured(address.addressLine || "")) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["deliveryAddresses", index, "addressLine"],
            message:
              "Alamat utama perlu memuat jalan/perumahan/apartemen dan nomor/unit.",
          });
        }
      }
    });
  });

type BookingFormInput = z.input<typeof bookingSchema>;
type BookingFormValues = z.output<typeof bookingSchema>;
type BookingItemInput = BookingFormInput["items"][number];
type ParserSource = WhatsAppSourceType;
type ParserOrderType = WhatsAppOrderType | "unknown";
const EMPTY_ITEMS: BookingFormInput["items"] = [];
const EMPTY_ADDRESSES: BookingFormInput["deliveryAddresses"] = [];

type BouquetFormType = "HAND" | "STANDING";
type TokenDifficultyValue =
  | "SIMPLE"
  | "NORMAL"
  | "HARD"
  | "ADVANCED"
  | "EXPERT";

const BOUQUET_HAND_COST = 100000;
const BOUQUET_STANDING_COST = 250000;
const BOUQUET_HAND_MIN_QTY = 7;
const BOUQUET_HAND_MAX_QTY = 10;
const BOUQUET_STANDING_MIN_QTY = 12;
const BOUQUET_STANDING_MAX_QTY = 20;
const TOKEN_DIFFICULTY_OPTIONS: Array<{
  value: TokenDifficultyValue;
  label: string;
  token: number;
  cookiePrice: number;
}> = [
  { value: "SIMPLE", label: "Simple", token: 1, cookiePrice: 17000 },
  { value: "NORMAL", label: "Normal", token: 2, cookiePrice: 20000 },
  { value: "HARD", label: "Hard", token: 3, cookiePrice: 25000 },
  { value: "ADVANCED", label: "Advanced", token: 4, cookiePrice: 30000 },
  { value: "EXPERT", label: "Expert", token: 5, cookiePrice: 35000 },
];
const BOUQUET_COOKIE_PRICE_BY_DIFFICULTY: Record<TokenDifficultyValue, number> =
  {
    SIMPLE: 17000,
    NORMAL: 20000,
    HARD: 25000,
    ADVANCED: 30000,
    EXPERT: 35000,
  };
const TOKEN_DIFFICULTY_BY_COOKIE_PRICE: Array<{
  price: number;
  difficulty: TokenDifficultyValue;
}> = [
  { price: 17000, difficulty: "SIMPLE" },
  { price: 20000, difficulty: "NORMAL" },
  { price: 25000, difficulty: "HARD" },
  { price: 30000, difficulty: "ADVANCED" },
  { price: 35000, difficulty: "EXPERT" },
];
const CUPCAKE_INDIVIDUAL_MIN_QTY = 10;
const COOKIE_INDIVIDUAL_MIN_QTY = 20;
const DARK_COLOR_BUTTERCREAM_ADDON_ID = "dark-color-buttercream";
const CAKE_QUANTITY_ADDON_IDS = [
  "small-cookies",
  "medium-cookies",
  "large-cookies",
] as const;
const DARK_BUTTERCREAM_COLOR_OPTIONS = [
  "Black",
  "Red",
  "Navy Blue",
  "Forest Green",
  "Electric Blue",
  "Fuschia Pink",
] as const;
const MAX_DARK_BUTTERCREAM_COLORS = 3;
const FRAGILE_ORDER_ALLOWED_METHODS: DeliveryMethod[] = [
  "PICKUP",
  "CUSTOMER_APP_COURIER",
  "ASSISTED_GRAB",
  "ASSISTED_GOCAR",
];
const FRAGILE_ORDER_ALLOWED_METHODS_TEXT =
  "Pickup, Grab/GoCar (pesan customer), Grab admin, atau GoCar admin.";

function normalizeDarkButtercreamColors(value: unknown): string[] {
  const rawValues = Array.isArray(value) ? value : [value];
  const normalized: string[] = [];

  for (const raw of rawValues) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const matched = DARK_BUTTERCREAM_COLOR_OPTIONS.find(
      (option) => option.toLowerCase() === trimmed.toLowerCase(),
    );
    if (!matched || normalized.includes(matched)) continue;

    normalized.push(matched);
    if (normalized.length >= MAX_DARK_BUTTERCREAM_COLORS) break;
  }

  return normalized;
}

function normalizeTokenDifficultyValue(value: unknown): TokenDifficultyValue {
  const normalized =
    typeof value === "string" ? value.trim().toUpperCase() : "";

  if (normalized === "NORMAL" || normalized === "MEDIUM") return "NORMAL";
  if (normalized === "HARD" || normalized === "DIFFICULT") return "HARD";
  if (normalized === "ADVANCED") return "ADVANCED";
  if (normalized === "EXPERT") return "EXPERT";
  return "SIMPLE";
}

function getBouquetCookiePriceFromDifficulty(value: unknown): number {
  return BOUQUET_COOKIE_PRICE_BY_DIFFICULTY[
    normalizeTokenDifficultyValue(value)
  ];
}

function normalizeBouquetCookiePriceValue(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;

  const rounded = Math.round(parsed);
  // Common shorthand from parsed text: 17 means 17k.
  if (rounded < 1000) return rounded * 1000;
  return rounded;
}

function inferTokenDifficultyFromCookiePrice(
  value: unknown,
): TokenDifficultyValue | undefined {
  const normalized = normalizeBouquetCookiePriceValue(value);
  if (!normalized) return undefined;

  return TOKEN_DIFFICULTY_BY_COOKIE_PRICE.find(
    (entry) => entry.price === normalized,
  )?.difficulty;
}

function getBouquetCookiePrice(
  item: Pick<BookingItemInput, "cookiePrice" | "tokenDifficulty">,
): number {
  const explicit = normalizeBouquetCookiePriceValue(item.cookiePrice);
  if (explicit) return explicit;
  return getBouquetCookiePriceFromDifficulty(item.tokenDifficulty);
}

function getTokenDifficultyOption(value: unknown) {
  const normalized = normalizeTokenDifficultyValue(value);
  return (
    TOKEN_DIFFICULTY_OPTIONS.find((option) => option.value === normalized) ??
    TOKEN_DIFFICULTY_OPTIONS[0]
  );
}

interface ItemQuantityRule {
  label: string;
  min: number;
  max?: number;
  helperText?: string;
}

function orderTypeLabel(orderType: SlotOrderType): string {
  return orderType === "SEASONAL" ? "Seasonal/Bulk" : "Custom";
}

function slotStatusLabel(status: SlotAvailabilityStatus): string {
  if (status === "FULL") return "FULL";
  if (status === "ALMOST_FULL") return "ALMOST_FULL";
  return "AVAILABLE";
}

function formatIsoDateToIdLabel(value: string): string {
  const parsed = parseSafeDate(value);
  if (!parsed) return value;
  return parsed.toLocaleDateString("id-ID", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function parseEtaToHours(etaText: string): number {
  const normalized = (etaText || "").toLowerCase();
  const numericMatches = Array.from(normalized.matchAll(/(\d+(?:[.,]\d+)?)/g));
  if (!numericMatches.length) return Number.POSITIVE_INFINITY;

  const numericValues = numericMatches
    .map((match) => Number(String(match[1] || "").replace(",", ".")))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (!numericValues.length) return Number.POSITIVE_INFINITY;

  const minValue = Math.min(...numericValues);
  if (normalized.includes("menit") || normalized.includes("minute")) {
    return minValue / 60;
  }
  if (normalized.includes("hari") || normalized.includes("day")) {
    return minValue * 24;
  }
  return minValue;
}

interface ParseWhatsAppApiResponse {
  success: boolean;
  parsed: ParsedWhatsAppOrder;
  autoFill: BookingFormAutoFill;
  warnings?: string[];
  productionPreviewImageUrl?: string | null;
  visionRawOutput?: string | null;
  error?: string;
}

interface ParseWhatsAppRequestArgs {
  sourceType: ParserSource;
  orderType: ParserOrderType;
  text?: string;
  files?: File[];
  referenceLabels?: string;
}

class ParseWhatsAppApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ParseWhatsAppApiError";
    this.status = status;
  }
}

interface CapacitySingleDateResponse {
  success?: boolean;
  error?: string;
  data?: {
    date?: string;
    usedToken?: number;
    maxToken?: number;
    isAvailable?: boolean;
    tokenNeeded?: number;
  };
}

const whatsappOrderTypeOptions: Array<{
  value: ParserOrderType;
  label: string;
}> = [
  { value: "unknown", label: "Auto Detect" },
  { value: "cake", label: WHATSAPP_ORDER_LABELS.cake },
  { value: "cookies", label: WHATSAPP_ORDER_LABELS.cookies },
  { value: "cupcakes", label: WHATSAPP_ORDER_LABELS.cupcakes },
  { value: "buket", label: WHATSAPP_ORDER_LABELS.buket },
  { value: "cookies_tower", label: WHATSAPP_ORDER_LABELS.cookies_tower },
];
const specificWhatsappOrderTypeOptions = whatsappOrderTypeOptions.filter(
  (option) => option.value !== "unknown",
);

function normalizeReferenceLabelInput(value: string): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();

  for (const rawEntry of value.split(/\n|,|;/g)) {
    const normalized = rawEntry.trim().replace(/\s+/g, " ");
    if (!normalized) continue;

    const matchKey = normalized.toLowerCase();
    if (seen.has(matchKey)) continue;
    seen.add(matchKey);
    labels.push(normalized);
  }

  return labels;
}

function buildParsedReferenceImages(args: {
  parsed: ParsedWhatsAppOrder;
  requestedLabels: string[];
}): ParsedWhatsAppReferenceImage[] {
  const uploadedImageUrls = Array.isArray(args.parsed.uploadedImageUrls)
    ? args.parsed.uploadedImageUrls
    : [];
  const existingReferences = Array.isArray(args.parsed.referenceImages)
    ? args.parsed.referenceImages
    : [];
  const byUrl = new Map<string, ParsedWhatsAppReferenceImage>();

  for (const reference of existingReferences) {
    const url = reference?.url?.trim();
    if (!url) continue;
    byUrl.set(url, {
      url,
      label: reference.label?.trim() || undefined,
      orderIndex:
        typeof reference.orderIndex === "number" &&
        Number.isFinite(reference.orderIndex)
          ? reference.orderIndex
          : undefined,
    });
  }

  uploadedImageUrls.forEach((url, index) => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;

    const existing = byUrl.get(trimmedUrl);
    const requestedLabel = args.requestedLabels[index];
    byUrl.set(trimmedUrl, {
      url: trimmedUrl,
      label: requestedLabel || existing?.label,
      orderIndex:
        existing?.orderIndex ??
        (requestedLabel || uploadedImageUrls.length > 1 ? index : undefined),
    });
  });

  return Array.from(byUrl.values());
}

function summarizeDetectedItems(
  items: BookingFormAutoFill["items"],
): ParsedWhatsAppDetectedItem[] {
  return items.map((item) => ({
    orderType:
      item.category === "Cupcakes"
        ? "cupcakes"
        : item.category === "Cookies"
          ? "cookies"
          : item.category === "Buket"
            ? "buket"
            : item.category === "Cookies Tower"
              ? "cookies_tower"
              : "cake",
    category: item.category,
    productName: item.productName,
    size: item.size,
    quantity: item.quantity,
  }));
}

function getParsedSubtotalOverride(
  item:
    | Pick<
        BookingItemInput,
        "parsedSubtotal" | "parsedUnitPrice" | "quantity" | "pricingSource"
      >
    | undefined
    | null,
): number | null {
  if (!item || item.pricingSource !== "RECAP") return null;

  const subtotal = Number(item.parsedSubtotal);
  if (Number.isFinite(subtotal) && subtotal > 0) {
    return Math.round(subtotal);
  }

  const unitPrice = Number(item.parsedUnitPrice);
  const quantity = Number(item.quantity) || 0;
  if (Number.isFinite(unitPrice) && unitPrice > 0 && quantity > 0) {
    return Math.round(unitPrice * quantity);
  }

  return null;
}

function getParsedUnitPriceOverride(
  item:
    | Pick<BookingItemInput, "parsedUnitPrice" | "pricingSource">
    | undefined
    | null,
): number | null {
  if (!item || item.pricingSource !== "RECAP") return null;

  const unitPrice = Number(item.parsedUnitPrice);
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return null;
  return Math.round(unitPrice);
}

function hasParsedPricingOverride(
  item:
    | Pick<
        BookingItemInput,
        "parsedSubtotal" | "parsedUnitPrice" | "quantity" | "pricingSource"
      >
    | undefined
    | null,
): boolean {
  return getParsedSubtotalOverride(item) !== null;
}

function getDefaultSelectionFromCatalog(
  catalog: PricelistCategory[],
  preferredCategory?: string,
): CatalogSelection {
  const categoryData =
    catalog.find((entry) => entry.category === preferredCategory) ?? catalog[0];
  const subcategoryData = categoryData?.subcategories[0];
  const productData = subcategoryData?.products[0];
  const variantData =
    productData?.variants.find(
      (entry) => entry.label === productData.defaultVariant,
    ) ?? productData?.variants[0];

  return {
    category: categoryData?.category ?? "Cake",
    subcategory: subcategoryData?.name ?? "",
    productName: productData?.name ?? "",
    size: variantData?.label ?? "",
  };
}

function ensureSelectionFromCatalog(
  catalog: PricelistCategory[],
  partial: Partial<CatalogSelection>,
): CatalogSelection {
  const fallback = getDefaultSelectionFromCatalog(catalog, partial.category);
  const categoryData =
    catalog.find((entry) => entry.category === partial.category) ??
    catalog.find((entry) => entry.category === fallback.category);

  if (!categoryData) return fallback;

  const subcategoryData =
    categoryData.subcategories.find(
      (entry) => entry.name === partial.subcategory,
    ) ?? categoryData.subcategories[0];
  const productData =
    subcategoryData?.products.find(
      (entry) => entry.name === partial.productName,
    ) ?? subcategoryData?.products[0];
  const variantData =
    productData?.variants.find((entry) => entry.label === partial.size) ??
    productData?.variants.find(
      (entry) => entry.label === productData.defaultVariant,
    ) ??
    productData?.variants[0];

  return {
    category: categoryData.category,
    subcategory: subcategoryData?.name ?? "",
    productName: productData?.name ?? "",
    size: variantData?.label ?? "",
  };
}

function getVariantsFromCatalog(
  catalog: PricelistCategory[],
  selection: CatalogSelection,
) {
  const categoryData = catalog.find(
    (entry) => entry.category === selection.category,
  );
  const subcategoryData = categoryData?.subcategories.find(
    (entry) => entry.name === selection.subcategory,
  );
  const productData = subcategoryData?.products.find(
    (entry) => entry.name === selection.productName,
  );
  return productData?.variants ?? [];
}

function getUnitPriceFromCatalog(
  catalog: PricelistCategory[],
  selection: CatalogSelection,
): number {
  const variants = getVariantsFromCatalog(catalog, selection);
  const selected = variants.find((entry) => entry.label === selection.size);
  return selected?.price ?? variants[0]?.price ?? 0;
}

function getCategoryAddOnsFromCatalog(
  addOnCatalog: Record<string, CatalogAddOn[]>,
  category: string,
) {
  return addOnCatalog[category] ?? [];
}

function getFlavorOptionsForCategory(category: string) {
  return getFlavorOptionsByCategory(category);
}

function getNonFlavorAddOnsForCategory(args: {
  addOns: CatalogAddOn[];
  category: string;
}): CatalogAddOn[] {
  const flavorIds = new Set(getFlavorAddOnIdsByCategory(args.category));
  if (flavorIds.size === 0) return args.addOns;
  return args.addOns.filter((addon) => !flavorIds.has(addon.id));
}

function normalizeAddOnQuantities(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};

  const next: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) continue;
    next[key] = Math.max(1, Math.round(parsed));
  }

  return next;
}

function supportsAddOnQuantity(category: string, addonId: string): boolean {
  return (
    category === "Cake" &&
    CAKE_QUANTITY_ADDON_IDS.includes(
      addonId as (typeof CAKE_QUANTITY_ADDON_IDS)[number],
    )
  );
}

function getAddOnUnitMultiplier(args: {
  category: string;
  addonId: string;
  addOnQuantities: Record<string, number>;
}): number {
  if (!supportsAddOnQuantity(args.category, args.addonId)) return 1;
  return Math.max(1, args.addOnQuantities[args.addonId] ?? 1);
}

function calculatePerUnitAddOnPrice(args: {
  category: string;
  selectedAddOnIds: string[];
  addOnQuantities: Record<string, number>;
  addOnCatalogEntries: CatalogAddOn[];
}): number {
  return args.selectedAddOnIds.reduce((sum, addonId) => {
    const addon = args.addOnCatalogEntries.find(
      (entry) => entry.id === addonId,
    );
    if (!addon) return sum;

    const multiplier = getAddOnUnitMultiplier({
      category: args.category,
      addonId,
      addOnQuantities: args.addOnQuantities,
    });
    return sum + addon.price * multiplier;
  }, 0);
}

function getSelectedFlavorIdFromItem(item: BookingItemInput): string | null {
  const flavorOptions = getFlavorOptionsForCategory(item.category);
  if (flavorOptions.length === 0) return null;

  const selected = flavorOptions.find((option) =>
    (item.addOns ?? []).includes(option.id),
  );
  return selected?.id ?? null;
}

function detectBouquetTypeFromItem(
  item: BookingItemInput,
): BouquetFormType | null {
  if (item.category !== "Buket") return null;
  const source =
    `${item.subcategory || ""} ${item.productName || ""} ${item.size || ""}`.toLowerCase();
  if (source.includes("standing")) return "STANDING";
  if (source.includes("hand")) return "HAND";
  return null;
}

function getBouquetCostByType(type: BouquetFormType): number {
  return type === "HAND" ? BOUQUET_HAND_COST : BOUQUET_STANDING_COST;
}

function getBouquetMinQuantity(type: BouquetFormType): number {
  return type === "HAND" ? BOUQUET_HAND_MIN_QTY : BOUQUET_STANDING_MIN_QTY;
}

function resolveBouquetSelectionByType(
  catalog: PricelistCategory[],
  type: BouquetFormType,
): CatalogSelection | null {
  const bouquetCategory = catalog.find((entry) => entry.category === "Buket");
  if (!bouquetCategory) return null;

  const expectedKeyword = type === "HAND" ? "hand" : "standing";
  const matchingSubcategory = bouquetCategory.subcategories.find((sub) =>
    sub.products.some((product) =>
      product.name.toLowerCase().includes(expectedKeyword),
    ),
  );
  const fallbackSubcategory =
    matchingSubcategory ?? bouquetCategory.subcategories[0];
  const matchingProduct = fallbackSubcategory?.products.find((product) =>
    product.name.toLowerCase().includes(expectedKeyword),
  );

  if (!fallbackSubcategory || !matchingProduct) return null;

  return ensureSelectionFromCatalog(catalog, {
    category: bouquetCategory.category,
    subcategory: fallbackSubcategory.name,
    productName: matchingProduct.name,
  });
}

function isValidBouquetQuantity(
  quantity: number,
  type: BouquetFormType,
): boolean {
  if (type === "HAND") {
    return quantity >= BOUQUET_HAND_MIN_QTY && quantity <= BOUQUET_HAND_MAX_QTY;
  }
  return (
    quantity >= BOUQUET_STANDING_MIN_QTY && quantity <= BOUQUET_STANDING_MAX_QTY
  );
}

function getBouquetQtyRangeLabel(type: BouquetFormType): string {
  if (type === "HAND") {
    return `${BOUQUET_HAND_MIN_QTY}-${BOUQUET_HAND_MAX_QTY}`;
  }
  return `${BOUQUET_STANDING_MIN_QTY}-${BOUQUET_STANDING_MAX_QTY}`;
}

function getQuantityRuleViolationMessage(rule: ItemQuantityRule): string {
  if (typeof rule.max === "number") {
    return `Qty wajib ${rule.min}-${rule.max}.`;
  }
  return `Minimal qty ${rule.min}.`;
}

function formatCompactSurcharge(value: number): string {
  const rounded = Math.round(Number(value) || 0);
  if (rounded <= 0) return "0";
  if (rounded % 1000 === 0) {
    return `${Math.round(rounded / 1000)}k`;
  }
  return formatCurrency(rounded);
}

function getIndividualCupcakeQuantityRule(
  item: BookingItemInput,
): ItemQuantityRule | null {
  if (item.category !== "Cupcakes") return null;

  const source =
    `${item.subcategory || ""} ${item.productName || ""} ${item.size || ""}`.toLowerCase();
  if (!source.includes("individual")) return null;

  if (source.includes(">=100")) {
    return {
      label: "Quantity (pcs)",
      min: 100,
      helperText: "Individual cupcakes minimal 100 pcs.",
    };
  }

  if (source.includes(">=50")) {
    return {
      label: "Quantity (pcs)",
      min: 50,
      helperText: "Individual cupcakes minimal 50 pcs.",
    };
  }

  if (source.includes("25-49")) {
    return {
      label: "Quantity (pcs)",
      min: 25,
      max: 49,
      helperText: "Individual cupcakes qty wajib 25-49 pcs.",
    };
  }

  if (source.includes("10-24")) {
    return {
      label: "Quantity (pcs)",
      min: CUPCAKE_INDIVIDUAL_MIN_QTY,
      max: 24,
      helperText: "Individual cupcakes qty wajib 10-24 pcs.",
    };
  }

  return {
    label: "Quantity (pcs)",
    min: CUPCAKE_INDIVIDUAL_MIN_QTY,
    helperText: `Individual cupcakes minimal ${CUPCAKE_INDIVIDUAL_MIN_QTY} pcs.`,
  };
}

function getAutoQuantityForItem(item: BookingItemInput): number | null {
  const bouquetType = detectBouquetTypeFromItem(item);
  if (bouquetType) {
    return getBouquetMinQuantity(bouquetType);
  }

  const individualCupcakeRule = getIndividualCupcakeQuantityRule(item);
  if (individualCupcakeRule) {
    return individualCupcakeRule.min;
  }

  return null;
}

function getItemQuantityRule(item: BookingItemInput): ItemQuantityRule {
  const source =
    `${item.subcategory || ""} ${item.productName || ""} ${item.size || ""}`.toLowerCase();

  const bouquetType = detectBouquetTypeFromItem(item);
  if (bouquetType === "HAND") {
    return {
      label: "Quantity (unit bouquet / isi cookies)",
      min: 1,
      helperText: `Hand bouquet: isi cookies ${BOUQUET_HAND_MIN_QTY}-${BOUQUET_HAND_MAX_QTY}. Qty 1-${BOUQUET_HAND_MIN_QTY - 1} dibaca sebagai jumlah unit bouquet (harga start from).`,
    };
  }
  if (bouquetType === "STANDING") {
    return {
      label: "Quantity (unit bouquet / isi cookies)",
      min: 1,
      helperText: `Standing bouquet: isi cookies ${getBouquetQtyRangeLabel("STANDING")}. Qty 1-${BOUQUET_STANDING_MIN_QTY - 1} dibaca sebagai jumlah unit bouquet (harga start from).`,
    };
  }

  if (item.category === "Cupcakes") {
    const individualCupcakeRule = getIndividualCupcakeQuantityRule(item);
    if (individualCupcakeRule) {
      return individualCupcakeRule;
    }
    if (
      source.includes("dozen") ||
      source.includes("12 pcs") ||
      source.includes("12pcs") ||
      source.includes("lusin")
    ) {
      return {
        label: "Quantity (dozen box)",
        min: 1,
        helperText: "1 qty = 1 lusin (12 pcs).",
      };
    }
  }

  if (item.category === "Cookies" && source.includes("individual cookie")) {
    return {
      label: "Quantity (pcs)",
      min: COOKIE_INDIVIDUAL_MIN_QTY,
      helperText: `Individual cookie minimal ${COOKIE_INDIVIDUAL_MIN_QTY} pcs.`,
    };
  }

  if (item.category === "Cake") {
    return {
      label: "Quantity (cake)",
      min: 1,
      helperText: "1 qty = 1 cake.",
    };
  }

  if (item.category === "Cookies Tower") {
    return {
      label: "Quantity (tower)",
      min: 1,
      helperText: "1 qty = 1 tower (40 cookies).",
    };
  }

  return {
    label: "Quantity",
    min: 1,
  };
}

function getBouquetLineTotal(item: BookingItemInput): number | null {
  const bouquetType = detectBouquetTypeFromItem(item);
  if (!bouquetType) return null;

  const quantity = Number(item.quantity) || 0;
  const cookiePrice = getBouquetCookiePrice(item);
  if (quantity <= 0) return null;
  if (!isValidBouquetQuantity(quantity, bouquetType)) return null;

  return Math.round(cookiePrice * quantity + getBouquetCostByType(bouquetType));
}

function normalizeVariantLabel(value: string): string {
  return value.toLowerCase();
}

function isMediumVariantLabel(value: string): boolean {
  const normalized = normalizeVariantLabel(value);
  return normalized.includes("medium") || normalized.includes("mid");
}

function isLargeVariantLabel(value: string): boolean {
  const normalized = normalizeVariantLabel(value);
  return normalized.includes("large") || normalized.includes("xl");
}

function resolveBouquetVariantForPaxel(
  variants: Array<{ label: string; price: number }>,
): string | null {
  if (!variants.length) return null;

  const nonMediumVariants = variants.filter(
    (variant) => !isMediumVariantLabel(variant.label),
  );
  const candidates =
    nonMediumVariants.length > 0 ? nonMediumVariants : variants;
  const largeVariant = candidates.find((variant) =>
    isLargeVariantLabel(variant.label),
  );

  return largeVariant?.label ?? candidates[0]?.label ?? null;
}

function getItemBasePrice(
  catalog: PricelistCategory[],
  item: BookingItemInput,
): number {
  const parsedSubtotal = getParsedSubtotalOverride(item);
  if (parsedSubtotal !== null) {
    return parsedSubtotal;
  }

  const bouquetLineTotal = getBouquetLineTotal(item);
  if (item.category === "Buket" && bouquetLineTotal !== null) {
    return bouquetLineTotal;
  }

  const unit = getUnitPriceFromCatalog(catalog, {
    category: item.category,
    subcategory: item.subcategory,
    productName: item.productName,
    size: item.size,
  });
  const qty = Number(item.quantity) || 0;
  return unit * qty;
}

function getItemProductionToken(item: BookingItemInput): number {
  return calculateOrderTokenFromItems([
    {
      category: item.category,
      subcategory: item.subcategory,
      productName: item.productName,
      quantity: Number(item.quantity) || 0,
      tokenDifficulty: item.tokenDifficulty,
      customTokenPerUnit: item.customTokenPerUnit,
    },
  ]);
}

export default function BookingForm() {
  const { addOrder, orders } = useOrders();
  const { productCatalog, addOnCatalog } = useCatalogAdminState();
  const [quickPaste, setQuickPaste] = useState("");
  const [selectedOrderType, setSelectedOrderType] =
    useState<ParserOrderType>("unknown");
  const [showOrderTypeSelector, setShowOrderTypeSelector] = useState(false);
  const [isParsingWhatsApp, setIsParsingWhatsApp] = useState(false);
  const [isFetchingMarketplaceEmail, setIsFetchingMarketplaceEmail] =
    useState(false);
  const [parsedPreview, setParsedPreview] =
    useState<ParsedWhatsAppOrder | null>(null);
  const [productionPreviewImageUrl, setProductionPreviewImageUrl] =
    useState("");
  const [visionRawOutput, setVisionRawOutput] = useState("");
  const [draftImported, setDraftImported] = useState(false);
  const [referenceImageFiles, setReferenceImageFiles] = useState<File[]>([]);
  const [referenceFilesChangedSinceParse, setReferenceFilesChangedSinceParse] =
    useState(false);
  const [referenceImageLabelsInput, setReferenceImageLabelsInput] =
    useState("");
  const [referenceFileInputKey, setReferenceFileInputKey] = useState(0);
  const [shippingQuotes, setShippingQuotes] = useState<ShippingQuote[]>([]);
  const [selectedShippingQuoteId, setSelectedShippingQuoteId] = useState("");
  const [shippingDistanceKm, setShippingDistanceKm] = useState<number | null>(
    null,
  );
  const [shippingDistanceSource, setShippingDistanceSource] =
    useState<ShippingQuoteResponse["distanceSource"]>(undefined);
  const [shippingWarning, setShippingWarning] = useState("");
  const [showAllShippingOptions, setShowAllShippingOptions] = useState(false);
  const [isCheckingShipping, setIsCheckingShipping] = useState(false);
  const [isCapacityValidating, setIsCapacityValidating] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

  const {
    register,
    handleSubmit,
    setValue,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BookingFormInput, unknown, BookingFormValues>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      customerName: "",
      phoneNumber: "",
      deliveryDate: "",
      deliverySlot: "",
      deliveryMethod: "REGULAR_JNE_JNT",
      customNotes: "",
      paymentStatus: "DP Paid",
      dpPaidAmount: 0,
      finalPaidAmount: 0,
      manualAdjustment: 0,
      items: [
        {
          category: defaultItemSelection.category,
          subcategory: defaultItemSelection.subcategory,
          productName: defaultItemSelection.productName,
          size: defaultItemSelection.size,
          quantity:
            getAutoQuantityForItem({
              category: defaultItemSelection.category,
              subcategory: defaultItemSelection.subcategory,
              productName: defaultItemSelection.productName,
              size: defaultItemSelection.size,
              quantity: 1,
              tokenDifficulty: "SIMPLE",
              customTokenPerUnit: undefined,
              cookiePrice: undefined,
              addOns: [],
              addOnQuantities: {},
              notes: "",
            }) ?? 1,
          tokenDifficulty: "SIMPLE",
          customTokenPerUnit: undefined,
          cookiePrice: undefined,
          addOns: [],
          addOnQuantities: {},
          darkColorButtercreamColors: [],
          parsedUnitPrice: undefined,
          parsedSubtotal: undefined,
          pricingSource: undefined,
          notes: "",
        },
      ],
      deliveryAddresses: [
        {
          label: "Primary",
          area: "",
          postalCode: "",
          addressLine: "",
        },
      ],
    },
  });

  const {
    fields: itemFields,
    append: appendItem,
    remove: removeItem,
  } = useFieldArray({
    control,
    name: "items",
  });

  const {
    fields: addressFields,
    append: appendAddress,
    remove: removeAddress,
  } = useFieldArray({
    control,
    name: "deliveryAddresses",
  });

  const watchedItems = useWatch({ control, name: "items" }) ?? EMPTY_ITEMS;
  const watchedAddresses =
    useWatch({ control, name: "deliveryAddresses" }) ?? EMPTY_ADDRESSES;
  const deliveryDate = useWatch({ control, name: "deliveryDate" });
  const deliverySlot = useWatch({ control, name: "deliverySlot" });
  const deliveryMethod =
    useWatch({ control, name: "deliveryMethod" }) ?? "REGULAR_JNE_JNT";
  const manualAdjustment = useWatch({ control, name: "manualAdjustment" }) ?? 0;
  const dpPaidInput = useWatch({ control, name: "dpPaidAmount" }) ?? 0;
  const finalPaidInput = useWatch({ control, name: "finalPaidAmount" }) ?? 0;

  const clearParsedPricingOverride = useCallback(
    (itemIndex: number) => {
      setValue(`items.${itemIndex}.parsedUnitPrice`, undefined, {
        shouldValidate: true,
      });
      setValue(`items.${itemIndex}.parsedSubtotal`, undefined, {
        shouldValidate: true,
      });
      setValue(`items.${itemIndex}.pricingSource`, undefined, {
        shouldValidate: true,
      });
    },
    [setValue],
  );

  const autofillPostalCodeFromAddress = useCallback(
    (addressIndex: number, addressLine: string) => {
      const extractedPostalCode = extractPostalCodeFromAddress(addressLine);
      if (!extractedPostalCode) return;

      const currentPostalCode = sanitizePostalCodeInput(
        watchedAddresses[addressIndex]?.postalCode ?? "",
      );
      if (currentPostalCode) return;

      setValue(
        `deliveryAddresses.${addressIndex}.postalCode`,
        extractedPostalCode,
        {
          shouldValidate: true,
        },
      );
    },
    [setValue, watchedAddresses],
  );

  const normalizedDeliveryDate = useMemo(
    () => normalizeDateInput(deliveryDate) ?? "",
    [deliveryDate],
  );

  const selectedCalendarDate = useMemo(() => {
    const parsed = parseSafeDate(normalizedDeliveryDate);
    return parsed ?? startOfDay(new Date());
  }, [normalizedDeliveryDate]);

  const {
    getCapacity: getCalendarCapacity,
    isLoading: isCalendarCapacityLoading,
    refetch: refetchSelectedDateCapacity,
  } = useCalendarCapacity(selectedCalendarDate, selectedCalendarDate);

  const selectedCalendarStatus = useMemo(() => {
    if (!normalizedDeliveryDate) {
      return "AVAILABLE" as const;
    }
    const selectedCapacity = getCalendarCapacity(normalizedDeliveryDate);
    return getCalendarStatus({
      usedToken: selectedCapacity.usedToken,
      maxToken: selectedCapacity.maxToken,
      date: normalizedDeliveryDate,
    });
  }, [normalizedDeliveryDate, getCalendarCapacity]);

  const calendarDateError = useMemo(() => {
    if (selectedCalendarStatus === "PAST") {
      return "Tanggal sudah terlewat";
    }
    if (selectedCalendarStatus === "FULL") {
      return "Tanggal sudah penuh";
    }
    if (selectedCalendarStatus === "CUTOFF") {
      return "Pemesanan H-1 sudah ditutup (setelah jam 10 pagi)";
    }
    return "";
  }, [selectedCalendarStatus]);

  const isCalendarDateInvalid =
    selectedCalendarStatus === "PAST" ||
    selectedCalendarStatus === "FULL" ||
    selectedCalendarStatus === "CUTOFF";

  const basePrice = useMemo(() => {
    return watchedItems.reduce((sum, item) => {
      return sum + getItemBasePrice(productCatalog, item);
    }, 0);
  }, [watchedItems, productCatalog]);

  useEffect(() => {
    if (deliveryMethod !== "ASSISTED_PAXEL") return;

    watchedItems.forEach((item, index) => {
      if ((item.category || "") !== "Buket") return;

      const normalizedSelection = ensureSelectionFromCatalog(productCatalog, {
        category: item.category,
        subcategory: item.subcategory,
        productName: item.productName,
        size: item.size,
      });
      const variants = getVariantsFromCatalog(
        productCatalog,
        normalizedSelection,
      );
      if (!variants.length) return;

      const preferredSize = resolveBouquetVariantForPaxel(variants);
      if (!preferredSize) return;
      if (preferredSize === normalizedSelection.size) return;

      clearParsedPricingOverride(index);
      setValue(`items.${index}.size`, preferredSize, {
        shouldValidate: true,
      });
    });
  }, [
    clearParsedPricingOverride,
    deliveryMethod,
    watchedItems,
    productCatalog,
    setValue,
  ]);

  useEffect(() => {
    watchedItems.forEach((item, index) => {
      if ((item?.category || "") !== "Buket") return;

      const normalizedSelection = ensureSelectionFromCatalog(productCatalog, {
        category: item?.category,
        subcategory: item?.subcategory,
        productName: item?.productName,
        size: item?.size,
      });

      const bouquetType = detectBouquetTypeFromItem({
        category: normalizedSelection.category,
        subcategory: normalizedSelection.subcategory,
        productName: normalizedSelection.productName,
        size: normalizedSelection.size,
        quantity: Number(item?.quantity) || 0,
        tokenDifficulty: item?.tokenDifficulty,
        customTokenPerUnit:
          Number(item?.customTokenPerUnit) > 0
            ? Number(item?.customTokenPerUnit)
            : undefined,
        cookiePrice:
          Number(item?.cookiePrice) > 0 ? Number(item?.cookiePrice) : undefined,
        addOns: item?.addOns ?? [],
        notes: item?.notes ?? "",
      });

      if (bouquetType !== "HAND") return;

      const quantity = Number(item?.quantity) || 0;
      if (quantity < BOUQUET_STANDING_MIN_QTY) return;

      const standingSelection = resolveBouquetSelectionByType(
        productCatalog,
        "STANDING",
      );
      if (!standingSelection) return;

      if (normalizedSelection.subcategory !== standingSelection.subcategory) {
        clearParsedPricingOverride(index);
        setValue(`items.${index}.subcategory`, standingSelection.subcategory, {
          shouldValidate: true,
        });
      }
      if (normalizedSelection.productName !== standingSelection.productName) {
        clearParsedPricingOverride(index);
        setValue(`items.${index}.productName`, standingSelection.productName, {
          shouldValidate: true,
        });
      }
      if (normalizedSelection.size !== standingSelection.size) {
        clearParsedPricingOverride(index);
        setValue(`items.${index}.size`, standingSelection.size, {
          shouldValidate: true,
        });
      }
    });
  }, [clearParsedPricingOverride, watchedItems, productCatalog, setValue]);

  const addOnTotal = useMemo(() => {
    return watchedItems.reduce((sum, item) => {
      if (hasParsedPricingOverride(item)) {
        return sum;
      }

      const categoryAddOns = getCategoryAddOnsFromCatalog(
        addOnCatalog,
        item.category,
      );
      const normalizedAddOnQuantities = normalizeAddOnQuantities(
        item.addOnQuantities,
      );
      const perItemAddOn = calculatePerUnitAddOnPrice({
        category: item.category,
        selectedAddOnIds: item.addOns ?? [],
        addOnQuantities: normalizedAddOnQuantities,
        addOnCatalogEntries: categoryAddOns,
      });
      return sum + perItemAddOn * (Number(item.quantity) || 0);
    }, 0);
  }, [watchedItems, addOnCatalog]);

  const shouldUseShippingEngine = useMemo(
    () => usesShippingEngine(deliveryMethod as DeliveryMethod),
    [deliveryMethod],
  );
  const hasBouquetItems = useMemo(
    () => watchedItems.some((item) => (item.category || "") === "Buket"),
    [watchedItems],
  );

  const methodSpecificShippingQuotes = useMemo(() => {
    if (!shouldUseShippingEngine) return [];

    const isCarService = (quote: ShippingQuote) => {
      const source =
        `${quote.courierCode} ${quote.courierServiceCode} ${quote.courierServiceName}`.toLowerCase();
      return (
        source.includes("gocar") ||
        source.includes("go car") ||
        source.includes("car") ||
        source.includes("4w") ||
        source.includes("suv") ||
        source.includes("van")
      );
    };

    const isBikeService = (quote: ShippingQuote) => {
      const source =
        `${quote.courierCode} ${quote.courierServiceCode} ${quote.courierServiceName}`.toLowerCase();
      const hasCarMarker =
        source.includes("gocar") ||
        source.includes("go car") ||
        source.includes("car") ||
        source.includes("4w") ||
        source.includes("suv") ||
        source.includes("van");

      const hasBikeMarker =
        source.includes("gosend") ||
        source.includes("go send") ||
        source.includes("bike") ||
        source.includes("motor") ||
        source.includes("instant") ||
        source.includes("same day") ||
        source.includes("sameday") ||
        source.includes("2w");

      if (hasBikeMarker && !hasCarMarker) return true;

      // If provider is GOJEK and no explicit car marker, treat it as bike by default.
      return quote.provider === "GOJEK" && !hasCarMarker;
    };

    const isUnsafeRegularServiceForBouquet = (quote: ShippingQuote) => {
      const source =
        `${quote.courierCode} ${quote.courierServiceCode} ${quote.courierServiceName}`.toLowerCase();

      return (
        source.includes("trucking") ||
        source.includes("cargo") ||
        source.includes("truck")
      );
    };

    const gojekQuotes = shippingQuotes.filter(
      (quote) => quote.provider === "GOJEK",
    );
    const grabQuotes = shippingQuotes.filter(
      (quote) => quote.provider === "GRAB",
    );
    const sameDayQuotes = shippingQuotes.filter(
      (quote) =>
        quote.provider === "GOJEK" ||
        quote.provider === "GRAB" ||
        quote.provider === "PAXEL",
    );

    if (deliveryMethod === "ASSISTED_PAXEL") {
      const paxelQuotes = shippingQuotes.filter(
        (quote) => quote.provider === "PAXEL",
      );
      return paxelQuotes;
    }

    if (deliveryMethod === "ASSISTED_GRAB") {
      return grabQuotes;
    }

    if (deliveryMethod === "ASSISTED_GOSEND") {
      const gojekBikeQuotes = gojekQuotes.filter(isBikeService);
      if (gojekBikeQuotes.length > 0) {
        return gojekBikeQuotes;
      }

      if (gojekQuotes.length > 0) {
        return gojekQuotes;
      }

      // Operational fallback: keep same-day options visible when GoSend is unavailable.
      return sameDayQuotes;
    }

    if (deliveryMethod === "ASSISTED_GOCAR") {
      const gojekCarQuotes = gojekQuotes.filter(isCarService);
      if (gojekCarQuotes.length > 0) {
        return gojekCarQuotes;
      }

      const gojekNonBikeQuotes = gojekQuotes.filter(
        (quote) => !isBikeService(quote),
      );
      if (gojekNonBikeQuotes.length > 0) {
        return gojekNonBikeQuotes;
      }

      return gojekQuotes;
    }

    if (deliveryMethod === "REGULAR_JNE_JNT") {
      const regularQuotes = shippingQuotes.filter(
        (quote) => quote.provider === "JNE" || quote.provider === "JNT",
      );

      if (!hasBouquetItems) {
        return regularQuotes;
      }

      const bouquetSafeRegularQuotes = regularQuotes.filter(
        (quote) => !isUnsafeRegularServiceForBouquet(quote),
      );

      return bouquetSafeRegularQuotes;
    }

    if (deliveryMethod === "ASSISTED_SAME_DAY") {
      return shippingQuotes.filter(
        (quote) =>
          quote.provider === "GOJEK" ||
          quote.provider === "GRAB" ||
          quote.provider === "PAXEL",
      );
    }

    return shippingQuotes;
  }, [
    deliveryMethod,
    hasBouquetItems,
    shippingQuotes,
    shouldUseShippingEngine,
  ]);

  const isStrictDeliveryMethod =
    deliveryMethod === "ASSISTED_PAXEL" ||
    deliveryMethod === "ASSISTED_GOSEND" ||
    deliveryMethod === "ASSISTED_GRAB" ||
    deliveryMethod === "ASSISTED_GOCAR" ||
    deliveryMethod === "REGULAR_JNE_JNT";

  const isShippingFallbackActive =
    shouldUseShippingEngine &&
    isStrictDeliveryMethod &&
    shippingQuotes.length > 0 &&
    methodSpecificShippingQuotes.length === 0;

  const filteredShippingQuotes = useMemo(() => {
    const bestByService = new Map<string, ShippingQuote>();
    for (const quote of methodSpecificShippingQuotes) {
      const key = `${quote.provider}:${quote.courierCode}:${quote.courierServiceCode}`;
      const existing = bestByService.get(key);
      if (!existing || quote.price < existing.price) {
        bestByService.set(key, quote);
      }
    }

    return Array.from(bestByService.values()).sort((a, b) => a.price - b.price);
  }, [methodSpecificShippingQuotes]);

  const cheapestShippingQuote = filteredShippingQuotes[0] ?? null;

  const fastestShippingQuote = useMemo(() => {
    let bestQuote: ShippingQuote | null = null;
    let bestEtaHours = Number.POSITIVE_INFINITY;

    for (const quote of filteredShippingQuotes) {
      const etaHours = parseEtaToHours(quote.eta);
      if (!bestQuote || etaHours < bestEtaHours) {
        bestQuote = quote;
        bestEtaHours = etaHours;
        continue;
      }

      if (etaHours === bestEtaHours && quote.price < bestQuote.price) {
        bestQuote = quote;
      }
    }

    return bestQuote;
  }, [filteredShippingQuotes]);

  const displayedShippingQuotes = useMemo(() => {
    if (showAllShippingOptions || filteredShippingQuotes.length <= 3) {
      return filteredShippingQuotes;
    }
    return filteredShippingQuotes.slice(0, 3);
  }, [filteredShippingQuotes, showAllShippingOptions]);

  const shippingFallbackMessage = useMemo(() => {
    if (!isShippingFallbackActive) return "";

    if (deliveryMethod === "ASSISTED_PAXEL") {
      return "Layanan Paxel belum tersedia untuk alamat ini. Pilih metode lain atau ubah alamat penerima.";
    }
    if (deliveryMethod === "ASSISTED_GRAB") {
      return "Layanan Grab belum tersedia untuk alamat ini. Pilih metode lain atau ubah alamat penerima.";
    }
    if (deliveryMethod === "ASSISTED_GOSEND") {
      return "Layanan GoSend belum tersedia untuk alamat ini. Pilih metode lain atau ubah alamat penerima.";
    }
    if (deliveryMethod === "ASSISTED_GOCAR") {
      return "Layanan GoCar belum tersedia untuk alamat ini. Pilih metode lain atau ubah alamat penerima.";
    }
    if (deliveryMethod === "REGULAR_JNE_JNT") {
      if (hasBouquetItems) {
        return "Untuk bouquet, layanan reguler yang aman belum tersedia untuk alamat ini. Coba metode lain atau ubah alamat penerima.";
      }
      return "Layanan JNE/J&T belum tersedia untuk alamat ini. Pilih metode lain atau ubah alamat penerima.";
    }
    return "Layanan kurir pada metode terpilih belum tersedia. Pilih metode lain atau ubah alamat penerima.";
  }, [deliveryMethod, hasBouquetItems, isShippingFallbackActive]);

  const selectedShippingQuote = useMemo(
    () =>
      filteredShippingQuotes.find(
        (quote) => quote.id === selectedShippingQuoteId,
      ) ?? null,
    [filteredShippingQuotes, selectedShippingQuoteId],
  );

  const shouldAutoSwitchGoSendToSameDay =
    deliveryMethod === "ASSISTED_GOSEND" &&
    filteredShippingQuotes.length > 0 &&
    !filteredShippingQuotes.some((quote) => quote.provider === "GOJEK");

  useEffect(() => {
    setShowAllShippingOptions(false);

    if (!filteredShippingQuotes.length) {
      setSelectedShippingQuoteId("");
      return;
    }

    setSelectedShippingQuoteId((current) => {
      if (
        current &&
        filteredShippingQuotes.some((quote) => quote.id === current)
      ) {
        return current;
      }
      return filteredShippingQuotes[0]?.id || "";
    });
  }, [filteredShippingQuotes]);

  useEffect(() => {
    if (!shouldAutoSwitchGoSendToSameDay) return;

    setValue("deliveryMethod", "ASSISTED_SAME_DAY", {
      shouldValidate: true,
    });
    toast.message(
      "GoSend belum tersedia untuk alamat ini. Metode dialihkan ke Same Day dengan kurir yang tersedia.",
    );
  }, [setValue, shouldAutoSwitchGoSendToSameDay]);

  const fragileOrderReasons = useMemo(
    () => getGrabCarOnlyReasons(watchedItems),
    [watchedItems],
  );
  const isFragileOrder = fragileOrderReasons.length > 0;
  const isAllowedFragileOrderMethod = FRAGILE_ORDER_ALLOWED_METHODS.includes(
    deliveryMethod as DeliveryMethod,
  );
  const selectableDeliveryMethodOptions = useMemo(
    () =>
      isFragileOrder
        ? DELIVERY_METHOD_OPTIONS.filter((option) =>
            FRAGILE_ORDER_ALLOWED_METHODS.includes(
              option.value as DeliveryMethod,
            ),
          )
        : DELIVERY_METHOD_OPTIONS,
    [isFragileOrder],
  );

  useEffect(() => {
    if (!isFragileOrder) return;
    if (
      FRAGILE_ORDER_ALLOWED_METHODS.includes(deliveryMethod as DeliveryMethod)
    ) {
      return;
    }

    setValue("deliveryMethod", "PICKUP", {
      shouldValidate: true,
    });
  }, [isFragileOrder, deliveryMethod, setValue]);

  const primaryAddressLine = watchedAddresses[0]?.addressLine?.trim() || "";
  const isAddressTooShortForShipping =
    shouldUseShippingEngine &&
    primaryAddressLine.length > 0 &&
    primaryAddressLine.length < 8;
  const displayedShippingDistanceKm = useMemo(() => {
    if (shippingDistanceKm !== null && Number.isFinite(shippingDistanceKm)) {
      return Number(shippingDistanceKm.toFixed(2));
    }
    if (
      selectedShippingQuote &&
      Number.isFinite(selectedShippingQuote.distanceKm)
    ) {
      return Number(selectedShippingQuote.distanceKm.toFixed(2));
    }
    return null;
  }, [shippingDistanceKm, selectedShippingQuote]);

  const deliveryFee = shouldUseShippingEngine
    ? (selectedShippingQuote?.price ?? 0)
    : 0;

  const totalPrice = Math.max(
    0,
    basePrice + addOnTotal + deliveryFee + Number(manualAdjustment || 0),
  );
  const suggestedDownPaymentAmount = calculateDownPayment(totalPrice);
  const normalizedDpPaid = Math.max(0, Number(dpPaidInput || 0));
  const normalizedFinalPaid = Math.max(0, Number(finalPaidInput || 0));
  const totalPaid = Math.min(
    totalPrice,
    normalizedDpPaid + normalizedFinalPaid,
  );
  const downPaymentAmount = normalizedDpPaid;
  const remainingBalance = Math.max(0, totalPrice - totalPaid);
  const effectivePaymentStatus = remainingBalance <= 0 ? "Paid" : "DP Paid";

  const deliverySlots = useMemo(
    () =>
      getDeliverySlotsForDate(deliveryDate, undefined, {
        deliveryMethod,
        items: watchedItems,
      }),
    [deliveryDate, deliveryMethod, watchedItems],
  );
  const draftOrderType = useMemo<SlotOrderType>(
    () => inferOrderTypeFromItems(watchedItems),
    [watchedItems],
  );
  const slotLimitPerHour = useMemo(
    () => getSlotLimitByOrderType(draftOrderType),
    [draftOrderType],
  );
  const slotProfileLabel = useMemo(
    () => orderTypeLabel(draftOrderType),
    [draftOrderType],
  );
  const isBlockedDate = Boolean(
    deliveryDate &&
    isDateBlockedForOrdering(deliveryDate, undefined, {
      deliveryMethod,
      items: watchedItems,
    }),
  );

  useEffect(() => {
    if (!deliveryDate) return;
    const currentIsValid =
      Boolean(deliverySlot) && deliverySlots.includes(deliverySlot);
    if (currentIsValid) return;

    setValue("deliverySlot", deliverySlots[0] ?? "", { shouldValidate: true });
  }, [deliveryDate, deliverySlot, deliverySlots, setValue]);

  const slotAvailability = useMemo(() => {
    if (!deliveryDate) return [];
    return deliverySlots.map((slot) => {
      const used = countConcurrentOrdersByTypeForSlot({
        orders,
        deliveryDate,
        deliverySlot: slot,
        orderType: draftOrderType,
      });
      const status = checkSlotAvailability(deliveryDate, slot, draftOrderType, {
        orders,
        dateContext: {
          deliveryMethod,
          items: watchedItems,
        },
      });
      return {
        slot,
        used,
        status,
      };
    });
  }, [
    orders,
    deliveryDate,
    deliverySlots,
    draftOrderType,
    deliveryMethod,
    watchedItems,
  ]);

  const slotStatusByTime = useMemo(() => {
    return new Map(slotAvailability.map((entry) => [entry.slot, entry.status]));
  }, [slotAvailability]);

  const incomingProductionTokens = useMemo(() => {
    return summarizeProductionTokensByItems(watchedItems);
  }, [watchedItems]);

  // Keep token preview and draft token on the same calculator path.
  const newTokenPreview = incomingProductionTokens;

  // ── DB-backed capacity for the selected delivery date ────────────────────────
  const dbCapacity = useMemo(() => {
    if (!normalizedDeliveryDate) {
      return { usedToken: 0, maxToken: DAILY_PRODUCTION_TOKEN_LIMIT };
    }
    const entry = getCalendarCapacity(normalizedDeliveryDate);
    return {
      usedToken: entry.usedToken,
      maxToken: entry.maxToken,
    };
  }, [normalizedDeliveryDate, getCalendarCapacity]);

  const existingProductionTokens = dbCapacity.usedToken;
  const plannedProductionTokens =
    existingProductionTokens + incomingProductionTokens;
  const remainingProductionTokens =
    dbCapacity.maxToken - plannedProductionTokens;
  const isTokenCapacityOverflow = remainingProductionTokens < 0;

  const dbRemainingToken = remainingProductionTokens;
  const dbWillExceed = isTokenCapacityOverflow;
  const dbIsWarning = !dbWillExceed && dbRemainingToken <= 50;

  // ── Smart Date Recommendation — 30-day window ────────────────────────────────
  const recommendationWindowStart = useMemo(() => startOfDay(new Date()), []);
  const recommendationWindowEnd = useMemo(() => {
    const end = new Date();
    end.setDate(end.getDate() + 30);
    return startOfDay(end);
  }, []);

  const {
    getCapacity: getRecommendationCapacity,
    isLoading: isRecommendationLoading,
  } = useCalendarCapacity(recommendationWindowStart, recommendationWindowEnd);

  const shouldShowDateRecommendations =
    Boolean(normalizedDeliveryDate) && (dbWillExceed || isCalendarDateInvalid);

  const suggestedDates = useMemo(() => {
    if (!shouldShowDateRecommendations || newTokenPreview <= 0) return [];

    const now = new Date();
    const suggestions: Array<{ dateKey: string; remaining: number }> = [];

    const cursor = new Date(recommendationWindowStart);
    while (cursor <= recommendationWindowEnd) {
      const dateKey = normalizeDateInput(
        `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`,
      );
      if (dateKey) {
        if (dateKey === normalizedDeliveryDate) {
          cursor.setDate(cursor.getDate() + 1);
          continue;
        }

        // Skip past, blocked dates, and cutoff
        if (
          !isDateBlockedForOrdering(dateKey, now, {
            deliveryMethod,
            items: watchedItems,
          })
        ) {
          const cap = getRecommendationCapacity(dateKey);
          const remaining = cap.maxToken - cap.usedToken;
          if (remaining >= newTokenPreview) {
            suggestions.push({ dateKey, remaining });
          }
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    // Sort priority: earliest date first, then highest remaining capacity.
    suggestions.sort((a, b) => {
      const dateDiff = a.dateKey.localeCompare(b.dateKey);
      if (dateDiff !== 0) return dateDiff;
      return b.remaining - a.remaining;
    });

    return suggestions.slice(0, 3);
  }, [
    shouldShowDateRecommendations,
    normalizedDeliveryDate,
    newTokenPreview,
    recommendationWindowStart,
    recommendationWindowEnd,
    getRecommendationCapacity,
    deliveryMethod,
    watchedItems,
  ]);

  const handleSuggestionClick = (dateKey: string) => {
    setValue("deliveryDate", dateKey, { shouldValidate: true });
    setTimeout(() => {
      refetchSelectedDateCapacity();
    }, 0);
  };

  const primaryAddress = watchedAddresses[0];

  const shippingItems = useMemo<ShippingQuoteItemInput[]>(() => {
    return watchedItems.map((item) => {
      const itemBasePrice = getItemBasePrice(productCatalog, item);

      return {
        name: `${item.productName} (${item.size})`,
        quantity: Math.max(1, Number(item.quantity) || 1),
        weightGram: estimateOperationalWeightGram(item),
        value: Math.max(1000, Math.round(itemBasePrice)),
      };
    });
  }, [watchedItems, productCatalog]);

  const shippingWeightSummary = useMemo(() => {
    const rows = shippingItems.map((item) => {
      const qty = Math.max(1, Number(item.quantity) || 1);
      const totalGram = Math.max(100, Number(item.weightGram) || 100);
      const perPcsGram = Math.max(1, Math.round(totalGram / qty));

      return {
        name: item.name,
        qty,
        totalGram,
        perPcsGram,
      };
    });

    const totalGram = rows.reduce((sum, row) => sum + row.totalGram, 0);
    return {
      rows,
      totalGram,
      totalKg: Number((totalGram / 1000).toFixed(2)),
    };
  }, [shippingItems]);

  const shippingPayload = useMemo(() => {
    if (!shouldUseShippingEngine) return null;
    if (
      !primaryAddress?.addressLine ||
      primaryAddress.addressLine.trim().length < 8
    )
      return null;
    if (!shippingItems.length) return null;

    return {
      destinationAddress: primaryAddress.addressLine,
      destinationArea: primaryAddress.area || "",
      destinationPostalCode:
        sanitizePostalCodeInput(primaryAddress.postalCode || "") ||
        extractPostalCodeFromAddress(primaryAddress.addressLine),
      items: shippingItems,
      totalValue: Math.max(1000, Math.round(basePrice + addOnTotal)),
    };
  }, [
    addOnTotal,
    basePrice,
    primaryAddress?.addressLine,
    primaryAddress?.area,
    primaryAddress?.postalCode,
    shouldUseShippingEngine,
    shippingItems,
  ]);

  const shippingQuoteSignature = useMemo(() => {
    if (!shippingPayload) return "";

    return JSON.stringify({
      destinationAddress: shippingPayload.destinationAddress.trim(),
      destinationArea: shippingPayload.destinationArea.trim(),
      destinationPostalCode: shippingPayload.destinationPostalCode || "",
      items: shippingPayload.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        weightGram: item.weightGram,
      })),
    });
  }, [shippingPayload]);

  const shippingPayloadRef = useRef(shippingPayload);

  useEffect(() => {
    shippingPayloadRef.current = shippingPayload;
  }, [shippingPayload]);

  useEffect(() => {
    const currentShippingPayload = shippingPayloadRef.current;

    if (!currentShippingPayload) {
      setIsCheckingShipping(false);
      setShippingQuotes([]);
      setSelectedShippingQuoteId("");
      setShippingDistanceKm(null);
      setShippingDistanceSource(undefined);
      setShippingWarning("");
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsCheckingShipping(true);
      try {
        const response = await fetch("/api/bookings/shipping/quote", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify(currentShippingPayload),
        });

        const payload = (await response
          .json()
          .catch(() => ({}))) as ShippingQuoteResponse;
        if (!response.ok || !payload.success || !payload.quotes?.length) {
          throw new Error(
            payload.error || "Gagal mengambil ongkir live JNE/Paxel/J&T.",
          );
        }

        const resolvedDestinationPostalCode =
          payload.destinationPostalCode ||
          currentShippingPayload.destinationPostalCode ||
          undefined;
        const enrichedQuotes = payload.quotes.map((quote) => ({
          ...quote,
          destinationPostalCode: resolvedDestinationPostalCode,
          destinationLatitude: payload.destinationLatitude,
          destinationLongitude: payload.destinationLongitude,
          distanceSource: payload.distanceSource,
          warning: payload.warning || undefined,
        }));

        const sortedQuotes = enrichedQuotes
          .slice()
          .sort((a, b) => a.price - b.price);
        setShippingQuotes(sortedQuotes);
        setSelectedShippingQuoteId((current) => {
          if (current && sortedQuotes.some((quote) => quote.id === current))
            return current;
          return sortedQuotes[0]?.id || "";
        });
        setShippingDistanceKm(payload.distanceKm ?? null);
        setShippingDistanceSource(payload.distanceSource);
        setShippingWarning(payload.warning || "");
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        const message =
          error instanceof Error ? error.message : "Gagal cek ongkir.";
        setShippingQuotes([]);
        setSelectedShippingQuoteId("");
        setShippingDistanceKm(null);
        setShippingDistanceSource(undefined);
        setShippingWarning(message);
      } finally {
        if (!controller.signal.aborted) {
          setIsCheckingShipping(false);
        }
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [shippingQuoteSignature]);

  const onSubmit: SubmitHandler<BookingFormValues> = async (values) => {
    setSubmitError("");
    setSubmitSuccess("");

    if (isCheckingShipping) {
      toast.error(
        "Ongkir masih dihitung otomatis. Tunggu beberapa detik lalu submit ulang.",
      );
      return;
    }

    if (isFragileOrder && !isAllowedFragileOrderMethod) {
      toast.error(
        `Produk ${fragileOrderReasons.join(", ")} hanya bisa ${FRAGILE_ORDER_ALLOWED_METHODS_TEXT}`,
      );
      return;
    }

    if (shouldUseShippingEngine && !selectedShippingQuote) {
      toast.error(
        shippingFallbackMessage ||
          "Ongkir live belum tersedia. Lengkapi alamat/item lalu pilih layanan kurir.",
      );
      return;
    }

    if (isBlockedDate) {
      toast.error(
        "Tanggal dipilih tidak tersedia. H-1 hanya bisa booking sampai jam 10:00 pagi atau tanggal sedang diblokir admin.",
      );
      return;
    }

    if (isCalendarDateInvalid) {
      toast.error(calendarDateError || "Tanggal dipilih tidak tersedia.");
      return;
    }

    const normalizedDeliveryDate = normalizeDateInput(values.deliveryDate);
    if (!normalizedDeliveryDate) {
      toast.error("Format tanggal tidak valid. Gunakan YYYY-MM-DD.");
      return;
    }

    if (isPastDate(normalizedDeliveryDate)) {
      toast.error("Tanggal sudah terlewat");
      return;
    }

    if (
      !isWithinBusinessHours(
        normalizedDeliveryDate,
        values.deliverySlot,
        undefined,
        {
          deliveryMethod: values.deliveryMethod,
          items: values.items,
        },
      )
    ) {
      toast.error(
        "Selected slot is outside business hours (Mon-Sat 10:00-22:00, Sun 10:00-15:00).",
      );
      return;
    }

    const incomingTokens = calculateOrderTokenFromItems(values.items);
    let validatedUsedTokens = 0;
    let validatedMaxTokens = DAILY_PRODUCTION_TOKEN_LIMIT;

    setIsCapacityValidating(true);
    try {
      const params = new URLSearchParams({
        date: normalizedDeliveryDate,
        tokenNeeded: String(incomingTokens),
      });
      const response = await fetch(
        `/api/bookings/capacity?${params.toString()}`,
        {
          cache: "no-store",
        },
      );
      const payload = (await response
        .json()
        .catch(() => ({}))) as CapacitySingleDateResponse;

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || "Gagal validasi kapasitas produksi.");
      }

      const status = getCalendarStatus({
        usedToken: Number(payload.data.usedToken) || 0,
        maxToken: Number(payload.data.maxToken) || DAILY_PRODUCTION_TOKEN_LIMIT,
        date: normalizedDeliveryDate,
      });

      validatedUsedTokens = Number(payload.data.usedToken) || 0;
      validatedMaxTokens =
        Number(payload.data.maxToken) || DAILY_PRODUCTION_TOKEN_LIMIT;

      if (status === "FULL") {
        throw new Error("Tanggal sudah penuh");
      }

      if (status === "PAST") {
        throw new Error("Tanggal sudah terlewat");
      }

      if (status === "CUTOFF") {
        throw new Error("Pemesanan H-1 sudah ditutup (setelah jam 10 pagi)");
      }

      if (payload.data.isAvailable === false) {
        throw new Error("Slot produksi sudah penuh");
      }
    } finally {
      setIsCapacityValidating(false);
    }

    const plannedTokens = validatedUsedTokens + incomingTokens;
    if (plannedTokens > validatedMaxTokens) {
      toast.error(
        `Token produksi harian terlampaui (${plannedTokens}/${validatedMaxTokens}). Pilih tanggal lain atau sederhanakan item difficulty tinggi.`,
      );
      return;
    }

    for (const item of values.items) {
      const quantity = Number(item.quantity) || 0;
      const quantityRule = getItemQuantityRule(item as BookingItemInput);
      const hasParsedRecapPrice = hasParsedPricingOverride(item);
      const isOutOfRange =
        quantity < quantityRule.min ||
        (typeof quantityRule.max === "number" && quantity > quantityRule.max);
      if (isOutOfRange) {
        const productLabel = item.productName || item.category || "Item";
        toast.error(
          `${productLabel}: ${getQuantityRuleViolationMessage(quantityRule)}`,
        );
        return;
      }

      if (
        values.deliveryMethod === "ASSISTED_PAXEL" &&
        item.category === "Buket" &&
        isMediumVariantLabel(item.size || "")
      ) {
        toast.error(
          "Untuk bouquet via Paxel, varian Medium tidak didukung. Pilih varian Large/XL.",
        );
        return;
      }

      if (item.category !== "Buket") continue;

      const bouquetType = detectBouquetTypeFromItem(item);
      if (!bouquetType) {
        toast.error(
          "Tipe bouquet belum terbaca. Gunakan product Hand Bouquet atau Standing Bouquet.",
        );
        return;
      }

      if (!isValidBouquetQuantity(quantity, bouquetType)) {
        toast.error(
          `${bouquetType === "HAND" ? "Hand" : "Standing"} bouquet wajib qty ${getBouquetQtyRangeLabel(bouquetType)} cookies.`,
        );
        return;
      }

      if (!item.tokenDifficulty && !hasParsedRecapPrice) {
        toast.error(
          "Pilih Difficulty Token untuk item bouquet supaya formula harga otomatis dihitung.",
        );
        return;
      }
    }

    for (const item of values.items) {
      const flavorOptions = getFlavorOptionsForCategory(item.category);
      if (flavorOptions.length > 0) {
        const selectedFlavorCount = flavorOptions.filter((option) =>
          (item.addOns ?? []).includes(option.id),
        ).length;
        if (selectedFlavorCount > 1) {
          const productLabel = item.productName || item.category || "Item";
          toast.error(`${productLabel}: pilih maksimal 1 rasa.`);
          return;
        }
      }

      const hasDarkColorButtercream =
        item.category === "Cupcakes" &&
        (item.addOns ?? []).includes(DARK_COLOR_BUTTERCREAM_ADDON_ID);
      if (!hasDarkColorButtercream) continue;

      const darkButtercreamColors = normalizeDarkButtercreamColors(
        item.darkColorButtercreamColors ?? [],
      );
      if (darkButtercreamColors.length === 0) {
        const productLabel = item.productName || item.category || "Item";
        toast.error(
          `${productLabel}: pilih minimal 1 warna untuk add-on Dark Color Buttercream.`,
        );
        return;
      }

      if (darkButtercreamColors.length > MAX_DARK_BUTTERCREAM_COLORS) {
        const productLabel = item.productName || item.category || "Item";
        toast.error(
          `${productLabel}: maksimal ${MAX_DARK_BUTTERCREAM_COLORS} warna untuk Dark Color Buttercream.`,
        );
        return;
      }
    }

    if (referenceFilesChangedSinceParse) {
      toast.error(
        "Referensi gambar atau label desain baru saja diubah. Klik Parse WhatsApp lagi supaya versi terbaru ikut tersimpan ke booking dan template produksi.",
      );
      return;
    }

    const mappedItems: OrderItem[] = values.items.map((item, index) => {
      const bouquetType = detectBouquetTypeFromItem(item);
      const itemBasePrice = getItemBasePrice(productCatalog, item);
      const hasParsedRecapPrice = hasParsedPricingOverride(item);
      const parsedUnitPrice = getParsedUnitPriceOverride(item);
      const parsedSubtotal = getParsedSubtotalOverride(item);
      const categoryAddOns = getCategoryAddOnsFromCatalog(
        addOnCatalog,
        item.category,
      );
      const normalizedAddOnQuantities = normalizeAddOnQuantities(
        item.addOnQuantities,
      );
      const addOnTotalForItem = hasParsedRecapPrice
        ? 0
        : calculatePerUnitAddOnPrice({
            category: item.category,
            selectedAddOnIds: item.addOns ?? [],
            addOnQuantities: normalizedAddOnQuantities,
            addOnCatalogEntries: categoryAddOns,
          }) * item.quantity;
      const darkButtercreamColors = normalizeDarkButtercreamColors(
        item.darkColorButtercreamColors ?? [],
      );
      const selectedFlavorOption = getFlavorOptionsForCategory(
        item.category,
      ).find((option) => (item.addOns ?? []).includes(option.id));
      const mergedItemNotes = [
        item.notes ?? "",
        (item.addOns ?? []).length > 0
          ? `Add-ons: ${(item.addOns ?? [])
              .map((addonId) => {
                const addon = categoryAddOns.find(
                  (entry) => entry.id === addonId,
                );
                if (!addon) return "";
                const multiplier = getAddOnUnitMultiplier({
                  category: item.category,
                  addonId,
                  addOnQuantities: normalizedAddOnQuantities,
                });
                return multiplier > 1
                  ? `${addon.label} x${multiplier}`
                  : addon.label;
              })
              .filter((line) => line.length > 0)
              .join(", ")}`
          : "",
        selectedFlavorOption
          ? `Rasa: ${selectedFlavorOption.label}${selectedFlavorOption.premium && selectedFlavorOption.price > 0 ? ` (Premium ${formatCurrency(selectedFlavorOption.price)})` : ""}`
          : "",
        item.category === "Cupcakes" &&
        (item.addOns ?? []).includes(DARK_COLOR_BUTTERCREAM_ADDON_ID) &&
        darkButtercreamColors.length > 0
          ? `Dark Color Buttercream: ${darkButtercreamColors.join(", ")}`
          : "",
        hasParsedRecapPrice && parsedUnitPrice
          ? `Harga recap: ${formatCurrency(parsedUnitPrice)} / unit`
          : "",
        hasParsedRecapPrice && parsedSubtotal
          ? `Subtotal recap: ${formatCurrency(parsedSubtotal)}`
          : "",
      ]
        .filter((line) => line.trim().length > 0)
        .join("\n");

      return {
        id: `item-${Date.now()}-${index}`,
        category: item.category,
        subcategory: item.subcategory,
        productName: item.productName,
        size: item.size,
        quantity: item.quantity,
        tokenDifficulty:
          item.category === "Cookies" || item.category === "Buket"
            ? (item.tokenDifficulty as
                | "SIMPLE"
                | "NORMAL"
                | "HARD"
                | "ADVANCED"
                | "EXPERT"
                | "MEDIUM"
                | "DIFFICULT"
                | undefined)
            : undefined,
        customTokenPerUnit: item.customTokenPerUnit,
        basePrice: itemBasePrice,
        productType:
          item.category === "Buket" ? ("BOUQUET" as const) : undefined,
        cookiePrice:
          item.category === "Buket"
            ? normalizeBouquetCookiePriceValue(item.cookiePrice)
            : undefined,
        bouquetType: bouquetType ?? undefined,
        bouquetCost: bouquetType
          ? getBouquetCostByType(bouquetType)
          : undefined,
        lineTotal: parsedSubtotal ?? itemBasePrice,
        addOns: item.addOns,
        addOnQuantities: normalizedAddOnQuantities,
        addOnTotal: addOnTotalForItem,
        notes: mergedItemNotes,
      };
    });

    const mappedAddresses = values.deliveryAddresses.map((address, index) => ({
      id: `addr-${Date.now()}-${index}`,
      label: address.label,
      area: address.area,
      addressLine: address.addressLine,
    }));
    const explicitRequestedImageLabels = normalizeReferenceLabelInput(
      referenceImageLabelsInput,
    );
    const normalizedParsedPreview = parsedPreview
      ? ({
          ...parsedPreview,
          referenceImages: buildParsedReferenceImages({
            parsed: parsedPreview,
            requestedLabels: explicitRequestedImageLabels,
          }),
          requestedImageLabels: [
            ...(Array.isArray(parsedPreview.requestedImageLabels)
              ? parsedPreview.requestedImageLabels
              : []),
            ...explicitRequestedImageLabels,
          ].filter((value, index, array) => {
            const normalized = value.trim().toLowerCase();
            if (!normalized) return false;
            return (
              array.findIndex(
                (entry) => entry.trim().toLowerCase() === normalized,
              ) === index
            );
          }),
        } satisfies ParsedWhatsAppOrder)
      : undefined;

    const submissionPayload: NewOrderInput = {
      customerName: values.customerName,
      customerPhone: values.phoneNumber,
      deliveryDate: normalizedDeliveryDate,
      deliverySlot: values.deliverySlot,
      notes: [
        values.customNotes ?? "",
        `Delivery Method: ${
          DELIVERY_METHOD_OPTIONS.find(
            (option) => option.value === values.deliveryMethod,
          )?.label || values.deliveryMethod
        }`,
      ]
        .filter((line) => line.trim().length > 0)
        .join("\n"),
      items: mappedItems,
      deliveryAddresses: mappedAddresses,
      basePrice,
      addOnTotal,
      deliveryFee,
      manualAdjustment: Number(values.manualAdjustment || 0),
      totalPrice,
      downPaymentAmount,
      remainingBalance,
      paymentStatus: effectivePaymentStatus,
      dpPaidAmount: normalizedDpPaid,
      finalPaidAmount: normalizedFinalPaid,
      whatsAppParsedData: normalizedParsedPreview,
      shippingQuote: selectedShippingQuote,
    };

    try {
      await addOrder(submissionPayload);
      setSubmitSuccess("Booking berhasil disimpan ke server.");

      setDraftImported(false);
      setQuickPaste("");
      setSelectedOrderType("unknown");
      setShowOrderTypeSelector(false);
      setParsedPreview(null);
      setProductionPreviewImageUrl("");
      setVisionRawOutput("");
      setReferenceImageFiles([]);
      setReferenceFilesChangedSinceParse(false);
      setReferenceImageLabelsInput("");
      setReferenceFileInputKey((current) => current + 1);
      setShippingQuotes([]);
      setSelectedShippingQuoteId("");
      setShippingDistanceKm(null);
      setShippingDistanceSource(undefined);
      setShippingWarning("");
      reset();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Gagal menyimpan booking ke server.";
      setSubmitError(message);
      toast.error(message);
    }
  };

  const toggleItemAddOn = (itemIndex: number, addonId: string) => {
    const current = watchedItems[itemIndex]?.addOns ?? [];
    const currentQuantities = normalizeAddOnQuantities(
      watchedItems[itemIndex]?.addOnQuantities,
    );
    const isRemoving = current.includes(addonId);
    const next = current.includes(addonId)
      ? current.filter((id) => id !== addonId)
      : [...current, addonId];
    setValue(`items.${itemIndex}.addOns`, next, { shouldValidate: true });

    if (
      supportsAddOnQuantity(watchedItems[itemIndex]?.category || "", addonId)
    ) {
      const nextQuantities = { ...currentQuantities };
      if (isRemoving) {
        delete nextQuantities[addonId];
      } else if (!nextQuantities[addonId]) {
        nextQuantities[addonId] = 1;
      }

      setValue(`items.${itemIndex}.addOnQuantities`, nextQuantities, {
        shouldValidate: true,
      });
    }

    if (addonId !== DARK_COLOR_BUTTERCREAM_ADDON_ID) return;

    if (isRemoving) {
      setValue(`items.${itemIndex}.darkColorButtercreamColors`, [], {
        shouldValidate: true,
      });
    }
  };

  const setItemAddOnQuantity = (
    itemIndex: number,
    addonId: string,
    rawValue: number,
  ) => {
    const category = watchedItems[itemIndex]?.category || "";
    if (!supportsAddOnQuantity(category, addonId)) return;

    const nextValue = Number.isFinite(rawValue)
      ? Math.max(1, Math.round(rawValue))
      : 1;
    const current = normalizeAddOnQuantities(
      watchedItems[itemIndex]?.addOnQuantities,
    );

    setValue(
      `items.${itemIndex}.addOnQuantities`,
      {
        ...current,
        [addonId]: nextValue,
      },
      { shouldValidate: true },
    );
  };

  const toggleItemFlavor = (
    itemIndex: number,
    category: string,
    flavorAddOnId: string,
  ) => {
    const current = watchedItems[itemIndex]?.addOns ?? [];
    const flavorIds = getFlavorAddOnIdsByCategory(category);
    if (flavorIds.length === 0) return;

    const withoutFlavor = current.filter((id) => !flavorIds.includes(id));
    const isSelected = current.includes(flavorAddOnId);
    const next = isSelected ? withoutFlavor : [...withoutFlavor, flavorAddOnId];

    setValue(`items.${itemIndex}.addOns`, next, { shouldValidate: true });
  };

  const toggleDarkButtercreamColor = (itemIndex: number, color: string) => {
    const current = normalizeDarkButtercreamColors(
      watchedItems[itemIndex]?.darkColorButtercreamColors ?? [],
    );
    const isSelected = current.includes(color);

    if (!isSelected && current.length >= MAX_DARK_BUTTERCREAM_COLORS) {
      toast.error(
        `Maksimal ${MAX_DARK_BUTTERCREAM_COLORS} warna untuk Dark Color Buttercream.`,
      );
      return;
    }

    const next = isSelected
      ? current.filter((entry) => entry !== color)
      : [...current, color];

    setValue(`items.${itemIndex}.darkColorButtercreamColors`, next, {
      shouldValidate: true,
    });
  };

  const callWhatsAppParser = async (
    args: ParseWhatsAppRequestArgs,
  ): Promise<ParseWhatsAppApiResponse> => {
    const formData = new FormData();
    formData.append("sourceType", args.sourceType);
    formData.append("orderType", args.orderType);

    if (args.text?.trim()) {
      formData.append("text", args.text.trim());
    }

    if (args.referenceLabels?.trim()) {
      formData.append("referenceLabels", args.referenceLabels.trim());
    }

    for (const file of args.files ?? []) {
      formData.append("files", file);
    }

    const response = await fetch("/api/bookings/parse-whatsapp", {
      method: "POST",
      body: formData,
    });

    const payload = (await response.json().catch(() => ({}))) as
      | ParseWhatsAppApiResponse
      | { error?: string };

    const isSuccessPayload =
      typeof payload === "object" &&
      payload !== null &&
      "success" in payload &&
      (payload as ParseWhatsAppApiResponse).success;

    if (!response.ok || !isSuccessPayload) {
      const fallbackMessage =
        response.status === 413
          ? "Ukuran upload terlalu besar untuk diproses."
          : "Gagal parse chat WhatsApp.";
      const message =
        (typeof payload === "object" && payload?.error) || fallbackMessage;
      throw new ParseWhatsAppApiError(message, response.status);
    }

    return payload as ParseWhatsAppApiResponse;
  };

  const importDraft = async (override?: {
    sourceType?: ParserSource;
    orderType?: ParserOrderType;
    text?: string;
    successMessage?: string;
  }) => {
    const textInput = (override?.text ?? quickPaste).trim();

    if (!textInput) {
      toast.error(
        "Paste chat WhatsApp atau isi template manual terlebih dulu.",
      );
      return;
    }

    const sourceType: ParserSource = override?.sourceType ?? "text";

    if (sourceType === "image") {
      toast.error(
        "Parsing gambar AI dinonaktifkan. Gunakan copy-paste teks atau template manual.",
      );
      return;
    }

    setIsParsingWhatsApp(true);
    try {
      const explicitRequestedImageLabels = normalizeReferenceLabelInput(
        referenceImageLabelsInput,
      );
      const payload = await callWhatsAppParser({
        sourceType,
        orderType: override?.orderType ?? selectedOrderType,
        text: textInput,
        files: referenceImageFiles,
        referenceLabels: referenceImageLabelsInput,
      });

      const draft = payload.autoFill;
      if (draft.customerName) setValue("customerName", draft.customerName);
      if (draft.phoneNumber) setValue("phoneNumber", draft.phoneNumber);
      if (draft.deliveryDate) {
        const normalizedDraftDate = normalizeDateInput(draft.deliveryDate);
        if (normalizedDraftDate) {
          setValue("deliveryDate", normalizedDraftDate);
        } else {
          toast.warning(
            "Format tanggal dari parser tidak valid. Silakan pilih ulang tanggal delivery.",
          );
        }
      }
      if (draft.deliverySlot) setValue("deliverySlot", draft.deliverySlot);
      if (draft.deliveryMethod)
        setValue("deliveryMethod", draft.deliveryMethod);
      if (draft.customNotes) setValue("customNotes", draft.customNotes);
      setValue("paymentStatus", draft.paymentStatus, {
        shouldValidate: true,
      });
      setValue("manualAdjustment", Number(draft.manualAdjustment || 0), {
        shouldValidate: true,
      });
      setValue("dpPaidAmount", Math.max(0, Number(draft.dpPaidAmount || 0)), {
        shouldValidate: true,
      });
      setValue(
        "finalPaidAmount",
        Math.max(0, Number(draft.finalPaidAmount || 0)),
        {
          shouldValidate: true,
        },
      );
      if (draft.items?.length) {
        const normalizedItems: BookingFormInput["items"] = draft.items.map(
          (item) => {
            const normalized = ensureSelectionFromCatalog(productCatalog, {
              category: item.category,
              subcategory: item.subcategory,
              productName: item.productName,
              size: item.size,
            });
            const parsedQuantity = Number(item.quantity);
            const parsedCookiePrice =
              normalized.category === "Buket"
                ? normalizeBouquetCookiePriceValue(item.cookiePrice)
                : undefined;
            const parsedTokenDifficulty =
              normalized.category === "Cookies" ||
              normalized.category === "Buket"
                ? normalizeTokenDifficultyValue(
                    item.tokenDifficulty ??
                      (normalized.category === "Buket"
                        ? inferTokenDifficultyFromCookiePrice(parsedCookiePrice)
                        : undefined) ??
                      "SIMPLE",
                  )
                : undefined;

            return {
              category: normalized.category,
              subcategory: normalized.subcategory,
              productName: normalized.productName,
              size: normalized.size,
              quantity: Number.isFinite(parsedQuantity)
                ? Math.max(1, Math.round(parsedQuantity))
                : 1,
              tokenDifficulty: parsedTokenDifficulty,
              customTokenPerUnit: undefined,
              cookiePrice: parsedCookiePrice,
              addOns: Array.isArray(item.addOns) ? item.addOns : [],
              addOnQuantities: normalizeAddOnQuantities(item.addOnQuantities),
              darkColorButtercreamColors:
                normalized.category === "Cupcakes" &&
                Array.isArray(item.addOns) &&
                item.addOns.includes(DARK_COLOR_BUTTERCREAM_ADDON_ID)
                  ? (() => {
                      const parsedColors = normalizeDarkButtercreamColors(
                        (
                          item as {
                            darkColorButtercreamColors?: unknown;
                            darkColorButtercreamColor?: unknown;
                          }
                        ).darkColorButtercreamColors ?? [],
                      );
                      if (parsedColors.length > 0) {
                        return parsedColors;
                      }

                      const legacyColor = normalizeDarkButtercreamColors(
                        (
                          item as {
                            darkColorButtercreamColor?: unknown;
                          }
                        ).darkColorButtercreamColor ?? "",
                      );
                      if (legacyColor.length > 0) {
                        return legacyColor;
                      }

                      return [];
                    })()
                  : [],
              parsedUnitPrice:
                item.pricingSource === "RECAP" &&
                Number.isFinite(Number(item.parsedUnitPrice)) &&
                Number(item.parsedUnitPrice) > 0
                  ? Math.round(Number(item.parsedUnitPrice))
                  : undefined,
              parsedSubtotal:
                item.pricingSource === "RECAP" &&
                Number.isFinite(Number(item.parsedSubtotal)) &&
                Number(item.parsedSubtotal) > 0
                  ? Math.round(Number(item.parsedSubtotal))
                  : undefined,
              pricingSource:
                item.pricingSource === "RECAP" ? "RECAP" : undefined,
              notes: item.notes ?? "",
            };
          },
        );
        setValue("items", normalizedItems, { shouldValidate: true });
      }
      if (draft.deliveryAddresses?.length) {
        setValue(
          "deliveryAddresses",
          draft.deliveryAddresses as BookingFormInput["deliveryAddresses"],
          {
            shouldValidate: true,
          },
        );
      }

      const mergedRequestedImageLabels = [
        ...(Array.isArray(payload.parsed.requestedImageLabels)
          ? payload.parsed.requestedImageLabels
          : []),
        ...explicitRequestedImageLabels,
      ].filter((value, index, array) => {
        const normalized = value.trim().toLowerCase();
        if (!normalized) return false;
        return (
          array.findIndex(
            (entry) => entry.trim().toLowerCase() === normalized,
          ) === index
        );
      });
      const enrichedParsedPreview: ParsedWhatsAppOrder = {
        ...payload.parsed,
        referenceImages: buildParsedReferenceImages({
          parsed: payload.parsed,
          requestedLabels: explicitRequestedImageLabels,
        }),
        detectedItems:
          Array.isArray(payload.parsed.detectedItems) &&
          payload.parsed.detectedItems.length > 0
            ? payload.parsed.detectedItems
            : summarizeDetectedItems(payload.autoFill.items),
        requestedImageLabels: mergedRequestedImageLabels,
      };

      setParsedPreview(enrichedParsedPreview);
      setProductionPreviewImageUrl(payload.productionPreviewImageUrl ?? "");
      setVisionRawOutput(payload.visionRawOutput ?? "");
      setDraftImported(true);
      setReferenceFilesChangedSinceParse(false);
      setShowOrderTypeSelector(false);

      if (payload.warnings?.length) {
        toast.warning(payload.warnings.join(" "));
      } else {
        toast.success(
          override?.successMessage ||
            "Data WA berhasil diparse dan di-autofill. Mohon review sebelum submit.",
        );
      }
    } catch (error) {
      setProductionPreviewImageUrl("");
      const message =
        error instanceof Error
          ? error.message
          : "Terjadi kendala saat parse WhatsApp.";
      toast.error(message);
    } finally {
      setIsParsingWhatsApp(false);
    }
  };

  const fillManualTemplate = () => {
    if (selectedOrderType === "unknown") {
      setShowOrderTypeSelector(true);
      toast.error(
        "Untuk mode manual, pilih jenis order spesifik dulu (bukan Auto Detect).",
      );
      return;
    }
    setQuickPaste(buildWhatsAppTemplate(selectedOrderType));
    toast.message(
      "Template manual berhasil diisi. Lanjutkan isi lalu klik Parse WhatsApp.",
    );
  };

  const fetchLatestMarketplaceEmail = async () => {
    if (isFetchingMarketplaceEmail || isParsingWhatsApp) return;

    setIsFetchingMarketplaceEmail(true);
    try {
      const response = await fetch("/api/bookings/marketplace-email/latest", {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        found?: boolean;
        error?: string;
        message?: {
          subject?: string;
          text?: string;
        } | null;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Gagal mengambil email marketplace.");
      }

      if (!payload.found || !payload.message?.text?.trim()) {
        toast.message(
          "Belum ada email Tokopedia/Shopee yang terdeteksi dalam 180 hari terakhir.",
        );
        return;
      }

      setQuickPaste(payload.message.text);
      await importDraft({
        sourceType: "email",
        text: payload.message.text,
        successMessage: payload.message.subject
          ? `Email terbaru diparse: ${payload.message.subject}`
          : "Email marketplace terbaru berhasil diparse.",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Gagal mengambil email marketplace.";
      toast.error(message);
    } finally {
      setIsFetchingMarketplaceEmail(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card className="rounded-xl border-indigo-100 shadow-sm">
        <CardHeader className="p-6 pb-2">
          <CardTitle>WhatsApp & Email Parser (Paste / Manual)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 px-6 pb-6 pt-0">
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-2 text-xs text-indigo-700">
            <p>
              Default parser: <span className="font-semibold">Auto Detect</span>
              . Cukup paste chat lalu klik Parse WhatsApp.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-indigo-200 bg-white px-2 py-1 font-semibold text-indigo-700">
                Mode aktif:{" "}
                {selectedOrderType === "unknown"
                  ? "Auto Detect"
                  : WHATSAPP_ORDER_LABELS[selectedOrderType]}
              </span>
              <Button
                type="button"
                variant="outline"
                className="h-7 border-indigo-200 px-2 text-[11px] text-indigo-700 hover:bg-indigo-100"
                onClick={() => setShowOrderTypeSelector((current) => !current)}
              >
                {showOrderTypeSelector
                  ? "Sembunyikan Jenis Order"
                  : "Ubah Jenis Order"}
              </Button>
              {selectedOrderType !== "unknown" && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-7 border-gray-200 px-2 text-[11px] text-gray-700 hover:bg-gray-100"
                  onClick={() => {
                    setSelectedOrderType("unknown");
                    setShowOrderTypeSelector(false);
                  }}
                >
                  Kembali ke Auto Detect
                </Button>
              )}
            </div>
          </div>

          {showOrderTypeSelector && (
            <label className="grid gap-2 text-sm font-medium text-gray-700">
              Jenis Order (Override)
              <Select
                value={selectedOrderType}
                onChange={(event) =>
                  setSelectedOrderType(event.target.value as ParserOrderType)
                }
              >
                {whatsappOrderTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </label>
          )}

          <Textarea
            value={quickPaste}
            onChange={(event) => setQuickPaste(event.target.value)}
            placeholder="Paste chat WA di sini. Sistem akan auto-detect format parser dari teks."
            className="min-h-28"
          />

          <div className="grid gap-4 rounded-xl border border-dashed border-gray-200 bg-gray-50/60 p-4">
            <label className="grid gap-2 text-sm font-medium text-gray-700">
              Gambar Referensi Customer
              <Input
                key={referenceFileInputKey}
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => {
                  setReferenceImageFiles(Array.from(event.target.files ?? []));
                  setReferenceFilesChangedSinceParse(true);
                }}
              />
              <span className="text-xs font-normal text-gray-500">
                Upload gambar yang dipilih customer. Bisa satu gambar crop per
                desain, atau satu sheet gambar bertanda merah. Jika file diubah,
                klik Parse WhatsApp lagi supaya referensinya ter-upload.
              </span>
            </label>

            <label className="grid gap-2 text-sm font-medium text-gray-700">
              Label Desain per Gambar
              <Textarea
                value={referenceImageLabelsInput}
                onChange={(event) => {
                  setReferenceImageLabelsInput(event.target.value);
                  if (draftImported) {
                    setReferenceFilesChangedSinceParse(true);
                  }
                }}
                placeholder={
                  "Opsional. Isi satu label per baris sesuai urutan upload.\nContoh:\nPikachu\nBulbasaur\nPiplup"
                }
                className="min-h-24"
              />
              <span className="text-xs font-normal text-gray-500">
                Dipakai untuk mencocokkan gambar ke slot/template produk.
              </span>
            </label>

            {referenceImageFiles.length > 0 && (
              <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
                {referenceImageFiles.length} gambar siap dipakai:{" "}
                {referenceImageFiles.map((file) => file.name).join(", ")}
              </div>
            )}

            {referenceFilesChangedSinceParse &&
              referenceImageFiles.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Referensi gambar atau label desain berubah. Klik{" "}
                  <span className="font-semibold">Parse WhatsApp</span> lagi
                  supaya versi terbaru ikut tersimpan ke booking dan dipakai
                  template produksi.
                </div>
              )}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700"
              onClick={() => void importDraft()}
              disabled={isParsingWhatsApp}
            >
              <Upload size={16} />
              {isParsingWhatsApp
                ? "Parsing & Preview..."
                : referenceFilesChangedSinceParse || draftImported
                  ? "Parse Ulang WhatsApp"
                  : "Parse WhatsApp"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-sky-200 text-sky-700 hover:bg-sky-50"
              onClick={() => void fetchLatestMarketplaceEmail()}
              disabled={isFetchingMarketplaceEmail || isParsingWhatsApp}
            >
              {isFetchingMarketplaceEmail
                ? "Mengambil Email..."
                : "Ambil Email Tokopedia/Shopee"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
              onClick={fillManualTemplate}
            >
              Isi Template Manual
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-gray-200 text-gray-700 hover:bg-gray-50"
              onClick={() => {
                setQuickPaste("");
                setSelectedOrderType("unknown");
                setShowOrderTypeSelector(false);
                setParsedPreview(null);
                setProductionPreviewImageUrl("");
                setVisionRawOutput("");
                setDraftImported(false);
                setReferenceImageFiles([]);
                setReferenceFilesChangedSinceParse(false);
                setReferenceImageLabelsInput("");
                setReferenceFileInputKey((current) => current + 1);
              }}
            >
              Clear Parser
            </Button>
          </div>

          {draftImported && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm text-indigo-700">
              Draft berhasil di-auto populate. Cek ulang semua data sebelum
              create booking.
            </div>
          )}

          {parsedPreview && (
            <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Preview Hasil Parser
                </p>
                <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                  Terdeteksi utama:{" "}
                  {WHATSAPP_ORDER_LABELS[parsedPreview.orderType]}
                  {Array.isArray(parsedPreview.detectedItems) &&
                  parsedPreview.detectedItems.length > 1
                    ? ` • ${parsedPreview.detectedItems.length} item`
                    : ""}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {getDisplayFields(parsedPreview).map((field, index) => (
                  <div
                    key={`${field.label}-${index}`}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      {field.label}
                    </p>
                    <p className="text-sm text-gray-800">
                      {field.value || "-"}
                    </p>
                  </div>
                ))}
              </div>
              {parsedPreview.missingFields.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Field yang perlu dicek manual:{" "}
                  {parsedPreview.missingFields.join(", ")}
                </div>
              )}
              {selectedOrderType === "unknown" &&
                parsedPreview.missingFields.length > 0 && (
                  <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
                    <p className="font-semibold">
                      Parser butuh konfirmasi jenis order. Pilih cepat lalu
                      parse ulang:
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {specificWhatsappOrderTypeOptions.map((option) => (
                        <Button
                          key={`quick-order-type-${option.value}`}
                          type="button"
                          variant="outline"
                          className="h-7 border-indigo-200 px-2 text-[11px] text-indigo-700 hover:bg-indigo-100"
                          onClick={() => {
                            setSelectedOrderType(
                              option.value as ParserOrderType,
                            );
                            void importDraft({
                              orderType: option.value as ParserOrderType,
                              successMessage: `Parse ulang dengan jenis order ${option.label}.`,
                            });
                          }}
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              {(parsedPreview.sourceType === "image" ||
                parsedPreview.sourceType === "email") &&
                visionRawOutput && (
                  <details className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700">
                    <summary className="cursor-pointer font-semibold text-gray-600">
                      Lihat hasil ekstraksi AI
                    </summary>
                    <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-gray-700">
                      {visionRawOutput}
                    </pre>
                  </details>
                )}
              {Array.isArray(parsedPreview.referenceImages) &&
                parsedPreview.referenceImages.length > 0 && (
                  <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-700">
                    Template produksi akan memakai{" "}
                    {parsedPreview.referenceImages.length} gambar referensi.
                    {Array.isArray(parsedPreview.requestedImageLabels) &&
                    parsedPreview.requestedImageLabels.length > 0
                      ? ` Label aktif: ${parsedPreview.requestedImageLabels.join(", ")}`
                      : ""}
                  </div>
                )}
              {productionPreviewImageUrl && (
                <div className="rounded-lg border border-emerald-200 bg-white p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                      Preview Template Produksi
                    </p>
                    <a
                      href={productionPreviewImageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-emerald-700 underline underline-offset-2"
                    >
                      Buka file Cloudinary
                    </a>
                  </div>
                  {/* Using a plain img keeps arbitrary Cloudinary preview URLs simple in the admin form. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={productionPreviewImageUrl}
                    alt="Preview template produksi"
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 object-contain"
                  />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="p-6 pb-2">
            <CardTitle>Booking Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 px-6 pb-6 pt-0">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-gray-700">
                Customer Name
                <Input
                  placeholder="Nadia Pratama"
                  {...register("customerName")}
                />
                {errors.customerName && (
                  <span className="text-xs text-rose-500">
                    {errors.customerName.message}
                  </span>
                )}
              </label>
              <label className="grid gap-2 text-sm font-medium text-gray-700">
                Phone Number
                <Input
                  placeholder="08xxxxxxxxxx"
                  {...register("phoneNumber")}
                />
                {errors.phoneNumber && (
                  <span className="text-xs text-rose-500">
                    {errors.phoneNumber.message}
                  </span>
                )}
              </label>
              <label className="grid gap-2 text-sm font-medium text-gray-700">
                Delivery Date
                <Input type="date" {...register("deliveryDate")} />
                {errors.deliveryDate && (
                  <span className="text-xs text-rose-500">
                    {errors.deliveryDate.message}
                  </span>
                )}
                {deliveryDate && isCalendarCapacityLoading ? (
                  <span className="text-xs text-slate-500">
                    Mengecek kapasitas produksi...
                  </span>
                ) : null}
                {deliveryDate && calendarDateError ? (
                  <span className="text-xs font-medium text-rose-600">
                    {calendarDateError}
                  </span>
                ) : null}
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                    Kalender Libur
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {BAKERY_BLOCKED_DATES.map((blockedDate) => {
                      const active = deliveryDate === blockedDate;
                      return (
                        <button
                          key={blockedDate}
                          type="button"
                          onClick={() =>
                            setValue("deliveryDate", blockedDate, {
                              shouldValidate: true,
                            })
                          }
                          className={`rounded-md border px-2 py-1 text-[11px] ${
                            active
                              ? "border-rose-300 bg-rose-100 text-rose-700"
                              : "border-amber-200 bg-white text-amber-700"
                          }`}
                        >
                          {formatIsoDateToIdLabel(blockedDate)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </label>
              <label className="grid gap-2 text-sm font-medium text-gray-700">
                Delivery Slot
                <Select {...register("deliverySlot")}>
                  <option value="">Select hour</option>
                  {deliverySlots.map((slot) => {
                    const status = slotStatusByTime.get(slot) ?? "AVAILABLE";
                    return (
                      <option key={slot} value={slot}>
                        {slot} - {slotStatusLabel(status)}
                      </option>
                    );
                  })}
                </Select>
                {errors.deliverySlot && (
                  <span className="text-xs text-rose-500">
                    {errors.deliverySlot.message}
                  </span>
                )}
              </label>
            </div>

            {isBlockedDate && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Tanggal tidak tersedia (libur admin atau cutoff H-1 jam 10:00
                sudah lewat).
              </div>
            )}

            {deliveryDate && (
              <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Slot Availability ({deliveryDate}) - {slotProfileLabel} Limit{" "}
                  {slotLimitPerHour}/hour
                </p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {slotAvailability.map((entry) => (
                    <div
                      key={entry.slot}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                        entry.status === "FULL"
                          ? "border-rose-200 bg-rose-50 text-rose-700"
                          : entry.status === "ALMOST_FULL"
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      <div>{entry.slot}</div>
                      <div className="font-normal">
                        {entry.status === "FULL"
                          ? "🔴 FULL"
                          : entry.status === "ALMOST_FULL"
                            ? `🟡 ALMOST_FULL (${entry.used}/${slotLimitPerHour})`
                            : `🟢 AVAILABLE (${entry.used}/${slotLimitPerHour})`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {deliveryDate && (
              <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Daily Production Token Capacity ({deliveryDate})
                </p>
                <div
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    isTokenCapacityOverflow
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : "border-sky-200 bg-sky-50 text-sky-700"
                  }`}
                >
                  <p className="font-semibold">Production Token System</p>
                  <p className="mt-1 font-normal">
                    Existing {existingProductionTokens} + Draft{" "}
                    {incomingProductionTokens} = {plannedProductionTokens}/
                    {DAILY_PRODUCTION_TOKEN_LIMIT}
                  </p>
                </div>

                {/* ── Token Preview (real-time, new business rules) ── */}
                <div
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    dbWillExceed
                      ? "border-rose-300 bg-rose-50 text-rose-700"
                      : dbIsWarning
                        ? "border-amber-300 bg-amber-50 text-amber-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">Token Preview (Order)</p>
                    {isCalendarCapacityLoading && (
                      <span className="text-gray-400">memuat...</span>
                    )}
                  </div>
                  <p className="mt-1 font-normal">
                    Token dibutuhkan:{" "}
                    <span className="font-semibold">{newTokenPreview}</span>
                  </p>
                  <p className="mt-0.5 font-normal">
                    Kapasitas saat ini:{" "}
                    <span className="font-semibold">
                      {dbCapacity.usedToken}/{dbCapacity.maxToken}
                    </span>{" "}
                    &mdash; Setelah draft:{" "}
                    <span className="font-semibold">
                      {plannedProductionTokens}/{dbCapacity.maxToken}
                    </span>{" "}
                    &mdash; Sisa:{" "}
                    <span className="font-semibold">{dbRemainingToken}</span>
                  </p>
                  {dbWillExceed && (
                    <p className="mt-1 font-semibold text-rose-600">
                      Kapasitas produksi tidak mencukupi untuk tanggal ini
                    </p>
                  )}
                  {dbIsWarning && (
                    <p className="mt-1 font-semibold text-amber-600">
                      Kapasitas hampir penuh — sisa {dbRemainingToken} token
                    </p>
                  )}
                </div>

                {/* ── Smart Date Recommendations ── */}
                {shouldShowDateRecommendations && (
                  <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2 text-xs">
                    <p className="font-semibold text-rose-600">
                      {dbWillExceed
                        ? "Kapasitas tidak mencukupi untuk tanggal ini"
                        : calendarDateError || "Tanggal dipilih tidak tersedia"}
                    </p>

                    {isRecommendationLoading ? (
                      <p className="mt-1 text-indigo-500">Mencari tanggal…</p>
                    ) : suggestedDates.length > 0 ? (
                      <>
                        <p className="mt-1 font-medium text-indigo-700">
                          Tanggal tersedia:
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-2">
                          {suggestedDates.map(({ dateKey, remaining }) => (
                            <button
                              key={dateKey}
                              type="button"
                              onClick={() => handleSuggestionClick(dateKey)}
                              className="rounded-md border border-indigo-300 bg-white px-2 py-1 font-medium text-indigo-700 shadow-[0_0_0_0_rgba(99,102,241,0.35)] transition-all duration-300 hover:-translate-y-0.5 hover:border-indigo-500 hover:bg-indigo-100 hover:shadow-[0_0_0_4px_rgba(99,102,241,0.18)]"
                              title={`Sisa kapasitas: ${remaining} token`}
                            >
                              {formatIsoDateToIdLabel(dateKey)}
                              <span className="ml-1 text-indigo-400">
                                ({remaining} sisa)
                              </span>
                            </button>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="mt-1 font-medium text-rose-600">
                        Semua tanggal dalam 30 hari penuh
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Order Items
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 gap-1 border-indigo-200 text-indigo-700"
                  onClick={() => {
                    const nextDefault =
                      getDefaultSelectionFromCatalog(productCatalog);
                    const nextTokenDifficulty =
                      nextDefault.category === "Cookies" ||
                      nextDefault.category === "Buket"
                        ? "SIMPLE"
                        : undefined;
                    const autoQuantity =
                      getAutoQuantityForItem({
                        category: nextDefault.category,
                        subcategory: nextDefault.subcategory,
                        productName: nextDefault.productName,
                        size: nextDefault.size,
                        quantity: 1,
                        tokenDifficulty: nextTokenDifficulty,
                        customTokenPerUnit: undefined,
                        cookiePrice: undefined,
                        addOns: [],
                        addOnQuantities: {},
                        notes: "",
                      }) ?? 1;
                    appendItem({
                      category: nextDefault.category,
                      subcategory: nextDefault.subcategory,
                      productName: nextDefault.productName,
                      size: nextDefault.size,
                      quantity: autoQuantity,
                      tokenDifficulty: nextTokenDifficulty,
                      customTokenPerUnit: undefined,
                      cookiePrice: undefined,
                      addOns: [],
                      addOnQuantities: {},
                      darkColorButtercreamColors: [],
                      parsedUnitPrice: undefined,
                      parsedSubtotal: undefined,
                      pricingSource: undefined,
                      notes: "",
                    });
                  }}
                >
                  <Plus size={14} />
                  Add Item
                </Button>
              </div>

              <div className="space-y-3">
                {itemFields.map((field, index) => {
                  const item = watchedItems[index];
                  const normalizedSelection = ensureSelectionFromCatalog(
                    productCatalog,
                    {
                      category: item?.category,
                      subcategory: item?.subcategory,
                      productName: item?.productName,
                      size: item?.size,
                    },
                  );
                  const categoryData = productCatalog.find(
                    (entry) => entry.category === normalizedSelection.category,
                  );
                  const subcategories = categoryData?.subcategories ?? [];
                  const subcategoryData =
                    subcategories.find(
                      (entry) => entry.name === normalizedSelection.subcategory,
                    ) ?? subcategories[0];
                  const products = subcategoryData?.products ?? [];
                  const variants = getVariantsFromCatalog(
                    productCatalog,
                    normalizedSelection,
                  );
                  const addOns = getCategoryAddOnsFromCatalog(
                    addOnCatalog,
                    normalizedSelection.category,
                  );
                  const flavorOptions = getFlavorOptionsForCategory(
                    normalizedSelection.category,
                  );
                  const selectedFlavorId = getSelectedFlavorIdFromItem({
                    category: normalizedSelection.category,
                    subcategory: normalizedSelection.subcategory,
                    productName: normalizedSelection.productName,
                    size: normalizedSelection.size,
                    quantity: Number(item?.quantity) || 0,
                    tokenDifficulty: item?.tokenDifficulty,
                    customTokenPerUnit:
                      Number(item?.customTokenPerUnit) > 0
                        ? Number(item?.customTokenPerUnit)
                        : undefined,
                    cookiePrice:
                      Number(item?.cookiePrice) > 0
                        ? Number(item?.cookiePrice)
                        : undefined,
                    addOns: item?.addOns ?? [],
                    notes: item?.notes ?? "",
                  });
                  const nonFlavorAddOns = getNonFlavorAddOnsForCategory({
                    addOns,
                    category: normalizedSelection.category,
                  });
                  const regularFlavorOptions = flavorOptions.filter(
                    (option) => !option.premium,
                  );
                  const premiumFlavorOptions = flavorOptions.filter(
                    (option) => option.premium,
                  );
                  const bouquetProbeItem: BookingItemInput = {
                    category: normalizedSelection.category,
                    subcategory: normalizedSelection.subcategory,
                    productName: normalizedSelection.productName,
                    size: normalizedSelection.size,
                    quantity: Number(item?.quantity) || 0,
                    tokenDifficulty: item?.tokenDifficulty,
                    customTokenPerUnit:
                      Number(item?.customTokenPerUnit) > 0
                        ? Number(item?.customTokenPerUnit)
                        : undefined,
                    cookiePrice:
                      Number(item?.cookiePrice) > 0
                        ? Number(item?.cookiePrice)
                        : undefined,
                    addOns: item?.addOns ?? [],
                    notes: item?.notes ?? "",
                  };
                  const bouquetType =
                    detectBouquetTypeFromItem(bouquetProbeItem);
                  const isBouquet = normalizedSelection.category === "Buket";
                  const isCupcakes =
                    normalizedSelection.category === "Cupcakes";
                  const isCookies = normalizedSelection.category === "Cookies";
                  const allowedVariants =
                    deliveryMethod === "ASSISTED_PAXEL" && isBouquet
                      ? variants.filter(
                          (variant) => !isMediumVariantLabel(variant.label),
                        )
                      : variants;
                  const displayVariants =
                    allowedVariants.length > 0 ? allowedVariants : variants;
                  const supportsDifficulty = isCookies || isBouquet;
                  const bouquetLineTotal =
                    getBouquetLineTotal(bouquetProbeItem);
                  const itemGrabCarOnly = isGrabCarOnlyItem(bouquetProbeItem);
                  const quantityRule = getItemQuantityRule(bouquetProbeItem);
                  const itemTokenPreview =
                    getItemProductionToken(bouquetProbeItem);
                  const selectedDifficultyOption = getTokenDifficultyOption(
                    item?.tokenDifficulty,
                  );
                  const bouquetCookiePrice =
                    getBouquetCookiePrice(bouquetProbeItem);
                  const hasParsedBouquetCookiePrice =
                    normalizeBouquetCookiePriceValue(item?.cookiePrice) !==
                    undefined;
                  const hasParsedRecapPrice = hasParsedPricingOverride(item);
                  const parsedUnitPrice = getParsedUnitPriceOverride(item);
                  const parsedSubtotal = getParsedSubtotalOverride(item);
                  const hasCustomTokenOverride =
                    Number(item?.customTokenPerUnit) > 0;
                  const quantityError = errors.items?.[index]?.quantity
                    ?.message as string | undefined;
                  const hasDarkColorButtercream =
                    isCupcakes &&
                    (item?.addOns?.includes(DARK_COLOR_BUTTERCREAM_ADDON_ID) ??
                      false);
                  const selectedDarkButtercreamColors =
                    normalizeDarkButtercreamColors(
                      item?.darkColorButtercreamColors ?? [],
                    );
                  const darkColorError = errors.items?.[index]
                    ?.darkColorButtercreamColors?.message as string | undefined;
                  const hasMultipleSubcategories = subcategories.length > 1;
                  const hasMultipleProducts = products.length > 1;
                  const hasMultipleVariants = displayVariants.length > 1;
                  const quantityValue = Number(item?.quantity) || 0;
                  const normalizedAddOnQuantities = normalizeAddOnQuantities(
                    item?.addOnQuantities,
                  );
                  const selectedNonFlavorAddOns = nonFlavorAddOns.filter(
                    (addon) => item?.addOns?.includes(addon.id) ?? false,
                  );
                  const selectedNonFlavorAddOnTotal =
                    selectedNonFlavorAddOns.reduce((sum, addon) => {
                      const multiplier = getAddOnUnitMultiplier({
                        category: normalizedSelection.category,
                        addonId: addon.id,
                        addOnQuantities: normalizedAddOnQuantities,
                      });
                      return sum + addon.price * multiplier;
                    }, 0) * Math.max(1, quantityValue);
                  const displayUnitPrice =
                    hasParsedRecapPrice && parsedUnitPrice
                      ? parsedUnitPrice
                      : getUnitPriceFromCatalog(productCatalog, {
                          category: normalizedSelection.category,
                          subcategory: normalizedSelection.subcategory,
                          productName: normalizedSelection.productName,
                          size: normalizedSelection.size,
                        });
                  const displayLinePrice =
                    hasParsedRecapPrice && parsedSubtotal
                      ? parsedSubtotal
                      : getItemBasePrice(productCatalog, bouquetProbeItem);

                  return (
                    <div
                      key={field.id}
                      className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Item {index + 1}
                        </p>
                        <div className="flex items-center gap-2 text-[11px] font-medium text-slate-600">
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">
                            Unit {formatCurrency(displayUnitPrice)}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">
                            Subtotal {formatCurrency(displayLinePrice)}
                          </span>
                        </div>
                      </div>

                      <div className="grid gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
                        <label className="grid gap-2 text-sm font-medium text-gray-700">
                          Category
                          <Select
                            {...register(`items.${index}.category`)}
                            value={normalizedSelection.category}
                            onChange={(event) => {
                              const nextCategory = event.target.value;
                              const nextSelection =
                                getDefaultSelectionFromCatalog(
                                  productCatalog,
                                  nextCategory,
                                );
                              const nextProbeItem: BookingItemInput = {
                                category: nextSelection.category,
                                subcategory: nextSelection.subcategory,
                                productName: nextSelection.productName,
                                size: nextSelection.size,
                                quantity: Number(item?.quantity) || 0,
                                tokenDifficulty: item?.tokenDifficulty,
                                customTokenPerUnit:
                                  Number(item?.customTokenPerUnit) > 0
                                    ? Number(item?.customTokenPerUnit)
                                    : undefined,
                                cookiePrice:
                                  Number(item?.cookiePrice) > 0
                                    ? Number(item?.cookiePrice)
                                    : undefined,
                                addOns: item?.addOns ?? [],
                                notes: item?.notes ?? "",
                              };
                              const nextAutoQuantity =
                                getAutoQuantityForItem(nextProbeItem);
                              clearParsedPricingOverride(index);
                              setValue(
                                `items.${index}.category`,
                                nextSelection.category,
                                { shouldValidate: true },
                              );
                              setValue(
                                `items.${index}.subcategory`,
                                nextSelection.subcategory,
                                {
                                  shouldValidate: true,
                                },
                              );
                              setValue(
                                `items.${index}.productName`,
                                nextSelection.productName,
                                {
                                  shouldValidate: true,
                                },
                              );
                              setValue(
                                `items.${index}.size`,
                                nextSelection.size,
                                { shouldValidate: true },
                              );
                              setValue(`items.${index}.addOns`, [], {
                                shouldValidate: true,
                              });
                              setValue(
                                `items.${index}.addOnQuantities`,
                                {},
                                {
                                  shouldValidate: true,
                                },
                              );
                              setValue(
                                `items.${index}.darkColorButtercreamColors`,
                                [],
                                {
                                  shouldValidate: true,
                                },
                              );
                              setValue(
                                `items.${index}.cookiePrice`,
                                undefined,
                                {
                                  shouldValidate: true,
                                },
                              );
                              setValue(
                                `items.${index}.tokenDifficulty`,
                                nextSelection.category === "Cookies" ||
                                  nextSelection.category === "Buket"
                                  ? "SIMPLE"
                                  : undefined,
                                {
                                  shouldValidate: true,
                                },
                              );
                              if (typeof nextAutoQuantity === "number") {
                                setValue(
                                  `items.${index}.quantity`,
                                  nextAutoQuantity,
                                  {
                                    shouldValidate: true,
                                  },
                                );
                              }
                            }}
                          >
                            {productCatalog.map((entry) => (
                              <option
                                key={entry.category}
                                value={entry.category}
                              >
                                {entry.category}
                              </option>
                            ))}
                          </Select>
                        </label>

                        <label className="grid gap-2 text-sm font-medium text-gray-700">
                          Subcategory
                          {hasMultipleSubcategories ? (
                            <Select
                              {...register(`items.${index}.subcategory`)}
                              value={normalizedSelection.subcategory}
                              onChange={(event) => {
                                const nextSub = event.target.value;
                                const nextSelection =
                                  ensureSelectionFromCatalog(productCatalog, {
                                    category: normalizedSelection.category,
                                    subcategory: nextSub,
                                  });
                                const nextProbeItem: BookingItemInput = {
                                  category: nextSelection.category,
                                  subcategory: nextSelection.subcategory,
                                  productName: nextSelection.productName,
                                  size: nextSelection.size,
                                  quantity: Number(item?.quantity) || 0,
                                  tokenDifficulty: item?.tokenDifficulty,
                                  customTokenPerUnit:
                                    Number(item?.customTokenPerUnit) > 0
                                      ? Number(item?.customTokenPerUnit)
                                      : undefined,
                                  cookiePrice:
                                    Number(item?.cookiePrice) > 0
                                      ? Number(item?.cookiePrice)
                                      : undefined,
                                  addOns: item?.addOns ?? [],
                                  notes: item?.notes ?? "",
                                };
                                const nextAutoQuantity =
                                  getAutoQuantityForItem(nextProbeItem);
                                clearParsedPricingOverride(index);
                                setValue(
                                  `items.${index}.subcategory`,
                                  nextSelection.subcategory,
                                  {
                                    shouldValidate: true,
                                  },
                                );
                                setValue(
                                  `items.${index}.productName`,
                                  nextSelection.productName,
                                  {
                                    shouldValidate: true,
                                  },
                                );
                                setValue(
                                  `items.${index}.size`,
                                  nextSelection.size,
                                  { shouldValidate: true },
                                );
                                if (typeof nextAutoQuantity === "number") {
                                  setValue(
                                    `items.${index}.quantity`,
                                    nextAutoQuantity,
                                    {
                                      shouldValidate: true,
                                    },
                                  );
                                }
                              }}
                            >
                              {subcategories.map((entry) => (
                                <option key={entry.name} value={entry.name}>
                                  {entry.name}
                                </option>
                              ))}
                            </Select>
                          ) : (
                            <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
                              {normalizedSelection.subcategory || "-"}
                            </div>
                          )}
                        </label>

                        <label className="grid gap-2 text-sm font-medium text-gray-700">
                          Product
                          {hasMultipleProducts ? (
                            <Select
                              {...register(`items.${index}.productName`)}
                              value={normalizedSelection.productName}
                              onChange={(event) => {
                                const nextProduct = event.target.value;
                                const nextSelection =
                                  ensureSelectionFromCatalog(productCatalog, {
                                    category: normalizedSelection.category,
                                    subcategory:
                                      normalizedSelection.subcategory,
                                    productName: nextProduct,
                                  });
                                const nextProbeItem: BookingItemInput = {
                                  category: nextSelection.category,
                                  subcategory: nextSelection.subcategory,
                                  productName: nextSelection.productName,
                                  size: nextSelection.size,
                                  quantity: Number(item?.quantity) || 0,
                                  tokenDifficulty: item?.tokenDifficulty,
                                  customTokenPerUnit:
                                    Number(item?.customTokenPerUnit) > 0
                                      ? Number(item?.customTokenPerUnit)
                                      : undefined,
                                  cookiePrice:
                                    Number(item?.cookiePrice) > 0
                                      ? Number(item?.cookiePrice)
                                      : undefined,
                                  addOns: item?.addOns ?? [],
                                  notes: item?.notes ?? "",
                                };
                                const nextAutoQuantity =
                                  getAutoQuantityForItem(nextProbeItem);
                                clearParsedPricingOverride(index);
                                setValue(
                                  `items.${index}.productName`,
                                  nextSelection.productName,
                                  {
                                    shouldValidate: true,
                                  },
                                );
                                setValue(
                                  `items.${index}.size`,
                                  nextSelection.size,
                                  { shouldValidate: true },
                                );
                                if (typeof nextAutoQuantity === "number") {
                                  setValue(
                                    `items.${index}.quantity`,
                                    nextAutoQuantity,
                                    {
                                      shouldValidate: true,
                                    },
                                  );
                                }
                              }}
                            >
                              {products.map((product) => (
                                <option key={product.name} value={product.name}>
                                  {product.name}
                                </option>
                              ))}
                            </Select>
                          ) : (
                            <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
                              {normalizedSelection.productName || "-"}
                            </div>
                          )}
                          {itemGrabCarOnly && (
                            <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">
                              GrabCar only
                            </span>
                          )}
                        </label>

                        <label className="grid gap-2 text-sm font-medium text-gray-700">
                          Varian / Size
                          {hasMultipleVariants ? (
                            <Select
                              {...register(`items.${index}.size`)}
                              value={normalizedSelection.size}
                              onChange={(event) => {
                                const nextSize = event.target.value;
                                const nextProbeItem: BookingItemInput = {
                                  category: normalizedSelection.category,
                                  subcategory: normalizedSelection.subcategory,
                                  productName: normalizedSelection.productName,
                                  size: nextSize,
                                  quantity: Number(item?.quantity) || 0,
                                  tokenDifficulty: item?.tokenDifficulty,
                                  customTokenPerUnit:
                                    Number(item?.customTokenPerUnit) > 0
                                      ? Number(item?.customTokenPerUnit)
                                      : undefined,
                                  cookiePrice:
                                    Number(item?.cookiePrice) > 0
                                      ? Number(item?.cookiePrice)
                                      : undefined,
                                  addOns: item?.addOns ?? [],
                                  notes: item?.notes ?? "",
                                };
                                const nextAutoQuantity =
                                  getAutoQuantityForItem(nextProbeItem);
                                clearParsedPricingOverride(index);
                                setValue(`items.${index}.size`, nextSize, {
                                  shouldValidate: true,
                                });
                                if (typeof nextAutoQuantity === "number") {
                                  setValue(
                                    `items.${index}.quantity`,
                                    nextAutoQuantity,
                                    {
                                      shouldValidate: true,
                                    },
                                  );
                                }
                              }}
                            >
                              {displayVariants.map((sizeOption) => (
                                <option
                                  key={sizeOption.label}
                                  value={sizeOption.label}
                                >
                                  {sizeOption.label} (
                                  {formatCurrency(sizeOption.price)})
                                </option>
                              ))}
                            </Select>
                          ) : (
                            <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
                              {normalizedSelection.size || "-"}
                            </div>
                          )}
                          {deliveryMethod === "ASSISTED_PAXEL" && isBouquet && (
                            <span className="text-[11px] font-normal leading-4 text-gray-500">
                              Paxel untuk bouquet hanya mendukung varian
                              Large/XL.
                            </span>
                          )}
                        </label>

                        <label className="grid gap-1.5 text-sm font-medium text-gray-700">
                          {quantityRule.label}
                          <Input
                            type="number"
                            min={quantityRule.min}
                            max={quantityRule.max}
                            step={1}
                            {...register(`items.${index}.quantity`, {
                              valueAsNumber: true,
                              onChange: () => {
                                clearParsedPricingOverride(index);
                              },
                              onBlur: (event) => {
                                const parsed = Number(event.target.value) || 0;
                                const minQty = quantityRule.min;
                                if (parsed > 0 && parsed < minQty) {
                                  setValue(`items.${index}.quantity`, minQty, {
                                    shouldValidate: true,
                                  });
                                }
                              },
                              validate: (value) => {
                                const quantity = Number(value) || 0;
                                if (quantity < quantityRule.min) {
                                  return getQuantityRuleViolationMessage(
                                    quantityRule,
                                  );
                                }
                                if (
                                  typeof quantityRule.max === "number" &&
                                  quantity > quantityRule.max
                                ) {
                                  return getQuantityRuleViolationMessage(
                                    quantityRule,
                                  );
                                }
                                return true;
                              },
                            })}
                          />
                          {quantityRule.helperText && (
                            <span className="min-h-4 text-[11px] font-normal leading-4 text-gray-500">
                              {quantityRule.helperText}
                            </span>
                          )}
                          {quantityError && (
                            <span className="min-h-4 text-[11px] font-normal leading-4 text-rose-600">
                              {quantityError}
                            </span>
                          )}
                        </label>

                        {supportsDifficulty && (
                          <label className="grid gap-1.5 text-sm font-medium text-gray-700">
                            Difficulty Token
                            <Select
                              {...register(`items.${index}.tokenDifficulty`)}
                              defaultValue={item?.tokenDifficulty || "SIMPLE"}
                            >
                              {TOKEN_DIFFICULTY_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label} ({option.token})
                                </option>
                              ))}
                            </Select>
                            {isBouquet && (
                              <span className="min-h-4 text-[11px] font-normal leading-4 text-gray-500">
                                Token bouquet fixed: Hand = 20, Standing = 50
                                per bouquet.
                              </span>
                            )}
                          </label>
                        )}

                        <label className="grid gap-1.5 text-sm font-medium text-gray-700">
                          Custom Token / Unit
                          <Input
                            type="number"
                            min={1}
                            max={999}
                            placeholder="Opsional"
                            {...register(`items.${index}.customTokenPerUnit`, {
                              setValueAs: (value) => {
                                const parsed = Number(value);
                                return Number.isFinite(parsed) && parsed > 0
                                  ? Math.round(parsed)
                                  : undefined;
                              },
                            })}
                          />
                        </label>

                        {isBouquet && (
                          <label className="grid gap-1.5 text-sm font-medium text-gray-700">
                            Harga Cookie / pcs (otomatis)
                            <span className="min-h-4 text-[11px] font-normal leading-4 text-gray-500">
                              {hasParsedBouquetCookiePrice
                                ? `Harga cookie dari parser: ${formatCurrency(bouquetCookiePrice)} / pcs.`
                                : `Difficulty aktif: ${selectedDifficultyOption.label} (${selectedDifficultyOption.token}) = ${formatCurrency(selectedDifficultyOption.cookiePrice)} / pcs.`}
                            </span>
                            <span className="min-h-4 text-[11px] font-normal leading-4 text-gray-500">
                              Formula: (harga cookie x qty) +{" "}
                              {formatCurrency(
                                bouquetType
                                  ? getBouquetCostByType(bouquetType)
                                  : BOUQUET_HAND_COST,
                              )}
                              .
                            </span>
                            {bouquetLineTotal !== null && (
                              <span className="text-[11px] font-normal leading-4 text-indigo-600">
                                Estimasi subtotal bouquet:{" "}
                                {formatCurrency(bouquetLineTotal)}
                              </span>
                            )}
                          </label>
                        )}

                        <label className="grid gap-1.5 text-sm font-medium text-gray-700 sm:col-span-2 lg:col-span-4">
                          Item Notes
                          <Input
                            placeholder="Decoration instructions"
                            {...register(`items.${index}.notes`)}
                          />
                        </label>
                      </div>

                      {hasParsedRecapPrice && (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                          Harga dari recap aktif
                          {parsedUnitPrice
                            ? ` • Harga satuan ${formatCurrency(parsedUnitPrice)}`
                            : ""}
                          {parsedSubtotal
                            ? ` • Subtotal ${formatCurrency(parsedSubtotal)}`
                            : ""}
                          . Jika produk, size, atau qty diubah, override ini
                          akan otomatis direset.
                        </div>
                      )}

                      <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-700">
                        Estimasi token item ini: {itemTokenPreview}
                        {hasCustomTokenOverride
                          ? " (custom token override)"
                          : ""}
                      </div>

                      {flavorOptions.length > 0 && (
                        <label className="grid gap-1.5 text-sm font-medium text-gray-700 sm:max-w-2xl">
                          <span className="flex items-center justify-between">
                            <span>Choose Flavor</span>
                            <span className="text-[11px] font-normal text-gray-500">
                              1 flavor per item
                            </span>
                          </span>

                          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                            {regularFlavorOptions.map((option) => {
                              const checked = selectedFlavorId === option.id;
                              const shortCode = option.shortCodes?.[0] || "";

                              return (
                                <label
                                  key={option.id}
                                  className={`flex items-center justify-between rounded-xl border px-3 py-1.5 text-sm transition ${
                                    checked
                                      ? "border-indigo-300 bg-indigo-50 text-indigo-800"
                                      : "border-gray-200 bg-gray-50 text-gray-700"
                                  }`}
                                >
                                  <span className="flex items-center gap-2">
                                    <span>{option.label}</span>
                                    {shortCode && (
                                      <span className="rounded-md border border-gray-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
                                        {shortCode}
                                      </span>
                                    )}
                                  </span>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() =>
                                      toggleItemFlavor(
                                        index,
                                        normalizedSelection.category,
                                        option.id,
                                      )
                                    }
                                    className="h-4 w-4 accent-indigo-600"
                                  />
                                </label>
                              );
                            })}
                          </div>

                          {premiumFlavorOptions.length > 0 && (
                            <>
                              <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                                Premium Flavors
                              </span>
                              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                                {premiumFlavorOptions.map((option) => {
                                  const checked =
                                    selectedFlavorId === option.id;
                                  const shortCode =
                                    option.shortCodes?.[0] || "";

                                  return (
                                    <label
                                      key={option.id}
                                      className={`flex items-center justify-between rounded-xl border px-3 py-1.5 text-sm transition ${
                                        checked
                                          ? "border-amber-300 bg-amber-50 text-amber-900"
                                          : "border-amber-200 bg-amber-50/60 text-gray-700"
                                      }`}
                                    >
                                      <span className="flex items-center gap-2">
                                        <span>{option.label}</span>
                                        {shortCode && (
                                          <span className="rounded-md border border-amber-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                                            {shortCode}
                                          </span>
                                        )}
                                        {option.price > 0 && (
                                          <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                                            +
                                            {formatCompactSurcharge(
                                              option.price,
                                            )}
                                          </span>
                                        )}
                                      </span>
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() =>
                                          toggleItemFlavor(
                                            index,
                                            normalizedSelection.category,
                                            option.id,
                                          )
                                        }
                                        className="h-4 w-4 accent-amber-600"
                                      />
                                    </label>
                                  );
                                })}
                              </div>
                            </>
                          )}

                          <span className="min-h-4 text-[11px] font-normal leading-4 text-gray-500">
                            {normalizedSelection.category === "Cake"
                              ? "Cake flavor: 4 regular + 3 premium. Pilih 1 rasa per item cake."
                              : "Cupcake flavor: pilih 1 rasa untuk item cupcakes ini."}
                          </span>
                        </label>
                      )}

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Add-ons
                          </span>
                          <span className="text-[11px] font-medium text-slate-500">
                            {selectedNonFlavorAddOns.length} dipilih
                            {selectedNonFlavorAddOns.length > 0
                              ? ` • ${formatCurrency(selectedNonFlavorAddOnTotal)}`
                              : ""}
                          </span>
                        </div>
                        <div className="grid gap-1.5 sm:grid-cols-3">
                          {nonFlavorAddOns.map((addon) => {
                            const addOnLabel =
                              addon.id === DARK_COLOR_BUTTERCREAM_ADDON_ID
                                ? "Choose Color"
                                : addon.label;
                            const checked =
                              item?.addOns?.includes(addon.id) ?? false;
                            const supportsQuantity = supportsAddOnQuantity(
                              normalizedSelection.category,
                              addon.id,
                            );
                            const perCakeUnits = getAddOnUnitMultiplier({
                              category: normalizedSelection.category,
                              addonId: addon.id,
                              addOnQuantities: normalizedAddOnQuantities,
                            });
                            const effectiveUnitPrice =
                              addon.price * perCakeUnits;

                            return (
                              <label
                                key={addon.id}
                                className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-700"
                              >
                                <span className="min-w-0">
                                  {addOnLabel}{" "}
                                  <span className="text-xs text-gray-400">
                                    {formatCurrency(effectiveUnitPrice)}
                                    {supportsQuantity
                                      ? ` / cake (${perCakeUnits}x)`
                                      : ""}
                                    {quantityValue > 0
                                      ? ` (x${quantityValue} = ${formatCurrency(effectiveUnitPrice * quantityValue)})`
                                      : ""}
                                  </span>
                                </span>
                                <span className="flex items-center gap-2">
                                  {supportsQuantity && checked && (
                                    <Input
                                      type="number"
                                      min={1}
                                      step={1}
                                      value={perCakeUnits}
                                      onChange={(event) =>
                                        setItemAddOnQuantity(
                                          index,
                                          addon.id,
                                          Number(event.target.value),
                                        )
                                      }
                                      className="h-8 w-16"
                                    />
                                  )}
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() =>
                                      toggleItemAddOn(index, addon.id)
                                    }
                                    className="h-4 w-4 accent-indigo-600"
                                  />
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      {selectedNonFlavorAddOns.length > 0 && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                          {selectedNonFlavorAddOns
                            .map((addon) => {
                              const units = getAddOnUnitMultiplier({
                                category: normalizedSelection.category,
                                addonId: addon.id,
                                addOnQuantities: normalizedAddOnQuantities,
                              });
                              return units > 1
                                ? `${addon.label} x${units}`
                                : addon.label;
                            })
                            .join(", ")}
                        </div>
                      )}

                      {hasDarkColorButtercream && (
                        <label className="grid gap-1.5 text-sm font-medium text-gray-700 sm:max-w-sm">
                          Choose Color (max 3)
                          <div className="grid gap-1.5 sm:grid-cols-2">
                            {DARK_BUTTERCREAM_COLOR_OPTIONS.map((color) => {
                              const checked =
                                selectedDarkButtercreamColors.includes(color);
                              const disableNewSelection =
                                !checked &&
                                selectedDarkButtercreamColors.length >=
                                  MAX_DARK_BUTTERCREAM_COLORS;

                              return (
                                <label
                                  key={color}
                                  className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-700"
                                >
                                  <span>{color}</span>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={disableNewSelection}
                                    onChange={() =>
                                      toggleDarkButtercreamColor(index, color)
                                    }
                                    className="h-4 w-4 accent-indigo-600"
                                  />
                                </label>
                              );
                            })}
                          </div>
                          <span className="min-h-4 text-[11px] font-normal leading-4 text-gray-500">
                            Dipilih:{" "}
                            {selectedDarkButtercreamColors.join(", ") ||
                              "belum ada"}
                            . Pilihan:{" "}
                            {DARK_BUTTERCREAM_COLOR_OPTIONS.join(", ")}.
                          </span>
                          {darkColorError && (
                            <span className="min-h-4 text-[11px] font-normal leading-4 text-rose-600">
                              {darkColorError}
                            </span>
                          )}
                        </label>
                      )}

                      {itemFields.length > 1 && (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8 gap-1 border-rose-200 text-rose-600 hover:bg-rose-50"
                          onClick={() => removeItem(index)}
                        >
                          <Trash2 size={14} />
                          Remove Item
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Delivery Addresses
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 gap-1 border-indigo-200 text-indigo-700"
                  onClick={() =>
                    appendAddress({
                      label: "Extra",
                      area: "",
                      postalCode: "",
                      addressLine: "",
                    })
                  }
                >
                  <Plus size={14} />
                  Add Address
                </Button>
              </div>

              <div className="space-y-3">
                {addressFields.map((field, index) => {
                  const addressError = errors.deliveryAddresses?.[index];
                  const isPrimaryShippingAddress =
                    shouldUseShippingEngine && index === 0;

                  return (
                    <div
                      key={field.id}
                      className="grid gap-3 rounded-xl border border-gray-200 p-4 sm:grid-cols-2"
                    >
                      <label className="grid gap-2 text-sm font-medium text-gray-700">
                        Label
                        <Input
                          placeholder="Primary / Gift address"
                          {...register(`deliveryAddresses.${index}.label`)}
                        />
                        {addressError?.label?.message && (
                          <span className="text-[11px] font-normal text-rose-600">
                            {String(addressError.label.message)}
                          </span>
                        )}
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-gray-700">
                        Area{" "}
                        {isPrimaryShippingAddress
                          ? "(Wajib untuk Shipping)"
                          : "(Opsional)"}
                        <Input
                          placeholder="Kecamatan / Kota"
                          {...register(`deliveryAddresses.${index}.area`)}
                        />
                        {isPrimaryShippingAddress &&
                          !addressError?.area?.message && (
                            <span className="text-[11px] font-normal leading-4 text-gray-500">
                              Isi minimal kecamatan dan kota, mis. `Cipondoh /
                              Tangerang`.
                            </span>
                          )}
                        {addressError?.area?.message && (
                          <span className="text-[11px] font-normal text-rose-600">
                            {String(addressError.area.message)}
                          </span>
                        )}
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-gray-700">
                        Kode Pos{" "}
                        {isPrimaryShippingAddress
                          ? "(Wajib / dari alamat)"
                          : "(Opsional)"}
                        <Input
                          inputMode="numeric"
                          placeholder="Contoh: 11470"
                          {...register(
                            `deliveryAddresses.${index}.postalCode`,
                            {
                              setValueAs: (value) =>
                                typeof value === "string"
                                  ? sanitizePostalCodeInput(value)
                                  : "",
                            },
                          )}
                        />
                        {isPrimaryShippingAddress &&
                          !addressError?.postalCode?.message && (
                            <span className="text-[11px] font-normal leading-4 text-gray-500">
                              Isi 5 digit. Kalau ada di alamat, sistem akan coba
                              ambil otomatis.
                            </span>
                          )}
                        {addressError?.postalCode?.message && (
                          <span className="text-[11px] font-normal text-rose-600">
                            {String(addressError.postalCode.message)}
                          </span>
                        )}
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-gray-700 sm:col-span-2">
                        Full Address
                        <Textarea
                          className="min-h-20"
                          placeholder="Jalan, nomor, blok, RT/RW, kelurahan, kecamatan, kota"
                          {...register(
                            `deliveryAddresses.${index}.addressLine`,
                            {
                              onBlur: (event) => {
                                autofillPostalCodeFromAddress(
                                  index,
                                  event.target.value,
                                );
                              },
                            },
                          )}
                        />
                        {!addressError?.addressLine?.message && (
                          <span className="text-[11px] font-normal leading-4 text-gray-500">
                            Jangan campur nama penerima atau no. telepon di
                            field ini. Fokus ke satu alamat final.
                          </span>
                        )}
                        {addressError?.addressLine?.message && (
                          <span className="text-[11px] font-normal text-rose-600">
                            {String(addressError.addressLine.message)}
                          </span>
                        )}
                      </label>
                      {addressFields.length > 1 && (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8 w-fit gap-1 border-rose-200 text-rose-600 hover:bg-rose-50"
                          onClick={() => removeAddress(index)}
                        >
                          <Trash2 size={14} />
                          Remove Address
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Shipping & Delivery Method
                </p>
                {isCheckingShipping && (
                  <span className="text-xs text-indigo-600">
                    Menghitung ongkir otomatis...
                  </span>
                )}
              </div>

              <label className="grid gap-2 text-sm font-medium text-gray-700">
                Metode Pengiriman
                <Select {...register("deliveryMethod")}>
                  {selectableDeliveryMethodOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>

              <p className="text-xs text-gray-500">
                {
                  DELIVERY_METHOD_OPTIONS.find(
                    (option) => option.value === deliveryMethod,
                  )?.description
                }
              </p>

              <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
                <p>
                  Total berat kirim: {shippingWeightSummary.totalGram} gram (
                  {shippingWeightSummary.totalKg} kg)
                </p>
                {shippingWeightSummary.rows.length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-gray-700">
                      Lihat rincian berat per item
                    </summary>
                    <div className="mt-2 space-y-1">
                      {shippingWeightSummary.rows.map((row) => (
                        <p key={row.name}>
                          {row.name}: {row.qty} pcs x {row.perPcsGram} gram ={" "}
                          {row.totalGram} gram
                        </p>
                      ))}
                    </div>
                  </details>
                )}
              </div>

              {isFragileOrder && (
                <p
                  className={`rounded-lg px-3 py-2 text-xs ${
                    isAllowedFragileOrderMethod
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border border-amber-200 bg-amber-50 text-amber-700"
                  }`}
                >
                  {isAllowedFragileOrderMethod
                    ? `Produk ${fragileOrderReasons.join(", ")} sudah memakai metode yang diizinkan (${FRAGILE_ORDER_ALLOWED_METHODS_TEXT}).`
                    : `Produk ${fragileOrderReasons.join(", ")} hanya bisa ${FRAGILE_ORDER_ALLOWED_METHODS_TEXT}`}
                </p>
              )}

              {!shouldUseShippingEngine && (
                <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                  Metode ini tidak memakai kalkulasi ongkir live.
                </p>
              )}

              {displayedShippingDistanceKm !== null && (
                <p className="text-xs text-gray-600">
                  Estimasi jarak gudang ke alamat:{" "}
                  <span className="font-semibold">
                    {displayedShippingDistanceKm} km
                    {shippingDistanceSource === "ai_fallback" && (
                      <span className="ml-1 text-[10px] font-medium uppercase tracking-wide text-amber-600">
                        (AI fallback)
                      </span>
                    )}
                  </span>
                </p>
              )}

              {shippingWarning && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  {shippingWarning}
                </p>
              )}

              {shippingFallbackMessage && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  {shippingFallbackMessage}
                </p>
              )}

              {filteredShippingQuotes.length > 0 && (
                <div className="space-y-2">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    <p>
                      Rekomendasi termurah: {cheapestShippingQuote?.provider} -{" "}
                      {cheapestShippingQuote?.courierServiceName} ({" "}
                      {cheapestShippingQuote
                        ? formatCurrency(cheapestShippingQuote.price)
                        : "-"}
                      )
                    </p>
                    {fastestShippingQuote &&
                      fastestShippingQuote.id !== cheapestShippingQuote?.id && (
                        <p>
                          Rekomendasi tercepat: {fastestShippingQuote.provider}{" "}
                          - {fastestShippingQuote.courierServiceName} (ETA{" "}
                          {fastestShippingQuote.eta})
                        </p>
                      )}
                    {filteredShippingQuotes.length > 3 && (
                      <p className="mt-1 text-[11px] text-slate-600">
                        Menampilkan {displayedShippingQuotes.length} dari{" "}
                        {filteredShippingQuotes.length} layanan.
                      </p>
                    )}
                  </div>

                  {displayedShippingQuotes.map((quote) => {
                    const active = quote.id === selectedShippingQuoteId;
                    const isCheapest = cheapestShippingQuote?.id === quote.id;
                    const isFastest = fastestShippingQuote?.id === quote.id;
                    return (
                      <button
                        key={quote.id}
                        type="button"
                        onClick={() => setSelectedShippingQuoteId(quote.id)}
                        className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${
                          active
                            ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                            : "border-gray-200 bg-white text-gray-700"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-2 font-semibold">
                            <span>
                              {quote.provider} - {quote.courierServiceName}
                            </span>
                            {isCheapest && (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                                Termurah
                              </span>
                            )}
                            {isFastest && (
                              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                                Tercepat
                              </span>
                            )}
                          </span>
                          <span className="font-semibold">
                            {formatCurrency(quote.price)}
                          </span>
                        </div>
                        <p className="text-xs">
                          ETA {quote.eta} | Jarak {quote.distanceKm} km |
                          Source: API Kurir
                        </p>
                      </button>
                    );
                  })}

                  {filteredShippingQuotes.length > 3 && (
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 px-3 text-xs"
                        onClick={() =>
                          setShowAllShippingOptions((current) => !current)
                        }
                      >
                        {showAllShippingOptions
                          ? "Tampilkan ringkas"
                          : `Lihat semua layanan (${filteredShippingQuotes.length})`}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {!filteredShippingQuotes.length && !shippingPayload && (
                <p className="text-xs text-gray-500">
                  {shouldUseShippingEngine
                    ? isAddressTooShortForShipping
                      ? "Alamat terlalu pendek untuk kalkulasi ongkir. Lengkapi alamat utama minimal 8 karakter."
                      : "Lengkapi alamat utama, area (Kecamatan/Kota), kode pos, dan item order untuk kalkulasi ongkir otomatis."
                    : "Pilih metode berbasis kurir reguler/admin jika ingin kalkulasi ongkir otomatis."}
                </p>
              )}

              {!filteredShippingQuotes.length &&
                shippingPayload &&
                !isCheckingShipping && (
                  <p className="text-xs text-gray-500">
                    Belum ada opsi ongkir yang bisa dipakai untuk alamat ini.
                  </p>
                )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-gray-700">
                Payment Status
                <Select {...register("paymentStatus")}>
                  <option value="DP Paid">DP Paid</option>
                  <option value="Paid">Paid</option>
                </Select>
              </label>

              <label className="grid gap-2 text-sm font-medium text-gray-700">
                Manual Adjustment (+/-)
                <Input
                  type="number"
                  step="1000"
                  {...register("manualAdjustment", { valueAsNumber: true })}
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-gray-700">
                DP Paid Amount (Actual)
                <Input
                  type="number"
                  step="1000"
                  min={0}
                  {...register("dpPaidAmount", { valueAsNumber: true })}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-gray-700">
                Final Payment Amount (Actual)
                <Input
                  type="number"
                  step="1000"
                  min={0}
                  {...register("finalPaidAmount", { valueAsNumber: true })}
                />
              </label>
            </div>

            <label className="grid gap-2 text-sm font-medium text-gray-700">
              Notes
              <Textarea
                placeholder="Special handling, color palette, pickup notes"
                {...register("customNotes")}
              />
            </label>

            <div className="flex flex-wrap gap-3">
              <Button
                type="submit"
                className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:ring-indigo-500"
                disabled={
                  isSubmitting ||
                  isCapacityValidating ||
                  isCheckingShipping ||
                  isBlockedDate ||
                  isCalendarDateInvalid ||
                  dbWillExceed
                }
              >
                {isSubmitting
                  ? "Saving Booking..."
                  : isCapacityValidating
                    ? "Validating Capacity..."
                    : "Create Booking"}
              </Button>
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  reset();
                  setSubmitError("");
                  setSubmitSuccess("");
                  setQuickPaste("");
                  setSelectedOrderType("unknown");
                  setShowOrderTypeSelector(false);
                  setParsedPreview(null);
                  setProductionPreviewImageUrl("");
                  setVisionRawOutput("");
                  setDraftImported(false);
                  setShippingQuotes([]);
                  setSelectedShippingQuoteId("");
                  setShippingDistanceKm(null);
                  setShippingDistanceSource(undefined);
                  setShippingWarning("");
                }}
                className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                disabled={isSubmitting}
              >
                Reset Form
              </Button>
            </div>
            {submitError ? (
              <p className="text-sm font-medium text-rose-600">{submitError}</p>
            ) : null}
            {submitSuccess ? (
              <p className="text-sm font-medium text-emerald-600">
                {submitSuccess}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <PriceSummaryCard
            basePrice={basePrice}
            addOnTotal={addOnTotal}
            deliveryFee={deliveryFee + Number(manualAdjustment || 0)}
            totalPrice={totalPrice}
          />
          <Card className="rounded-xl shadow-sm">
            <CardHeader className="p-6 pb-2">
              <CardTitle>Payment Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-6 pb-6 pt-0 text-sm text-gray-600">
              <p className="flex items-center justify-between">
                <span>{getDownPaymentLabel()}</span>
                <span className="font-semibold text-gray-900">
                  {formatCurrency(suggestedDownPaymentAmount)}
                </span>
              </p>
              <p className="flex items-center justify-between">
                <span>DP Paid (Actual)</span>
                <span className="font-semibold text-gray-900">
                  {formatCurrency(downPaymentAmount)}
                </span>
              </p>
              <p className="flex items-center justify-between">
                <span>Total Paid (Actual)</span>
                <span className="font-semibold text-gray-900">
                  {formatCurrency(totalPaid)}
                </span>
              </p>
              <p className="flex items-center justify-between">
                <span>Remaining Balance</span>
                <span className="font-semibold text-gray-900">
                  {formatCurrency(remainingBalance)}
                </span>
              </p>
              <p className="text-xs text-gray-500">
                Effective status from actual paid amounts:{" "}
                {effectivePaymentStatus}.
              </p>
              <p className="rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
                Formula: Final Price = Base + Add-ons + Ongkir + Manual
                adjustment.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
