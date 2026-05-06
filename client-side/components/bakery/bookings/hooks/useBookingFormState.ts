// Tidak perlu 'use client' di hook file

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
  isWithinBusinessHours,
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
  return hasLocationKeyword && hasNumber;
}

const defaultItemSelection = getDefaultCatalogSelection();


import { bookingSchema, BookingFormInput, BookingFormValues } from "../booking-form-schema";
import { BookingItemInput, ParserSource, ParserOrderType, EMPTY_ITEMS, EMPTY_ADDRESSES, BOUQUET_STANDING_MIN_QTY, COOKIE_CUSTOM_TOTAL_MIN_QTY, DARK_COLOR_BUTTERCREAM_ADDON_ID, MAX_DARK_BUTTERCREAM_COLORS, CUPCAKE_COOKIE_ADDON_IDS, FRAGILE_ORDER_ALLOWED_METHODS, FRAGILE_ORDER_ALLOWED_METHODS_TEXT, normalizeDarkButtercreamColors, isCupcakeCookieAddOnId, normalizeTokenDifficultyValue, normalizeBouquetCookiePriceValue, normalizeBouquetPriceOverrideValue, normalizeSharingBoxPriceOverrideValue, normalizeCookieDesignCount, getCookieAdditionalDesignCountFromItem, orderTypeLabel, BookingItemGroupLabel, getBookingItemGroupLabel, parseEtaToHours, ParseWhatsAppApiResponse, ParseWhatsAppRequestArgs, ParseWhatsAppApiError, CapacitySingleDateResponse, DuplicateTemplateWarningState, normalizeReferenceLabelInput, buildParsedReferenceImages, summarizeDetectedItems, getParsedSubtotalOverride, getParsedUnitPriceOverride, hasParsedPricingOverride, parseCookieDifficultyRows, formatCookieDifficultyRows, removeCookieBreakdownFromNotes, extractBouquetGreetingCardFromNotes, extractBouquetPaperColorFromNotes, extractBouquetRibbonFromNotes, extractBouquetFlowerCountFromNotes, extractBouquetFlowerColorFromNotes, extractBouquetRibbonColorFromNotes, removeBouquetStructuredFieldsFromNotes, inferBouquetFlowerCountFromAddOns, inferBouquetCookieFillQuantityFromText, ensureSelectionFromCatalog, getVariantsFromCatalog, getCategoryAddOnsFromCatalog, getCookieAdditionalDesignUnitPrice, getFlavorOptionsForCategory, normalizeAddOnQuantities, normalizeAddOnPriceOverrides, normalizeCustomAddOns, getCustomAddOnTotal, supportsAddOnQuantity, isTwoTierCakeItem, getTwoTierSummaryLabel, getAddOnUnitMultiplier, isBouquetFlowerAddOnId, calculatePerUnitAddOnPrice, detectBouquetTypeFromItem, getBouquetCostByType, resolveBouquetSelectionByType, isValidBouquetQuantity, getBouquetQtyRangeLabel, getQuantityRuleViolationMessage, resolveIndividualCupcakeSizeByQuantity, getAutoQuantityForItem, isCustomCookieItem, isCustomCookieSharingBoxItem, getItemQuantityRule, isMediumVariantLabel, resolveBouquetVariantForPaxel, getItemBasePrice, normalizeTokenLookupKey, getTotalProductionTokenSynced, getDraftItemPriceBreakdown, getDailyBookingSequence, generateBookingCode, normalizeDuplicateTemplateText, findOrdersWithDuplicateParsedTemplate, formatDuplicateWarningDate, formatTemplateSimilarityLabel } from "../booking-form-helpers";

// ── Custom Hook: Logika bisnis BookingForm ─────────────────────────────────
// Diekstrak otomatis dari BookingForm.tsx untuk mengurangi ukuran komponen.
function getShippingQuoteDisplayPrice(quote: ShippingQuote): number {
  return Math.max(0, quote.priceWithoutInsurance ?? quote.price ?? 0);
}

