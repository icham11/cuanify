"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import GradientPageHeader from "@/components/bakery/shared/GradientPageHeader";
import { formatCurrency } from "@/components/orders/formatters";
import { Download, PieChart as PieChartIcon } from "lucide-react";
import { useOrders } from "@/components/bakery/store";

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function ReportsPage() {
  const { orders } = useOrders();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (fromDate && order.deliveryDate < fromDate) return false;
      if (toDate && order.deliveryDate > toDate) return false;
      if (statusFilter && order.orderStatus !== statusFilter) return false;
      return true;
    });
  }, [orders, fromDate, toDate, statusFilter]);

  const totalOrders = filteredOrders.length;
  const totalRevenue = filteredOrders.reduce(
    (sum, order) => sum + (order.totalPrice || 0),
    0,
  );
  const aov = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
  const completedCount = filteredOrders.filter((order) =>
    ["Completed", "Delivered"].includes(order.orderStatus),
  ).length;

  const statusCounts = [
    "Inquiry",
    "Quoted",
    "DP Paid",
    "Confirmed",
    "In Production",
    "Ready",
    "Completed",
    "Cancelled",
  ].map((status) => ({
    name: status,
    value: filteredOrders.filter((order) => order.orderStatus === status)
      .length,
  }));

  const bakeryStatusMix = statusCounts
    .filter((item) => item.value > 0)
    .map((item, index) => ({
      ...item,
      color: [
        "#1d4ed8",
        "#2563eb",
        "#3b82f6",
        "#0ea5e9",
        "#6366f1",
        "#4f46e5",
        "#4338ca",
        "#e11d48",
      ][index % 8],
    }));

  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const bakeryRevenueByWeek = weekday.map((day) => {
    const revenue = filteredOrders
      .filter((order) => {
        const date = new Date(order.deliveryDate);
        return (
          Number.isFinite(date.getTime()) && weekday[date.getDay()] === day
        );
      })
      .reduce((sum, order) => sum + (order.totalPrice || 0), 0);
    return { week: day, revenue };
  });

  const revenueBySize = useMemo(() => {
    const map = new Map<string, number>();
    filteredOrders.forEach((order) => {
      const key = order.items?.[0]?.size || order.size || "Unknown";
      const current = map.get(key) ?? 0;
      map.set(key, current + (order.totalPrice || 0));
    });

    return Array.from(map.entries())
      .map(([size, revenue]) => ({ size, revenue }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [filteredOrders]);

  const reportStats = [
    { title: "Total Orders", value: String(totalOrders) },
    { title: "Total Revenue", value: formatCurrency(totalRevenue) },
    { title: "AOV", value: formatCurrency(aov) },
    { title: "Completed Orders", value: String(completedCount) },
  ];

  const setQuickRange = (days: number) => {
    const now = new Date();
    const from = new Date(now);
    from.setDate(now.getDate() - (days - 1));
    setFromDate(toDateInputValue(from));
    setToDate(toDateInputValue(now));
  };

  const resetFilters = () => {
    setFromDate("");
    setToDate("");
    setStatusFilter("");
  };

  const exportCsv = () => {
    const headers = [
      "Booking Code",
      "Customer",
      "Phone",
      "Delivery Date",
      "Delivery Slot",
      "Order Status",
      "Payment Status",
      "Total Price",
    ];

    const escapeCsv = (value: string | number) => {
      const text = String(value ?? "");
      if (text.includes(",") || text.includes('"') || text.includes("\n")) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };

    const rows = filteredOrders.map((order) => [
      order.bookingCode || order.resi || order.id,
      order.customerName || "Walk-in Customer",
      order.customerPhone || "",
      order.deliveryDate || "",
      order.deliverySlot || "",
      order.orderStatus,
      order.paymentStatus,
      order.totalPrice || 0,
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => escapeCsv(cell)).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bakery-report-${toDateInputValue(new Date())}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 pb-10">
      <GradientPageHeader
        title="Owner Monitoring"
        description="Analytics for revenue and order health across time."
        icon={PieChartIcon}
        actions={
          <Button
            className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:ring-indigo-500"
            onClick={exportCsv}
          >
            <Download size={16} />
            Export CSV
          </Button>
        }
      />

      <Card className="rounded-xl shadow-sm">
        <CardHeader className="p-6 pb-2">
          <CardTitle>Date Range</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 px-6 pb-6 pt-0">
          <div className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              From
            </span>
            <Input
              type="date"
              className="max-w-50"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              To
            </span>
            <Input
              type="date"
              className="max-w-50"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Status
            </span>
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">All status</option>
              <option value="Inquiry">Inquiry</option>
              <option value="Quoted">Quoted</option>
              <option value="DP Paid">DP Paid</option>
              <option value="Confirmed">Confirmed</option>
              <option value="In Production">In Production</option>
              <option value="Ready">Ready</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </Select>
          </div>
          <div className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Quick Range
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setQuickRange(7)}
              >
                7D
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setQuickRange(30)}
              >
                30D
              </Button>
              <Button type="button" variant="outline" onClick={resetFilters}>
                Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {reportStats.map((stat) => (
          <Card key={stat.title} className="rounded-xl shadow-sm">
            <CardHeader className="p-6 pb-2">
              <CardTitle className="text-sm text-gray-600">
                {stat.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6 pt-0">
              <div className="text-xl font-semibold text-gray-900">
                {stat.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="p-6 pb-2">
            <CardTitle>Revenue Summary</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 pt-0">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bakeryRevenueByWeek}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="week" tickLine={false} axisLine={false} />
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
                  <Bar dataKey="revenue" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl shadow-sm">
          <CardHeader className="p-6 pb-2">
            <CardTitle>Order Status Mix</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6 pt-0">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={bakeryStatusMix}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={4}
                  >
                    {bakeryStatusMix.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 grid gap-2 text-sm text-gray-600">
              {bakeryStatusMix.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No status data in selected range.
                </p>
              ) : (
                bakeryStatusMix.map((status) => (
                  <div
                    key={status.name}
                    className="flex items-center justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: status.color }}
                      />
                      {status.name}
                    </span>
                    <span>{status.value}</span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-xl shadow-sm">
        <CardHeader className="p-6 pb-2">
          <CardTitle>Insights</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6 pt-0 text-sm text-gray-600">
          Use these charts to highlight peak weeks and ensure production
          capacity matches demand.
        </CardContent>
      </Card>

      <Card className="rounded-xl shadow-sm">
        <CardHeader className="p-6 pb-2">
          <CardTitle>Revenue by Size</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6 pt-0">
          {revenueBySize.length === 0 ? (
            <p className="text-sm text-gray-500">
              No size data in selected range.
            </p>
          ) : (
            <div className="space-y-2 text-sm text-gray-700">
              {revenueBySize.map((row) => (
                <div
                  key={row.size}
                  className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2"
                >
                  <span className="font-medium text-gray-600">{row.size}</span>
                  <span className="font-semibold text-gray-900">
                    {formatCurrency(row.revenue)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
