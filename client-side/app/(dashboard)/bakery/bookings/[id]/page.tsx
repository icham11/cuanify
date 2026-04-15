"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import GradientPageHeader from "@/components/bakery/shared/GradientPageHeader";
import StatusBadge from "@/components/bakery/shared/StatusBadge";
import PaymentBadge from "@/components/bakery/shared/PaymentBadge";
import PriceSummaryCard from "@/components/bakery/bookings/PriceSummaryCard";
import OrderStepper from "@/components/bakery/shared/OrderStepper";
import OrderTimeline from "@/components/bakery/shared/OrderTimeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FileText, Printer } from "lucide-react";
import { useOrders } from "@/components/bakery/store";
import { useParams } from "next/navigation";
import { formatCurrency } from "@/components/orders/formatters";
import { toast } from "sonner";
import {
  getDisplayFields,
  WHATSAPP_ORDER_LABELS,
} from "@/lib/bookings/whatsapp-parser";
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
import { estimateOperationalWeightGram } from "@/lib/bookings/delivery-rules";
import {
  BOOKING_STATUS_OPTIONS,
  normalizeOrderStatus,
} from "@/lib/bookings/order-status";
import {
  getJakartaTodayIsoDate,
  isGrabOrGojekOrder,
  isScheduledShipmentOrder,
} from "@/lib/bookings/shipping-schedule";
import { normalizeDateInput } from "@/lib/helpers/date-normalization";

type SaveSyncState = "idle" | "saving" | "saved" | "failed";

type ServerOrderPayload = {
  id: string;
  paymentStatus?: string;
  totalPaidAmount?: number;
  remainingBalance?: number;
};

type TokenDifficulty =
  | "SIMPLE"
  | "NORMAL"
  | "HARD"
  | "ADVANCED"
  | "EXPERT"
  | "MEDIUM"
  | "DIFFICULT";

function resolveItemDifficulty(item: {
  category: string;
  tokenDifficulty?: TokenDifficulty;
}): TokenDifficulty {
  if (item.tokenDifficulty) return item.tokenDifficulty;
  if (item.category === "Cake" || item.category === "Cookies Tower") {
    return "HARD";
  }
  if (item.category === "Buket" || item.category === "Cupcakes") {
    return "NORMAL";
  }
  return "SIMPLE";
}

