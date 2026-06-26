"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import PriceSummaryCard from "@/components/bakery/bookings/PriceSummaryCard";
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
} from "@/components/bakery/store";
import { useParams } from "next/navigation";
import { formatCurrency } from "@/components/orders/formatters";
import { openInvoicePrintWindow } from "@/components/bakery/bookings/InvoiceTemplate";
import { openLabelPrintWindow } from "@/components/bakery/bookings/LabelTemplate";
import type { ShippingResiResponse } from "@/lib/bookings/shipping-types";
import {
  resolveShippingParcelCount,
} from "@/lib/bookings/delivery-rules";
import {
  calculateShippingWeightGram,
  getProductLookupKeyFromItem,
} from "@/lib/bookings/product-weight";
import {
  BOOKING_STATUS_OPTIONS,
  normalizeOrderStatus,
} from "@/lib/bookings/order-status";
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
import { calculateOrderFinancialBreakdown } from "@/lib/bookings/financial-breakdown";

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

export default function OrderDetailPage() {
  const { isOwner, isAdmin } = useRole();
  const {
    orders,
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
  const canUpdateStatus = isOwner || isAdmin || hasAnyProductionAssignment;
  const statusUpdateHelperText = canUpdateStatus
    ? ""
    : "Status order tanpa assignment staff hanya bisa diubah oleh owner atau admin.";

  const totalPrice = order?.totalPrice ?? 0;
  const orderFinancialBreakdown = useMemo(
    () =>
      calculateOrderFinancialBreakdown({
        basePrice: order?.basePrice,
        designAdjustmentTotal: order?.designAdjustmentTotal,
        addOnTotal: order?.addOnTotal,
        productAdjustment: order?.productAdjustment,
        nonProductAdjustment: order?.nonProductAdjustment,
        productSubtotal: order?.productSubtotal,
        productDiscountAmount: order?.productDiscountAmount,
        serviceCharge: order?.serviceCharge,
        deliveryFee: order?.deliveryFee,
        insuranceFee: order?.insuranceFee,
        totalPrice: order?.totalPrice,
        legacyManualAdjustment: order?.manualAdjustment,
        notes: order?.notes,
      }),
    [
      order?.addOnTotal,
      order?.basePrice,
      order?.deliveryFee,
      order?.designAdjustmentTotal,
      order?.insuranceFee,
      order?.manualAdjustment,
      order?.nonProductAdjustment,
      order?.notes,
      order?.productAdjustment,
      order?.productDiscountAmount,
      order?.productSubtotal,
      order?.serviceCharge,
    ],
  );
  const messagePreview = order ? getCustomerMessagePreview(order.id) : "";

  useEffect(() => {
    if (!normalizedOrderStatus) return;
    setStatusDraft(normalizedOrderStatus);
  }, [normalizedOrderStatus]);

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
        productLookupKey: getProductLookupKeyFromItem(item),
        quantity: resolveShippingParcelCount(item),
        weightGram: calculateShippingWeightGram(item),
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

          <PriceSummaryCard
            basePrice={orderFinancialBreakdown.basePrice}
            designAdjustmentTotal={orderFinancialBreakdown.designAdjustmentTotal}
            addOnTotal={orderFinancialBreakdown.addOnTotal}
            productAdjustment={orderFinancialBreakdown.productAdjustment}
            deliveryFee={orderFinancialBreakdown.deliveryFee}
            insuranceFee={orderFinancialBreakdown.insuranceFee}
            serviceCharge={orderFinancialBreakdown.serviceCharge}
            nonProductAdjustment={orderFinancialBreakdown.nonProductAdjustment}
            wholesaleDiscountPercent={orderFinancialBreakdown.wholesaleDiscountPercent}
            wholesaleDiscountAmount={orderFinancialBreakdown.productDiscountAmount}
            totalPrice={orderFinancialBreakdown.totalPrice}
            paymentStatus={isFullyPaid ? "Paid" : "DP Paid"}
            paymentPaidAmount={totalPaidAmount}
            paymentRemainingAmount={remainingBalanceAmount}
          />

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
                  {isFullyPaid ? "Lunas" : "DP"}
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


