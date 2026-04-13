"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Select } from "@/components/ui/select";
import { formatCurrency } from "@/components/orders/formatters";
import StatusBadge from "@/components/bakery/shared/StatusBadge";
import PaymentBadge from "@/components/bakery/shared/PaymentBadge";
import OrderHighlightBadge from "@/components/bakery/bookings/OrderHighlightBadge";
import SkeletonBlock from "@/components/bakery/shared/SkeletonBlock";
import { BakeryOrder, useOrders } from "@/components/bakery/store";
import { summarizeProductionTokensByItems } from "@/lib/bookings/operations";
import {
  BOOKING_STATUS_OPTIONS,
  normalizeOrderStatus,
} from "@/lib/bookings/order-status";
import { MessageCircle, Pencil } from "lucide-react";

interface OrderTableProps {
  orders: BakeryOrder[];
}

type ViewDensity = "compact" | "comfortable";

type Highlight = {
  label: string;
  tone: "warning" | "danger" | "info";
};

type TokenDifficulty =
  | "SIMPLE"
  | "NORMAL"
  | "HARD"
  | "ADVANCED"
  | "EXPERT"
  | "MEDIUM"
  | "DIFFICULT";

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

function resolvePrimaryDifficulty(
  items: BakeryOrder["items"],
): TokenDifficulty | null {
  if (!items.length) return null;

  const rank: Record<TokenDifficulty, number> = {
    SIMPLE: 1,
    NORMAL: 2,
    MEDIUM: 2,
    HARD: 3,
    DIFFICULT: 3,
    ADVANCED: 4,
    EXPERT: 5,
  };

  return items.reduce<TokenDifficulty>((selected, item) => {
    const current = resolveItemDifficulty(item);
    return rank[current] > rank[selected] ? current : selected;
  }, resolveItemDifficulty(items[0]));
}

