"use client";

import { useMemo, useState } from "react";
import StatusDropdown from "@/components/bakery/production/StatusDropdown";
import PriorityBadge from "@/components/bakery/production/PriorityBadge";
import { useOrders } from "@/components/bakery/store";

export default function ProductionTable() {
  const { orders, updateOrderStatus } = useOrders();
  const [activeTab, setActiveTab] = useState<"active" | "ready">("active");

  const today = new Date();
  const todayDate = today.toISOString().slice(0, 10);
  const tomorrowDate = new Date(today.getTime() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const withPriority = (order: typeof orders[number]) => {
    if (order.deliveryDate === todayDate) {
      return { label: "Delivery Today", tone: "danger" as const };
    }
    if (order.deliveryDate === tomorrowDate) {
      return { label: "Delivery Tomorrow", tone: "warning" as const };
    }
    return { label: "Normal", tone: "neutral" as const };
  };

  const activeOrders = useMemo(() => {
    return orders
      .filter((order) =>
        ["Confirmed", "In Production"].includes(order.orderStatus)
      )
      .slice()
      .sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));
  }, [orders]);

  const readyOrders = useMemo(() => {
    return orders
      .filter((order) => ["Ready", "Delivered"].includes(order.orderStatus))
      .slice()
      .sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));
  }, [orders]);

  const updateStatus = (id: string, status: string) => {
    updateOrderStatus(
      id,
      status as "Confirmed" | "In Production" | "Ready" | "Delivered"
    );
  };

  if (activeOrders.length === 0 && readyOrders.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-4 py-6 text-center text-sm text-gray-500">
        No production orders yet.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("active")}
          className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
            activeTab === "active"
              ? "bg-indigo-600 text-white shadow-sm"
              : "border border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          Active ({activeOrders.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("ready")}
          className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
            activeTab === "ready"
              ? "bg-indigo-600 text-white shadow-sm"
              : "border border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          Ready / Delivered ({readyOrders.length})
        </button>
      </div>

      {activeTab === "active" ? (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            In Production
          </p>
          {activeOrders.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-4 py-5 text-center text-sm text-gray-500">
              No active production orders.
            </div>
          ) : (
            activeOrders.map((order) => (
              <div
                key={order.id}
                className="grid gap-4 rounded-xl border border-gray-100 bg-white px-4 py-4 shadow-sm sm:px-5 sm:py-5 lg:grid-cols-[1.2fr,1.2fr,1fr,1.6fr,1fr] lg:items-center"
              >
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Order ID
                  </p>
                  <p className="text-sm font-semibold text-gray-900">{order.id}</p>
                  <p className="text-xs text-gray-500">{order.customerName}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Cake
                  </p>
                  <p className="text-sm text-gray-700">{order.product}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Delivery
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm text-gray-700">{order.deliveryDate}</p>
                    {(() => {
                      const priority = withPriority(order);
                      return <PriorityBadge label={priority.label} tone={priority.tone} />;
                    })()}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Notes
                  </p>
                  <p className="text-sm text-gray-600">{order.notes}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Status
                  </p>
                  <StatusDropdown
                    value={order.orderStatus}
                    onChange={(value) => updateStatus(order.id, value)}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Ready for Delivery
          </p>
          {readyOrders.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-4 py-5 text-center text-sm text-gray-500">
              No ready or delivered orders yet.
            </div>
          ) : (
            readyOrders.map((order) => (
              <div
                key={order.id}
                className="grid gap-4 rounded-xl border border-gray-100 bg-white px-4 py-4 shadow-sm sm:px-5 sm:py-5 lg:grid-cols-[1.2fr,1.2fr,1fr,1.6fr,1fr] lg:items-center"
              >
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Order ID
                  </p>
                  <p className="text-sm font-semibold text-gray-900">{order.id}</p>
                  <p className="text-xs text-gray-500">{order.customerName}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Cake
                  </p>
                  <p className="text-sm text-gray-700">{order.product}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Delivery
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm text-gray-700">{order.deliveryDate}</p>
                    {(() => {
                      const priority = withPriority(order);
                      return <PriorityBadge label={priority.label} tone={priority.tone} />;
                    })()}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Notes
                  </p>
                  <p className="text-sm text-gray-600">{order.notes}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Status
                  </p>
                  <StatusDropdown
                    value={order.orderStatus}
                    onChange={(value) => updateStatus(order.id, value)}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
