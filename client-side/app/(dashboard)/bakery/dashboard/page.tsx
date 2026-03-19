"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import GradientPageHeader from "@/components/bakery/shared/GradientPageHeader";
import OrdersStats from "@/components/bakery/dashboard/OrdersStats";
import OrdersChart from "@/components/bakery/dashboard/OrdersChart";
import { useOrders } from "@/components/bakery/store";
import { BarChart3 } from "lucide-react";

export default function BakeryDashboardPage() {
  const { orders } = useOrders();

  const upcomingDeliveries = useMemo(
    () =>
      orders
        .slice()
        .sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate))
        .slice(0, 5)
        .map((order) => ({
          id: order.resi || `ORD-${order.id}`,
          customer: order.customerName || "Walk-in Customer",
          product: order.product || "Custom Cake",
          date: order.deliveryDate || "-",
        })),
    [orders]
  );

  return (
    <div className="space-y-6 pb-10">
      <GradientPageHeader
        title="Bakery Dashboard"
        description="Real-time overview of bakery orders and delivery commitments."
        icon={BarChart3}
      />

      <div className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Order Statistics
          </p>
        </div>
        <OrdersStats />
      </div>

      <OrdersChart />

      <Card className="rounded-xl shadow-sm">
        <CardHeader className="p-6 pb-2">
          <CardTitle>Upcoming Deliveries</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-6 pb-6 pt-0">
          {upcomingDeliveries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-4 py-6 text-center text-sm text-gray-500">
              No upcoming deliveries yet.
            </div>
          ) : (
            upcomingDeliveries.map((delivery) => (
              <div
                key={delivery.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {delivery.customer}
                  </p>
                  <p className="text-xs text-gray-500">{delivery.product}</p>
                </div>
                <div className="text-sm font-medium text-indigo-700">
                  {delivery.date}
                </div>
                <div className="rounded-full border border-indigo-100 bg-white px-3 py-1 text-xs font-semibold text-indigo-700">
                  {delivery.id}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
