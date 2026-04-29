"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { normalizeOrderStatus } from "@/lib/bookings/order-status";
import { generateExcel } from "@/lib/export/excel";
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
  const [isExportPickerOpen, setIsExportPickerOpen] = useState(false);
  const exportDialogTitleRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    if (!isExportPickerOpen) return;

    // Force viewport and dashboard scroller to top so modal is always visible.
    window.scrollTo({ top: 0, behavior: "smooth" });
    const dashboardScroller = document.querySelector(
      "main.custom-scrollbar",
    ) as HTMLElement | null;
    if (dashboardScroller) {
      dashboardScroller.scrollTo({ top: 0, behavior: "smooth" });
    }

    // Lock background scroll while modal is open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusId = window.setTimeout(() => {
      exportDialogTitleRef.current?.focus();
    }, 120);

    return () => {
      window.clearTimeout(focusId);
      document.body.style.overflow = previousOverflow;
    };
  }, [isExportPickerOpen]);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const normalizedOrderStatus = normalizeOrderStatus(order.orderStatus);
      if (fromDate && order.deliveryDate < fromDate) return false;
      if (toDate && order.deliveryDate > toDate) return false;
      if (statusFilter && normalizedOrderStatus !== statusFilter) return false;
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
    ["Completed", "Delivered"].includes(normalizeOrderStatus(order.orderStatus)),
  ).length;

  const statusCounts = [
    "In Production",
    "Ready",
    "Delivered",
    "Completed",
    "Cancelled",
  ].map((status) => ({
    name: status,
    value: filteredOrders.filter((order) => {
      const normalizedOrderStatus = normalizeOrderStatus(order.orderStatus);
      return normalizedOrderStatus === status;
    }).length,
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

  const customerRows = useMemo(() => {
    const grouped = new Map<
      string,
      {
        customer: string;
        phone: string;
        address: string;
        orderCount: number;
        totalSpent: number;
        lastOrderDate: string;
        lastDeliverySlot: string;
      }
    >();

    filteredOrders.forEach((order) => {
      const customer = (order.customerName || "Walk-in Customer").trim();
      const phone = (order.customerPhone || "").trim();
      const address =
        order.deliveryAddresses?.[0]?.addressLine?.trim() ||
        order.customerAddress?.trim() ||
        "-";
      const key = `${customer.toLowerCase()}||${phone.toLowerCase()}`;
      const existing = grouped.get(key);

      if (!existing) {
        grouped.set(key, {
          customer,
          phone,
          address,
          orderCount: 1,
          totalSpent: Number(order.totalPrice || 0),
          lastOrderDate: order.deliveryDate || "",
          lastDeliverySlot: order.deliverySlot || "",
        });
        return;
      }

      existing.orderCount += 1;
      existing.totalSpent += Number(order.totalPrice || 0);
      if ((order.deliveryDate || "") >= existing.lastOrderDate) {
        existing.lastOrderDate = order.deliveryDate || "";
        existing.lastDeliverySlot = order.deliverySlot || "";
        existing.address = address;
      }
    });

    return Array.from(grouped.values()).sort((a, b) =>
      a.customer.localeCompare(b.customer, "id"),
    );
  }, [filteredOrders]);

  const bookingRows = useMemo(
    () =>
      filteredOrders.map((order) => ({
        bookingCode: order.bookingCode || order.resi || order.id,
        resi: order.resi || "-",
        customer: order.customerName || "Walk-in Customer",
        phone: order.customerPhone || "",
        deliveryDate: order.deliveryDate || "",
        deliverySlot: order.deliverySlot || "",
        status: normalizeOrderStatus(order.orderStatus),
        paymentStatus:
          order.paymentStatus === "Pending" ? "DP Paid" : order.paymentStatus,
        totalPrice: Number(order.totalPrice || 0),
        notes: order.notes || "",
      })),
    [filteredOrders],
  );

  const itemRows = useMemo(
    () =>
      filteredOrders.flatMap((order) =>
        (order.items || []).map((item) => ({
          bookingCode: order.bookingCode || order.resi || order.id,
          customer: order.customerName || "Walk-in Customer",
          deliveryDate: order.deliveryDate || "",
          productName: item.productName || "Produk",
          category: item.category || "",
          size: item.size || "",
          qty: Number(item.quantity || 0),
          lineTotal: Number(item.lineTotal || 0),
          addOns: (item.addOns || []).join(", "),
        })),
      ),
    [filteredOrders],
  );

  const exportExcel = (type: "bookings" | "items" | "customers") => {
    const selectedSheet =
      type === "bookings"
        ? [
            {
              name: "Bookings",
              columns: [
                { key: "bookingCode", header: "Booking Code", width: 18 },
                { key: "resi", header: "Resi", width: 18 },
                { key: "customer", header: "Customer", width: 24 },
                { key: "phone", header: "Phone", width: 18 },
                { key: "deliveryDate", header: "Delivery Date", width: 16 },
                { key: "deliverySlot", header: "Delivery Slot", width: 22 },
                { key: "status", header: "Order Status", width: 16 },
                { key: "paymentStatus", header: "Payment Status", width: 16 },
                { key: "totalPrice", header: "Total Price", width: 16 },
                { key: "notes", header: "Notes", width: 36 },
              ],
              rows: bookingRows,
            },
          ]
        : type === "items"
          ? [
              {
                name: "Booking Items",
                columns: [
                  { key: "bookingCode", header: "Booking Code", width: 18 },
                  { key: "customer", header: "Customer", width: 24 },
                  { key: "deliveryDate", header: "Delivery Date", width: 16 },
                  { key: "productName", header: "Product", width: 28 },
                  { key: "category", header: "Category", width: 16 },
                  { key: "size", header: "Size", width: 14 },
                  { key: "qty", header: "Qty", width: 10 },
                  { key: "lineTotal", header: "Line Total", width: 16 },
                  { key: "addOns", header: "Add Ons", width: 28 },
                ],
                rows: itemRows,
              },
            ]
          : [
              {
                name: "Customers",
                columns: [
                  { key: "customer", header: "Customer", width: 24 },
                  { key: "phone", header: "Phone", width: 18 },
                  { key: "address", header: "Last Address", width: 40 },
                  { key: "orderCount", header: "Total Orders", width: 14 },
                  { key: "totalSpent", header: "Total Spent", width: 16 },
                  { key: "lastOrderDate", header: "Last Order Date", width: 16 },
                  { key: "lastDeliverySlot", header: "Last Delivery Slot", width: 22 },
                ],
                rows: customerRows,
              },
            ];

    const blob = generateExcel(selectedSheet);
    const filePrefix =
      type === "bookings"
        ? "reports-bookings"
        : type === "items"
          ? "reports-booking-items"
          : "reports-customers";
    const filename = `${filePrefix}-${toDateInputValue(new Date())}.xlsx`;
    setIsExportPickerOpen(false);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
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
          <div className="flex flex-wrap gap-2">
            <Link
              href="/bakery/omzet-harian"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-[#dbe2ea] px-4 text-sm font-semibold text-[#243b5a] transition hover:bg-[#fff4ed]"
            >
              Buka halaman omzet harian
            </Link>
            <Button
              className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:ring-indigo-500"
              onClick={() => setIsExportPickerOpen(true)}
            >
              <Download size={16} />
              Export Excel
            </Button>
          </div>
        }
      />
      {typeof document !== "undefined" &&
        isExportPickerOpen &&
        createPortal(
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/35 p-4">
            <div className="w-full max-w-md rounded-2xl border border-indigo-100 bg-white p-5 shadow-2xl">
              <p
                ref={exportDialogTitleRef}
                tabIndex={-1}
                className="text-base font-bold text-slate-800 outline-none"
              >
                Pilih Data Export
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Pilih salah satu jenis data Excel yang ingin diunduh.
              </p>
              <div className="mt-4 grid gap-2">
                <Button
                  onClick={() => exportExcel("bookings")}
                  className="justify-start"
                >
                  Bookings
                </Button>
                <Button
                  onClick={() => exportExcel("items")}
                  className="justify-start"
                >
                  Booking Items
                </Button>
                <Button
                  onClick={() => exportExcel("customers")}
                  className="justify-start"
                >
                  Customers
                </Button>
              </div>
              <div className="mt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsExportPickerOpen(false)}
                  className="w-full"
                >
                  Batal
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}

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
              <option value="In Production">In Production</option>
              <option value="Ready">Ready</option>
              <option value="Delivered">Delivered</option>
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
