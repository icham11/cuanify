"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import GradientPageHeader from "@/components/bakery/shared/GradientPageHeader";
import OrderFilters from "@/components/bakery/bookings/OrderFilters";
import OrderTable from "@/components/bakery/bookings/OrderTable";
import BookingStats from "@/components/bakery/bookings/BookingStats";
import { useOrders } from "@/components/bakery/store";
import { BookOpen } from "lucide-react";

export default function BookingListPage() {
  const { orders } = useOrders();
  const today = new Date().toISOString().slice(0, 10);
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = tomorrowDate.toISOString().slice(0, 10);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [sortBy, setSortBy] = useState<
    "delivery-asc" | "delivery-desc" | "name-asc" | "value-desc"
  >("delivery-asc");
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 20;

  const filteredOrders = useMemo(() => {
    const filtered = orders.filter((order) => {
      const normalizedOrderStatus =
        order.orderStatus === "Confirmed" ? "In Production" : order.orderStatus;
      const matchesQuery =
        order.customerName.toLowerCase().includes(query.toLowerCase()) ||
        order.resi.toLowerCase().includes(query.toLowerCase()) ||
        order.bookingCode.toLowerCase().includes(query.toLowerCase());
      const matchesStatus = statusFilter
        ? normalizedOrderStatus === statusFilter
        : true;
      const matchesDate = dateFilter ? order.deliveryDate === dateFilter : true;
      return matchesQuery && matchesStatus && matchesDate;
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
  }, [orders, query, statusFilter, dateFilter, sortBy]);

  const hasActiveFilters = Boolean(query || statusFilter || dateFilter);

  const clearFilters = () => {
    setQuery("");
    setStatusFilter("");
    setDateFilter("");
    setSortBy("delivery-asc");
    setCurrentPage(1);
  };

  const applySavedView = (
    view: "today" | "tomorrow" | "unpaid" | "new-inquiry" | "production",
  ) => {
    setQuery("");
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

    if (view === "unpaid") {
      setDateFilter("");
      setStatusFilter("DP Paid");
      return;
    }

    if (view === "new-inquiry") {
      setDateFilter("");
      setStatusFilter("Inquiry");
      return;
    }

    setDateFilter("");
    setStatusFilter("In Production");
  };

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const pagedOrders = filteredOrders.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(totalPages, prev + 1));
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
        sortBy={sortBy}
        hasActiveFilters={hasActiveFilters}
        onQueryChange={setQuery}
        onStatusChange={setStatusFilter}
        onDateChange={setDateFilter}
        onSortChange={setSortBy}
        onReset={clearFilters}
        onSavedViewSelect={applySavedView}
      />

      <Card className="rounded-xl shadow-sm">
        <CardHeader className="p-6 pb-2">
          <CardTitle>Orders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-6 pb-6 pt-0">
          <div className="text-xs font-medium text-gray-500">
            Showing {filteredOrders.length} of {orders.length} orders
          </div>
          <OrderTable orders={pagedOrders} />
          {filteredOrders.length > PAGE_SIZE ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-500">
                Page {currentPage} of {totalPages}
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
          Use the status dropdowns to move orders from approval into production.
          Orders in In Production status appear automatically in the Production
          queue.
        </CardContent>
      </Card>
    </div>
  );
}
