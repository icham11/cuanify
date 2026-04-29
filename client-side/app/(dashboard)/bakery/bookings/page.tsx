"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import GradientPageHeader from "@/components/bakery/shared/GradientPageHeader";
import OrderFilters from "@/components/bakery/bookings/OrderFilters";
import OrderTable from "@/components/bakery/bookings/OrderTable";
import BookingStats from "@/components/bakery/bookings/BookingStats";
import { useOrders } from "@/components/bakery/store";
import { normalizeOrderStatus } from "@/lib/bookings/order-status";
import {
  getJakartaTodayIsoDate,
  resolveShippingProvider,
} from "@/lib/bookings/shipping-schedule";
import { BookOpen } from "lucide-react";

type CourierFilter = "" | "grab-gojek" | "paxel";
type OrderSourceFilter = "" | "customer" | "admin";

function addDaysToIsoDate(isoDate: string, days: number): string {
  const matched = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return isoDate;

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return isoDate;
  }

  const value = new Date(Date.UTC(year, month - 1, day));
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function inferDeliveryMethodFromText(rawValue?: string): string | undefined {
  const raw = (rawValue || "").trim().toLowerCase();
  if (!raw) return undefined;

  if (raw.includes("pickup")) return "PICKUP";
  if (raw.includes("customer_app_courier") || raw.includes("pesan customer") || raw.includes("customer")) {
    return "CUSTOMER_APP_COURIER";
  }
  if (raw.includes("assisted_")) {
    return raw.toUpperCase();
  }
  if (raw.includes("gosend") || raw.includes("go send")) {
    return "ASSISTED_GOSEND";
  }
  if (raw.includes("gocar") || raw.includes("go car")) {
    return "ASSISTED_GOCAR";
  }
  if (raw.includes("grab")) return "ASSISTED_GRAB";
  if (raw.includes("paxel")) return "ASSISTED_PAXEL";
  if (
    raw.includes("same day") ||
    raw.includes("same-day") ||
    raw.includes("sameday")
  ) {
    return "ASSISTED_SAME_DAY";
  }
  if (raw.includes("jne") || raw.includes("j&t") || raw.includes("jnt")) {
    return "REGULAR_JNE_JNT";
  }

  return undefined;
}

function inferDeliveryMethodFromNotes(notes?: string): string | undefined {
  const match = notes?.match(/delivery\s*method\s*:\s*([^\n]+)/i);
  return inferDeliveryMethodFromText(match?.[1]);
}

function resolveOrderSource(order: {
  notes?: string;
  whatsAppParsedData?: { common?: { deliveryMethod?: string } };
}): "customer" | "admin" | null {
  const parsedMethod = inferDeliveryMethodFromText(
    order.whatsAppParsedData?.common?.deliveryMethod,
  );
  const noteMethod = inferDeliveryMethodFromNotes(order.notes);
  const deliveryMethod = parsedMethod || noteMethod;

  if (!deliveryMethod || deliveryMethod === "PICKUP") return null;
  if (deliveryMethod === "CUSTOMER_APP_COURIER") return "customer";
  if (deliveryMethod.startsWith("ASSISTED_") || deliveryMethod === "REGULAR_JNE_JNT") {
    return "admin";
  }

  return null;
}

