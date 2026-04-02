"use client";

import { useEffect, useMemo, useState } from "react";
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
  type ParsedWhatsAppOrder,
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
import { useCatalogAdminState } from "@/lib/bookings/catalog-admin";
import {
  CAPACITY_LABELS,
  CAPACITY_LIMITS,
  DAILY_PRODUCTION_TOKEN_LIMIT,
  checkSlotAvailability,
  countConcurrentOrdersByTypeForSlot,
  getSlotLimitByOrderType,
  getDeliverySlotsForDate,
  inferOrderTypeFromItems,
  isWithinBusinessHours,
  isDateBlockedForOrdering,
  summarizeCapacityByItems,
  summarizeCapacityByOrdersForDate,
  summarizeProductionTokensByItems,
  summarizeProductionTokensByOrdersForDate,
  type SlotAvailabilityStatus,
  type SlotOrderType,
  type CapacityBucket,
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

const defaultItemSelection = getDefaultCatalogSelection();
const CAPACITY_BUCKET_ORDER: CapacityBucket[] = [
  "seasonal_cookies",
  "custom_cookies",
  "cake_tower",
  "cupcakes",
  "bouquet",
];

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
  notes: z.string().max(200).optional().or(z.literal("")),
});

const addressSchema = z.object({
  label: z.string().min(1, "Address label is required"),
  area: z.string().default(""),
  postalCode: z.string().default(""),
  addressLine: z.string().min(5, "Address is too short"),
});

const bookingSchema = z.object({
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
  customNotes: z.string().max(400).optional().or(z.literal("")),
  paymentStatus: z.enum(["Pending", "DP Paid", "Paid"]),
  dpPaidAmount: z.number().default(0),
  finalPaidAmount: z.number().default(0),
  manualAdjustment: z.number().default(0),
  items: z.array(itemSchema).min(1, "At least one item is required"),
  deliveryAddresses: z
    .array(addressSchema)
    .min(1, "At least one address is required"),
});

type BookingFormInput = z.input<typeof bookingSchema>;
type BookingFormValues = z.output<typeof bookingSchema>;
type BookingItemInput = BookingFormInput["items"][number];
type ParserSource = WhatsAppSourceType;
type ParserOrderType = WhatsAppOrderType | "unknown";
const EMPTY_ITEMS: BookingFormInput["items"] = [];
const EMPTY_ADDRESSES: BookingFormInput["deliveryAddresses"] = [];

type BouquetFormType = "HAND" | "STANDING";

const BOUQUET_HAND_COST = 100000;
const BOUQUET_STANDING_COST = 250000;
const BOUQUET_HAND_MIN_QTY = 7;
const BOUQUET_HAND_MAX_QTY = 10;
const BOUQUET_STANDING_MIN_QTY = 12;
const BOUQUET_STANDING_MAX_QTY = 20;

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

