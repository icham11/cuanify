import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import NextLink from "next/link";
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
  type BakeryOrder,
  type NewOrderInput,
  type OrderItem,
} from "@/components/bakery/store";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Upload, X } from "lucide-react";
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
import { useRole } from "@/context/RoleContext";
import {
  DAILY_PRODUCTION_TOKEN_LIMIT,
  checkSlotAvailability,
  countConcurrentOrdersByTypeForSlot,
  getSlotLimitByOrderType,
  getDeliverySlotsForDate,
  inferOrderTypeFromItems,
  isSeasonalCookiesItem,
  isDateBlockedForOrdering,
  type SlotAvailabilityStatus,
  type SlotOrderType,
} from "@/lib/bookings/operations";
import {
  BAKERY_BLOCKED_DATES,
  calculateDownPayment,
} from "@/lib/bookings/config";
import { calculateOrderTokenFromItems } from "@/lib/bookings/order-token-calculator";
import type { Product } from "@/types/product";
import { buildDashboardProductName } from "@/lib/products/dashboard-name";
import {
  normalizeDateInput,
  parseSafeDate,
} from "@/lib/helpers/date-normalization";
import {
  DELIVERY_METHOD_OPTIONS,
  estimateOperationalWeightGram,
  getGrabCarOnlyReasons,
  isGrabCarOnlyItem,
  isBouquetItem,
  resolveAdminServiceCharge,
  resolveShippingParcelCount,
  type DeliveryMethod,
  usesShippingEngine,
} from "@/lib/bookings/delivery-rules";
import { useCalendarCapacity } from "@/hooks/useCalendarCapacity";
import { useBakerySettings } from "@/hooks/useBakerySettings";
import {
  getCalendarStatus,
  isPastDate,
} from "@/lib/calendar/getCalendarStatus";
import type {
  ShippingQuote,
  ShippingQuoteItemInput,
  ShippingQuoteResponse,
} from "@/lib/bookings/shipping-types";
import type { BookingFormInput } from "./booking-form-schema";

export const ADDRESS_LOCATION_KEYWORD_PATTERN =
  /\b(jl|jalan|gg|gang|blok|block|no|nomor|rt|rw|perum|perumahan|komplek|kompleks|cluster|apartemen|apartment|tower|unit|ruko|rumah|gedung|kav|kavling|kel|kelurahan|kec|kecamatan|kota|kab|kabupaten)\b/i;
export const ADDRESS_NUMBER_PATTERN = /\b\d+[a-zA-Z]?\b/;
export const ADDRESS_ROMAN_SECTION_PATTERN =
  /\b(?:jl|jalan|gg|gang|blok|block|tower|unit|kav|kavling)\.?\s+[^,\n]{0,40}\b[ivxlcdm]{2,6}\b/i;
export const ADDRESS_CONTACT_LABEL_PATTERN =
  /\b(nama\s+penerima|nama\s+customer|penerima|no\.?\s*(telp|hp)|nomor\s*(telp|hp)|telepon|phone|whatsapp|wa)\b/i;
export const ADDRESS_PHONE_PATTERN = /(?:^|\D)(?:\+?62|0)\d{7,13}(?:\D|$)/;

export function normalizeAddressText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizePostalCodeInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, 5);
}

export function extractPostalCodeFromAddress(value: string): string {
  return value.match(/\b\d{5}\b/)?.[0] ?? "";
}