export default function BookingListPage() {
  const { orders } = useOrders();

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [courierFilter, setCourierFilter] = useState<CourierFilter>("");
  const [orderSourceFilter, setOrderSourceFilter] =
    useState<OrderSourceFilter>("");
  const [sortBy, setSortBy] = useState<
    "delivery-asc" | "delivery-desc" | "name-asc" | "value-desc"
  >("delivery-asc");
  const [currentPage, setCurrentPage] = useState(1);
  const today = getJakartaTodayIsoDate();
  const tomorrow = useMemo(() => addDaysToIsoDate(today, 1), [today]);
  const PAGE_SIZE = 10;

  const filteredOrders = useMemo(() => {
    const filtered = orders.filter((order) => {
      const normalizedOrderStatus = normalizeOrderStatus(order.orderStatus);
      const matchesQuery =
        order.customerName.toLowerCase().includes(query.toLowerCase()) ||
        order.resi.toLowerCase().includes(query.toLowerCase()) ||
        order.bookingCode.toLowerCase().includes(query.toLowerCase());
      const matchesStatus = statusFilter
        ? normalizedOrderStatus === statusFilter
        : true;
      const matchesDate = dateFilter ? order.deliveryDate === dateFilter : true;
      const provider = resolveShippingProvider(order);
      const matchesCourier =
        courierFilter === ""
          ? true
          : courierFilter === "grab-gojek"
            ? provider === "GRAB" || provider === "GOJEK"
            : provider === "PAXEL";
      const source = resolveOrderSource(order);
      const matchesOrderSource =
        orderSourceFilter === "" ? true : source === orderSourceFilter;
      return (
        matchesQuery &&
        matchesStatus &&
        matchesDate &&
        matchesCourier &&
        matchesOrderSource
      );
    });

    if (sortBy === "delivery-asc") {
      return filtered
        .slice()
        .sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));
    }

    if (sortBy === "delivery-desc") {
      return filtered
        .slice()
        .sort((a, b) => b.deliveryDate.localeCompare(a.deliveryDate));
    }

    if (sortBy === "name-asc") {
      return filtered
        .slice()
        .sort((a, b) => a.customerName.localeCompare(b.customerName));
    }

    return filtered
      .slice()
      .sort((a, b) => (b.totalPrice || 0) - (a.totalPrice || 0));
  }, [
    orders,
    query,
    statusFilter,
    dateFilter,
    courierFilter,
    orderSourceFilter,
    sortBy,
  ]);

  const hasActiveFilters = Boolean(
    query || statusFilter || dateFilter || courierFilter || orderSourceFilter,
  );

  const clearFilters = () => {
    setQuery("");
    setStatusFilter("");
    setDateFilter("");
    setCourierFilter("");
    setOrderSourceFilter("");
    setSortBy("delivery-asc");
    setCurrentPage(1);
  };

  const applySavedView = (
    view: "today" | "tomorrow" | "production" | "ready",
  ) => {
    setQuery("");
    setCourierFilter("");
    setOrderSourceFilter("");
    setSortBy("delivery-asc");
    setCurrentPage(1);

    if (view === "today") {
      setDateFilter(today);
      setStatusFilter("");
      return;
    }

    if (view === "tomorrow") {
      setDateFilter(tomorrow);
      setStatusFilter("");
      return;
    }

    if (view === "production") {
      setDateFilter("");
      setStatusFilter("In Production");
      return;
    }

    setDateFilter("");
    setStatusFilter("Ready");
  };

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pagedOrders = filteredOrders.slice(
    (safeCurrentPage - 1) * PAGE_SIZE,
    safeCurrentPage * PAGE_SIZE,
  );
  const activeCourierLabel =
    courierFilter === "grab-gojek"
      ? "Grab/Gojek"
      : courierFilter === "paxel"
        ? "Paxel"
        : "";
  const activeOrderSourceLabel =
    orderSourceFilter === "customer"
      ? "Dipesan Customer"
      : orderSourceFilter === "admin"
        ? "Dibantu Admin"
        : "";

  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(totalPages, prev + 1));
  };

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setCurrentPage(1);
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setCurrentPage(1);
  };

  const handleDateChange = (value: string) => {
    setDateFilter(value);
    setCurrentPage(1);
  };

  const handleCourierChange = (value: CourierFilter) => {
    setCourierFilter(value);
    setCurrentPage(1);
  };

  const handleOrderSourceChange = (value: OrderSourceFilter) => {
    setOrderSourceFilter(value);
    setCurrentPage(1);
  };

  const handleSortChange = (
    value: "delivery-asc" | "delivery-desc" | "name-asc" | "value-desc",
  ) => {
    setSortBy(value);
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6 pb-10">
      <GradientPageHeader
        title="Bookings"
        description="Track and manage all incoming cake orders and delivery schedules."
        icon={BookOpen}
        actions={
          <Link
            href="/bakery/bookings/new"
            className="inline-flex h-10 items-center justify-center rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            New Booking
          </Link>
        }
      />

      <BookingStats orders={orders} />

      <OrderFilters
        query={query}
        status={statusFilter}
        date={dateFilter}
        courier={courierFilter}
        sortBy={sortBy}
        hasActiveFilters={hasActiveFilters}
        onQueryChange={handleQueryChange}
        onStatusChange={handleStatusChange}
        onDateChange={handleDateChange}
        onCourierChange={(value) => handleCourierChange(value as CourierFilter)}
        onSortChange={handleSortChange}
        onReset={clearFilters}
        onSavedViewSelect={applySavedView}
      />

      <Card className="rounded-xl shadow-sm">
        <CardHeader className="p-6 pb-2">
          <CardTitle>Orders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-6 pb-6 pt-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-medium text-gray-500">
              Showing {filteredOrders.length} of {orders.length} orders
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500">
                Courier:
              </span>
              <Select
                value={courierFilter}
                onChange={(event) =>
                  handleCourierChange(event.target.value as CourierFilter)
                }
                className="h-8 min-w-36 rounded-lg border-gray-300 bg-white px-2 text-xs"
              >
                <option value="">All courier</option>
                <option value="grab-gojek">Grab/Gojek</option>
                <option value="paxel">Paxel</option>
              </Select>
              <span className="ml-1 text-xs font-medium text-gray-500">
                Dipesan oleh:
              </span>
              <Select
                value={orderSourceFilter}
                onChange={(event) =>
                  handleOrderSourceChange(
                    event.target.value as OrderSourceFilter,
                  )
                }
                className="h-8 min-w-36 rounded-lg border-gray-300 bg-white px-2 text-xs"
              >
                <option value="">Semua</option>
                <option value="customer">Customer</option>
                <option value="admin">Admin</option>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {activeCourierLabel ? (
              <div className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-800">
                Courier filter: {activeCourierLabel}
              </div>
            ) : null}
            {activeOrderSourceLabel ? (
              <div className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800">
                Filter pemesan: {activeOrderSourceLabel}
              </div>
            ) : null}
          </div>
          <OrderTable orders={pagedOrders} />
          {filteredOrders.length > PAGE_SIZE ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-500">
                Page {safeCurrentPage} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrevPage}
                  disabled={currentPage === 1}
                  className="inline-flex h-8 items-center justify-center rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={handleNextPage}
                  disabled={currentPage === totalPages}
                  className="inline-flex h-8 items-center justify-center rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="rounded-xl shadow-sm">
        <CardHeader className="p-6 pb-2">
        <CardTitle>Workflow Tips</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6 pt-0 text-sm text-gray-600">
          Booking baru sekarang langsung masuk produksi. Gunakan dropdown status
          untuk menggeser order dari In Production ke Ready lalu Completed.
        </CardContent>
      </Card>
    </div>
  );
}

