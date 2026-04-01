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
import { MessageCircle, Pencil } from "lucide-react";

interface OrderTableProps {
  orders: BakeryOrder[];
}

type Highlight = {
  label: string;
  tone: "warning" | "danger" | "info";
};

type TokenDifficulty = "SIMPLE" | "MEDIUM" | "DIFFICULT";

function resolveItemDifficulty(
  item: BakeryOrder["items"][number],
): TokenDifficulty {
  if (item.tokenDifficulty) return item.tokenDifficulty;
  if (item.category === "Cake" || item.category === "Cookies Tower") {
    return "DIFFICULT";
  }
  if (item.category === "Buket" || item.category === "Cupcakes") {
    return "MEDIUM";
  }
  return "SIMPLE";
}

function getDifficultyMeta(value: TokenDifficulty): {
  label: string;
  token: number;
  className: string;
} {
  if (value === "DIFFICULT") {
    return {
      label: "Difficult",
      token: 3,
      className: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }
  if (value === "MEDIUM") {
    return {
      label: "Medium",
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
        if (
          order.deliveryDate < today &&
          !["Delivered", "Completed", "Cancelled"].includes(order.orderStatus)
        ) {
          return [order.id, { label: "Late Order", tone: "danger" }];
        }
        if (order.deliveryDate === tomorrow) {
          return [order.id, { label: "Delivery Tomorrow", tone: "warning" }];
        }
        if (order.orderStatus === "Inquiry") {
          return [order.id, { label: "New Order", tone: "info" }];
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
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50 text-xs uppercase text-gray-500">
          <tr>
            <th className="px-4 py-3 font-semibold">Resi</th>
            <th className="px-4 py-3 font-semibold">Customer Name</th>
            <th className="px-4 py-3 font-semibold">Delivery Date</th>
            <th className="px-4 py-3 font-semibold">Product</th>
            <th className="px-4 py-3 font-semibold">Total Price</th>
            <th className="px-4 py-3 font-semibold">Payment Status</th>
            <th className="px-4 py-3 font-semibold">Order Status</th>
            <th className="px-4 py-3 font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {isLoading ? (
            [...Array(4)].map((_, rowIndex) => (
              <tr key={`skeleton-${rowIndex}`} className="bg-white">
                {Array.from({ length: 8 }).map((__, cellIndex) => (
                  <td
                    key={`skeleton-cell-${rowIndex}-${cellIndex}`}
                    className="px-4 py-4"
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
              const orderTokenTotal = summarizeProductionTokensByItems(
                order.items ?? [],
              );
              return (
                <tr
                  key={order.id}
                  className={`group text-gray-700 transition hover:bg-indigo-50/50 ${
                    index % 2 === 0 ? "bg-white" : "bg-gray-50/60"
                  }`}
                >
                  <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">
                    {order.resi || order.bookingCode || `Draft-${order.id}`}
                  </td>
                  <td className="px-4 py-3">
                    {order.customerName || "Walk-in Customer"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{order.deliveryDate}</span>
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
                  <td className="px-4 py-3">
                    {order.items?.length ? (
                      <div className="space-y-1">
                        <p>
                          {order.items
                            .map(
                              (item) => `${item.quantity}x ${item.productName}`,
                            )
                            .join(", ")}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                            Workload {orderTokenTotal} token
                          </span>
                          {order.items.slice(0, 2).map((item) => {
                            if (Number(item.customTokenPerUnit) > 0) {
                              return (
                                <span
                                  key={`${order.id}-${item.id}`}
                                  className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700"
                                >
                                  Custom
                                </span>
                              );
                            }
                            const difficulty = resolveItemDifficulty(item);
                            const meta = getDifficultyMeta(difficulty);
                            return (
                              <span
                                key={`${order.id}-${item.id}`}
                                className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${meta.className}`}
                              >
                                {meta.label}
                              </span>
                            );
                          })}
                          {order.items.length > 2 && (
                            <span className="text-[11px] font-medium text-gray-500">
                              +{order.items.length - 2} item
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      order.product || "Custom Cake"
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatCurrency(order.totalPrice ?? 0)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-2">
                      <PaymentBadge status={order.paymentStatus} />
                      <Select
                        value={order.paymentStatus}
                        onChange={(event) =>
                          updatePaymentStatus(
                            order.id,
                            event.target.value as
                              | "Pending"
                              | "DP Paid"
                              | "Paid",
                          )
                        }
                        className="h-8 text-xs"
                      >
                        <option value="Pending">Pending</option>
                        <option value="DP Paid">DP Paid</option>
                        <option value="Paid">Paid</option>
                      </Select>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-2">
                      <StatusBadge status={order.orderStatus} />
                      <Select
                        value={order.orderStatus}
                        onChange={(event) =>
                          updateOrderStatus(
                            order.id,
                            event.target.value as
                              | "Inquiry"
                              | "Quoted"
                              | "DP Paid"
                              | "Confirmed"
                              | "In Production"
                              | "Ready"
                              | "Completed"
                              | "Delivered"
                              | "Cancelled",
                          )
                        }
                        className="h-8 text-xs"
                      >
                        <option value="Inquiry">Inquiry</option>
                        <option value="Quoted">Quoted</option>
                        <option value="DP Paid">DP Paid</option>
                        <option value="Confirmed">Confirmed</option>
                        <option value="In Production">In Production</option>
                        <option value="Ready">Ready</option>
                        <option value="Completed">Completed</option>
                        <option value="Delivered">Delivered</option>
                        <option value="Cancelled">Cancelled</option>
                      </Select>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <Link
                        href={`/bakery/bookings/${order.id}`}
                        className="inline-flex h-8 items-center justify-center rounded-xl border border-indigo-200 px-3 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50"
                      >
                        View
                      </Link>
                      <Link
                        href={`/bakery/bookings/${order.id}#edit-delivery`}
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-indigo-200 px-3 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50"
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
                        className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition ${
                          messageLink
                            ? "text-indigo-700 hover:bg-indigo-50"
                            : "pointer-events-none text-gray-400"
                        }`}
                      >
                        <MessageCircle size={14} />
                        Message
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
