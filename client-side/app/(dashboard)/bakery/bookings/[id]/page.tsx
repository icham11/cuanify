"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Check,
  Circle,
  CircleCheckBig,
  Clock3,
  CreditCard,
  FileText,
  MessageCircle,
  Palette,
  Printer,
  ReceiptText,
  Truck,
  UserRound,
  Loader2,
} from "lucide-react";
import GradientPageHeader from "@/components/bakery/shared/GradientPageHeader";
import {
  useOrders,
  type BakeryOrder,
  type DeliveryAddress,
  type OrderItem,
} from "@/components/bakery/store";
import { useParams } from "next/navigation";
import { formatCurrency } from "@/components/orders/formatters";
import { openInvoicePrintWindow } from "@/components/bakery/bookings/InvoiceTemplate";
import { openLabelPrintWindow } from "@/components/bakery/bookings/LabelTemplate";
import BookingForm from "@/components/bakery/bookings/BookingForm";
import type { ShippingResiResponse } from "@/lib/bookings/shipping-types";
import {
  DELIVERY_METHOD_OPTIONS,
  estimateOperationalWeightGram,
  parseServiceChargeFromNotes,
  resolveShippingParcelCount,
} from "@/lib/bookings/delivery-rules";
import {
  BOOKING_STATUS_OPTIONS,
  normalizeOrderStatus,
} from "@/lib/bookings/order-status";
import { calculateOrderTokenFromItems } from "@/lib/bookings/order-token-calculator";
import { useCatalogAdminState } from "@/lib/bookings/catalog-admin";
import {
  ensureSelectionFromCatalog,
  getUnitPriceFromCatalog,
  TOKEN_DIFFICULTY_OPTIONS,
} from "@/components/bakery/bookings/booking-form-helpers";
import {
  getJakartaTodayIsoDate,
  inferScheduledProviderFromQuote,
  isScheduledShipmentOrder,
} from "@/lib/bookings/shipping-schedule";
import { normalizeDateInput } from "@/lib/helpers/date-normalization";
import { useRole } from "@/context/RoleContext";
import {
  resolveDeliveryMethodLabel,
  resolveOrderDeliveryMethod,
} from "@/lib/bookings/delivery-method";

function formatDisplayDate(value?: string): string {
  if (!value) return "-";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function formatDisplayTime(value?: string): string {
  if (!value) return "-";
  return value.replace(":", ".");
}

function getInitials(value?: string): string {
  const parts = (value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return "AD";
  return parts.map((part) => part[0]?.toUpperCase() || "").join("");
}

function collectReferenceImageNotes(
  order: ReturnType<typeof useOrders>["orders"][number] | undefined,
): string[] {
  const candidates = [
    ...(Array.isArray(order?.referenceImages) ? order.referenceImages : []),
    ...(Array.isArray(order?.whatsAppParsedData?.referenceImages)
      ? order.whatsAppParsedData.referenceImages
      : []),
  ];

  return candidates
    .map((image) => String(image?.note || "").trim())
    .filter((note, index, array) => {
      const normalized = note.toLowerCase();
      return (
        normalized.length > 0 &&
        array.findIndex((entry) => entry.toLowerCase() === normalized) === index
      );
    });
}

type EditableOrderItemDraft = {
  id: string;
  original: OrderItem;
  category: string;
  subcategory: string;
  productName: string;
  size: string;
  quantity: string;
  tokenDifficulty: string;
  customTokenPerUnit: string;
  lineTotal: string;
  addOnTotal: string;
  addOnsText: string;
  notes: string;
};

type EditableAddressDraft = {
  id: string;
  label: string;
  area: string;
  addressLine: string;
};

type BookingEditDraft = {
  sourceOrderId: string;
  customerName: string;
  customerPhone: string;
  deliveryDate: string;
  deliverySlot: string;
  deliveryMethod: string;
  deliveryFee: string;
  insuranceFee: string;
  serviceCharge: string;
  wholesaleDiscountPercent: string;
  manualAdjustment: string;
  dpPaidAmount: string;
  finalPaidAmount: string;
  customNotes: string;
  items: EditableOrderItemDraft[];
  deliveryAddresses: EditableAddressDraft[];
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

function normalizeTokenDifficultyValue(
  value: string,
): OrderItem["tokenDifficulty"] {
  const normalized = value.trim().toUpperCase();
  if (
    normalized === "SIMPLE" ||
    normalized === "NORMAL" ||
    normalized === "HARD" ||
    normalized === "ADVANCED" ||
    normalized === "EXPERT" ||
    normalized === "MEDIUM" ||
    normalized === "DIFFICULT"
  ) {
    return normalized;
  }
  return undefined;
}

function withCurrentOption(options: string[], currentValue: string): string[] {
  const normalizedCurrent = currentValue.trim();
  if (!normalizedCurrent) return options;
  if (options.includes(normalizedCurrent)) return options;
  return [normalizedCurrent, ...options];
}

function normalizeMoneyInput(value: string | number | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value) : 0;
  }
  const digits = String(value ?? "").replace(/[^\d-]/g, "");
  if (!digits || digits === "-") return 0;
  const parsed = Number(digits);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed);
}

function stringifyMoney(value: number | null | undefined): string {
  const normalized = normalizeMoneyInput(value);
  return normalized > 0 ? String(normalized) : "0";
}

function stringifyAddOns(
  addOns: string[] | undefined,
  addOnQuantities: Record<string, number> | undefined,
): string {
  return (addOns ?? [])
    .map((entry) => {
      const label = String(entry || "").trim();
      if (!label) return "";
      const quantity = Math.max(0, Number(addOnQuantities?.[label] || 0));
      return quantity > 1 ? `${quantity}x ${label}` : label;
    })
    .filter(Boolean)
    .join(", ");
}

function parseAddOnsInput(value: string): {
  addOns: string[];
  addOnQuantities: Record<string, number>;
} {
  const addOnQuantities: Record<string, number> = {};
  const addOns: string[] = [];

  value
    .split(/\r?\n|,/g)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .forEach((segment) => {
      const match = segment.match(/^(\d+)\s*x\s+(.+)$/i);
      const label = (match?.[2] || segment).trim();
      if (!label) return;
      if (!addOns.includes(label)) {
        addOns.push(label);
      }
      const quantity = match?.[1] ? Math.max(1, Number(match[1])) : 1;
      if (quantity > 1) {
        addOnQuantities[label] = quantity;
      }
    });

  return { addOns, addOnQuantities };
}

function createEmptyItemDraft(seed: string): EditableOrderItemDraft {
  return {
    id: `item-${seed}`,
    original: {
      id: `item-${seed}`,
      category: "",
      subcategory: "",
      productName: "",
      size: "",
      quantity: 1,
      basePrice: 0,
      addOns: [],
      addOnTotal: 0,
    },
    category: "",
    subcategory: "",
    productName: "",
    size: "",
    quantity: "1",
    tokenDifficulty: "",
    customTokenPerUnit: "",
    lineTotal: "0",
    addOnTotal: "0",
    addOnsText: "",
    notes: "",
  };
}

function createEmptyAddressDraft(seed: string): EditableAddressDraft {
  return {
    id: `addr-${seed}`,
    label: "Primary",
    area: "",
    addressLine: "",
  };
}

