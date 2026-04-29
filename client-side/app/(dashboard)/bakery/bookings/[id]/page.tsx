"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import GradientPageHeader from "@/components/bakery/shared/GradientPageHeader";
import StatusBadge from "@/components/bakery/shared/StatusBadge";
import PaymentBadge from "@/components/bakery/shared/PaymentBadge";
import PriceSummaryCard from "@/components/bakery/bookings/PriceSummaryCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FileText, Loader2 } from "lucide-react";
import { useOrders } from "@/components/bakery/store";
import { useParams } from "next/navigation";
import { formatCurrency } from "@/components/orders/formatters";
import { useRole } from "@/context/RoleContext";
import { openInvoicePrintWindow } from "@/components/bakery/bookings/InvoiceTemplate";
import { useBakerySettings } from "@/hooks/useBakerySettings";
import type { ShippingResiResponse } from "@/lib/bookings/shipping-types";
import {
  countConcurrentOrdersForSlot,
  getDeliverySlotsForDate,
  getSlotLimitByItems,
  isDateBlockedForOrdering,
} from "@/lib/bookings/operations";
import {
  BAKERY_DOWN_PAYMENT_PERCENT,
  calculateDownPayment,
} from "@/lib/bookings/config";
import {
  estimateOperationalWeightGram,
  parseServiceChargeFromNotes,
  resolveAdminServiceCharge,
  resolveShippingParcelCount,
} from "@/lib/bookings/delivery-rules";
import {
  BOOKING_STATUS_OPTIONS,
  normalizeOrderStatus,
} from "@/lib/bookings/order-status";
import {
  getJakartaTodayIsoDate,
  inferScheduledProviderFromQuote,
  isGrabOrGojekOrder,
  isScheduledShipmentOrder,
} from "@/lib/bookings/shipping-schedule";
import { normalizeDateInput } from "@/lib/helpers/date-normalization";
import { getSmartCourierLabel } from "@/lib/bookings/shipping-service";

type SaveSyncState = "idle" | "saving" | "saved" | "failed";

type ServerOrderPayload = {
  id: string;
  paymentStatus?: string;
  totalPaidAmount?: number;
  remainingBalance?: number;
};

function inferDeliveryMethodFromNotes(notes?: string): string | undefined {
  const match = notes?.match(/delivery\s*method\s*:\s*([^\n]+)/i);
  const raw = (match?.[1] || "").trim().toLowerCase();
  if (!raw) return undefined;

  if (raw.includes("pickup")) return "PICKUP";
  if (raw.includes("customer")) return "CUSTOMER_APP_COURIER";
  if (raw.includes("gosend") || raw.includes("go send")) {
    return "ASSISTED_GOSEND";
  }
  if (raw.includes("gocar") || raw.includes("go car")) {
    return "ASSISTED_GOCAR";
  }
  if (raw.includes("grab")) return "ASSISTED_GRAB";
  if (raw.includes("paxel")) return "ASSISTED_PAXEL";
  if (
    raw.includes("same day") ||
    raw.includes("same-day") ||
    raw.includes("sameday")
  ) {
    return "ASSISTED_SAME_DAY";
  }
  if (raw.includes("jne") || raw.includes("j&t") || raw.includes("jnt")) {
    return "REGULAR_JNE_JNT";
  }

  return undefined;
}

