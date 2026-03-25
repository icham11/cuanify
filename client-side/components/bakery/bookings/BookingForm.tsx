"use client";

import { useEffect, useMemo, useState } from "react";
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
import { useOrders } from "@/components/bakery/store";
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
  BOOKING_ADD_ON_CATALOG,
  BOOKING_PRODUCT_CATALOG,
  ensureCatalogSelection,
  getDefaultCatalogSelection,
  getDefaultCatalogSelectionForCategory,
  getProductVariants,
  getUnitPriceBySelection,
} from "@/lib/bookings/pricelist";
import {
  CAPACITY_LABELS,
  CAPACITY_LIMITS,
  countConcurrentOrdersForSlot,
  getCapacityOverflows,
  getDeliverySlotsForDate,
  getSlotLimitByItems,
  summarizeCapacityByItems,
  summarizeCapacityByOrdersForDate,
  type CapacityBucket,
} from "@/lib/bookings/operations";
import {
  BAKERY_BLOCKED_DATES,
  calculateDownPayment,
  getDownPaymentLabel,
} from "@/lib/bookings/config";
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
  addOns: z.array(z.string()),
  notes: z.string().max(200).optional().or(z.literal("")),
});

const addressSchema = z.object({
  label: z.string().min(1, "Address label is required"),
  area: z.string().default(""),
  addressLine: z.string().min(5, "Address is too short"),
});

const bookingSchema = z.object({
  customerName: z.string().min(2, "Customer name is required"),
  phoneNumber: z.string().min(8, "Phone number is required"),
  deliveryDate: z.string().min(1, "Delivery date is required"),
  deliverySlot: z.string().min(1, "Delivery slot is required"),
  customNotes: z.string().max(400).optional().or(z.literal("")),
  paymentStatus: z.enum(["Pending", "DP Paid", "Paid"]),
  manualAdjustment: z.number().default(0),
  items: z.array(itemSchema).min(1, "At least one item is required"),
  deliveryAddresses: z
    .array(addressSchema)
    .min(1, "At least one address is required"),
});

type BookingFormInput = z.input<typeof bookingSchema>;
type BookingFormValues = z.output<typeof bookingSchema>;
type ParserSource = WhatsAppSourceType;
type ParserOrderType = WhatsAppOrderType | "unknown";
const EMPTY_ITEMS: BookingFormInput["items"] = [];
const EMPTY_ADDRESSES: BookingFormInput["deliveryAddresses"] = [];