function getDifficultyMeta(value: TokenDifficulty): {
  label: string;
  token: number;
  className: string;
} {
  if (value === "EXPERT") {
    return {
      label: "Expert",
      token: 5,
      className: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
    };
  }
  if (value === "ADVANCED") {
    return {
      label: "Advanced",
      token: 4,
      className: "border-purple-200 bg-purple-50 text-purple-700",
    };
  }
  if (value === "HARD" || value === "DIFFICULT") {
    return {
      label: "Hard",
      token: 3,
      className: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }
  if (value === "NORMAL" || value === "MEDIUM") {
    return {
      label: "Normal",
      token: 2,
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }
  return {
    label: "Simple",
    token: 1,
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
}

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
    syncOrderCalendar,
    getCustomerMessagePreview,
    setOrderShipment,
  } = useOrders();
  const params = useParams();
  const orderId = typeof params?.id === "string" ? params.id : "";
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleSlot, setRescheduleSlot] = useState("");
  const [isSyncingCalendar, setIsSyncingCalendar] = useState(false);
  const [isCreatingResi, setIsCreatingResi] = useState(false);
  const [dpPaidDraft, setDpPaidDraft] = useState(0);
  const [finalPaidDraft, setFinalPaidDraft] = useState(0);
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
  const showAutomationSummary = [
    "In Production",
    "Ready",
    "Delivered",
    "Completed",
  ].includes(normalizedOrderStatus);

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
      }),
    [effectiveDate, deliveryMethod, order?.items],
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
    }),
  );
  const isSlotFull = slotUsage >= slotLimitPerHour;

  const totalPrice = order?.totalPrice ?? 0;
  const totalWorkloadTokens = useMemo(() => {
    if (!order) return 0;
    return (order.items ?? []).reduce((sum, item) => {
      const difficulty = resolveItemDifficulty(item);
      const tokenPerUnit = getDifficultyMeta(difficulty).token;
      return sum + tokenPerUnit * Math.max(0, Number(item.quantity) || 0);
    }, 0);
  }, [order]);
  const messagePreview = order ? getCustomerMessagePreview(order.id) : "";
  const calendarSyncStatus = order?.simulations?.calendarEventCreated
    ? "Synced"
    : order?.simulations?.lastAutomationAt
      ? "Failed / Pending"
      : "Not synced yet";

  useEffect(() => {
    if (!order) return;
    setDpPaidDraft(Number(order.dpPaidAmount ?? 0));
    setFinalPaidDraft(Number(order.finalPaidAmount ?? 0));
  }, [order]);

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
            <div class="row"><strong>Total:</strong> ${formatCurrency(order.totalPrice ?? 0)}</div>
            <div class="muted">Generated by Bakery OMS</div>
          </div>
          <script>window.print();window.close();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handlePrintResi = () => {
    if (!order || !order.shipment) return;

    const primaryAddress =
      order.deliveryAddresses?.[0]?.addressLine || order.customerAddress || "-";
    const itemSummary = (order.items ?? [])
      .map((item) => `${item.quantity}x ${item.productName} (${item.size})`)
      .join("<br />");

    const printWindow = window.open("", "_blank", "width=480,height=760");
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Print Resi</title>
          <style>
            @page { size: 100mm 150mm; margin: 0; }
            html, body { width: 100mm; height: 150mm; }
            body { font-family: Arial, sans-serif; margin: 0; padding: 4mm; color: #111827; box-sizing: border-box; }
            .sheet { border: 1px solid #111827; border-radius: 6px; padding: 3.5mm; width: calc(100% - 2px); box-sizing: border-box; }
            .title { font-size: 13px; font-weight: 800; margin-bottom: 6px; letter-spacing: .5px; text-transform: uppercase; }
            .awb { border: 2px dashed #111827; border-radius: 6px; padding: 6px; margin-bottom: 8px; }
            .awb-label { font-size: 9px; color: #4b5563; margin-bottom: 2px; }
            .awb-value { font-size: 17px; font-weight: 800; letter-spacing: .8px; word-break: break-all; line-height: 1.1; }
            .row { font-size: 11px; margin-bottom: 4px; line-height: 1.25; }
            .label { font-weight: 700; }
            .foot { font-size: 9px; color: #6b7280; margin-top: 7px; }
          </style>
        </head>
        <body>
          <div class="sheet">
            <div class="title">RESI PENGIRIMAN</div>
            <div class="awb">
              <div class="awb-label">NO. RESI / AWB</div>
              <div class="awb-value">${order.shipment.trackingNumber || "-"}</div>
            </div>

            <div class="row"><span class="label">Kurir:</span> ${order.shipment.provider} - ${order.shipment.courierServiceName}</div>
            <div class="row"><span class="label">Penerima:</span> ${order.customerName || "-"}</div>
            <div class="row"><span class="label">No. HP:</span> ${order.customerPhone || "-"}</div>
            <div class="row"><span class="label">Alamat:</span><br />${primaryAddress}</div>
            <div class="row"><span class="label">Jadwal:</span> ${order.deliveryDate || "-"} ${order.deliverySlot || ""}</div>
            <div class="row"><span class="label">Isi Paket:</span><br />${itemSummary || "-"}</div>
            ${order.shipment.trackingUrl ? `<div class="row"><span class="label">Tracking URL:</span><br />${order.shipment.trackingUrl}</div>` : ""}

            <div class="foot">Dicetak dari Bakery OMS (tanpa buka dashboard Biteship)</div>
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
      toast.success("Customer message copied");
    } catch {
      toast.error("Failed to copy message");
    }
  };

  const handleCreateResi = async () => {
    if (!order) return;
    if (!order.shippingQuote) {
      toast.error(
        "Quote pengiriman belum dipilih. Cek ongkir dulu di form booking.",
      );
      return;
    }
    if (isBeforeScheduledShippingDate) {
      toast.error(
        "Order Grab/Gojek/Paxel dijadwalkan otomatis. Resi baru bisa dibuat di hari pengiriman.",
      );
      return;
    }

    const primaryAddress =
      order.deliveryAddresses?.[0]?.addressLine || order.customerAddress || "";
    if (!primaryAddress) {
      toast.error("Alamat penerima belum lengkap.");
      return;
    }

    setIsCreatingResi(true);
    try {
      const items = (order.items ?? []).map((item) => ({
        name: `${item.productName} (${item.size})`,
        quantity: Math.max(1, Number(item.quantity) || 1),
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
          selectedQuote: order.shippingQuote,
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
      if (payload.warning) {
        toast.warning(payload.warning);
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Gagal membuat resi.";
      toast.error(message);
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

  const handleManualCalendarSync = async () => {
    if (!order || isSyncingCalendar) return;
    setIsSyncingCalendar(true);
    try {
      await syncOrderCalendar(order.id);
    } finally {
      setIsSyncingCalendar(false);
    }
  };

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

  return (
    <div className="space-y-6 pb-10">
      <GradientPageHeader
        title="Order Detail"
        description="Review the booking, update the status, and keep production on track."
        icon={FileText}
      />

      {showAutomationSummary && (
        <div className="space-y-2 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-700">
          <p>
            Ringkasan order aktif. Booking code:{" "}
            {order.resi || order.bookingCode}
          </p>
          <p className="text-xs font-medium text-indigo-600">
            {order.simulations?.productionWhatsappSent
              ? "WA Produksi sent"
              : "WA Produksi pending"}{" "}
            |{" "}
            {order.simulations?.calendarEventCreated
              ? "Calendar created"
              : "Calendar pending"}{" "}
            |{" "}
            {order.simulations?.googleSheetsSynced
              ? "Google Sheets synced"
              : "Google Sheets pending"}
          </p>
          {order.simulations?.lastAutomationMessage && (
            <p className="text-xs font-medium text-indigo-600">
              Last automation: {order.simulations.lastAutomationMessage}
            </p>
          )}
        </div>
      )}

      <OrderStepper status={normalizedOrderStatus} />

      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <div className="space-y-6">
          <Card className="rounded-xl shadow-sm">
            <CardHeader className="p-6 pb-2">
              <CardTitle>Customer Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-6 pb-6 pt-0 text-sm text-gray-700">
              <p>
                <span className="font-semibold">Name:</span>{" "}
                {order.customerName}
              </p>
              <p>
                <span className="font-semibold">Phone:</span>{" "}
                {order.customerPhone ?? "-"}
              </p>
              <p>
                <span className="font-semibold">Address:</span>{" "}
                {order.customerAddress ?? "-"}
              </p>
              <p>
                <span className="font-semibold">Tracking:</span>{" "}
                {order.shipment?.trackingNumber ?? "-"}
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-2 h-8 gap-1 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                onClick={handlePrintLabel}
              >
                <Printer size={14} />
                Print Label
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-xl shadow-sm">
            <CardHeader className="p-6 pb-2">
              <CardTitle>Courier & Resi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-6 pb-6 pt-0 text-sm text-gray-700">
              {order.shippingQuote ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <p className="font-semibold">
                    {order.shippingQuote.provider} -{" "}
                    {order.shippingQuote.courierServiceName}
                  </p>
                  <p className="text-xs text-gray-600">
                    Ongkir {formatCurrency(order.shippingQuote.price)} | ETA{" "}
                    {order.shippingQuote.eta} | Jarak{" "}
                    {order.shippingQuote.distanceKm} km
                  </p>
                </div>
              ) : (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Belum ada quote kurir. Lengkapi alamat + item di form booking
                  agar ongkir live otomatis muncul.
                </p>
              )}

              {order.shipment && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                  <p>
                    Resi aktif:{" "}
                    <span className="font-semibold">
                      {order.shipment.trackingNumber}
                    </span>
                  </p>
                  {order.shipment.externalOrderId && (
                    <p>
                      Biteship Order ID:{" "}
                      <span className="font-semibold">
                        {order.shipment.externalOrderId}
                      </span>
                    </p>
                  )}
                  {order.shipment.trackingUrl && (
                    <p>
                      Tracking URL:{" "}
                      <a
                        href={order.shipment.trackingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        {order.shipment.trackingUrl}
                      </a>
                    </p>
                  )}
                  <div className="mt-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 gap-1 border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100"
                      onClick={handlePrintResi}
                    >
                      <Printer size={14} />
                      Print Resi
                    </Button>
                  </div>
                </div>
              )}

              {!order.shipment && (
                <div className="space-y-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                    disabled={
                      !order.shippingQuote ||
                      isCreatingResi ||
                      isBeforeScheduledShippingDate
                    }
                    onClick={handleCreateResi}
                  >
                    {isCreatingResi ? "Membuat Resi..." : "Generate Resi"}
                  </Button>
                  {isBeforeScheduledShippingDate && (
                    <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-700">
                      Order ini akan otomatis dibuatkan resi di hari pengiriman
                      (jam 00.00 WIB ke atas).
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-xl shadow-sm">
            <CardHeader className="p-6 pb-2">
              <CardTitle>Order Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-6 pb-6 pt-0 text-sm text-gray-700">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <p className="font-semibold">Items:</p>
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                    Total workload {totalWorkloadTokens} token
                  </span>
                </div>
                <div className="space-y-2">
                  {(order.items ?? []).map((item) => {
                    const difficulty = resolveItemDifficulty(item);
                    const meta = getDifficultyMeta(difficulty);
                    const quantity = Math.max(0, Number(item.quantity) || 0);
                    const itemTokens = quantity * meta.token;

                    return (
                      <div
                        key={item.id}
                        className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
                      >
                        <p className="font-medium text-gray-800">
                          {item.quantity}x {item.productName} ({item.category} /{" "}
                          {item.subcategory} / {item.size})
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${meta.className}`}
                          >
                            {meta.label} ({meta.token} token/unit)
                          </span>
                          <span className="text-[11px] font-medium text-gray-500">
                            Item workload: {itemTokens} token
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <p>
                <span className="font-semibold">Delivery Date:</span>{" "}
                {order.deliveryDate}
              </p>
              <p>
                <span className="font-semibold">Delivery Slot:</span>{" "}
                {order.deliverySlot}
              </p>
              <p>
                <span className="font-semibold">Add-ons:</span>{" "}
                {order.addOns ?? "-"}
              </p>
              <p>
                <span className="font-semibold">Notes:</span>{" "}
                {order.notes ?? "-"}
              </p>
              <div>
                <p className="mb-1 font-semibold">Delivery Addresses:</p>
                <div className="space-y-1">
                  {(order.deliveryAddresses ?? []).map((address) => (
                    <p key={address.id}>
                      {address.label} - {address.area}: {address.addressLine}
                    </p>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {order.whatsAppParsedData && (
            <Card className="rounded-xl shadow-sm">
              <CardHeader className="p-6 pb-2">
                <CardTitle>
                  Parsed WhatsApp Data (
                  {WHATSAPP_ORDER_LABELS[order.whatsAppParsedData.orderType]}
                  {Array.isArray(order.whatsAppParsedData.detectedItems) &&
                  order.whatsAppParsedData.detectedItems.length > 1
                    ? ` • ${order.whatsAppParsedData.detectedItems.length} item`
                    : ""}
                  )
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 px-6 pb-6 pt-0 text-sm text-gray-700">
                <div className="grid gap-2 sm:grid-cols-2">
                  {getDisplayFields(order.whatsAppParsedData).map(
                    (field, index) => (
                      <div
                        key={`${field.label}-${index}`}
                        className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          {field.label}
                        </p>
                        <p className="text-sm text-gray-800">{field.value}</p>
                      </div>
                    ),
                  )}
                </div>
                {order.whatsAppParsedData.missingFields.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    Field yang belum lengkap:{" "}
                    {order.whatsAppParsedData.missingFields.join(", ")}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {(order.automationLogs?.length ?? 0) > 0 && (
            <Card className="rounded-xl shadow-sm">
              <CardHeader className="p-6 pb-2">
                <CardTitle>Automation Logs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 px-6 pb-6 pt-0 text-sm text-gray-700">
                {(order.automationLogs ?? [])
                  .slice()
                  .reverse()
                  .slice(0, 5)
                  .map((log) => (
                    <div
                      key={log.id}
                      className={`rounded-lg border px-3 py-2 ${
                        log.success
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                      }`}
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-wide">
                        {log.eventType} -{" "}
                        {new Date(log.timestamp).toLocaleString("id-ID")}
                      </p>
                      <p className="text-xs">{log.summary}</p>
                    </div>
                  ))}
              </CardContent>
            </Card>
          )}

          <Card id="edit-delivery" className="rounded-xl shadow-sm">
            <CardHeader className="p-6 pb-2">
              <CardTitle>Reschedule Delivery</CardTitle>
            </CardHeader>
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
            </CardContent>
          </Card>

          <Card className="rounded-xl shadow-sm">
            <CardHeader className="p-6 pb-2">
              <CardTitle>Customer Message Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-6 pb-6 pt-0 text-sm text-gray-700">
              <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 whitespace-pre-wrap">
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
        </div>

        <div className="space-y-6">
          <PriceSummaryCard
            basePrice={order.basePrice ?? 0}
            addOnTotal={order.addOnTotal ?? 0}
            deliveryFee={order.deliveryFee ?? 0}
            manualAdjustment={order.manualAdjustment ?? 0}
            totalPrice={totalPrice}
          />
          <Card className="rounded-xl shadow-sm">
            <CardHeader className="p-6 pb-2">
              <CardTitle>Status</CardTitle>
            </CardHeader>
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
              <Select
                value={normalizedOrderStatus}
                onChange={(event) =>
                  updateOrderStatus(
                    order.id,
                    event.target.value as
                      | "In Production"
                      | "Ready"
                      | "Completed"
                      | "Delivered"
                      | "Cancelled",
                  )
                }
              >
                {BOOKING_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>DP ({BAKERY_DOWN_PAYMENT_PERCENT}%)</span>
                <span className="font-semibold text-gray-900">
                  Rp{" "}
                  {Number(calculateDownPayment(totalPrice)).toLocaleString(
                    "id-ID",
                  )}
                </span>
              </div>
              <div className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  DP Paid (Actual)
                </span>
                <Input
                  type="number"
                  min={0}
                  step={1000}
                  value={dpPaidDraft}
                  onChange={(event) =>
                    setDpPaidDraft(Number(event.target.value || 0))
                  }
                />
              </div>
              <div className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Final Paid (Actual)
                </span>
                <Input
                  type="number"
                  min={0}
                  step={1000}
                  value={finalPaidDraft}
                  onChange={(event) =>
                    setFinalPaidDraft(Number(event.target.value || 0))
                  }
                />
              </div>
              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>Total Paid</span>
                <span className="font-semibold text-gray-900">
                  Rp{" "}
                  {Number(order.totalPaidAmount ?? 0).toLocaleString("id-ID")}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>Remaining</span>
                <span className="font-semibold text-gray-900">
                  Rp{" "}
                  {Number(order.remainingBalance ?? 0).toLocaleString("id-ID")}
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                onClick={handleRecordPayment}
                disabled={paymentSaveSyncState === "saving"}
              >
                {paymentSaveSyncState === "saving"
                  ? "Menyimpan..."
                  : "Save Payment Verification"}
              </Button>
              {paymentSaveSyncState !== "idle" ? (
                <p
                  className={`text-xs font-medium ${
                    paymentSaveSyncState === "saved"
                      ? "text-emerald-700"
                      : paymentSaveSyncState === "failed"
                        ? "text-rose-700"
                        : "text-indigo-700"
                  }`}
                >
                  {paymentSaveSyncMessage}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="rounded-xl shadow-sm">
            <CardHeader className="p-6 pb-2">
              <CardTitle>Google Calendar Sync</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-6 pb-6 pt-0 text-sm">
              <div className="flex items-center justify-between text-gray-600">
                <span>Status</span>
                <span
                  className={`font-semibold ${
                    calendarSyncStatus === "Synced"
                      ? "text-emerald-700"
                      : calendarSyncStatus === "Failed / Pending"
                        ? "text-amber-700"
                        : "text-gray-500"
                  }`}
                >
                  {calendarSyncStatus}
                </span>
              </div>

              <div className="flex items-center justify-between text-gray-600">
                <span>Event ID</span>
                <span className="max-w-48 truncate font-medium text-gray-900">
                  {order.simulations?.calendarEventId || "-"}
                </span>
              </div>

              <div className="flex items-center justify-between text-gray-600">
                <span>Last Automation</span>
                <span className="font-medium text-gray-900">
                  {order.simulations?.lastAutomationAt
                    ? new Date(
                        order.simulations.lastAutomationAt,
                      ).toLocaleString("id-ID")
                    : "-"}
                </span>
              </div>

              {order.simulations?.calendarEventLink ? (
                <div className="flex flex-wrap gap-2">
                  <a
                    href={order.simulations.calendarEventLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center justify-center rounded-xl border border-indigo-200 px-3 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50"
                  >
                    Open Calendar Event
                  </a>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                    onClick={handleManualCalendarSync}
                    disabled={isSyncingCalendar}
                  >
                    {isSyncingCalendar ? "Syncing..." : "Re-sync Calendar"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                    Event link belum tersedia. Pastikan env Google Calendar
                    sudah lengkap dan order sudah menjalankan automation.
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                    onClick={handleManualCalendarSync}
                    disabled={isSyncingCalendar}
                  >
                    {isSyncingCalendar ? "Syncing..." : "Re-sync Calendar"}
                  </Button>
                </div>
              )}

              {order.simulations?.lastAutomationMessage ? (
                <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  {order.simulations.lastAutomationMessage}
                </p>
              ) : null}

              <p className="text-xs text-gray-500">
                Sinkronisasi kalender otomatis berjalan saat booking dibuat,
                di-approve, dan saat reschedule.
              </p>
            </CardContent>
          </Card>

          <OrderTimeline
            status={order.orderStatus}
            deliveryDate={order.deliveryDate}
            history={order.statusHistory}
          />
        </div>
      </div>
    </div>
  );
}