function buildEditDraft(order: BakeryOrder): BookingEditDraft {
  const customNotes = String(order.notes || "")
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

  const deliveryMethod =
    resolveOrderDeliveryMethod({
      parsedDeliveryMethod: order.whatsAppParsedData?.common?.deliveryMethod,
      notes: order.notes,
      shippingQuote: order.shippingQuote,
    }) || "PICKUP";

  return {
    sourceOrderId: order.id,
    customerName: order.customerName || "",
    customerPhone: order.customerPhone || "",
    deliveryDate: order.deliveryDate || "",
    deliverySlot: order.deliverySlot || "",
    deliveryMethod,
    deliveryFee: stringifyMoney(order.deliveryFee),
    insuranceFee: stringifyMoney(order.insuranceFee || order.shippingQuote?.insuranceFee || 0),
    serviceCharge: stringifyMoney(parseServiceChargeFromNotes(order.notes)),
    wholesaleDiscountPercent: String(parseWholesaleDiscountPercent(order.notes) || 0),
    manualAdjustment: String(Math.round(Number(order.manualAdjustment || 0) || 0)),
    dpPaidAmount: stringifyMoney(order.dpPaidAmount),
    finalPaidAmount: stringifyMoney(order.finalPaidAmount),
    customNotes,
    items:
      (order.items ?? []).map((item, index) => ({
        id: item.id || `item-${order.id}-${index}`,
        original: item,
        category: item.category || "",
        subcategory: item.subcategory || "",
        productName: item.productName || "",
        size: item.size || "",
        quantity: String(Math.max(0, Number(item.quantity || 0))),
        tokenDifficulty: item.tokenDifficulty || "",
        customTokenPerUnit:
          item.customTokenPerUnit !== undefined && item.customTokenPerUnit !== null
            ? String(item.customTokenPerUnit)
            : "",
        lineTotal: stringifyMoney(Number(item.lineTotal ?? item.basePrice ?? 0)),
        addOnTotal: stringifyMoney(item.addOnTotal),
        addOnsText: stringifyAddOns(item.addOns, item.addOnQuantities),
        notes: item.notes || "",
      })) || [],
    deliveryAddresses:
      (order.deliveryAddresses?.length
        ? order.deliveryAddresses
        : [
            {
              id: `addr-${order.id}-0`,
              label: "Primary",
              area: "",
              addressLine: order.customerAddress || "",
            },
          ]
      ).map((address: DeliveryAddress, index) => ({
        id: address.id || `addr-${order.id}-${index}`,
        label: address.label || `Alamat ${index + 1}`,
        area: address.area || "",
        addressLine: address.addressLine || "",
      })),
  };
}

