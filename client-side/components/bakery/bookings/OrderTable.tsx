"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { formatCurrency } from "@/components/orders/formatters";
import StatusBadge from "@/components/bakery/shared/StatusBadge";
import PaymentBadge from "@/components/bakery/shared/PaymentBadge";
import OrderHighlightBadge from "@/components/bakery/bookings/OrderHighlightBadge";
import SkeletonBlock from "@/components/bakery/shared/SkeletonBlock";
import { BakeryOrder, useOrders } from "@/components/bakery/store";
import { MessageCircle, Pencil } from "lucide-react";

interface OrderTableProps {
  orders: BakeryOrder[];
}

type Highlight = {
  label: string;
  tone: "warning" | "danger" | "info";
};

export default function OrderTable({ orders }: OrderTableProps) {
  const { updateOrderStatus, updatePaymentStatus } = useOrders();
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
        if (order.deliveryDate < today && !["Delivered", "Completed", "Cancelled"].includes(order.orderStatus)) {
          return [order.id, { label: "Late Order", tone: "danger" }];
        }
        if (order.deliveryDate === tomorrow) {
          return [order.id, { label: "Delivery Tomorrow", tone: "warning" }];
        }
        if (order.orderStatus === "Inquiry") {
          return [order.id, { label: "New Order", tone: "info" }];
        }
        return [order.id, { label: "", tone: "info" }];
      })
    );
  }, [orders]);

  const buildWhatsappLink = (phone: string | undefined, orderId: string) => {
    const sanitized = (phone ?? "").replace(/\D/g, "");
    if (!sanitized) return null;
    return `https://wa.me/${sanitized}?text=${encodeURIComponent(`Hello, regarding order ${orderId}`)}`;
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
                  <td key={`skeleton-cell-${rowIndex}-${cellIndex}`} className="px-4 py-4">
                    <SkeletonBlock className="h-4 w-full" />
                  </td>
                ))}
              </tr>
            ))
          ) : orders.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">
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
              const messageLink = buildWhatsappLink(order.customerPhone, order.id);
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
                <td className="px-4 py-3">{order.customerName || "Walk-in Customer"}</td>
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
                  {order.items?.length
                    ? order.items.map((item) => `${item.quantity}x ${item.productName}`).join(", ")
                    : order.product || "Custom Cake"}
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
                        updatePaymentStatus(order.id, event.target.value as "Pending" | "DP Paid" | "Paid")
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
                            | "Cancelled"
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
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 border-indigo-200 text-indigo-700 hover:bg-indigo-50 focus-visible:ring-indigo-400"
                    >
                      <Pencil size={14} />
                      Edit
                    </Button>
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