export function useBookingFormState() {
  const { addOrder, orders } = useOrders();
  const { isOwner, isAdmin, loading: isRoleLoading } = useRole();
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
  const [submitSuccessMeta, setSubmitSuccessMeta] = useState<{
    bookingCode: string;
    submittedAt: string;
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
  const shouldRequireSubmitConfirmation =
    !isRoleLoading && (isOwner || isAdmin);
  const canWarnDuplicateTemplate = !isRoleLoading && (isOwner || isAdmin);
  const [productTokenByName, setProductTokenByName] = useState<Map<string, number>>(
    new Map(),
  );

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    const refreshTokenMap = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch("/api/products/token-map", {
          cache: "no-store",
          credentials: "include",
        });
        if (!response.ok) return;
        const payload = (await response.json().catch(() => ({}))) as {
          success?: boolean;
          data?: Array<{ name: string; productionToken: number }>;
        };
        if (!payload.success || !Array.isArray(payload.data)) return;
        if (cancelled) return;
        const tokenMap = new Map<string, number>();
        payload.data.forEach((product) => {
          tokenMap.set(
            normalizeTokenLookupKey(product.name),
            Math.max(0, Number(product.productionToken ?? 0)),
          );
        });
        setProductTokenByName(tokenMap);
      } catch {
        // fallback to calculator path only
      } finally {
        inFlight = false;
      }
    };

    void refreshTokenMap();
    const intervalId = window.setInterval(() => {
      void refreshTokenMap();
    }, 10_000);
    const onFocus = () => {
      void refreshTokenMap();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshTokenMap();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

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
  const wholesaleDiscountPercent =
    useWatch({ control, name: "wholesaleDiscountPercent" }) ?? 0;
  const manualAdjustment = useWatch({ control, name: "manualAdjustment" }) ?? 0;
  const selectedPaymentStatus =
    useWatch({ control, name: "paymentStatus" }) ?? "DP Paid";
  const isManualShippingOverride =
    useWatch({ control, name: "isManualShippingOverride" }) ?? false;
  const manualShippingFee =
    useWatch({ control, name: "manualShippingFee" }) ?? 0;

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
  const { settings: bakerySettings } = useBakerySettings();
  const blockedDates = bakerySettings?.blockedDates ?? BAKERY_BLOCKED_DATES;

  const selectedCalendarStatus = useMemo(() => {
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
      { blockedDates },
    );
  }, [normalizedDeliveryDate, getCalendarCapacity, blockedDates]);

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

  const itemPriceBreakdowns = useMemo(() => {
    return watchedItems.map((item) =>
      getDraftItemPriceBreakdown({
        catalog: productCatalog,
        addOnCatalog,
        item,
      }),
    );
  }, [watchedItems, productCatalog, addOnCatalog]);

  const basePrice = useMemo(() => {
    return itemPriceBreakdowns.reduce((sum, item) => {
      return sum + item.baseAmount;
    }, 0);
  }, [itemPriceBreakdowns]);

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
    () => usesShippingEngine(deliveryMethod as DeliveryMethod),
    [deliveryMethod],
  );
  const isCarRideHailingMethod =
    deliveryMethod === "ASSISTED_GOCAR" || deliveryMethod === "ASSISTED_GRAB";
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

    if (deliveryMethod === "ASSISTED_PAXEL") {
      const paxelQuotes = shippingQuotes.filter(
        (quote) => quote.provider === "PAXEL",
      );
      return paxelQuotes;
    }

    if (deliveryMethod === "ASSISTED_GRAB") {
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

  const shouldAutoSwitchGoCarToGrab =
    deliveryMethod === "ASSISTED_GOCAR" &&
    filteredShippingQuotes.length > 0 &&
    !filteredShippingQuotes.some((quote) => quote.provider === "GOJEK") &&
    filteredShippingQuotes.some((quote) => quote.provider === "GRAB");

  const shouldAutoSwitchGrabToGoCar =
    deliveryMethod === "ASSISTED_GRAB" &&
    filteredShippingQuotes.length > 0 &&
    !filteredShippingQuotes.some((quote) => quote.provider === "GRAB") &&
    filteredShippingQuotes.some((quote) => quote.provider === "GOJEK");

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

  useEffect(() => {
    if (!shouldAutoSwitchGoCarToGrab) return;

    setValue("deliveryMethod", "ASSISTED_GRAB", {
      shouldValidate: true,
    });
    toast.message(
      "GoCar belum tersedia untuk alamat ini. Metode dialihkan ke Grab (dibantu admin) dengan layanan car yang tersedia.",
    );
  }, [setValue, shouldAutoSwitchGoCarToGrab]);

  useEffect(() => {
    if (!shouldAutoSwitchGrabToGoCar) return;

    setValue("deliveryMethod", "ASSISTED_GOCAR", {
      shouldValidate: true,
    });
    toast.message(
      "Grab belum tersedia untuk alamat ini. Metode dialihkan ke GoCar (dibantu admin) dengan layanan car yang tersedia.",
    );
  }, [setValue, shouldAutoSwitchGrabToGoCar]);

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

  const deliveryFee = isManualShippingOverride
    ? manualShippingFee
    : shouldUseShippingEngine
      ? (selectedShippingQuote?.priceWithoutInsurance ??
          selectedShippingQuote?.price ??
          0)
      : 0;
  const insuranceFeeFromShipping = shouldUseShippingEngine
    ? (selectedShippingQuote?.insuranceFee ?? 0)
    : 0;
  const serviceCharge = resolveAdminServiceCharge(deliveryMethod);

  const isJneJnt = deliveryMethod === "REGULAR_JNE_JNT" || selectedShippingQuote?.provider === "JNE" || selectedShippingQuote?.provider === "JNT";
  const itemsSubtotal = basePrice + addOnTotal;
  const requiresInsurance = isJneJnt && itemsSubtotal > 2000000;
  const insuranceFeeByRule = requiresInsurance
    ? Math.round(itemsSubtotal * 0.003) + 5000
    : 0;
  // Business rule: khusus JNE/JNT jika nominal pembelian > 2 juta wajib pakai rumus 0.3% x subtotal item + 5000.
  const insuranceFee = isJneJnt ? insuranceFeeByRule : insuranceFeeFromShipping;

  const subtotalBeforeDiscount =
    basePrice +
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
  const suggestedDownPaymentAmount = calculateDownPayment(totalPrice);
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
  const effectivePaymentStatus: "DP Paid" | "Paid" =
    selectedPaymentStatus === "Paid" ? "Paid" : "DP Paid";

  const deliverySlots = useMemo(
    () =>
      getDeliverySlotsForDate(deliveryDate, undefined, {
        deliveryMethod,
        items: watchedItems,
        blockedDates,
      }),
    [deliveryDate, deliveryMethod, watchedItems, blockedDates],
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
    (isDateBlockedForOrdering(deliveryDate, undefined, {
      deliveryMethod,
      items: watchedItems,
      blockedDates,
    }) ||
      blockedDates.includes(normalizeDateInput(deliveryDate) ?? deliveryDate)),
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
          blockedDates,
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
    blockedDates,
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
            deliveryMethod,
            items: watchedItems,
            blockedDates,
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
    blockedDates,
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

        const sortedQuotes = enrichedQuotes.slice().sort(
          (a, b) =>
            getShippingQuoteDisplayPrice(a) - getShippingQuoteDisplayPrice(b),
        );
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
    setSubmitSuccessMeta(null);

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
          blockedDates,
        },
      )
    ) {
      toast.error(
        "Selected slot is outside business hours (Mon-Sat 10:00-22:00, Sun 10:00-15:00).",
      );
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
    }

    const totalCustomCookieQty = values.items.reduce((sum, item) => {
      if (!isCustomCookieItem(item)) return sum;
      return sum + Math.max(0, Number(item.quantity) || 0);
    }, 0);
    if (
      totalCustomCookieQty > 0 &&
      totalCustomCookieQty < COOKIE_CUSTOM_TOTAL_MIN_QTY
    ) {
      toast.error(
        `Total Custom Cookies minimal ${COOKIE_CUSTOM_TOTAL_MIN_QTY} pcs. Saat ini ${totalCustomCookieQty} pcs.`,
      );
      return;
    }

    for (const item of values.items) {
      if (!isCustomCookieItem(item)) continue;
      const designCount = normalizeCookieDesignCount(item.designCount);
      if (!designCount) {
        const productLabel = item.productName || item.category || "Item";
        toast.error(
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
          toast.error(`${productLabel}: pilih maksimal 1 rasa.`);
          return;
        }
      }

      if (item.category === "Cupcakes") {
        const selectedCookieAddOnCount = (item.addOns ?? []).filter((id) =>
          isCupcakeCookieAddOnId(id),
        ).length;
        if (selectedCookieAddOnCount > 1) {
          const productLabel = item.productName || item.category || "Item";
          toast.error(`${productLabel}: pilih maksimal 1 add-on cookie.`);
          return;
        }
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
        customTokenPerUnit: item.customTokenPerUnit,
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
        Number(values.wholesaleDiscountPercent || 0) > 0
          ? `Wholesale Discount: ${Number(values.wholesaleDiscountPercent || 0)}% (-${formatCurrency(wholesaleDiscountAmount)})`
          : "",
        `Delivery Method: ${
          DELIVERY_METHOD_OPTIONS.find(
            (option) => option.value === values.deliveryMethod,
          )?.label || values.deliveryMethod
        }`,
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
      shippingQuote: selectedShippingQuote,
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
      );

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

    if (!skipSubmitConfirmation && shouldRequireSubmitConfirmation) {
      pendingSubmitConfirmationRef.current = values;
      setShowSubmitConfirmation(true);
      return;
    }

    if (bookingCreateInFlightRef.current) {
      toast.warning(
        "Submit booking sebelumnya masih diproses. Tunggu sampai selesai.",
      );
      return;
    }

    try {
      bookingCreateInFlightRef.current = true;
      setDuplicateTemplateWarning(null);
      pendingDuplicateSubmissionRef.current = null;
      const shouldRedirectToOrders =
        submitFlowSourceRef.current === "duplicate-warning";
      setIsBookingCreationInFlight(true);
      await addOrder(submissionPayload);
      setSubmitSuccess("Booking berhasil disimpan ke server.");
      setSubmitSuccessMeta({
        bookingCode: predictedBookingCode,
        submittedAt: new Date().toISOString(),
      });

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
      setShowSubmitConfirmation(false);
      pendingSubmitConfirmationRef.current = null;
      skipSubmitConfirmationRef.current = false;
      skipDuplicateTemplateWarningRef.current = false;
      reset();

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
        error instanceof Error
          ? error.message
          : "Gagal menyimpan booking ke server.";
      setSubmitError(message);
      toast.error(message);
    } finally {
      bookingCreateInFlightRef.current = false;
      setIsBookingCreationInFlight(false);
    }
  };

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

        setValue("deliveryAddresses", normalizedAddresses, {
          shouldValidate: true,
        });
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


  return {
    addCustomAddOn,
    addOnCatalog,
    addOnTotal,
    addressFields,
    appendAddress,
    appendItem,
    autofillPostalCodeFromAddress,
    basePrice,
    blockedDates,
    bookingProgressLabel,
    bookingProgressPercent,
    calendarDateError,
    categoryPriceBreakdown,
    cheapestShippingQuote,
    clearParsedPricingOverride,
    closeDuplicateTemplateWarning,
    closeSubmitConfirmationReminder,
    confirmSubmitAfterReminder,
    continueDuplicateTemplateSubmission,
    control,
    dbWillExceed,
    deliveryDate,
    deliveryFee,
    deliveryMethod,
    deliverySlot,
    deliverySlots,
    displayedShippingDistanceKm,
    displayedShippingQuotes,
    draftImported,
    duplicateTemplateWarning,
    duplicateWarningDialogRef,
    errors,
    duplicateWarningPrimaryButtonRef,
    effectivePaymentStatus,
    fastestShippingQuote,
    fetchLatestMarketplaceEmail,
    fillManualTemplate,
    filteredShippingQuotes,
    fragileOrderReasons,
    handleSubmit,
    handleSuggestionClick,
    importDraft,
    insuranceFee,
    isAddressTooShortForShipping,
    isAllowedFragileOrderMethod,
    isBlockedDate,
    isBookingCreationInFlight,
    isBookingProcessing,
    isCalendarCapacityLoading,
    isCalendarDateInvalid,
    isCapacityValidating,
    isCarRideHailingMethod,
    isCheckingShipping,
    isFetchingMarketplaceEmail,
    isFragileOrder,
    isManualShippingOverride,
    isManualSubmitInFlight,
    isParsingWhatsApp,
    isRecommendationLoading,
    isSubmitting,
    itemFields,
    manualAdjustment,
    manualShippingFee,
    onSubmit,
    openDetectedDuplicateBooking,
    orderItemGroupingSummary,
    parsedPreview,
    pendingDuplicateSubmissionRef,
    pendingSubmitConfirmationRef,
    productCatalog,
    productTokenByName,
    productionPreviewImageUrl,
    quickPaste,
    referenceFileInputKey,
    referenceFilesChangedSinceParse,
    referenceImageFiles,
    referenceImageLabelsInput,
    register,
    remainingBalance,
    removeAddress,
    removeCustomAddOn,
    removeItem,
    reset,
    selectableDeliveryMethodOptions,
    selectedOrderType,
    selectedPaymentStatus,
    selectedShippingQuoteId,
    serviceCharge,
    setValue,
    setCustomAddOnLabel,
    setCustomAddOnPrice,
    setDraftImported,
    setDuplicateTemplateWarning,
    setItemAddOnPriceOverride,
    setItemAddOnQuantity,
    setParsedPreview,
    setProductionPreviewImageUrl,
    setQuickPaste,
    setReferenceFileInputKey,
    setReferenceFilesChangedSinceParse,
    setReferenceImageFiles,
    setReferenceImageLabelsInput,
    setSelectedOrderType,
    setSelectedShippingQuoteId,
    setShippingDistanceKm,
    setShippingDistanceSource,
    setShippingQuotes,
    setShippingWarning,
    setShowAllShippingOptions,
    setShowOrderTypeSelector,
    setShowSubmitConfirmation,
    setSubmitError,
    setSubmitSuccess,
    setSubmitSuccessMeta,
    setVisionRawOutput,
    shippingDistanceSource,
    shippingFallbackMessage,
    shippingPayload,
    shippingWarning,
    shippingWeightSummary,
    shouldShowDateRecommendations,
    shouldUseShippingEngine,
    showAllShippingOptions,
    showOrderTypeSelector,
    showSubmitConfirmation,
    skipDuplicateTemplateWarningRef,
    skipSubmitConfirmationRef,
    slotAvailability,
    slotLimitPerHour,
    slotProfileLabel,
    slotStatusByTime,
    submitConfirmationPrimaryButtonRef,
    submitError,
    submitSuccess,
    submitSuccessMeta,
    suggestedDates,
    suggestedDownPaymentAmount,
    toggleDarkButtercreamColor,
    toggleItemAddOn,
    toggleItemFlavor,
    totalPaid,
    totalPrice,
    watchedItems,
    wholesaleDiscountAmount,
    wholesaleDiscountPercent,
  };
}