function buildEditableNotes(draft: BookingEditDraft): string {
  const lines = [
    draft.customNotes,
    Number(draft.wholesaleDiscountPercent || 0) > 0
      ? `Wholesale Discount: ${Number(draft.wholesaleDiscountPercent || 0)}%`
      : "",
    `Delivery Method: ${resolveDeliveryMethodLabel(draft.deliveryMethod, "Pickup")}`,
    Number(draft.serviceCharge || 0) > 0
      ? `Service Charge: ${normalizeMoneyInput(draft.serviceCharge)}`
      : "",
    Number(draft.insuranceFee || 0) > 0
      ? `Insurance Fee: ${normalizeMoneyInput(draft.insuranceFee)}`
      : "",
  ];

  return lines
    .flatMap((line) => String(line || "").split(/\r?\n/g))
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function serializeDraft(draft: BookingEditDraft): string {
  return JSON.stringify({
    ...draft,
    items: draft.items.map((item) => ({
      ...item,
      original: undefined,
    })),
  });
}

export default function OrderDetailPage() {
  const { isOwner, isAdmin } = useRole();
  const { productCatalog } = useCatalogAdminState();
  const {
    orders,
    updateOrder,
    updateOrderStatus,
    getCustomerMessagePreview,
    setOrderShipment,
    fetchOrderById,
  } = useOrders();
  const params = useParams();
  const canGenerateInvoice = true;
  const orderId = typeof params?.id === "string" ? params.id : "";
  const [isCreatingResi, setIsCreatingResi] = useState(false);
  const [statusDraft, setStatusDraft] = useState("");
  const [isLoadingDetail, setIsLoadingDetail] = useState(true);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<BookingEditDraft | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const order = useMemo(
    () => orders.find((item) => item.id === orderId),
    [orders, orderId],
  );

  // Buat ref stabil untuk menyimpan fetchOrderById agar tidak memicu re-fetch berulang kali saat store ter-update
  const fetchOrderRef = useRef(fetchOrderById);
  useEffect(() => {
    fetchOrderRef.current = fetchOrderById;
  }, [fetchOrderById]);

  useEffect(() => {
    if (!orderId) return;

    let active = true;
    setIsLoadingDetail(true);
    setDetailError(null);

    // Gunakan fungsi dari ref stabil untuk memuat detail pesanan
    fetchOrderRef.current(orderId)
      .then(() => {
        if (active) setIsLoadingDetail(false);
      })
      .catch((error) => {
        console.error("Gagal memuat detail pesanan:", error);
        if (active) {
          setDetailError("Gagal mengambil detail pesanan dari server.");
          setIsLoadingDetail(false);
        }
      });

    return () => {
      active = false;
    };
  }, [orderId]);
  const normalizedOrderStatus = normalizeOrderStatus(order?.orderStatus);
  const normalizedPaymentStatus =
    order?.paymentStatus === "Pending"
      ? "DP Paid"
      : (order?.paymentStatus ?? "DP Paid");
  const isScheduledShipmentProviderOrder = order
    ? isScheduledShipmentOrder(order)
    : false;
  const todayJakarta = getJakartaTodayIsoDate();
  const normalizedDeliveryDate = normalizeDateInput(order?.deliveryDate || "");
  const isBeforeScheduledShippingDate =
    isScheduledShipmentProviderOrder &&
    Boolean(normalizedDeliveryDate && normalizedDeliveryDate > todayJakarta);
  const deliveryMethod = useMemo(
    () =>
      resolveOrderDeliveryMethod({
        parsedDeliveryMethod: order?.whatsAppParsedData?.common?.deliveryMethod,
        notes: order?.notes,
        shippingQuote: order?.shippingQuote,
      }),
    [order?.notes, order?.shippingQuote, order?.whatsAppParsedData?.common?.deliveryMethod],
  );
  const hasAnyProductionAssignment = Boolean(
    order?.assignedStaffUserId ||
      order?.productionStages?.some((entry) => Number(entry.staffId || 0) > 0),
  );
  const canUpdateStatus = isOwner || hasAnyProductionAssignment;
  const canEditOrder = isOwner || isAdmin;
  const statusUpdateHelperText = canUpdateStatus
    ? ""
    : "Status order tanpa assignment staff hanya bisa diubah oleh owner.";

  const totalPrice = order?.totalPrice ?? 0;
  const messagePreview = order ? getCustomerMessagePreview(order.id) : "";

  useEffect(() => {
    if (!normalizedOrderStatus) return;
    setStatusDraft(normalizedOrderStatus);
  }, [normalizedOrderStatus]);

  const baselineEditDraft = useMemo(
    () => (order ? buildEditDraft(order) : null),
    [order],
  );
  const isEditDirty = useMemo(() => {
    if (!editDraft || !baselineEditDraft) return false;
    return serializeDraft(editDraft) !== serializeDraft(baselineEditDraft);
  }, [baselineEditDraft, editDraft]);

  useEffect(() => {
    if (!baselineEditDraft) return;
    setEditDraft((current) => {
      if (!current) return baselineEditDraft;
      if (current.sourceOrderId !== baselineEditDraft.sourceOrderId) {
        return baselineEditDraft;
      }
      if (!isEditDirty) return baselineEditDraft;
      return current;
    });
  }, [baselineEditDraft, isEditDirty]);

  const handlePrintLabel = () => {
    if (!order) return;
    openLabelPrintWindow(order);
  };
  const handleChatAndCopy = async () => {
    if (!order) return;
    try {
      await navigator.clipboard.writeText(messagePreview);
      const rawPhone = (order.customerPhone || "").replace(/\D/g, "");
      if (rawPhone) {
        const normalized = rawPhone.startsWith("62")
          ? rawPhone
          : rawPhone.startsWith("0")
            ? `62${rawPhone.slice(1)}`
            : rawPhone.startsWith("8")
              ? `62${rawPhone}`
              : rawPhone;
        const url = `https://wa.me/${normalized}?text=${encodeURIComponent(messagePreview)}`;
        window.open(url, "_blank");
      }
    } catch {}
  };

  const handleCreateResi = async () => {
    if (!order) return;
    if (!order.shippingQuote) return;
    if (isBeforeScheduledShippingDate) return;

    const primaryAddress =
      order.deliveryAddresses?.[0]?.addressLine || order.customerAddress || "";
    if (!primaryAddress) return;

    setIsCreatingResi(true);
    try {
      const items = (order.items ?? []).map((item) => ({
        name: `${item.productName} (${item.size})`,
        quantity: resolveShippingParcelCount(item),
        weightGram: estimateOperationalWeightGram(item),
        value: Math.max(
          1000,
          Math.round((item.basePrice || 0) + (item.addOnTotal || 0)),
        ),
      }));
      const destinationLatitude = Number.isFinite(
        order.shippingQuote?.destinationLatitude,
      )
        ? Number(order.shippingQuote?.destinationLatitude)
        : undefined;
      const destinationLongitude = Number.isFinite(
        order.shippingQuote?.destinationLongitude,
      )
        ? Number(order.shippingQuote?.destinationLongitude)
        : undefined;
      const selectedQuoteProvider = inferScheduledProviderFromQuote(
        order.shippingQuote,
      );
      if (!selectedQuoteProvider) return;
      const selectedQuote = {
        ...order.shippingQuote,
        provider: selectedQuoteProvider,
      };

      const response = await fetch("/api/bookings/shipping/create-resi", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderId: order.id,
          bookingCode: order.resi || order.bookingCode || order.id,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          destinationAddress: primaryAddress,
          destinationPostalCode:
            order.shippingQuote?.destinationPostalCode ||
            primaryAddress.match(/\b\d{5}\b/)?.[0],
          destinationLatitude,
          destinationLongitude,
          deliveryDate: order.deliveryDate,
          deliveryTime: order.deliverySlot,
          selectedQuote,
          items,
          totalValue: Math.max(1000, Math.round(order.totalPrice || 0)),
        }),
      });

      const payload = (await response
        .json()
        .catch(() => ({}))) as ShippingResiResponse;
      if (!response.ok || !payload.success || !payload.shipment) {
        throw new Error(payload.error || "Gagal membuat resi.");
      }

      setOrderShipment(order.id, payload.shipment);
    } catch (error: unknown) {
      void error;
    } finally {
      setIsCreatingResi(false);
    }
  };

  if (isLoadingDetail) {
    return (
      <div className="space-y-4 pb-10">
        <div className="flex justify-center">
          <div className="inline-flex items-center rounded-full border border-[var(--crumbella-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.95)_0%,rgba(246,233,219,0.92)_100%)] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--crumbella-primary)] shadow-[0_12px_24px_-22px_rgba(30,18,10,0.7)]">
            Booking Detail
          </div>
        </div>
        <div className="flex h-40 items-center justify-center rounded-[28px] border border-[var(--crumbella-border)] bg-white px-5 py-8 text-center shadow-[0_18px_30px_-24px_rgba(30,18,10,0.35)]">
          <div className="flex items-center gap-2 text-sm text-[var(--crumbella-muted)]">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--crumbella-accent)]" />
            Memuat detail pesanan dari server...
          </div>
        </div>
      </div>
    );
  }

  if (detailError) {
    return (
      <div className="space-y-4 pb-10">
        <div className="flex justify-center">
          <div className="inline-flex items-center rounded-full border border-[var(--crumbella-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.95)_0%,rgba(246,233,219,0.92)_100%)] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--crumbella-primary)] shadow-[0_12px_24px_-22px_rgba(30,18,10,0.7)]">
            Booking Detail
          </div>
        </div>
        <div className="rounded-[28px] border border-[var(--crumbella-border)] bg-white px-5 py-8 text-center text-sm shadow-[0_18px_30px_-24px_rgba(30,18,10,0.35)]">
          <p className="text-red-500 font-semibold">{detailError}</p>
          <div className="mt-4 flex justify-center gap-2">
            <Link
              href="/bakery/bookings"
              className="inline-flex h-9 items-center justify-center rounded-full border border-[var(--crumbella-border)] px-4 text-xs font-semibold text-[var(--foreground)]"
            >
              Kembali
            </Link>
            <button
              onClick={() => {
                setIsLoadingDetail(true);
                setDetailError(null);
                fetchOrderById(orderId)
                  .then(() => setIsLoadingDetail(false))
                  .catch(() => {
                    setDetailError("Gagal mengambil detail pesanan dari server.");
                    setIsLoadingDetail(false);
                  });
              }}
              className="inline-flex h-9 items-center justify-center rounded-full bg-[var(--crumbella-accent)] px-4 text-xs font-semibold text-white hover:bg-[var(--crumbella-accent-strong)]"
            >
              Coba Lagi
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-4 pb-10">
        <div className="flex justify-center">
          <div className="inline-flex items-center rounded-full border border-[var(--crumbella-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.95)_0%,rgba(246,233,219,0.92)_100%)] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--crumbella-primary)] shadow-[0_12px_24px_-22px_rgba(30,18,10,0.7)]">
            Booking Detail
          </div>
        </div>
        <div className="rounded-[28px] border border-[var(--crumbella-border)] bg-white px-5 py-8 text-center text-sm text-[var(--crumbella-muted)] shadow-[0_18px_30px_-24px_rgba(30,18,10,0.35)]">
          Order tidak ditemukan. Kembali ke daftar booking.
        </div>
      </div>
    );
  }

  const createdDisplayTime = new Date(
    (order as { createdAt?: string }).createdAt ||
      order.statusHistory?.[0]?.timestamp ||
      Date.now(),
  ).toLocaleString("id-ID");

  const primaryAddress =
    order.deliveryAddresses?.[0]?.addressLine || order.customerAddress || "-";
  const bookingCodeValue = order.resi || order.bookingCode || order.id;
  const readableMethod = resolveDeliveryMethodLabel(deliveryMethod, "Pickup");
  const parsedReferenceNotes = collectReferenceImageNotes(order);
  const customNotesOnly = (order.notes || "")
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter(
      (line) =>
        !/^delivery\s*method\s*:/i.test(line) &&
        !/^service\s*charge\s*:/i.test(line) &&
        !/^insurance\s*fee\s*:/i.test(line) &&
        !/^wholesale\s*discount\s*:/i.test(line),
    );
  const bookingNotesList = [...parsedReferenceNotes, ...customNotesOnly].filter(
    (note, index, array) => {
      const normalized = note.toLowerCase();
      return (
        normalized.length > 0 &&
        array.findIndex((entry) => entry.toLowerCase() === normalized) === index
      );
    },
  );
  const totalPaidAmount = Math.max(0, Math.round(Number(order.totalPaidAmount ?? 0)));
  const remainingBalanceAmount = Math.max(
    0,
    Math.round(Number(order.remainingBalance ?? Math.max(0, totalPrice - totalPaidAmount))),
  );
  const isFullyPaid =
    normalizedPaymentStatus === "Paid" || remainingBalanceAmount <= 0;
  const effectiveDpPercent =
    !isFullyPaid && totalPrice > 0
      ? Math.max(
          0,
          Math.min(100, Math.round((totalPaidAmount / totalPrice) * 100)),
        )
      : 0;
  const statusSteps = [
    "Order Created",
    "In Production",
    "Ready",
    "Delivery",
    "Completed",
  ] as const;
  const activeStatusIndex = Math.max(
    0,
    statusSteps.findIndex(
      (status) => status.toLowerCase() === normalizedOrderStatus.toLowerCase(),
    ),
  );
  const isLateOrder =
    Boolean(normalizedDeliveryDate && normalizedDeliveryDate < todayJakarta) &&
    !["Completed", "Delivered", "Cancelled"].includes(normalizedOrderStatus);
  const itemRows = (order.items ?? []).map((item) => {
    const quantity = Math.max(1, Number(item.quantity || 1));
    const baseAmount = Math.max(
      0,
      Math.round(Number(item.lineTotal ?? item.basePrice ?? 0)),
    );
    const addOnAmount = Math.max(0, Math.round(Number(item.addOnTotal || 0)));
    const lineTotal = Math.max(0, baseAmount + addOnAmount);
    const unitPrice = quantity > 0 ? Math.round(lineTotal / quantity) : lineTotal;
    const details = [
      item.size ? `${item.size}` : "",
      item.subcategory ? `${item.subcategory}` : "",
      item.addOns?.length ? `Add-on: ${item.addOns.join(", ")}` : "",
      item.notes ? item.notes : "",
    ].filter((text) => text.length > 0);
    return {
      id: item.id,
      title: `${quantity}x ${item.productName || "Produk"} (${item.category || "-"})`,
      unitPrice,
      lineTotal,
      details,
    };
  });

  const editItemBaseSubtotal = (editDraft?.items ?? []).reduce(
    (sum, item) => sum + normalizeMoneyInput(item.lineTotal),
    0,
  );
  const editItemAddOnSubtotal = (editDraft?.items ?? []).reduce(
    (sum, item) => sum + normalizeMoneyInput(item.addOnTotal),
    0,
  );
  const editDeliveryFee = normalizeMoneyInput(editDraft?.deliveryFee);
  const editInsuranceFee = normalizeMoneyInput(editDraft?.insuranceFee);
  const editServiceCharge = normalizeMoneyInput(editDraft?.serviceCharge);
  const editManualAdjustment = normalizeMoneyInput(editDraft?.manualAdjustment);
  const editSubtotalBeforeDiscount =
    editItemBaseSubtotal +
    editItemAddOnSubtotal +
    editDeliveryFee +
    editInsuranceFee +
    editServiceCharge +
    editManualAdjustment;
  const editWholesaleDiscountPercent = Math.max(
    0,
    Math.min(100, Number(editDraft?.wholesaleDiscountPercent || 0)),
  );
  const editWholesaleDiscountAmount = Math.max(
    0,
    Math.round(
      Math.max(0, editSubtotalBeforeDiscount) *
        (editWholesaleDiscountPercent / 100),
    ),
  );
  const editTotalPrice = Math.max(
    0,
    editSubtotalBeforeDiscount - editWholesaleDiscountAmount,
  );
  const editDpPaidAmount = Math.min(
    editTotalPrice,
    normalizeMoneyInput(editDraft?.dpPaidAmount),
  );
  const editFinalPaidAmount = Math.min(
    Math.max(0, editTotalPrice - editDpPaidAmount),
    normalizeMoneyInput(editDraft?.finalPaidAmount),
  );
  const editTotalPaidAmount = Math.min(
    editTotalPrice,
    editDpPaidAmount + editFinalPaidAmount,
  );
  const editRemainingBalance = Math.max(0, editTotalPrice - editTotalPaidAmount);
  const editTokenEstimate = calculateOrderTokenFromItems(
    (editDraft?.items ?? []).map((item) => {
      const parsedAddOns = parseAddOnsInput(item.addOnsText);
      return {
        category: item.category,
        subcategory: item.subcategory,
        productName: item.productName,
        size: item.size,
        quantity: Math.max(0, Number(item.quantity || 0)),
        tokenDifficulty: item.tokenDifficulty,
        customTokenPerUnit:
          item.customTokenPerUnit.trim().length > 0
            ? Number(item.customTokenPerUnit)
            : undefined,
        addOns: parsedAddOns.addOns,
        addOnQuantities: parsedAddOns.addOnQuantities,
      };
    }),
  );

  const updateDraftField = (
    field: keyof BookingEditDraft,
    value: string | EditableOrderItemDraft[] | EditableAddressDraft[],
  ) => {
    setEditDraft((current) => (current ? { ...current, [field]: value } : current));
  };

  const getCatalogSelectionForDraftItem = (item: EditableOrderItemDraft) =>
    ensureSelectionFromCatalog(productCatalog, {
      category: item.category,
      subcategory: item.subcategory,
      productName: item.productName,
      size: item.size,
    });

  const getCatalogOptionsForDraftItem = (item: EditableOrderItemDraft) => {
    const normalizedSelection = getCatalogSelectionForDraftItem(item);
    const categoryOptions = withCurrentOption(
      productCatalog.map((entry) => entry.category),
      item.category,
    );
    const categoryData = productCatalog.find(
      (entry) => entry.category === normalizedSelection.category,
    );
    const subcategoryOptions = withCurrentOption(
      (categoryData?.subcategories ?? []).map((entry) => entry.name),
      item.subcategory,
    );
    const subcategoryData = categoryData?.subcategories.find(
      (entry) => entry.name === normalizedSelection.subcategory,
    );
    const productOptions = withCurrentOption(
      (subcategoryData?.products ?? []).map((entry) => entry.name),
      item.productName,
    );
    const productData = subcategoryData?.products.find(
      (entry) => entry.name === normalizedSelection.productName,
    );
    const sizeOptions = withCurrentOption(
      (productData?.variants ?? []).map((entry) => entry.label),
      item.size,
    );

    return {
      normalizedSelection,
      categoryOptions,
      subcategoryOptions,
      productOptions,
      sizeOptions,
    };
  };

  const updateDraftItem = (
    itemId: string,
    field: keyof EditableOrderItemDraft,
    value: string,
  ) => {
    setEditDraft((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) =>
              item.id === itemId ? { ...item, [field]: value } : item,
            ),
          }
        : current,
    );
  };

  const updateDraftItemQuantity = (itemId: string, value: string) => {
    setEditDraft((current) => {
      if (!current) return current;

      return {
        ...current,
        items: current.items.map((item) => {
          if (item.id !== itemId) return item;

          const selection = ensureSelectionFromCatalog(productCatalog, {
            category: item.category,
            subcategory: item.subcategory,
            productName: item.productName,
            size: item.size,
          });
          const unitPrice = getUnitPriceFromCatalog(productCatalog, selection);
          const previousQuantity = Math.max(0, Math.round(Number(item.quantity || 0)));
          const nextQuantity = Math.max(0, Math.round(Number(value || 0)));
          const currentSubtotal = normalizeMoneyInput(item.lineTotal);
          const previousExpectedSubtotal = unitPrice * previousQuantity;
          const shouldAutofillSubtotal =
            currentSubtotal <= 0 || currentSubtotal === previousExpectedSubtotal;

          return {
            ...item,
            quantity: value,
            lineTotal: shouldAutofillSubtotal
              ? String(Math.max(0, Math.round(unitPrice * nextQuantity)))
              : item.lineTotal,
          };
        }),
      };
    });
  };

  const updateDraftItemCatalogSelection = (
    itemId: string,
    field: "category" | "subcategory" | "productName" | "size",
    value: string,
  ) => {
    setEditDraft((current) => {
      if (!current) return current;

      return {
        ...current,
        items: current.items.map((item) => {
          if (item.id !== itemId) return item;

          const previousSelection = ensureSelectionFromCatalog(productCatalog, {
            category: item.category,
            subcategory: item.subcategory,
            productName: item.productName,
            size: item.size,
          });
          const quantity = Math.max(0, Math.round(Number(item.quantity || 0)));
          const previousSubtotal =
            getUnitPriceFromCatalog(productCatalog, previousSelection) * quantity;

          const nextSelection = ensureSelectionFromCatalog(productCatalog, {
            ...(field === "category"
              ? { category: value }
              : field === "subcategory"
                ? {
                    category: previousSelection.category,
                    subcategory: value,
                  }
                : field === "productName"
                  ? {
                      category: previousSelection.category,
                      subcategory: previousSelection.subcategory,
                      productName: value,
                    }
                  : {
                      category: previousSelection.category,
                      subcategory: previousSelection.subcategory,
                      productName: previousSelection.productName,
                      size: value,
                    }),
          });

          const nextSubtotal =
            getUnitPriceFromCatalog(productCatalog, nextSelection) * quantity;
          const currentSubtotal = normalizeMoneyInput(item.lineTotal);
          const shouldAutofillSubtotal =
            currentSubtotal <= 0 || currentSubtotal === previousSubtotal;

          return {
            ...item,
            category: nextSelection.category,
            subcategory: nextSelection.subcategory,
            productName: nextSelection.productName,
            size: nextSelection.size,
            lineTotal: shouldAutofillSubtotal
              ? String(Math.max(0, Math.round(nextSubtotal)))
              : item.lineTotal,
          };
        }),
      };
    });
  };

  const updateDraftAddress = (
    addressId: string,
    field: keyof EditableAddressDraft,
    value: string,
  ) => {
    setEditDraft((current) =>
      current
        ? {
            ...current,
            deliveryAddresses: current.deliveryAddresses.map((address) =>
              address.id === addressId ? { ...address, [field]: value } : address,
            ),
          }
        : current,
    );
  };

  const addDraftItem = () => {
    setEditDraft((current) =>
      current
        ? {
            ...current,
            items: [...current.items, createEmptyItemDraft(`${order.id}-${Date.now()}`)],
          }
        : current,
    );
  };

  const removeDraftItem = (itemId: string) => {
    setEditDraft((current) =>
      current
        ? {
            ...current,
            items:
              current.items.length > 1
                ? current.items.filter((item) => item.id !== itemId)
                : current.items,
          }
        : current,
    );
  };

  const addDraftAddress = () => {
    setEditDraft((current) =>
      current
        ? {
            ...current,
            deliveryAddresses: [
              ...current.deliveryAddresses,
              createEmptyAddressDraft(`${order.id}-${Date.now()}`),
            ],
          }
        : current,
    );
  };

  const removeDraftAddress = (addressId: string) => {
    setEditDraft((current) =>
      current
        ? {
            ...current,
            deliveryAddresses:
              current.deliveryAddresses.length > 1
                ? current.deliveryAddresses.filter((address) => address.id !== addressId)
                : current.deliveryAddresses,
          }
        : current,
    );
  };

  const handleSaveEdit = async () => {
    if (!order || !editDraft || !canEditOrder) return;

    setIsSavingEdit(true);
    try {
      const notes = buildEditableNotes(editDraft);
      const items = editDraft.items.map((item, index) => {
        const parsedAddOns = parseAddOnsInput(item.addOnsText);
        const quantity = Math.max(0, Math.round(Number(item.quantity || 0)));
        const lineTotal = normalizeMoneyInput(item.lineTotal);
        const addOnTotal = normalizeMoneyInput(item.addOnTotal);

        return {
          ...item.original,
          id: item.id || `item-${order.id}-${index}`,
          category: item.category.trim(),
          subcategory: item.subcategory.trim(),
          productName: item.productName.trim(),
          size: item.size.trim(),
          quantity,
          tokenDifficulty: normalizeTokenDifficultyValue(item.tokenDifficulty),
          customTokenPerUnit:
            item.customTokenPerUnit.trim().length > 0
              ? normalizeMoneyInput(item.customTokenPerUnit)
              : undefined,
          lineTotal,
          basePrice: lineTotal,
          addOns: parsedAddOns.addOns,
          addOnQuantities: parsedAddOns.addOnQuantities,
          addOnTotal,
          notes: item.notes.trim() || undefined,
        } satisfies OrderItem;
      });

      const deliveryAddresses = editDraft.deliveryAddresses.map((address, index) => ({
        id: address.id || `addr-${order.id}-${index}`,
        label: address.label.trim() || `Alamat ${index + 1}`,
        area: address.area.trim(),
        addressLine: address.addressLine.trim(),
      }));

      await updateOrder(order.id, {
        customerName: editDraft.customerName,
        customerPhone: editDraft.customerPhone,
        deliveryDate: editDraft.deliveryDate,
        deliverySlot: editDraft.deliverySlot,
        deliveryMethod: editDraft.deliveryMethod as
          | "PICKUP"
          | "CUSTOMER_APP_COURIER"
          | "ASSISTED_GOSEND"
          | "ASSISTED_GRAB"
          | "ASSISTED_GOCAR"
          | "ASSISTED_PAXEL"
          | "ASSISTED_SAME_DAY"
          | "REGULAR_JNE_JNT",
        notes,
        items,
        deliveryAddresses,
        deliveryFee: editDeliveryFee,
        insuranceFee: editInsuranceFee,
        manualAdjustment: editManualAdjustment,
        dpPaidAmount: editDpPaidAmount,
        finalPaidAmount: editFinalPaidAmount,
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-10">
      <GradientPageHeader
        title={`Booking ${bookingCodeValue}`}
        description={`Dibuat ${createdDisplayTime}`}
        icon={FileText}
      />

      <section className="space-y-3 rounded-[28px] border border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] p-4 shadow-[0_16px_30px_-24px_rgba(30,18,10,0.45)]">
        <div className="space-y-4 px-1 sm:px-2">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--crumbella-border)] pb-4">
          <div className="flex items-start gap-3">
            <Link
              href="/bakery/bookings"
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--crumbella-border)] bg-white text-[var(--crumbella-primary)]"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <p className="text-[1.9rem] font-bold leading-none text-[var(--foreground)]">
                #{bookingCodeValue}
              </p>
              <p className="mt-1 text-sm text-[var(--crumbella-muted)]">
                Dibuat {createdDisplayTime}
              </p>
            </div>
          </div>
          {isLateOrder ? (
            <span className="rounded-full bg-[#ffe7e1] px-3 py-1 text-xs font-semibold text-[#b63b2d]">
              Terlambat
            </span>
          ) : (
            <span className="rounded-full bg-[#eef7ef] px-3 py-1 text-xs font-semibold text-[#2d6d48]">
              {normalizedOrderStatus}
            </span>
          )}
        </div>

        <div className="space-y-4">
          <Card className="overflow-hidden rounded-[24px] border-[var(--crumbella-border)] shadow-none">
            <CardHeader className="px-4 pb-3 pt-4">
              <CardTitle className="text-sm uppercase tracking-[0.16em] text-[var(--foreground)]">
                Status Order
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 px-4 pb-4 pt-0">
              <div className="grid grid-cols-5 gap-2">
                {statusSteps.map((step, index) => {
                  const isDone = index < activeStatusIndex;
                  const isActive = index === activeStatusIndex;
                  return (
                    <div key={step} className="flex flex-col items-center text-center">
                      <div className="flex w-full items-center justify-center">
                        {index > 0 ? (
                          <div className={`h-[2px] flex-1 ${index <= activeStatusIndex ? "bg-[var(--crumbella-accent)]" : "bg-[#dfcdc0]"}`} />
                        ) : (
                          <div className="flex-1" />
                        )}
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-full border text-[11px] ${
                            isDone
                              ? "border-[#2d6d48] bg-[#2d6d48] text-white"
                              : isActive
                                ? "border-[var(--crumbella-accent)] bg-[var(--crumbella-accent)] text-white"
                                : "border-[#d9c8bc] bg-[#f6ebe1] text-[#b89d8a]"
                          }`}
                        >
                          {isDone ? <Check className="h-4 w-4" /> : <Circle className="h-3 w-3 fill-current" />}
                        </div>
                        {index < statusSteps.length - 1 ? (
                          <div className={`h-[2px] flex-1 ${index < activeStatusIndex ? "bg-[var(--crumbella-accent)]" : "bg-[#dfcdc0]"}`} />
                        ) : (
                          <div className="flex-1" />
                        )}
                      </div>
                      <p className={`mt-2 text-[10px] font-medium leading-tight ${isActive ? "text-[var(--crumbella-accent)]" : isDone ? "text-[#2d6d48]" : "text-[#aa8b76]"}`}>
                        {step}
                      </p>
                    </div>
                  );
                })}
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <Select value={statusDraft} onChange={(event) => setStatusDraft(event.target.value)}>
                  {BOOKING_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  className="h-11 rounded-2xl bg-[var(--crumbella-accent)] px-5 text-white hover:bg-[var(--crumbella-accent-strong)]"
                  disabled={!canUpdateStatus || statusDraft === normalizedOrderStatus}
                  onClick={() => {
                    void updateOrderStatus(
                      order.id,
                      statusDraft as
                        | "In Production"
                        | "Ready"
                        | "Delivery"
                        | "Completed"
                        | "Delivered"
                        | "Cancelled",
                    ).catch(() => {});
                  }}
                >
                  Simpan
                </Button>
              </div>
              {!canUpdateStatus ? (
                <p className="text-sm text-[var(--crumbella-muted)]">
                  {statusUpdateHelperText}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-[24px] border-[var(--crumbella-border)] shadow-none">
            <CardHeader className="border-b border-[var(--crumbella-border)] px-4 py-4">
              <CardTitle className="flex items-center gap-2 text-[1.2rem] text-[var(--foreground)]">
                <FileText className="h-4 w-4 text-[var(--crumbella-primary)]" />
                Detail Pesanan
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 py-4">
              <div className="grid grid-cols-2 gap-0 rounded-[18px] border border-[#eadccf] bg-[#fffdf9]">
                <div className="border-b border-r border-[#eadccf] px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#d29a6e]">Tanggal</p>
                  <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">{formatDisplayDate(order.deliveryDate)}</p>
                </div>
                <div className="border-b border-[#eadccf] px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#d29a6e]">Jam</p>
                  <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">{formatDisplayTime(order.deliverySlot)}</p>
                </div>
                <div className="border-r border-[#eadccf] px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#d29a6e]">Metode</p>
                  <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">{readableMethod}</p>
                </div>
                <div className="px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#d29a6e]">Kode Booking</p>
                  <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">{bookingCodeValue}</p>
                </div>
              </div>
              <div className="mt-3 rounded-[18px] border border-[#eadccf] bg-[#fffdf9] px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#d29a6e]">Alamat</p>
                <p className="mt-1 text-sm text-[var(--foreground)]">{primaryAddress}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-[24px] border-[var(--crumbella-border)] shadow-none">
            <CardHeader className="border-b border-[var(--crumbella-border)] px-4 py-4">
              <CardTitle className="flex items-center gap-2 text-[1.2rem] text-[var(--foreground)]">
                <UserRound className="h-4 w-4 text-[var(--crumbella-primary)]" />
                Customer
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-3 px-4 py-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f6e2d1] text-sm font-bold text-[var(--crumbella-primary)]">
                {getInitials(order.customerName)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xl font-semibold text-[var(--foreground)]">{order.customerName || "-"}</p>
                <p className="text-sm text-[var(--crumbella-muted)]">{order.customerPhone || "-"}</p>
              </div>
              <button
                type="button"
                onClick={handleChatAndCopy}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#efe7fb] text-[#9a7acd]"
                title="Chat & Copy Message"
              >
                <MessageCircle className="h-4 w-4" />
              </button>
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-[24px] border-[var(--crumbella-border)] shadow-none">
            <CardHeader className="border-b border-[var(--crumbella-border)] px-4 py-4">
              <CardTitle className="text-[1.2rem] text-[var(--foreground)]">🍪 Order Items</CardTitle>
            </CardHeader>
            <CardContent className="px-0 py-0">
              {itemRows.map((row) => (
                <div key={row.id} className="border-b border-[var(--crumbella-border)] px-4 py-4 last:border-b-0">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-lg font-semibold text-[var(--foreground)]">{row.title}</p>
                    <p className="shrink-0 text-lg font-semibold text-[var(--foreground)]">{formatCurrency(row.lineTotal)}</p>
                  </div>
                  {row.details.length > 0 ? (
                    <div className="mt-1 space-y-1 text-sm text-[#7e6655]">
                      {row.details.map((detail, index) => (
                        <p key={`${row.id}-${index}`}>{detail}</p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
              <div className="flex items-center justify-between px-4 py-4">
                <p className="text-[1.1rem] font-semibold text-[var(--foreground)]">Total</p>
                <p className="text-[1.7rem] font-bold text-[var(--crumbella-accent)]">{formatCurrency(totalPrice)}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-[24px] border-[var(--crumbella-border)] shadow-none">
            <CardHeader className="border-b border-[var(--crumbella-border)] px-4 py-4">
              <CardTitle className="flex items-center gap-2 text-[1.2rem] text-[var(--foreground)]">
                <CreditCard className="h-4 w-4 text-[var(--crumbella-primary)]" />
                Status Pembayaran
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0 px-0 py-0">
              <div className="flex items-center justify-between px-4 py-4">
                <div>
                  <p className="text-sm text-[var(--crumbella-muted)]">
                    {isFullyPaid ? "Pembayaran Masuk" : "DP Masuk"}
                  </p>
                  <p className="text-[1.5rem] font-bold text-[var(--foreground)]">{formatCurrency(totalPaidAmount)}</p>
                </div>
                <span className="rounded-full bg-[#eaf7e9] px-3 py-1 text-xs font-semibold text-[#2d6d48]">
                  {isFullyPaid ? "Lunas" : `DP ${effectiveDpPercent}%`}
                </span>
              </div>
              <div className="border-t border-[var(--crumbella-border)] px-4 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-[var(--crumbella-muted)]">Sisa Tagihan</p>
                    <p className="text-[1.5rem] font-bold text-[#cb3d2f]">{formatCurrency(remainingBalanceAmount)}</p>
                  </div>
                  <span className="rounded-full bg-[#ffe9e6] px-3 py-1 text-xs font-semibold text-[#cb3d2f]">
                    {remainingBalanceAmount > 0 ? "Belum Lunas" : "Lunas"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card
            id="edit-delivery"
            className="overflow-hidden rounded-[24px] border-[var(--crumbella-border)] shadow-none"
          >
            <CardHeader className="border-b border-[var(--crumbella-border)] px-4 py-4">
              <CardTitle className="flex items-center justify-between gap-3 text-[1.2rem] text-[var(--foreground)]">
                <div className="flex items-center gap-3">
                  <span>Quick Edit Booking Order</span>
                  <span className="rounded-full bg-[#fff4ea] px-3 py-1 text-xs font-semibold text-[var(--crumbella-accent)]">
                    {canEditOrder ? "Editable" : "Read only"}
                  </span>
                </div>
                {order ? (
                  <Link
                    href={`/bakery/bookings/${order.id}/edit`}
                    className="inline-flex h-9 items-center rounded-xl border border-[var(--crumbella-border)] px-3 text-xs font-semibold text-[var(--foreground)]"
                  >
                    Buka Full Editor
                  </Link>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 px-4 py-4">
              {order ? (
                <>
                  {!canEditOrder ? (
                    <p className="rounded-2xl border border-[#eed9c6] bg-[#fff8f2] px-4 py-3 text-sm text-[#8a6547]">
                      Hanya owner atau admin yang bisa mengubah detail booking.
                    </p>
                  ) : (
                    <p className="rounded-2xl border border-[#e6d9ce] bg-[#fffaf5] px-4 py-3 text-sm text-[#7b5d47]">
                      Form edit di bawah ini sekarang memakai komponen yang sama persis dengan <span className="font-semibold">Booking Order</span>, termasuk flavor, premium flavor, dan add-ons. Quick edit lama tetap saya simpan di bawah sebagai fallback.
                    </p>
                  )}

                  <div className="rounded-[22px] border border-[#eadccf] bg-[#fffdf9] p-2">
                    <BookingForm
                      mode="edit"
                      orderId={order.id}
                      initialOrder={order}
                    />
                  </div>

                  {editDraft ? (
                    <details className="rounded-[18px] border border-[#eadccf] bg-[#fffdf9]">
                      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-[var(--foreground)]">
                        Quick Edit Lama
                      </summary>
                      <div className="space-y-5 border-t border-[#eadccf] px-4 py-4">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1 text-sm">
                          <span className="font-medium text-[var(--foreground)]">Nama Customer</span>
                          <Input
                            value={editDraft.customerName}
                            onChange={(event) => updateDraftField("customerName", event.target.value)}
                            disabled={!canEditOrder || isSavingEdit}
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="font-medium text-[var(--foreground)]">No. WhatsApp</span>
                          <Input
                            value={editDraft.customerPhone}
                            onChange={(event) => updateDraftField("customerPhone", event.target.value)}
                            disabled={!canEditOrder || isSavingEdit}
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="font-medium text-[var(--foreground)]">Tanggal Delivery</span>
                          <Input
                            type="date"
                            value={editDraft.deliveryDate}
                            onChange={(event) => updateDraftField("deliveryDate", event.target.value)}
                            disabled={!canEditOrder || isSavingEdit}
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="font-medium text-[var(--foreground)]">Jam Delivery</span>
                          <Input
                            type="time"
                            value={editDraft.deliverySlot}
                            onChange={(event) => updateDraftField("deliverySlot", event.target.value)}
                            disabled={!canEditOrder || isSavingEdit}
                          />
                        </label>
                      </div>

                      <label className="space-y-1 text-sm">
                        <span className="font-medium text-[var(--foreground)]">Metode Delivery</span>
                        <Select
                          value={editDraft.deliveryMethod}
                          onChange={(event) => updateDraftField("deliveryMethod", event.target.value)}
                          disabled={!canEditOrder || isSavingEdit}
                        >
                          {DELIVERY_METHOD_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      </label>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-[var(--foreground)]">Alamat Delivery</p>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9 rounded-xl"
                            onClick={addDraftAddress}
                            disabled={!canEditOrder || isSavingEdit}
                          >
                            + Alamat
                          </Button>
                        </div>
                        {editDraft.deliveryAddresses.map((address, index) => (
                          <div
                            key={address.id}
                            className="space-y-3 rounded-[18px] border border-[#eadccf] bg-[#fffdf9] p-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-medium text-[var(--foreground)]">
                                Alamat {index + 1}
                              </p>
                              <button
                                type="button"
                                className="text-xs font-semibold text-[#c45c47] disabled:text-[#d8b2aa]"
                                onClick={() => removeDraftAddress(address.id)}
                                disabled={
                                  !canEditOrder ||
                                  isSavingEdit ||
                                  editDraft.deliveryAddresses.length <= 1
                                }
                              >
                                Hapus
                              </button>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <Input
                                value={address.label}
                                onChange={(event) =>
                                  updateDraftAddress(address.id, "label", event.target.value)
                                }
                                placeholder="Label alamat"
                                disabled={!canEditOrder || isSavingEdit}
                              />
                              <Input
                                value={address.area}
                                onChange={(event) =>
                                  updateDraftAddress(address.id, "area", event.target.value)
                                }
                                placeholder="Area"
                                disabled={!canEditOrder || isSavingEdit}
                              />
                            </div>
                            <Textarea
                              rows={3}
                              value={address.addressLine}
                              onChange={(event) =>
                                updateDraftAddress(address.id, "addressLine", event.target.value)
                              }
                              placeholder="Alamat lengkap"
                              disabled={!canEditOrder || isSavingEdit}
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1 text-sm">
                          <span className="font-medium text-[var(--foreground)]">Delivery Fee</span>
                          <Input
                            inputMode="numeric"
                            value={editDraft.deliveryFee}
                            onChange={(event) => updateDraftField("deliveryFee", event.target.value)}
                            disabled={!canEditOrder || isSavingEdit}
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="font-medium text-[var(--foreground)]">Insurance Fee</span>
                          <Input
                            inputMode="numeric"
                            value={editDraft.insuranceFee}
                            onChange={(event) => updateDraftField("insuranceFee", event.target.value)}
                            disabled={!canEditOrder || isSavingEdit}
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="font-medium text-[var(--foreground)]">Service Charge</span>
                          <Input
                            inputMode="numeric"
                            value={editDraft.serviceCharge}
                            onChange={(event) => updateDraftField("serviceCharge", event.target.value)}
                            disabled={!canEditOrder || isSavingEdit}
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="font-medium text-[var(--foreground)]">Discount Grosir (%)</span>
                          <Input
                            inputMode="decimal"
                            value={editDraft.wholesaleDiscountPercent}
                            onChange={(event) =>
                              updateDraftField("wholesaleDiscountPercent", event.target.value)
                            }
                            disabled={!canEditOrder || isSavingEdit}
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="font-medium text-[var(--foreground)]">Adjustment</span>
                          <Input
                            inputMode="numeric"
                            value={editDraft.manualAdjustment}
                            onChange={(event) =>
                              updateDraftField("manualAdjustment", event.target.value)
                            }
                            disabled={!canEditOrder || isSavingEdit}
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="font-medium text-[var(--foreground)]">Estimasi Token</span>
                          <Input value={String(editTokenEstimate)} disabled />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="font-medium text-[var(--foreground)]">DP Dibayar</span>
                          <Input
                            inputMode="numeric"
                            value={editDraft.dpPaidAmount}
                            onChange={(event) => updateDraftField("dpPaidAmount", event.target.value)}
                            disabled={!canEditOrder || isSavingEdit}
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="font-medium text-[var(--foreground)]">Pelunasan Dibayar</span>
                          <Input
                            inputMode="numeric"
                            value={editDraft.finalPaidAmount}
                            onChange={(event) =>
                              updateDraftField("finalPaidAmount", event.target.value)
                            }
                            disabled={!canEditOrder || isSavingEdit}
                          />
                        </label>
                      </div>

                      <div className="rounded-[18px] border border-[#eadccf] bg-[#fffdf9] p-3">
                        <div className="grid gap-2 text-sm text-[#6d5646]">
                          <div className="flex items-center justify-between">
                            <span>Subtotal Produk</span>
                            <span>{formatCurrency(editItemBaseSubtotal)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Subtotal Add-On</span>
                            <span>{formatCurrency(editItemAddOnSubtotal)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Discount Grosir</span>
                            <span>-{formatCurrency(editWholesaleDiscountAmount)}</span>
                          </div>
                          <div className="flex items-center justify-between border-t border-[#eadccf] pt-2 text-base font-semibold text-[var(--foreground)]">
                            <span>Total Revenue</span>
                            <span>{formatCurrency(editTotalPrice)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Total Dibayar</span>
                            <span>{formatCurrency(editTotalPaidAmount)}</span>
                          </div>
                          <div className="flex items-center justify-between text-[#c45c47]">
                            <span>Sisa Tagihan</span>
                            <span>{formatCurrency(editRemainingBalance)}</span>
                          </div>
                        </div>
                      </div>

                      <label className="space-y-1 text-sm">
                        <span className="font-medium text-[var(--foreground)]">Catatan Booking</span>
                        <Textarea
                          rows={5}
                          value={editDraft.customNotes}
                          onChange={(event) => updateDraftField("customNotes", event.target.value)}
                          placeholder="Catatan tambahan untuk booking"
                          disabled={!canEditOrder || isSavingEdit}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[var(--foreground)]">Item Booking</p>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 rounded-xl"
                        onClick={addDraftItem}
                        disabled={!canEditOrder || isSavingEdit}
                      >
                        + Item
                      </Button>
                    </div>
                    {editDraft.items.map((item, index) => (
                      <div
                        key={item.id}
                        className="space-y-3 rounded-[18px] border border-[#eadccf] bg-[#fffdf9] p-3"
                      >
                        {(() => {
                          const {
                            categoryOptions,
                            subcategoryOptions,
                            productOptions,
                            sizeOptions,
                          } = getCatalogOptionsForDraftItem(item);

                          return (
                            <>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-[var(--foreground)]">
                            Item {index + 1}
                          </p>
                          <button
                            type="button"
                            className="text-xs font-semibold text-[#c45c47] disabled:text-[#d8b2aa]"
                            onClick={() => removeDraftItem(item.id)}
                            disabled={!canEditOrder || isSavingEdit || editDraft.items.length <= 1}
                          >
                            Hapus
                          </button>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <Select
                            value={item.category}
                            onChange={(event) =>
                              updateDraftItemCatalogSelection(
                                item.id,
                                "category",
                                event.target.value,
                              )
                            }
                            disabled={!canEditOrder || isSavingEdit}
                          >
                            {categoryOptions.map((option) => (
                              <option key={`${item.id}-category-${option}`} value={option}>
                                {option}
                              </option>
                            ))}
                          </Select>
                          <Select
                            value={item.subcategory}
                            onChange={(event) =>
                              updateDraftItemCatalogSelection(
                                item.id,
                                "subcategory",
                                event.target.value,
                              )
                            }
                            disabled={!canEditOrder || isSavingEdit}
                          >
                            {subcategoryOptions.map((option) => (
                              <option key={`${item.id}-subcategory-${option}`} value={option}>
                                {option}
                              </option>
                            ))}
                          </Select>
                          <Select
                            value={item.productName}
                            onChange={(event) =>
                              updateDraftItemCatalogSelection(
                                item.id,
                                "productName",
                                event.target.value,
                              )
                            }
                            disabled={!canEditOrder || isSavingEdit}
                          >
                            {productOptions.map((option) => (
                              <option key={`${item.id}-product-${option}`} value={option}>
                                {option}
                              </option>
                            ))}
                          </Select>
                          <Select
                            value={item.size}
                            onChange={(event) =>
                              updateDraftItemCatalogSelection(
                                item.id,
                                "size",
                                event.target.value,
                              )
                            }
                            disabled={!canEditOrder || isSavingEdit}
                          >
                            {sizeOptions.map((option) => (
                              <option key={`${item.id}-size-${option}`} value={option}>
                                {option}
                              </option>
                            ))}
                          </Select>
                          <Input
                            inputMode="numeric"
                            value={item.quantity}
                            onChange={(event) =>
                              updateDraftItemQuantity(item.id, event.target.value)
                            }
                            placeholder="Qty"
                            disabled={!canEditOrder || isSavingEdit}
                          />
                          <Select
                            value={item.tokenDifficulty}
                            onChange={(event) =>
                              updateDraftItem(item.id, "tokenDifficulty", event.target.value)
                            }
                            disabled={!canEditOrder || isSavingEdit}
                          >
                            <option value="">Tanpa difficulty khusus</option>
                            {TOKEN_DIFFICULTY_OPTIONS.map((option) => (
                              <option key={`${item.id}-difficulty-${option.value}`} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </Select>
                          <Input
                            inputMode="numeric"
                            value={item.customTokenPerUnit}
                            onChange={(event) =>
                              updateDraftItem(item.id, "customTokenPerUnit", event.target.value)
                            }
                            placeholder="Custom token / unit"
                            disabled={!canEditOrder || isSavingEdit}
                          />
                          <Input
                            inputMode="numeric"
                            value={item.lineTotal}
                            onChange={(event) =>
                              updateDraftItem(item.id, "lineTotal", event.target.value)
                            }
                            placeholder="Subtotal produk"
                            disabled={!canEditOrder || isSavingEdit}
                          />
                          <Input
                            inputMode="numeric"
                            value={item.addOnTotal}
                            onChange={(event) =>
                              updateDraftItem(item.id, "addOnTotal", event.target.value)
                            }
                            placeholder="Subtotal add-on"
                            disabled={!canEditOrder || isSavingEdit}
                          />
                        </div>
                        <Input
                          value={item.addOnsText}
                          onChange={(event) => updateDraftItem(item.id, "addOnsText", event.target.value)}
                          placeholder="Add-on, contoh: 2x ribbon, topper"
                          disabled={!canEditOrder || isSavingEdit}
                        />
                        <Textarea
                          rows={3}
                          value={item.notes}
                          onChange={(event) => updateDraftItem(item.id, "notes", event.target.value)}
                          placeholder="Catatan item"
                          disabled={!canEditOrder || isSavingEdit}
                        />
                            </>
                          );
                        })()}
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 rounded-2xl"
                      onClick={() => baselineEditDraft && setEditDraft(baselineEditDraft)}
                      disabled={!isEditDirty || isSavingEdit}
                    >
                      Reset
                    </Button>
                    <Button
                      type="button"
                      className="h-11 rounded-2xl bg-[var(--crumbella-accent)] px-5 text-white hover:bg-[var(--crumbella-accent-strong)]"
                      onClick={() => void handleSaveEdit()}
                      disabled={!canEditOrder || !isEditDirty || isSavingEdit}
                    >
                      {isSavingEdit ? "Menyimpan..." : "Simpan Perubahan"}
                    </Button>
                  </div>
                      </div>
                    </details>
                  ) : null}
                </>
              ) : (
                <div className="text-sm text-[var(--crumbella-muted)]">
                  Menyiapkan form edit booking...
                </div>
              )}
            </CardContent>
          </Card>

          {bookingNotesList.length > 0 ? (
            <Card className="overflow-hidden rounded-[24px] border-[var(--crumbella-border)] shadow-none">
              <CardHeader className="border-b border-[var(--crumbella-border)] px-4 py-4">
                <CardTitle className="flex items-center gap-2 text-[1.2rem] text-[var(--foreground)]">
                  <Palette className="h-4 w-4 text-[var(--crumbella-primary)]" />
                  Design Notes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 px-0 py-0">
                <div className="px-4 py-4">
                  <ol className="space-y-2">
                    {bookingNotesList.map((note, noteIndex) => (
                      <li
                        key={`booking-note-${noteIndex}`}
                        className="grid grid-cols-[18px_1fr] gap-2 text-sm text-[var(--foreground)]"
                      >
                        <span className="text-[var(--crumbella-accent)]">
                          {noteIndex + 1}
                        </span>
                        <span>{note}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Button type="button" variant="outline" className="h-12 rounded-2xl border-[var(--crumbella-border)] text-[var(--foreground)]" onClick={handlePrintLabel}>
              <Printer className="mr-2 h-4 w-4" />
              Label
            </Button>
            {canGenerateInvoice ? (
              <Button type="button" variant="outline" className="h-12 rounded-2xl border-[var(--crumbella-border)] text-[var(--foreground)]" onClick={() => openInvoicePrintWindow(order)}>
                <ReceiptText className="mr-2 h-4 w-4" />
                Invoice
              </Button>
            ) : (
              <div className="h-12" />
            )}
            <Button
              type="button"
              className="h-12 rounded-2xl bg-[var(--crumbella-accent)] text-white hover:bg-[var(--crumbella-accent-strong)]"
              disabled={!order.shippingQuote || isCreatingResi || isBeforeScheduledShippingDate}
              onClick={handleCreateResi}
            >
              <Truck className="mr-2 h-4 w-4" />
              {isCreatingResi ? "Membuat Resi..." : "Kurir"}
            </Button>
          </div>

          <Card className="overflow-hidden rounded-[24px] border-[var(--crumbella-border)] shadow-none">
            <CardHeader className="border-b border-[var(--crumbella-border)] px-4 py-4">
              <CardTitle className="flex items-center gap-2 text-[1.2rem] text-[var(--foreground)]">
                <Clock3 className="h-4 w-4 text-[var(--crumbella-primary)]" />
                Riwayat Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 px-4 py-4">
              {(order.statusHistory ?? []).slice().reverse().map((entry) => (
                <div key={entry.id} className="grid grid-cols-[20px_1fr] gap-3">
                  <div className="flex justify-center pt-1">
                    <CircleCheckBig className="h-5 w-5 text-[#2d6d48]" />
                  </div>
                  <div>
                    <p className="font-semibold text-[var(--foreground)]">{entry.status}</p>
                    <p className="text-xs text-[var(--crumbella-muted)]">
                      {new Date(entry.timestamp).toLocaleString("id-ID")}
                    </p>
                    <p className="text-sm text-[#7e6655]">{entry.note || "-"}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          
          {(order.automationLogs ?? []).length > 0 && (
            <Card className="overflow-hidden rounded-[24px] border-[var(--crumbella-border)] shadow-none">
              <CardHeader className="border-b border-[var(--crumbella-border)] px-4 py-4">
                <CardTitle className="flex items-center gap-2 text-[1.2rem] text-[var(--foreground)]">
                  <MessageCircle className="h-4 w-4 text-[var(--crumbella-primary)]" />
                  Riwayat Automasi
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 px-4 py-4">
                {(order.automationLogs ?? []).slice().reverse().map((log) => (
                  <div key={log.id} className="grid grid-cols-[20px_1fr] gap-3">
                    <div className="flex justify-center pt-1">
                      {log.success ? (
                        <CircleCheckBig className="h-5 w-5 text-[#2d6d48]" />
                      ) : (
                        <Circle className="h-3 w-3 fill-rose-500 text-rose-500 mt-1" />
                      )}
                    </div>
                    <div>
                      <p className={`font-semibold ${log.success ? "text-[var(--foreground)]" : "text-rose-600"}`}>
                        {log.eventType.replace(/_/g, " ").toUpperCase()}
                      </p>
                      <p className="text-xs text-[var(--crumbella-muted)]">
                        {new Date(log.timestamp).toLocaleString("id-ID")}
                      </p>
                      <p className="text-sm text-[#7e6655]">{log.summary || "-"}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

        </div>
        </div>
      </section>
    </div>
  );
}


