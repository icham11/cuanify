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
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesQuery =
        order.customerName.toLowerCase().includes(query.toLowerCase()) ||
        order.resi.toLowerCase().includes(query.toLowerCase()) ||
        order.bookingCode.toLowerCase().includes(query.toLowerCase());
      const matchesStatus = statusFilter
        ? order.orderStatus === statusFilter
        : true;
      const matchesDate = dateFilter ? order.deliveryDate === dateFilter : true;
      return matchesQuery && matchesStatus && matchesDate;
    });
  }, [orders, query, statusFilter, dateFilter]);

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
        onQueryChange={setQuery}
        onStatusChange={setStatusFilter}
        onDateChange={setDateFilter}
      />

      <Card className="rounded-xl shadow-sm">
        <CardHeader className="p-6 pb-2">
          <CardTitle>Orders</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6 pt-0">
          <OrderTable orders={filteredOrders} />
        </CardContent>
      </Card>

      <Card className="rounded-xl shadow-sm">
        <CardHeader className="p-6 pb-2">
          <CardTitle>Workflow Tips</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6 pt-0 text-sm text-gray-600">
          Use the status dropdowns to move orders from approval to production. Orders that are confirmed will appear
          automatically in the Production queue.
        </CardContent>
      </Card>
    </div>
  );
}
