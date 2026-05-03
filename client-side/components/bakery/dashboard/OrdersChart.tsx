"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/components/orders/formatters";
import { useOrders } from "@/components/bakery/store";
import SkeletonBlock from "@/components/bakery/shared/SkeletonBlock";

export default function OrdersChart() {
  const { orders } = useOrders();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 350);
    return () => clearTimeout(timer);
  }, []);

  const ordersPerDay = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, index) => {
    const count = orders.filter((order) => {
      const date = new Date(order.deliveryDate);
      return Number.isFinite(date.getTime()) && date.getDay() === (index + 1) % 7;
    }).length;
    return { day, orders: count };
  });

  const revenueTrend = ordersPerDay.map((dayItem) => {
    const revenue = orders
      .filter((order) => {
        const date = new Date(order.deliveryDate);
        return Number.isFinite(date.getTime()) && date.getDay() === (["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(dayItem.day) + 1) % 7;
      })
      .reduce((sum, order) => sum + (order.totalPrice || 0), 0);
    return { day: dayItem.day, revenue };
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="rounded-2xl">
        <CardHeader className="p-5 pb-2">
          <CardTitle>Orders per Day</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5 pt-0">
          {isLoading ? (
            <SkeletonBlock className="h-64 w-full" />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ordersPerDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0d0c4" />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid #e0d0c4",
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="orders" fill="#c86030" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader className="p-5 pb-2">
          <CardTitle>Revenue Trend</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5 pt-0">
          {isLoading ? (
            <SkeletonBlock className="h-64 w-full" />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0d0c4" />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `Rp ${value / 1000000}M`}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid #e0d0c4",
                      fontSize: 12,
                    }}
                    formatter={(value) => formatCurrency(Number(value))}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="#7c3410"
                    strokeWidth={3}
                    dot={{ r: 4, fill: "#fff", strokeWidth: 2, stroke: "#7c3410" }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
