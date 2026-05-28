"use client";

import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import NextLink from "next/link";
import { startOfDay } from "date-fns";
import { usePathname, useRouter } from "next/navigation";
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
  type DeliveryAddress,
  type NewOrderInput,
  type OrderItem,
} from "@/components/bakery/store";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronRight,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  buildWhatsAppTemplate,
  type BookingFormAutoFill,
  type ParsedWhatsAppDetectedItem,
  type ParsedWhatsAppOrder,
  type ParsedWhatsAppReferenceImage,
  type WhatsAppOrderType,
  type WhatsAppSourceType,
  WHATSAPP_ORDER_LABELS,
} from "@/lib/bookings/whatsapp-parser";
import { prepareReferenceImagesForUpload } from "@/lib/bookings/reference-image-upload";
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
import { BAKERY_BLOCKED_DATES } from "@/lib/bookings/config";
import { calculateOrderTokenFromItems } from "@/lib/bookings/order-token-calculator";
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
import {
  resolveDeliveryMethodLabel,
  resolveOrderDeliveryMethod,
} from "@/lib/bookings/delivery-method";
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

const ADDRESS_LOCATION_KEYWORD_PATTERN =
  /\b(jl|jalan|gg|gang|blok|block|no|nomor|rt|rw|perum|perumahan|komplek|kompleks|cluster|apartemen|apartment|tower|unit|ruko|rumah|gedung|kav|kavling|kel|kelurahan|kec|kecamatan|kota|kab|kabupaten)\b/i;
const ADDRESS_NUMBER_PATTERN = /\b\d+[a-zA-Z]?\b/;
const ADDRESS_ROMAN_SECTION_PATTERN =
  /\b(?:jl|jalan|gg|gang|blok|block|tower|unit|kav|kavling)\.?\s+[^,\n]{0,40}\b[ivxlcdm]{2,6}\b/i;
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

function toTitleCaseWords(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function inferAreaFromAddress(value: string): string {
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

function areaLooksValid(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 3 && /[a-z]/i.test(trimmed);
}

function addressLooksStructured(value: string): boolean {
  const normalized = normalizeAddressText(value);
  if (!normalized) return false;

  const hasLocationKeyword = ADDRESS_LOCATION_KEYWORD_PATTERN.test(normalized);
  const hasNumber = ADDRESS_NUMBER_PATTERN.test(value);
  const hasRomanSection = ADDRESS_ROMAN_SECTION_PATTERN.test(value);
  return hasLocationKeyword && (hasNumber || hasRomanSection);
}

const defaultItemSelection = getDefaultCatalogSelection();

type BookingDraftSnapshot = {
  composerStep: "input" | "preview";
  quickPaste: string;
  selectedOrderType: ParserOrderType;
  parsedPreview: ParsedWhatsAppOrder | null;
  persistedReferenceImages: ParsedWhatsAppReferenceImage[];
  productionPreviewImageUrl: string;
  draftImported: boolean;
  referenceImageLabelsInput: string;
  referenceFilesChangedSinceParse: boolean;
  shippingQuotes: ShippingQuote[];
  selectedShippingQuoteId: string;
  selectedShippingQuoteServiceKey?: string;
  shippingDistanceKm: number | null;
  shippingDistanceSource?: ShippingQuoteResponse["distanceSource"];
  shippingWarning: string;
  formValues: BookingFormValues;
};

type ReferenceSyncStatus = "idle" | "syncing" | "failed";
type PendingReferenceSyncAction = "open-preview" | "submit-booking";

const BOOKING_DRAFT_STORAGE_KEY = "cuanify.bakery.booking-draft.v1";

type BookingFormMode = "create" | "edit";

type BookingFormProps = {
  mode?: BookingFormMode;
  orderId?: string;
  initialOrder?: BakeryOrder | null;
};

function parseWholesaleDiscountPercent(notes?: string | null): number {
  const match = String(notes || "").match(
    /wholesale\s*discount\s*:\s*(\d+(?:[.,]\d+)?)\s*%/i,
  );
  if (!match?.[1]) return 0;
  const parsed = Number(match[1].replace(",", "."));
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Number(parsed.toFixed(2))));
}

function extractCustomBookingNotes(notes?: string | null): string {
  return String(notes || "")
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter(
      (line) =>
        !/^delivery\s*method\s*:/i.test(line) &&
        !/^service\s*charge\s*:/i.test(line) &&
        !/^insurance\s*fee\s*:/i.test(line) &&
        !/^wholesale\s*discount\s*:/i.test(line),
    )
    .join("\n");
}

function extractMoneyValueFromText(value: string): number | undefined {
  const digits = String(value || "").replace(/[^\d-]/g, "");
  if (!digits || digits === "-") return undefined;
  const parsed = Number(digits);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.round(parsed);
}

function extractParsedUnitPriceFromItemNotes(notes?: string | null): number | undefined {
  const match = String(notes || "").match(
    /harga\s+recap\s*:\s*(rp\.?\s*)?([\d.,]+)/i,
  );
  return extractMoneyValueFromText(match?.[2] || "");
}

function extractParsedSubtotalFromItemNotes(notes?: string | null): number | undefined {
  const match = String(notes || "").match(
    /subtotal\s+recap\s*:\s*(rp\.?\s*)?([\d.,]+)/i,
  );
  return extractMoneyValueFromText(match?.[2] || "");
}

function buildBookingFormValuesFromOrder(
  order: BakeryOrder,
  productCatalog: ReturnType<typeof useCatalogAdminState>["productCatalog"],
): BookingFormInput {
  const deliveryMethod =
    resolveOrderDeliveryMethod({
      deliveryMethod: order.deliveryMethod,
      parsedDeliveryMethod: order.whatsAppParsedData?.common?.deliveryMethod,
      notes: order.notes,
      shippingQuote: order.shippingQuote,
    }) ?? "PICKUP";

  const normalizedItems: BookingFormInput["items"] =
    order.items.length > 0
      ? order.items.map((rawItem) => {
          const item = rawItem as OrderItem & Record<string, unknown>;
          const normalized = ensureSelectionFromCatalog(productCatalog, {
            category: item.category,
            subcategory: item.subcategory,
            productName: item.productName,
            size: item.size,
          });
          const parsedQuantity = Number(item.quantity);
          const parsedBouquetPriceOverride =
            normalized.category === "Buket"
              ? normalizeBouquetPriceOverrideValue(item.bouquetPriceOverride)
              : undefined;
          const parsedSharingBoxPriceOverride =
            normalized.category === "Cookies" &&
            isCustomCookieSharingBoxItem({
              category: normalized.category,
              subcategory: normalized.subcategory,
              productName: normalized.productName,
            })
              ? normalizeSharingBoxPriceOverrideValue(
                  item.sharingBoxPriceOverride,
                )
              : undefined;
          const parsedCookiePrice =
            normalized.category === "Buket"
              ? normalizeBouquetCookiePriceValue(item.cookiePrice)
              : undefined;
          const parsedTokenDifficulty =
            normalized.category === "Cookies"
              ? normalizeTokenDifficultyValue(item.tokenDifficulty ?? "SIMPLE")
              : undefined;
          const rawItemNotes = String(item.notes ?? "");
          const parsedUnitPriceFromNotes =
            extractParsedUnitPriceFromItemNotes(rawItemNotes);
          const parsedSubtotalFromNotes =
            extractParsedSubtotalFromItemNotes(rawItemNotes);
          const parsedUnitPriceFromItem =
            Number.isFinite(Number(item.parsedUnitPrice)) &&
            Number(item.parsedUnitPrice) > 0
              ? Math.round(Number(item.parsedUnitPrice))
              : undefined;
          const parsedSubtotalFromItem =
            Number.isFinite(Number(item.parsedSubtotal)) &&
            Number(item.parsedSubtotal) > 0
              ? Math.round(Number(item.parsedSubtotal))
              : undefined;
          const hasRecapPricing =
            item.pricingSource === "RECAP" ||
            parsedUnitPriceFromItem !== undefined ||
            parsedSubtotalFromItem !== undefined ||
            parsedUnitPriceFromNotes !== undefined ||
            parsedSubtotalFromNotes !== undefined;
          const parserProvidedCookieBreakdown =
            normalized.category === "Cookies"
              ? String(item.cookieDifficultyBreakdown ?? "").trim()
              : "";
          const parsedCookieBreakdownRows =
            normalized.category === "Cookies"
              ? parseCookieDifficultyRows(
                  parserProvidedCookieBreakdown || rawItemNotes,
                )
              : [];
          const parsedCookieBreakdown =
            parsedCookieBreakdownRows.length > 0
              ? formatCookieDifficultyRows(parsedCookieBreakdownRows)
              : "";
          const normalizedAddOnIds = Array.isArray(item.addOns)
            ? item.addOns
            : [];
          const normalizedAddOnQuantities = normalizeAddOnQuantities(
            item.addOnQuantities,
          );
          const inferredBouquetFlowerCount =
            normalized.category === "Buket"
              ? inferBouquetFlowerCountFromAddOns({
                  addOns: normalizedAddOnIds,
                  addOnQuantities: normalizedAddOnQuantities,
                })
              : "";
          const cleanedItemNotes =
            normalized.category === "Cookies"
              ? removeCookieBreakdownFromNotes(rawItemNotes)
              : normalized.category === "Buket"
                ? removeBouquetStructuredFieldsFromNotes(rawItemNotes)
                : rawItemNotes;
          const normalizedQuantity = Number.isFinite(parsedQuantity)
            ? Math.max(1, Math.round(parsedQuantity))
            : 1;
          const inferredBouquetCookieFillQuantity =
            inferBouquetCookieFillQuantityFromText({
              category: normalized.category,
              subcategory: normalized.subcategory,
              productName: normalized.productName,
              size: normalized.size,
              notes: rawItemNotes,
            });
          const normalizedQuantityFinal =
            normalized.category === "Buket" &&
            normalizedQuantity <= 1 &&
            inferredBouquetCookieFillQuantity !== null
              ? inferredBouquetCookieFillQuantity
              : normalizedQuantity;
          const normalizedSize = resolveIndividualCupcakeSizeByQuantity({
            catalog: productCatalog,
            selection: normalized,
            quantity: normalizedQuantityFinal,
          });

          return {
            category: normalized.category,
            subcategory: normalized.subcategory,
            productName: normalized.productName,
            size: normalizedSize,
            quantity: normalizedQuantityFinal,
            tokenDifficulty: parsedTokenDifficulty,
            customTokenPerUnit:
              Number.isFinite(Number(item.customTokenPerUnit)) &&
              Number(item.customTokenPerUnit) > 0
                ? Math.round(Number(item.customTokenPerUnit))
                : undefined,
            bouquetPriceOverride: parsedBouquetPriceOverride,
            sharingBoxPriceOverride: parsedSharingBoxPriceOverride,
            cookiePrice: parsedCookiePrice,
            designCount: normalizeCookieDesignCount(item.designCount),
            additionalDesignCount: normalizeCookieDesignCount(
              item.additionalDesignCount,
            ),
            addOns: normalizedAddOnIds,
            addOnQuantities: normalizedAddOnQuantities,
            addOnPriceOverrides: normalizeAddOnPriceOverrides(
              item.addOnPriceOverrides,
            ),
            customAddOns: normalizeCustomAddOns(item.customAddOns),
            darkColorButtercreamColors:
              normalized.category === "Cupcakes" &&
              normalizedAddOnIds.includes(DARK_COLOR_BUTTERCREAM_ADDON_ID)
                ? (() => {
                    const parsedColors = normalizeDarkButtercreamColors(
                      item.darkColorButtercreamColors ?? [],
                    );
                    if (parsedColors.length > 0) {
                      return parsedColors;
                    }

                    const legacyColor = normalizeDarkButtercreamColors(
                      item.darkColorButtercreamColor ?? "",
                    );
                    return legacyColor;
                  })()
                : [],
            parsedUnitPrice:
              hasRecapPricing
                ? parsedUnitPriceFromItem ?? parsedUnitPriceFromNotes
                : undefined,
            parsedSubtotal:
              hasRecapPricing
                ? parsedSubtotalFromItem ?? parsedSubtotalFromNotes
                : undefined,
            pricingSource: hasRecapPricing ? "RECAP" : undefined,
            cookieDifficultyBreakdown: parsedCookieBreakdown || undefined,
            greetingCard:
              String(item.greetingCard ?? "").trim().slice(0, 400) ||
              extractBouquetGreetingCardFromNotes(rawItemNotes) ||
              "",
            bouquetPaperColor:
              String(item.bouquetPaperColor ?? "").trim().slice(0, 200) ||
              extractBouquetPaperColorFromNotes(rawItemNotes) ||
              "",
            ribbon:
              String(item.ribbon ?? "").trim().slice(0, 200) ||
              extractBouquetRibbonFromNotes(rawItemNotes) ||
              "",
            flowerCount:
              String(item.flowerCount ?? "").trim().slice(0, 200) ||
              extractBouquetFlowerCountFromNotes(rawItemNotes) ||
              inferredBouquetFlowerCount ||
              "",
            flowerColor:
              String(item.flowerColor ?? "").trim().slice(0, 200) ||
              extractBouquetFlowerColorFromNotes(rawItemNotes) ||
              "",
            ribbonColor:
              String(item.ribbonColor ?? "").trim().slice(0, 200) ||
              extractBouquetRibbonColorFromNotes(rawItemNotes) ||
              "",
            notes: cleanedItemNotes,
          };
        })
      : [
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
                bouquetPriceOverride: undefined,
                sharingBoxPriceOverride: undefined,
                cookiePrice: undefined,
                addOns: [],
                addOnQuantities: {},
                addOnPriceOverrides: {},
                customAddOns: [],
                greetingCard: "",
                bouquetPaperColor: "",
                ribbon: "",
                flowerCount: "",
                flowerColor: "",
                ribbonColor: "",
                notes: "",
              }) ?? 1,
            tokenDifficulty: "SIMPLE",
            customTokenPerUnit: undefined,
            bouquetPriceOverride: undefined,
            sharingBoxPriceOverride: undefined,
            cookiePrice: undefined,
            addOns: [],
            addOnQuantities: {},
            addOnPriceOverrides: {},
            customAddOns: [],
            darkColorButtercreamColors: [],
            parsedUnitPrice: undefined,
            parsedSubtotal: undefined,
            pricingSource: undefined,
            greetingCard: "",
            bouquetPaperColor: "",
            ribbon: "",
            flowerCount: "",
            flowerColor: "",
            ribbonColor: "",
            notes: "",
          },
        ];

  const normalizedAddresses: BookingFormInput["deliveryAddresses"] =
    order.deliveryAddresses.length > 0
      ? order.deliveryAddresses.map((address, index) => {
          const rawAddress = address as DeliveryAddress & Record<string, unknown>;
          const addressLine = String(address.addressLine || "").trim();
          const rawArea = String(address.area || "").trim();
          const inferredPostalCode = extractPostalCodeFromAddress(addressLine);
          const providedPostalCode = sanitizePostalCodeInput(
            String(rawAddress.postalCode ?? ""),
          );

          return {
            label: String(address.label || `Address ${index + 1}`),
            area: rawArea || inferAreaFromAddress(addressLine),
            postalCode: providedPostalCode || inferredPostalCode,
            addressLine,
          };
        })
      : [
          {
            label: "Primary",
            area: inferAreaFromAddress(order.customerAddress || ""),
            postalCode: extractPostalCodeFromAddress(order.customerAddress || ""),
            addressLine: order.customerAddress || "",
          },
        ];

  return {
    customerName: order.customerName || "",
    phoneNumber: order.customerPhone || "",
    deliveryDate: order.deliveryDate || "",
    deliverySlot: order.deliverySlot || "10:00",
    deliveryMethod,
    sales_channel: order.sales_channel || "direct",
    customNotes: extractCustomBookingNotes(order.notes),
    paymentStatus: order.paymentStatus === "Paid" ? "Paid" : "DP Paid",
    dpPaidAmount: Math.max(0, Number(order.dpPaidAmount || 0)),
    finalPaidAmount: Math.max(0, Number(order.finalPaidAmount || 0)),
    wholesaleDiscountPercent: ([0, 10, 15, 20] as const).includes(
      parseWholesaleDiscountPercent(order.notes) as 0 | 10 | 15 | 20,
    )
      ? (parseWholesaleDiscountPercent(order.notes) as 0 | 10 | 15 | 20)
      : 0,
    manualAdjustment: Math.round(Number(order.manualAdjustment || 0) || 0),
    items: normalizedItems,
    deliveryAddresses: normalizedAddresses,
  };
}

function saveBookingDraftSnapshot(snapshot: BookingDraftSnapshot): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(
    BOOKING_DRAFT_STORAGE_KEY,
    JSON.stringify(snapshot),
  );
}

function normalizePersistedReferenceImages(
  value: ParsedWhatsAppReferenceImage[] | undefined | null,
): ParsedWhatsAppReferenceImage[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry, index) => ({
      url: String(entry?.url || "").trim(),
      label: String(entry?.label || "").trim() || `Gambar ${index + 1}`,
      note: String(entry?.note || "").trim() || undefined,
      orderIndex:
        typeof entry?.orderIndex === "number" &&
        Number.isFinite(entry.orderIndex)
          ? entry.orderIndex
          : undefined,
    }))
    .filter((entry) => entry.url.length > 0);
}

function getEffectivePersistedReferenceImages(args: {
  parsedPreview?: ParsedWhatsAppOrder | null;
  persistedReferenceImages?: ParsedWhatsAppReferenceImage[] | null;
}): ParsedWhatsAppReferenceImage[] {
  const parsedReferenceImages = normalizePersistedReferenceImages(
    args.parsedPreview?.referenceImages,
  );
  if (parsedReferenceImages.length > 0) {
    return parsedReferenceImages;
  }

  return normalizePersistedReferenceImages(args.persistedReferenceImages);
}

function restoreParsedPreviewReferenceImages(args: {
  parsedPreview?: ParsedWhatsAppOrder | null;
  persistedReferenceImages?: ParsedWhatsAppReferenceImage[] | null;
}): ParsedWhatsAppOrder | null {
  if (!args.parsedPreview) return null;

  const referenceImages = getEffectivePersistedReferenceImages(args);
  if (referenceImages.length === 0) {
    return args.parsedPreview;
  }

  return {
    ...args.parsedPreview,
    referenceImages,
  };
}

function loadBookingDraftSnapshot(): BookingDraftSnapshot | null {
  if (typeof window === "undefined") return null;

  const rawValue = window.sessionStorage.getItem(BOOKING_DRAFT_STORAGE_KEY);
  if (!rawValue) return null;

  try {
    const snapshot = JSON.parse(rawValue) as BookingDraftSnapshot;
    const persistedReferenceImages = getEffectivePersistedReferenceImages({
      parsedPreview: snapshot.parsedPreview,
      persistedReferenceImages: snapshot.persistedReferenceImages,
    });

    return {
      ...snapshot,
      parsedPreview: restoreParsedPreviewReferenceImages({
        parsedPreview: snapshot.parsedPreview,
        persistedReferenceImages,
      }),
      persistedReferenceImages,
    };
  } catch {
    return null;
  }
}

function mergeRequestedImageLabels(
  existingLabels: string[] | undefined,
  requestedLabels: string[],
): string[] {
  return [
    ...(Array.isArray(existingLabels) ? existingLabels : []),
    ...requestedLabels,
  ].filter((value, index, array) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    return (
      array.findIndex((entry) => entry.trim().toLowerCase() === normalized) ===
      index
    );
  });
}

function buildReferenceInputSignature(args: {
  files: File[];
  requestedLabels: string[];
}): string {
  return JSON.stringify({
    files: args.files.map((file) => ({
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      type: file.type,
    })),
    requestedLabels: args.requestedLabels,
  });
}

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
  bouquetPriceOverride: z.number().min(0).optional(),
  sharingBoxPriceOverride: z.number().min(0).optional(),
  cookiePrice: z.number().min(0).optional(),
  designCount: z.number().int().min(1).max(100).optional(),
  additionalDesignCount: z.number().int().min(0).max(100).optional(),
  addOns: z.array(z.string()),
  addOnQuantities: z
    .record(z.string(), z.number().int().min(1).max(999))
    .optional(),
  addOnPriceOverrides: z
    .record(z.string(), z.number().min(0).max(10_000_000))
    .optional(),
  customAddOns: z
    .array(
      z.object({
        label: z.string().max(80).optional().or(z.literal("")),
        price: z.number().min(0).max(10_000_000).default(0),
      }),
    )
    .optional(),
  darkColorButtercreamColors: z.array(z.string()).optional(),
  parsedUnitPrice: z.number().min(0).optional(),
  parsedSubtotal: z.number().min(0).optional(),
  pricingSource: z.enum(["RECAP"]).optional(),
  cookieDifficultyBreakdown: z.string().max(400).optional().or(z.literal("")),
  greetingCard: z.string().max(400).optional().or(z.literal("")),
  bouquetPaperColor: z.string().max(200).optional().or(z.literal("")),
  ribbon: z.string().max(200).optional().or(z.literal("")),
  flowerCount: z.string().max(200).optional().or(z.literal("")),
  flowerColor: z.string().max(200).optional().or(z.literal("")),
  ribbonColor: z.string().max(200).optional().or(z.literal("")),
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
  addressLine: z.string().default(""),
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
    sales_channel: z.enum(["direct", "tokopedia", "shopee"], {
      error: "Sales channel wajib dipilih.",
    }),
    customNotes: z.string().max(1200).optional().or(z.literal("")),
    paymentStatus: z.enum(["DP Paid", "Paid"]),
    dpPaidAmount: z.number().default(0),
    finalPaidAmount: z.number().default(0),
    wholesaleDiscountPercent: z
      .union([z.literal(0), z.literal(10), z.literal(15), z.literal(20)])
      .default(0),
    manualAdjustment: z.number().default(0),
    items: z.array(itemSchema).min(1, "At least one item is required"),
    deliveryAddresses: z
      .array(addressSchema)
      .min(1, "At least one address is required"),
  })
  .superRefine((values, ctx) => {
    values.deliveryAddresses.forEach((address, index) => {
      const addressLine = (address.addressLine || "").trim();
      const postalCode = sanitizePostalCodeInput(address.postalCode || "");
      const embeddedPostalCode = extractPostalCodeFromAddress(addressLine);
      const requiresPrimaryAddress = values.deliveryMethod !== "PICKUP";
      const shouldValidateAddressDetails =
        index === 0 ? requiresPrimaryAddress : addressLine.length > 0;

      if (index === 0 && requiresPrimaryAddress && addressLine.length < 5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["deliveryAddresses", index, "addressLine"],
          message: "Alamat wajib diisi untuk metode pengiriman ini.",
        });
      }

      if (
        shouldValidateAddressDetails &&
        address.postalCode.trim().length > 0 &&
        postalCode.length !== 5
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["deliveryAddresses", index, "postalCode"],
          message: "Kode pos harus 5 digit.",
        });
      }

      if (
        shouldValidateAddressDetails &&
        (ADDRESS_CONTACT_LABEL_PATTERN.test(addressLine) ||
          ADDRESS_PHONE_PATTERN.test(addressLine))
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

        if (addressLine.length < 15) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["deliveryAddresses", index, "addressLine"],
            message:
              "Alamat utama terlalu singkat untuk shipping. Isi alamat lengkap.",
          });
        } else if (!addressLooksStructured(addressLine)) {
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
const CUPCAKE_INDIVIDUAL_MIN_QTY = 10;
const COOKIE_INCLUDED_DESIGN_LIMIT = 5;
const COOKIE_ADDITIONAL_DESIGN_PRICE = 10_000;
const COOKIE_ADDITIONAL_DESIGN_ADDON_IDS = [
  "cookie-additional-design",
  "cookie-design-surcharge",
  "cookie-design-extra",
] as const;
const DARK_COLOR_BUTTERCREAM_ADDON_ID = "dark-color-buttercream";
const DARK_BUTTERCREAM_COLOR_OPTIONS = [
  "Black",
  "Red",
  "Navy Blue",
  "Forest Green",
  "Electric Blue",
  "Fuschia Pink",
] as const;
const MAX_DARK_BUTTERCREAM_COLORS = 3;
const CUPCAKE_COOKIE_ADDON_IDS = [
  "cookie-simple",
  "cookie-normal",
  "cookie-hard",
  "cookie-advanced",
  "cookie-expert",
] as const;
const BOUQUET_EXTRA_3_FLOWER_ADDON_ID = "bouquet-extra-3-flower";
const BOUQUET_EXTRA_6_FLOWER_ADDON_ID = "bouquet-extra-6-flower";
const FRAGILE_ORDER_ALLOWED_METHODS: DeliveryMethod[] = [
  "PICKUP",
  "CUSTOMER_APP_COURIER",
  "ASSISTED_GOSEND",
  "ASSISTED_GRAB",
  "ASSISTED_GOCAR",
  "ASSISTED_PAXEL",
  "ASSISTED_SAME_DAY",
  "REGULAR_JNE_JNT",
];
const FRAGILE_ORDER_ALLOWED_METHODS_TEXT =
  "Pickup, Grab/GoCar (pesan customer), GoSend admin, Grab admin, GoCar admin, Paxel admin, Same Day admin, atau JNE/J&T reguler.";

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

function isCupcakeCookieAddOnId(addOnId: string): boolean {
  return CUPCAKE_COOKIE_ADDON_IDS.includes(
    addOnId as (typeof CUPCAKE_COOKIE_ADDON_IDS)[number],
  );
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

function normalizeBouquetCookiePriceValue(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;

  const rounded = Math.round(parsed);
  // Common shorthand from parsed text: 17 means 17k.
  if (rounded < 1000) return rounded * 1000;
  return rounded;
}

function normalizeBouquetPriceOverrideValue(
  value: unknown,
): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.round(parsed);
}

function normalizeSharingBoxPriceOverrideValue(
  value: unknown,
): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;

  return Math.round(parsed);
}

function normalizeCookieDesignCount(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.min(100, Math.round(parsed));
}

function getAdditionalCookieDesignCount(value: unknown): number {
  const designCount = normalizeCookieDesignCount(value) ?? 0;
  return Math.max(0, designCount - COOKIE_INCLUDED_DESIGN_LIMIT);
}