export default function OrderDetailPage() {
  const {
    orders,
    updateOrderStatus,
    updateOrderSchedule,
    updatePaymentStatus,
    recordPayment,
    getCustomerMessagePreview,
    setOrderShipment,
  } = useOrders();
  const params = useParams();
  const { isOwner, isAdmin, loading: isRoleLoading } = useRole();
  const { settings: bakerySettings } = useBakerySettings();
  const blockedDates = bakerySettings?.blockedDates;
  const canGenerateInvoice = isOwner || isAdmin;
  const orderId = typeof params?.id === "string" ? params.id : "";
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleSlot, setRescheduleSlot] = useState("");
  const [isCreatingResi, setIsCreatingResi] = useState(false);
  const [dpPaidDraft, setDpPaidDraft] = useState(0);
  const [finalPaidDraft, setFinalPaidDraft] = useState(0);
  const [statusDraft, setStatusDraft] = useState("");
  const [paymentSaveSyncState, setPaymentSaveSyncState] =
    useState<SaveSyncState>("idle");
  const [paymentSaveSyncMessage, setPaymentSaveSyncMessage] = useState("");
  const order = useMemo(
    () => orders.find((item) => item.id === orderId),
    [orders, orderId],
  );
  const normalizedOrderStatus = normalizeOrderStatus(order?.orderStatus);
  const normalizedPaymentStatus =
    order?.paymentStatus === "Pending"
      ? "DP Paid"
      : (order?.paymentStatus ?? "DP Paid");
  const isGrabOrGojekPaymentOrder = order ? isGrabOrGojekOrder(order) : false;
  const isScheduledShipmentProviderOrder = order
    ? isScheduledShipmentOrder(order)
    : false;
  const todayJakarta = getJakartaTodayIsoDate();
  const normalizedDeliveryDate = normalizeDateInput(order?.deliveryDate || "");
  const isBeforeScheduledShippingDate =
    isScheduledShipmentProviderOrder &&
    Boolean(normalizedDeliveryDate && normalizedDeliveryDate > todayJakarta);
  const effectiveDate = rescheduleDate || order?.deliveryDate || "";
  const effectiveSlot = rescheduleSlot || order?.deliverySlot || "10:00";
  const deliveryMethod = useMemo(
    () => inferDeliveryMethodFromNotes(order?.notes),
    [order?.notes],
  );
  const slotLimitPerHour = useMemo(
    () => getSlotLimitByItems(order?.items ?? []),
    [order?.items],
  );
  const deliverySlots = useMemo(
    () =>
      getDeliverySlotsForDate(effectiveDate, undefined, {
        deliveryMethod,
        items: order?.items ?? [],
        blockedDates,
      }),
    [effectiveDate, deliveryMethod, order?.items, blockedDates],
  );

  useEffect(() => {
    if (!deliverySlots.length) return;
    const preferred = rescheduleSlot || order?.deliverySlot || deliverySlots[0];
    if (!deliverySlots.includes(preferred)) {
      setRescheduleSlot(deliverySlots[0]);
      return;
    }
    if (!rescheduleSlot) {
      setRescheduleSlot(preferred);
    }
  }, [deliverySlots, rescheduleSlot, order?.deliverySlot]);

  const slotUsage = useMemo(() => {
    if (!effectiveDate || !effectiveSlot) return 0;
    return countConcurrentOrdersForSlot({
      orders,
      deliveryDate: effectiveDate,
      deliverySlot: effectiveSlot,
      targetItems: order?.items ?? [],
      excludeOrderId: orderId,
    });
  }, [orders, order, orderId, effectiveDate, effectiveSlot]);

  const isBlockedDate = Boolean(
    effectiveDate &&
    isDateBlockedForOrdering(effectiveDate, undefined, {
      deliveryMethod,
      items: order?.items ?? [],
      blockedDates,
    }),
  );
  const isSlotFull = slotUsage >= slotLimitPerHour;

  const totalPrice = order?.totalPrice ?? 0;
  const orderDeliveryFee = useMemo(
    () =>
      Math.max(
        0,
        Math.round(Number(order?.deliveryFee ?? order?.shippingQuote?.price ?? 0)),
      ),
    [order?.deliveryFee, order?.shippingQuote?.price],
  );
  const serviceCharge = useMemo(
    () => {
      const parsedFromNotes = parseServiceChargeFromNotes(order?.notes);
      if (parsedFromNotes > 0) return parsedFromNotes;
      return resolveAdminServiceCharge(deliveryMethod);
    },
    [order?.notes, deliveryMethod],
  );
  const messagePreview = order ? getCustomerMessagePreview(order.id) : "";
  useEffect(() => {
    if (!order) return;
    setDpPaidDraft(Number(order.dpPaidAmount ?? 0));
    setFinalPaidDraft(Number(order.finalPaidAmount ?? 0));
  }, [order]);

  useEffect(() => {
    if (!normalizedOrderStatus) return;
    setStatusDraft(normalizedOrderStatus);
  }, [normalizedOrderStatus]);

  useEffect(() => {
    setPaymentSaveSyncState("idle");
    setPaymentSaveSyncMessage("");
  }, [order?.id]);
  const verifyPaymentSavedToServer = async (params: {
    orderId: string;
    expectedStatus: "DP Paid" | "Paid";
    expectedTotalPaid: number;
    expectedRemaining: number;
  }) => {
    const { orderId, expectedStatus, expectedTotalPaid, expectedRemaining } =
      params;

    for (let attempt = 0; attempt < 7; attempt += 1) {
      try {
        const response = await fetch("/api/bookings/orders", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });

        if (response.ok) {
          const payload = (await response.json()) as {
            success?: boolean;
            data?: { orders?: ServerOrderPayload[] };
          };

          const serverOrder = payload.data?.orders?.find(
            (entry) => entry.id === orderId,
          );

          if (serverOrder) {
            const normalizedStatus =
              serverOrder.paymentStatus === "Pending"
                ? "DP Paid"
                : serverOrder.paymentStatus;
            const normalizedTotalPaid = Math.max(
              0,
              Math.round(Number(serverOrder.totalPaidAmount ?? 0)),
            );
            const normalizedRemaining = Math.max(
              0,
              Math.round(Number(serverOrder.remainingBalance ?? 0)),
            );

            if (
              normalizedStatus === expectedStatus &&
              normalizedTotalPaid === expectedTotalPaid &&
              normalizedRemaining === expectedRemaining
            ) {
              return true;
            }
          }
        }
      } catch {
        // Retry shortly; server sync can be slightly delayed.
      }

      await new Promise((resolve) => window.setTimeout(resolve, 450));
    }

    return false;
  };

  const runPaymentSaveConfirmation = async (params: {
    orderId: string;
    expectedStatus: "DP Paid" | "Paid";
    expectedTotalPaid: number;
    expectedRemaining: number;
  }) => {
    setPaymentSaveSyncState("saving");
    setPaymentSaveSyncMessage("Menyimpan ke server...");

    const saved = await verifyPaymentSavedToServer(params);
    if (saved) {
      const savedAt = new Intl.DateTimeFormat("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date());
      setPaymentSaveSyncState("saved");
      setPaymentSaveSyncMessage(`Tersimpan ke server (${savedAt})`);
      return;
    }

    setPaymentSaveSyncState("failed");
    setPaymentSaveSyncMessage(
      "Belum terverifikasi di server. Coba refresh atau simpan lagi.",
    );
  };

  const handlePaymentStatusChange = (nextStatus: "DP Paid" | "Paid") => {
    if (!order) return;

    updatePaymentStatus(order.id, nextStatus);

    const total = Math.max(0, Math.round(Number(order.totalPrice || 0)));
    const expectedTotalPaid =
      nextStatus === "Paid" ? total : calculateDownPayment(total);
    const expectedRemaining = Math.max(0, total - expectedTotalPaid);

    void runPaymentSaveConfirmation({
      orderId: order.id,
      expectedStatus: nextStatus,
      expectedTotalPaid,
      expectedRemaining,
    });
  };

  const handleReschedule = () => {
    if (!order) return;
    if (!effectiveDate || !effectiveSlot || isBlockedDate || isSlotFull) return;
    updateOrderSchedule(order.id, effectiveDate, effectiveSlot);
  };

  const handlePrintLabel = () => {
    if (!order) return;
    const orderServiceCharge = serviceCharge;
    const itemLines = (order.items ?? [])
      .map((item) => `${item.quantity}x ${item.productName} (${item.size})`)
      .join("<br />");
    const addressLines = (order.deliveryAddresses ?? [])
      .map((address) => `${address.label} - ${address.addressLine}`)
      .join("<br />");

    const printWindow = window.open("", "_blank", "width=420,height=720");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Print Label</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 16px; color: #111827; }
            .label { border: 1px dashed #111827; padding: 12px; width: 320px; }
            .title { font-size: 14px; font-weight: 700; margin-bottom: 10px; }
            .row { font-size: 12px; margin-bottom: 6px; }
            .muted { color: #4b5563; font-size: 11px; }
          </style>
        </head>
        <body>
          <div class="label">
            <div class="title">ORDER LABEL</div>
            <div class="row"><strong>Code:</strong> ${order.resi || order.bookingCode || order.id}</div>
            <div class="row"><strong>Resi:</strong> ${order.shipment?.trackingNumber || "-"}</div>
            <div class="row"><strong>Name:</strong> ${order.customerName}</div>
            <div class="row"><strong>Phone:</strong> ${order.customerPhone || "-"}</div>
            <div class="row"><strong>Address:</strong><br />${addressLines || "-"}</div>
            <div class="row"><strong>Delivery:</strong> ${order.deliveryDate} ${order.deliverySlot}</div>
            <div class="row"><strong>Items:</strong><br />${itemLines || "-"}</div>
            ${orderDeliveryFee > 0 ? `<div class="row"><strong>Ongkir:</strong> ${formatCurrency(orderDeliveryFee)}</div>` : ""}
            ${orderServiceCharge > 0 ? `<div class="row"><strong>Service Charge:</strong> ${formatCurrency(orderServiceCharge)}</div>` : ""}
            <div class="row"><strong>Total:</strong> ${formatCurrency(order.totalPrice ?? 0)}</div>
            <div class="muted">Generated by Bakery OMS</div>
          </div>
          <script>window.print();window.close();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };
  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(messagePreview);
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

  const handleRecordPayment = () => {
    if (!order) return;
    const nextDpPaid = Math.max(0, Math.round(Number(dpPaidDraft || 0)));
    const nextFinalPaid = Math.max(0, Math.round(Number(finalPaidDraft || 0)));
    const total = Math.max(0, Math.round(Number(order.totalPrice || 0)));
    const nextTotalPaid = Math.min(total, nextDpPaid + nextFinalPaid);
    const nextRemaining = Math.max(0, total - nextTotalPaid);
    const expectedStatus = nextTotalPaid >= total ? "Paid" : "DP Paid";

    recordPayment(order.id, {
      dpPaidAmount: nextDpPaid,
      finalPaidAmount: nextFinalPaid,
      note: "Payment verified from booking detail",
    });

    void runPaymentSaveConfirmation({
      orderId: order.id,
      expectedStatus,
      expectedTotalPaid: nextTotalPaid,
      expectedRemaining: nextRemaining,
    });
  };
  if (isRoleLoading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-5 text-sm text-gray-500 shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Memuat hak akses booking...
      </div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-6 pb-10">
        <GradientPageHeader
          title="Order Detail"
          description="We could not find this booking."
          icon={FileText}
        />
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-4 py-6 text-center text-sm text-gray-500">
          Order not found. Please return to the bookings list.
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
  const readableMethod =
    deliveryMethod === "PICKUP"
      ? "Pickup"
      : deliveryMethod === "CUSTOMER_APP_COURIER"
        ? "Kurir Pesanan Customer"
        : deliveryMethod === "ASSISTED_GOSEND"
          ? "GoSend (Admin)"
          : deliveryMethod === "ASSISTED_GOCAR"
            ? "GoCar (Admin)"
            : deliveryMethod === "ASSISTED_GRAB"
              ? "Grab (Admin)"
              : deliveryMethod === "ASSISTED_PAXEL"
                ? "Paxel (Admin)"
                : deliveryMethod === "ASSISTED_SAME_DAY"
                  ? "Same Day (Admin)"
                  : deliveryMethod === "REGULAR_JNE_JNT"
                    ? "JNE/JNT"
                    : "Pickup";
  const parsedReferenceLabels = [
    ...(Array.isArray(order.whatsAppParsedData?.requestedImageLabels)
      ? order.whatsAppParsedData.requestedImageLabels
      : []),
    ...((order.whatsAppParsedData?.referenceImages ?? [])
      .map((image) => image.label || "")
      .filter((label) => label.trim().length > 0)),
  ]
    .map((label) => label.trim())
    .filter((label, index, array) => {
      const normalized = label.toLowerCase();
      return (
        normalized.length > 0 &&
        array.findIndex((entry) => entry.toLowerCase() === normalized) === index
      );
    });
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
  const bookingNotesList = [...parsedReferenceLabels, ...customNotesOnly];
  const itemRows = (order.items ?? []).map((item) => {
    const quantity = Math.max(1, Number(item.quantity || 1));
    const baseUnit = Math.max(0, Number(item.basePrice || 0));
    const addOnUnit = Math.max(0, Number(item.addOnTotal || 0));
    const computedLineTotal = Math.max(0, Math.round((baseUnit + addOnUnit) * quantity));
    const lineTotal = Math.max(0, Math.round(Number(item.lineTotal || computedLineTotal)));
    const unitPrice = quantity > 0 ? Math.round(lineTotal / quantity) : lineTotal;
    const details = [
      item.size ? `${item.size}` : "",
      item.subcategory ? `${item.subcategory}` : "",
      item.addOns?.length ? `Add-on: ${item.addOns.join(", ")}` : "",
      item.notes ? item.notes : "",
      item.cookieDifficultyBreakdown ? item.cookieDifficultyBreakdown : "",
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
    <div className="mx-auto max-w-4xl space-y-5 pb-10">
      <GradientPageHeader
        title={`Booking #${bookingCodeValue}`}
        description={`Dibuat ${createdDisplayTime}`}
        icon={FileText}
      />

      <div className="space-y-6">
        <Card className="rounded-2xl border-[#eadccf] shadow-sm">
          <CardHeader className="p-6 pb-2">
            <CardTitle className="text-[#7e6655]">Status Booking</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-6 pb-6 pt-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span className="rounded-full bg-gray-100 px-3 py-1">Requested</span>
              <span className="rounded-full bg-gray-100 px-3 py-1">Confirmed</span>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-semibold text-amber-700">
                {normalizedOrderStatus}
              </span>
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
                variant="outline"
                className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                onClick={() =>
                  updateOrderStatus(
                    order.id,
                    statusDraft as
                      | "In Production"
                      | "Ready"
                      | "Delivery"
                      | "Completed"
                      | "Delivered"
                      | "Cancelled",
                  )
                }
              >
                Simpan
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-[#eadccf] shadow-sm">
          <CardHeader className="p-6 pb-2">
            <CardTitle className="text-[#7e6655]">Detail Pesanan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 px-6 pb-6 pt-0 text-sm text-gray-800">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><p className="text-[11px] font-semibold uppercase tracking-wide text-[#e0b48b]">Tanggal Pengiriman</p><p className="mt-1 font-semibold">{order.deliveryDate || "-"}</p></div>
              <div><p className="text-[11px] font-semibold uppercase tracking-wide text-[#e0b48b]">Jam</p><p className="mt-1 font-semibold">{order.deliverySlot || "-"}</p></div>
              <div><p className="text-[11px] font-semibold uppercase tracking-wide text-[#e0b48b]">Metode</p><p className="mt-1 font-semibold">{readableMethod}</p></div>
              <div><p className="text-[11px] font-semibold uppercase tracking-wide text-[#e0b48b]">Kode Booking</p><p className="mt-1 font-semibold">{bookingCodeValue}</p></div>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#e0b48b]">Alamat Pengiriman</p>
              <p className="mt-1">{primaryAddress}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-[#eadccf] shadow-sm">
          <CardHeader className="p-6 pb-2"><CardTitle className="text-[#7e6655]">Customer</CardTitle></CardHeader>
          <CardContent className="space-y-1 px-6 pb-6 pt-0 text-sm text-gray-800">
            <p className="font-semibold">{order.customerName || "-"}</p>
            <p className="text-[#e0b48b]">{order.customerPhone || "-"}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-[#eadccf] shadow-sm">
          <CardHeader className="p-6 pb-2"><CardTitle className="text-[#7e6655]">Order Items</CardTitle></CardHeader>
          <CardContent className="space-y-3 px-6 pb-6 pt-0 text-sm text-gray-800">
            {itemRows.map((row) => (
              <div key={row.id} className="rounded-xl border border-[#eadccf] px-4 py-3">
                <div className="flex items-start justify-between gap-2"><p className="font-semibold">{row.title}</p><p className="font-semibold">{formatCurrency(row.lineTotal)}</p></div>
                {row.details.length > 0 && <div className="mt-1 space-y-1 text-xs text-[#c79b73]">{row.details.map((detail, index) => (<p key={`${row.id}-detail-${index}`}>{detail}</p>))}</div>}
                <p className="mt-1 text-xs text-gray-500">Harga/unit: {formatCurrency(row.unitPrice)}</p>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-[#eadccf] pt-3">
              <p className="text-base font-semibold">Total Pesanan</p>
              <p className="text-2xl font-bold text-[#f26a21]">{formatCurrency(totalPrice)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-[#eadccf] shadow-sm">
          <CardHeader className="p-6 pb-2"><CardTitle className="text-[#7e6655]">Ringkasan Harga</CardTitle></CardHeader>
          <CardContent className="px-6 pb-6 pt-0">
            <PriceSummaryCard
              basePrice={order.basePrice ?? 0}
              addOnTotal={order.addOnTotal ?? 0}
              deliveryFee={order.deliveryFee ?? 0}
              serviceCharge={serviceCharge}
              manualAdjustment={order.manualAdjustment ?? 0}
              totalPrice={totalPrice}
            />
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-[#eadccf] shadow-sm">
          <CardHeader className="p-6 pb-2"><CardTitle className="text-[#7e6655]">Kurir & Pengiriman</CardTitle></CardHeader>
          <CardContent className="space-y-3 px-6 pb-6 pt-0 text-sm text-gray-700">
            {order.shippingQuote ? (
              <div className="rounded-lg border border-[#eadccf] bg-[#fff8f1] px-3 py-2">
                <p className="font-semibold">{order.shippingQuote.provider} - {getSmartCourierLabel({ courierName: order.shippingQuote.courierServiceName, deliveryDate: order.deliveryDate })}</p>
                <p className="text-xs text-[#c79b73]">Ongkir {formatCurrency(orderDeliveryFee)} ? ETA {order.shippingQuote.eta} ? {order.shippingQuote.distanceKm} km</p>
                {serviceCharge > 0 && <p className="text-xs text-[#c79b73]">Service Charge {formatCurrency(serviceCharge)}</p>}
              </div>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-3">
              <Button type="button" variant="outline" className="h-10 border-indigo-200 text-indigo-700 hover:bg-indigo-50" onClick={handlePrintLabel}>Print Label</Button>
              {canGenerateInvoice && <Button type="button" variant="outline" className="h-10 border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100" onClick={() => openInvoicePrintWindow(order)}>Cetak Invoice</Button>}
              <Button type="button" variant="outline" className="h-10 border-indigo-200 text-indigo-700 hover:bg-indigo-50" disabled={!order.shippingQuote || isCreatingResi || isBeforeScheduledShippingDate} onClick={handleCreateResi}>{isCreatingResi ? "Membuat Resi..." : "Generate Resi"}</Button>
            </div>
            {order.shipment?.trackingNumber ? <p className="text-xs text-gray-600">Resi aktif: <span className="font-semibold">{order.shipment.trackingNumber}</span></p> : null}
          </CardContent>
        </Card>

        {bookingNotesList.length > 0 ? (
          <Card className="rounded-2xl border-[#eadccf] shadow-sm">
            <CardHeader className="p-6 pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-[#7e6655]">Catatan Booking</CardTitle>
                <a href="#edit-delivery" className="inline-flex h-8 items-center rounded-lg border border-[#eadccf] px-3 text-xs font-semibold text-[#7e6655]">Edit</a>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 px-6 pb-6 pt-0 text-sm text-gray-800">
              <ol className="space-y-2 pl-5">
                {bookingNotesList.map((note, index) => (
                  <li key={`note-${index}`} className="list-decimal marker:text-[#f26a21]">{note}</li>
                ))}
              </ol>
            </CardContent>
          </Card>
        ) : null}

        <Card className="rounded-2xl border-[#eadccf] shadow-sm">
          <CardHeader className="p-6 pb-2"><CardTitle className="text-[#7e6655]">Riwayat Status</CardTitle></CardHeader>
          <CardContent className="space-y-3 px-6 pb-6 pt-0 text-sm text-gray-700">
            {(order.statusHistory ?? []).slice().reverse().map((entry) => (
              <div key={entry.id} className="rounded-lg border border-[#eadccf] px-3 py-2">
                <p className="font-semibold text-[#2f7f63]">{entry.status}</p>
                <p className="text-xs text-[#c79b73]">{new Date(entry.timestamp).toLocaleString("id-ID")}</p>
                <p className="text-sm text-gray-600">{entry.note || "-"}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card id="edit-delivery" className="rounded-2xl border-[#eadccf] shadow-sm">
          <CardHeader className="p-6 pb-2"><CardTitle className="text-[#7e6655]">Edit Jadwal Delivery</CardTitle></CardHeader>
          <CardContent className="space-y-3 px-6 pb-6 pt-0 text-sm text-gray-700">
            <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Delivery Date
                  </span>
                  <input
                    type="date"
                    value={rescheduleDate}
                    onChange={(event) => setRescheduleDate(event.target.value)}
                    className="h-10 rounded-xl border border-gray-200 px-3"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Delivery Slot
                  </span>
                  <Select
                    value={rescheduleSlot}
                    onChange={(event) => setRescheduleSlot(event.target.value)}
                  >
                    {deliverySlots.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>
              {(isBlockedDate || isSlotFull) && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  {isBlockedDate
                    ? "Selected date is blocked/unavailable."
                    : `Slot full (${slotUsage}/${slotLimitPerHour}). Choose another time.`}
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                disabled={!rescheduleDate || isBlockedDate || isSlotFull}
                onClick={handleReschedule}
              >
                Save Reschedule
              </Button>
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 whitespace-pre-wrap text-xs text-gray-700">
              {messagePreview}
            </div>
            <Button
              type="button"
              variant="outline"
              className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
              onClick={handleCopyMessage}
            >
              Copy Message
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-[#eadccf] shadow-sm">
          <CardHeader className="p-6 pb-2"><CardTitle className="text-[#7e6655]">Verifikasi Pembayaran</CardTitle></CardHeader>
          <CardContent className="space-y-3 px-6 pb-6 pt-0">
              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>Payment Status</span>
                <PaymentBadge status={order.paymentStatus} />
              </div>
              {isGrabOrGojekPaymentOrder && (
                <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700">
                  Penanda pembayaran: order ini menggunakan Grab/Gojek.
                </div>
              )}
              <Select
                value={normalizedPaymentStatus}
                onChange={(event) =>
                  handlePaymentStatusChange(
                    event.target.value as "DP Paid" | "Paid",
                  )
                }
                disabled={paymentSaveSyncState === "saving"}
              >
                <option value="DP Paid">DP 50%</option>
                <option value="Paid">Lunas</option>
              </Select>
              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>Order Status</span>
                <StatusBadge status={normalizedOrderStatus} />
              </div>
              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>DP ({BAKERY_DOWN_PAYMENT_PERCENT}%)</span>
                <span className="font-semibold text-gray-900">
                  Rp {Number(calculateDownPayment(totalPrice)).toLocaleString("id-ID")}
                </span>
              </div>
              <div className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">DP Paid (Actual)</span>
                <Input type="number" min={0} step={1000} value={dpPaidDraft} onChange={(event) => setDpPaidDraft(Number(event.target.value || 0))} />
              </div>
              <div className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Final Paid (Actual)</span>
                <Input type="number" min={0} step={1000} value={finalPaidDraft} onChange={(event) => setFinalPaidDraft(Number(event.target.value || 0))} />
              </div>
              <div className="flex items-center justify-between text-sm text-gray-600"><span>Total Paid</span><span className="font-semibold text-gray-900">Rp {Number(order.totalPaidAmount ?? 0).toLocaleString("id-ID")}</span></div>
              <div className="flex items-center justify-between text-sm text-gray-600"><span>Remaining</span><span className="font-semibold text-gray-900">Rp {Number(order.remainingBalance ?? 0).toLocaleString("id-ID")}</span></div>
              <Button type="button" variant="outline" className="border-indigo-200 text-indigo-700 hover:bg-indigo-50" onClick={handleRecordPayment} disabled={paymentSaveSyncState === "saving"}>
                {paymentSaveSyncState === "saving" ? "Menyimpan..." : "Save Payment Verification"}
              </Button>

          </CardContent>
        </Card>
      </div>
    </div>
  );
}