export function toTitleCaseWords(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function inferAreaFromAddress(value: string): string {
  const normalized = normalizeAddressText(value);
  if (!normalized) return "";

  const cityAliasMap: Array<{ pattern: RegExp; area: string }> = [
    { pattern: /\bjaksel\b|\bjakarta selatan\b/i, area: "Jakarta Selatan" },
    { pattern: /\bjakbar\b|\bjakarta barat\b/i, area: "Jakarta Barat" },
    { pattern: /\bjakut\b|\bjakarta utara\b/i, area: "Jakarta Utara" },
    { pattern: /\bjakpus\b|\bjakarta pusat\b/i, area: "Jakarta Pusat" },
    {
      pattern: /\bjektim\b|\bjaktim\b|\bjakarta timur\b/i,
      area: "Jakarta Timur",
    },
    {
      pattern: /\btangsel\b|\btangerang selatan\b/i,
      area: "Tangerang Selatan",
    },
    { pattern: /\btangerang\b/i, area: "Tangerang" },
    { pattern: /\bbekasi\b/i, area: "Bekasi" },
    { pattern: /\bdepok\b/i, area: "Depok" },
    { pattern: /\bbogor\b/i, area: "Bogor" },
    { pattern: /\bbandung\b/i, area: "Bandung" },
  ];

  const cityArea =
    cityAliasMap.find((entry) => entry.pattern.test(normalized))?.area ?? "";

  const kecamatanMatch = value.match(
    /\b(?:kec\.?|kecamatan)\s+([a-zA-Z\s'-]{2,40})/i,
  );
  const rawKecamatan = kecamatanMatch?.[1] ?? "";
  const kecamatan = toTitleCaseWords(
    rawKecamatan
      .split(/\b(?:kel\.?|kelurahan|kota|kab\.?|kabupaten|dki|rt|rw)\b/i)[0]
      ?.replace(/[^a-zA-Z\s'-]/g, " ") ?? "",
  );

  if (kecamatan && cityArea) {
    return `${kecamatan} / ${cityArea}`;
  }
  if (kecamatan) return kecamatan;
  return cityArea;
}

export function areaLooksValid(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 3 && /[a-z]/i.test(trimmed);
}

export function addressLooksStructured(value: string): boolean {
  const normalized = normalizeAddressText(value);
  if (!normalized) return false;

  const hasLocationKeyword = ADDRESS_LOCATION_KEYWORD_PATTERN.test(normalized);
  const hasNumber = ADDRESS_NUMBER_PATTERN.test(value);
  const hasRomanSection = ADDRESS_ROMAN_SECTION_PATTERN.test(value);
  return hasLocationKeyword && (hasNumber || hasRomanSection);
}

export const defaultItemSelection = getDefaultCatalogSelection();

// ── Re-export tipe dari schema agar bisa dipakai oleh consumer ─────────────

export type BookingItemInput = BookingFormInput["items"][number];
export type ParserSource = WhatsAppSourceType;
export type ParserOrderType = WhatsAppOrderType | "unknown";
export const EMPTY_ITEMS: BookingFormInput["items"] = [];
export const EMPTY_ADDRESSES: BookingFormInput["deliveryAddresses"] = [];

export type BouquetFormType = "HAND" | "STANDING";
export type TokenDifficultyValue =
  | "SIMPLE"
  | "NORMAL"
  | "HARD"
  | "ADVANCED"
  | "EXPERT";

export const BOUQUET_HAND_COST = 100000;
export const BOUQUET_STANDING_COST = 250000;
export const BOUQUET_HAND_MIN_QTY = 7;
export const BOUQUET_HAND_MAX_QTY = 10;
export const BOUQUET_STANDING_MIN_QTY = 12;
export const BOUQUET_STANDING_MAX_QTY = 20;
export const TOKEN_DIFFICULTY_OPTIONS: Array<{
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
export const CUPCAKE_INDIVIDUAL_MIN_QTY = 10;
export const COOKIE_CUSTOM_TOTAL_MIN_QTY = 10;
export const COOKIE_INCLUDED_DESIGN_LIMIT = 5;
export const COOKIE_ADDITIONAL_DESIGN_PRICE = 10_000;
export const COOKIE_ADDITIONAL_DESIGN_ADDON_IDS = [
  "cookie-additional-design",
  "cookie-design-surcharge",
  "cookie-design-extra",
] as const;
export const DARK_COLOR_BUTTERCREAM_ADDON_ID = "dark-color-buttercream";
export const DARK_BUTTERCREAM_COLOR_OPTIONS = [
  "Black",
  "Red",
  "Navy Blue",
  "Forest Green",
  "Electric Blue",
  "Fuschia Pink",
] as const;
export const MAX_DARK_BUTTERCREAM_COLORS = 3;
export const CUPCAKE_COOKIE_ADDON_IDS = [
  "cookie-simple",
  "cookie-normal",
  "cookie-hard",
  "cookie-advanced",
  "cookie-expert",
] as const;
export const BOUQUET_EXTRA_3_FLOWER_ADDON_ID = "bouquet-extra-3-flower";
export const BOUQUET_EXTRA_6_FLOWER_ADDON_ID = "bouquet-extra-6-flower";
export const FRAGILE_ORDER_ALLOWED_METHODS: DeliveryMethod[] = [
  "PICKUP",
  "CUSTOMER_APP_COURIER",
  "ASSISTED_GOSEND",
  "ASSISTED_GRAB",
  "ASSISTED_GOCAR",
  "ASSISTED_PAXEL",
  "ASSISTED_SAME_DAY",
  "REGULAR_JNE_JNT",
];
export const FRAGILE_ORDER_ALLOWED_METHODS_TEXT =
  "Pickup, Grab/GoCar (pesan customer), GoSend admin, Grab admin, GoCar admin, Paxel admin, Same Day admin, atau JNE/J&T reguler.";

export function normalizeDarkButtercreamColors(value: unknown): string[] {
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

export function isCupcakeCookieAddOnId(addOnId: string): boolean {
  return CUPCAKE_COOKIE_ADDON_IDS.includes(
    addOnId as (typeof CUPCAKE_COOKIE_ADDON_IDS)[number],
  );
}

export function normalizeTokenDifficultyValue(value: unknown): TokenDifficultyValue {
  const normalized =
    typeof value === "string" ? value.trim().toUpperCase() : "";

  if (normalized === "NORMAL" || normalized === "MEDIUM") return "NORMAL";
  if (normalized === "HARD" || normalized === "DIFFICULT") return "HARD";
  if (normalized === "ADVANCED") return "ADVANCED";
  if (normalized === "EXPERT") return "EXPERT";
  return "SIMPLE";
}

export function normalizeBouquetCookiePriceValue(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;

  const rounded = Math.round(parsed);
  // Common shorthand from parsed text: 17 means 17k.
  if (rounded < 1000) return rounded * 1000;
  return rounded;
}

export function normalizeBouquetPriceOverrideValue(
  value: unknown,
): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.round(parsed);
}

export function normalizeSharingBoxPriceOverrideValue(
  value: unknown,
): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;

  return Math.round(parsed);
}

export function normalizeCookieDesignCount(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.min(100, Math.round(parsed));
}

export function getAdditionalCookieDesignCount(value: unknown): number {
  const designCount = normalizeCookieDesignCount(value) ?? 0;
  return Math.max(0, designCount - COOKIE_INCLUDED_DESIGN_LIMIT);
}

export function getCookieAdditionalDesignCountFromItem(
  item: Pick<BookingItemInput, "designCount" | "additionalDesignCount">,
): number {
  const explicitAdditionalDesignCount = normalizeCookieDesignCount(
    item.additionalDesignCount,
  );
  if (explicitAdditionalDesignCount !== undefined) {
    return explicitAdditionalDesignCount;
  }

  const designCount = normalizeCookieDesignCount(item.designCount);
  if (designCount === undefined) {
    return 0;
  }

  return getAdditionalCookieDesignCount(designCount);
}

export function getTokenDifficultyOption(value: unknown) {
  const normalized = normalizeTokenDifficultyValue(value);
  return (
    TOKEN_DIFFICULTY_OPTIONS.find((option) => option.value === normalized) ??
    TOKEN_DIFFICULTY_OPTIONS[0]
  );
}

export interface ItemQuantityRule {
  label: string;
  min: number;
  max?: number;
  helperText?: string;
}

export function orderTypeLabel(orderType: SlotOrderType): string {
  return orderType === "SEASONAL" ? "Seasonal/Bulk" : "Custom";
}

export type BookingItemGroupLabel = "CUSTOM" | "SEASONAL_EVENT";

export function getBookingItemGroupLabel(item: {
  category?: string;
  subcategory?: string;
  productName?: string;
  size?: string;
  quantity?: number;
}): BookingItemGroupLabel {
  return isSeasonalCookiesItem({
    category: item.category || "",
    subcategory: item.subcategory,
    productName: item.productName,
    size: item.size,
    quantity: Number(item.quantity) || 0,
  })
    ? "SEASONAL_EVENT"
    : "CUSTOM";
}

export function slotStatusLabel(status: SlotAvailabilityStatus): string {
  if (status === "FULL") return "FULL";
  if (status === "ALMOST_FULL") return "ALMOST_FULL";
  return "AVAILABLE";
}

export function formatIsoDateToIdLabel(value: string): string {
  const parsed = parseSafeDate(value);
  if (!parsed) return value;
  return parsed.toLocaleDateString("id-ID", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function parseEtaToHours(etaText: string): number {
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

export interface ParseWhatsAppApiResponse {
  success: boolean;
  parsed: ParsedWhatsAppOrder;
  autoFill: BookingFormAutoFill;
  warnings?: string[];
  productionPreviewImageUrl?: string | null;
  visionRawOutput?: string | null;
  error?: string;
}

export interface ParseWhatsAppRequestArgs {
  sourceType: ParserSource;
  orderType: ParserOrderType;
  text?: string;
  files?: File[];
  referenceLabels?: string;
}

export class ParseWhatsAppApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ParseWhatsAppApiError";
    this.status = status;
  }
}

export interface CapacitySingleDateResponse {
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

export interface DuplicateTemplateWarningState {
  templatePreview: string;
  matches: Array<{
    id: string;
    bookingLabel: string;
    customerName: string;
    deliveryDateLabel: string;
    similarityLabel: string;
    matchType: "exact" | "similar";
  }>;
}

export const whatsappOrderTypeOptions: Array<{
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
export const specificWhatsappOrderTypeOptions = whatsappOrderTypeOptions.filter(
  (option) => option.value !== "unknown",
);

export function normalizeReferenceLabelInput(value: string): string[] {
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

export function buildParsedReferenceImages(args: {
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
      note: reference.note?.trim() || undefined,
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
    const requestedNote = args.requestedLabels[index]?.trim();
    byUrl.set(trimmedUrl, {
      url: trimmedUrl,
      label: existing?.label || `Gambar ${index + 1}`,
      note: requestedNote || existing?.note,
      orderIndex:
        existing?.orderIndex ??
        (requestedNote || uploadedImageUrls.length > 1 ? index : undefined),
    });
  });

  return Array.from(byUrl.values());
}

export function summarizeDetectedItems(
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

export function getParsedSubtotalOverride(
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

export function getParsedUnitPriceOverride(
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

export function hasParsedPricingOverride(
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

export function extractCookieDifficultyBreakdown(
  item:
    | Pick<
        BookingItemInput,
        "category" | "notes" | "pricingSource" | "cookieDifficultyBreakdown"
      >
    | undefined
    | null,
): string | null {
  if (!item) return null;
  if (item.category !== "Cookies") return null;

  const explicit = String(item.cookieDifficultyBreakdown || "").trim();
  if (explicit) return explicit;
  if (item.pricingSource !== "RECAP") return null;

  const notes = String(item.notes || "");
  const matched = notes.match(/(?:^|\|)\s*Breakdown:\s*([^|]+)/i);
  const value = (matched?.[1] || "").trim();
  return value || null;
}

export type CookieDifficultyRow = {
  difficulty: TokenDifficultyValue;
  quantity: number;
};

export function parseCookieDifficultyRows(breakdown: string): CookieDifficultyRow[] {
  const rows: CookieDifficultyRow[] = [];
  const normalizedBreakdown = String(breakdown || "");
  const matcher = /(\d{1,4})\s*pcs?\s*(simple|normal|hard|advanced|expert)\b/gi;

  for (const match of normalizedBreakdown.matchAll(matcher)) {
    const quantity = Number(match[1] || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    rows.push({
      difficulty: normalizeTokenDifficultyValue(match[2] || "SIMPLE"),
      quantity: Math.round(quantity),
    });
  }

  return rows;
}

export function formatCookieDifficultyRows(rows: CookieDifficultyRow[]): string {
  return rows
    .filter((row) => row.quantity > 0)
    .map((row) => `${row.quantity} pcs ${row.difficulty}`)
    .join(", ");
}

export function mergeCookieBreakdownIntoNotes(rows: CookieDifficultyRow[]): string {
  return formatCookieDifficultyRows(rows).slice(0, 400);
}

export function removeCookieBreakdownFromNotes(notes: string): string {
  return String(notes || "")
    .split("|")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .filter((segment) => !/^breakdown\s*:/i.test(segment))
    .join(" | ")
    .slice(0, 400);
}

export function extractBouquetGreetingCardFromNotes(notes: string): string {
  const source = String(notes || "");
  const matched = source.match(/(?:^|\||\n)\s*kartu\s*ucapan\s*:\s*([^|\n]+)/i);
  return (matched?.[1] || "").trim().slice(0, 400);
}

export function extractBouquetPaperColorFromNotes(notes: string): string {
  const source = String(notes || "");
  const matched = source.match(
    /(?:^|\||\n)\s*warna\s*kertas\s*bouquet\s*:\s*([^|\n]+)/i,
  );
  return (matched?.[1] || "").trim().slice(0, 200);
}

export function extractBouquetRibbonFromNotes(notes: string): string {
  const source = String(notes || "");
  const matched = source.match(/(?:^|\||\n)\s*ribbon\s*:\s*([^|\n]+)/i);
  return (matched?.[1] || "").trim().slice(0, 200);
}

export function extractBouquetFlowerCountFromNotes(notes: string): string {
  const source = String(notes || "");
  const matched = source.match(/(?:^|\||\n)\s*jumlah\s*bunga\s*:\s*([^|\n]+)/i);
  return (matched?.[1] || "").trim().slice(0, 200);
}

export function extractBouquetFlowerColorFromNotes(notes: string): string {
  const source = String(notes || "");
  const matched = source.match(/(?:^|\||\n)\s*warna\s*bunga\s*:\s*([^|\n]+)/i);
  return (matched?.[1] || "").trim().slice(0, 200);
}

export function extractBouquetRibbonColorFromNotes(notes: string): string {
  const source = String(notes || "");
  const matched = source.match(/(?:^|\||\n)\s*warna\s*pita\s*:\s*([^|\n]+)/i);
  return (matched?.[1] || "").trim().slice(0, 200);
}

export function removeBouquetStructuredFieldsFromNotes(notes: string): string {
  return String(notes || "")
    .split(/\n|\|/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .filter((segment) => !/^kartu\s*ucapan\s*:/i.test(segment))
    .filter((segment) => !/^warna\s*kertas\s*bouquet\s*:/i.test(segment))
    .filter((segment) => !/^ribbon\s*:/i.test(segment))
    .filter((segment) => !/^jumlah\s*bunga\s*:/i.test(segment))
    .filter((segment) => !/^warna\s*bunga\s*:/i.test(segment))
    .filter((segment) => !/^warna\s*pita\s*:/i.test(segment))
    .join(" | ")
    .slice(0, 400);
}

export function inferBouquetFlowerCountFromAddOns(args: {
  addOns?: string[];
  addOnQuantities?: Record<string, number>;
}): string {
  const addOnIds = Array.isArray(args.addOns) ? args.addOns : [];
  const addOnQuantities = normalizeAddOnQuantities(args.addOnQuantities);

  const getUnits = (addOnId: string) =>
    Math.max(1, addOnQuantities[addOnId] ?? 1);

  let totalFlowers = 0;
  if (addOnIds.includes(BOUQUET_EXTRA_3_FLOWER_ADDON_ID)) {
    totalFlowers += 3 * getUnits(BOUQUET_EXTRA_3_FLOWER_ADDON_ID);
  }
  if (addOnIds.includes(BOUQUET_EXTRA_6_FLOWER_ADDON_ID)) {
    totalFlowers += 6 * getUnits(BOUQUET_EXTRA_6_FLOWER_ADDON_ID);
  }

  return totalFlowers > 0 ? String(totalFlowers) : "";
}

export function inferBouquetCookieFillQuantityFromText(args: {
  category?: string;
  subcategory?: string;
  productName?: string;
  size?: string;
  notes?: string;
}): number | null {
  if ((args.category || "") !== "Buket") return null;

  const source = `${args.subcategory || ""} ${args.productName || ""} ${args.size || ""} ${args.notes || ""}`;
  const match = source.match(/\bisi\s*(\d{1,3})\b/i);
  if (!match?.[1]) return null;

  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.max(1, Math.round(parsed));
}

export function getDefaultSelectionFromCatalog(
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

export type CookieCatalogMode = "CUSTOM" | "SEASONAL_EVENT";

export function resolveCookieCatalogMode(selection: {
  category?: string;
  subcategory?: string;
}): CookieCatalogMode {
  if ((selection.category || "") !== "Cookies") return "CUSTOM";
  const normalizedSubcategory = String(selection.subcategory || "")
    .toLowerCase()
    .trim();
  return normalizedSubcategory.includes("event") ||
    normalizedSubcategory.includes("seasonal")
    ? "SEASONAL_EVENT"
    : "CUSTOM";
}

export function getCookieSelectionByMode(args: {
  catalog: PricelistCategory[];
  mode: CookieCatalogMode;
  previousSelection?: Partial<CatalogSelection>;
}): CatalogSelection {
  const fallback = getDefaultSelectionFromCatalog(args.catalog, "Cookies");
  const categoryData = args.catalog.find(
    (entry) => entry.category === "Cookies",
  );
  if (!categoryData) return fallback;

  const targetSubcategory =
    args.mode === "SEASONAL_EVENT"
      ? categoryData.subcategories.find((entry) =>
          entry.name.toLowerCase().includes("event"),
        )
      : categoryData.subcategories.find((entry) =>
          entry.name.toLowerCase().includes("custom"),
        );

  const resolvedSubcategory =
    targetSubcategory ?? categoryData.subcategories[0];
  if (!resolvedSubcategory) return fallback;

  const preservedProduct = resolvedSubcategory.products.find(
    (entry) => entry.name === args.previousSelection?.productName,
  );
  const productData = preservedProduct ?? resolvedSubcategory.products[0];
  const variantData =
    productData?.variants.find(
      (entry) => entry.label === args.previousSelection?.size,
    ) ??
    productData?.variants.find(
      (entry) => entry.label === productData.defaultVariant,
    ) ??
    productData?.variants[0];

  return {
    category: "Cookies",
    subcategory: resolvedSubcategory.name,
    productName: productData?.name ?? "",
    size: variantData?.label ?? "",
  };
}

export function ensureSelectionFromCatalog(
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

export function getVariantsFromCatalog(
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

export function getUnitPriceFromCatalog(
  catalog: PricelistCategory[],
  selection: CatalogSelection,
): number {
  const variants = getVariantsFromCatalog(catalog, selection);
  const selected = variants.find((entry) => entry.label === selection.size);
  return selected?.price ?? variants[0]?.price ?? 0;
}

export function getCategoryAddOnsFromCatalog(
  addOnCatalog: Record<string, CatalogAddOn[]>,
  category: string,
) {
  return addOnCatalog[category] ?? [];
}

export function getCookieAdditionalDesignUnitPrice(args?: {
  addOnCatalog?: Record<string, CatalogAddOn[]>;
  categoryAddOns?: CatalogAddOn[];
  item?: Pick<BookingItemInput, "addOnPriceOverrides">;
}): number {
  const normalizedOverrides = normalizeAddOnPriceOverrides(
    args?.item?.addOnPriceOverrides,
  );

  for (const addOnId of COOKIE_ADDITIONAL_DESIGN_ADDON_IDS) {
    const overriddenPrice = normalizedOverrides[addOnId];
    if (Number.isFinite(overriddenPrice) && overriddenPrice >= 0) {
      return Math.round(overriddenPrice);
    }
  }

  const addOns =
    args?.categoryAddOns ??
    (args?.addOnCatalog
      ? getCategoryAddOnsFromCatalog(args.addOnCatalog, "Cookies")
      : []);

  for (const addOnId of COOKIE_ADDITIONAL_DESIGN_ADDON_IDS) {
    const byId = addOns.find((addOn) => addOn.id === addOnId);
    if (byId && Number.isFinite(byId.price) && byId.price >= 0) {
      return Math.round(byId.price);
    }
  }

  const byLabel = addOns.find((addOn) => {
    const label = String(addOn.label || "").toLowerCase();
    return (
      (label.includes("design") || label.includes("desain")) &&
      (label.includes("surcharge") ||
        label.includes("extra") ||
        label.includes("tambahan"))
    );
  });
  if (byLabel && Number.isFinite(byLabel.price) && byLabel.price >= 0) {
    return Math.round(byLabel.price);
  }

  return COOKIE_ADDITIONAL_DESIGN_PRICE;
}

export function getFlavorOptionsForCategory(category: string) {
  return getFlavorOptionsByCategory(category);
}

export function getNonFlavorAddOnsForCategory(args: {
  addOns: CatalogAddOn[];
  category: string;
}): CatalogAddOn[] {
  const flavorIds = new Set(getFlavorAddOnIdsByCategory(args.category));
  if (flavorIds.size === 0) return args.addOns;
  return args.addOns.filter((addon) => !flavorIds.has(addon.id));
}

export function normalizeAddOnQuantities(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};

  const next: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) continue;
    next[key] = Math.max(1, Math.round(parsed));
  }

  return next;
}

export function normalizeAddOnPriceOverrides(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};

  const next: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) continue;
    next[key] = Math.round(parsed);
  }

  return next;
}

export type CustomAddOnInput = {
  label: string;
  price: number;
};

export function normalizeCustomAddOns(value: unknown): CustomAddOnInput[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      const raw =
        entry && typeof entry === "object"
          ? (entry as { label?: unknown; price?: unknown })
          : undefined;
      const label = typeof raw?.label === "string" ? raw.label.trim() : "";
      const parsedPrice = Number(raw?.price);
      const price = Number.isFinite(parsedPrice)
        ? Math.max(0, Math.round(parsedPrice))
        : 0;
      return { label, price } satisfies CustomAddOnInput;
    })
    .filter((entry) => entry.label.length > 0 || entry.price > 0);
}

export function getCustomAddOnTotal(
  customAddOns: CustomAddOnInput[],
  quantity: number,
): number {
  const perUnit = customAddOns.reduce((sum, entry) => sum + entry.price, 0);
  return perUnit * Math.max(1, quantity || 0);
}

export function supportsAddOnQuantity(category: string, addonId: string): boolean {
  if (addonId === DARK_COLOR_BUTTERCREAM_ADDON_ID) return false;
  if (isBouquetFlowerAddOnId(addonId)) return false;
  if (!category) return false;
  const flavorIds = new Set(getFlavorAddOnIdsByCategory(category));
  return !flavorIds.has(addonId);
}

export function isTwoTierCakeItem(item: BookingItemInput): boolean {
  if (item.category !== "Cake") return false;
  const source =
    `${item.subcategory || ""} ${item.productName || ""}`.toLowerCase();
  return source.includes("two tier") || source.includes("two-tier");
}

export function formatOneTierCakeVariantLabel(sizeLabel: string): string {
  const match = sizeLabel.match(/^D\s*(\d+)\s*[-x/]\s*T\s*(\d+)$/i);
  if (!match) return sizeLabel;

  const diameter = match[1];
  const height = match[2];
  return `Diameter ${diameter} cm x Tinggi ${height} cm`;
}

export function formatTwoTierCakeVariantLabel(sizeLabel: string): string {
  const parts = sizeLabel
    .split("+")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (parts.length < 2) return sizeLabel;

  const toReadable = (segment: string, fallbackPrefix: string): string => {
    const match = segment.match(
      /(Top|Bottom)?\s*D\s*(\d+)\s*[-x/]\s*T\s*(\d+)/i,
    );
    if (!match) return segment;

    const prefix = match[1] ? match[1] : fallbackPrefix;
    const diameter = match[2];
    const height = match[3];
    return `${prefix}: ${diameter}x${height} cm`;
  };

  return `${toReadable(parts[0], "Top")} | ${toReadable(parts[1], "Bottom")}`;
}

export function getReadableVariantLabel(item: BookingItemInput): string {
  const raw = String(item.size || "").trim();
  if (!raw) return "-";

  if (isTwoTierCakeItem(item)) {
    return formatTwoTierCakeVariantLabel(raw);
  }

  if (item.category === "Cake") {
    return formatOneTierCakeVariantLabel(raw);
  }

  return raw;
}

export function getTwoTierSummaryLabel(item: BookingItemInput): string {
  if (!isTwoTierCakeItem(item)) return "";

  const pieces = String(item.size || "")
    .split("+")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (pieces.length < 2) {
    return "Two Tiered Cake: 1 set = Top + Bottom tier, tetap 1 item di order.";
  }

  const readable = formatTwoTierCakeVariantLabel(String(item.size || ""));
  return `Two Tiered Cake: ${readable}, tetap 1 item di order.`;
}

export function getAddOnUnitMultiplier(args: {
  category: string;
  addonId: string;
  addOnQuantities: Record<string, number>;
}): number {
  if (!supportsAddOnQuantity(args.category, args.addonId)) return 1;
  return Math.max(1, args.addOnQuantities[args.addonId] ?? 1);
}

export function isBouquetFlowerAddOnId(addonId: string): boolean {
  return (
    addonId === BOUQUET_EXTRA_3_FLOWER_ADDON_ID ||
    addonId === BOUQUET_EXTRA_6_FLOWER_ADDON_ID
  );
}

export function getBouquetFlowerAddOnUnitPrice(args: {
  addonId: string;
  bouquetType: BouquetFormType | null;
}): number | null {
  if (!isBouquetFlowerAddOnId(args.addonId)) return null;

  if (args.addonId === BOUQUET_EXTRA_3_FLOWER_ADDON_ID) {
    return 20000;
  }

  if (args.addonId === BOUQUET_EXTRA_6_FLOWER_ADDON_ID) {
    return 35000;
  }

  return null;
}

export function normalizeBubblewrapSourceText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveBubblewrapUnitPrice(args: {
  category: string;
  addonId: string;
  defaultPrice: number;
  itemSelection?: Pick<
    BookingItemInput,
    "category" | "subcategory" | "productName" | "size"
  >;
}): number {
  const roundedDefault = Math.max(0, Math.round(args.defaultPrice));
  if (args.addonId !== "bubblewrap") return roundedDefault;

  const source = normalizeBubblewrapSourceText(
    `${args.itemSelection?.category || ""} ${args.itemSelection?.subcategory || ""} ${args.itemSelection?.productName || ""} ${args.itemSelection?.size || ""}`,
  );

  if (source.includes("hand bouquet") || source.includes("hbq")) {
    return 20_000;
  }
  if (
    source.includes("character box") ||
    source.includes("sharing box isi 9") ||
    source.includes("box isi 9")
  ) {
    return 10_000;
  }
  if (
    source.includes("sharing box isi 2") ||
    source.includes("sharing box isi 3") ||
    source.includes("sharing box isi 4") ||
    source.includes("sharing box")
  ) {
    return 5_000;
  }
  if (source.includes("diy")) {
    return 10_000;
  }
  if (source.includes("bauble")) {
    return 5_000;
  }
  if (
    source.includes("dimsum box") ||
    source.includes("lotus box") ||
    source.includes("bites box") ||
    source.includes("bites nastar")
  ) {
    return 10_000;
  }
  if (
    args.category === "Cookies" ||
    source.includes("cookies") ||
    source.includes("cookie")
  ) {
    return 2_000;
  }

  return roundedDefault;
}

export function isOrderLevelAddOnId(addonId: string): boolean {
  return addonId === "bubblewrap" || addonId === "custom-card";
}

export function calculatePerUnitAddOnPrice(args: {
  category: string;
  bouquetType?: BouquetFormType | null;
  selectedAddOnIds: string[];
  addOnQuantities: Record<string, number>;
  addOnPriceOverrides?: Record<string, number>;
  addOnCatalogEntries: CatalogAddOn[];
  itemSelection?: Pick<
    BookingItemInput,
    "category" | "subcategory" | "productName" | "size"
  >;
}): number {
  return args.selectedAddOnIds.reduce((sum, addonId) => {
    const addon = args.addOnCatalogEntries.find(
      (entry) => entry.id === addonId,
    );
    if (!addon) return sum;
    if (isOrderLevelAddOnId(addonId)) return sum;

    const multiplier = getAddOnUnitMultiplier({
      category: args.category,
      addonId,
      addOnQuantities: args.addOnQuantities,
    });
    const overriddenPrice = args.addOnPriceOverrides?.[addonId];
    const baseUnitPrice =
      Number.isFinite(Number(overriddenPrice)) && Number(overriddenPrice) >= 0
        ? Number(overriddenPrice)
        : args.category === "Buket"
          ? (getBouquetFlowerAddOnUnitPrice({
              addonId,
              bouquetType: args.bouquetType ?? null,
            }) ?? addon.price)
          : addon.price;
    const unitPrice = resolveBubblewrapUnitPrice({
      category: args.category,
      addonId,
      defaultPrice: baseUnitPrice,
      itemSelection: args.itemSelection,
    });
    return sum + unitPrice * multiplier;
  }, 0);
}

export function calculateOrderLevelAddOnPrice(args: {
  category: string;
  bouquetType?: BouquetFormType | null;
  selectedAddOnIds: string[];
  addOnQuantities: Record<string, number>;
  addOnPriceOverrides?: Record<string, number>;
  addOnCatalogEntries: CatalogAddOn[];
  itemSelection?: Pick<
    BookingItemInput,
    "category" | "subcategory" | "productName" | "size"
  >;
}): number {
  return args.selectedAddOnIds.reduce((sum, addonId) => {
    if (!isOrderLevelAddOnId(addonId)) return sum;

    const addon = args.addOnCatalogEntries.find(
      (entry) => entry.id === addonId,
    );
    if (!addon) return sum;

    const multiplier = getAddOnUnitMultiplier({
      category: args.category,
      addonId,
      addOnQuantities: args.addOnQuantities,
    });
    const overriddenPrice = args.addOnPriceOverrides?.[addonId];
    const baseUnitPrice =
      Number.isFinite(Number(overriddenPrice)) && Number(overriddenPrice) >= 0
        ? Number(overriddenPrice)
        : args.category === "Buket"
          ? (getBouquetFlowerAddOnUnitPrice({
              addonId,
              bouquetType: args.bouquetType ?? null,
            }) ?? addon.price)
          : addon.price;
    const unitPrice = resolveBubblewrapUnitPrice({
      category: args.category,
      addonId,
      defaultPrice: baseUnitPrice,
      itemSelection: args.itemSelection,
    });
    return sum + unitPrice * multiplier;
  }, 0);
}

export function getSelectedFlavorIdFromItem(item: BookingItemInput): string | null {
  const flavorOptions = getFlavorOptionsForCategory(item.category);
  if (flavorOptions.length === 0) return null;

  const selected = flavorOptions.find((option) =>
    (item.addOns ?? []).includes(option.id),
  );
  return selected?.id ?? null;
}

export function detectBouquetTypeFromItem(
  item: BookingItemInput,
): BouquetFormType | null {
  if (item.category !== "Buket") return null;
  const source =
    `${item.subcategory || ""} ${item.productName || ""} ${item.size || ""}`.toLowerCase();
  if (source.includes("standing")) return "STANDING";
  if (source.includes("hand")) return "HAND";
  return null;
}

export function getBouquetCostByType(type: BouquetFormType): number {
  return type === "HAND" ? BOUQUET_HAND_COST : BOUQUET_STANDING_COST;
}

export function getBouquetMinQuantity(type: BouquetFormType): number {
  return type === "HAND" ? BOUQUET_HAND_MIN_QTY : BOUQUET_STANDING_MIN_QTY;
}

export function resolveBouquetSelectionByType(
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

export function isValidBouquetQuantity(
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

export function getBouquetQtyRangeLabel(type: BouquetFormType): string {
  if (type === "HAND") {
    return `${BOUQUET_HAND_MIN_QTY}-${BOUQUET_HAND_MAX_QTY}`;
  }
  return `${BOUQUET_STANDING_MIN_QTY}-${BOUQUET_STANDING_MAX_QTY}`;
}

export function getQuantityRuleViolationMessage(rule: ItemQuantityRule): string {
  if (typeof rule.max === "number") {
    return `Qty wajib ${rule.min}-${rule.max}.`;
  }
  return `Minimal qty ${rule.min}.`;
}

export function formatCompactSurcharge(value: number): string {
  const rounded = Math.round(Number(value) || 0);
  if (rounded <= 0) return "0";
  if (rounded % 1000 === 0) {
    return `${Math.round(rounded / 1000)}k`;
  }
  return formatCurrency(rounded);
}



export function resolveIndividualCupcakeSizeByQuantity(args: {
  catalog: PricelistCategory[];
  selection: CatalogSelection;
  quantity: number;
}): string {
  if (args.selection.category !== "Cupcakes") return args.selection.size;

  const source =
    `${args.selection.subcategory || ""} ${args.selection.productName || ""} ${args.selection.size || ""}`.toLowerCase();
  if (!source.includes("individual")) return args.selection.size;

  const variants = getVariantsFromCatalog(args.catalog, args.selection);
  if (variants.length === 0) return args.selection.size;

  const quantity = Math.max(1, Number(args.quantity) || 1);
  const findVariant = (needle: string) =>
    variants.find((entry) => entry.label.toLowerCase().includes(needle))?.label;

  if (quantity >= 100) {
    return (
      findVariant(">=100") ||
      findVariant(">=50") ||
      findVariant("25-49") ||
      findVariant("10-24") ||
      args.selection.size ||
      variants[0]?.label ||
      ""
    );
  }

  if (quantity >= 50) {
    return (
      findVariant(">=50") ||
      findVariant("25-49") ||
      findVariant("10-24") ||
      args.selection.size ||
      variants[0]?.label ||
      ""
    );
  }

  if (quantity >= 25) {
    return (
      findVariant("25-49") ||
      findVariant("10-24") ||
      args.selection.size ||
      variants[0]?.label ||
      ""
    );
  }

  return (
    findVariant("10-24") || args.selection.size || variants[0]?.label || ""
  );
}

export function getAutoQuantityForItem(item: BookingItemInput): number | null {
  const bouquetType = detectBouquetTypeFromItem(item);
  if (bouquetType) {
    return getBouquetMinQuantity(bouquetType);
  }

  // Kuantitas default lainnya kini mengandalkan fallback ke 1 di UI, atau validasi dinamis dari DB.

  return null;
}

export function isCustomCookieItem(
  item: Pick<BookingItemInput, "category" | "productName" | "size">,
): boolean {
  if (item.category !== "Cookies") return false;
  const productName = String(item.productName || "").toLowerCase();
  const size = String(item.size || "").toLowerCase();

  if (productName === "cookies") return true;
  if (["simple", "normal", "hard", "advanced", "expert"].includes(size)) {
    return true;
  }

  return (
    productName.includes("custom cookies") ||
    productName.includes("individual cookie")
  );
}

export function isCustomCookieSharingBoxItem(
  item: Pick<BookingItemInput, "category" | "subcategory" | "productName">,
): boolean {
  if (item.category !== "Cookies") return false;
  const subcategory = String(item.subcategory || "").toLowerCase();
  const productName = String(item.productName || "").toLowerCase();

  return (
    subcategory.includes("custom cookies") &&
    productName.includes("sharing box")
  );
}

export function getItemQuantityRule( // Definisikan fungsi penentu aturan kuantitas produk
  item: BookingItemInput, // Parameter pertama: data input item form
  minimumOrderMap?: Map<string, number>, // TAMBAHKAN: Parameter kedua: Map minimal order dari database (opsional)
): ItemQuantityRule { // Tipe return fungsi: objek aturan kuantitas
  const source = // Variabel penyimpan identitas produk terformat
    `${item.subcategory || ""} ${item.productName || ""} ${item.size || ""}`.toLowerCase(); // Gabung subkategori, nama produk, dan varian secara lowercase

  const dashboardName = normalizeTokenLookupKey( // TAMBAHKAN: Normalisasi nama produk untuk lookup key DB
    toDashboardProductNameFromItem(item), // TAMBAHKAN: Bangun nama produk dashboard sesuai varian
  ); // Akhir dari normalisasi key
  
  const dbMinOrder = minimumOrderMap?.get(dashboardName) ?? 0; // TAMBAHKAN: Dapatkan batas minimal order dari map DB

  if (isCustomCookieItem(item)) {
    const effectiveMin = dbMinOrder > 0 ? dbMinOrder : COOKIE_CUSTOM_TOTAL_MIN_QTY;
    const splitEx1 = Math.max(1, Math.floor(effectiveMin / 2));
    const splitEx2 = Math.max(1, effectiveMin - splitEx1);
    return {
      label: "Quantity (pcs)",
      min: 1, // Kuantitas per varian bisa 1 karena dicek totalnya nanti
      helperText: `Minimum total custom cookies ${effectiveMin} pcs per order. Bisa split varian (contoh ${splitEx1} Simple + ${splitEx2} Hard).`,
    };
  }

  if (dbMinOrder > 0) { // TAMBAHKAN: Jika minimal order diset di database
    return { // TAMBAHKAN: Kembalikan aturan minimal order khusus
      label: "Quantity", // TAMBAHKAN: Label input qty
      min: dbMinOrder, // TAMBAHKAN: Batas minimum di-set dari nilai DB
      helperText: `Minimal order untuk ${item.productName} (${item.size || "Standard"}) adalah ${dbMinOrder} pcs.`, // TAMBAHKAN: Pesan keterangan batas order
    }; // TAMBAHKAN: Akhir return objek
  } // TAMBAHKAN: Akhir pengecekan dbMinOrder

  const bouquetType = detectBouquetTypeFromItem(item); // Cek apakah produk bertipe Buket
  if (bouquetType === "HAND") { // Jika bertipe Buket Tangan (Hand Bouquet)
    return { // Kembalikan aturan kuantitas Hand Bouquet
      label: "Quantity (isi cookies)", // Label input
      min: 1, // Batas min unit
      helperText: `Hand bouquet: isi cookies ${BOUQUET_HAND_MIN_QTY}-${BOUQUET_HAND_MAX_QTY}. Qty 1-${BOUQUET_HAND_MIN_QTY - 1} dibaca sebagai jumlah unit bouquet (harga start from).`, // Penjelasan di UI
    }; // Akhir return objek
  } // Akhir pengecekan HAND
  if (bouquetType === "STANDING") { // Jika bertipe Buket Berdiri (Standing Bouquet)
    return { // Kembalikan aturan kuantitas Standing Bouquet
      label: "Quantity (isi cookies)", // Label input
      min: 1, // Batas min unit
      helperText: `Standing bouquet: isi cookies ${getBouquetQtyRangeLabel("STANDING")}. Qty 1-${BOUQUET_STANDING_MIN_QTY - 1} dibaca sebagai jumlah unit bouquet (harga start from).`, // Penjelasan di UI
    }; // Akhir return objek
  } // Akhir pengecekan STANDING

  if (item.category === "Cupcakes") {
    // Aturan kuantitas cupcake satuan kini murni ditangani oleh database (dbMinOrder).
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

  // Aturan kuantitas Custom Cookies kini murni ditangani oleh database (dbMinOrder).

  if (item.category === "Cake") {
    if (isTwoTierCakeItem(item)) {
      return {
        label: "Quantity (set two-tier)",
        min: 1,
        helperText:
          "1 qty = 1 set two-tier (Top + Bottom, setara 2 cake) tapi tetap 1 item order.",
      };
    }

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

export function getBouquetLineTotal(
  catalog: PricelistCategory[],
  item: BookingItemInput,
): number | null {
  const bouquetType = detectBouquetTypeFromItem(item);
  if (!bouquetType) return null;

  const quantity = Number(item.quantity) || 0;
  const overriddenPrice = normalizeBouquetPriceOverrideValue(
    item.bouquetPriceOverride,
  );
  const cookiePrice = normalizeBouquetCookiePriceValue(item.cookiePrice);
  const bouquetCost = getBouquetCostByType(bouquetType);
  const startFromPrice = getUnitPriceFromCatalog(catalog, {
    category: item.category,
    subcategory: item.subcategory,
    productName: item.productName,
    size: item.size,
  });

  if (quantity <= 0) return null;

  if (overriddenPrice !== undefined) {
    // For normal bouquet flow qty is cookie-fill count (single bouquet).
    if (isValidBouquetQuantity(quantity, bouquetType)) {
      return overriddenPrice;
    }

    // Keep fallback behavior when qty is treated as bouquet units.
    return overriddenPrice * quantity;
  }

  if (
    cookiePrice !== undefined &&
    isValidBouquetQuantity(quantity, bouquetType)
  ) {
    return Math.round(cookiePrice * quantity + bouquetCost);
  }

  if (startFromPrice <= 0) return null;

  // Qty in bouquet range means cookie-fill count for one bouquet unit.
  if (isValidBouquetQuantity(quantity, bouquetType)) {
    return Math.round(startFromPrice);
  }

  // Outside cookie-fill range, qty is treated as bouquet unit count.
  return Math.round(startFromPrice * quantity);
}

export function normalizeVariantLabel(value: string): string {
  return value.toLowerCase();
}

export function isMediumVariantLabel(value: string): boolean {
  const normalized = normalizeVariantLabel(value);
  return normalized.includes("medium") || normalized.includes("mid");
}

export function isLargeVariantLabel(value: string): boolean {
  const normalized = normalizeVariantLabel(value);
  return normalized.includes("large") || normalized.includes("xl");
}

export function resolveBouquetVariantForPaxel(
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

export function getItemBasePrice(
  catalog: PricelistCategory[],
  item: BookingItemInput,
  options?: {
    cookieAdditionalDesignUnitPrice?: number;
  },
): number {
  const parsedSubtotal = getParsedSubtotalOverride(item);
  if (parsedSubtotal !== null) {
    if (isCustomCookieItem(item)) {
      const additionalDesignCount =
        getCookieAdditionalDesignCountFromItem(item);
      const cookieAdditionalDesignUnitPrice =
        options?.cookieAdditionalDesignUnitPrice ??
        COOKIE_ADDITIONAL_DESIGN_PRICE;
      return (
        parsedSubtotal + additionalDesignCount * cookieAdditionalDesignUnitPrice
      );
    }

    return parsedSubtotal;
  }

  const bouquetLineTotal = getBouquetLineTotal(catalog, item);
  if (item.category === "Buket" && bouquetLineTotal !== null) {
    return bouquetLineTotal;
  }

  if (isCustomCookieSharingBoxItem(item)) {
    const overriddenUnit = normalizeSharingBoxPriceOverrideValue(
      item.sharingBoxPriceOverride,
    );
    if (overriddenUnit !== undefined) {
      const qty = Number(item.quantity) || 0;
      return overriddenUnit * qty;
    }
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

export function getItemProductionToken(item: BookingItemInput): number {
  return calculateOrderTokenFromItems([
    {
      category: item.category,
      subcategory: item.subcategory,
      productName: item.productName,
      size: item.size,
      quantity: Number(item.quantity) || 0,
      tokenDifficulty: item.tokenDifficulty,
      customTokenPerUnit: item.customTokenPerUnit,
      cookieDifficultyBreakdown: item.cookieDifficultyBreakdown,
      addOns: item.addOns,
      addOnQuantities: item.addOnQuantities,
    },
  ]);
}

export function normalizeTokenLookupKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function toDashboardProductNameFromItem(item: BookingItemInput): string {
  // Custom Cookies di booking form punya productName="Cookies" tapi di DB namanya "Custom Cookies".
  // Normalisasi di sini agar lookup key cocok dengan nama produk di database.
  let effectiveProductName = item.productName;
  if (
    isCustomCookieItem(item) &&
    effectiveProductName.toLowerCase().trim() === "cookies"
  ) {
    effectiveProductName = "Custom Cookies"; // Sesuaikan dengan nama di tabel Product
  }

  return buildDashboardProductName({
    productName: effectiveProductName,
    variantLabel: item.size,
    variantCount: 1,
  });
}

export function getItemProductionTokenSynced(
  item: BookingItemInput,
  tokenByProductName: Map<string, number>,
): number {
  const dashboardName = normalizeTokenLookupKey(
    toDashboardProductNameFromItem(item),
  );
  const tokenFromProduct = tokenByProductName.get(dashboardName);
  if (tokenFromProduct !== undefined) {
    const qty = Math.max(0, Number(item.quantity) || 0);
    return Math.max(0, tokenFromProduct) * qty;
  }
  return getItemProductionToken(item);
}

export function getTotalProductionTokenSynced(
  items: BookingItemInput[],
  tokenByProductName: Map<string, number>,
): number {
  return items.reduce(
    (sum, item) => sum + getItemProductionTokenSynced(item, tokenByProductName),
    0,
  );
}

export function getDraftItemPriceBreakdown(args: {
  catalog: PricelistCategory[];
  addOnCatalog: Record<string, CatalogAddOn[]>;
  item: BookingItemInput;
}): {
  categoryLabel: string;
  groupLabel: BookingItemGroupLabel;
  itemLabel: string;
  quantity: number;
  baseAmount: number;
  designAdjustmentAmount: number;
  addOnAmount: number;
  totalAmount: number;
  addOnDetails: string[];
} {
  const { catalog, addOnCatalog, item } = args;
  const quantity = Number(item.quantity) || 0;
  const categoryLabel = item.category?.trim() || "Lainnya";
  const groupLabel = getBookingItemGroupLabel(item);
  const itemVariantLabel =
    isCustomCookieItem(item) &&
    parseCookieDifficultyRows(
      String(extractCookieDifficultyBreakdown(item) || ""),
    ).length > 0
      ? "Mixed by difficulty"
      : item.size;
  const itemLabel = [item.productName, itemVariantLabel]
    .filter((part) => (part || "").trim().length > 0)
    .join(" - ");

  if (quantity <= 0) {
    return {
      categoryLabel,
      groupLabel,
      itemLabel: itemLabel || item.category || "Item",
      quantity: 0,
      baseAmount: 0,
      designAdjustmentAmount: 0,
      addOnAmount: 0,
      totalAmount: 0,
      addOnDetails: [],
    };
  }

  const hasParsedRecapPrice = hasParsedPricingOverride(item);
  const normalizedAddOnQuantities = normalizeAddOnQuantities(
    item.addOnQuantities,
  );
  const normalizedAddOnPriceOverrides = normalizeAddOnPriceOverrides(
    item.addOnPriceOverrides,
  );
  const normalizedCustomAddOns = normalizeCustomAddOns(item.customAddOns);
  const categoryAddOns = getCategoryAddOnsFromCatalog(
    addOnCatalog,
    item.category,
  );
  const bouquetType = detectBouquetTypeFromItem(item);
  const isBouquetItem = item.category === "Buket" && bouquetType !== null;
  const actualSelectedAddOnAmount = isBouquetItem
    ? (() => {
        const flowerAddOnTotal = (item.addOns ?? [])
          .filter((addOnId) => isBouquetFlowerAddOnId(addOnId))
          .reduce((sum, addOnId) => {
            const addOn = categoryAddOns.find((entry) => entry.id === addOnId);
            if (!addOn) return sum;
            const overriddenPrice = normalizedAddOnPriceOverrides[addOnId];
            const unitPrice =
              overriddenPrice !== undefined
                ? overriddenPrice
                : (getBouquetFlowerAddOnUnitPrice({
                    addonId: addOnId,
                    bouquetType,
                  }) ?? addOn.price);
            return sum + unitPrice;
          }, 0);

        const nonFlowerAddOnTotal =
          calculatePerUnitAddOnPrice({
            category: item.category,
            bouquetType,
            selectedAddOnIds: (item.addOns ?? []).filter(
              (addOnId) => !isBouquetFlowerAddOnId(addOnId),
            ),
            addOnQuantities: normalizedAddOnQuantities,
            addOnPriceOverrides: normalizedAddOnPriceOverrides,
            addOnCatalogEntries: categoryAddOns,
            itemSelection: {
              category: item.category,
              subcategory: item.subcategory,
              productName: item.productName,
              size: item.size,
            },
          }) * quantity +
          calculateOrderLevelAddOnPrice({
            category: item.category,
            bouquetType,
            selectedAddOnIds: (item.addOns ?? []).filter(
              (addOnId) => !isBouquetFlowerAddOnId(addOnId),
            ),
            addOnQuantities: normalizedAddOnQuantities,
            addOnPriceOverrides: normalizedAddOnPriceOverrides,
            addOnCatalogEntries: categoryAddOns,
            itemSelection: {
              category: item.category,
              subcategory: item.subcategory,
              productName: item.productName,
              size: item.size,
            },
          });

        return flowerAddOnTotal + nonFlowerAddOnTotal;
      })()
    : calculatePerUnitAddOnPrice({
        category: item.category,
        bouquetType,
        selectedAddOnIds: item.addOns ?? [],
        addOnQuantities: normalizedAddOnQuantities,
        addOnPriceOverrides: normalizedAddOnPriceOverrides,
        addOnCatalogEntries: categoryAddOns,
        itemSelection: {
          category: item.category,
          subcategory: item.subcategory,
          productName: item.productName,
          size: item.size,
        },
      }) * quantity +
      calculateOrderLevelAddOnPrice({
        category: item.category,
        bouquetType,
        selectedAddOnIds: item.addOns ?? [],
        addOnQuantities: normalizedAddOnQuantities,
        addOnPriceOverrides: normalizedAddOnPriceOverrides,
        addOnCatalogEntries: categoryAddOns,
        itemSelection: {
          category: item.category,
          subcategory: item.subcategory,
          productName: item.productName,
          size: item.size,
        },
      });
  const catalogSelectedAddOnAmount = isBouquetItem
    ? (() => {
        const flowerAddOnTotal = (item.addOns ?? [])
          .filter((addOnId) => isBouquetFlowerAddOnId(addOnId))
          .reduce((sum, addOnId) => {
            const addOn = categoryAddOns.find((entry) => entry.id === addOnId);
            if (!addOn) return sum;
            const unitPrice =
              getBouquetFlowerAddOnUnitPrice({
                addonId: addOnId,
                bouquetType,
              }) ?? addOn.price;
            return sum + unitPrice;
          }, 0);

        const nonFlowerAddOnTotal =
          calculatePerUnitAddOnPrice({
            category: item.category,
            bouquetType,
            selectedAddOnIds: (item.addOns ?? []).filter(
              (addOnId) => !isBouquetFlowerAddOnId(addOnId),
            ),
            addOnQuantities: normalizedAddOnQuantities,
            addOnPriceOverrides: {},
            addOnCatalogEntries: categoryAddOns,
            itemSelection: {
              category: item.category,
              subcategory: item.subcategory,
              productName: item.productName,
              size: item.size,
            },
          }) * quantity +
          calculateOrderLevelAddOnPrice({
            category: item.category,
            bouquetType,
            selectedAddOnIds: (item.addOns ?? []).filter(
              (addOnId) => !isBouquetFlowerAddOnId(addOnId),
            ),
            addOnQuantities: normalizedAddOnQuantities,
            addOnPriceOverrides: {},
            addOnCatalogEntries: categoryAddOns,
            itemSelection: {
              category: item.category,
              subcategory: item.subcategory,
              productName: item.productName,
              size: item.size,
            },
          });

        return flowerAddOnTotal + nonFlowerAddOnTotal;
      })()
    : calculatePerUnitAddOnPrice({
        category: item.category,
        bouquetType,
        selectedAddOnIds: item.addOns ?? [],
        addOnQuantities: normalizedAddOnQuantities,
        addOnPriceOverrides: {},
        addOnCatalogEntries: categoryAddOns,
        itemSelection: {
          category: item.category,
          subcategory: item.subcategory,
          productName: item.productName,
          size: item.size,
        },
      }) * quantity +
      calculateOrderLevelAddOnPrice({
        category: item.category,
        bouquetType,
        selectedAddOnIds: item.addOns ?? [],
        addOnQuantities: normalizedAddOnQuantities,
        addOnPriceOverrides: {},
        addOnCatalogEntries: categoryAddOns,
        itemSelection: {
          category: item.category,
          subcategory: item.subcategory,
          productName: item.productName,
          size: item.size,
        },
      });
  const customAddOnAmount = getCustomAddOnTotal(
    normalizedCustomAddOns,
    quantity,
  );
  const actualAddOnFromSelection =
    actualSelectedAddOnAmount + customAddOnAmount;
  const catalogAddOnAmount =
    catalogSelectedAddOnAmount + customAddOnAmount;

  const isCustomCookiesItem = isCustomCookieItem(item);
  const cookieDifficultyBreakdown = extractCookieDifficultyBreakdown(item);
  const cookieDifficultyRows = parseCookieDifficultyRows(
    String(cookieDifficultyBreakdown || ""),
  );
  const cookieBreakdownSubtotal =
    isCustomCookiesItem && cookieDifficultyRows.length > 0
      ? cookieDifficultyRows.reduce((sum, row) => {
          const rowDifficulty = getTokenDifficultyOption(row.difficulty);
          return sum + Math.max(0, row.quantity) * rowDifficulty.cookiePrice;
        }, 0)
      : 0;

  const customCookieAdditionalDesignCount = isCustomCookiesItem
    ? getCookieAdditionalDesignCountFromItem(item)
    : 0;
  const customCookieAdditionalDesignUnitPrice = isCustomCookiesItem
    ? getCookieAdditionalDesignUnitPrice({ addOnCatalog, item })
    : COOKIE_ADDITIONAL_DESIGN_PRICE;
  const customCookieAdditionalDesignCharge =
    customCookieAdditionalDesignCount * customCookieAdditionalDesignUnitPrice;
  const addOnDetails: string[] = [];
  const selectedAddOnIds = Array.isArray(item.addOns) ? item.addOns : [];
  const hasOnlyOrderLevelAddOns =
    selectedAddOnIds.length > 0 &&
    selectedAddOnIds.every((addOnId) => isOrderLevelAddOnId(addOnId));

  selectedAddOnIds.forEach((addOnId: string) => {
    const addOn = categoryAddOns.find((entry) => entry.id === addOnId);
    if (!addOn) return;

    const quantityMultiplier = getAddOnUnitMultiplier({
      category: item.category,
      addonId: addOnId,
      addOnQuantities: normalizedAddOnQuantities,
    });
    const qtyText = quantityMultiplier > 1 ? ` x${quantityMultiplier}` : "";
    addOnDetails.push(`${addOn.label}${qtyText}`);
  });

  normalizedCustomAddOns.forEach((entry) => {
    if (!entry.label.trim()) return;
    addOnDetails.push(`Custom: ${entry.label}`);
  });

  if (customCookieAdditionalDesignCount > 0) {
    addOnDetails.push(
      `Surcharge design (${customCookieAdditionalDesignCount} x ${formatCurrency(customCookieAdditionalDesignUnitPrice)})`,
    );
  }

  const baseBeforeSplit =
    !hasParsedRecapPrice && cookieBreakdownSubtotal > 0
      ? cookieBreakdownSubtotal
      : getItemBasePrice(catalog, item, {
          cookieAdditionalDesignUnitPrice:
            customCookieAdditionalDesignUnitPrice,
        });
  const catalogBaseAmount = Math.max(
    0,
    Math.round(
      isBouquetItem
        ? (() => {
            const catalogUnitPrice = getUnitPriceFromCatalog(catalog, {
              category: item.category,
              subcategory: item.subcategory,
              productName: item.productName,
              size: item.size,
            });
            if (catalogUnitPrice <= 0) return 0;
            if (isValidBouquetQuantity(quantity, bouquetType)) {
              return catalogUnitPrice;
            }
            return catalogUnitPrice * quantity;
          })()
        : getUnitPriceFromCatalog(catalog, {
            category: item.category,
            subcategory: item.subcategory,
            productName: item.productName,
            size: item.size,
          }) * quantity,
    ),
  );
  const recapTotalOverride =
    hasParsedRecapPrice && isCustomCookiesItem && cookieBreakdownSubtotal > 0
      ? Math.max(
          0,
          Math.round(
            cookieBreakdownSubtotal + customCookieAdditionalDesignCharge,
          ),
        )
      : null;
  const totalAmount = hasParsedRecapPrice
    ? recapTotalOverride ?? Math.max(0, Math.round(baseBeforeSplit))
    : Math.max(
        0,
        Math.round(
          baseBeforeSplit +
            actualAddOnFromSelection +
            customCookieAdditionalDesignCharge,
        ),
      );
  const baseAmount = catalogBaseAmount;
  const addOnAmount =
    hasParsedRecapPrice && hasOnlyOrderLevelAddOns
      ? Math.max(0, totalAmount - baseAmount)
      : Math.max(0, Math.round(catalogAddOnAmount));
  const designAdjustmentAmount = Math.round(
    totalAmount - baseAmount - addOnAmount,
  );

  return {
    categoryLabel,
    groupLabel,
    itemLabel: itemLabel || item.category || "Item",
    quantity,
    baseAmount,
    designAdjustmentAmount,
    addOnAmount,
    totalAmount,
    addOnDetails,
  };
}

export function toBookingDatePart(deliveryDate: string): string {
  const normalizedDate = normalizeDateInput(deliveryDate);
  if (!normalizedDate) return "000000";

  const isoMatch = normalizedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!isoMatch) return "000000";

  const yearShort = isoMatch[1].slice(-2);
  return `${isoMatch[3]}${isoMatch[2]}${yearShort}`;
}

export function extractSequenceForDate(code: string, datePart: string): number {
  const normalized = code.replace(/\s+/g, "").toUpperCase();
  if (!normalized || !datePart || datePart === "000000") return 0;
  const pattern = new RegExp(`^[A-Z]{2}\\d{3}-${datePart}-(\\d{3})$`);
  const match = normalized.match(pattern);
  if (!match?.[1]) return 0;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getDailyBookingSequence(
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

export function generateBookingCode(
  customerName: string,
  customerPhone: string,
  deliveryDate: string,
  sequence: number,
): string {
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

export function formatSubmitTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

export function normalizeDuplicateTemplateText(value?: string): string {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .trim();
}

export function normalizeTemplateForSimilarity(value: string): string {
  return normalizeDuplicateTemplateText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildCharacterNgrams(value: string, size = 4): Set<string> {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return new Set();
  if (normalized.length <= size) return new Set([normalized]);

  const ngrams = new Set<string>();
  for (let i = 0; i <= normalized.length - size; i += 1) {
    ngrams.add(normalized.slice(i, i + size));
  }
  return ngrams;
}

export function calculateDiceCoefficient(
  left: Set<string>,
  right: Set<string>,
): number {
  if (!left.size || !right.size) return 0;

  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }

  return (2 * intersection) / (left.size + right.size);
}

export function calculateTokenJaccard(
  leftSource: string,
  rightSource: string,
): number {
  const left = new Set(
    leftSource.split(" ").filter((token) => token.length > 0),
  );
  const right = new Set(
    rightSource.split(" ").filter((token) => token.length > 0),
  );
  if (!left.size || !right.size) return 0;

  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  return union > 0 ? intersection / union : 0;
}

export function calculateTemplateSimilarity(
  leftSource: string,
  rightSource: string,
): {
  score: number;
  charSimilarity: number;
  tokenSimilarity: number;
} {
  if (!leftSource || !rightSource) {
    return {
      score: 0,
      charSimilarity: 0,
      tokenSimilarity: 0,
    };
  }
  if (leftSource === rightSource) {
    return {
      score: 1,
      charSimilarity: 1,
      tokenSimilarity: 1,
    };
  }

  const charSimilarity = calculateDiceCoefficient(
    buildCharacterNgrams(leftSource),
    buildCharacterNgrams(rightSource),
  );
  const tokenSimilarity = calculateTokenJaccard(leftSource, rightSource);

  return {
    score: charSimilarity * 0.75 + tokenSimilarity * 0.25,
    charSimilarity,
    tokenSimilarity,
  };
}

export const DUPLICATE_TEMPLATE_SIMILARITY_THRESHOLD = 0.94;
export const DUPLICATE_TEMPLATE_MIN_SIMILARITY_CHARS = 48;
export const DUPLICATE_TEMPLATE_MIN_CHAR_SIMILARITY = 0.92;
export const DUPLICATE_TEMPLATE_MIN_TOKEN_SIMILARITY = 0.75;

export type DuplicateTemplateMatch = {
  order: BakeryOrder;
  similarityScore: number;
  matchType: "exact" | "similar";
};

export function findOrdersWithDuplicateParsedTemplate(
  orders: BakeryOrder[],
  normalizedTemplate: string,
): DuplicateTemplateMatch[] {
  if (!normalizedTemplate) return [];

  const similarityTemplate = normalizeTemplateForSimilarity(normalizedTemplate);

  const matches = orders
    .map<DuplicateTemplateMatch | null>((order) => {
      const existingTemplate = normalizeDuplicateTemplateText(
        order.whatsAppParsedData?.rawText,
      );
      if (!existingTemplate) return null;

      if (existingTemplate === normalizedTemplate) {
        return { order, similarityScore: 1, matchType: "exact" };
      }

      const existingSimilarityTemplate =
        normalizeTemplateForSimilarity(existingTemplate);
      if (
        similarityTemplate.length < DUPLICATE_TEMPLATE_MIN_SIMILARITY_CHARS ||
        existingSimilarityTemplate.length <
          DUPLICATE_TEMPLATE_MIN_SIMILARITY_CHARS
      ) {
        return null;
      }

      const similarityMetrics = calculateTemplateSimilarity(
        similarityTemplate,
        existingSimilarityTemplate,
      );

      if (
        similarityMetrics.score < DUPLICATE_TEMPLATE_SIMILARITY_THRESHOLD ||
        similarityMetrics.charSimilarity <
          DUPLICATE_TEMPLATE_MIN_CHAR_SIMILARITY ||
        similarityMetrics.tokenSimilarity <
          DUPLICATE_TEMPLATE_MIN_TOKEN_SIMILARITY
      ) {
        return null;
      }

      return {
        order,
        similarityScore: similarityMetrics.score,
        matchType: "similar",
      };
    })
    .filter((entry): entry is DuplicateTemplateMatch => Boolean(entry));

  return matches.sort(
    (left, right) => right.similarityScore - left.similarityScore,
  );
}

export function formatDuplicateWarningDate(value: string): string {
  const normalized = normalizeDateInput(value);
  if (!normalized) return value;
  const parsed = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return normalized;
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

export function formatTemplateSimilarityLabel(
  score: number,
  matchType: "exact" | "similar",
): string {
  if (matchType === "exact") return "Sama persis (100%)";
  return `Sangat mirip (${Math.round(score * 100)}%)`;
}