interface ParseWhatsAppApiResponse {
  success: boolean;
  parsed: ParsedWhatsAppOrder;
  autoFill: BookingFormAutoFill;
  warnings?: string[];
  visionRawOutput?: string | null;
  error?: string;
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

function getCategoryAddOns(category: string) {
  return BOOKING_ADD_ON_CATALOG[category] ?? [];
}

const WEIGHT_ESTIMATE_GRAM_BY_CATEGORY: Record<string, number> = {
  Cake: 1800,
  Cookies: 350,
  Cupcakes: 450,
  Buket: 1200,
  "Cookies Tower": 3000,
};

function estimateItemWeightGram(category: string, quantity: number): number {
  const base = WEIGHT_ESTIMATE_GRAM_BY_CATEGORY[category] ?? 500;
  const qty = Math.max(1, Number(quantity) || 1);
  return Math.max(100, Math.round(base * qty));
}

export default function BookingForm() {
  const { addOrder, orders } = useOrders();
  const [quickPaste, setQuickPaste] = useState("");
  const [parserSource, setParserSource] = useState<ParserSource>("text");
  const [selectedOrderType, setSelectedOrderType] =
    useState<ParserOrderType>("unknown");
  const [uploadedChatImages, setUploadedChatImages] = useState<File[]>([]);
  const [isParsingWhatsApp, setIsParsingWhatsApp] = useState(false);
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

  const {
    register,
    handleSubmit,
    setValue,
    control,
    reset,
    formState: { errors },
  } = useForm<BookingFormInput, unknown, BookingFormValues>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      customerName: "",
      phoneNumber: "",
      deliveryDate: "",
      deliverySlot: "",
      customNotes: "",
      paymentStatus: "Pending",
      manualAdjustment: 0,
      items: [
        {
          category: defaultItemSelection.category,
          subcategory: defaultItemSelection.subcategory,
          productName: defaultItemSelection.productName,
          size: defaultItemSelection.size,
          quantity: 1,
          addOns: [],
          notes: "",
        },
      ],
      deliveryAddresses: [
        {
          label: "Primary",
          area: "",
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
  const manualAdjustment = useWatch({ control, name: "manualAdjustment" }) ?? 0;
  const paymentStatus = useWatch({ control, name: "paymentStatus" });

  const basePrice = useMemo(() => {
    return watchedItems.reduce((sum, item) => {
      const unit = getUnitPriceBySelection({
        category: item.category,
        subcategory: item.subcategory,
        productName: item.productName,
        size: item.size,
      });
      const qty = Number(item.quantity) || 0;
      return sum + unit * qty;
    }, 0);
  }, [watchedItems]);

  const addOnTotal = useMemo(() => {
    return watchedItems.reduce((sum, item) => {
      const categoryAddOns = getCategoryAddOns(item.category);
      const perItemAddOn = (item.addOns ?? []).reduce((addonSum, addonId) => {
        const found = categoryAddOns.find((entry) => entry.id === addonId);
        return addonSum + (found?.price ?? 0);
      }, 0);
      return sum + perItemAddOn * (Number(item.quantity) || 0);
    }, 0);
  }, [watchedItems]);

  const selectedShippingQuote = useMemo(
    () =>
      shippingQuotes.find((quote) => quote.id === selectedShippingQuoteId) ??
      null,
    [shippingQuotes, selectedShippingQuoteId],
  );

  const deliveryFee = selectedShippingQuote?.price ?? 0;

  const totalPrice = Math.max(
    0,
    basePrice + addOnTotal + deliveryFee + Number(manualAdjustment || 0),
  );
  const suggestedDownPaymentAmount = calculateDownPayment(totalPrice);
  const downPaymentAmount =
    paymentStatus === "DP Paid" || paymentStatus === "Paid"
      ? suggestedDownPaymentAmount
      : 0;
  const remainingBalance =
    paymentStatus === "Paid"
      ? 0
      : paymentStatus === "DP Paid"
        ? Math.max(0, totalPrice - downPaymentAmount)
        : totalPrice;

  const deliverySlots = useMemo(
    () => getDeliverySlotsForDate(deliveryDate),
    [deliveryDate],
  );
  const slotLimitPerHour = useMemo(
    () => getSlotLimitByItems(watchedItems),
    [watchedItems],
  );
  const slotProfileLabel = slotLimitPerHour === 7 ? "Seasonal/Bulk" : "Custom";
  const isBlockedDate = Boolean(
    deliveryDate && BAKERY_BLOCKED_DATES.includes(deliveryDate),
  );

  useEffect(() => {
    if (!deliveryDate) return;
    if (!deliverySlot || deliverySlots.includes(deliverySlot)) return;
    setValue("deliverySlot", deliverySlots[0] ?? "", { shouldValidate: true });
  }, [deliveryDate, deliverySlot, deliverySlots, setValue]);

  const slotUsage = useMemo(() => {
    if (!deliveryDate || !deliverySlot) return 0;
    return countConcurrentOrdersForSlot({
      orders,
      deliveryDate,
      deliverySlot,
      targetItems: watchedItems,
    });
  }, [orders, deliveryDate, deliverySlot, watchedItems]);

  const isSlotFull = slotUsage >= slotLimitPerHour;

  const slotAvailability = useMemo(() => {
    if (!deliveryDate) return [];
    return deliverySlots.map((slot) => {
      const used = countConcurrentOrdersForSlot({
        orders,
        deliveryDate,
        deliverySlot: slot,
        targetItems: watchedItems,
      });
      return {
        slot,
        used,
        full: used >= slotLimitPerHour,
      };
    });
  }, [orders, deliveryDate, deliverySlots, slotLimitPerHour, watchedItems]);

  const existingCapacityUsage = useMemo(() => {
    if (!deliveryDate) return null;
    return summarizeCapacityByOrdersForDate(orders, deliveryDate);
  }, [orders, deliveryDate]);

  const incomingCapacityUsage = useMemo(() => {
    return summarizeCapacityByItems(watchedItems);
  }, [watchedItems]);

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
      const unitPrice = getUnitPriceBySelection({
        category: item.category,
        subcategory: item.subcategory,
        productName: item.productName,
        size: item.size,
      });

      return {
        name: `${item.productName} (${item.size})`,
        quantity: Math.max(1, Number(item.quantity) || 1),
        weightGram: estimateItemWeightGram(
          item.category,
          Number(item.quantity) || 1,
        ),
        value: Math.max(
          1000,
          Math.round(unitPrice * (Number(item.quantity) || 1)),
        ),
      };
    });
  }, [watchedItems]);

  const shippingPayload = useMemo(() => {
    if (
      !primaryAddress?.addressLine ||
      primaryAddress.addressLine.trim().length < 8
    )
      return null;
    if (!shippingItems.length) return null;

    return {
      destinationAddress: primaryAddress.addressLine,
      destinationArea: primaryAddress.area || "",
      destinationPostalCode: primaryAddress.addressLine.match(/\b\d{5}\b/)?.[0],
      items: shippingItems,
      totalValue: Math.max(1000, Math.round(basePrice + addOnTotal)),
    };
  }, [
    addOnTotal,
    basePrice,
    primaryAddress?.addressLine,
    primaryAddress?.area,
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
            payload.error || "Gagal mengambil ongkir live JNE/Paxel.",
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

  const onSubmit: SubmitHandler<BookingFormValues> = (values) => {
    if (isCheckingShipping) {
      toast.error(
        "Ongkir masih dihitung otomatis. Tunggu beberapa detik lalu submit ulang.",
      );
      return;
    }

    if (!selectedShippingQuote) {
      toast.error(
        "Ongkir live belum tersedia. Lengkapi alamat/item lalu pilih layanan kurir.",
      );
      return;
    }

    if (isBlockedDate) {
      toast.error("Selected date is blocked. Please choose another date.");
      return;
    }
    if (isSlotFull) {
      toast.error("Delivery slot is full. Please choose another hour.");
      return;
    }

    const existingCapacity = summarizeCapacityByOrdersForDate(
      orders,
      values.deliveryDate,
    );
    const incomingCapacity = summarizeCapacityByItems(values.items);
    const overflowBuckets = getCapacityOverflows(
      existingCapacity,
      incomingCapacity,
    );
    if (overflowBuckets.length > 0) {
      const labels = overflowBuckets
        .map((bucket) => CAPACITY_LABELS[bucket])
        .join(", ");
      toast.error(
        `Kapasitas harian terlampaui: ${labels}. Pilih tanggal lain atau kurangi kuantitas.`,
      );
      return;
    }

    const mappedItems = values.items.map((item, index) => {
      const unitPrice = getUnitPriceBySelection({
        category: item.category,
        subcategory: item.subcategory,
        productName: item.productName,
        size: item.size,
      });
      const categoryAddOns = getCategoryAddOns(item.category);
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
        basePrice: unitPrice * item.quantity,
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

    addOrder({
      customerName: values.customerName,
      customerPhone: values.phoneNumber,
      deliveryDate: values.deliveryDate,
      deliverySlot: values.deliverySlot,
      notes: values.customNotes ?? "",
      items: mappedItems,
      deliveryAddresses: mappedAddresses,
      basePrice,
      addOnTotal,
      deliveryFee,
      manualAdjustment: Number(values.manualAdjustment || 0),
      totalPrice,
      downPaymentAmount,
      remainingBalance,
      paymentStatus: values.paymentStatus,
      whatsAppParsedData: parsedPreview ?? undefined,
      shippingQuote: selectedShippingQuote,
    });

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
  };

  const toggleItemAddOn = (itemIndex: number, addonId: string) => {
    const current = watchedItems[itemIndex]?.addOns ?? [];
    const next = current.includes(addonId)
      ? current.filter((id) => id !== addonId)
      : [...current, addonId];
    setValue(`items.${itemIndex}.addOns`, next, { shouldValidate: true });
  };

  const importDraft = async () => {
    if (parserSource !== "image" && !quickPaste.trim()) {
      toast.error(
        "Paste text WhatsApp atau isi template manual terlebih dulu.",
      );
      return;
    }

    if (
      parserSource === "image" &&
      uploadedChatImages.length === 0 &&
      !quickPaste.trim()
    ) {
      toast.error(
        "Upload gambar chat WA atau isi teks tambahan terlebih dulu.",
      );
      return;
    }

    setIsParsingWhatsApp(true);
    try {
      const formData = new FormData();
      formData.append("sourceType", parserSource);
      formData.append("orderType", selectedOrderType);
      if (quickPaste.trim()) {
        formData.append("text", quickPaste.trim());
      }
      if (uploadedChatImages.length > 0) {
        uploadedChatImages.forEach((file) => formData.append("files", file));
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
      if (draft.deliveryDate) setValue("deliveryDate", draft.deliveryDate);
      if (draft.deliverySlot) setValue("deliverySlot", draft.deliverySlot);
      if (draft.customNotes) setValue("customNotes", draft.customNotes);
      if (draft.items?.length) {
        const normalizedItems: BookingFormInput["items"] = draft.items.map(
          (item) => {
            const normalized = ensureCatalogSelection({
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

          <Textarea
            value={quickPaste}
            onChange={(event) => setQuickPaste(event.target.value)}
            placeholder={
              parserSource === "manual"
                ? "Klik tombol 'Isi Template Manual' lalu lengkapi field-nya."
                : parserSource === "image"
                  ? "Opsional: tambahkan konteks jika ada bagian gambar yang blur."
                  : parserSource === "email"
                    ? "Paste email notifikasi e-commerce untuk dibuatkan draft otomatis."
                    : "Paste chat WA customer di sini untuk auto-parse."
            }
            className="min-h-28"
          />

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700"
              onClick={importDraft}
              disabled={isParsingWhatsApp}
            >
              <Upload size={16} />
              {isParsingWhatsApp ? "Parsing WhatsApp..." : "Parse WhatsApp"}
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
              </label>
              <label className="grid gap-2 text-sm font-medium text-gray-700">
                Delivery Slot
                <Select {...register("deliverySlot")}>
                  <option value="">Select hour</option>
                  {deliverySlots.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </Select>
                {errors.deliverySlot && (
                  <span className="text-xs text-rose-500">
                    {errors.deliverySlot.message}
                  </span>
                )}
              </label>
            </div>

            {(isBlockedDate || isSlotFull) && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                {isBlockedDate
                  ? "Selected date is unavailable (blocked by admin)."
                  : `Selected slot is full for ${slotProfileLabel} orders (${slotUsage}/${slotLimitPerHour}). Please choose another hour.`}
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
                        entry.full
                          ? "border-rose-200 bg-rose-50 text-rose-700"
                          : entry.used > 0
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      <div>{entry.slot}</div>
                      <div className="font-normal">
                        {entry.full
                          ? "Full"
                          : `${entry.used}/${slotLimitPerHour} used`}
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
                    const nextDefault = getDefaultCatalogSelection();
                    appendItem({
                      category: nextDefault.category,
                      subcategory: nextDefault.subcategory,
                      productName: nextDefault.productName,
                      size: nextDefault.size,
                      quantity: 1,
                      addOns: [],
                      notes: "",
                    });
                  }}
                >
                  <Plus size={14} />
                  Add Item
                </Button>
              </div>

              <div className="space-y-4">
                {itemFields.map((field, index) => {
                  const item = watchedItems[index];
                  const normalizedSelection = ensureCatalogSelection({
                    category: item?.category,
                    subcategory: item?.subcategory,
                    productName: item?.productName,
                    size: item?.size,
                  });
                  const categoryData = BOOKING_PRODUCT_CATALOG.find(
                    (entry) => entry.category === normalizedSelection.category,
                  );
                  const subcategories = categoryData?.subcategories ?? [];
                  const subcategoryData =
                    subcategories.find(
                      (entry) => entry.name === normalizedSelection.subcategory,
                    ) ?? subcategories[0];
                  const products = subcategoryData?.products ?? [];
                  const variants = getProductVariants(
                    normalizedSelection.category,
                    normalizedSelection.subcategory,
                    normalizedSelection.productName,
                  );
                  const addOns = getCategoryAddOns(
                    normalizedSelection.category,
                  );

                  return (
                    <div
                      key={field.id}
                      className="space-y-3 rounded-xl border border-gray-200 p-4"
                    >
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <label className="grid gap-2 text-sm font-medium text-gray-700">
                          Category
                          <Select
                            {...register(`items.${index}.category`)}
                            value={normalizedSelection.category}
                            onChange={(event) => {
                              const nextCategory = event.target.value;
                              const nextSelection =
                                getDefaultCatalogSelectionForCategory(
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
                            }}
                          >
                            {BOOKING_PRODUCT_CATALOG.map((entry) => (
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
                              const nextSelection = ensureCatalogSelection({
                                category: normalizedSelection.category,
                                subcategory: nextSub,
                              });
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
                              const nextSelection = ensureCatalogSelection({
                                category: normalizedSelection.category,
                                subcategory: normalizedSelection.subcategory,
                                productName: nextProduct,
                              });
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

                        <label className="grid gap-2 text-sm font-medium text-gray-700">
                          Quantity
                          <Input
                            type="number"
                            min={1}
                            {...register(`items.${index}.quantity`, {
                              valueAsNumber: true,
                            })}
                          />
                        </label>

                        <label className="grid gap-2 text-sm font-medium text-gray-700 sm:col-span-2 lg:col-span-3">
                          Item Notes
                          <Input
                            placeholder="Decoration instructions"
                            {...register(`items.${index}.notes`)}
                          />
                        </label>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-3">
                        {addOns.map((addon) => (
                          <label
                            key={addon.id}
                            className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700"
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
                    appendAddress({ label: "Extra", area: "", addressLine: "" })
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
                  Shipping Engine (JNE & Paxel)
                </p>
                {isCheckingShipping && (
                  <span className="text-xs text-indigo-600">
                    Menghitung ongkir otomatis...
                  </span>
                )}
              </div>

              {shippingDistanceKm !== null && shippingDistanceKm > 0 && (
                <p className="text-xs text-gray-600">
                  Estimasi jarak gudang ke alamat:{" "}
                  <span className="font-semibold">{shippingDistanceKm} km</span>
                </p>
              )}

              {shippingWarning && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  {shippingWarning}
                </p>
              )}

              {shippingQuotes.length > 0 && (
                <div className="space-y-2">
                  {shippingQuotes.map((quote) => {
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
                          ETA {quote.eta} | Source: API Kurir
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}

              {!shippingQuotes.length && !shippingPayload && (
                <p className="text-xs text-gray-500">
                  Lengkapi alamat penerima dan item order untuk kalkulasi ongkir
                  otomatis.
                </p>
              )}

              {!shippingQuotes.length &&
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
                disabled={isBlockedDate || isSlotFull}
              >
                Create Booking
              </Button>
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  reset();
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
              >
                Reset Form
              </Button>
            </div>
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
                  {formatCurrency(downPaymentAmount)}
                </span>
              </p>
              {paymentStatus === "Pending" && (
                <p className="text-xs text-gray-500">
                  DP belum diinput/dibayar (status masih Pending).
                </p>
              )}
              <p className="flex items-center justify-between">
                <span>Remaining Balance</span>
                <span className="font-semibold text-gray-900">
                  {formatCurrency(remainingBalance)}
                </span>
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