function getCookieAdditionalDesignCountFromItem(
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

type BookingItemGroupLabel = "CUSTOM" | "SEASONAL_EVENT";

function getBookingItemGroupLabel(item: {
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

function getShippingQuoteDisplayPrice(quote: ShippingQuote): number {
  return Math.max(0, quote.priceWithoutInsurance ?? quote.price ?? 0);
}

function getShippingQuoteServiceKey(
  quote: Pick<ShippingQuote, "provider" | "courierCode" | "courierServiceCode">,
): string {
  return `${quote.provider}:${quote.courierCode}:${quote.courierServiceCode}`;
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

interface DuplicateTemplateWarningState {
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

function extractCookieDifficultyBreakdown(
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

type CookieDifficultyRow = {
  difficulty: TokenDifficultyValue;
  quantity: number;
};

function parseCookieDifficultyRows(breakdown: string): CookieDifficultyRow[] {
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

function formatCookieDifficultyRows(rows: CookieDifficultyRow[]): string {
  return rows
    .filter((row) => row.quantity > 0)
    .map((row) => `${row.quantity} pcs ${row.difficulty}`)
    .join(", ");
}

function mergeCookieBreakdownIntoNotes(rows: CookieDifficultyRow[]): string {
  return formatCookieDifficultyRows(rows).slice(0, 400);
}

function removeCookieBreakdownFromNotes(notes: string): string {
  return String(notes || "")
    .split("|")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .filter((segment) => !/^breakdown\s*:/i.test(segment))
    .join(" | ")
    .slice(0, 400);
}

function extractBouquetGreetingCardFromNotes(notes: string): string {
  const source = String(notes || "");
  const matched = source.match(/(?:^|\||\n)\s*kartu\s*ucapan\s*:\s*([^|\n]+)/i);
  return (matched?.[1] || "").trim().slice(0, 400);
}

function extractBouquetPaperColorFromNotes(notes: string): string {
  const source = String(notes || "");
  const matched = source.match(
    /(?:^|\||\n)\s*warna\s*kertas\s*bouquet\s*:\s*([^|\n]+)/i,
  );
  return (matched?.[1] || "").trim().slice(0, 200);
}

function extractBouquetRibbonFromNotes(notes: string): string {
  const source = String(notes || "");
  const matched = source.match(/(?:^|\||\n)\s*ribbon\s*:\s*([^|\n]+)/i);
  return (matched?.[1] || "").trim().slice(0, 200);
}

function extractBouquetFlowerCountFromNotes(notes: string): string {
  const source = String(notes || "");
  const matched = source.match(/(?:^|\||\n)\s*jumlah\s*bunga\s*:\s*([^|\n]+)/i);
  return (matched?.[1] || "").trim().slice(0, 200);
}

function extractBouquetFlowerColorFromNotes(notes: string): string {
  const source = String(notes || "");
  const matched = source.match(/(?:^|\||\n)\s*warna\s*bunga\s*:\s*([^|\n]+)/i);
  return (matched?.[1] || "").trim().slice(0, 200);
}

function extractBouquetRibbonColorFromNotes(notes: string): string {
  const source = String(notes || "");
  const matched = source.match(/(?:^|\||\n)\s*warna\s*pita\s*:\s*([^|\n]+)/i);
  return (matched?.[1] || "").trim().slice(0, 200);
}

function removeBouquetStructuredFieldsFromNotes(notes: string): string {
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

function inferBouquetFlowerCountFromAddOns(args: {
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

function inferBouquetCookieFillQuantityFromText(args: {
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

type CookieCatalogMode = "CUSTOM" | "SEASONAL_EVENT";

function resolveCookieCatalogMode(selection: {
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

function getCookieSelectionByMode(args: {
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

function getCookieAdditionalDesignUnitPrice(args?: {
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

function normalizeAddOnPriceOverrides(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};

  const next: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) continue;
    next[key] = Math.round(parsed);
  }

  return next;
}

type CustomAddOnInput = {
  label: string;
  price: number;
};

function normalizeCustomAddOns(value: unknown): CustomAddOnInput[] {
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

function getCustomAddOnTotal(
  customAddOns: CustomAddOnInput[],
  quantity: number,
): number {
  const perUnit = customAddOns.reduce((sum, entry) => sum + entry.price, 0);
  return perUnit * Math.max(1, quantity || 0);
}

function supportsAddOnQuantity(category: string, addonId: string): boolean {
  if (addonId === DARK_COLOR_BUTTERCREAM_ADDON_ID) return false;
  if (isBouquetFlowerAddOnId(addonId)) return false;
  if (!category) return false;
  const flavorIds = new Set(getFlavorAddOnIdsByCategory(category));
  return !flavorIds.has(addonId);
}

function isTwoTierCakeItem(item: BookingItemInput): boolean {
  if (item.category !== "Cake") return false;
  const source =
    `${item.subcategory || ""} ${item.productName || ""}`.toLowerCase();
  return source.includes("two tier") || source.includes("two-tier");
}

function formatOneTierCakeVariantLabel(sizeLabel: string): string {
  const match = sizeLabel.match(/^D\s*(\d+)\s*[-x/]\s*T\s*(\d+)$/i);
  if (!match) return sizeLabel;

  const diameter = match[1];
  const height = match[2];
  return `Diameter ${diameter} cm x Tinggi ${height} cm`;
}

function formatTwoTierCakeVariantLabel(sizeLabel: string): string {
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

function getReadableVariantLabel(item: BookingItemInput): string {
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

function getTwoTierSummaryLabel(item: BookingItemInput): string {
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

function getAddOnUnitMultiplier(args: {
  category: string;
  addonId: string;
  addOnQuantities: Record<string, number>;
}): number {
  if (!supportsAddOnQuantity(args.category, args.addonId)) return 1;
  return Math.max(1, args.addOnQuantities[args.addonId] ?? 1);
}

function isBouquetFlowerAddOnId(addonId: string): boolean {
  return (
    addonId === BOUQUET_EXTRA_3_FLOWER_ADDON_ID ||
    addonId === BOUQUET_EXTRA_6_FLOWER_ADDON_ID
  );
}

function getBouquetFlowerAddOnUnitPrice(args: {
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

function normalizeBubblewrapSourceText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveBubblewrapUnitPrice(args: {
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

function isOrderLevelAddOnId(addonId: string): boolean {
  return addonId === "bubblewrap" || addonId === "custom-card";
}

function calculatePerUnitAddOnPrice(args: {
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

function calculateOrderLevelAddOnPrice(args: {
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

function resolveIndividualCupcakeSizeByQuantity(args: {
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

function isCustomCookieItem(
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

function isCustomCookieSharingBoxItem(
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

function getItemQuantityRule( // Definisikan fungsi lokal untuk mengambil batas kuantitas minimum per item
  item: BookingItemInput, // Parameter pertama: objek data input item
  minimumOrderMap?: Map<string, number>, // TAMBAHKAN: Parameter kedua: Map minimal order dari database (opsional)
): ItemQuantityRule { // Tipe return: objek aturan kuantitas
  const source = // Variabel penyimpan identitas gabungan produk
    `${item.subcategory || ""} ${item.productName || ""} ${item.size || ""}`.toLowerCase(); // Gabung subkategori, nama produk, dan varian secara lowercase

  const dashboardName = normalizeTokenLookupKey( // TAMBAHKAN: Normalisasi nama produk untuk key pencarian DB
    toDashboardProductNameFromItem(item), // TAMBAHKAN: Bangun nama produk dashboard sesuai varian
  ); // Akhir dari normalisasi key
  
  const dbMinOrder = minimumOrderMap?.get(dashboardName) ?? 0; // TAMBAHKAN: Dapatkan nilai minimal order dari map DB

  if (isCustomCookieItem(item)) {
    const effectiveMin = Math.max(0, dbMinOrder);
    const splitEx1 = Math.max(1, Math.floor(Math.max(effectiveMin, 2) / 2));
    const splitEx2 = Math.max(1, Math.max(effectiveMin, 2) - splitEx1);
    return {
      label: "Quantity (pcs)",
      min: 1, // Kuantitas per varian bisa 1 karena dicek totalnya nanti
      helperText:
        effectiveMin > 0
          ? `Minimum total custom cookies ${effectiveMin} pcs per order. Bisa split varian (contoh ${splitEx1} Simple + ${splitEx2} Hard).`
          : "Ikuti minimum order dari variant product yang aktif. Jika semua variant custom cookies diset 0 di halaman product, order bisa mulai dari 1 pcs per variant.",
    };
  }

  if (dbMinOrder > 0) { // TAMBAHKAN: Jika minimal order di DB diset > 0
    return { // TAMBAHKAN: Kembalikan aturan minimal order khusus
      label: "Quantity", // TAMBAHKAN: Label qty
      min: dbMinOrder, // TAMBAHKAN: Set min qty sesuai DB
      helperText: `Minimal order untuk ${item.productName} (${item.size || "Standard"}) adalah ${dbMinOrder} pcs.`, // TAMBAHKAN: Keterangan batas order untuk UI
    }; // TAMBAHKAN: Akhir return objek
  } // TAMBAHKAN: Akhir pengecekan dbMinOrder

  const bouquetType = detectBouquetTypeFromItem(item); // Cek tipe buket bunga dari item
  if (bouquetType === "HAND") {
    return {
      label: "Quantity (isi cookies)",
      min: 1,
      helperText: `Hand bouquet: isi cookies ${BOUQUET_HAND_MIN_QTY}-${BOUQUET_HAND_MAX_QTY}. Qty 1-${BOUQUET_HAND_MIN_QTY - 1} dibaca sebagai jumlah unit bouquet (harga start from).`,
    };
  }
  if (bouquetType === "STANDING") {
    return {
      label: "Quantity (isi cookies)",
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

function getBouquetLineTotal(
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

function getItemProductionToken(item: BookingItemInput): number {
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

function normalizeTokenLookupKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function toDashboardProductNameFromItem(item: BookingItemInput): string {
  // Custom Cookies di booking form punya productName="Cookies" tapi di DB namanya "Custom Cookies".
  // Normalisasi di sini agar lookup key cocok dengan nama produk di database.
  let effectiveProductName = item.productName;
  if (
    isCustomCookieItem(item) &&
    effectiveProductName.toLowerCase().trim() === "cookies"
  ) {
    effectiveProductName = "Custom Cookies"; // Sesuaikan dengan nama di tabel Product
  }

  const effectiveVariantLabel =
    isCustomCookieItem(item) &&
    normalizeTokenDifficultyValue(item.tokenDifficulty) !== "SIMPLE"
      ? normalizeTokenDifficultyValue(item.tokenDifficulty)
      : isCustomCookieItem(item) &&
          ["", "standard", "start from"].includes(
            String(item.size || "")
              .trim()
              .toLowerCase(),
          )
        ? normalizeTokenDifficultyValue(item.tokenDifficulty)
        : item.size;

  return buildDashboardProductName({
    productName: effectiveProductName,
    variantLabel: effectiveVariantLabel,
    variantCount: 1,
  });
}

function getItemProductionTokenSynced(
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

function resolveItemCustomTokenPerUnitSynced(
  item: BookingItemInput,
  tokenByProductName: Map<string, number>,
): number | undefined {
  const existingCustomToken = Number(item.customTokenPerUnit);
  if (Number.isFinite(existingCustomToken) && existingCustomToken > 0) {
    return Math.round(existingCustomToken);
  }

  const dashboardName = normalizeTokenLookupKey(
    toDashboardProductNameFromItem(item),
  );
  const tokenFromProduct = tokenByProductName.get(dashboardName);
  if (tokenFromProduct !== undefined && Number(tokenFromProduct) > 0) {
    return Math.round(Number(tokenFromProduct));
  }

  return undefined;
}

function getTotalProductionTokenSynced(
  items: BookingItemInput[],
  tokenByProductName: Map<string, number>,
): number {
  return items.reduce(
    (sum, item) => sum + getItemProductionTokenSynced(item, tokenByProductName),
    0,
  );
}

function getDraftItemPriceBreakdown(args: {
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
  if (!hasParsedRecapPrice) {
    selectedAddOnIds.forEach((addOnId) => {
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
  const baseAmount = hasParsedRecapPrice ? totalAmount : catalogBaseAmount;
  const addOnAmount = hasParsedRecapPrice
    ? 0
    : Math.max(0, Math.round(catalogAddOnAmount));
  const designAdjustmentAmount = hasParsedRecapPrice
    ? 0
    : Math.round(totalAmount - baseAmount - addOnAmount);

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

function toBookingDatePart(deliveryDate: string): string {
  const normalizedDate = normalizeDateInput(deliveryDate);
  if (!normalizedDate) return "000000";

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

function formatSubmitTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function normalizeDuplicateTemplateText(value?: string): string {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .trim();
}

function normalizeTemplateForSimilarity(value: string): string {
  return normalizeDuplicateTemplateText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildCharacterNgrams(value: string, size = 4): Set<string> {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return new Set();
  if (normalized.length <= size) return new Set([normalized]);

  const ngrams = new Set<string>();
  for (let i = 0; i <= normalized.length - size; i += 1) {
    ngrams.add(normalized.slice(i, i + size));
  }
  return ngrams;
}

function calculateDiceCoefficient(
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

function calculateTokenJaccard(
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

function calculateTemplateSimilarity(
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

const DUPLICATE_TEMPLATE_SIMILARITY_THRESHOLD = 0.94;
const DUPLICATE_TEMPLATE_MIN_SIMILARITY_CHARS = 48;
const DUPLICATE_TEMPLATE_MIN_CHAR_SIMILARITY = 0.92;
const DUPLICATE_TEMPLATE_MIN_TOKEN_SIMILARITY = 0.75;

type DuplicateTemplateMatch = {
  order: BakeryOrder;
  similarityScore: number;
  matchType: "exact" | "similar";
};

function findOrdersWithDuplicateParsedTemplate(
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

function formatDuplicateWarningDate(value: string): string {
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

function formatTemplateSimilarityLabel(
  score: number,
  matchType: "exact" | "similar",
): string {
  if (matchType === "exact") return "Sama persis (100%)";
  return `Sangat mirip (${Math.round(score * 100)}%)`;
}

function findFirstFormErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;

  const record = error as Record<string, unknown>;
  if (typeof record.message === "string" && record.message.trim()) {
    return record.message.trim();
  }

  for (const value of Object.values(record)) {
    const nestedMessage = findFirstFormErrorMessage(value);
    if (nestedMessage) return nestedMessage;
  }

  return null;
}

type ValidationIssueSummary = {
  path: Array<string | number>;
  message: string;
};

function parseValidationIssuesMessage(
  value: string,
): ValidationIssueSummary[] | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[")) return null;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) return null;

    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          return null;
        }

        const record = entry as Record<string, unknown>;
        const message =
          typeof record.message === "string" ? record.message.trim() : "";
        if (!message) return null;

        const path = Array.isArray(record.path)
          ? record.path.filter(
              (segment): segment is string | number =>
                typeof segment === "string" || typeof segment === "number",
            )
          : [];

        return { path, message };
      })
      .filter((entry): entry is ValidationIssueSummary => Boolean(entry));
  } catch {
    return null;
  }
}

function collectValidationIssueSummaries(
  error: unknown,
  path: Array<string | number> = [],
): ValidationIssueSummary[] {
  if (!error) return [];

  if (error instanceof z.ZodError) {
    return error.issues
      .map((issue) => ({
        path: issue.path.filter(
          (segment): segment is string | number =>
            typeof segment === "string" || typeof segment === "number",
        ),
        message: issue.message.trim(),
      }))
      .filter((issue) => issue.message);
  }

  if (typeof error === "string") {
    return parseValidationIssuesMessage(error) ?? [];
  }

  if (typeof error !== "object") return [];

  const record = error as Record<string, unknown>;
  if (Array.isArray(record.issues)) {
    const nestedIssues = collectValidationIssueSummaries(record.issues, path);
    if (nestedIssues.length > 0) return nestedIssues;
  }

  if (typeof record.message === "string") {
    const parsedMessage = parseValidationIssuesMessage(record.message);
    if (parsedMessage && parsedMessage.length > 0) {
      return parsedMessage;
    }
  }

  const collected: ValidationIssueSummary[] = [];
  if (typeof record.message === "string" && record.message.trim()) {
    collected.push({
      path,
      message: record.message.trim(),
    });
  }

  Object.entries(record).forEach(([key, value]) => {
    if (key === "message" || key === "type" || key === "ref") return;
    if (key === "root") {
      collected.push(...collectValidationIssueSummaries(value, path));
      return;
    }

    const nextPathSegment = /^\d+$/.test(key) ? Number(key) : key;
    collected.push(
      ...collectValidationIssueSummaries(value, [...path, nextPathSegment]),
    );
  });

  return collected;
}

function getValidationFieldLabel(path: Array<string | number>): string {
  const [root, index, leaf] = path;
  const rootKey = typeof root === "string" ? root : "";

  if (rootKey === "deliveryAddresses") {
    const addressNumber = typeof index === "number" ? index + 1 : 1;
    const isPrimaryAddress = addressNumber === 1;

    if (leaf === "label") {
      return isPrimaryAddress
        ? "Label alamat utama"
        : `Label alamat ${addressNumber}`;
    }
    if (leaf === "area") {
      return isPrimaryAddress
        ? "Area pengiriman utama"
        : `Area alamat ${addressNumber}`;
    }
    if (leaf === "postalCode") {
      return isPrimaryAddress
        ? "Kode pos alamat utama"
        : `Kode pos alamat ${addressNumber}`;
    }
    if (leaf === "addressLine") {
      return isPrimaryAddress ? "Alamat utama" : `Alamat ${addressNumber}`;
    }
  }

  if (rootKey === "items") {
    const itemNumber = typeof index === "number" ? index + 1 : 1;
    if (leaf === "productName") return `Produk item ${itemNumber}`;
    if (leaf === "size") return `Ukuran item ${itemNumber}`;
    if (leaf === "quantity") return `Qty item ${itemNumber}`;
    return `Item pesanan ${itemNumber}`;
  }

  switch (rootKey) {
    case "customerName":
      return "Nama customer";
    case "phoneNumber":
      return "Nomor telepon";
    case "deliveryDate":
      return "Tanggal pengiriman";
    case "deliverySlot":
      return "Jam pengiriman";
    case "deliveryMethod":
      return "Metode pengiriman";
    case "sales_channel":
      return "Channel penjualan";
    case "paymentStatus":
      return "Status pembayaran";
    case "items":
      return "Item pesanan";
    case "deliveryAddresses":
      return "Alamat pengiriman";
    default:
      return "Field form";
  }
}

function normalizeValidationIssueMessage(
  path: Array<string | number>,
  message: string,
): string {
  const normalized = message.trim();
  if (!normalized) return "Perlu dilengkapi.";

  const lower = normalized.toLowerCase();
  const [root, index, leaf] = path;
  const rootKey = typeof root === "string" ? root : "";

  if (rootKey === "phoneNumber" && lower === "phone number is required") {
    return "Isi nomor minimal 8 digit.";
  }
  if (rootKey === "customerName" && lower === "customer name is required") {
    return "Isi nama customer minimal 2 karakter.";
  }
  if (rootKey === "deliveryDate" && lower === "delivery date is required") {
    return "Pilih tanggal pengiriman.";
  }
  if (rootKey === "deliverySlot" && lower === "delivery slot is required") {
    return "Pilih jam pengiriman.";
  }
  if (rootKey === "items" && lower === "at least one item is required") {
    return "Tambahkan minimal 1 item pesanan.";
  }
  if (
    rootKey === "deliveryAddresses" &&
    lower === "at least one address is required"
  ) {
    return "Tambahkan minimal 1 alamat pengiriman.";
  }
  if (
    rootKey === "deliveryAddresses" &&
    leaf === "label" &&
    lower === "address label is required"
  ) {
    const addressNumber = typeof index === "number" ? index + 1 : 1;
    return addressNumber === 1
      ? "Isi label alamat utama."
      : `Isi label alamat ${addressNumber}.`;
  }

  return normalized.endsWith(".") ? normalized : `${normalized}.`;
}

function buildValidationFeedbackMessage(error: unknown): string | null {
  const issues = collectValidationIssueSummaries(error);
  if (issues.length === 0) {
    const firstMessage = findFirstFormErrorMessage(error);
    return firstMessage
      ? `Masih ada field wajib yang belum lengkap.\n• ${firstMessage}`
      : null;
  }

  const dedupedIssues = issues.filter((issue, index, array) => {
    const signature = `${issue.path.join(".")}::${issue.message}`;
    return (
      array.findIndex(
        (entry) => `${entry.path.join(".")}::${entry.message}` === signature,
      ) === index
    );
  });

  const lines = dedupedIssues.slice(0, 4).map((issue) => {
    const label = getValidationFieldLabel(issue.path);
    const message = normalizeValidationIssueMessage(issue.path, issue.message);
    return `• ${label}: ${message}`;
  });
  const remainingCount = dedupedIssues.length - lines.length;

  return [
    "Masih ada data yang belum lengkap:",
    ...lines,
    remainingCount > 0
      ? `• ${remainingCount} field lain juga masih perlu dilengkapi.`
      : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

export default function BookingForm({
  mode = "create",
  orderId,
  initialOrder = null,
}: BookingFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const isReviewPage = pathname === "/bakery/bookings/new/review";
  const isEditMode = mode === "edit";
  const editOrderId = (orderId || initialOrder?.id || "").trim();
  const { addOrder, updateOrder, orders, getCustomerMessagePreview } =
    useOrders();
  const { isOwner, isAdmin, loading: isRoleLoading } = useRole();
  const { productCatalog, addOnCatalog } = useCatalogAdminState();
  const [composerStep, setComposerStep] = useState<"input" | "preview">(
    isReviewPage ? "preview" : "input",
  );
  const [quickPaste, setQuickPaste] = useState("");
  const [selectedOrderType, setSelectedOrderType] =
    useState<ParserOrderType>("unknown");
  const [showOrderTypeSelector, setShowOrderTypeSelector] = useState(false);
  const [isParsingWhatsApp, setIsParsingWhatsApp] = useState(false);
  const [parsedPreview, setParsedPreview] =
    useState<ParsedWhatsAppOrder | null>(null);
  const [productionPreviewImageUrl, setProductionPreviewImageUrl] =
    useState("");
  const [draftImported, setDraftImported] = useState(false);
  const [referenceImageFiles, setReferenceImageFiles] = useState<File[]>([]);
  const [persistedReferenceImages, setPersistedReferenceImages] = useState<
    ParsedWhatsAppReferenceImage[]
  >([]);
  const [referenceFilesChangedSinceParse, setReferenceFilesChangedSinceParse] =
    useState(false);
  const [referenceSyncStatus, setReferenceSyncStatus] =
    useState<ReferenceSyncStatus>("idle");
  const [referenceImageLabelsInput, setReferenceImageLabelsInput] =
    useState("");
  const [referenceFileInputKey, setReferenceFileInputKey] = useState(0);
  const [shippingQuotes, setShippingQuotes] = useState<ShippingQuote[]>([]);
  const [selectedShippingQuoteId, setSelectedShippingQuoteId] = useState("");
  const selectedShippingQuoteIdRef = useRef("");
  const selectedShippingQuoteServiceKeyRef = useRef("");
  const [shippingDistanceKm, setShippingDistanceKm] = useState<number | null>(
    null,
  );
  const [shippingDistanceSource, setShippingDistanceSource] =
    useState<ShippingQuoteResponse["distanceSource"]>(undefined);
  const [shippingWarning, setShippingWarning] = useState("");
  const [showAllShippingOptions, setShowAllShippingOptions] = useState(false);
  const [isCheckingShipping, setIsCheckingShipping] = useState(false);
  const [hasHydratedDraftSnapshot, setHasHydratedDraftSnapshot] =
    useState(false);
  const [isCapacityValidating, setIsCapacityValidating] = useState(false);
  const [manualCheckShippingTrigger, setManualCheckShippingTrigger] =
    useState(0);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [submitSuccessMeta, setSubmitSuccessMeta] = useState<{
    id: string;
    bookingCode: string;
    submittedAt: string;
    phoneNumber: string;
  } | null>(null);
  const [isManualSubmitInFlight, setIsManualSubmitInFlight] = useState(false);
  const [isBookingCreationInFlight, setIsBookingCreationInFlight] =
    useState(false);
  const [showSubmitConfirmation, setShowSubmitConfirmation] = useState(false);
  const [duplicateTemplateWarning, setDuplicateTemplateWarning] =
    useState<DuplicateTemplateWarningState | null>(null);
  const manualSubmitInFlightRef = useRef(false);
  const bookingCreateInFlightRef = useRef(false);
  const submitFlowSourceRef = useRef<
    "form" | "duplicate-warning" | "submit-confirmation"
  >("form");
  const pendingSubmitConfirmationRef = useRef<BookingFormValues | null>(null);
  const skipSubmitConfirmationRef = useRef(false);
  const pendingDuplicateSubmissionRef = useRef<BookingFormValues | null>(null);
  const skipDuplicateTemplateWarningRef = useRef(false);
  const submitConfirmationPrimaryButtonRef = useRef<HTMLButtonElement | null>(
    null,
  );
  const duplicateWarningDialogRef = useRef<HTMLDivElement | null>(null);
  const duplicateWarningPrimaryButtonRef = useRef<HTMLButtonElement | null>(
    null,
  );
  const submitFeedbackRef = useRef<HTMLDivElement | null>(null);
  const importDraftRef = useRef<
    | ((override?: {
        sourceType?: ParserSource;
        orderType?: ParserOrderType;
        text?: string;
        successMessage?: string | null;
        navigateToPreview?: boolean;
        suppressSuccessToast?: boolean;
      }) => Promise<void>)
    | null
  >(null);
  const autoParseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const pendingReferenceSyncActionRef =
    useRef<PendingReferenceSyncAction | null>(null);
  const lastParsedReferenceSignatureRef = useRef("");
  const lastFailedAutoParseReferenceSignatureRef = useRef("");
  const hydratedEditOrderIdRef = useRef("");
  const shouldRequireSubmitConfirmation =
    !isRoleLoading && (isOwner || isAdmin);
  const canWarnDuplicateTemplate = !isRoleLoading && (isOwner || isAdmin);
  const [productTokenByName, setProductTokenByName] = useState< // Definisikan state untuk peta token kesulitan produk
    Map<string, number> // Tipe: Map dari nama produk dashboard ke token nominal
  >(new Map()); // Nilai awal: Map kosong

  const [productMinimumOrderByName, setProductMinimumOrderByName] = useState< // TAMBAHKAN: Definisikan state untuk peta minimal order produk dari DB
    Map<string, number> // TAMBAHKAN: Tipe: Map dari nama produk dashboard ke batas minimal order
  >(new Map()); // TAMBAHKAN: Nilai awal: Map kosong

  useEffect(() => { // Effect untuk melakukan polling data token kesulitan dan minimal order
    let cancelled = false; // Flag status mount komponen

    const refreshTokenMap = async () => { // Fungsi async untuk fetch data map produk terbaru
      try { // Coba block eksekusi
        const response = await fetch("/api/products/token-map", { // Kirim request fetch ke endpoint token-map
          cache: "no-store", // Bypass cache agar data selalu ter-update
          credentials: "include", // Kirim cookie auth user aktif
        }); // Akhir fetch
        if (!response.ok) return; // Jika gagal (e.g. 500, 401), abaikan
        const payload = (await response.json().catch(() => ({}))) as { // Parse data JSON, fallback ke objek kosong
          success?: boolean; // Indikator sukses API
          data?: Array<{ name: string; productionToken: number; minimumOrder?: number }>; // Payload termasuk field minimumOrder
        }; // Akhir casting tipe
        if (!payload.success || !Array.isArray(payload.data)) return; // Validasi payload response
        if (cancelled) return; // Hentikan jika komponen unmounted
        const tokenMap = new Map<string, number>(); // Instansiasi map token baru
        const minOrderMap = new Map<string, number>(); // TAMBAHKAN: Instansiasi map minimal order baru
        payload.data.forEach((product) => { // Looping setiap produk
          const lookupKey = normalizeTokenLookupKey(product.name); // Dapatkan lookup key terformat nama produk
          tokenMap.set( // Masukkan ke map token
            lookupKey, // Gunakan key nama produk dashboard ter-normalisasi
            Math.max(0, Number(product.productionToken ?? 0)), // Parsing token produksi aman >= 0
          ); // Akhir tokenMap.set
          if (product.minimumOrder !== undefined) { // TAMBAHKAN: Cek ketersediaan field minimumOrder
            minOrderMap.set( // TAMBAHKAN: Masukkan minimal order ke map
              lookupKey, // TAMBAHKAN: Gunakan key nama produk dashboard ter-normalisasi
              Math.max(0, Number(product.minimumOrder ?? 0)), // TAMBAHKAN: Parsing minimal order aman >= 0
            ); // TAMBAHKAN: Akhir minOrderMap.set
          } // TAMBAHKAN: Akhir check minimumOrder
        }); // Akhir loop forEach
        setProductTokenByName(tokenMap); // Update state token map
        setProductMinimumOrderByName(minOrderMap); // TAMBAHKAN: Update state minimal order map
      } catch { // Tangkap error jika ada
        // fallback ke calculator path saja jika API gagal
      } // Akhir block try-catch
    }; // Akhir fungsi refreshTokenMap

    const handleWindowFocus = () => {
      void refreshTokenMap();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshTokenMap();
      }
    };
    const intervalId = window.setInterval(() => {
      void refreshTokenMap();
    }, 60_000);

    void refreshTokenMap(); // Eksekusi fetch pertama kali saat mount
    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => { // Bersihkan effect
      cancelled = true; // Set status cancelled ke true saat unmount
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    }; // Akhir cleanup
  }, []); // Dependensi kosong (hanya dijalankan sekali saat mount)

  useEffect(() => {
    if (!showSubmitConfirmation) return;

    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
      submitConfirmationPrimaryButtonRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [showSubmitConfirmation]);

  useEffect(() => {
    if (!duplicateTemplateWarning) return;

    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
      duplicateWarningDialogRef.current?.scrollIntoView({
        block: "center",
        inline: "nearest",
      });
      duplicateWarningPrimaryButtonRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [duplicateTemplateWarning]);

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BookingFormInput, unknown, BookingFormValues>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      customerName: "",
      phoneNumber: "",
      deliveryDate: "",
      deliverySlot: "10:00",
      deliveryMethod: "REGULAR_JNE_JNT",
      sales_channel: "direct",
      customNotes: "",
      paymentStatus: "DP Paid",
      dpPaidAmount: 0,
      finalPaidAmount: 0,
      wholesaleDiscountPercent: 0,
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
              bouquetPriceOverride: undefined,
              sharingBoxPriceOverride: undefined,
              cookiePrice: undefined,
              addOns: [],
              addOnQuantities: {},
              addOnPriceOverrides: {},
              customAddOns: [],
              greetingCard: "",
              bouquetPaperColor: "",
              ribbon: "",
              flowerCount: "",
              flowerColor: "",
              ribbonColor: "",
              notes: "",
            }) ?? 1,
          tokenDifficulty: "SIMPLE",
          customTokenPerUnit: undefined,
          bouquetPriceOverride: undefined,
          sharingBoxPriceOverride: undefined,
          cookiePrice: undefined,
          addOns: [],
          addOnQuantities: {},
          addOnPriceOverrides: {},
          customAddOns: [],
          darkColorButtercreamColors: [],
          parsedUnitPrice: undefined,
          parsedSubtotal: undefined,
          pricingSource: undefined,
          greetingCard: "",
          bouquetPaperColor: "",
          ribbon: "",
          flowerCount: "",
          flowerColor: "",
          ribbonColor: "",
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

  useEffect(() => {
    if (isEditMode) {
      setHasHydratedDraftSnapshot(true);
      return;
    }

    const snapshot = loadBookingDraftSnapshot();
    if (!snapshot) {
      setHasHydratedDraftSnapshot(true);
      if (isReviewPage) {
        router.replace("/bakery/bookings/new");
      }
      return;
    }

    const restoredShippingQuotes = Array.isArray(snapshot.shippingQuotes)
      ? snapshot.shippingQuotes
      : [];
    const restoredSelectedShippingQuote =
      restoredShippingQuotes.find(
        (quote) => quote.id === (snapshot.selectedShippingQuoteId || ""),
      ) ?? null;
    const restoredPersistedReferenceImages = getEffectivePersistedReferenceImages(
      {
        parsedPreview: snapshot.parsedPreview,
        persistedReferenceImages: snapshot.persistedReferenceImages,
      },
    );
    const restoredParsedPreview = restoreParsedPreviewReferenceImages({
      parsedPreview: snapshot.parsedPreview,
      persistedReferenceImages: restoredPersistedReferenceImages,
    });

    reset(snapshot.formValues);
    setQuickPaste(snapshot.quickPaste);
    setSelectedOrderType(snapshot.selectedOrderType);
    setParsedPreview(restoredParsedPreview);
    setPersistedReferenceImages(restoredPersistedReferenceImages);
    setProductionPreviewImageUrl(snapshot.productionPreviewImageUrl);
    setDraftImported(snapshot.draftImported);
    setReferenceImageLabelsInput(snapshot.referenceImageLabelsInput);
    setShippingQuotes(restoredShippingQuotes);
    selectedShippingQuoteIdRef.current = snapshot.selectedShippingQuoteId || "";
    selectedShippingQuoteServiceKeyRef.current =
      snapshot.selectedShippingQuoteServiceKey ||
      (restoredSelectedShippingQuote
        ? getShippingQuoteServiceKey(restoredSelectedShippingQuote)
        : "");
    setSelectedShippingQuoteId(snapshot.selectedShippingQuoteId || "");
    setShippingDistanceKm(
      typeof snapshot.shippingDistanceKm === "number"
        ? snapshot.shippingDistanceKm
        : null,
    );
    setShippingDistanceSource(snapshot.shippingDistanceSource);
    setShippingWarning(snapshot.shippingWarning || "");
    setReferenceFilesChangedSinceParse(false);
    setReferenceSyncStatus("idle");
    setReferenceImageFiles([]);
    lastParsedReferenceSignatureRef.current = buildReferenceInputSignature({
      files: [],
      requestedLabels: normalizeReferenceLabelInput(
        snapshot.referenceImageLabelsInput,
      ),
    });
    lastFailedAutoParseReferenceSignatureRef.current = "";
    setComposerStep(isReviewPage ? "preview" : "input");
    setHasHydratedDraftSnapshot(true);
  }, [isEditMode, isReviewPage, reset, router]);

  useEffect(() => {
    if (!isEditMode || !initialOrder || !editOrderId) return;
    if (hydratedEditOrderIdRef.current === editOrderId) {
      setHasHydratedDraftSnapshot(true);
      return;
    }

    const formValues = buildBookingFormValuesFromOrder(
      initialOrder,
      productCatalog,
    );
    const requestedLabels = Array.isArray(
      initialOrder.whatsAppParsedData?.requestedImageLabels,
    )
      ? initialOrder.whatsAppParsedData?.requestedImageLabels ?? []
      : [];
    const shippingQuote = initialOrder.shippingQuote ?? null;
    const restoredPersistedReferenceImages = getEffectivePersistedReferenceImages(
      {
        parsedPreview: initialOrder.whatsAppParsedData ?? null,
        persistedReferenceImages:
          (Array.isArray(initialOrder.referenceImages)
            ? initialOrder.referenceImages
            : []) ?? [],
      },
    );
    const restoredParsedPreview = restoreParsedPreviewReferenceImages({
      parsedPreview: initialOrder.whatsAppParsedData ?? null,
      persistedReferenceImages: restoredPersistedReferenceImages,
    });

    reset(formValues);
    setQuickPaste("");
    setSelectedOrderType("unknown");
    setParsedPreview(restoredParsedPreview);
    setPersistedReferenceImages(restoredPersistedReferenceImages);
    setProductionPreviewImageUrl("");
    setDraftImported(Boolean(initialOrder.whatsAppParsedData));
    setReferenceImageLabelsInput(requestedLabels.join("\n"));
    setShippingQuotes(shippingQuote ? [shippingQuote] : []);
    selectedShippingQuoteIdRef.current = shippingQuote?.id ?? "";
    selectedShippingQuoteServiceKeyRef.current = shippingQuote
      ? getShippingQuoteServiceKey(shippingQuote)
      : "";
    setSelectedShippingQuoteId(shippingQuote?.id ?? "");
    setShippingDistanceKm(null);
    setShippingDistanceSource(undefined);
    setShippingWarning("");
    setReferenceFilesChangedSinceParse(false);
    setReferenceSyncStatus("idle");
    setReferenceImageFiles([]);
    lastParsedReferenceSignatureRef.current = buildReferenceInputSignature({
      files: [],
      requestedLabels,
    });
    lastFailedAutoParseReferenceSignatureRef.current = "";
    setComposerStep("input");
    hydratedEditOrderIdRef.current = editOrderId;
    setHasHydratedDraftSnapshot(true);
  }, [editOrderId, initialOrder, isEditMode, productCatalog, reset]);

  useEffect(() => {
    selectedShippingQuoteIdRef.current = selectedShippingQuoteId;
  }, [selectedShippingQuoteId]);

  const resolveSelectedShippingQuoteServiceKey = useCallback(() => {
    const currentSelectedShippingQuoteId =
      selectedShippingQuoteIdRef.current || selectedShippingQuoteId;
    const currentSelectedShippingQuote =
      shippingQuotes.find(
        (quote) => quote.id === currentSelectedShippingQuoteId,
      ) ?? null;

    if (currentSelectedShippingQuote) {
      return getShippingQuoteServiceKey(currentSelectedShippingQuote);
    }

    return selectedShippingQuoteServiceKeyRef.current;
  }, [selectedShippingQuoteId, shippingQuotes]);

  const showSubmitFeedback = useCallback((message: string) => {
    setSubmitError(message);
    toast.error(message);

    window.requestAnimationFrame(() => {
      submitFeedbackRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }, []);

  const openPreviewPage = useCallback(
    (snapshotOverrides?: Partial<BookingDraftSnapshot>) => {
      const parsedValues = bookingSchema.safeParse(getValues());
      if (!parsedValues.success) {
        showSubmitFeedback(
          buildValidationFeedbackMessage(parsedValues.error) ||
            "Masih ada field wajib yang belum lengkap. Cek bagian form yang bertanda merah.",
        );
        return;
      }

      if (!isEditMode) {
        const nextParsedPreview =
          snapshotOverrides?.parsedPreview ?? parsedPreview;
        const nextPersistedReferenceImages =
          snapshotOverrides?.persistedReferenceImages ??
          getEffectivePersistedReferenceImages({
            parsedPreview: nextParsedPreview,
            persistedReferenceImages,
          });

        saveBookingDraftSnapshot({
          composerStep: "preview",
          quickPaste,
          selectedOrderType,
          parsedPreview: nextParsedPreview,
          persistedReferenceImages: nextPersistedReferenceImages,
          productionPreviewImageUrl,
          draftImported,
          referenceImageLabelsInput,
          referenceFilesChangedSinceParse,
          shippingQuotes,
          selectedShippingQuoteId:
            selectedShippingQuoteIdRef.current || selectedShippingQuoteId,
          selectedShippingQuoteServiceKey:
            resolveSelectedShippingQuoteServiceKey(),
          shippingDistanceKm,
          shippingDistanceSource,
          shippingWarning,
          formValues: parsedValues.data,
          ...snapshotOverrides,
        });
      }

      setComposerStep("preview");
      if (!isEditMode && !isReviewPage) {
        router.push("/bakery/bookings/new/review");
      }
    },
    [
      draftImported,
      getValues,
      isEditMode,
      isReviewPage,
      parsedPreview,
      persistedReferenceImages,
      productionPreviewImageUrl,
      quickPaste,
      referenceFilesChangedSinceParse,
      referenceImageLabelsInput,
      router,
      resolveSelectedShippingQuoteServiceKey,
      selectedOrderType,
      selectedShippingQuoteId,
      shippingDistanceKm,
      shippingDistanceSource,
      shippingQuotes,
      shippingWarning,
      showSubmitFeedback,
    ],
  );

  const isBookingProcessing =
    isSubmitting ||
    isManualSubmitInFlight ||
    isBookingCreationInFlight ||
    isCapacityValidating;
  const bookingProgressPercent = isCapacityValidating
    ? 38
    : isBookingCreationInFlight
      ? 84
      : isBookingProcessing
        ? 62
        : 0;
  const bookingProgressLabel = isCapacityValidating
    ? "Validasi kapasitas produksi"
    : isBookingCreationInFlight
      ? "Menyimpan booking dan sinkron ke sistem"
      : "Menyiapkan data booking";

  const {
    fields: itemFields,
    append: appendItem,
    remove: removeItem,
    replace: replaceItems,
  } = useFieldArray({
    control,
    name: "items",
  });

  const {
    fields: addressFields,
    append: appendAddress,
    remove: removeAddress,
    replace: replaceAddresses,
  } = useFieldArray({
    control,
    name: "deliveryAddresses",
  });

  const watchedItems = useWatch({ control, name: "items" }) ?? EMPTY_ITEMS;
  const watchedValues = useWatch({ control });
  const watchedAddresses =
    useWatch({ control, name: "deliveryAddresses" }) ?? EMPTY_ADDRESSES;
  const deliveryDate = useWatch({ control, name: "deliveryDate" });
  const deliverySlot = useWatch({ control, name: "deliverySlot" });
  const deliveryMethod =
    useWatch({ control, name: "deliveryMethod" }) ?? "REGULAR_JNE_JNT";
  const wholesaleDiscountPercent =
    useWatch({ control, name: "wholesaleDiscountPercent" }) ?? 0;
  const manualAdjustment = useWatch({ control, name: "manualAdjustment" }) ?? 0;
  const selectedPaymentStatus =
    useWatch({ control, name: "paymentStatus" }) ?? "DP Paid";
  const fragileOrderReasons = useMemo(
    () => getGrabCarOnlyReasons(watchedItems),
    [watchedItems],
  );
  const isFragileOrder = fragileOrderReasons.length > 0;
  const watchedDeliveryMethod = deliveryMethod as DeliveryMethod;
  const selectableDeliveryMethodOptions = useMemo(
    () => {
      if (!isFragileOrder) return DELIVERY_METHOD_OPTIONS;

      const allowedOptions = DELIVERY_METHOD_OPTIONS.filter((option) =>
        FRAGILE_ORDER_ALLOWED_METHODS.includes(option.value as DeliveryMethod),
      );
      if (
        allowedOptions.some((option) => option.value === watchedDeliveryMethod)
      ) {
        return allowedOptions;
      }

      const parsedOption = DELIVERY_METHOD_OPTIONS.find(
        (option) => option.value === watchedDeliveryMethod,
      );
      if (!parsedOption) return allowedOptions;

      return DELIVERY_METHOD_OPTIONS.filter(
        (option) =>
          FRAGILE_ORDER_ALLOWED_METHODS.includes(
            option.value as DeliveryMethod,
          ) || option.value === parsedOption.value,
      );
    },
    [isFragileOrder, watchedDeliveryMethod],
  );
  const effectiveDeliveryMethod = selectableDeliveryMethodOptions.some(
    (option) => option.value === watchedDeliveryMethod,
  )
    ? watchedDeliveryMethod
    : (selectableDeliveryMethodOptions[0]?.value ?? "PICKUP");
  const deliveryMethodField = register("deliveryMethod");

  const handleDeliveryMethodChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const nextMethod = event.target
        .value as BookingFormValues["deliveryMethod"];
      setValue("deliveryMethod", nextMethod, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      setSubmitError("");
      setShippingWarning("");
      setShippingQuotes([]);
      setSelectedShippingQuoteId("");
      selectedShippingQuoteServiceKeyRef.current = "";
      setShippingDistanceKm(null);
      setShippingDistanceSource(undefined);
    },
    [setValue],
  );

  const handleCheckShipping = useCallback(() => {
    setManualCheckShippingTrigger((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (deliveryMethod === effectiveDeliveryMethod) return;

    setValue("deliveryMethod", effectiveDeliveryMethod, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
    setShippingWarning("");
    setShippingQuotes([]);
    setSelectedShippingQuoteId("");
    selectedShippingQuoteServiceKeyRef.current = "";
    setShippingDistanceKm(null);
    setShippingDistanceSource(undefined);
  }, [deliveryMethod, effectiveDeliveryMethod, setValue]);

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

  const { settings: bakerySettings } = useBakerySettings();
  const {
    getCapacity: getCalendarCapacity,
    isLoading: isCalendarCapacityLoading,
    refetch: refetchSelectedDateCapacity,
  } = useCalendarCapacity(
    selectedCalendarDate,
    selectedCalendarDate,
    bakerySettings?.dailyProductionTokenLimit ?? DAILY_PRODUCTION_TOKEN_LIMIT,
  );
  const blockedDates = bakerySettings?.blockedDates ?? BAKERY_BLOCKED_DATES;
  const cutoffHour = bakerySettings?.cutoffHour ?? 10;
  const defaultDpPercentage = bakerySettings?.defaultDpPercentage ?? 50;
  const canBackfillPastOrders = !isRoleLoading && (isOwner || isAdmin);
  const allowHistoricalBackfillForSelectedDate =
    canBackfillPastOrders &&
    Boolean(normalizedDeliveryDate) &&
    isPastDate(normalizedDeliveryDate);

  const rawSelectedCalendarStatus = useMemo(() => {
    if (!normalizedDeliveryDate) {
      return "AVAILABLE" as const;
    }
    const selectedCapacity = getCalendarCapacity(normalizedDeliveryDate);
    return getCalendarStatus(
      {
        usedToken: selectedCapacity.usedToken,
        maxToken: selectedCapacity.maxToken,
        date: normalizedDeliveryDate,
      },
      undefined,
      { blockedDates, cutoffHour },
    );
  }, [normalizedDeliveryDate, getCalendarCapacity, blockedDates, cutoffHour]);

  const selectedCalendarStatus = useMemo(() => {
    if (
      canBackfillPastOrders &&
      (rawSelectedCalendarStatus === "PAST" ||
        rawSelectedCalendarStatus === "CUTOFF")
    ) {
      return "AVAILABLE" as const;
    }

    return rawSelectedCalendarStatus;
  }, [canBackfillPastOrders, rawSelectedCalendarStatus]);

  const calendarDateError = useMemo(() => {
    if (selectedCalendarStatus === "PAST") {
      return "Tanggal sudah terlewat";
    }
    if (selectedCalendarStatus === "FULL") {
      return "Tanggal sudah penuh";
    }
    if (selectedCalendarStatus === "BLOCKED") {
      return "Hari ini libur owner, order baru ditutup.";
    }
    if (selectedCalendarStatus === "CUTOFF") {
      return `Pemesanan H-1 sudah ditutup (setelah jam ${String(cutoffHour).padStart(2, "0")}.00)`;
    }
    return "";
  }, [selectedCalendarStatus, cutoffHour]);

  const calendarDateNotice = useMemo(() => {
    if (!canBackfillPastOrders) return "";
    if (rawSelectedCalendarStatus === "PAST") {
      return "Mode backfill aktif: Admin/Owner boleh input order untuk tanggal yang sudah lewat.";
    }
    if (rawSelectedCalendarStatus === "CUTOFF") {
      return "Mode backfill aktif: Admin/Owner boleh input order walau sudah lewat cut-off H-1.";
    }
    return "";
  }, [canBackfillPastOrders, rawSelectedCalendarStatus]);

  const isCalendarDateInvalid =
    selectedCalendarStatus === "BLOCKED" ||
    selectedCalendarStatus === "PAST" ||
    selectedCalendarStatus === "FULL" ||
    selectedCalendarStatus === "CUTOFF";

  const normalizedReferenceImageLabels = useMemo(
    () =>
      referenceImageLabelsInput
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    [referenceImageLabelsInput],
  );
  const referenceInputSignature = useMemo(
    () =>
      buildReferenceInputSignature({
        files: referenceImageFiles,
        requestedLabels: normalizedReferenceImageLabels,
      }),
    [normalizedReferenceImageLabels, referenceImageFiles],
  );

  const itemPriceBreakdowns = useMemo(() => {
    return watchedItems.map((item) =>
      getDraftItemPriceBreakdown({
        catalog: productCatalog,
        addOnCatalog,
        item,
      }),
    );
  }, [watchedItems, productCatalog, addOnCatalog]);

  const effectiveReferenceImages = useMemo(
    () =>
      getEffectivePersistedReferenceImages({
        parsedPreview,
        persistedReferenceImages,
      }),
    [parsedPreview, persistedReferenceImages],
  );
  const effectiveReferenceImageCount =
    referenceImageFiles.length > 0
      ? referenceImageFiles.length
      : effectiveReferenceImages.length;

  const previewReferenceImages = useMemo(() => {
    if (effectiveReferenceImages.length > 0) {
      return effectiveReferenceImages.map((entry, index) => ({
        label: entry.label?.trim() || `Gambar ${index + 1}`,
        note: entry.note?.trim() || "",
        url: entry.url?.trim() || "",
      }));
    }

    return referenceImageFiles.map((file, index) => ({
      label: `Gambar ${index + 1}`,
      note: normalizedReferenceImageLabels[index] || "",
      url: "",
    }));
  }, [
    effectiveReferenceImages,
    normalizedReferenceImageLabels,
    referenceImageFiles,
  ]);
  const previewAlertMessage = parsedPreview
    ? "Ada yang salah? Kembali ke halaman sebelumnya, edit teks WA, lalu parse ulang."
    : "Ada yang salah? Kembali ke halaman sebelumnya dan cek lagi data booking sebelum disimpan.";

  const deliveryMethodLabel = useMemo(
    () => resolveDeliveryMethodLabel(effectiveDeliveryMethod),
    [effectiveDeliveryMethod],
  );

  const basePrice = useMemo(() => {
    return itemPriceBreakdowns.reduce((sum, item) => {
      return sum + item.baseAmount;
    }, 0);
  }, [itemPriceBreakdowns]);

  const designAdjustmentTotal = useMemo(() => {
    return itemPriceBreakdowns.reduce((sum, item) => {
      return sum + item.designAdjustmentAmount;
    }, 0);
  }, [itemPriceBreakdowns]);

  useEffect(() => {
    if (effectiveDeliveryMethod !== "ASSISTED_PAXEL") return;

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
    effectiveDeliveryMethod,
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

  useEffect(() => {
    watchedItems.forEach((item, index) => {
      const normalizedSelection = ensureSelectionFromCatalog(productCatalog, {
        category: item?.category,
        subcategory: item?.subcategory,
        productName: item?.productName,
        size: item?.size,
      });

      const quantity = Number(item?.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) return;

      const preferredSize = resolveIndividualCupcakeSizeByQuantity({
        catalog: productCatalog,
        selection: normalizedSelection,
        quantity: Math.max(1, Math.round(quantity)),
      });

      if (!preferredSize || preferredSize === normalizedSelection.size) return;

      clearParsedPricingOverride(index);
      setValue(`items.${index}.size`, preferredSize, {
        shouldValidate: true,
      });
    });
  }, [clearParsedPricingOverride, watchedItems, productCatalog, setValue]);

  const addOnTotal = useMemo(() => {
    return itemPriceBreakdowns.reduce((sum, item) => {
      return sum + item.addOnAmount;
    }, 0);
  }, [itemPriceBreakdowns]);

  const categoryPriceBreakdown = useMemo(() => {
    const grouped = new Map<
      string,
      {
        groupLabel: BookingItemGroupLabel;
        categoryLabel: string;
        amount: number;
        items: Array<{
          label: string;
          quantity: number;
          baseAmount: number;
          designAdjustmentAmount: number;
          addOnAmount: number;
          totalAmount: number;
          addOnDetails?: string[];
        }>;
      }
    >();

    itemPriceBreakdowns.forEach((item) => {
      if (item.quantity <= 0) return;
      const categoryLabel = item.categoryLabel;
      const groupLabel = item.groupLabel;
      const groupKey = `${groupLabel}::${categoryLabel}`;

      const current = grouped.get(groupKey) ?? {
        groupLabel,
        categoryLabel,
        amount: 0,
        items: [],
      };

      grouped.set(groupKey, {
        groupLabel: current.groupLabel,
        categoryLabel: current.categoryLabel,
        amount: current.amount + item.totalAmount,
        items: [
          ...current.items,
          {
            label: item.itemLabel,
            quantity: item.quantity,
            baseAmount: item.baseAmount,
            designAdjustmentAmount: item.designAdjustmentAmount,
            addOnAmount: item.addOnAmount,
            totalAmount: item.totalAmount,
            addOnDetails: item.addOnDetails,
          },
        ],
      });
    });

    return Array.from(grouped.values()).map((summary) => ({
      label: summary.categoryLabel,
      groupLabel: summary.groupLabel,
      amount: summary.amount,
      items: summary.items,
    }));
  }, [itemPriceBreakdowns]);

  const orderItemGroupingSummary = useMemo(() => {
    return watchedItems.reduce(
      (acc, item) => {
        const group = getBookingItemGroupLabel(item);
        if (group === "SEASONAL_EVENT") {
          acc.seasonalCount += 1;
        } else {
          acc.customCount += 1;
        }
        return acc;
      },
      { customCount: 0, seasonalCount: 0 },
    );
  }, [watchedItems]);

  const shouldUseShippingEngine = useMemo(
    () => usesShippingEngine(effectiveDeliveryMethod),
    [effectiveDeliveryMethod],
  );
  const isPickupMethod = effectiveDeliveryMethod === "PICKUP";
  const isCarRideHailingMethod =
    effectiveDeliveryMethod === "ASSISTED_GOCAR" ||
    effectiveDeliveryMethod === "ASSISTED_GRAB";
  const hasBouquetItems = useMemo(
    () => watchedItems.some((item) => isBouquetItem(item)),
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

      return false;
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

    if (effectiveDeliveryMethod === "ASSISTED_PAXEL") {
      const paxelQuotes = shippingQuotes.filter(
        (quote) => quote.provider === "PAXEL",
      );
      return paxelQuotes;
    }

    if (effectiveDeliveryMethod === "ASSISTED_GRAB") {
      if (grabQuotes.length > 0) {
        return grabQuotes;
      }

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

    if (effectiveDeliveryMethod === "ASSISTED_GOSEND") {
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

    if (effectiveDeliveryMethod === "ASSISTED_GOCAR") {
      const gojekCarQuotes = gojekQuotes.filter(isCarService);
      if (gojekCarQuotes.length > 0) {
        return gojekCarQuotes;
      }

      const grabCarQuotes = grabQuotes.filter(isCarService);
      if (grabCarQuotes.length > 0) {
        return grabCarQuotes;
      }

      const gojekNonBikeQuotes = gojekQuotes.filter(
        (quote) => !isBikeService(quote),
      );
      if (gojekNonBikeQuotes.length > 0) {
        return gojekNonBikeQuotes;
      }

      const grabNonBikeQuotes = grabQuotes.filter(
        (quote) => !isBikeService(quote),
      );
      if (grabNonBikeQuotes.length > 0) {
        return grabNonBikeQuotes;
      }

      return gojekQuotes;
    }

    if (effectiveDeliveryMethod === "REGULAR_JNE_JNT") {
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

    if (effectiveDeliveryMethod === "ASSISTED_SAME_DAY") {
      return shippingQuotes.filter(
        (quote) =>
          quote.provider === "GOJEK" ||
          quote.provider === "GRAB" ||
          quote.provider === "PAXEL",
      );
    }

    return shippingQuotes;
  }, [
    effectiveDeliveryMethod,
    hasBouquetItems,
    shippingQuotes,
    shouldUseShippingEngine,
  ]);

  const isStrictDeliveryMethod =
    effectiveDeliveryMethod === "ASSISTED_PAXEL" ||
    effectiveDeliveryMethod === "ASSISTED_GOSEND" ||
    effectiveDeliveryMethod === "ASSISTED_GRAB" ||
    effectiveDeliveryMethod === "ASSISTED_GOCAR" ||
    effectiveDeliveryMethod === "REGULAR_JNE_JNT";

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
      if (
        !existing ||
        getShippingQuoteDisplayPrice(quote) <
          getShippingQuoteDisplayPrice(existing)
      ) {
        bestByService.set(key, quote);
      }
    }

    return Array.from(bestByService.values()).sort(
      (a, b) =>
        getShippingQuoteDisplayPrice(a) - getShippingQuoteDisplayPrice(b),
    );
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

      if (
        etaHours === bestEtaHours &&
        getShippingQuoteDisplayPrice(quote) <
          getShippingQuoteDisplayPrice(bestQuote)
      ) {
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

    if (effectiveDeliveryMethod === "ASSISTED_PAXEL") {
      return "Layanan Paxel belum tersedia untuk alamat ini. Pilih metode lain atau ubah alamat penerima.";
    }
    if (effectiveDeliveryMethod === "ASSISTED_GRAB") {
      return "Layanan Grab belum tersedia untuk alamat ini. Pilih metode lain atau ubah alamat penerima.";
    }
    if (effectiveDeliveryMethod === "ASSISTED_GOSEND") {
      return "Layanan GoSend belum tersedia untuk alamat ini. Pilih metode lain atau ubah alamat penerima.";
    }
    if (effectiveDeliveryMethod === "ASSISTED_GOCAR") {
      return "Layanan GoCar belum tersedia untuk alamat ini. Pilih metode lain atau ubah alamat penerima.";
    }
    if (effectiveDeliveryMethod === "REGULAR_JNE_JNT") {
      if (hasBouquetItems) {
        return "Untuk bouquet, layanan reguler yang aman belum tersedia untuk alamat ini. Coba metode lain atau ubah alamat penerima.";
      }
      return "Layanan JNE/J&T belum tersedia untuk alamat ini. Pilih metode lain atau ubah alamat penerima.";
    }
    return "Layanan kurir pada metode terpilih belum tersedia. Pilih metode lain atau ubah alamat penerima.";
  }, [effectiveDeliveryMethod, hasBouquetItems, isShippingFallbackActive]);

  const selectedShippingQuote = useMemo(
    () =>
      filteredShippingQuotes.find(
        (quote) => quote.id === selectedShippingQuoteId,
      ) ?? null,
    [filteredShippingQuotes, selectedShippingQuoteId],
  );

  useEffect(() => {
    if (!hasHydratedDraftSnapshot) return;

    if (selectedShippingQuote) {
      selectedShippingQuoteServiceKeyRef.current =
        getShippingQuoteServiceKey(selectedShippingQuote);
      return;
    }

    if (!selectedShippingQuoteId) {
      selectedShippingQuoteServiceKeyRef.current = "";
    }
  }, [
    hasHydratedDraftSnapshot,
    selectedShippingQuote,
    selectedShippingQuoteId,
  ]);

  useEffect(() => {
    if (!hasHydratedDraftSnapshot) return;

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

      const matchedByServiceKey = filteredShippingQuotes.find(
        (quote) =>
          getShippingQuoteServiceKey(quote) ===
          selectedShippingQuoteServiceKeyRef.current,
      );
      if (matchedByServiceKey) {
        return matchedByServiceKey.id;
      }

      return filteredShippingQuotes[0]?.id || "";
    });
  }, [filteredShippingQuotes, hasHydratedDraftSnapshot]);

  const isAllowedFragileOrderMethod = FRAGILE_ORDER_ALLOWED_METHODS.includes(
    effectiveDeliveryMethod,
  );

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
    ? (selectedShippingQuote?.priceWithoutInsurance ??
      selectedShippingQuote?.price ??
      0)
    : 0;
  const insuranceFeeFromShipping = shouldUseShippingEngine
    ? (selectedShippingQuote?.insuranceFee ?? 0)
    : 0;
  const serviceCharge = resolveAdminServiceCharge(effectiveDeliveryMethod);

  const isJneJnt =
    effectiveDeliveryMethod === "REGULAR_JNE_JNT" ||
    selectedShippingQuote?.provider === "JNE" ||
    selectedShippingQuote?.provider === "JNT";
  const itemsSubtotal = basePrice + designAdjustmentTotal + addOnTotal;
  const requiresInsurance = isJneJnt && itemsSubtotal > 2000000;
  const insuranceFeeByRule = requiresInsurance
    ? Math.round(itemsSubtotal * 0.003) + 5000
    : 0;
  // Business rule: khusus JNE/JNT jika nominal pembelian > 2 juta wajib pakai rumus 0.3% x subtotal item + 5000.
  const insuranceFee = isJneJnt ? insuranceFeeByRule : insuranceFeeFromShipping;

  const subtotalBeforeDiscount =
    basePrice +
    designAdjustmentTotal +
    addOnTotal +
    deliveryFee +
    insuranceFee +
    serviceCharge +
    Number(manualAdjustment || 0);
  const wholesaleDiscountAmount = Math.max(
    0,
    Math.round(
      Math.max(0, subtotalBeforeDiscount) *
        (Number(wholesaleDiscountPercent || 0) / 100),
    ),
  );

  const totalPrice = Math.max(
    0,
    subtotalBeforeDiscount - wholesaleDiscountAmount,
  );
  const suggestedDownPaymentAmount = Math.round(
    Math.max(0, Number(totalPrice || 0)) * (defaultDpPercentage / 100),
  );
  const effectiveDpPaidAmount =
    selectedPaymentStatus === "DP Paid" ? suggestedDownPaymentAmount : 0;
  const effectiveFinalPaidAmount =
    selectedPaymentStatus === "Paid" ? totalPrice : 0;

  const totalPaid = Math.min(
    totalPrice,
    effectiveDpPaidAmount + effectiveFinalPaidAmount,
  );
  const downPaymentAmount = effectiveDpPaidAmount;
  const remainingBalance = Math.max(0, totalPrice - totalPaid);
  const effectivePaymentStatus =
    selectedPaymentStatus === "Paid" ? "Paid" : "DP Paid";

  const deliverySlots = useMemo(
    () =>
      getDeliverySlotsForDate(deliveryDate, undefined, {
        deliveryMethod: effectiveDeliveryMethod,
        items: watchedItems,
        blockedDates,
        cutoffHour: canBackfillPastOrders ? 99 : cutoffHour,
        allowHistoricalBackfill: allowHistoricalBackfillForSelectedDate,
      }),
    [
      deliveryDate,
      effectiveDeliveryMethod,
      watchedItems,
      blockedDates,
      cutoffHour,
      canBackfillPastOrders,
      allowHistoricalBackfillForSelectedDate,
    ],
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
    !canBackfillPastOrders &&
    isDateBlockedForOrdering(deliveryDate, undefined, {
      deliveryMethod: effectiveDeliveryMethod,
      items: watchedItems,
      blockedDates,
      cutoffHour,
      allowHistoricalBackfill: allowHistoricalBackfillForSelectedDate,
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
          deliveryMethod: effectiveDeliveryMethod,
          items: watchedItems,
          blockedDates,
          cutoffHour: canBackfillPastOrders ? 99 : cutoffHour,
          allowHistoricalBackfill: allowHistoricalBackfillForSelectedDate,
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
    effectiveDeliveryMethod,
    watchedItems,
    blockedDates,
    cutoffHour,
    canBackfillPastOrders,
    allowHistoricalBackfillForSelectedDate,
  ]);

  const slotStatusByTime = useMemo(() => {
    return new Map(slotAvailability.map((entry) => [entry.slot, entry.status]));
  }, [slotAvailability]);

  const incomingProductionTokens = useMemo(() => {
    return getTotalProductionTokenSynced(watchedItems, productTokenByName);
  }, [watchedItems, productTokenByName]);

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
  const dbWillExceed = isTokenCapacityOverflow;

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
            deliveryMethod: effectiveDeliveryMethod,
            items: watchedItems,
            blockedDates,
            cutoffHour: canBackfillPastOrders ? 99 : cutoffHour,
            allowHistoricalBackfill:
              canBackfillPastOrders && isPastDate(dateKey),
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
    effectiveDeliveryMethod,
    watchedItems,
    blockedDates,
    cutoffHour,
    canBackfillPastOrders,
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
      const itemBasePrice = getItemBasePrice(productCatalog, item, {
        cookieAdditionalDesignUnitPrice: getCookieAdditionalDesignUnitPrice({
          addOnCatalog,
          item,
        }),
      });

      return {
        name: `${item.productName} (${item.size})`,
        quantity: resolveShippingParcelCount(item),
        weightGram: estimateOperationalWeightGram(item),
        value: Math.max(1000, Math.round(itemBasePrice)),
      };
    });
  }, [watchedItems, productCatalog, addOnCatalog]);

  const shippingWeightSummary = useMemo(() => {
    const rows = shippingItems.map((item, index) => {
      const qty = Math.max(1, Number(item.quantity) || 1);
      const totalGram = Math.max(100, Number(item.weightGram) || 100);
      const perPcsGram = Math.max(1, Math.round(totalGram / qty));

      return {
        key: `${item.name}-${index}`,
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
      totalValue: Math.max(
        1000,
        Math.round(basePrice + designAdjustmentTotal + addOnTotal),
      ),
    };
  }, [
    addOnTotal,
    basePrice,
    designAdjustmentTotal,
    primaryAddress?.addressLine,
    primaryAddress?.area,
    primaryAddress?.postalCode,
    shouldUseShippingEngine,
    shippingItems,
  ]);

  const shippingPayloadRef = useRef(shippingPayload);

  useEffect(() => {
    shippingPayloadRef.current = shippingPayload;
  }, [shippingPayload]);

  useEffect(() => {
    if (!hasHydratedDraftSnapshot) return;

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
          .sort(
            (a, b) =>
              getShippingQuoteDisplayPrice(a) - getShippingQuoteDisplayPrice(b),
          );
        setShippingQuotes(sortedQuotes);
        setSelectedShippingQuoteId((current) => {
          if (current && sortedQuotes.some((quote) => quote.id === current))
            return current;

          const matchedByServiceKey = sortedQuotes.find(
            (quote) =>
              getShippingQuoteServiceKey(quote) ===
              selectedShippingQuoteServiceKeyRef.current,
          );
          if (matchedByServiceKey) {
            return matchedByServiceKey.id;
          }

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
  }, [
    hasHydratedDraftSnapshot,
    manualCheckShippingTrigger,
    shippingPayload,
  ]);

  const onSubmit: SubmitHandler<BookingFormValues> = async (rawValues) => {
    const values =
      rawValues.deliveryMethod === effectiveDeliveryMethod
        ? rawValues
        : {
            ...rawValues,
            deliveryMethod: effectiveDeliveryMethod,
          };
    setSubmitError("");
    setSubmitSuccess("");
    setSubmitSuccessMeta(null);
    const isPreviewSubmit = composerStep === "preview";

    const skipSubmitConfirmation = skipSubmitConfirmationRef.current;
    if (skipSubmitConfirmation) {
      skipSubmitConfirmationRef.current = false;
    }

    const skipDuplicateTemplateWarning =
      skipDuplicateTemplateWarningRef.current;
    if (skipDuplicateTemplateWarning) {
      skipDuplicateTemplateWarningRef.current = false;
    }

    if (isCheckingShipping) {
      showSubmitFeedback(
        "Ongkir masih dihitung otomatis. Tunggu beberapa detik lalu submit ulang.",
      );
      return;
    }

    if (isFragileOrder && !isAllowedFragileOrderMethod) {
      showSubmitFeedback(
        `Produk ${fragileOrderReasons.join(", ")} hanya bisa ${FRAGILE_ORDER_ALLOWED_METHODS_TEXT}`,
      );
      return;
    }

    if (shouldUseShippingEngine && !selectedShippingQuote) {
      showSubmitFeedback(
        shippingFallbackMessage ||
          "Ongkir live belum tersedia. Lengkapi alamat/item lalu pilih layanan kurir.",
      );
      return;
    }

    if (isBlockedDate) {
      showSubmitFeedback(
        "Tanggal dipilih tidak tersedia. H-1 hanya bisa booking sampai jam 10:00 pagi atau tanggal sedang diblokir admin.",
      );
      return;
    }

    if (isCalendarDateInvalid) {
      showSubmitFeedback(
        calendarDateError || "Tanggal dipilih tidak tersedia.",
      );
      return;
    }

    const normalizedDeliveryDate = normalizeDateInput(values.deliveryDate);
    if (!normalizedDeliveryDate) {
      showSubmitFeedback("Format tanggal tidak valid. Gunakan YYYY-MM-DD.");
      return;
    }

    if (!canBackfillPastOrders && isPastDate(normalizedDeliveryDate)) {
      showSubmitFeedback("Tanggal sudah terlewat");
      return;
    }

    const incomingTokens = getTotalProductionTokenSynced(
      values.items,
      productTokenByName,
    );
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

      const status = getCalendarStatus(
        {
          usedToken: Number(payload.data.usedToken) || 0,
          maxToken:
            Number(payload.data.maxToken) || DAILY_PRODUCTION_TOKEN_LIMIT,
          date: normalizedDeliveryDate,
        },
        undefined,
        { blockedDates },
      );

      validatedUsedTokens = Number(payload.data.usedToken) || 0;
      validatedMaxTokens =
        Number(payload.data.maxToken) || DAILY_PRODUCTION_TOKEN_LIMIT;

      if (status === "FULL" && !isOwner && !isAdmin) {
        throw new Error("Tanggal sudah penuh");
      }

      if (!canBackfillPastOrders && status === "PAST") {
        throw new Error("Tanggal sudah terlewat");
      }

      if (
        !canBackfillPastOrders &&
        status === "CUTOFF" &&
        !isOwner &&
        !isAdmin
      ) {
        throw new Error("Pemesanan H-1 sudah ditutup (setelah jam 10 pagi)");
      }

      if (payload.data.isAvailable === false && !isOwner && !isAdmin) {
        throw new Error("Slot produksi sudah penuh");
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Gagal validasi kapasitas produksi.";
      // Temp: relax role check to unblock user if they are clearly the manager
      if (
        !isOwner &&
        !isAdmin &&
        !isRoleLoading &&
        message !== "Production capacity full"
      ) {
        showSubmitFeedback(message);
        return;
      }
      toast.warning(`Bypass Kapasitas: ${message}. Melanjutkan...`);
    } finally {
      setIsCapacityValidating(false);
    }

    const plannedTokens = validatedUsedTokens + incomingTokens;
    if (plannedTokens > validatedMaxTokens) {
      if (!isOwner && !isAdmin && !isRoleLoading) {
        showSubmitFeedback(
          `Token produksi harian terlampaui (${plannedTokens}/${validatedMaxTokens}). Pilih tanggal lain atau sederhanakan item difficulty tinggi.`,
        );
        return;
      }
      toast.warning(
        `Overload Produksi: ${plannedTokens}/${validatedMaxTokens}. Melanjutkan bypass...`,
      );
    }

    for (const item of values.items) {
      const quantity = Number(item.quantity) || 0;
      const quantityRule = getItemQuantityRule( // Panggil fungsi penentu aturan kuantitas item
        item as BookingItemInput, // Parameter pertama: data item ter-cast ke BookingItemInput
        productMinimumOrderByName, // Parameter kedua: kirim map minimal order dari DB
      ); // Akhir pemanggilan fungsi aturan kuantitas
      const isOutOfRange =
        quantity < quantityRule.min ||
        (typeof quantityRule.max === "number" && quantity > quantityRule.max);
      if (isOutOfRange) {
        const productLabel = item.productName || item.category || "Item";
        showSubmitFeedback(
          `${productLabel}: ${getQuantityRuleViolationMessage(quantityRule)}`,
        );
        return;
      }

      if (
        values.deliveryMethod === "ASSISTED_PAXEL" &&
        item.category === "Buket" &&
        isMediumVariantLabel(item.size || "")
      ) {
        showSubmitFeedback(
          "Untuk bouquet via Paxel, varian Medium tidak didukung. Pilih varian Large/XL.",
        );
        return;
      }

      if (item.category !== "Buket") continue;

      const bouquetType = detectBouquetTypeFromItem(item);
      if (!bouquetType) {
        showSubmitFeedback(
          "Tipe bouquet belum terbaca. Gunakan product Hand Bouquet atau Standing Bouquet.",
        );
        return;
      }

      if (!isValidBouquetQuantity(quantity, bouquetType)) {
        showSubmitFeedback(
          `${bouquetType === "HAND" ? "Hand" : "Standing"} bouquet wajib qty ${getBouquetQtyRangeLabel(bouquetType)} cookies.`,
        );
        return;
      }
    }

    const totalCustomCookieQty = values.items.reduce((sum, item) => {
      if (!isCustomCookieItem(item)) return sum;
      return sum + Math.max(0, Number(item.quantity) || 0);
    }, 0);

    const customCookieMinQty = values.items.reduce((maxMinQty, item) => {
      if (!isCustomCookieItem(item)) return maxMinQty;
      const dashboardName = normalizeTokenLookupKey(
        toDashboardProductNameFromItem(item as BookingItemInput),
      );
      const dbMinOrder = Math.max(
        0,
        Number(productMinimumOrderByName.get(dashboardName) ?? 0),
      );
      return Math.max(maxMinQty, dbMinOrder);
    }, 0);

    if (
      customCookieMinQty > 0 &&
      totalCustomCookieQty > 0 &&
      totalCustomCookieQty < customCookieMinQty
    ) {
      showSubmitFeedback(
        `Total Custom Cookies minimal ${customCookieMinQty} pcs. Saat ini ${totalCustomCookieQty} pcs.`,
      );
      return;
    }

    for (const item of values.items) {
      if (!isCustomCookieItem(item)) continue;
      const designCount = normalizeCookieDesignCount(item.designCount);
      if (!designCount) {
        const productLabel = item.productName || item.category || "Item";
        showSubmitFeedback(
          `${productLabel}: isi jumlah design cookies supaya surcharge design tambahan bisa dihitung otomatis.`,
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
          showSubmitFeedback(`${productLabel}: pilih maksimal 1 rasa.`);
          return;
        }
      }

      if (item.category === "Cupcakes") {
        const selectedCookieAddOnCount = (item.addOns ?? []).filter((id) =>
          isCupcakeCookieAddOnId(id),
        ).length;
        if (selectedCookieAddOnCount > 1) {
          const productLabel = item.productName || item.category || "Item";
          showSubmitFeedback(
            `${productLabel}: pilih maksimal 1 add-on cookie.`,
          );
          return;
        }
      }
    }

    if (
      referenceFilesChangedSinceParse ||
      referenceSyncStatus === "syncing" ||
      referenceSyncStatus === "failed"
    ) {
      pendingReferenceSyncActionRef.current = isPreviewSubmit
        ? "submit-booking"
        : "open-preview";

      if (
        referenceImageFiles.length > 0 &&
        !isParsingWhatsApp &&
        referenceSyncStatus !== "syncing"
      ) {
        if (autoParseTimeoutRef.current) {
          clearTimeout(autoParseTimeoutRef.current);
          autoParseTimeoutRef.current = null;
        }
        setReferenceSyncStatus("syncing");
        void importDraftRef.current?.({
          successMessage: null,
          navigateToPreview: false,
          suppressSuccessToast: true,
        });
      }

      toast.message(
        isPreviewSubmit
          ? "Perubahan referensi sedang disimpan. Booking akan dilanjutkan otomatis setelah sinkron selesai."
          : "Perubahan referensi sedang disimpan. Preview akan dibuka otomatis setelah sinkron selesai.",
      );
      return;
    }

    if (!isPreviewSubmit) {
      setShowSubmitConfirmation(false);
      pendingSubmitConfirmationRef.current = null;
      openPreviewPage();
      return;
    }

    const mappedItems: OrderItem[] = values.items.map((item, index) => {
      const bouquetType = detectBouquetTypeFromItem(item);
      const cookieAdditionalDesignUnitPrice =
        getCookieAdditionalDesignUnitPrice({
          addOnCatalog,
          item,
        });
      const itemBasePrice = getItemBasePrice(productCatalog, item, {
        cookieAdditionalDesignUnitPrice,
      });
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
      const normalizedAddOnPriceOverrides = normalizeAddOnPriceOverrides(
        item.addOnPriceOverrides,
      );
      const normalizedCustomAddOns = normalizeCustomAddOns(item.customAddOns);
      const darkButtercreamColors = normalizeDarkButtercreamColors(
        item.darkColorButtercreamColors ?? [],
      );
      const addOnTotalForItem = hasParsedRecapPrice
        ? 0
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
          }) *
            item.quantity +
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
          }) +
          getCustomAddOnTotal(normalizedCustomAddOns, item.quantity);
      const selectedFlavorOption = getFlavorOptionsForCategory(
        item.category,
      ).find((option) => (item.addOns ?? []).includes(option.id));
      const normalizedDesignCount = isCustomCookieItem(item)
        ? normalizeCookieDesignCount(item.designCount)
        : undefined;
      const normalizedAdditionalDesignCount = isCustomCookieItem(item)
        ? getCookieAdditionalDesignCountFromItem(item)
        : undefined;
      const cookieAdditionalDesignCharge =
        (normalizedAdditionalDesignCount ?? 0) *
        cookieAdditionalDesignUnitPrice;
      const parsedSubtotalWithDesignCharge =
        hasParsedRecapPrice && parsedSubtotal
          ? parsedSubtotal + cookieAdditionalDesignCharge
          : parsedSubtotal;
      const mergedItemNotes = [
        item.category === "Buket"
          ? removeBouquetStructuredFieldsFromNotes(item.notes ?? "")
          : (item.notes ?? ""),
        item.category === "Buket" &&
        (item.bouquetPaperColor ?? "").trim().length > 0
          ? `Warna kertas bouquet: ${(item.bouquetPaperColor ?? "").trim()}`
          : "",
        item.category === "Buket" && (item.ribbon ?? "").trim().length > 0
          ? `Ribbon: ${(item.ribbon ?? "").trim()}`
          : "",
        item.category === "Buket" && (item.flowerCount ?? "").trim().length > 0
          ? `Jumlah Bunga: ${(item.flowerCount ?? "").trim()}`
          : "",
        item.category === "Buket" && (item.flowerColor ?? "").trim().length > 0
          ? `Warna Bunga: ${(item.flowerColor ?? "").trim()}`
          : "",
        item.category === "Buket" && (item.ribbonColor ?? "").trim().length > 0
          ? `Warna Pita: ${(item.ribbonColor ?? "").trim()}`
          : "",
        item.category === "Buket" && (item.greetingCard ?? "").trim().length > 0
          ? `Kartu ucapan: ${(item.greetingCard ?? "").trim()}`
          : "",
        item.category === "Buket" &&
        normalizeBouquetPriceOverrideValue(item.bouquetPriceOverride) !==
          undefined
          ? `Harga buket override: ${formatCurrency(normalizeBouquetPriceOverrideValue(item.bouquetPriceOverride) ?? 0)}`
          : "",
        isCustomCookieSharingBoxItem(item) &&
        normalizeSharingBoxPriceOverrideValue(item.sharingBoxPriceOverride) !==
          undefined
          ? `Harga sharing box override: ${formatCurrency(normalizeSharingBoxPriceOverrideValue(item.sharingBoxPriceOverride) ?? 0)} / box`
          : "",
        isTwoTierCakeItem(item) ? getTwoTierSummaryLabel(item) : "",
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
        normalizedCustomAddOns.length > 0
          ? `Custom add-ons: ${normalizedCustomAddOns
              .map(
                (entry) =>
                  `${entry.label} (${formatCurrency(entry.price)} / item)`,
              )
              .join(", ")}`
          : "",
        (item.addOns ?? []).length > 0
          ? (() => {
              const adjusted = (item.addOns ?? [])
                .map((addonId) => {
                  const addon = categoryAddOns.find(
                    (entry) => entry.id === addonId,
                  );
                  if (!addon) return "";
                  const overridePrice = normalizedAddOnPriceOverrides[addonId];
                  if (
                    overridePrice === undefined ||
                    overridePrice === addon.price
                  )
                    return "";
                  return `${addon.label} (${formatCurrency(overridePrice)} / item)`;
                })
                .filter((line) => line.length > 0);
              return adjusted.length > 0
                ? `Harga add-on adjust: ${adjusted.join(", ")}`
                : "";
            })()
          : "",
        selectedFlavorOption
          ? `Rasa: ${selectedFlavorOption.label}${selectedFlavorOption.premium && selectedFlavorOption.price > 0 ? ` (Premium ${formatCurrency(selectedFlavorOption.price)})` : ""}`
          : "",
        item.category === "Cupcakes" &&
        (item.addOns ?? []).includes(DARK_COLOR_BUTTERCREAM_ADDON_ID)
          ? darkButtercreamColors.length > 0
            ? `Dark Color Buttercream: ${darkButtercreamColors.join(", ")} (+50k / item)`
            : "Dark Color Buttercream (+50k / item)"
          : "",
        hasParsedRecapPrice && parsedUnitPrice
          ? `Harga recap: ${formatCurrency(parsedUnitPrice)} / unit`
          : "",
        hasParsedRecapPrice && parsedSubtotal
          ? `Subtotal recap: ${formatCurrency(parsedSubtotal)}`
          : "",
        hasParsedRecapPrice && cookieAdditionalDesignCharge > 0
          ? `Surcharge design (recap): +${formatCurrency(cookieAdditionalDesignCharge)}`
          : "",
        normalizedDesignCount
          ? `Design cookies: ${normalizedDesignCount}${normalizedAdditionalDesignCount ? ` (extra ${normalizedAdditionalDesignCount} x ${formatCurrency(cookieAdditionalDesignUnitPrice)})` : ""}`
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
          item.category === "Cookies"
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
        customTokenPerUnit: resolveItemCustomTokenPerUnitSynced(
          item,
          productTokenByName,
        ),
        selectedPrice:
          item.category === "Buket"
            ? normalizeBouquetPriceOverrideValue(item.bouquetPriceOverride)
            : isCustomCookieSharingBoxItem(item)
              ? normalizeSharingBoxPriceOverrideValue(
                  item.sharingBoxPriceOverride,
                )
              : undefined,
        basePrice: itemBasePrice,
        productType:
          item.category === "Buket" ? ("BOUQUET" as const) : undefined,
        cookiePrice:
          item.category === "Buket"
            ? normalizeBouquetCookiePriceValue(item.cookiePrice)
            : undefined,
        designCount: normalizedDesignCount,
        additionalDesignCount: normalizedAdditionalDesignCount,
        bouquetType: bouquetType ?? undefined,
        bouquetCost: bouquetType
          ? getBouquetCostByType(bouquetType)
          : undefined,
        lineTotal: parsedSubtotalWithDesignCharge ?? itemBasePrice,
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
    const canonicalDeliveryMethodLabel = resolveDeliveryMethodLabel(
      effectiveDeliveryMethod,
    );
    const parsedPreviewWithPersistedReferences =
      restoreParsedPreviewReferenceImages({
        parsedPreview,
        persistedReferenceImages,
      });
    const normalizedParsedPreview = {
      ...((parsedPreviewWithPersistedReferences
        ? {
            ...parsedPreviewWithPersistedReferences,
            referenceImages: buildParsedReferenceImages({
              parsed: parsedPreviewWithPersistedReferences,
              requestedLabels: explicitRequestedImageLabels,
            }),
            requestedImageLabels: [
              ...(Array.isArray(
                parsedPreviewWithPersistedReferences.requestedImageLabels,
              )
                ? parsedPreviewWithPersistedReferences.requestedImageLabels
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
          }
        : {}) as Partial<ParsedWhatsAppOrder>),
      common: {
        ...(((parsedPreview?.common ?? {}) as Record<string, unknown>) || {}),
        deliveryMethod: canonicalDeliveryMethodLabel,
      },
    } satisfies Partial<ParsedWhatsAppOrder> as ParsedWhatsAppOrder;

    const submissionPayload: NewOrderInput = {
      customerName: values.customerName,
      customerPhone: values.phoneNumber,
      deliveryDate: normalizedDeliveryDate,
      deliverySlot: values.deliverySlot,
      deliveryMethod: effectiveDeliveryMethod,
      notes: [
        values.customNotes ?? "",
        Number(values.wholesaleDiscountPercent || 0) > 0
          ? `Wholesale Discount: ${Number(values.wholesaleDiscountPercent || 0)}% (-${formatCurrency(wholesaleDiscountAmount)})`
          : "",
        `Delivery Method: ${canonicalDeliveryMethodLabel}`,
        serviceCharge > 0 ? `Service Charge: ${serviceCharge}` : "",
        insuranceFee > 0 ? `Insurance Fee: ${insuranceFee}` : "",
      ]
        .filter((line) => line.trim().length > 0)
        .join("\n"),
      items: mappedItems,
      deliveryAddresses: mappedAddresses,
      basePrice,
      addOnTotal,
      deliveryFee,
      insuranceFee,
      manualAdjustment: Number(values.manualAdjustment || 0),
      totalPrice,
      downPaymentAmount,
      remainingBalance,
      paymentStatus: effectivePaymentStatus,
      sales_channel: values.sales_channel,
      dpPaidAmount: effectiveDpPaidAmount,
      finalPaidAmount: effectiveFinalPaidAmount,
      whatsAppParsedData: normalizedParsedPreview,
      imageUrl: normalizedParsedPreview?.imageUrl,
      imageUrls: normalizedParsedPreview?.uploadedImageUrls,
      referenceImages: normalizedParsedPreview?.referenceImages,
      shippingQuote: shouldUseShippingEngine ? selectedShippingQuote : null,
    };

    const predictedBookingCode = generateBookingCode(
      values.customerName,
      values.phoneNumber,
      normalizedDeliveryDate,
      getDailyBookingSequence(orders, normalizedDeliveryDate),
    );

    if (!skipDuplicateTemplateWarning && canWarnDuplicateTemplate) {
      const normalizedTemplate = normalizeDuplicateTemplateText(
        normalizedParsedPreview?.rawText,
      );
      const duplicateTemplateOrders = findOrdersWithDuplicateParsedTemplate(
        orders,
        normalizedTemplate,
      ).filter((match) => !isEditMode || match.order.id !== editOrderId);

      if (duplicateTemplateOrders.length > 0) {
        const hasSimilarTemplate = duplicateTemplateOrders.some(
          (match) => match.matchType === "similar",
        );
        pendingDuplicateSubmissionRef.current = values;
        setDuplicateTemplateWarning({
          templatePreview:
            normalizedTemplate.length > 220
              ? `${normalizedTemplate.slice(0, 220)}...`
              : normalizedTemplate,
          matches: duplicateTemplateOrders.slice(0, 6).map((entry) => ({
            id: entry.order.id,
            bookingLabel:
              entry.order.resi ||
              entry.order.bookingCode ||
              `Order ${String(entry.order.id).slice(0, 8)}`,
            customerName: entry.order.customerName || "Walk-in Customer",
            deliveryDateLabel: formatDuplicateWarningDate(
              entry.order.deliveryDate,
            ),
            similarityLabel: formatTemplateSimilarityLabel(
              entry.similarityScore,
              entry.matchType,
            ),
            matchType: entry.matchType,
          })),
        });
        toast.warning(
          hasSimilarTemplate
            ? "Template parse sama persis atau sangat mirip terdeteksi. Cek booking dulu atau lanjutkan jika memang order baru."
            : "Template parse yang sama terdeteksi. Cek booking dulu atau lanjutkan jika memang order baru.",
        );
        return;
      }
    }

    if (
      !skipSubmitConfirmation &&
      shouldRequireSubmitConfirmation &&
      isPreviewSubmit
    ) {
      pendingSubmitConfirmationRef.current = values;
      setShowSubmitConfirmation(true);
      return;
    }

    if (bookingCreateInFlightRef.current) {
      const message =
        "Submit booking sebelumnya masih diproses. Tunggu sampai selesai.";
      setSubmitError(message);
      toast.warning(message);
      return;
    }

    try {
      bookingCreateInFlightRef.current = true;
      setDuplicateTemplateWarning(null);
      pendingDuplicateSubmissionRef.current = null;
      const shouldRedirectToOrders =
        submitFlowSourceRef.current === "duplicate-warning";
      setIsBookingCreationInFlight(true);
      if (isEditMode) {
        if (!editOrderId) {
          throw new Error("Order ID tidak valid untuk edit booking.");
        }

        const updatedOrder = await updateOrder(editOrderId, {
          customerName: values.customerName,
          customerPhone: values.phoneNumber,
          deliveryDate: normalizedDeliveryDate,
          deliverySlot: values.deliverySlot,
          deliveryMethod: effectiveDeliveryMethod,
          notes: submissionPayload.notes,
          items: mappedItems,
          deliveryAddresses: mappedAddresses,
          deliveryFee,
          insuranceFee,
          manualAdjustment: Number(values.manualAdjustment || 0),
          dpPaidAmount: effectiveDpPaidAmount,
          finalPaidAmount: effectiveFinalPaidAmount,
          sales_channel: values.sales_channel,
        });
        setSubmitSuccess("Booking berhasil diperbarui.");
        setSubmitSuccessMeta({
          id: updatedOrder.id,
          bookingCode: updatedOrder.bookingCode || predictedBookingCode,
          submittedAt: new Date().toISOString(),
          phoneNumber: values.phoneNumber,
        });
        toast.success("Booking berhasil diperbarui.");
        router.push(`/bakery/bookings/${updatedOrder.id}`);
        router.refresh();
        return;
      }

      const newOrderId = await addOrder(submissionPayload);
      const phoneNumber = values.phoneNumber;
      resetBookingDraftState();
      setSubmitSuccess("Booking berhasil disimpan ke server.");
      setSubmitSuccessMeta({
        id: newOrderId,
        bookingCode: predictedBookingCode,
        submittedAt: new Date().toISOString(),
        phoneNumber,
      });

      if (shouldRedirectToOrders) {
        toast.success(
          "Booking berhasil dibuat dan sudah masuk orders. Mengarahkan ke daftar booking...",
        );
        window.setTimeout(() => {
          window.location.assign("/bakery/bookings");
        }, 800);
      }
    } catch (error) {
      const message =
        buildValidationFeedbackMessage(error) ||
        (error instanceof Error
          ? error.message
          : "Gagal menyimpan booking ke server.");
      showSubmitFeedback(message);
    } finally {
      bookingCreateInFlightRef.current = false;
      setIsBookingCreationInFlight(false);
    }
  };

  const onInvalidSubmit = (invalidErrors: unknown) => {
    showSubmitFeedback(
      buildValidationFeedbackMessage(invalidErrors) ||
        (findFirstFormErrorMessage(invalidErrors)
          ? `Masih ada field wajib yang belum lengkap: ${findFirstFormErrorMessage(invalidErrors)}`
          : "Masih ada field wajib yang belum lengkap. Cek bagian form yang bertanda merah.")
    );
  };
  const submitBookingForm = handleSubmit(onSubmit, onInvalidSubmit);

  useEffect(() => {
    const pendingAction = pendingReferenceSyncActionRef.current;
    if (!pendingAction) {
      return;
    }

    if (referenceSyncStatus === "failed") {
      pendingReferenceSyncActionRef.current = null;
      showSubmitFeedback(
        isEditMode
          ? "Perubahan referensi terbaru gagal disimpan otomatis. Coba klik Preview atau Simpan Perubahan lagi, atau gunakan Parse WhatsApp bila kendala berulang."
          : "Perubahan referensi terbaru gagal disimpan otomatis. Coba klik Preview/Create Booking lagi atau gunakan Parse WhatsApp bila kendala berulang.",
      );
      return;
    }

    if (
      referenceFilesChangedSinceParse ||
      isParsingWhatsApp ||
      referenceSyncStatus === "syncing"
    ) {
      return;
    }

    pendingReferenceSyncActionRef.current = null;
    void submitBookingForm();
  }, [
    isEditMode,
    isParsingWhatsApp,
    referenceFilesChangedSinceParse,
    referenceSyncStatus,
    showSubmitFeedback,
    submitBookingForm,
  ]);

  const continueDuplicateTemplateSubmission = () => {
    if (manualSubmitInFlightRef.current) return;

    const pendingValues = pendingDuplicateSubmissionRef.current;
    if (!pendingValues) {
      setDuplicateTemplateWarning(null);
      return;
    }

    setDuplicateTemplateWarning(null);
    pendingDuplicateSubmissionRef.current = null;
    skipSubmitConfirmationRef.current = true;
    skipDuplicateTemplateWarningRef.current = true;
    submitFlowSourceRef.current = "duplicate-warning";
    manualSubmitInFlightRef.current = true;
    setIsManualSubmitInFlight(true);
    void Promise.resolve(onSubmit(pendingValues)).finally(() => {
      manualSubmitInFlightRef.current = false;
      setIsManualSubmitInFlight(false);
      submitFlowSourceRef.current = "form";
    });
  };

  const confirmSubmitAfterReminder = () => {
    if (manualSubmitInFlightRef.current) return;

    const pendingValues = pendingSubmitConfirmationRef.current;
    if (!pendingValues) {
      setShowSubmitConfirmation(false);
      return;
    }

    setShowSubmitConfirmation(false);
    pendingSubmitConfirmationRef.current = null;
    skipSubmitConfirmationRef.current = true;
    submitFlowSourceRef.current = "submit-confirmation";
    manualSubmitInFlightRef.current = true;
    setIsManualSubmitInFlight(true);
    void Promise.resolve(onSubmit(pendingValues)).finally(() => {
      manualSubmitInFlightRef.current = false;
      setIsManualSubmitInFlight(false);
      submitFlowSourceRef.current = "form";
    });
  };

  const handleSendWhatsAppFromSuccess = async () => {
    if (!submitSuccessMeta) return;
    const { id, phoneNumber } = submitSuccessMeta;
    const preview = getCustomerMessagePreview(id);
    if (!preview) {
      toast.error("Gagal men-generate preview pesan.");
      return;
    }

    try {
      await navigator.clipboard.writeText(preview);
      toast.success("Rekap disalin ke clipboard.");

      let cleanPhone = (phoneNumber || "").replace(/\D/g, "");
      if (cleanPhone.startsWith("0")) {
        cleanPhone = "62" + cleanPhone.slice(1);
      } else if (!cleanPhone.startsWith("62") && cleanPhone.length > 0) {
        cleanPhone = "62" + cleanPhone;
      }

      const waLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(preview)}`;
      window.open(waLink, "_blank");
    } catch (err) {
      console.error("Failed to copy/send WA:", err);
      toast.error("Gagal menyalin rekap.");
    }
  };

  const closeSubmitConfirmationReminder = () => {
    setShowSubmitConfirmation(false);
    pendingSubmitConfirmationRef.current = null;
    skipSubmitConfirmationRef.current = false;
  };

  const closeDuplicateTemplateWarning = () => {
    setDuplicateTemplateWarning(null);
    pendingDuplicateSubmissionRef.current = null;
    skipDuplicateTemplateWarningRef.current = false;
  };

  const resetBookingDraftState = () => {
    if (autoParseTimeoutRef.current) {
      clearTimeout(autoParseTimeoutRef.current);
      autoParseTimeoutRef.current = null;
    }
    lastParsedReferenceSignatureRef.current = "";
    lastFailedAutoParseReferenceSignatureRef.current = "";
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(BOOKING_DRAFT_STORAGE_KEY);
    }
    reset();
    setComposerStep("input");
    setSubmitError("");
    setSubmitSuccess("");
    setSubmitSuccessMeta(null);
    setQuickPaste("");
    setSelectedOrderType("unknown");
    setShowOrderTypeSelector(false);
    setParsedPreview(null);
    setProductionPreviewImageUrl("");
    setDraftImported(false);
    setReferenceImageFiles([]);
    setPersistedReferenceImages([]);
    setReferenceFilesChangedSinceParse(false);
    setReferenceSyncStatus("idle");
    setReferenceImageLabelsInput("");
    setReferenceFileInputKey((current) => current + 1);
    setShippingQuotes([]);
    setSelectedShippingQuoteId("");
    selectedShippingQuoteServiceKeyRef.current = "";
    setShippingDistanceKm(null);
    setShippingDistanceSource(undefined);
    setShippingWarning("");
    setShowSubmitConfirmation(false);
    pendingSubmitConfirmationRef.current = null;
    pendingReferenceSyncActionRef.current = null;
    skipSubmitConfirmationRef.current = false;
    setDuplicateTemplateWarning(null);
    pendingDuplicateSubmissionRef.current = null;
    skipDuplicateTemplateWarningRef.current = false;
  };

  const openDetectedDuplicateBooking = () => {
    const targetOrderId = duplicateTemplateWarning?.matches[0]?.id;
    const targetUrl = targetOrderId
      ? `/bakery/bookings/${targetOrderId}`
      : "/bakery/bookings";

    window.open(targetUrl, "_blank", "noopener,noreferrer");
  };

  const toggleItemAddOn = (itemIndex: number, addonId: string) => {
    const current = watchedItems[itemIndex]?.addOns ?? [];
    const currentQuantities = normalizeAddOnQuantities(
      watchedItems[itemIndex]?.addOnQuantities,
    );
    const currentPriceOverrides = normalizeAddOnPriceOverrides(
      watchedItems[itemIndex]?.addOnPriceOverrides,
    );
    const isCupcakeCookieAddOn = isCupcakeCookieAddOnId(addonId);
    const currentWithoutCupcakeCookie = isCupcakeCookieAddOn
      ? current.filter((id) => !isCupcakeCookieAddOnId(id))
      : current;
    const isRemoving = current.includes(addonId);
    const next = isRemoving
      ? current.filter((id) => id !== addonId)
      : [...currentWithoutCupcakeCookie, addonId];
    clearParsedPricingOverride(itemIndex);
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

    if (isRemoving && currentPriceOverrides[addonId] !== undefined) {
      const nextOverrides = { ...currentPriceOverrides };
      delete nextOverrides[addonId];
      setValue(`items.${itemIndex}.addOnPriceOverrides`, nextOverrides, {
        shouldValidate: true,
      });
    }

    if (addonId === DARK_COLOR_BUTTERCREAM_ADDON_ID) {
      const nextOverrides = { ...currentPriceOverrides };
      delete nextOverrides[addonId];
      setValue(`items.${itemIndex}.addOnPriceOverrides`, nextOverrides, {
        shouldValidate: true,
      });

      const nextQuantities = { ...currentQuantities };
      delete nextQuantities[addonId];
      setValue(`items.${itemIndex}.addOnQuantities`, nextQuantities, {
        shouldValidate: true,
      });

      if (isRemoving) {
        setValue(`items.${itemIndex}.darkColorButtercreamColors`, [], {
          shouldValidate: true,
        });
      }
    }

    if (isCupcakeCookieAddOn) {
      const nextOverrides = { ...currentPriceOverrides };
      const nextQuantities = { ...currentQuantities };
      for (const id of CUPCAKE_COOKIE_ADDON_IDS) {
        delete nextOverrides[id];
        delete nextQuantities[id];
      }
      setValue(`items.${itemIndex}.addOnPriceOverrides`, nextOverrides, {
        shouldValidate: true,
      });
      setValue(`items.${itemIndex}.addOnQuantities`, nextQuantities, {
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
    clearParsedPricingOverride(itemIndex);

    setValue(
      `items.${itemIndex}.addOnQuantities`,
      {
        ...current,
        [addonId]: nextValue,
      },
      { shouldValidate: true },
    );
  };

  const setItemAddOnPriceOverride = (
    itemIndex: number,
    addonId: string,
    rawValue: string,
  ) => {
    if (addonId === DARK_COLOR_BUTTERCREAM_ADDON_ID) return;
    if (isBouquetFlowerAddOnId(addonId)) return;
    if (isCupcakeCookieAddOnId(addonId)) return;

    const current = normalizeAddOnPriceOverrides(
      watchedItems[itemIndex]?.addOnPriceOverrides,
    );
    const next = { ...current };
    const parsed = Number(rawValue);

    if (
      rawValue.trim().length === 0 ||
      !Number.isFinite(parsed) ||
      parsed < 0
    ) {
      delete next[addonId];
    } else {
      next[addonId] = Math.round(parsed);
    }

    clearParsedPricingOverride(itemIndex);
    setValue(`items.${itemIndex}.addOnPriceOverrides`, next, {
      shouldValidate: true,
    });
  };

  const addCustomAddOn = (itemIndex: number) => {
    const current = normalizeCustomAddOns(
      watchedItems[itemIndex]?.customAddOns,
    );
    clearParsedPricingOverride(itemIndex);
    setValue(
      `items.${itemIndex}.customAddOns`,
      [...current, { label: "Add-on Custom", price: 0 }],
      { shouldValidate: true },
    );
  };

  const removeCustomAddOn = (itemIndex: number, customIndex: number) => {
    const current = normalizeCustomAddOns(
      watchedItems[itemIndex]?.customAddOns,
    );
    clearParsedPricingOverride(itemIndex);
    setValue(
      `items.${itemIndex}.customAddOns`,
      current.filter((_, index) => index !== customIndex),
      { shouldValidate: true },
    );
  };

  const setCustomAddOnLabel = (
    itemIndex: number,
    customIndex: number,
    label: string,
  ) => {
    const current = normalizeCustomAddOns(
      watchedItems[itemIndex]?.customAddOns,
    );
    const next = current.map((entry, index) =>
      index === customIndex ? { ...entry, label } : entry,
    );
    clearParsedPricingOverride(itemIndex);
    setValue(`items.${itemIndex}.customAddOns`, next, {
      shouldValidate: true,
    });
  };

  const setCustomAddOnPrice = (
    itemIndex: number,
    customIndex: number,
    rawPrice: number,
  ) => {
    const current = normalizeCustomAddOns(
      watchedItems[itemIndex]?.customAddOns,
    );
    const price = Number.isFinite(rawPrice)
      ? Math.max(0, Math.round(rawPrice))
      : 0;
    const next = current.map((entry, index) =>
      index === customIndex ? { ...entry, price } : entry,
    );
    clearParsedPricingOverride(itemIndex);
    setValue(`items.${itemIndex}.customAddOns`, next, {
      shouldValidate: true,
    });
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

    clearParsedPricingOverride(itemIndex);
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

    const preparedReferenceImages = await prepareReferenceImagesForUpload(
      args.files ?? [],
    );

    for (const file of preparedReferenceImages.files) {
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
          ? "Gambar referensi masih terlalu besar untuk diproses. Kurangi jumlah gambar atau crop area penting saja."
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
    successMessage?: string | null;
    navigateToPreview?: boolean;
    suppressSuccessToast?: boolean;
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
    if (draftImported && referenceImageFiles.length > 0) {
      setReferenceSyncStatus("syncing");
    }
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
      if (draft.deliveryMethod) {
        setValue("deliveryMethod", draft.deliveryMethod, {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
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
            const parsedBouquetPriceOverride =
              normalized.category === "Buket"
                ? normalizeBouquetPriceOverrideValue(
                    (item as { bouquetPriceOverride?: unknown })
                      .bouquetPriceOverride,
                  )
                : undefined;
            const parsedSharingBoxPriceOverride =
              normalized.category === "Cookies" &&
              isCustomCookieSharingBoxItem({
                category: normalized.category,
                subcategory: normalized.subcategory,
                productName: normalized.productName,
              })
                ? normalizeSharingBoxPriceOverrideValue(
                    (item as { sharingBoxPriceOverride?: unknown })
                      .sharingBoxPriceOverride,
                  )
                : undefined;
            const parsedCookiePrice =
              normalized.category === "Buket"
                ? normalizeBouquetCookiePriceValue(item.cookiePrice)
                : undefined;
            const parsedTokenDifficulty =
              normalized.category === "Cookies"
                ? normalizeTokenDifficultyValue(
                    item.tokenDifficulty ?? "SIMPLE",
                  )
                : undefined;
            const rawItemNotes = String(item.notes ?? "");
            const parserProvidedCookieBreakdown =
              normalized.category === "Cookies"
                ? String(
                    (
                      item as {
                        cookieDifficultyBreakdown?: unknown;
                      }
                    ).cookieDifficultyBreakdown ?? "",
                  ).trim()
                : "";
            const explicitBouquetGreetingCard =
              normalized.category === "Buket"
                ? String(
                    (
                      item as {
                        greetingCard?: unknown;
                      }
                    ).greetingCard ?? "",
                  )
                    .trim()
                    .slice(0, 400)
                : "";
            const parsedBouquetGreetingCard =
              normalized.category === "Buket"
                ? extractBouquetGreetingCardFromNotes(rawItemNotes)
                : "";
            const explicitBouquetPaperColor =
              normalized.category === "Buket"
                ? String(
                    (
                      item as {
                        bouquetPaperColor?: unknown;
                      }
                    ).bouquetPaperColor ?? "",
                  )
                    .trim()
                    .slice(0, 200)
                : "";
            const explicitBouquetRibbon =
              normalized.category === "Buket"
                ? String(
                    (
                      item as {
                        ribbon?: unknown;
                      }
                    ).ribbon ?? "",
                  )
                    .trim()
                    .slice(0, 200)
                : "";
            const explicitBouquetFlowerCount =
              normalized.category === "Buket"
                ? String(
                    (
                      item as {
                        flowerCount?: unknown;
                      }
                    ).flowerCount ?? "",
                  )
                    .trim()
                    .slice(0, 200)
                : "";
            const explicitBouquetFlowerColor =
              normalized.category === "Buket"
                ? String(
                    (
                      item as {
                        flowerColor?: unknown;
                      }
                    ).flowerColor ?? "",
                  )
                    .trim()
                    .slice(0, 200)
                : "";
            const explicitBouquetRibbonColor =
              normalized.category === "Buket"
                ? String(
                    (
                      item as {
                        ribbonColor?: unknown;
                      }
                    ).ribbonColor ?? "",
                  )
                    .trim()
                    .slice(0, 200)
                : "";
            const parsedBouquetPaperColor =
              normalized.category === "Buket"
                ? extractBouquetPaperColorFromNotes(rawItemNotes)
                : "";
            const parsedBouquetRibbon =
              normalized.category === "Buket"
                ? extractBouquetRibbonFromNotes(rawItemNotes)
                : "";
            const parsedBouquetFlowerCount =
              normalized.category === "Buket"
                ? extractBouquetFlowerCountFromNotes(rawItemNotes)
                : "";
            const parsedBouquetFlowerColor =
              normalized.category === "Buket"
                ? extractBouquetFlowerColorFromNotes(rawItemNotes)
                : "";
            const parsedBouquetRibbonColor =
              normalized.category === "Buket"
                ? extractBouquetRibbonColorFromNotes(rawItemNotes)
                : "";
            const parsedCookieBreakdownRows =
              normalized.category === "Cookies"
                ? parseCookieDifficultyRows(
                    parserProvidedCookieBreakdown || rawItemNotes,
                  )
                : [];
            const parsedCookieBreakdown =
              parsedCookieBreakdownRows.length > 0
                ? formatCookieDifficultyRows(parsedCookieBreakdownRows)
                : "";
            const normalizedAddOnIds = Array.isArray(item.addOns)
              ? item.addOns
              : [];
            const normalizedAddOnQuantities = normalizeAddOnQuantities(
              (item as { addOnQuantities?: unknown }).addOnQuantities,
            );
            const inferredBouquetFlowerCount =
              normalized.category === "Buket"
                ? inferBouquetFlowerCountFromAddOns({
                    addOns: normalizedAddOnIds,
                    addOnQuantities: normalizedAddOnQuantities,
                  })
                : "";
            const cleanedItemNotes =
              normalized.category === "Cookies"
                ? removeCookieBreakdownFromNotes(rawItemNotes)
                : normalized.category === "Buket"
                  ? removeBouquetStructuredFieldsFromNotes(rawItemNotes)
                  : rawItemNotes;
            const normalizedQuantity = Number.isFinite(parsedQuantity)
              ? Math.max(1, Math.round(parsedQuantity))
              : 1;
            const inferredBouquetCookieFillQuantity =
              inferBouquetCookieFillQuantityFromText({
                category: normalized.category,
                subcategory: normalized.subcategory,
                productName: normalized.productName,
                size: normalized.size,
                notes: rawItemNotes,
              });
            const normalizedQuantityFinal =
              normalized.category === "Buket" &&
              normalizedQuantity <= 1 &&
              inferredBouquetCookieFillQuantity !== null
                ? inferredBouquetCookieFillQuantity
                : normalizedQuantity;
            const normalizedSize = resolveIndividualCupcakeSizeByQuantity({
              catalog: productCatalog,
              selection: normalized,
              quantity: normalizedQuantityFinal,
            });

            return {
              category: normalized.category,
              subcategory: normalized.subcategory,
              productName: normalized.productName,
              size: normalizedSize,
              quantity: normalizedQuantityFinal,
              tokenDifficulty: parsedTokenDifficulty,
              customTokenPerUnit: undefined,
              bouquetPriceOverride: parsedBouquetPriceOverride,
              sharingBoxPriceOverride: parsedSharingBoxPriceOverride,
              cookiePrice: parsedCookiePrice,
              designCount: normalizeCookieDesignCount(
                (item as { designCount?: unknown }).designCount,
              ),
              additionalDesignCount: normalizeCookieDesignCount(
                (item as { additionalDesignCount?: unknown })
                  .additionalDesignCount,
              ),
              addOns: normalizedAddOnIds,
              addOnQuantities: normalizedAddOnQuantities,
              addOnPriceOverrides: normalizeAddOnPriceOverrides(
                (item as { addOnPriceOverrides?: unknown }).addOnPriceOverrides,
              ),
              customAddOns: normalizeCustomAddOns(
                (item as { customAddOns?: unknown }).customAddOns,
              ),
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
              cookieDifficultyBreakdown: parsedCookieBreakdown || undefined,
              greetingCard:
                explicitBouquetGreetingCard || parsedBouquetGreetingCard || "",
              bouquetPaperColor:
                explicitBouquetPaperColor || parsedBouquetPaperColor || "",
              ribbon: explicitBouquetRibbon || parsedBouquetRibbon || "",
              flowerCount:
                explicitBouquetFlowerCount ||
                parsedBouquetFlowerCount ||
                inferredBouquetFlowerCount ||
                "",
              flowerColor:
                explicitBouquetFlowerColor || parsedBouquetFlowerColor || "",
              ribbonColor:
                explicitBouquetRibbonColor || parsedBouquetRibbonColor || "",
              notes: cleanedItemNotes,
            };
          },
        );
        replaceItems(normalizedItems);
        setValue("items", normalizedItems, { shouldValidate: true });
      }
      if (draft.deliveryAddresses?.length) {
        const normalizedAddresses: BookingFormInput["deliveryAddresses"] =
          draft.deliveryAddresses.map((address, index) => {
            const addressLine = String(address.addressLine || "").trim();
            const rawArea = String(address.area || "").trim();
            const inferredPostalCode =
              extractPostalCodeFromAddress(addressLine);
            const providedPostalCode = sanitizePostalCodeInput(
              String((address as { postalCode?: unknown }).postalCode ?? ""),
            );

            return {
              label: String(address.label || `Address ${index + 1}`),
              area: rawArea || inferAreaFromAddress(addressLine),
              postalCode: providedPostalCode || inferredPostalCode,
              addressLine,
            };
          });

        replaceAddresses(normalizedAddresses);
        setValue("deliveryAddresses", normalizedAddresses, {
          shouldValidate: true,
        });
      }

      const mergedRequestedImageLabels = mergeRequestedImageLabels(
        payload.parsed.requestedImageLabels,
        explicitRequestedImageLabels,
      );
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
      setPersistedReferenceImages(
        normalizePersistedReferenceImages(
          enrichedParsedPreview.referenceImages,
        ),
      );
      setReferenceImageLabelsInput(mergedRequestedImageLabels.join("\n"));
      setProductionPreviewImageUrl(payload.productionPreviewImageUrl ?? "");
      setDraftImported(true);
      setReferenceFilesChangedSinceParse(false);
      setReferenceSyncStatus("idle");
      lastParsedReferenceSignatureRef.current = buildReferenceInputSignature({
        files: referenceImageFiles,
        requestedLabels: mergedRequestedImageLabels,
      });
      lastFailedAutoParseReferenceSignatureRef.current = "";
      setShowOrderTypeSelector(false);
      if (override?.navigateToPreview !== false) {
        window.requestAnimationFrame(() => {
          openPreviewPage({
            parsedPreview: enrichedParsedPreview,
            persistedReferenceImages: normalizePersistedReferenceImages(
              enrichedParsedPreview.referenceImages,
            ),
            productionPreviewImageUrl: payload.productionPreviewImageUrl ?? "",
            draftImported: true,
            referenceImageLabelsInput: mergedRequestedImageLabels.join("\n"),
            referenceFilesChangedSinceParse: false,
          });
        });
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (!isEditMode) {
        saveBookingDraftSnapshot({
          composerStep,
          quickPaste,
          selectedOrderType,
          parsedPreview: enrichedParsedPreview,
          persistedReferenceImages: normalizePersistedReferenceImages(
            enrichedParsedPreview.referenceImages,
          ),
          productionPreviewImageUrl: payload.productionPreviewImageUrl ?? "",
          draftImported: true,
          referenceImageLabelsInput: mergedRequestedImageLabels.join("\n"),
          referenceFilesChangedSinceParse: false,
          shippingQuotes,
          selectedShippingQuoteId:
            selectedShippingQuoteIdRef.current || selectedShippingQuoteId,
          selectedShippingQuoteServiceKey:
            resolveSelectedShippingQuoteServiceKey(),
          shippingDistanceKm,
          shippingDistanceSource,
          shippingWarning,
          formValues: bookingSchema.parse(getValues()),
        });
      }

      if (payload.warnings?.length) {
        toast.warning(payload.warnings.join(" "));
      } else if (!override?.suppressSuccessToast) {
        toast.success(
          override?.successMessage ||
            "Data WA berhasil diparse dan di-autofill. Mohon review sebelum submit.",
        );
      }
    } catch (error) {
      setProductionPreviewImageUrl("");
      if (referenceImageFiles.length > 0) {
        setReferenceFilesChangedSinceParse(true);
        setReferenceSyncStatus("failed");
        lastFailedAutoParseReferenceSignatureRef.current =
          referenceInputSignature;
      } else {
        setReferenceSyncStatus("idle");
      }
      const message =
        error instanceof Error
          ? error.message
          : "Terjadi kendala saat parse WhatsApp.";
      toast.error(message);
    } finally {
      setIsParsingWhatsApp(false);
    }
  };
  importDraftRef.current = importDraft;

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

  useEffect(() => {
    if (!draftImported || !parsedPreview || isParsingWhatsApp) {
      return;
    }

    if (
      referenceInputSignature ===
      lastFailedAutoParseReferenceSignatureRef.current
    ) {
      return;
    }

    if (referenceInputSignature === lastParsedReferenceSignatureRef.current) {
      if (referenceFilesChangedSinceParse) {
        setReferenceFilesChangedSinceParse(false);
      }
      if (referenceSyncStatus !== "idle") {
        setReferenceSyncStatus("idle");
      }
      return;
    }

    if (autoParseTimeoutRef.current) {
      clearTimeout(autoParseTimeoutRef.current);
      autoParseTimeoutRef.current = null;
    }

    if (referenceImageFiles.length > 0) {
      setReferenceFilesChangedSinceParse(true);
      setReferenceSyncStatus("syncing");
      autoParseTimeoutRef.current = setTimeout(() => {
        autoParseTimeoutRef.current = null;
        void importDraftRef.current?.({
          successMessage: null,
          navigateToPreview: false,
          suppressSuccessToast: true,
        });
      }, 700);

      return () => {
        if (autoParseTimeoutRef.current) {
          clearTimeout(autoParseTimeoutRef.current);
          autoParseTimeoutRef.current = null;
        }
      };
    }

    const nextParsedPreview: ParsedWhatsAppOrder = {
      ...parsedPreview,
      referenceImages: buildParsedReferenceImages({
        parsed: parsedPreview,
        requestedLabels: normalizedReferenceImageLabels,
      }),
      requestedImageLabels: mergeRequestedImageLabels(
        parsedPreview.requestedImageLabels,
        normalizedReferenceImageLabels,
      ),
    };

    setParsedPreview(nextParsedPreview);
    setPersistedReferenceImages(
      normalizePersistedReferenceImages(nextParsedPreview.referenceImages),
    );
    setReferenceFilesChangedSinceParse(false);
    setReferenceSyncStatus("idle");
    lastParsedReferenceSignatureRef.current = referenceInputSignature;

    try {
      if (!isEditMode) {
        saveBookingDraftSnapshot({
          composerStep,
          quickPaste,
          selectedOrderType,
          parsedPreview: nextParsedPreview,
          persistedReferenceImages: normalizePersistedReferenceImages(
            nextParsedPreview.referenceImages,
          ),
          productionPreviewImageUrl,
          draftImported: true,
          referenceImageLabelsInput,
          referenceFilesChangedSinceParse: false,
          shippingQuotes,
          selectedShippingQuoteId:
            selectedShippingQuoteIdRef.current || selectedShippingQuoteId,
          selectedShippingQuoteServiceKey:
            resolveSelectedShippingQuoteServiceKey(),
          shippingDistanceKm,
          shippingDistanceSource,
          shippingWarning,
          formValues: bookingSchema.parse(getValues()),
        });
      }
    } catch {
      // Ignore draft snapshot sync until form reaches a valid shape again.
    }
  }, [
    composerStep,
    draftImported,
    getValues,
    isEditMode,
    isParsingWhatsApp,
    parsedPreview,
    productionPreviewImageUrl,
    quickPaste,
    referenceFilesChangedSinceParse,
    referenceSyncStatus,
    referenceImageFiles,
    referenceImageLabelsInput,
    referenceInputSignature,
    resolveSelectedShippingQuoteServiceKey,
    selectedOrderType,
    selectedShippingQuoteId,
    shippingDistanceKm,
    shippingDistanceSource,
    shippingQuotes,
    shippingWarning,
    normalizedReferenceImageLabels,
  ]);

  useEffect(() => {
    return () => {
      if (autoParseTimeoutRef.current) {
        clearTimeout(autoParseTimeoutRef.current);
      }
    };
  }, []);

  const submitFeedback = submitError ? (
    <div
      ref={submitFeedbackRef}
      role="alert"
      className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
    >
      <p className="font-semibold">
        {isEditMode
          ? "Perubahan booking belum bisa disimpan"
          : "Booking belum bisa dilanjutkan"}
      </p>
      <p className="mt-1 whitespace-pre-line">{submitError}</p>
    </div>
  ) : null;

  const activeParserLabel =
    selectedOrderType === "unknown"
      ? "Auto Detect"
      : WHATSAPP_ORDER_LABELS[selectedOrderType];
  const formHeading = isEditMode ? "Edit Booking" : "New Booking";
  const formSubheading = isEditMode
    ? "Perbarui detail booking lalu simpan perubahan"
    : "Paste rekap WA lalu klik Parse";
  const parserHint = isEditMode
    ? "Mode edit aktif. Parse ulang chat jika ingin overwrite detail booking dari recap WA."
    : "Default parser:";
  const draftReadyMessage = isEditMode
    ? "Draft berhasil di-auto populate. Cek ulang semua data sebelum menyimpan perubahan."
    : "Draft berhasil di-auto populate. Cek ulang semua data sebelum create booking.";
  const previewTitle = isEditMode
    ? "Preview Perubahan Booking"
    : "Preview Booking";
  const previewHiddenMessage = isEditMode
    ? "Preview perubahan booking disembunyikan di halaman ini. Untuk melihatnya, klik"
    : "Preview template produksi disembunyikan di halaman ini. Untuk melihatnya, klik";
  const referenceSyncMessage = isEditMode
    ? "Perubahan referensi sedang disimpan otomatis. Preview dan simpan perubahan akan memakai versi terbaru setelah sinkron selesai."
    : "Perubahan referensi sedang disimpan otomatis. Preview dan create booking akan memakai versi terbaru setelah sinkron selesai.";
  const referenceRetryMessage = isEditMode
    ? "Sinkron referensi otomatis sempat gagal. Sistem akan coba lagi saat Anda klik Preview atau Simpan Perubahan."
    : "Sinkron referensi otomatis sempat gagal. Sistem akan coba lagi saat Anda klik Preview atau Create Booking.";

  return (
    <form onSubmit={submitBookingForm} className="space-y-6">
      {composerStep === "input" ? (
        <>
          <Card className="overflow-hidden rounded-[32px] border-[var(--crumbella-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(250,244,237,0.95)_100%)] shadow-[0_24px_40px_-30px_rgba(30,18,10,0.5)]">
            <CardHeader className="space-y-4 border-b border-[var(--crumbella-border)] px-5 pb-4 pt-5 sm:px-6">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--crumbella-border)] bg-white text-[var(--crumbella-primary)] shadow-[0_10px_18px_-16px_rgba(30,18,10,0.8)]">
                    <ArrowLeft className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-3xl font-semibold leading-none text-[var(--foreground)]">
                      {formHeading}
                    </p>
                    <p className="text-sm text-[var(--crumbella-muted)]">
                      {formSubheading}
                    </p>
                  </div>
                </div>
                <div className="rounded-full border border-[#d9e7ca] bg-[#f2faeb] px-3 py-1 text-[11px] font-semibold text-[#64833e]">
                  {selectedOrderType === "unknown"
                    ? "✨ Auto Detect"
                    : WHATSAPP_ORDER_LABELS[selectedOrderType]}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 rounded-full border-[var(--crumbella-border)] px-3 text-[11px] text-[var(--crumbella-primary)]"
                  onClick={() =>
                    setShowOrderTypeSelector((current) => !current)
                  }
                >
                  {showOrderTypeSelector
                    ? "Sembunyikan Jenis Order"
                    : "Ubah Jenis Order"}
                </Button>
                {selectedOrderType !== "unknown" && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 rounded-full border-[var(--crumbella-border)] px-3 text-[11px] text-[var(--crumbella-muted)]"
                    onClick={() => {
                      setSelectedOrderType("unknown");
                      setShowOrderTypeSelector(false);
                    }}
                  >
                    Kembali ke Auto Detect
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
              <div className="rounded-[24px] border border-[var(--crumbella-border)] bg-[#fff8f1] px-4 py-3 text-xs text-[var(--crumbella-primary)]">
                {isEditMode ? <p>{parserHint}</p> : null}
                {!isEditMode ? (
                <p>
                  Default parser:{" "}
                  <span className="font-semibold">✨ Auto Detect</span>. Cukup
                  paste chat lalu klik Parse WhatsApp.
                </p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-indigo-200 bg-white px-2 py-1 font-semibold text-indigo-700">
                    Mode aktif: {activeParserLabel}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-7 border-indigo-200 px-2 text-[11px] text-indigo-700 hover:bg-indigo-100"
                    onClick={() =>
                      setShowOrderTypeSelector((current) => !current)
                    }
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
                <label className="grid gap-2 text-sm font-medium text-[var(--foreground)]">
                  Jenis Order (Override)
                  <Select
                    value={selectedOrderType}
                    onChange={(event) =>
                      setSelectedOrderType(
                        event.target.value as ParserOrderType,
                      )
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
                placeholder={
                  "Nama: Adina\nNo HP: 0811xxxxxxx\nProduk: Real Cake + 20 cookies\nTema: Mario\nDelivery: 8 April 2026 jam 10.00\nMetode: Pickup"
                }
                className="min-h-32 rounded-[20px] border-[1.5px] border-dashed border-[#e6cfbc] bg-[#fdf7f0] px-4 py-3 text-sm leading-7 text-[var(--foreground)] placeholder:text-[#c58a61]"
              />

              <div className="grid gap-4 rounded-[24px] border border-[var(--crumbella-border)] bg-white p-4 shadow-[0_14px_24px_-24px_rgba(30,18,10,0.6)]">
                <div className="flex items-start justify-between gap-3 border-b border-[var(--crumbella-border)] pb-3">
                  <div>
                    <p className="text-xl font-semibold text-[var(--foreground)]">
                      🎨 Gambar Referensi
                    </p>
                    <p className="mt-1 text-sm text-[var(--crumbella-muted)]">
                      Upload gambar desain customer, notes opsional
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[var(--crumbella-border)] bg-[#fdf7f0] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)]">
                    {effectiveReferenceImageCount} gambar
                  </div>
                </div>
                <label className="grid gap-2 text-sm font-medium text-[var(--foreground)]">
                  Gambar Referensi Customer
                  <Input
                    key={referenceFileInputKey}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(event) => {
                      setReferenceImageFiles(
                        Array.from(event.target.files ?? []),
                      );
                      setReferenceFilesChangedSinceParse(draftImported);
                      if (draftImported) {
                        setReferenceSyncStatus("syncing");
                      } else {
                        setReferenceSyncStatus("idle");
                      }
                    }}
                  />
                  <span className="text-xs font-normal text-[var(--crumbella-muted)]">
                    Upload gambar yang dipilih customer. Bisa satu gambar crop
                    per desain, atau satu sheet gambar bertanda merah. Jika file
                    diubah, klik Parse WhatsApp lagi supaya referensinya
                    ter-upload. File besar akan diperkecil otomatis sebelum
                    diproses.
                  </span>
                </label>

                <label className="grid gap-2 text-sm font-medium text-[var(--foreground)]">
                  Label Desain per Gambar
                  <Textarea
                    value={referenceImageLabelsInput}
                    onChange={(event) => {
                      setReferenceImageLabelsInput(event.target.value);
                      if (draftImported) {
                        setReferenceFilesChangedSinceParse(true);
                        setReferenceSyncStatus("idle");
                      }
                    }}
                    placeholder={
                      "Opsional. Isi satu label per baris sesuai urutan upload.\nContoh:\nPikachu\nBulbasaur\nPiplup"
                    }
                    className="min-h-24 rounded-[18px] border-[#e6cfbc] bg-[#fdf7f0]"
                  />
                  <span className="text-xs font-normal text-[var(--crumbella-muted)]">
                    Dipakai untuk mencocokkan gambar ke slot/template produk.
                  </span>
                </label>

                {referenceImageFiles.length > 0 ? (
                  <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
                    {referenceImageFiles.length} gambar siap dipakai:{" "}
                    {referenceImageFiles.map((file) => file.name).join(", ")}
                  </div>
                ) : effectiveReferenceImages.length > 0 ? (
                  <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
                    {effectiveReferenceImages.length} gambar tersimpan dari
                    parse sebelumnya.
                  </div>
                ) : null}

                {referenceImageFiles.length > 0 &&
                  draftImported &&
                  referenceSyncStatus === "syncing" && (
                    <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-700">
                      {referenceSyncMessage}
                    </div>
                  )}

                {referenceImageFiles.length > 0 &&
                  draftImported &&
                  referenceSyncStatus === "failed" && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      {referenceRetryMessage}
                    </div>
                  )}
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  className="h-11 rounded-2xl bg-[#2c160d] px-4 text-sm font-semibold text-white hover:bg-[#422318]"
                  onClick={() => void importDraft()}
                  disabled={isParsingWhatsApp}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  {isParsingWhatsApp
                    ? referenceSyncStatus === "syncing"
                      ? "Menyimpan Referensi..."
                      : "Parsing & Preview..."
                    : referenceFilesChangedSinceParse || draftImported
                      ? "Parse Ulang WhatsApp"
                      : "Parse WhatsApp"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-2xl border-[var(--crumbella-border)] px-4 text-sm text-[var(--foreground)]"
                  onClick={fillManualTemplate}
                >
                  📝 Isi Manual
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-2xl border-[var(--crumbella-border)] px-4 text-sm text-[var(--crumbella-muted)]"
                  onClick={() => {
                    setQuickPaste("");
                    setSelectedOrderType("unknown");
                    setShowOrderTypeSelector(false);
                    setParsedPreview(null);
                    setProductionPreviewImageUrl("");
                    setDraftImported(false);
                    setReferenceImageFiles([]);
                    setPersistedReferenceImages([]);
                    setReferenceFilesChangedSinceParse(false);
                    setReferenceSyncStatus("idle");
                    setReferenceImageLabelsInput("");
                    setReferenceFileInputKey((current) => current + 1);
                    pendingReferenceSyncActionRef.current = null;
                    lastParsedReferenceSignatureRef.current = "";
                    lastFailedAutoParseReferenceSignatureRef.current = "";
                  }}
                >
                  🧹 Clear
                </Button>
              </div>

              {draftImported && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  {draftReadyMessage}
                </div>
              )}

              {(productionPreviewImageUrl ||
                previewReferenceImages.some((image) => image.url)) && (
                <div className="rounded-2xl border border-dashed border-[var(--crumbella-border)] bg-white/70 px-4 py-3 text-center text-xs text-[var(--crumbella-muted)]">
                  {previewHiddenMessage}{" "}
                  <span className="font-semibold">{previewTitle}</span> di atas
                  Price Summary.
                </div>
              )}

              <div className="px-1 pt-1">
                <Button
                  type="button"
                  className="h-14 w-full rounded-[18px] bg-[var(--crumbella-accent)] text-base font-semibold text-white hover:bg-[var(--crumbella-accent-strong)]"
                  disabled={isParsingWhatsApp}
                  onClick={() => {
                    if (!parsedPreview) {
                      toast.error(
                        "Pastikan teks sudah di-parse sebelum lanjut ke preview.",
                      );
                      return;
                    }
                    openPreviewPage();
                  }}
                >
                  👀 Lihat Preview
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
                <p className="mt-2 text-center text-xs text-[var(--crumbella-muted)]">
                  Pastikan teks sudah di-parse sebelum lanjut
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
            <Card className="rounded-xl shadow-sm">
              <CardHeader className="p-6 pb-2">
                <CardTitle>Booking Details</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-6 px-6 pb-6 pt-0">
                <div>
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
                      {deliveryDate && calendarDateNotice ? (
                        <span className="text-xs font-medium text-amber-700">
                          {calendarDateNotice}
                        </span>
                      ) : null}
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                          Kalender Libur
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {blockedDates.map((blockedDate) => {
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
                          const status =
                            slotStatusByTime.get(slot) ?? "AVAILABLE";
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
                      Tanggal tidak tersedia (libur admin atau cutoff H-1 jam
                      10:00 sudah lewat).
                    </div>
                  )}

                  {deliveryDate && (
                    <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Slot Availability ({deliveryDate}) - {slotProfileLabel}{" "}
                        Limit {slotLimitPerHour}/hour
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
                        Capacity Check ({deliveryDate})
                      </p>
                      {/* ── Smart Date Recommendations ── */}
                      {shouldShowDateRecommendations && (
                        <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2 text-xs">
                          <p className="font-semibold text-rose-600">
                            {dbWillExceed
                              ? "Kapasitas tidak mencukupi untuk tanggal ini"
                              : calendarDateError ||
                                "Tanggal dipilih tidak tersedia"}
                          </p>

                          {isRecommendationLoading ? (
                            <p className="mt-1 text-indigo-500">
                              Mencari tanggal…
                            </p>
                          ) : suggestedDates.length > 0 ? (
                            <>
                              <p className="mt-1 font-medium text-indigo-700">
                                Tanggal tersedia:
                              </p>
                              <div className="mt-1.5 flex flex-wrap gap-2">
                                {suggestedDates.map(
                                  ({ dateKey, remaining }) => (
                                    <button
                                      key={dateKey}
                                      type="button"
                                      onClick={() =>
                                        handleSuggestionClick(dateKey)
                                      }
                                      className="rounded-md border border-indigo-300 bg-white px-2 py-1 font-medium text-indigo-700 shadow-[0_0_0_0_rgba(99,102,241,0.35)] transition-all duration-300 hover:-translate-y-0.5 hover:border-indigo-500 hover:bg-indigo-100 hover:shadow-[0_0_0_4px_rgba(99,102,241,0.18)]"
                                      title={`Sisa kapasitas: ${remaining} token`}
                                    >
                                      {formatIsoDateToIdLabel(dateKey)}
                                      <span className="ml-1 text-indigo-400">
                                        ({remaining} sisa)
                                      </span>
                                    </button>
                                  ),
                                )}
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
                            nextDefault.category === "Cookies"
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
                              bouquetPriceOverride: undefined,
                              sharingBoxPriceOverride: undefined,
                              cookiePrice: undefined,
                              addOns: [],
                              addOnQuantities: {},
                              addOnPriceOverrides: {},
                              customAddOns: [],
                              greetingCard: "",
                              bouquetPaperColor: "",
                              ribbon: "",
                              flowerCount: "",
                              flowerColor: "",
                              ribbonColor: "",
                              notes: "",
                            }) ?? 1;

                          // Check for identical items
                          const newItem = {
                            category: nextDefault.category,
                            subcategory: nextDefault.subcategory,
                            productName: nextDefault.productName,
                            size: nextDefault.size,
                            quantity: autoQuantity,
                            tokenDifficulty: nextTokenDifficulty,
                          };

                          const isDuplicate = watchedItems?.some(
                            (item) =>
                              item.category === newItem.category &&
                              item.subcategory === newItem.subcategory &&
                              item.productName === newItem.productName &&
                              item.size === newItem.size &&
                              item.quantity === newItem.quantity,
                          );

                          if (isDuplicate) {
                            toast.warning(
                              "Item identik sudah ada di daftar pesanan. Silakan ubah quantity item yang sudah ada atau gunakan item berbeda.",
                              { duration: 4000 },
                            );
                            return;
                          }

                          appendItem({
                            category: nextDefault.category,
                            subcategory: nextDefault.subcategory,
                            productName: nextDefault.productName,
                            size: nextDefault.size,
                            quantity: autoQuantity,
                            tokenDifficulty: nextTokenDifficulty,
                            customTokenPerUnit: undefined,
                            bouquetPriceOverride: undefined,
                            sharingBoxPriceOverride: undefined,
                            cookiePrice: undefined,
                            addOns: [],
                            addOnQuantities: {},
                            addOnPriceOverrides: {},
                            customAddOns: [],
                            darkColorButtercreamColors: [],
                            parsedUnitPrice: undefined,
                            parsedSubtotal: undefined,
                            pricingSource: undefined,
                            greetingCard: "",
                            bouquetPaperColor: "",
                            ribbon: "",
                            flowerCount: "",
                            flowerColor: "",
                            ribbonColor: "",
                            notes: "",
                          });
                        }}
                      >
                        <Plus size={14} />
                        Add Item
                      </Button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-700">
                        Custom: {orderItemGroupingSummary.customCount}
                      </span>
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">
                        Seasonal/Event: {orderItemGroupingSummary.seasonalCount}
                      </span>
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
                          (entry) =>
                            entry.category === normalizedSelection.category,
                        );
                        const subcategories = categoryData?.subcategories ?? [];
                        const subcategoryData =
                          subcategories.find(
                            (entry) =>
                              entry.name === normalizedSelection.subcategory,
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
                        const premiumFlavorSurcharges = premiumFlavorOptions
                          .map((option) => option.price)
                          .filter((price) => price > 0);
                        const premiumFlavorMinSurcharge =
                          premiumFlavorSurcharges.length > 0
                            ? Math.min(...premiumFlavorSurcharges)
                            : 0;
                        const premiumFlavorMaxSurcharge =
                          premiumFlavorSurcharges.length > 0
                            ? Math.max(...premiumFlavorSurcharges)
                            : 0;
                        const flavorGuideText =
                          normalizedSelection.category === "Cake"
                            ? `Cake flavor: ${regularFlavorOptions.length} regular + ${premiumFlavorOptions.length} premium. Pilih 1 rasa per item cake.${premiumFlavorMaxSurcharge > 0 ? ` Premium surcharge ${premiumFlavorMinSurcharge === premiumFlavorMaxSurcharge ? formatCurrency(premiumFlavorMaxSurcharge) : `${formatCurrency(premiumFlavorMinSurcharge)} - ${formatCurrency(premiumFlavorMaxSurcharge)}`} / cake.` : ""}`
                            : "Cupcake flavor: pilih 1 rasa untuk item cupcakes ini.";
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
                          bouquetPriceOverride:
                            Number(item?.bouquetPriceOverride) > 0
                              ? Number(item?.bouquetPriceOverride)
                              : undefined,
                          sharingBoxPriceOverride:
                            Number(item?.sharingBoxPriceOverride) > 0
                              ? Number(item?.sharingBoxPriceOverride)
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
                        const isBouquet =
                          normalizedSelection.category === "Buket";
                        const isCupcakes =
                          normalizedSelection.category === "Cupcakes";
                        const isCookies =
                          normalizedSelection.category === "Cookies";
                        const isCustomCookiesItem =
                          isCookies && isCustomCookieItem(bouquetProbeItem);
                        const itemGroupLabel = getBookingItemGroupLabel({
                          category: normalizedSelection.category,
                          subcategory: normalizedSelection.subcategory,
                          productName: normalizedSelection.productName,
                          size: normalizedSelection.size,
                          quantity: Number(item?.quantity) || 0,
                        });
                        const isSeasonalEventItem =
                          itemGroupLabel === "SEASONAL_EVENT";
                        const isCustomCookieSharingBox =
                          isCookies &&
                          isCustomCookieSharingBoxItem(bouquetProbeItem);
                        const isTwoTierCake =
                          isTwoTierCakeItem(bouquetProbeItem);
                        const allowedVariants =
                          effectiveDeliveryMethod === "ASSISTED_PAXEL" &&
                          isBouquet
                            ? variants.filter(
                                (variant) =>
                                  !isMediumVariantLabel(variant.label),
                              )
                            : variants;
                        const displayVariants =
                          allowedVariants.length > 0
                            ? allowedVariants
                            : variants;
                        const supportsDifficulty = isCookies;
                        const bouquetLineTotal = getBouquetLineTotal(
                          productCatalog,
                          bouquetProbeItem,
                        );
                        const itemGrabCarOnly =
                          isGrabCarOnlyItem(bouquetProbeItem);
                        const quantityRule = // Aturan kuantitas untuk preview item saat rendering UI
                          getItemQuantityRule( // Panggil fungsi lokal penentu aturan kuantitas
                            bouquetProbeItem, // Parameter pertama: objek item sementara (bouquetProbeItem)
                            productMinimumOrderByName, // Parameter kedua: map state minimal order dari DB
                          ); // Akhir pemanggilan fungsi aturan kuantitas
                        const itemTokenPreview = getItemProductionTokenSynced(
                          bouquetProbeItem,
                          productTokenByName,
                        );
                        const bouquetPriceOverride = isBouquet
                          ? normalizeBouquetPriceOverrideValue(
                              item?.bouquetPriceOverride,
                            )
                          : undefined;
                        const hasParsedRecapPrice =
                          hasParsedPricingOverride(item);
                        const parsedUnitPrice =
                          getParsedUnitPriceOverride(item);
                        const parsedSubtotal = getParsedSubtotalOverride(item);
                        const sharingBoxUnitPriceOverride =
                          isCustomCookieSharingBox
                            ? normalizeSharingBoxPriceOverrideValue(
                                item?.sharingBoxPriceOverride,
                              )
                            : undefined;
                        const cookieDifficultyBreakdown =
                          extractCookieDifficultyBreakdown(item);
                        const cookieDifficultyRowsFromNotes =
                          parseCookieDifficultyRows(
                            String(cookieDifficultyBreakdown || ""),
                          );
                        const cookieDifficultyRows: CookieDifficultyRow[] =
                          cookieDifficultyRowsFromNotes.length > 0
                            ? cookieDifficultyRowsFromNotes
                            : [
                                {
                                  difficulty: normalizeTokenDifficultyValue(
                                    item?.tokenDifficulty || "SIMPLE",
                                  ),
                                  quantity: Math.max(
                                    1,
                                    Number(item?.quantity) || 1,
                                  ),
                                },
                              ];
                        const hasCustomTokenOverride =
                          Number(item?.customTokenPerUnit) > 0;
                        const quantityError = errors.items?.[index]?.quantity
                          ?.message as string | undefined;
                        const hasDarkColorButtercream =
                          isCupcakes &&
                          (item?.addOns?.includes(
                            DARK_COLOR_BUTTERCREAM_ADDON_ID,
                          ) ??
                            false);
                        const cookieCatalogMode = resolveCookieCatalogMode({
                          category: normalizedSelection.category,
                          subcategory: normalizedSelection.subcategory,
                        });
                        const selectedDarkButtercreamColors =
                          normalizeDarkButtercreamColors(
                            item?.darkColorButtercreamColors ?? [],
                          );
                        const hasMultipleSubcategories =
                          subcategories.length > 1;
                        const hasMultipleProducts = products.length > 1;
                        const hasMultipleVariants = displayVariants.length > 1;
                        const quantityValue = Number(item?.quantity) || 0;
                        const normalizedAddOnQuantities =
                          normalizeAddOnQuantities(item?.addOnQuantities);
                        const normalizedAddOnPriceOverrides =
                          normalizeAddOnPriceOverrides(
                            item?.addOnPriceOverrides,
                          );
                        const customAddOns = normalizeCustomAddOns(
                          item?.customAddOns,
                        );
                        const selectedNonFlavorAddOns = nonFlavorAddOns.filter(
                          (addon) => item?.addOns?.includes(addon.id) ?? false,
                        );
                        // Separate flowers from other add-ons for proper pricing calculation
                        const selectedFlowerAddOns =
                          selectedNonFlavorAddOns.filter((addon) =>
                            isBouquetFlowerAddOnId(addon.id),
                          );
                        const selectedOtherAddOns =
                          selectedNonFlavorAddOns.filter(
                            (addon) => !isBouquetFlowerAddOnId(addon.id),
                          );

                        // Calculate flower add-ons (fixed, no quantity multiplier)
                        const selectedFlowerAddOnTotal =
                          selectedFlowerAddOns.reduce((sum, addon) => {
                            const overriddenPrice =
                              normalizedAddOnPriceOverrides[addon.id];
                            const unitPrice =
                              overriddenPrice !== undefined
                                ? overriddenPrice
                                : (getBouquetFlowerAddOnUnitPrice({
                                    addonId: addon.id,
                                    bouquetType,
                                  }) ?? addon.price);
                            return sum + unitPrice;
                          }, 0);

                        // Calculate other add-ons. Order-level add-ons like bubblewrap
                        // should not be multiplied by the cookie/cake quantity.
                        const selectedOtherAddOnTotal =
                          selectedOtherAddOns.reduce((sum, addon) => {
                            if (isOrderLevelAddOnId(addon.id)) {
                              const overriddenPrice =
                                normalizedAddOnPriceOverrides[addon.id];
                              const unitPrice = resolveBubblewrapUnitPrice({
                                category: normalizedSelection.category,
                                addonId: addon.id,
                                defaultPrice:
                                  overriddenPrice !== undefined
                                    ? overriddenPrice
                                    : addon.price,
                                itemSelection: {
                                  category: normalizedSelection.category,
                                  subcategory:
                                    normalizedSelection.subcategory,
                                  productName:
                                    normalizedSelection.productName,
                                  size: normalizedSelection.size,
                                },
                              });
                              return sum + unitPrice;
                            }
                            const multiplier = getAddOnUnitMultiplier({
                              category: normalizedSelection.category,
                              addonId: addon.id,
                              addOnQuantities: normalizedAddOnQuantities,
                            });
                            const overriddenPrice =
                              normalizedAddOnPriceOverrides[addon.id];
                            const unitPrice =
                              overriddenPrice !== undefined
                                ? overriddenPrice
                                : addon.price;
                            return sum + unitPrice * multiplier;
                          }, 0);

                        const selectedNonFlavorAddOnTotal =
                          selectedFlowerAddOnTotal + selectedOtherAddOnTotal;

                        // Calculate total add-ons properly handling flowers
                        const flowerAddOnsPrice = (item?.addOns ?? [])
                          .filter((id) => isBouquetFlowerAddOnId(id))
                          .reduce((sum, addonId) => {
                            const addon = addOns.find((a) => a.id === addonId);
                            if (!addon) return sum;
                            const overriddenPrice =
                              normalizedAddOnPriceOverrides[addonId];
                            const unitPrice =
                              overriddenPrice !== undefined
                                ? overriddenPrice
                                : (getBouquetFlowerAddOnUnitPrice({
                                    addonId,
                                    bouquetType,
                                  }) ?? addon.price);
                            return sum + unitPrice;
                          }, 0);

                        const nonFlowerAddOnsPrice =
                          calculatePerUnitAddOnPrice({
                            category: normalizedSelection.category,
                            bouquetType,
                            selectedAddOnIds: (item?.addOns ?? []).filter(
                              (id) => !isBouquetFlowerAddOnId(id),
                            ),
                            addOnQuantities: normalizedAddOnQuantities,
                            addOnPriceOverrides: normalizedAddOnPriceOverrides,
                            addOnCatalogEntries: addOns,
                            itemSelection: {
                              category: normalizedSelection.category,
                              subcategory: normalizedSelection.subcategory,
                              productName: normalizedSelection.productName,
                              size: normalizedSelection.size,
                            },
                          }) *
                            Math.max(1, quantityValue) +
                          calculateOrderLevelAddOnPrice({
                            category: normalizedSelection.category,
                            bouquetType,
                            selectedAddOnIds: (item?.addOns ?? []).filter(
                              (id) => !isBouquetFlowerAddOnId(id),
                            ),
                            addOnQuantities: normalizedAddOnQuantities,
                            addOnPriceOverrides: normalizedAddOnPriceOverrides,
                            addOnCatalogEntries: addOns,
                            itemSelection: {
                              category: normalizedSelection.category,
                              subcategory: normalizedSelection.subcategory,
                              productName: normalizedSelection.productName,
                              size: normalizedSelection.size,
                            },
                          });

                        const selectedAllAddOnTotal =
                          flowerAddOnsPrice + nonFlowerAddOnsPrice;
                        const customAddOnTotal = getCustomAddOnTotal(
                          customAddOns,
                          quantityValue,
                        );
                        const cookieBreakdownSubtotal = isCustomCookiesItem
                          ? cookieDifficultyRows.reduce((sum, row) => {
                              const rowDifficulty = getTokenDifficultyOption(
                                row.difficulty,
                              );
                              return (
                                sum +
                                Math.max(0, row.quantity) *
                                  rowDifficulty.cookiePrice
                              );
                            }, 0)
                          : 0;
                        const cookieBreakdownUnitPrice =
                          quantityValue > 0 && cookieBreakdownSubtotal > 0
                            ? Math.round(
                                cookieBreakdownSubtotal / quantityValue,
                              )
                            : 0;
                        const customCookieAdditionalDesignCount =
                          isCustomCookiesItem
                            ? getCookieAdditionalDesignCountFromItem({
                                designCount: item?.designCount,
                                additionalDesignCount:
                                  item?.additionalDesignCount,
                              })
                            : 0;
                        const customCookieAdditionalDesignUnitPrice =
                          isCustomCookiesItem
                            ? getCookieAdditionalDesignUnitPrice({
                                categoryAddOns: addOns,
                                item: {
                                  addOnPriceOverrides:
                                    item?.addOnPriceOverrides,
                                },
                              })
                            : COOKIE_ADDITIONAL_DESIGN_PRICE;
                        const customCookieAdditionalDesignCharge =
                          customCookieAdditionalDesignCount *
                          customCookieAdditionalDesignUnitPrice;
                        const parsedSubtotalWithDesignCharge =
                          hasParsedRecapPrice && parsedSubtotal
                            ? parsedSubtotal +
                              customCookieAdditionalDesignCharge
                            : parsedSubtotal;
                        const cookieSubtotalWithDesignCharge =
                          isCustomCookiesItem && cookieBreakdownSubtotal > 0
                            ? cookieBreakdownSubtotal +
                              customCookieAdditionalDesignCharge
                            : undefined;
                        const displayUnitPrice =
                          hasParsedRecapPrice && parsedUnitPrice
                            ? parsedUnitPrice
                            : bouquetPriceOverride !== undefined
                              ? bouquetPriceOverride
                              : sharingBoxUnitPriceOverride !== undefined
                                ? sharingBoxUnitPriceOverride
                                : isCustomCookiesItem &&
                                    cookieBreakdownUnitPrice > 0
                                  ? cookieBreakdownUnitPrice
                                  : getUnitPriceFromCatalog(productCatalog, {
                                      category: normalizedSelection.category,
                                      subcategory:
                                        normalizedSelection.subcategory,
                                      productName:
                                        normalizedSelection.productName,
                                      size: normalizedSelection.size,
                                    });
                        const displayLinePrice =
                          hasParsedRecapPrice && cookieSubtotalWithDesignCharge
                            ? cookieSubtotalWithDesignCharge
                            : hasParsedRecapPrice &&
                                parsedSubtotalWithDesignCharge
                              ? parsedSubtotalWithDesignCharge
                              : isCustomCookiesItem &&
                                  cookieBreakdownSubtotal > 0
                                ? cookieBreakdownSubtotal
                                : getItemBasePrice(
                                    productCatalog,
                                    bouquetProbeItem,
                                    {
                                      cookieAdditionalDesignUnitPrice:
                                        customCookieAdditionalDesignUnitPrice,
                                    },
                                  );
                        const itemTotalCostDisplay =
                          hasParsedRecapPrice && cookieSubtotalWithDesignCharge
                            ? cookieSubtotalWithDesignCharge
                            : hasParsedRecapPrice &&
                                parsedSubtotalWithDesignCharge
                              ? parsedSubtotalWithDesignCharge
                              : displayLinePrice +
                                selectedAllAddOnTotal +
                                customAddOnTotal +
                                customCookieAdditionalDesignCharge;
                        const totalAddOnAndSurchargeDisplay =
                          selectedAllAddOnTotal +
                          customAddOnTotal +
                          customCookieAdditionalDesignCharge;

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
                                {isSeasonalEventItem && (
                                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">
                                    Seasonal/Event
                                  </span>
                                )}
                                {isTwoTierCake && (
                                  <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-indigo-700">
                                    Two Tiered Cake
                                  </span>
                                )}
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
                                      `items.${index}.addOnPriceOverrides`,
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
                                      `items.${index}.bouquetPriceOverride`,
                                      undefined,
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
                                      `items.${index}.greetingCard`,
                                      nextSelection.category === "Buket"
                                        ? String(item?.greetingCard || "")
                                        : "",
                                      {
                                        shouldValidate: true,
                                      },
                                    );
                                    setValue(
                                      `items.${index}.bouquetPaperColor`,
                                      nextSelection.category === "Buket"
                                        ? String(item?.bouquetPaperColor || "")
                                        : "",
                                      {
                                        shouldValidate: true,
                                      },
                                    );
                                    setValue(
                                      `items.${index}.ribbon`,
                                      nextSelection.category === "Buket"
                                        ? String(item?.ribbon || "")
                                        : "",
                                      {
                                        shouldValidate: true,
                                      },
                                    );
                                    setValue(
                                      `items.${index}.flowerCount`,
                                      nextSelection.category === "Buket"
                                        ? String(item?.flowerCount || "")
                                        : "",
                                      {
                                        shouldValidate: true,
                                      },
                                    );
                                    setValue(
                                      `items.${index}.flowerColor`,
                                      nextSelection.category === "Buket"
                                        ? String(item?.flowerColor || "")
                                        : "",
                                      {
                                        shouldValidate: true,
                                      },
                                    );
                                    setValue(
                                      `items.${index}.ribbonColor`,
                                      nextSelection.category === "Buket"
                                        ? String(item?.ribbonColor || "")
                                        : "",
                                      {
                                        shouldValidate: true,
                                      },
                                    );
                                    setValue(
                                      `items.${index}.cookieDifficultyBreakdown`,
                                      undefined,
                                      {
                                        shouldValidate: true,
                                      },
                                    );
                                    setValue(
                                      `items.${index}.tokenDifficulty`,
                                      nextSelection.category === "Cookies"
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
                                {isCookies ? "Mode Cookies" : "Subcategory"}
                                {isCookies ? (
                                  <>
                                    <Select
                                      value={cookieCatalogMode}
                                      onChange={(event) => {
                                        const nextMode = event.target
                                          .value as CookieCatalogMode;
                                        const nextSelection =
                                          getCookieSelectionByMode({
                                            catalog: productCatalog,
                                            mode: nextMode,
                                            previousSelection:
                                              normalizedSelection,
                                          });
                                        const nextProbeItem: BookingItemInput =
                                          {
                                            category: nextSelection.category,
                                            subcategory:
                                              nextSelection.subcategory,
                                            productName:
                                              nextSelection.productName,
                                            size: nextSelection.size,
                                            quantity:
                                              Number(item?.quantity) || 0,
                                            tokenDifficulty:
                                              item?.tokenDifficulty,
                                            customTokenPerUnit:
                                              Number(item?.customTokenPerUnit) >
                                              0
                                                ? Number(
                                                    item?.customTokenPerUnit,
                                                  )
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
                                          { shouldValidate: true },
                                        );
                                        setValue(
                                          `items.${index}.productName`,
                                          nextSelection.productName,
                                          { shouldValidate: true },
                                        );
                                        setValue(
                                          `items.${index}.size`,
                                          nextSelection.size,
                                          {
                                            shouldValidate: true,
                                          },
                                        );
                                        if (
                                          typeof nextAutoQuantity === "number"
                                        ) {
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
                                      <option value="CUSTOM">Custom</option>
                                      <option value="SEASONAL_EVENT">
                                        Seasonal/Event
                                      </option>
                                    </Select>
                                    <span className="text-[11px] font-normal text-gray-500">
                                      Subcategory aktif:{" "}
                                      {normalizedSelection.subcategory || "-"}
                                    </span>
                                  </>
                                ) : hasMultipleSubcategories ? (
                                  <Select
                                    {...register(`items.${index}.subcategory`)}
                                    value={normalizedSelection.subcategory}
                                    onChange={(event) => {
                                      const nextSub = event.target.value;
                                      const nextSelection =
                                        ensureSelectionFromCatalog(
                                          productCatalog,
                                          {
                                            category:
                                              normalizedSelection.category,
                                            subcategory: nextSub,
                                          },
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
                                      if (
                                        typeof nextAutoQuantity === "number"
                                      ) {
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
                                      <option
                                        key={entry.name}
                                        value={entry.name}
                                      >
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
                                        ensureSelectionFromCatalog(
                                          productCatalog,
                                          {
                                            category:
                                              normalizedSelection.category,
                                            subcategory:
                                              normalizedSelection.subcategory,
                                            productName: nextProduct,
                                          },
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
                                      if (
                                        typeof nextAutoQuantity === "number"
                                      ) {
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
                                      <option
                                        key={product.name}
                                        value={product.name}
                                      >
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
                                {isCustomCookiesItem ? (
                                  <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
                                    Mixed by difficulty
                                  </div>
                                ) : hasMultipleVariants ? (
                                  <Select
                                    {...register(`items.${index}.size`)}
                                    value={normalizedSelection.size}
                                    onChange={(event) => {
                                      const nextSize = event.target.value;
                                      const nextProbeItem: BookingItemInput = {
                                        category: normalizedSelection.category,
                                        subcategory:
                                          normalizedSelection.subcategory,
                                        productName:
                                          normalizedSelection.productName,
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
                                      setValue(
                                        `items.${index}.size`,
                                        nextSize,
                                        {
                                          shouldValidate: true,
                                        },
                                      );
                                      if (
                                        typeof nextAutoQuantity === "number"
                                      ) {
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
                                        {getReadableVariantLabel({
                                          ...bouquetProbeItem,
                                          size: sizeOption.label,
                                        })}{" "}
                                        ({formatCurrency(sizeOption.price)})
                                      </option>
                                    ))}
                                  </Select>
                                ) : (
                                  <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
                                    {getReadableVariantLabel(bouquetProbeItem)}
                                  </div>
                                )}
                                {effectiveDeliveryMethod === "ASSISTED_PAXEL" &&
                                  isBouquet && (
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
                                      const parsed =
                                        Number(event.target.value) || 0;
                                      const minQty = quantityRule.min;
                                      if (parsed > 0 && parsed < minQty) {
                                        setValue(
                                          `items.${index}.quantity`,
                                          minQty,
                                          {
                                            shouldValidate: true,
                                          },
                                        );
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
                                {isCustomCookiesItem && (
                                  <label className="grid gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-[12px] font-medium text-emerald-900">
                                    Jumlah Design Cookies
                                    <Input
                                      type="number"
                                      min={1}
                                      max={100}
                                      placeholder="contoh: 7"
                                      {...register(
                                        `items.${index}.designCount`,
                                        {
                                          setValueAs: (value) =>
                                            normalizeCookieDesignCount(value),
                                          onChange: (event) => {
                                            clearParsedPricingOverride(index);
                                            const nextDesignCount =
                                              normalizeCookieDesignCount(
                                                event.target.value,
                                              ) ?? 0;
                                            setValue(
                                              `items.${index}.additionalDesignCount`,
                                              getAdditionalCookieDesignCount(
                                                nextDesignCount,
                                              ),
                                              {
                                                shouldValidate: true,
                                              },
                                            );
                                          },
                                        },
                                      )}
                                    />
                                    <span className="min-h-4 text-[11px] font-normal leading-4 text-emerald-700">
                                      Maks {COOKIE_INCLUDED_DESIGN_LIMIT} design
                                      tanpa surcharge. Di atas itu dikenakan{" "}
                                      {formatCurrency(
                                        customCookieAdditionalDesignUnitPrice,
                                      )}{" "}
                                      per design tambahan.
                                    </span>
                                  </label>
                                )}
                                {isCustomCookiesItem && (
                                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                                    <div className="mb-1.5 flex items-center justify-between">
                                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                                        Breakdown Difficulty
                                      </span>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="h-6 border-indigo-200 px-2 text-[11px] text-indigo-700"
                                        onClick={() => {
                                          clearParsedPricingOverride(index);
                                          const nextRows: CookieDifficultyRow[] =
                                            [
                                              ...cookieDifficultyRows,
                                              {
                                                difficulty:
                                                  "SIMPLE" as TokenDifficultyValue,
                                                quantity: 1,
                                              },
                                            ];
                                          const nextTotal = nextRows.reduce(
                                            (sum, row) =>
                                              sum + Math.max(0, row.quantity),
                                            0,
                                          );
                                          const nextBreakdown =
                                            mergeCookieBreakdownIntoNotes(
                                              nextRows,
                                            );
                                          setValue(
                                            `items.${index}.quantity`,
                                            nextTotal,
                                            {
                                              shouldValidate: true,
                                            },
                                          );
                                          setValue(
                                            `items.${index}.tokenDifficulty`,
                                            nextRows[0]?.difficulty || "SIMPLE",
                                            { shouldValidate: true },
                                          );
                                          setValue(
                                            `items.${index}.cookieDifficultyBreakdown`,
                                            nextBreakdown,
                                            {
                                              shouldValidate: true,
                                            },
                                          );
                                        }}
                                      >
                                        <Plus size={12} className="mr-1" />
                                        Tambah
                                      </Button>
                                    </div>
                                    <div className="space-y-1.5">
                                      {cookieDifficultyRows.map(
                                        (row, rowIndex) => (
                                          <div
                                            key={`${row.difficulty}-${rowIndex}`}
                                            className="grid grid-cols-[1fr_1fr_auto] items-center gap-1.5"
                                          >
                                            <Input
                                              type="number"
                                              min={1}
                                              step={1}
                                              value={row.quantity}
                                              onChange={(event) => {
                                                clearParsedPricingOverride(
                                                  index,
                                                );
                                                const nextRows =
                                                  cookieDifficultyRows.map(
                                                    (entry, entryIndex) =>
                                                      entryIndex === rowIndex
                                                        ? {
                                                            ...entry,
                                                            quantity: Math.max(
                                                              1,
                                                              Number(
                                                                event.target
                                                                  .value,
                                                              ) || 1,
                                                            ),
                                                          }
                                                        : entry,
                                                  );
                                                const nextTotal =
                                                  nextRows.reduce(
                                                    (sum, entry) =>
                                                      sum +
                                                      Math.max(
                                                        0,
                                                        entry.quantity,
                                                      ),
                                                    0,
                                                  );
                                                const nextBreakdown =
                                                  mergeCookieBreakdownIntoNotes(
                                                    nextRows,
                                                  );
                                                setValue(
                                                  `items.${index}.quantity`,
                                                  nextTotal,
                                                  {
                                                    shouldValidate: true,
                                                  },
                                                );
                                                setValue(
                                                  `items.${index}.cookieDifficultyBreakdown`,
                                                  nextBreakdown,
                                                  {
                                                    shouldValidate: true,
                                                  },
                                                );
                                              }}
                                            />
                                            <Select
                                              value={row.difficulty}
                                              onChange={(event) => {
                                                clearParsedPricingOverride(
                                                  index,
                                                );
                                                const nextDifficulty =
                                                  normalizeTokenDifficultyValue(
                                                    event.target.value,
                                                  );
                                                const nextRows =
                                                  cookieDifficultyRows.map(
                                                    (entry, entryIndex) =>
                                                      entryIndex === rowIndex
                                                        ? {
                                                            ...entry,
                                                            difficulty:
                                                              nextDifficulty,
                                                          }
                                                        : entry,
                                                  );
                                                const nextBreakdown =
                                                  mergeCookieBreakdownIntoNotes(
                                                    nextRows,
                                                  );
                                                setValue(
                                                  `items.${index}.tokenDifficulty`,
                                                  nextRows[0]?.difficulty ||
                                                    "SIMPLE",
                                                  {
                                                    shouldValidate: true,
                                                  },
                                                );
                                                setValue(
                                                  `items.${index}.cookieDifficultyBreakdown`,
                                                  nextBreakdown,
                                                  {
                                                    shouldValidate: true,
                                                  },
                                                );
                                              }}
                                            >
                                              {TOKEN_DIFFICULTY_OPTIONS.map(
                                                (option) => (
                                                  <option
                                                    key={option.value}
                                                    value={option.value}
                                                  >
                                                    {option.label}
                                                  </option>
                                                ),
                                              )}
                                            </Select>
                                            <Button
                                              type="button"
                                              variant="outline"
                                              className="h-9 border-rose-200 px-2 text-rose-600"
                                              disabled={
                                                cookieDifficultyRows.length <= 1
                                              }
                                              onClick={() => {
                                                clearParsedPricingOverride(
                                                  index,
                                                );
                                                const nextRows =
                                                  cookieDifficultyRows.filter(
                                                    (_entry, entryIndex) =>
                                                      entryIndex !== rowIndex,
                                                  );
                                                if (!nextRows.length) return;
                                                const nextTotal =
                                                  nextRows.reduce(
                                                    (sum, entry) =>
                                                      sum +
                                                      Math.max(
                                                        0,
                                                        entry.quantity,
                                                      ),
                                                    0,
                                                  );
                                                const nextBreakdown =
                                                  mergeCookieBreakdownIntoNotes(
                                                    nextRows,
                                                  );
                                                setValue(
                                                  `items.${index}.quantity`,
                                                  nextTotal,
                                                  {
                                                    shouldValidate: true,
                                                  },
                                                );
                                                setValue(
                                                  `items.${index}.tokenDifficulty`,
                                                  nextRows[0]?.difficulty ||
                                                    "SIMPLE",
                                                  {
                                                    shouldValidate: true,
                                                  },
                                                );
                                                setValue(
                                                  `items.${index}.cookieDifficultyBreakdown`,
                                                  nextBreakdown,
                                                  {
                                                    shouldValidate: true,
                                                  },
                                                );
                                              }}
                                            >
                                              <Trash2 size={13} />
                                            </Button>
                                          </div>
                                        ),
                                      )}
                                    </div>
                                  </div>
                                )}
                                {cookieDifficultyBreakdown && (
                                  <span className="min-h-4 text-[11px] font-medium leading-4 text-indigo-700">
                                    Komposisi difficulty:{" "}
                                    {cookieDifficultyBreakdown}
                                  </span>
                                )}
                                {quantityError && (
                                  <span className="min-h-4 text-[11px] font-normal leading-4 text-rose-600">
                                    {quantityError}
                                  </span>
                                )}
                              </label>

                              {isCustomCookieSharingBox && (
                                <label className="grid gap-1.5 text-sm font-medium text-gray-700">
                                  Override Harga Sharing Box
                                  <Input
                                    type="number"
                                    min={0}
                                    step={1000}
                                    placeholder={String(displayUnitPrice)}
                                    {...register(
                                      `items.${index}.sharingBoxPriceOverride`,
                                      {
                                        setValueAs: (value) =>
                                          normalizeSharingBoxPriceOverrideValue(
                                            value,
                                          ),
                                        onChange: () => {
                                          clearParsedPricingOverride(index);
                                        },
                                      },
                                    )}
                                  />
                                  <span className="min-h-4 text-[11px] font-normal leading-4 text-gray-500">
                                    Kosongkan jika ingin pakai harga default
                                    dari katalog.
                                  </span>
                                </label>
                              )}

                              {supportsDifficulty && !isCustomCookiesItem && (
                                <label className="grid gap-1.5 text-sm font-medium text-gray-700">
                                  Difficulty Token
                                  <Select
                                    {...register(`items.${index}.tokenDifficulty`, {
                                      onChange: () => {
                                        clearParsedPricingOverride(index);
                                      },
                                    })}
                                    defaultValue={
                                      item?.tokenDifficulty || "SIMPLE"
                                    }
                                  >
                                    {TOKEN_DIFFICULTY_OPTIONS.map((option) => (
                                      <option
                                        key={option.value}
                                        value={option.value}
                                      >
                                        {option.label} ({option.token})
                                      </option>
                                    ))}
                                  </Select>
                                </label>
                              )}

                              {isBouquet && (
                                <label className="grid gap-1.5 text-sm font-medium text-gray-700">
                                  Override Harga Buket
                                  <Input
                                    type="number"
                                    min={0}
                                    step={1000}
                                    placeholder={String(displayUnitPrice)}
                                    {...register(
                                      `items.${index}.bouquetPriceOverride`,
                                      {
                                        setValueAs: (value) =>
                                          normalizeBouquetPriceOverrideValue(
                                            value,
                                          ),
                                        onChange: () => {
                                          clearParsedPricingOverride(index);
                                        },
                                      },
                                    )}
                                  />
                                  <span className="min-h-4 text-[11px] font-normal leading-4 text-gray-500">
                                    {bouquetPriceOverride !== undefined
                                      ? `Override harga buket aktif: ${formatCurrency(bouquetPriceOverride)}.`
                                      : "Kosongkan jika ingin pakai harga default start from katalog."}
                                  </span>
                                  <span className="min-h-4 text-[11px] font-normal leading-4 text-gray-500">
                                    Token bouquet fixed: Hand = 20, Standing =
                                    50 per bouquet.
                                  </span>
                                  {bouquetLineTotal !== null && (
                                    <span className="text-[11px] font-normal leading-4 text-indigo-600">
                                      Estimasi subtotal bouquet:{" "}
                                      {formatCurrency(bouquetLineTotal)}
                                    </span>
                                  )}
                                </label>
                              )}

                              {isBouquet && (
                                <label className="grid gap-1.5 text-sm font-medium text-gray-700 sm:col-span-2 lg:col-span-4">
                                  Kartu Ucapan
                                  <Textarea
                                    className="min-h-20"
                                    placeholder="Contoh: Happy Birthday Elliora!"
                                    {...register(`items.${index}.greetingCard`)}
                                  />
                                </label>
                              )}

                              <label className="grid gap-1.5 text-sm font-medium text-gray-700 sm:col-span-2 lg:col-span-4">
                                Customer Notes
                                <Input
                                  placeholder="Decoration instructions"
                                  {...register(`items.${index}.notes`)}
                                />
                              </label>

                              {isBouquet && (
                                <div className="grid gap-2 sm:col-span-2 lg:col-span-4 sm:grid-cols-2">
                                  <label className="grid gap-1.5 text-sm font-medium text-gray-700">
                                    Warna kertas bouquet
                                    <Input
                                      placeholder="Contoh: No 13"
                                      {...register(
                                        `items.${index}.bouquetPaperColor`,
                                      )}
                                    />
                                  </label>
                                  <label className="grid gap-1.5 text-sm font-medium text-gray-700">
                                    Ribbon
                                    <Input
                                      placeholder="Contoh: Satin"
                                      {...register(`items.${index}.ribbon`)}
                                    />
                                  </label>
                                  <label className="grid gap-1.5 text-sm font-medium text-gray-700">
                                    Jumlah Bunga
                                    <Input
                                      placeholder="Contoh: - / 3 bunga"
                                      {...register(
                                        `items.${index}.flowerCount`,
                                      )}
                                    />
                                  </label>
                                  <label className="grid gap-1.5 text-sm font-medium text-gray-700">
                                    Warna Bunga
                                    <Input
                                      placeholder="Contoh: Putih"
                                      {...register(
                                        `items.${index}.flowerColor`,
                                      )}
                                    />
                                  </label>
                                  <label className="grid gap-1.5 text-sm font-medium text-gray-700 sm:col-span-2">
                                    Warna Pita
                                    <Input
                                      placeholder="Contoh: Blue pastel"
                                      {...register(
                                        `items.${index}.ribbonColor`,
                                      )}
                                    />
                                  </label>
                                </div>
                              )}
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
                                {customCookieAdditionalDesignCharge > 0
                                  ? ` • Surcharge design +${formatCurrency(customCookieAdditionalDesignCharge)}`
                                  : ""}
                                {cookieDifficultyBreakdown
                                  ? ` • Komposisi ${cookieDifficultyBreakdown}`
                                  : ""}
                                . Jika produk, size, atau qty diubah, override
                                ini akan otomatis direset.
                              </div>
                            )}

                            <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-700">
                              Estimasi token item ini: {itemTokenPreview}
                              {hasCustomTokenOverride
                                ? " (custom token override)"
                                : ""}
                              {isTwoTierCake && !hasCustomTokenOverride
                                ? " • Two-tier dihitung sebagai 2 cake (100 + 100 token) tapi tetap 1 item."
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
                                    const checked =
                                      selectedFlavorId === option.id;
                                    const shortCode =
                                      option.shortCodes?.[0] || "";

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
                                      Premium Flavors (Surcharge)
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
                                                  /cake
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
                                  {flavorGuideText}
                                </span>
                              </label>
                            )}

                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  Add-ons
                                </span>
                                <span className="text-[11px] font-medium text-slate-500">
                                  {selectedNonFlavorAddOns.length +
                                    customAddOns.length}{" "}
                                  dipilih
                                  {selectedNonFlavorAddOns.length > 0 ||
                                  customAddOns.length > 0
                                    ? ` • ${formatCurrency(selectedNonFlavorAddOnTotal + customAddOnTotal)}`
                                    : ""}
                                </span>
                              </div>
                              <div className="grid gap-1.5 sm:grid-cols-3">
                                {nonFlavorAddOns.map((addon) => {
                                  const checked =
                                    item?.addOns?.includes(addon.id) ?? false;
                                  const overriddenPrice =
                                    normalizedAddOnPriceOverrides[addon.id];
                                  const baseUnitPrice =
                                    overriddenPrice !== undefined
                                      ? overriddenPrice
                                      : addon.price;
                                  const dynamicBubblewrapUnitPrice =
                                    resolveBubblewrapUnitPrice({
                                      category: normalizedSelection.category,
                                      addonId: addon.id,
                                      defaultPrice: baseUnitPrice,
                                      itemSelection: {
                                        category: normalizedSelection.category,
                                        subcategory:
                                          normalizedSelection.subcategory,
                                        productName:
                                          normalizedSelection.productName,
                                        size: normalizedSelection.size,
                                      },
                                    });
                                  const supportsQuantity =
                                    supportsAddOnQuantity(
                                      normalizedSelection.category,
                                      addon.id,
                                    );
                                  const perCakeUnits = getAddOnUnitMultiplier({
                                    category: normalizedSelection.category,
                                    addonId: addon.id,
                                    addOnQuantities: normalizedAddOnQuantities,
                                  });
                                  const effectiveUnitPrice =
                                    (normalizedSelection.category === "Buket"
                                      ? (getBouquetFlowerAddOnUnitPrice({
                                          addonId: addon.id,
                                          bouquetType,
                                        }) ?? dynamicBubblewrapUnitPrice)
                                      : dynamicBubblewrapUnitPrice) *
                                    perCakeUnits;

                                  return (
                                    <div
                                      key={addon.id}
                                      className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-700"
                                    >
                                      <span className="min-w-0">
                                        {addon.label}{" "}
                                        <span className="text-xs text-gray-400">
                                          {formatCurrency(effectiveUnitPrice)}
                                          {supportsQuantity
                                            ? ` / item (${perCakeUnits}x)`
                                            : ""}
                                          {overriddenPrice !== undefined
                                            ? " (adjusted)"
                                            : ""}
                                          {!isBouquetFlowerAddOnId(addon.id) &&
                                          quantityValue > 0
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
                                        {checked &&
                                          addon.id !==
                                            DARK_COLOR_BUTTERCREAM_ADDON_ID &&
                                          !isBouquetFlowerAddOnId(addon.id) &&
                                          !isCupcakeCookieAddOnId(addon.id) && (
                                            <Input
                                              type="number"
                                              min={0}
                                              step={1000}
                                              value={
                                                overriddenPrice !== undefined
                                                  ? overriddenPrice
                                                  : ""
                                              }
                                              placeholder={String(addon.price)}
                                              onChange={(event) =>
                                                setItemAddOnPriceOverride(
                                                  index,
                                                  addon.id,
                                                  event.target.value,
                                                )
                                              }
                                              className="h-8 w-24"
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
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                                    Add-on Custom
                                  </span>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="h-7 border-indigo-200 px-2 text-[11px] font-medium text-indigo-700"
                                    onClick={() => addCustomAddOn(index)}
                                  >
                                    + Tambah
                                  </Button>
                                </div>
                                {customAddOns.length === 0 ? (
                                  <p className="text-[11px] text-slate-500">
                                    Gunakan jika kebutuhan add-on tidak ada di
                                    list.
                                  </p>
                                ) : (
                                  <div className="space-y-1.5">
                                    {customAddOns.map(
                                      (customAddOn, customIndex) => (
                                        <div
                                          key={`${customAddOn.label}-${customIndex}`}
                                          className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_130px_auto]"
                                        >
                                          <Input
                                            value={customAddOn.label}
                                            placeholder="Nama add-on custom"
                                            onChange={(event) =>
                                              setCustomAddOnLabel(
                                                index,
                                                customIndex,
                                                event.target.value,
                                              )
                                            }
                                          />
                                          <Input
                                            type="number"
                                            min={0}
                                            step={1}
                                            value={customAddOn.price}
                                            placeholder="Harga"
                                            onChange={(event) =>
                                              setCustomAddOnPrice(
                                                index,
                                                customIndex,
                                                Number(event.target.value),
                                              )
                                            }
                                          />
                                          <Button
                                            type="button"
                                            variant="outline"
                                            className="h-9 border-rose-200 px-2 text-xs text-rose-600"
                                            onClick={() =>
                                              removeCustomAddOn(
                                                index,
                                                customIndex,
                                              )
                                            }
                                          >
                                            Hapus
                                          </Button>
                                        </div>
                                      ),
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="sticky bottom-2 z-10 rounded-xl border border-emerald-200 bg-linear-to-r from-emerald-50 via-white to-emerald-50 px-3 py-2.5 shadow-sm backdrop-blur-sm">
                                <div className="flex flex-wrap items-center justify-between gap-1.5">
                                  <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                                    Total Biaya Item
                                  </span>
                                  <span className="text-sm font-bold text-emerald-800 sm:text-base">
                                    {formatCurrency(itemTotalCostDisplay)}
                                    <span>
                                      Add-on custom:{" "}
                                      {formatCurrency(customAddOnTotal)}
                                    </span>
                                  </span>
                                </div>
                                <div className="mt-1 grid gap-1 text-[11px] text-slate-600 sm:grid-cols-3">
                                  <span>
                                    Subtotal produk:{" "}
                                    {formatCurrency(displayLinePrice)}
                                  </span>
                                  <span>
                                    Total add-ons + surcharge:{" "}
                                    {formatCurrency(
                                      totalAddOnAndSurchargeDisplay,
                                    )}
                                  </span>
                                </div>
                                <p className="mt-1 text-[11px] font-medium text-slate-500">
                                  {hasParsedRecapPrice && parsedSubtotal
                                    ? customCookieAdditionalDesignCharge > 0
                                      ? "Sumber angka: recap parser + surcharge design tambahan."
                                      : "Sumber angka: recap parser (override aktif)."
                                    : customCookieAdditionalDesignCharge > 0
                                      ? "Sumber angka: subtotal produk + add-ons + surcharge design dinamis."
                                      : "Sumber angka: subtotal produk + semua add-ons terpilih."}
                                </p>
                              </div>
                            </div>

                            {(selectedNonFlavorAddOns.length > 0 ||
                              customAddOns.length > 0) && (
                              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                                {[
                                  ...selectedFlowerAddOns.map(
                                    (addon) => addon.label,
                                  ),
                                  ...selectedOtherAddOns.map((addon) => {
                                    const units = getAddOnUnitMultiplier({
                                      category: normalizedSelection.category,
                                      addonId: addon.id,
                                      addOnQuantities:
                                        normalizedAddOnQuantities,
                                    });
                                    return units > 1
                                      ? `${addon.label} x${units}`
                                      : addon.label;
                                  }),
                                  ...customAddOns.map(
                                    (entry) =>
                                      `${entry.label} (${formatCurrency(entry.price)} / item)`,
                                  ),
                                ].join(", ")}
                              </div>
                            )}

                            {hasDarkColorButtercream && (
                              <label className="grid gap-1.5 text-sm font-medium text-gray-700 sm:max-w-sm">
                                Pilih Warna Dark Color (maks. 3)
                                <div className="grid gap-1.5 sm:grid-cols-2">
                                  {DARK_BUTTERCREAM_COLOR_OPTIONS.map(
                                    (color) => {
                                      const checked =
                                        selectedDarkButtercreamColors.includes(
                                          color,
                                        );
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
                                              toggleDarkButtercreamColor(
                                                index,
                                                color,
                                              )
                                            }
                                            className="h-4 w-4 accent-indigo-600"
                                          />
                                        </label>
                                      );
                                    },
                                  )}
                                </div>
                                <span className="min-h-4 text-[11px] font-normal leading-4 text-gray-500">
                                  Dipilih:{" "}
                                  {selectedDarkButtercreamColors.join(", ") ||
                                    "belum ada"}
                                  . Dark color additional charge 50k / item.
                                </span>
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
                                {...register(
                                  `deliveryAddresses.${index}.label`,
                                )}
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
                                    Isi minimal kecamatan dan kota, mis.
                                    `Cipondoh / Tangerang`.
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
                                    Isi 5 digit. Kalau ada di alamat, sistem
                                    akan coba ambil otomatis.
                                  </span>
                                )}
                              {addressError?.postalCode?.message && (
                                <span className="text-[11px] font-normal text-rose-600">
                                  {String(addressError.postalCode.message)}
                                </span>
                              )}
                            </label>
                            <label className="grid gap-2 text-sm font-medium text-gray-700 sm:col-span-2">
                              Full Address{" "}
                              {isPickupMethod ? "(Opsional untuk Pickup)" : ""}
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
                                  {isPickupMethod
                                    ? "Untuk pickup, alamat boleh dikosongkan. Isi hanya jika memang perlu dicatat."
                                    : "Jangan campur nama penerima atau no. telepon di field ini. Fokus ke satu alamat final."}
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
                          Sedang cek ongkir...
                        </span>
                      )}
                    </div>

                    <label className="grid gap-2 text-sm font-medium text-gray-700">
                      Sales Channel
                      <Select {...register("sales_channel")}>
                        <option value="">Pilih sales channel</option>
                        <option value="direct">direct</option>
                        <option value="tokopedia">tokopedia</option>
                        <option value="shopee">shopee</option>
                      </Select>
                      {errors.sales_channel?.message && (
                        <span className="text-[11px] font-normal text-rose-600">
                          {String(errors.sales_channel.message)}
                        </span>
                      )}
                    </label>

                    <label className="grid gap-2 text-sm font-medium text-gray-700">
                      Metode Pengiriman
                      <Select
                        name={deliveryMethodField.name}
                        ref={deliveryMethodField.ref}
                        onBlur={deliveryMethodField.onBlur}
                        value={effectiveDeliveryMethod}
                        onChange={handleDeliveryMethodChange}
                      >
                        {selectableDeliveryMethodOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </label>

                    {shouldUseShippingEngine && (
                      <Button
                        type="button"
                        onClick={handleCheckShipping}
                        disabled={isCheckingShipping}
                        className="w-full"
                      >
                        {isCheckingShipping
                          ? "Sedang cek ongkir..."
                          : "Cek Ongkir"}
                      </Button>
                    )}

                    <p className="text-xs text-gray-500">
                      {
                        DELIVERY_METHOD_OPTIONS.find(
                          (option) => option.value === effectiveDeliveryMethod,
                        )?.description
                      }
                    </p>

                    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
                      {isCarRideHailingMethod ? (
                        <p>
                          GoCar / GrabCar dipakai berdasarkan jarak, jadi berat
                          tidak ditampilkan di sini.
                        </p>
                      ) : (
                        <>
                          <p>
                            Total berat kirim: {shippingWeightSummary.totalGram}{" "}
                            gram ({shippingWeightSummary.totalKg} kg)
                          </p>
                          {shippingWeightSummary.rows.length > 0 && (
                            <details className="mt-1">
                              <summary className="cursor-pointer text-gray-700">
                                Lihat rincian berat per item
                              </summary>
                              <div className="mt-2 space-y-1">
                                {shippingWeightSummary.rows.map((row) => (
                                  <p key={row.key}>
                                    {row.name}: {row.qty} pcs x {row.perPcsGram}{" "}
                                    gram = {row.totalGram} gram
                                  </p>
                                ))}
                              </div>
                            </details>
                          )}
                        </>
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
                            Rekomendasi termurah:{" "}
                            {cheapestShippingQuote?.provider} -{" "}
                            {cheapestShippingQuote?.courierServiceName} ({" "}
                            {cheapestShippingQuote
                              ? formatCurrency(cheapestShippingQuote.price)
                              : "-"}
                            )
                          </p>
                          {fastestShippingQuote &&
                            fastestShippingQuote.id !==
                              cheapestShippingQuote?.id && (
                              <p>
                                Rekomendasi tercepat:{" "}
                                {fastestShippingQuote.provider} -{" "}
                                {fastestShippingQuote.courierServiceName} (ETA{" "}
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
                          const isCheapest =
                            cheapestShippingQuote?.id === quote.id;
                          const isFastest =
                            fastestShippingQuote?.id === quote.id;
                          return (
                            <button
                              key={quote.id}
                              type="button"
                              onClick={() => {
                                selectedShippingQuoteServiceKeyRef.current =
                                  getShippingQuoteServiceKey(quote);
                                selectedShippingQuoteIdRef.current = quote.id;
                                setSelectedShippingQuoteId(quote.id);
                              }}
                              className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${
                                active
                                  ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                                  : "border-gray-200 bg-white text-gray-700"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="flex items-center gap-2 font-semibold">
                                  <span>
                                    {quote.provider} -{" "}
                                    {quote.courierServiceName}
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
                                  {formatCurrency(
                                    getShippingQuoteDisplayPrice(quote),
                                  )}
                                </span>
                              </div>
                              <p className="text-xs">
                                ETA {quote.eta} | Jarak {quote.distanceKm} km |
                                Source: API Kurir
                              </p>
                              {quote.insuranceFee ? (
                                <p className="mt-1 text-[11px] text-amber-700">
                                  + Asuransi{" "}
                                  {formatCurrency(quote.insuranceFee)}
                                </p>
                              ) : null}
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
                          Belum ada opsi ongkir yang bisa dipakai untuk alamat
                          ini.
                        </p>
                      )}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium text-gray-700">
                    Payment Status
                    <Select {...register("paymentStatus")}>
                      <option value="DP Paid">DP {defaultDpPercentage}%</option>
                      <option value="Paid">Lunas</option>
                    </Select>
                  </label>

                  <label className="grid gap-2 text-sm font-medium text-gray-700">
                    Discount Grosir
                    <Select
                      {...register("wholesaleDiscountPercent", {
                        valueAsNumber: true,
                      })}
                    >
                      <option value={0}>Tanpa Diskon</option>
                      <option value={10}>Diskon 10%</option>
                      <option value={15}>Diskon 15%</option>
                      <option value={20}>Diskon 20%</option>
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

                <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm text-indigo-800">
                  <p className="font-semibold">
                    Pembayaran otomatis dari pilihan status:
                  </p>
                  <p className="mt-1">
                    {selectedPaymentStatus === "Paid"
                      ? "Jika pilih Lunas, sistem otomatis set pembayaran 100% dari total pesanan."
                      : `Jika pilih DP ${defaultDpPercentage}%, sistem otomatis set DP sebesar ${formatCurrency(
                          suggestedDownPaymentAmount,
                        )}.`}
                  </p>
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
                    type="button"
                    className="gap-2 bg-[var(--crumbella-accent)] text-white hover:bg-[var(--crumbella-accent-strong)] focus-visible:ring-[var(--crumbella-accent)]"
                    disabled={
                      isSubmitting ||
                      isBookingCreationInFlight ||
                      isManualSubmitInFlight ||
                      isCapacityValidating
                    }
                    onClick={() => void submitBookingForm()}
                  >
                    {isSubmitting ||
                    isManualSubmitInFlight ||
                    isBookingCreationInFlight
                      ? "Saving Booking..."
                      : isCapacityValidating
                        ? "Validating Capacity..."
                        : isEditMode
                          ? "Preview Perubahan"
                          : "Preview Booking"}
                  </Button>
                  <Button
                    variant="outline"
                    type="button"
                    onClick={resetBookingDraftState}
                    className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                    disabled={
                      isSubmitting ||
                      isManualSubmitInFlight ||
                      isBookingCreationInFlight
                    }
                  >
                    Reset Form
                  </Button>
                </div>
                {submitFeedback}
                {submitSuccess ? (
                  <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    <p className="font-semibold">{submitSuccess}</p>
                    {submitSuccessMeta ? (
                      <div className="space-y-1">
                        <p>
                          Status:{" "}
                          <span className="font-semibold">
                            {isEditMode ? "Updated" : "Submitted"}
                          </span>
                        </p>
                        <p>
                          Kode Booking:{" "}
                          <span className="font-semibold">
                            {submitSuccessMeta.bookingCode}
                          </span>
                        </p>
                        <p>
                          {isEditMode ? "Waktu Update:" : "Waktu Submit:"}{" "}
                          {formatSubmitTimestamp(submitSuccessMeta.submittedAt)}
                        </p>
                        <div className="flex gap-2 pt-2">
                          <Button
                            size="sm"
                            className="bg-[#25D366] font-bold text-white hover:bg-[#20bd5a]"
                            onClick={handleSendWhatsAppFromSuccess}
                          >
                            Kirim Rekap WA
                          </Button>
                          <NextLink
                            href={`/bakery/bookings/${submitSuccessMeta.id}`}
                            className="inline-flex h-8 items-center justify-center rounded-xl border border-emerald-200 bg-white px-3 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
                          >
                            Lihat Detail
                          </NextLink>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <PriceSummaryCard
                basePrice={basePrice}
                designAdjustmentTotal={designAdjustmentTotal}
                addOnTotal={addOnTotal}
                deliveryFee={deliveryFee}
                insuranceFee={insuranceFee}
                serviceCharge={serviceCharge}
                manualAdjustment={Number(manualAdjustment || 0)}
                wholesaleDiscountPercent={Number(wholesaleDiscountPercent || 0)}
                wholesaleDiscountAmount={wholesaleDiscountAmount}
                totalPrice={totalPrice}
                categoryBreakdown={categoryPriceBreakdown}
                paymentStatus={effectivePaymentStatus}
                paymentPaidAmount={totalPaid}
                paymentRemainingAmount={remainingBalance}
              />
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-3 pb-4">
          <Card className="overflow-hidden rounded-[22px] border-[var(--crumbella-border)] bg-white shadow-[0_18px_30px_-24px_rgba(30,18,10,0.4)]">
            <CardHeader className="border-b border-[var(--crumbella-border)] px-4 pb-3 pt-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (isEditMode) {
                      setComposerStep("input");
                      return;
                    }
                    router.push("/bakery/bookings/new");
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-xl text-lg text-[var(--crumbella-muted)]"
                >
                  ←
                </button>
                <div>
                  <p className="text-[14px] font-bold text-[var(--foreground)]">
                    {previewTitle}
                  </p>
                  <p className="text-[11px] text-[var(--crumbella-muted)]">
                    {isEditMode
                      ? "Cek data sebelum menyimpan perubahan"
                      : "Cek data sebelum membuat booking"}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-0 p-0">
              {/* Warning notice */}
              <div className="mx-[14px] mt-[10px] flex items-start gap-2 rounded-[11px] border border-[#D8B870] border-l-[3px] border-l-[#C9A84C] bg-[#FFF8E1] px-3 py-[9px]">
                <span className="shrink-0 text-[13px]">⚠️</span>
                <p className="text-[10.5px] leading-[1.5] text-[#7A5000]">
                  {previewAlertMessage}
                </p>
              </div>

              {/* Customer card */}
              <div className="mx-[14px] mt-[10px] rounded-[16px] border border-[var(--crumbella-border)] bg-white">
                <div className="flex items-center gap-[10px] border-b border-[var(--crumbella-border)] px-[14px] py-[11px]">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--crumbella-accent-soft)] text-[13px] font-extrabold text-[var(--crumbella-primary)]">
                    {(watchedValues.customerName || "AD")
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-bold text-[var(--foreground)]">
                      {watchedValues.customerName || "Customer"}
                    </p>
                    <p className="text-[11.5px] text-[var(--crumbella-muted)]">
                      {watchedValues.phoneNumber || "-"}
                    </p>
                  </div>
                  <span className="ml-auto shrink-0 rounded-full bg-[#fff1d9] px-[10px] py-[3px] text-[10px] font-semibold text-[var(--crumbella-primary)]">
                    {selectedPaymentStatus === "Paid"
                      ? "Lunas"
                      : `DP ${defaultDpPercentage}%`}
                  </span>
                </div>
                <div className="grid grid-cols-2 px-[14px] py-[11px]">
                  <div className="border-r border-[var(--crumbella-border)] pr-[10px] py-1">
                    <p className="text-[9px] uppercase tracking-[0.06em] text-[var(--crumbella-muted)]">
                      Delivery
                    </p>
                    <p className="mt-[2px] text-[13px] font-semibold text-[var(--foreground)]">
                      {normalizedDeliveryDate
                        ? formatDuplicateWarningDate(normalizedDeliveryDate)
                        : "-"}
                    </p>
                  </div>
                  <div className="py-1 pl-[10px]">
                    <p className="text-[9px] uppercase tracking-[0.06em] text-[var(--crumbella-muted)]">
                      Jam & Metode
                    </p>
                    <p className="mt-[2px] text-[13px] font-semibold text-[var(--foreground)]">
                      {(watchedValues.deliverySlot || "-").replace(":", ".")} ·{" "}
                      {deliveryMethodLabel}
                    </p>
                  </div>
                </div>
              </div>

              {/* Produk yang Dipesan */}
              <div className="mx-[14px] mt-[10px] rounded-[16px] border border-[var(--crumbella-border)] bg-white">
                <div className="flex items-center gap-[10px] border-b border-[var(--crumbella-border)] px-[14px] py-[10px]">
                  <span className="text-[14px]">🍪</span>
                  <p className="text-[13px] font-bold text-[var(--foreground)]">
                    Produk yang Dipesan
                  </p>
                </div>
                <div className="divide-y divide-[var(--crumbella-border)]">
                  {itemPriceBreakdowns.map((item, index) => (
                    <div
                      key={`${item.itemLabel}-${index}`}
                      className="px-[14px] py-[10px]"
                    >
                      <div className="flex items-start justify-between">
                        <p className="text-[13px] font-semibold text-[var(--foreground)]">
                          {item.quantity}× {item.itemLabel}
                        </p>
                        <p className="shrink-0 text-[12.5px] font-medium text-[var(--foreground)]">
                          {formatCurrency(item.totalAmount)}
                        </p>
                      </div>
                      <p className="mt-[3px] text-[10.5px] text-[var(--crumbella-muted)]">
                        {getReadableVariantLabel(
                          watchedItems[index] as BookingItemInput,
                        )}
                      </p>
                      {item.addOnDetails.length > 0 ? (
                        <div className="mt-[6px] flex flex-wrap gap-[5px]">
                          {item.addOnDetails.map((detail, detailIndex) => (
                            <span
                              key={`${detail}-${detailIndex}`}
                              className="rounded-full bg-[var(--crumbella-accent-soft)] px-2 py-[2px] text-[10px] font-semibold text-[var(--crumbella-primary)]"
                            >
                              {detail}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              {/* Gambar Referensi */}
              <div className="mx-[14px] mt-[10px] rounded-[16px] border border-[var(--crumbella-border)] bg-white">
                <div className="flex items-center gap-[10px] border-b border-[var(--crumbella-border)] px-[14px] py-[10px]">
                  <span className="text-[14px]">🎨</span>
                  <p className="text-[13px] font-bold text-[var(--foreground)]">
                    Gambar Referensi · {previewReferenceImages.length} gambar
                  </p>
                </div>
                <div className="flex flex-col gap-3 px-[14px] py-[10px]">
                  {previewReferenceImages.length > 0 ? (
                    previewReferenceImages.map((image, index) => {
                      return (
                        <div
                          key={`${image.label}-${index}`}
                          className="overflow-hidden rounded-[14px] border border-[var(--crumbella-border)] bg-[#fffdfa] p-[9px] shadow-[0_10px_24px_-22px_rgba(30,18,10,0.45)]"
                        >
                          <div className="overflow-hidden rounded-[11px] border border-[#ebe2d7] bg-[linear-gradient(90deg,#f6f1ea_0%,#fcfaf7_50%,#f6f1ea_100%)]">
                            {image.url ? (
                              <>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={image.url}
                                  alt={image.label}
                                  className="h-[168px] w-full object-contain"
                                />
                              </>
                            ) : (
                              <div className="flex h-[168px] items-center justify-center px-4 text-center text-[11px] text-[var(--crumbella-muted)]">
                                Gambar referensi belum tersedia.
                              </div>
                            )}
                          </div>
                          <div className="px-[2px] pb-[2px] pt-3">
                            <p className="text-[12.5px] font-semibold leading-[1.45] text-[var(--foreground)]">
                              {image.label}
                            </p>
                            <p
                              className={`mt-[4px] text-[11px] leading-[1.5] ${
                                image.note
                                  ? "text-[var(--crumbella-muted)]"
                                  : "italic text-[var(--crumbella-muted)]"
                              }`}
                            >
                              {image.note || "Tidak ada notes"}
                            </p>
                          </div>
                        </div>
                      );
                      /* return (
                        <div key={`${image.label}-${index}`} className="flex items-center gap-[10px]">
                          <div
                            className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-lg border text-[18px]"
                            style={{ background: bgColors[index % bgColors.length], borderColor: borderColors[index % borderColors.length] }}
                          >
                            {iconEmojis[index % iconEmojis.length]}
                          </div>
                          <p className={`flex-1 text-[11.5px] leading-[1.5] ${image.note ? "text-[var(--foreground)]" : "italic text-[var(--crumbella-muted)]"}`}>
                            {image.label}{image.note ? ` — ${image.note}` : " — Tidak ada notes"}
                          </p>
                        </div>
                      ); */
                    })
                  ) : (
                    <p className="text-[11.5px] italic text-[var(--crumbella-muted)]">
                      Belum ada gambar referensi.
                    </p>
                  )}
                </div>
              </div>

              {/* Pengiriman & Pembayaran */}
              <div className="mx-[14px] mt-[10px] rounded-[16px] border border-[var(--crumbella-border)] bg-white">
                <div className="flex items-center gap-[10px] border-b border-[var(--crumbella-border)] px-[14px] py-[10px]">
                  <span className="text-[14px]">💳</span>
                  <p className="text-[13px] font-bold text-[var(--foreground)]">
                    Pengiriman & Pembayaran
                  </p>
                </div>
                <div>
                  <div className="flex items-center justify-between border-b border-[var(--crumbella-border)] px-[14px] py-[11px]">
                    <span className="text-[12px] text-[var(--crumbella-muted)]">
                      Metode
                    </span>
                    <span className="text-[12.5px] font-semibold text-[var(--foreground)]">
                      {deliveryMethodLabel}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-[var(--crumbella-border)] px-[14px] py-[11px]">
                    <span className="text-[12px] text-[var(--crumbella-muted)]">
                      Base Price
                    </span>
                    <span className="text-[12.5px] font-semibold text-[var(--foreground)]">
                      {formatCurrency(basePrice)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-[var(--crumbella-border)] px-[14px] py-[11px]">
                    <span className="text-[12px] text-[var(--crumbella-muted)]">
                      Adjustment Design/Admin
                    </span>
                    <span className="text-[12.5px] font-semibold text-[var(--foreground)]">
                      {formatCurrency(designAdjustmentTotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-[var(--crumbella-border)] px-[14px] py-[11px]">
                    <span className="text-[12px] text-[var(--crumbella-muted)]">
                      Add-ons
                    </span>
                    <span className="text-[12.5px] font-semibold text-[var(--foreground)]">
                      {formatCurrency(addOnTotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-[var(--crumbella-border)] px-[14px] py-[11px]">
                    <span className="text-[12px] text-[var(--crumbella-muted)]">
                      Ongkir
                    </span>
                    <span className="text-[12.5px] font-semibold text-[var(--foreground)]">
                      {formatCurrency(deliveryFee)}
                    </span>
                  </div>
                  {insuranceFee > 0 ? (
                    <div className="flex items-center justify-between border-b border-[var(--crumbella-border)] px-[14px] py-[11px]">
                      <span className="text-[12px] text-[var(--crumbella-muted)]">
                        Insurance
                      </span>
                      <span className="text-[12.5px] font-semibold text-[var(--foreground)]">
                        {formatCurrency(insuranceFee)}
                      </span>
                    </div>
                  ) : null}
                  {serviceCharge > 0 ? (
                    <div className="flex items-center justify-between border-b border-[var(--crumbella-border)] px-[14px] py-[11px]">
                      <span className="text-[12px] text-[var(--crumbella-muted)]">
                        Biaya Admin
                      </span>
                      <span className="text-[12.5px] font-semibold text-[var(--foreground)]">
                        {formatCurrency(serviceCharge)}
                      </span>
                    </div>
                  ) : null}
                  {Number(manualAdjustment || 0) !== 0 ? (
                    <div className="flex items-center justify-between border-b border-[var(--crumbella-border)] px-[14px] py-[11px]">
                      <span className="text-[12px] text-[var(--crumbella-muted)]">
                        Adjustment
                      </span>
                      <span className="text-[12.5px] font-semibold text-[var(--foreground)]">
                        {formatCurrency(Number(manualAdjustment || 0))}
                      </span>
                    </div>
                  ) : null}
                  {Number(wholesaleDiscountPercent || 0) > 0 ? (
                    <div className="flex items-center justify-between border-b border-[var(--crumbella-border)] px-[14px] py-[11px]">
                      <span className="text-[12px] text-[var(--crumbella-muted)]">
                        Discount Grosir ({Number(wholesaleDiscountPercent || 0)}
                        %)
                      </span>
                      <span className="text-[12.5px] font-semibold text-[#1f6a43]">
                        -{formatCurrency(wholesaleDiscountAmount)}
                      </span>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between border-b border-[var(--crumbella-border)] px-[14px] py-[11px]">
                    <span className="text-[12px] text-[var(--crumbella-muted)]">
                      Total Harga
                    </span>
                    <span className="text-[13px] font-bold text-[var(--foreground)]">
                      {formatCurrency(totalPrice)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-[var(--crumbella-border)] px-[14px] py-[11px]">
                    <span className="text-[12px] text-[var(--crumbella-muted)]">
                      Pembayaran
                    </span>
                    <span className="text-[12.5px] font-semibold text-[var(--foreground)]">
                      {selectedPaymentStatus === "Paid"
                        ? "Lunas"
                        : `DP ${defaultDpPercentage}%`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-[var(--crumbella-border)] px-[14px] py-[11px]">
                    <span className="text-[12px] text-[var(--crumbella-muted)]">
                      DP
                    </span>
                    <span className="text-[13px] font-bold text-[#1f6a43]">
                      {formatCurrency(totalPaid)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-[14px] py-[11px]">
                    <span className="text-[12px] text-[var(--crumbella-muted)]">
                      Sisa Tagihan
                    </span>
                    <span className="text-[13px] font-bold text-[#b53b2c]">
                      {formatCurrency(remainingBalance)}
                    </span>
                  </div>
                </div>
              </div>

              {/* CTA Buttons */}
              <div className="flex gap-2 px-[14px] pb-5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    if (isEditMode) {
                      setComposerStep("input");
                      return;
                    }
                    router.push("/bakery/bookings/new");
                  }}
                  className="flex-1 rounded-[13px] border-[1.5px] border-[var(--crumbella-border)] bg-white px-3 py-[13px] text-center text-[13px] font-semibold text-[var(--crumbella-muted)] transition hover:bg-gray-50"
                >
                  ← Edit
                </button>
                <Button
                  type="button"
                  className="h-auto flex-[2] rounded-[13px] bg-[var(--crumbella-accent)] px-3 py-[13px] text-[13px] font-bold text-white hover:bg-[var(--crumbella-accent-strong)]"
                  disabled={
                    isSubmitting ||
                    isBookingCreationInFlight ||
                    isManualSubmitInFlight ||
                    isCapacityValidating
                  }
                  onClick={() => void submitBookingForm()}
                >
                  {isSubmitting ||
                  isManualSubmitInFlight ||
                  isBookingCreationInFlight
                    ? isEditMode
                      ? "Menyimpan..."
                      : "Saving Booking..."
                    : isCapacityValidating
                      ? "Validating..."
                      : isEditMode
                        ? "Simpan Perubahan"
                        : "✓ Create Booking"}
                </Button>
              </div>
              {submitFeedback}
            </CardContent>
          </Card>
        </div>
      )}

      {showSubmitConfirmation ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/35 px-4 py-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Konfirmasi submit booking"
            className="w-full max-w-lg rounded-2xl border border-indigo-200 bg-white p-5 shadow-2xl"
          >
            <p className="text-base font-semibold text-indigo-900">
              Konfirmasi Sebelum Submit
            </p>
            <p className="mt-2 text-sm text-indigo-800">
              Pastikan orderan sudah dicek dan semua data sudah benar sebelum
              lanjut simpan booking.
            </p>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-gray-300"
                onClick={closeSubmitConfirmationReminder}
                disabled={isManualSubmitInFlight || isBookingCreationInFlight}
              >
                Batal Dulu
              </Button>
              <Button
                ref={submitConfirmationPrimaryButtonRef}
                type="button"
                className="bg-indigo-600 text-white hover:bg-indigo-700"
                onClick={confirmSubmitAfterReminder}
                disabled={isManualSubmitInFlight || isBookingCreationInFlight}
              >
                Ya, Sudah Dicek
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {duplicateTemplateWarning ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 py-6">
          <div
            ref={duplicateWarningDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Peringatan Potensi Double Order"
            className="relative w-full max-w-2xl rounded-2xl border border-amber-200 bg-white p-5 shadow-2xl"
          >
            <Button
              type="button"
              variant="ghost"
              className="absolute right-3 top-3 h-8 w-8 text-amber-700 hover:bg-amber-100 hover:text-amber-900"
              onClick={closeDuplicateTemplateWarning}
              aria-label="Tutup peringatan"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
            <p className="text-base font-semibold text-amber-900">
              Peringatan Potensi Double Order
            </p>
            <p className="mt-2 text-sm text-amber-800">
              Parsing template yang sama persis atau sangat mirip sudah pernah
              dipakai di booking lain. Silakan cek dulu daftar booking untuk
              memastikan bukan order duplikat, atau lanjutkan jika memang order
              baru.
            </p>

            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                Cuplikan Template
              </p>
              <p className="mt-1 whitespace-pre-wrap wrap-break-word text-xs text-amber-900">
                {duplicateTemplateWarning.templatePreview}
              </p>
            </div>

            <div className="mt-3 max-h-44 space-y-2 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3">
              {duplicateTemplateWarning.matches.map((match) => (
                <NextLink
                  key={match.id}
                  href={`/bakery/bookings/${match.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 hover:border-indigo-300 hover:bg-indigo-50"
                >
                  <p className="font-semibold text-gray-900">
                    {match.bookingLabel}
                  </p>
                  <p className="mt-0.5">
                    {match.customerName} • {match.deliveryDateLabel}
                  </p>
                  <p
                    className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      match.matchType === "exact"
                        ? "border-rose-200 bg-rose-50 text-rose-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {match.similarityLabel}
                  </p>
                </NextLink>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button
                ref={duplicateWarningPrimaryButtonRef}
                type="button"
                variant="outline"
                className="border-gray-300"
                onClick={openDetectedDuplicateBooking}
                disabled={isManualSubmitInFlight || isBookingCreationInFlight}
              >
                Cek Booking Dulu
              </Button>
              <Button
                type="button"
                className="bg-amber-600 text-white hover:bg-amber-700"
                onClick={continueDuplicateTemplateSubmission}
                disabled={isManualSubmitInFlight || isBookingCreationInFlight}
              >
                Lanjutkan Pesan Dengan Template Sama
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {isBookingProcessing ? (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200/70 bg-white/95 shadow-2xl">
            <div className="relative h-1 w-full overflow-hidden bg-slate-200">
              <div
                className="h-full bg-linear-to-r from-indigo-500 via-cyan-500 to-emerald-500 transition-[width] duration-500 ease-out"
                style={{ width: `${bookingProgressPercent}%` }}
              />
            </div>

            <div className="space-y-4 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-linear-to-br from-indigo-600 to-cyan-500 text-white shadow-lg">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-indigo-700">
                    Processing Booking
                  </p>
                  <p className="text-base font-semibold text-slate-900">
                    {bookingProgressLabel}
                  </p>
                </div>
              </div>

              <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-sm">
                <div className="flex items-center justify-between text-slate-700">
                  <span>Validasi kapasitas</span>
                  <span className="font-semibold text-slate-900">
                    {isCapacityValidating ? "Sedang diproses" : "Siap"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-700">
                  <span>Simpan booking</span>
                  <span className="font-semibold text-slate-900">
                    {isBookingCreationInFlight
                      ? "Menyimpan"
                      : isBookingProcessing
                        ? "Menunggu"
                        : "Siap"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-700">
                  <span>Sinkron data & trigger otomatis</span>
                  <span className="font-semibold text-slate-900">
                    Berjalan otomatis
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-600">
                Mohon tunggu sebentar. Jangan tutup tab agar proses booking
                selesai sempurna.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}
