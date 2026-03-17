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
import {
  bakeryOrdersPerDay,
  bakeryRevenueTrend,
} from "@/components/bakery/mockData";
import SkeletonBlock from "@/components/bakery/shared/SkeletonBlock";

export default function OrdersChart() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 350);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="rounded-xl shadow-sm">
        <CardHeader className="p-6 pb-2">
          <CardTitle>Orders per Day</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6 pt-0">
          {isLoading ? (
            <SkeletonBlock className="h-64 w-full" />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bakeryOrdersPerDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="orders" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl shadow-sm">
        <CardHeader className="p-6 pb-2">
          <CardTitle>Revenue Trend</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6 pt-0">
          {isLoading ? (
            <SkeletonBlock className="h-64 w-full" />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={bakeryRevenueTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `Rp ${value / 1000000}M`}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      fontSize: 12,
                    }}
                    formatter={(value) => formatCurrency(Number(value))}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="#4f46e5"
                    strokeWidth={3}
                    dot={{ r: 4, fill: "#fff", strokeWidth: 2, stroke: "#4f46e5" }}
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