interface ParseWhatsAppApiResponse {
  success: boolean;
  parsed: ParsedWhatsAppOrder;
  autoFill: BookingFormAutoFill;
  warnings?: string[];
  visionRawOutput?: string | null;
  error?: string;
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

function getBouquetLineTotal(item: BookingItemInput): number | null {
  const bouquetType = detectBouquetTypeFromItem(item);
  if (!bouquetType) return null;

  const quantity = Number(item.quantity) || 0;
  const cookiePrice = Number(item.cookiePrice) || 0;
  if (quantity <= 0 || cookiePrice <= 0) return null;
  if (!isValidBouquetQuantity(quantity, bouquetType)) return null;

  return Math.round(cookiePrice * quantity + getBouquetCostByType(bouquetType));
}

function getItemBasePrice(
  catalog: PricelistCategory[],
  item: BookingItemInput,
): number {
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

export default function BookingForm() {
  const { addOrder, orders } = useOrders();
  const { productCatalog, addOnCatalog } = useCatalogAdminState();
  const [quickPaste, setQuickPaste] = useState("");
  const [parserSource, setParserSource] = useState<ParserSource>("text");
  const [selectedOrderType, setSelectedOrderType] =
    useState<ParserOrderType>("unknown");
  const [uploadedChatImages, setUploadedChatImages] = useState<File[]>([]);
  const [isParsingWhatsApp, setIsParsingWhatsApp] = useState(false);
  const [isFetchingMarketplaceEmail, setIsFetchingMarketplaceEmail] =
    useState(false);
  const [parsedPreview, setParsedPreview] =
    useState<ParsedWhatsAppOrder | null>(null);
  const [visionRawOutput, setVisionRawOutput] = useState("");
  const [draftImported, setDraftImported] = useState(false);
  const [shippingQuotes, setShippingQuotes] = useState<ShippingQuote[]>([]);
  const [selectedShippingQuoteId, setSelectedShippingQuoteId] = useState("");
  const [shippingDistanceKm, setShippingDistanceKm] = useState<number | null>(
    null,
  );
  const [shippingWarning, setShippingWarning] = useState("");
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
      paymentStatus: "Pending",
      dpPaidAmount: 0,
      finalPaidAmount: 0,
      manualAdjustment: 0,
      items: [
        {
          category: defaultItemSelection.category,
          subcategory: defaultItemSelection.subcategory,
          productName: defaultItemSelection.productName,
          size: defaultItemSelection.size,
          quantity: 1,
          tokenDifficulty: "SIMPLE",
          customTokenPerUnit: undefined,
          cookiePrice: undefined,
          addOns: [],
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

  const addOnTotal = useMemo(() => {
    return watchedItems.reduce((sum, item) => {
      const categoryAddOns = getCategoryAddOnsFromCatalog(
        addOnCatalog,
        item.category,
      );
      const perItemAddOn = (item.addOns ?? []).reduce((addonSum, addonId) => {
        const found = categoryAddOns.find((entry) => entry.id === addonId);
        return addonSum + (found?.price ?? 0);
      }, 0);
      return sum + perItemAddOn * (Number(item.quantity) || 0);
    }, 0);
  }, [watchedItems, addOnCatalog]);

  const shouldUseShippingEngine = useMemo(
    () => usesShippingEngine(deliveryMethod as DeliveryMethod),
    [deliveryMethod],
  );

  const methodSpecificShippingQuotes = useMemo(() => {
    if (!shouldUseShippingEngine) return [];

    const isCarService = (quote: ShippingQuote) => {
      const source =
        `${quote.courierServiceCode} ${quote.courierServiceName}`.toLowerCase();
      return source.includes("car") || source.includes("4w");
    };

    const isBikeService = (quote: ShippingQuote) => {
      const source =
        `${quote.courierServiceCode} ${quote.courierServiceName}`.toLowerCase();
      return (
        source.includes("gosend") ||
        source.includes("go send") ||
        source.includes("bike") ||
        source.includes("motor") ||
        source.includes("instant") ||
        source.includes("same day") ||
        source.includes("sameday") ||
        source.includes("2w")
      );
    };

    const gojekQuotes = shippingQuotes.filter(
      (quote) => quote.provider === "GOJEK",
    );
    const grabQuotes = shippingQuotes.filter(
      (quote) => quote.provider === "GRAB",
    );

    if (deliveryMethod === "ASSISTED_PAXEL") {
      return shippingQuotes.filter((quote) => quote.provider === "PAXEL");
    }

    if (deliveryMethod === "ASSISTED_GRAB") {
      return grabQuotes;
    }

    if (deliveryMethod === "ASSISTED_GOSEND") {
      const gojekBikeQuotes = gojekQuotes.filter(isBikeService);
      return gojekBikeQuotes;
    }

    if (deliveryMethod === "ASSISTED_GOCAR") {
      const gojekCarQuotes = gojekQuotes.filter(isCarService);
      return gojekCarQuotes;
    }

    if (deliveryMethod === "REGULAR_JNE_JNT") {
      return shippingQuotes.filter(
        (quote) => quote.provider === "JNE" || quote.provider === "JNT",
      );
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
  }, [deliveryMethod, shippingQuotes, shouldUseShippingEngine]);

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

  const filteredShippingQuotes = methodSpecificShippingQuotes;

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
      return "Layanan JNE/J&T belum tersedia untuk alamat ini. Pilih metode lain atau ubah alamat penerima.";
    }
    return "Layanan kurir pada metode terpilih belum tersedia. Pilih metode lain atau ubah alamat penerima.";
  }, [deliveryMethod, isShippingFallbackActive]);

  const selectedShippingQuote = useMemo(
    () =>
      filteredShippingQuotes.find(
        (quote) => quote.id === selectedShippingQuoteId,
      ) ?? null,
    [filteredShippingQuotes, selectedShippingQuoteId],
  );

  useEffect(() => {
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

  const grabCarOnlyReasons = useMemo(
    () => getGrabCarOnlyReasons(watchedItems),
    [watchedItems],
  );
  const isGrabCarOnlyOrder = grabCarOnlyReasons.length > 0;
  const grabCarCompatibleMethods: DeliveryMethod[] = [
    "CUSTOMER_APP_COURIER",
    "ASSISTED_GRAB",
    "ASSISTED_GOCAR",
  ];
  const isGrabCarMethodSelected = grabCarCompatibleMethods.includes(
    deliveryMethod as DeliveryMethod,
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
  const effectivePaymentStatus =
    totalPaid <= 0 ? "Pending" : remainingBalance <= 0 ? "Paid" : "DP Paid";

  const deliverySlots = useMemo(
    () => getDeliverySlotsForDate(deliveryDate),
    [deliveryDate],
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
    deliveryDate && isDateBlockedForOrdering(deliveryDate),
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
      });
      return {
        slot,
        used,
        status,
      };
    });
  }, [orders, deliveryDate, deliverySlots, draftOrderType]);

