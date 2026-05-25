"use client";

import { useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircle, Pencil, Trash2, Loader2 } from "lucide-react";
import { useRole } from "@/context/RoleContext";

import OrderHighlightBadge from "@/components/bakery/bookings/OrderHighlightBadge";
import { type BakeryOrder, useOrders } from "@/components/bakery/store";
import { BOOKING_STATUS_OPTIONS } from "@/lib/bookings/order-status";
import { normalizeOrderStatus } from "@/lib/bookings/order-status";
import { getOrderItemsSummary } from "@/lib/bookings/order-display";
import {
  isGrabOrGojekOrder,
  resolveShippingProvider,
} from "@/lib/bookings/shipping-schedule";
import { useBakerySettings } from "@/hooks/useBakerySettings";
import {
  getProductionStageLabels,
  normalizeProductionStageKey,
  PRODUCTION_STAGE_ORDER,
  resolvePrimaryProductionCategory,
  resolveProductionStageTemplatesForCategory,
} from "@/lib/bookings/production-stages";

interface OrderTableProps {
  orders: BakeryOrder[];
  onOrderDeleted?: () => void | Promise<void>;
  onOrderStatusUpdated?: () => void | Promise<void>;
}

type Highlight = {
  label: string;
  tone: "warning" | "danger" | "info";
};

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function formatDeliveryDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function formatDeliverySlot(value?: string): string {
  if (!value) return "";
  return value.replace(":", ".");
}

function buildWhatsappPhone(rawValue?: string): string | null {
  const rawDigits = (rawValue || "").replace(/\D/g, "");
  if (!rawDigits) return null;

  const normalized = rawDigits.startsWith("62")
    ? rawDigits
    : rawDigits.startsWith("0")
      ? `62${rawDigits.slice(1)}`
      : rawDigits.startsWith("8")
        ? `62${rawDigits}`
        : rawDigits;

  return normalized.length >= 10 ? normalized : null;
}

function inferDifficultyLabel(order: BakeryOrder): string | null {
  const raw =
    order.items?.find((item) => item.tokenDifficulty)?.tokenDifficulty || null;
  if (!raw) return null;

  const normalized = raw.toUpperCase();
  if (normalized === "DIFFICULT") return "Hard";
  if (normalized === "NORMAL" || normalized === "MEDIUM") return "Normal";
  return normalized.charAt(0) + normalized.slice(1).toLowerCase();
}

function buildFulfillmentLabel(order: BakeryOrder): string {
  const provider = resolveShippingProvider(order);
  const slot = formatDeliverySlot(order.deliverySlot);

  if (provider === "GOJEK") {
    return slot ? `Gojek - ${slot}` : "Gojek";
  }
  if (provider === "GRAB") {
    return slot ? `Grab - ${slot}` : "Grab";
  }
  if (provider === "PAXEL") {
    return slot ? `Paxel - ${slot}` : "Paxel";
  }
  return slot ? `Pickup - ${slot}` : "Pickup";
}

function statusPillClass(status: string): string {
  const normalized = normalizeOrderStatus(status);

  if (normalized === "In Production") {
    return "bg-[#fbf0d8] text-[#9a6b10]";
  }
  if (normalized === "Ready" || normalized === "Delivery" || normalized === "Delivered") {
    return "bg-[#e0f0e8] text-[#2a5c3f]";
  }
  if (normalized === "Completed") {
    return "bg-[var(--crumbella-accent-soft)] text-[var(--crumbella-primary)]";
  }
  if (normalized === "Cancelled") {
    return "bg-[#fdeaea] text-[#a83030]";
  }

  return "bg-[var(--crumbella-surface)] text-[var(--crumbella-muted)]";
}

function stagePillClass(isAssigned: boolean): string {
  return isAssigned
    ? "border-[#b9e0c5] bg-[#ecfaf1] text-[#2a5c3f]"
    : "border-[#eadfd3] bg-[#fbf5ef] text-[#8a6e5c]";
}