function resolveItemDifficulty(
  item: BakeryOrder["items"][number],
): TokenDifficulty {
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

export default function OrderTable({ orders }: OrderTableProps) {
  const { updateOrderStatus, updatePaymentStatus, getCustomerMessagePreview } =
    useOrders();
  const [isLoading, setIsLoading] = useState(true);
  const [density, setDensity] = useState<ViewDensity>(() => {
    if (typeof window === "undefined") return "comfortable";
    const saved = window.localStorage.getItem("bookings-orders-density");
    return saved === "compact" || saved === "comfortable"
      ? saved
      : "comfortable";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("bookings-orders-density", density);
  }, [density]);

  const isCompact = density === "compact";
  const tableTextClass = isCompact ? "text-[13px]" : "text-sm";
  const headPaddingClass = isCompact ? "px-3 py-2.5" : "px-4 py-3";
  const cellPaddingClass = isCompact ? "px-3 py-2" : "px-4 py-3";
  const skeletonPaddingClass = isCompact ? "px-3 py-3" : "px-4 py-4";
  const rowTitleClass = isCompact
    ? "text-[13px] leading-4"
    : "text-sm leading-5";
  const chipClass = isCompact
    ? "rounded-full border px-2 py-0.5 text-[10px] font-semibold"
    : "rounded-full border px-2 py-0.5 text-[11px] font-semibold";
  const actionButtonClass = isCompact
    ? "inline-flex h-7 items-center justify-center rounded-lg border border-indigo-200 px-2 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-50"
    : "inline-flex h-8 items-center justify-center rounded-lg border border-indigo-200 px-2.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50";
  const actionGhostClass = isCompact
    ? "inline-flex h-7 items-center justify-center gap-1 rounded-lg px-2 text-[11px] font-semibold transition"
    : "inline-flex h-8 items-center justify-center gap-1 rounded-lg px-2.5 text-xs font-semibold transition";

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 300);
    return () => clearTimeout(timer);
  }, []);

  const highlightMap = useMemo<Map<string, Highlight>>(() => {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrow = tomorrowDate.toISOString().slice(0, 10);

    return new Map<string, Highlight>(
      orders.map((order) => {
        const normalizedStatus = normalizeOrderStatus(order.orderStatus);
        if (
          order.deliveryDate < today &&
          !["Delivery", "Delivered", "Completed", "Cancelled"].includes(
            normalizedStatus,
          )
        ) {
          return [order.id, { label: "Late Order", tone: "danger" }];
        }
        if (order.deliveryDate === tomorrow) {
          return [order.id, { label: "Delivery Tomorrow", tone: "warning" }];
        }
        return [order.id, { label: "", tone: "info" }];
      }),
    );
  }, [orders]);

  const buildWhatsappLink = (order: BakeryOrder) => {
    const rawDigits = (order.customerPhone ?? "").replace(/\D/g, "");
    if (!rawDigits) return null;

    const normalized = rawDigits.startsWith("62")
      ? rawDigits
      : rawDigits.startsWith("0")
        ? `62${rawDigits.slice(1)}`
        : rawDigits.startsWith("8")
          ? `62${rawDigits}`
          : rawDigits;

    if (normalized.length < 10) return null;
    const message = getCustomerMessagePreview(order.id);
    return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
  };

  return (
    <div className="overflow-x-auto">
      <div className="mb-3 flex items-center justify-end gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          View
        </span>
        <button
          type="button"
          onClick={() => setDensity("compact")}
          className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
            isCompact
              ? "bg-indigo-600 text-white"
              : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          Compact
        </button>
        <button
          type="button"
          onClick={() => setDensity("comfortable")}
          className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
            !isCompact
              ? "bg-indigo-600 text-white"
              : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          Comfortable
        </button>
      </div>

      <table className={`w-full text-left ${tableTextClass}`}>
        <thead className="bg-gray-50 text-xs uppercase text-gray-500">
          <tr>
            <th className={`${headPaddingClass} font-semibold`}>Resi</th>
            <th className={`${headPaddingClass} font-semibold`}>Customer Name</th>
            <th className={`${headPaddingClass} font-semibold`}>Delivery Date</th>
            <th className={`${headPaddingClass} font-semibold`}>Product</th>
            <th className={`${headPaddingClass} font-semibold`}>Total Price</th>
            <th className={`${headPaddingClass} font-semibold`}>Payment Status</th>
            <th className={`${headPaddingClass} font-semibold`}>Order Status</th>
            <th className={`${headPaddingClass} font-semibold`}>Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {isLoading ? (
            [...Array(4)].map((_, rowIndex) => (
              <tr key={`skeleton-${rowIndex}`} className="bg-white">
                {Array.from({ length: 8 }).map((__, cellIndex) => (
                  <td
                    key={`skeleton-cell-${rowIndex}-${cellIndex}`}
                    className={skeletonPaddingClass}
                  >
                    <SkeletonBlock className="h-4 w-full" />
                  </td>
                ))}
              </tr>
            ))
          ) : orders.length === 0 ? (
            <tr>
              <td
                colSpan={8}
                className="px-4 py-8 text-center text-sm text-gray-500"
              >
                No orders yet. Create a new booking to get started.
                <div className="mt-3">
                  <Link
                    href="/bakery/bookings/new"
                    className="inline-flex h-9 items-center justify-center rounded-xl bg-indigo-600 px-4 text-xs font-semibold text-white transition hover:bg-indigo-700"
                  >
                    Create Booking
                  </Link>
                </div>
              </td>
            </tr>
          ) : (
            orders.map((order, index) => {
              const messageLink = buildWhatsappLink(order);
              const normalizedPaymentStatus =
                order.paymentStatus === "Pending"
                  ? "DP Paid"
                  : order.paymentStatus;
              const normalizedOrderStatus = normalizeOrderStatus(
                order.orderStatus,
              );
              const orderTokenTotal = summarizeProductionTokensByItems(
                order.items ?? [],
              );
              const productSummary = order.items?.length
                ? order.items
                    .map(
                      (item) =>
                        `${Math.max(1, Number(item.quantity) || 1)}x ${compactText(item.productName || "Produk")}`,
                    )
                    .join(" • ")
                : compactText(order.product || "Custom Cake");
              const primaryDifficulty = resolvePrimaryDifficulty(order.items ?? []);
              const difficultyMeta = primaryDifficulty
                ? getDifficultyMeta(primaryDifficulty)
                : null;
              return (
                <tr
                  key={order.id}
                  className={`group text-gray-700 transition hover:bg-indigo-50/50 ${
                    index % 2 === 0 ? "bg-white" : "bg-gray-50/60"
                  }`}
                >
                  <td
                    className={`${cellPaddingClass} max-w-45 break-all font-semibold text-gray-900`}
                  >
                    {order.resi || order.bookingCode || `Draft-${order.id}`}
                  </td>
                  <td className={cellPaddingClass}>
                    {order.customerName || "Walk-in Customer"}
                  </td>
                  <td className={cellPaddingClass}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{formatDeliveryDate(order.deliveryDate)}</span>
                      {(() => {
                        const highlight = highlightMap.get(order.id);
                        if (!highlight || !highlight.label) return null;
                        return (
                          <OrderHighlightBadge
                            label={highlight.label}
                            tone={highlight.tone}
                          />
                        );
                      })()}
                    </div>
                  </td>
                  <td className={cellPaddingClass}>
                    <div className={`max-w-105 ${isCompact ? "space-y-0.5" : "space-y-1"}`}>
                      <p
                        className={`${rowTitleClass} whitespace-normal wrap-break-word text-gray-700`}
                        title={productSummary}
                      >
                        {productSummary}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`${chipClass} border-sky-200 bg-sky-50 text-sky-700`}>
                          {orderTokenTotal} token
                        </span>
                        {difficultyMeta && (
                          <span
                            className={`${chipClass} ${difficultyMeta.className}`}
                          >
                            {difficultyMeta.label}
                          </span>
                        )}
                        {(order.items?.length ?? 0) > 1 && (
                          <span className={`${chipClass} border-gray-200 bg-white font-medium text-gray-500`}>
                            {order.items.length} items
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className={cellPaddingClass}>
                    {formatCurrency(order.totalPrice ?? 0)}
                  </td>
                  <td className={cellPaddingClass}>
                    <div className="flex flex-col gap-2">
                      <PaymentBadge status={normalizedPaymentStatus} />
                      <Select
                        value={normalizedPaymentStatus}
                        onChange={(event) =>
                          updatePaymentStatus(
                            order.id,
                            event.target.value as "DP Paid" | "Paid",
                          )
                        }
                        className={`${isCompact ? "h-7" : "h-8"} min-w-24 text-xs`}
                      >
                        <option value="DP Paid">DP Paid</option>
                        <option value="Paid">Paid</option>
                      </Select>
                    </div>
                  </td>
                  <td className={cellPaddingClass}>
                    <div className="flex flex-col gap-2">
                      <StatusBadge status={normalizedOrderStatus} />
                      <Select
                        value={normalizedOrderStatus}
                        onChange={(event) =>
                          updateOrderStatus(
                            order.id,
                            event.target.value as
                              | "In Production"
                              | "Ready"
                              | "Delivery"
                              | "Completed"
                              | "Delivered"
                              | "Cancelled",
                          )
                        }
                        className={`${isCompact ? "h-7" : "h-8"} min-w-28 text-xs`}
                      >
                        {BOOKING_STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </td>
                  <td className={cellPaddingClass}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link
                        href={`/bakery/bookings/${order.id}`}
                        className={actionButtonClass}
                      >
                        View
                      </Link>
                      <Link
                        href={`/bakery/bookings/${order.id}#edit-delivery`}
                        className={`${actionButtonClass} gap-1`}
                      >
                        <Pencil size={14} />
                        Edit
                      </Link>
                      <a
                        href={messageLink ?? "#"}
                        target={messageLink ? "_blank" : undefined}
                        rel={messageLink ? "noopener noreferrer" : undefined}
                        aria-disabled={!messageLink}
                        onClick={(event) => {
                          if (!messageLink) event.preventDefault();
                        }}
                        className={`${actionGhostClass} ${
                          messageLink
                            ? "text-indigo-700 hover:bg-indigo-50"
                            : "pointer-events-none text-gray-400"
                        }`}
                      >
                        <MessageCircle size={14} />
                        {isCompact ? "Msg" : "Message"}
                      </a>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