  const slotStatusByTime = useMemo(() => {
    return new Map(slotAvailability.map((entry) => [entry.slot, entry.status]));
  }, [slotAvailability]);

  const existingCapacityUsage = useMemo(() => {
    if (!deliveryDate) return null;
    return summarizeCapacityByOrdersForDate(orders, deliveryDate);
  }, [orders, deliveryDate]);

  const incomingCapacityUsage = useMemo(() => {
    return summarizeCapacityByItems(watchedItems);
  }, [watchedItems]);

  const existingProductionTokens = useMemo(() => {
    if (!deliveryDate) return 0;
    return summarizeProductionTokensByOrdersForDate(orders, deliveryDate);
  }, [orders, deliveryDate]);

  const incomingProductionTokens = useMemo(() => {
    return summarizeProductionTokensByItems(watchedItems);
  }, [watchedItems]);

  const plannedProductionTokens =
    existingProductionTokens + incomingProductionTokens;
  const remainingProductionTokens =
    DAILY_PRODUCTION_TOKEN_LIMIT - plannedProductionTokens;
  const isTokenCapacityOverflow = remainingProductionTokens < 0;

  // ── Real-time token preview (new business rules via calculateOrderTokenFromItems) ──
  const newTokenPreview = useMemo(
    () => calculateOrderTokenFromItems(watchedItems),
    [watchedItems],
  );

  // ── DB-backed capacity for the selected delivery date ────────────────────────
  const dbCapacity = useMemo(() => {
    if (!normalizedDeliveryDate) {
      return { usedToken: 0, maxToken: 600 };
    }
    const entry = getCalendarCapacity(normalizedDeliveryDate);
    return {
      usedToken: entry.usedToken,
      maxToken: entry.maxToken,
    };
  }, [normalizedDeliveryDate, getCalendarCapacity]);

  const dbRemainingToken = dbCapacity.maxToken - dbCapacity.usedToken;
  const dbWillExceed = newTokenPreview > dbRemainingToken;
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

        // Skip blocked dates
        if (!BAKERY_BLOCKED_DATES.includes(dateKey)) {
          // Skip past and cutoff
          if (!isDateBlockedForOrdering(dateKey, now)) {
            const cap = getRecommendationCapacity(dateKey);
            const remaining = cap.maxToken - cap.usedToken;
            if (remaining >= newTokenPreview) {
              suggestions.push({ dateKey, remaining });
            }
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
  ]);

  const handleSuggestionClick = (dateKey: string) => {
    setValue("deliveryDate", dateKey, { shouldValidate: true });
    setTimeout(() => {
      refetchSelectedDateCapacity();
    }, 0);
  };