function DeleteConfirmModal({
  order,
  onClose,
  onDeleted,
}: {
  order: BakeryOrder;
  onClose: () => void;
  onDeleted: () => void | Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const { deleteOrder } = useOrders();

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteOrder(order.id);
      await onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus order");
      setDeleting(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      style={{ zIndex: 200 }}
      onMouseDown={(event) =>
        event.target === overlayRef.current ? onClose() : undefined
      }
    >
      <div className="w-full overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-sm sm:rounded-3xl">
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-gray-200" />
        </div>
        <div className="space-y-4 px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
              <Trash2 size={18} />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-800">
                Hapus Booking?
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Order dari <span className="font-semibold text-slate-700">{order.customerName || "Customer"}</span> akan dihapus permanen.
              </p>
            </div>
          </div>

          {error ? (
            <div className="rounded-xl bg-red-50 p-3 text-xs text-red-600">
              {error}
            </div>
          ) : null}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
            >
              Batal
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Trash2 size={16} />
              )}
              Hapus
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function OrderTable({
  orders,
  onOrderDeleted,
  onOrderStatusUpdated,
}: OrderTableProps) {
  const { settings } = useBakerySettings();
  const { getCustomerMessagePreview, updateOrderStatus, updatePaymentStatus } =
    useOrders();
  const { isOwner } = useRole();
  const router = useRouter();
  const [deleteModal, setDeleteModal] = useState<BakeryOrder | null>(null);
  const [pendingStatusOrderId, setPendingStatusOrderId] = useState<
    string | null
  >(null);
  const [pendingPaymentOrderId, setPendingPaymentOrderId] = useState<
    string | null
  >(null);

  const highlightMap = useMemo<Map<string, Highlight>>(() => {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrow = tomorrowDate.toISOString().slice(0, 10);

    return new Map<string, Highlight>(
      orders.map((order) => {
        const normalizedStatus = normalizeOrderStatus(order.orderStatus);
        if (order.deliveryDate < today && !["Delivery", "Delivered", "Completed", "Cancelled"].includes(normalizedStatus)) {
          return [order.id, { label: "Terlambat", tone: "danger" }];
        }
        if (order.deliveryDate === tomorrow) {
          return [order.id, { label: "Besok", tone: "warning" }];
        }
        return [order.id, { label: "", tone: "info" }];
      }),
    );
  }, [orders]);

  if (orders.length === 0) {
    return (
      <div className="rounded-[24px] border border-dashed border-[var(--crumbella-border)] bg-[var(--crumbella-accent-soft)]/35 px-4 py-7 text-center">
        <p className="text-sm text-[var(--crumbella-muted)]">Belum ada order.</p>
        <Link
          href="/bakery/bookings/new"
          className="mt-3 inline-flex h-9 items-center justify-center rounded-xl bg-[var(--crumbella-accent)] px-4 text-xs font-semibold text-white"
        >
          Buat Booking
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {orders.map((order) => {
        const messagePhone = buildWhatsappPhone(order.customerPhone);
        const message = getCustomerMessagePreview(order.id);
        const messageLink = messagePhone ? `https://wa.me/${messagePhone}?text=${encodeURIComponent(message)}` : null;
        const highlight = highlightMap.get(order.id);
        const productSummary = compactText(
          getOrderItemsSummary(order.items, order.product || "Custom Cake"),
        );
        const normalizedStatus = normalizeOrderStatus(order.orderStatus);
        const difficultyLabel = inferDifficultyLabel(order);
        const stageLabels = getProductionStageLabels(
          resolveProductionStageTemplatesForCategory({
            category: resolvePrimaryProductionCategory(order.items ?? []),
            profiles: settings?.productionStageProfiles,
          }),
        );
        const isUpdatingStatus = pendingStatusOrderId === order.id;
        const isUpdatingPayment = pendingPaymentOrderId === order.id;
        const stageEntries =
          order.productionStages && order.productionStages.length > 0
            ? order.productionStages
            : PRODUCTION_STAGE_ORDER.map((stage) => ({
                stage,
                staffId: null,
                tokenAmount: 0,
              }));

        return (
          <div
            key={order.id}
            role="button"
            tabIndex={0}
            onClick={() => router.push(`/bakery/bookings/${order.id}`)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                router.push(`/bakery/bookings/${order.id}`);
              }
            }}
            className="cursor-pointer rounded-[24px] border border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] shadow-[0_14px_26px_-24px_rgba(30,18,10,0.62)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_34px_-24px_rgba(30,18,10,0.74)] focus:outline-none focus:ring-2 focus:ring-[var(--crumbella-focus)]"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--crumbella-border)] px-4 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-[1.05rem] font-bold leading-none text-[var(--foreground)]">
                    {order.customerName || "Walk-in Customer"}
                  </p>
                  {order.paymentStatus !== "Paid" ? (
                    <span className="inline-flex rounded-full bg-[#fbf0d8] px-2 py-0.5 text-[10px] font-semibold text-[#9a6b10]">
                      DP
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-[10px] text-[var(--crumbella-muted)]">
                  {order.bookingCode || order.resi || `Draft-${order.id}`}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="text-[10px] text-[var(--crumbella-muted)]">Delivery</p>
                <p className="text-[13px] font-semibold leading-tight text-[var(--foreground)]">
                  {formatDeliveryDate(order.deliveryDate)}
                </p>
                {highlight?.label ? (
                  <div className="mt-1 flex justify-end">
                    <OrderHighlightBadge label={highlight.label} tone={highlight.tone} />
                  </div>
                ) : (
                  <div className="mt-1 flex justify-end">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusPillClass(normalizedStatus)}`}>
                      {normalizedStatus}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1 px-4 py-3">
              <p className="text-[1rem] font-medium leading-snug text-[var(--foreground)]">
                {productSummary}
              </p>
              <p className="text-[11px] text-[var(--crumbella-muted)]">
                {buildFulfillmentLabel(order)}
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-[var(--crumbella-border)] px-4 py-3">
              <div className="flex flex-wrap gap-2">
                {stageEntries.map((stage) => {
                  const stageKey = normalizeProductionStageKey(stage.stage);
                  const stageLabel =
                    stageKey
                      ? stageLabels[stageKey]
                      : String(stage.stage || "");
                  const isAssigned = Boolean(stage.staffId);

                  return (
                    <span
                      key={`${order.id}-${stageKey}`}
                      className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${stagePillClass(isAssigned)}`}
                    >
                      {stageLabel}
                    </span>
                  );
                })}
              </div>

              {difficultyLabel ? (
                <span className="inline-flex rounded-full bg-[#fff1e3] px-2 py-0.5 text-[10px] font-semibold text-[var(--crumbella-primary)]">
                  {difficultyLabel}
                </span>
              ) : isGrabOrGojekOrder(order) ? (
                <span className="inline-flex rounded-full bg-[#fff1e3] px-2 py-0.5 text-[10px] font-semibold text-[var(--crumbella-primary)]">
                  Express
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--crumbella-border)] px-4 py-3">
              <label
                className="flex items-center gap-2"
                onClick={(event) => event.stopPropagation()}
              >
                <span className="text-[10px] font-semibold text-[var(--crumbella-muted)]">
                  Bayar
                </span>
                <select
                  value={order.paymentStatus}
                  disabled={isUpdatingPayment}
                  onChange={async (event) => {
                    event.stopPropagation();
                    const nextStatus = event.target.value as
                      | "Pending"
                      | "DP Paid"
                      | "Paid";
                    if (nextStatus === order.paymentStatus) return;
                    setPendingPaymentOrderId(order.id);
                    try {
                      updatePaymentStatus(order.id, nextStatus);
                    } finally {
                      setPendingPaymentOrderId(null);
                    }
                  }}
                  className="h-8 rounded-xl border border-[var(--crumbella-border)] bg-white px-2 text-[11px] font-semibold text-[var(--foreground)]"
                >
                  <option value="Pending">Pending</option>
                  <option value="DP Paid">DP</option>
                  <option value="Paid">Lunas</option>
                </select>
              </label>
              <label
                className="flex items-center gap-2"
                onClick={(event) => event.stopPropagation()}
              >
                <span className="text-[10px] font-semibold text-[var(--crumbella-muted)]">
                  Produksi
                </span>
                <select
                  value={normalizedStatus}
                  disabled={isUpdatingStatus}
                  onChange={async (event) => {
                    event.stopPropagation();
                    const nextStatus = event.target.value as
                      | "In Production"
                      | "Ready"
                      | "Delivery"
                      | "Completed"
                      | "Cancelled";
                    if (nextStatus === normalizedStatus) return;
                    setPendingStatusOrderId(order.id);
                    try {
                      await updateOrderStatus(order.id, nextStatus);
                      await onOrderStatusUpdated?.();
                    } catch {
                      // Toast sudah ditangani store; hindari unhandled rejection di UI tabel.
                    } finally {
                      setPendingStatusOrderId(null);
                    }
                  }}
                  className="h-8 rounded-xl border border-[var(--crumbella-border)] bg-white px-2 text-[11px] font-semibold text-[var(--foreground)]"
                >
                  {BOOKING_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <Link
                href={`/bakery/bookings/${order.id}`}
                onClick={(event) => event.stopPropagation()}
                className="inline-flex h-8 items-center justify-center rounded-xl border border-[var(--crumbella-border)] px-3 text-[11px] font-semibold text-[var(--foreground)]"
              >
                Detail
              </Link>
              <Link
                href={`/bakery/bookings/${order.id}/edit`}
                onClick={(event) => event.stopPropagation()}
                className="inline-flex h-8 items-center justify-center gap-1 rounded-xl border border-[var(--crumbella-border)] px-3 text-[11px] font-semibold text-[var(--foreground)]"
              >
                <Pencil size={13} />
                Edit
              </Link>
              {isOwner && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setDeleteModal(order);
                  }}
                  className="inline-flex h-8 items-center justify-center gap-1 rounded-xl border border-[var(--crumbella-border)] px-3 text-[11px] font-semibold text-[#a83030] hover:bg-red-50"
                >
                  <Trash2 size={13} />
                  Hapus
                </button>
              )}
              <a
                href={messageLink ?? "#"}
                target={messageLink ? "_blank" : undefined}
                rel={messageLink ? "noopener noreferrer" : undefined}
                aria-disabled={!messageLink}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!messageLink) event.preventDefault();
                }}
                className={`inline-flex h-8 items-center justify-center gap-1 rounded-xl px-3 text-[11px] font-semibold ${
                  messageLink
                    ? "border border-[var(--crumbella-border)] text-[var(--crumbella-primary)]"
                    : "pointer-events-none border border-[var(--crumbella-border)] text-[var(--crumbella-muted)]/50"
                }`}
              >
                <MessageCircle size={13} />
                WA
              </a>
            </div>
          </div>
        );
      })}

      {deleteModal && (
        <DeleteConfirmModal
          order={deleteModal}
          onClose={() => setDeleteModal(null)}
          onDeleted={async () => {
            setDeleteModal(null);
            await onOrderDeleted?.();
          }}
        />
      )}
    </div>
  );
}