  const capacityRows = useMemo(() => {
    return CAPACITY_BUCKET_ORDER.map((bucket) => {
      const existing = existingCapacityUsage?.[bucket] ?? 0;
      const incoming = incomingCapacityUsage[bucket] ?? 0;
      const planned = existing + incoming;
      const limit = CAPACITY_LIMITS[bucket];

      return {
        bucket,
        label: CAPACITY_LABELS[bucket],
        existing,
        incoming,
        planned,
        limit,
        over: planned > limit,
      };
    });
  }, [existingCapacityUsage, incomingCapacityUsage]);

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
        primaryAddress.postalCode?.trim() ||
        primaryAddress.addressLine.match(/\b\d{5}\b/)?.[0],
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

  useEffect(() => {
    if (!shippingPayload) {
      setIsCheckingShipping(false);
      setShippingQuotes([]);
      setSelectedShippingQuoteId("");
      setShippingDistanceKm(null);
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
          body: JSON.stringify(shippingPayload),
        });

        const payload = (await response
          .json()
          .catch(() => ({}))) as ShippingQuoteResponse;
        if (!response.ok || !payload.success || !payload.quotes?.length) {
          throw new Error(
            payload.error || "Gagal mengambil ongkir live JNE/Paxel/J&T.",
          );
        }

        const sortedQuotes = payload.quotes
          .slice()
          .sort((a, b) => a.price - b.price);
        setShippingQuotes(sortedQuotes);
        setSelectedShippingQuoteId((current) => {
          if (current && sortedQuotes.some((quote) => quote.id === current))
            return current;
          return sortedQuotes[0]?.id || "";
        });
        setShippingDistanceKm(payload.distanceKm ?? null);
        setShippingWarning(payload.warning || "");
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        const message =
          error instanceof Error ? error.message : "Gagal cek ongkir.";
        setShippingQuotes([]);
        setSelectedShippingQuoteId("");
        setShippingDistanceKm(null);
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
  }, [shippingPayload]);

  const onSubmit: SubmitHandler<BookingFormValues> = async (values) => {
    setSubmitError("");
    setSubmitSuccess("");

    if (isCheckingShipping) {
      toast.error(
        "Ongkir masih dihitung otomatis. Tunggu beberapa detik lalu submit ulang.",
      );
      return;
    }

    if (
      isGrabCarOnlyOrder &&
      !grabCarCompatibleMethods.includes(deliveryMethod as DeliveryMethod)
    ) {
      toast.error(
        `Produk ${grabCarOnlyReasons.join(", ")} wajib GrabCar/GoCar. Pilih metode customer app, Grab (dibantu admin), atau GoCar (dibantu admin).`,
      );
      return;
    }

    if (shouldUseShippingEngine && !selectedShippingQuote) {
      toast.error(
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

    if (!isWithinBusinessHours(normalizedDeliveryDate, values.deliverySlot)) {
      toast.error(
        "Selected slot is outside business hours (Mon-Sat 10:00-22:00, Sun 10:00-15:00).",
      );
      return;
    }

    const existingTokens = summarizeProductionTokensByOrdersForDate(
      orders,
      normalizedDeliveryDate,
    );
    const incomingTokens = calculateOrderTokenFromItems(values.items);

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
        maxToken: Number(payload.data.maxToken) || 600,
        date: normalizedDeliveryDate,
      });

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

    const plannedTokens = existingTokens + incomingTokens;
    if (plannedTokens > DAILY_PRODUCTION_TOKEN_LIMIT) {
      toast.error(
        `Token produksi harian terlampaui (${plannedTokens}/${DAILY_PRODUCTION_TOKEN_LIMIT}). Pilih tanggal lain atau sederhanakan item difficulty tinggi.`,
      );
      return;
    }

    for (const item of values.items) {
      if (item.category !== "Buket") continue;

      const bouquetType = detectBouquetTypeFromItem(item);
      if (!bouquetType) {
        toast.error(
          "Tipe bouquet belum terbaca. Gunakan product Hand Bouquet atau Standing Bouquet.",
        );
        return;
      }

      const quantity = Number(item.quantity) || 0;
      if (!isValidBouquetQuantity(quantity, bouquetType)) {
        toast.error(
          `${bouquetType === "HAND" ? "Hand" : "Standing"} bouquet wajib qty ${getBouquetQtyRangeLabel(bouquetType)} cookies.`,
        );
        return;
      }

      const cookiePrice = Number(item.cookiePrice) || 0;
      if (cookiePrice <= 0) {
        toast.error(
          "Isi Harga Cookie / pcs untuk item bouquet supaya formula bisa dihitung.",
        );
        return;
      }
    }

    const mappedItems: OrderItem[] = values.items.map((item, index) => {
      const bouquetType = detectBouquetTypeFromItem(item);
      const itemBasePrice = getItemBasePrice(productCatalog, item);
      const categoryAddOns = getCategoryAddOnsFromCatalog(
        addOnCatalog,
        item.category,
      );
      const addOnTotalForItem =
        (item.addOns ?? []).reduce((sum, addonId) => {
          const addon = categoryAddOns.find((entry) => entry.id === addonId);
          return sum + (addon?.price ?? 0);
        }, 0) * item.quantity;

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
        basePrice: itemBasePrice,
        productType:
          item.category === "Buket" ? ("BOUQUET" as const) : undefined,
        cookiePrice:
          item.category === "Buket"
            ? Math.max(0, Number(item.cookiePrice) || 0) || undefined
            : undefined,
        bouquetType: bouquetType ?? undefined,
        bouquetCost: bouquetType
          ? getBouquetCostByType(bouquetType)
          : undefined,
        lineTotal: itemBasePrice,
        addOns: item.addOns,
        addOnTotal: addOnTotalForItem,
        notes: item.notes ?? "",
      };
    });

    const mappedAddresses = values.deliveryAddresses.map((address, index) => ({
      id: `addr-${Date.now()}-${index}`,
      label: address.label,
      area: address.area,
      addressLine: address.addressLine,
    }));

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
      whatsAppParsedData: parsedPreview ?? undefined,
      shippingQuote: selectedShippingQuote,
    };

    try {
      await addOrder(submissionPayload);
      setSubmitSuccess("Booking berhasil disimpan ke server.");

      setDraftImported(false);
      setQuickPaste("");
      setUploadedChatImages([]);
      setParsedPreview(null);
      setVisionRawOutput("");
      setShippingQuotes([]);
      setSelectedShippingQuoteId("");
      setShippingDistanceKm(null);
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
    const next = current.includes(addonId)
      ? current.filter((id) => id !== addonId)
      : [...current, addonId];
    setValue(`items.${itemIndex}.addOns`, next, { shouldValidate: true });
  };

  const importDraft = async (override?: {
    sourceType?: ParserSource;
    text?: string;
    files?: File[];
    successMessage?: string;
  }) => {
    const sourceType = override?.sourceType ?? parserSource;
    const textInput = (override?.text ?? quickPaste).trim();
    const sourceFiles = override?.files ?? uploadedChatImages;

    if (sourceType !== "image" && !textInput) {
      toast.error(
        "Paste text WhatsApp atau isi template manual terlebih dulu.",
      );
      return;
    }

    if (sourceType === "image" && sourceFiles.length === 0 && !textInput) {
      toast.error(
        "Upload gambar chat WA atau isi teks tambahan terlebih dulu.",
      );
      return;
    }

    setIsParsingWhatsApp(true);
    try {
      const formData = new FormData();
      formData.append("sourceType", sourceType);
      formData.append("orderType", selectedOrderType);
      if (textInput) {
        formData.append("text", textInput);
      }
      if (sourceFiles.length > 0) {
        sourceFiles.forEach((file) => formData.append("files", file));
      }

      const response = await fetch("/api/bookings/parse-whatsapp", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as ParseWhatsAppApiResponse;

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Gagal parse chat WhatsApp.");
      }

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
      if (draft.items?.length) {
        const normalizedItems: BookingFormInput["items"] = draft.items.map(
          (item) => {
            const normalized = ensureSelectionFromCatalog(productCatalog, {
              category: item.category,
              subcategory: item.subcategory,
              productName: item.productName,
              size: item.size,
            });

            return {
              category: normalized.category,
              subcategory: normalized.subcategory,
              productName: normalized.productName,
              size: normalized.size,
              quantity: Number.isFinite(item.quantity)
                ? Math.max(1, Number(item.quantity))
                : 1,
              tokenDifficulty:
                normalized.category === "Cookies" ? "SIMPLE" : undefined,
              customTokenPerUnit: undefined,
              cookiePrice: undefined,
              addOns: Array.isArray(item.addOns) ? item.addOns : [],
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

      setParsedPreview(payload.parsed);
      setVisionRawOutput(payload.visionRawOutput ?? "");
      setDraftImported(true);

      if (payload.warnings?.length) {
        toast.warning(payload.warnings.join(" "));
      } else {
        toast.success(
          override?.successMessage ||
            "Data WA berhasil diparse dan di-autofill. Mohon review sebelum submit.",
        );
      }
    } catch (error) {
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
      toast.error(
        "Untuk mode manual, pilih jenis order spesifik dulu (bukan Auto Detect).",
      );
      return;
    }
    setParserSource("manual");
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

      setParserSource("email");
      setQuickPaste(payload.message.text);
      await importDraft({
        sourceType: "email",
        text: payload.message.text,
        files: [],
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
          <CardTitle>
            WhatsApp & Email Parser (Image / Paste / Manual)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 px-6 pb-6 pt-0">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-gray-700">
              Sumber Input
              <Select
                value={parserSource}
                onChange={(event) =>
                  setParserSource(event.target.value as ParserSource)
                }
              >
                <option value="text">Copy Paste Chat WhatsApp</option>
                <option value="manual">Manual Input (Template)</option>
                <option value="image">Gambar Chat WhatsApp</option>
                <option value="email">Paste Email E-commerce</option>
              </Select>
            </label>
            <label className="grid gap-2 text-sm font-medium text-gray-700">
              Jenis Order
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
          </div>

          {parserSource === "image" && (
            <label className="grid gap-2 text-sm font-medium text-gray-700">
              Upload Gambar Chat WA
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(event) =>
                  setUploadedChatImages(Array.from(event.target.files ?? []))
                }
                className="block w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm"
              />
              {uploadedChatImages.length > 0 && (
                <span className="text-xs text-gray-500">
                  {uploadedChatImages.length} gambar dipilih.
                </span>
              )}
            </label>
          )}

          {(parserSource === "text" || parserSource === "manual") && (
            <Textarea
              value={quickPaste}
              onChange={(event) => setQuickPaste(event.target.value)}
              placeholder={
                parserSource === "manual"
                  ? "Klik tombol 'Isi Template Manual' lalu lengkapi field-nya."
                  : "Paste chat WA customer di sini untuk auto-parse."
              }
              className="min-h-28"
            />
          )}

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700"
              onClick={() => void importDraft()}
              disabled={isParsingWhatsApp}
            >
              <Upload size={16} />
              {isParsingWhatsApp ? "Parsing WhatsApp..." : "Parse WhatsApp"}
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
                setUploadedChatImages([]);
                setParsedPreview(null);
                setVisionRawOutput("");
                setDraftImported(false);
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
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Preview Hasil Parser (
                {WHATSAPP_ORDER_LABELS[parsedPreview.orderType]})
              </p>
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
              {(parserSource === "image" || parserSource === "email") &&
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
                  Daily Production Capacity ({deliveryDate})
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {capacityRows.map((entry) => (
                    <div
                      key={entry.bucket}
                      className={`rounded-lg border px-3 py-2 text-xs ${
                        entry.over
                          ? "border-rose-200 bg-rose-50 text-rose-700"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      <p className="font-semibold">{entry.label}</p>
                      <p className="mt-1 font-normal">
                        Existing {entry.existing} + Draft {entry.incoming} ={" "}
                        {entry.planned}/{entry.limit}
                      </p>
                    </div>
                  ))}
                </div>
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
                    Kapasitas:{" "}
                    <span className="font-semibold">
                      {dbCapacity.usedToken}/{dbCapacity.maxToken}
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
                    appendItem({
                      category: nextDefault.category,
                      subcategory: nextDefault.subcategory,
                      productName: nextDefault.productName,
                      size: nextDefault.size,
                      quantity: 1,
                      tokenDifficulty:
                        nextDefault.category === "Cookies"
                          ? "SIMPLE"
                          : undefined,
                      customTokenPerUnit: undefined,
                      cookiePrice: undefined,
                      addOns: [],
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
                  const bouquetProbeItem: BookingItemInput = {
                    category: normalizedSelection.category,
                    subcategory: normalizedSelection.subcategory,
                    productName: normalizedSelection.productName,
                    size: normalizedSelection.size,
                    quantity: Number(item?.quantity) || 0,
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
                  const isCookies = normalizedSelection.category === "Cookies";
                  const bouquetQtyRange = bouquetType
                    ? getBouquetQtyRangeLabel(bouquetType)
                    : "";
                  const bouquetLineTotal =
                    getBouquetLineTotal(bouquetProbeItem);
                  const itemGrabCarOnly = isGrabCarOnlyItem(bouquetProbeItem);
                  const quantityMin =
                    bouquetType === "HAND"
                      ? BOUQUET_HAND_MIN_QTY
                      : bouquetType === "STANDING"
                        ? BOUQUET_STANDING_MIN_QTY
                        : 1;

                  return (
                    <div
                      key={field.id}
                      className="space-y-2 rounded-xl border border-gray-200 p-3"
                    >
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
                                `items.${index}.cookiePrice`,
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
                          <Select
                            {...register(`items.${index}.subcategory`)}
                            value={normalizedSelection.subcategory}
                            onChange={(event) => {
                              const nextSub = event.target.value;
                              const nextSelection = ensureSelectionFromCatalog(
                                productCatalog,
                                {
                                  category: normalizedSelection.category,
                                  subcategory: nextSub,
                                },
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
                            }}
                          >
                            {subcategories.map((entry) => (
                              <option key={entry.name} value={entry.name}>
                                {entry.name}
                              </option>
                            ))}
                          </Select>
                        </label>

                        <label className="grid gap-2 text-sm font-medium text-gray-700">
                          Product
                          <Select
                            {...register(`items.${index}.productName`)}
                            value={normalizedSelection.productName}
                            onChange={(event) => {
                              const nextProduct = event.target.value;
                              const nextSelection = ensureSelectionFromCatalog(
                                productCatalog,
                                {
                                  category: normalizedSelection.category,
                                  subcategory: normalizedSelection.subcategory,
                                  productName: nextProduct,
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
                            }}
                          >
                            {products.map((product) => (
                              <option key={product.name} value={product.name}>
                                {product.name}
                              </option>
                            ))}
                          </Select>
                          {itemGrabCarOnly && (
                            <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">
                              GrabCar only
                            </span>
                          )}
                        </label>

                        <label className="grid gap-2 text-sm font-medium text-gray-700">
                          Varian / Size
                          <Select
                            {...register(`items.${index}.size`)}
                            value={normalizedSelection.size}
                            onChange={(event) => {
                              setValue(
                                `items.${index}.size`,
                                event.target.value,
                                { shouldValidate: true },
                              );
                            }}
                          >
                            {variants.map((sizeOption) => (
                              <option
                                key={sizeOption.label}
                                value={sizeOption.label}
                              >
                                {sizeOption.label} (
                                {formatCurrency(sizeOption.price)})
                              </option>
                            ))}
                          </Select>
                        </label>

                        <label className="grid gap-1.5 text-sm font-medium text-gray-700">
                          Quantity
                          <Input
                            type="number"
                            min={quantityMin}
                            {...register(`items.${index}.quantity`, {
                              valueAsNumber: true,
                            })}
                          />
                          {bouquetType && (
                            <span className="min-h-4 text-[11px] font-normal leading-4 text-gray-500">
                              {bouquetType === "HAND" ? "Hand" : "Standing"}{" "}
                              bouquet qty wajib {bouquetQtyRange}.
                            </span>
                          )}
                        </label>

                        {isCookies && (
                          <label className="grid gap-1.5 text-sm font-medium text-gray-700">
                            Difficulty Token
                            <Select
                              {...register(`items.${index}.tokenDifficulty`)}
                              defaultValue={item?.tokenDifficulty || "SIMPLE"}
                            >
                              <option value="SIMPLE">Simple (1)</option>
                              <option value="NORMAL">Normal (2)</option>
                              <option value="HARD">Hard (3)</option>
                              <option value="ADVANCED">Advanced (4)</option>
                              <option value="EXPERT">Expert (5)</option>
                            </Select>
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
                            Harga Cookie / pcs
                            <Input
                              type="number"
                              min={0}
                              step={500}
                              placeholder="Contoh: 20000"
                              {...register(`items.${index}.cookiePrice`, {
                                setValueAs: (value) => {
                                  const parsed = Number(value);
                                  return Number.isFinite(parsed) && parsed > 0
                                    ? parsed
                                    : undefined;
                                },
                              })}
                            />
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

                      <div className="grid gap-1.5 sm:grid-cols-3">
                        {addOns.map((addon) => (
                          <label
                            key={addon.id}
                            className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-700"
                          >
                            <span>
                              {addon.label}{" "}
                              <span className="text-xs text-gray-400">
                                {formatCurrency(addon.price)}
                              </span>
                            </span>
                            <input
                              type="checkbox"
                              checked={
                                item?.addOns?.includes(addon.id) ?? false
                              }
                              onChange={() => toggleItemAddOn(index, addon.id)}
                              className="h-4 w-4 accent-indigo-600"
                            />
                          </label>
                        ))}
                      </div>

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
                {addressFields.map((field, index) => (
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
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-gray-700">
                      Area (Opsional)
                      <Input
                        placeholder="Kecamatan / Kota"
                        {...register(`deliveryAddresses.${index}.area`)}
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-gray-700">
                      Kode Pos (Opsional)
                      <Input
                        inputMode="numeric"
                        placeholder="Contoh: 11470"
                        {...register(`deliveryAddresses.${index}.postalCode`)}
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-gray-700 sm:col-span-2">
                      Full Address
                      <Textarea
                        className="min-h-20"
                        placeholder="Street, block, note for courier"
                        {...register(`deliveryAddresses.${index}.addressLine`)}
                      />
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
                ))}
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
                  {DELIVERY_METHOD_OPTIONS.map((option) => (
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

              {isGrabCarOnlyOrder && (
                <p
                  className={`rounded-lg px-3 py-2 text-xs ${
                    isGrabCarMethodSelected
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border border-amber-200 bg-amber-50 text-amber-700"
                  }`}
                >
                  {isGrabCarMethodSelected
                    ? `Produk ${grabCarOnlyReasons.join(", ")} sudah menggunakan metode yang sesuai SOP (Grab/GoCar).`
                    : `Produk ${grabCarOnlyReasons.join(", ")} wajib GrabCar/GoCar sesuai SOP.`}
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
                  {filteredShippingQuotes.map((quote) => {
                    const active = quote.id === selectedShippingQuoteId;
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
                          <span className="font-semibold">
                            {quote.provider} - {quote.courierServiceName}
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
                </div>
              )}

              {!filteredShippingQuotes.length && !shippingPayload && (
                <p className="text-xs text-gray-500">
                  {shouldUseShippingEngine
                    ? isAddressTooShortForShipping
                      ? "Alamat terlalu pendek untuk kalkulasi ongkir. Lengkapi alamat minimal 8 karakter."
                      : "Lengkapi alamat penerima dan item order untuk kalkulasi ongkir otomatis."
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
                  <option value="Pending">Pending</option>
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
                  setUploadedChatImages([]);
                  setParsedPreview(null);
                  setVisionRawOutput("");
                  setDraftImported(false);
                  setShippingQuotes([]);
                  setSelectedShippingQuoteId("");
                  setShippingDistanceKm(null);
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
              {effectivePaymentStatus === "Pending" && (
                <p className="text-xs text-gray-500">
                  DP belum diinput/dibayar (status masih Pending).
                </p>
              )}
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
