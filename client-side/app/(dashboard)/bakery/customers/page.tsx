"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search, Users } from "lucide-react";
import GradientPageHeader from "@/components/bakery/shared/GradientPageHeader";
import { useOrders } from "@/components/bakery/store";

type CustomerRow = {
  name: string;
  phone: string;
  address: string;
  orderCount: number;
  totalSpent: number;
  lastOrderDate: string;
  lastDeliverySlot: string;
};

function normalizePhone(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(Math.max(0, value));
}

export default function BakeryCustomersPage() {
  const { orders } = useOrders();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const filteredCustomers = useMemo<CustomerRow[]>(() => {
    const grouped = new Map<string, CustomerRow>();

    orders.forEach((order) => {
      const name = (order.customerName || "").trim();
      const phone = normalizePhone(order.customerPhone || "");
      const address =
        order.deliveryAddresses?.[0]?.addressLine?.trim() ||
        order.customerAddress?.trim() ||
        "-";

      if (!name && !phone) return;
      const key = `${name.toLowerCase()}||${phone.toLowerCase()}`;
      const existing = grouped.get(key);
      const orderTotal = Math.max(0, Number(order.totalPrice || 0));
      const deliveryDate = (order.deliveryDate || "").trim();

      if (!existing) {
        grouped.set(key, {
          name: name || "Customer",
          phone: phone || "-",
          address,
          orderCount: 1,
          totalSpent: orderTotal,
          lastOrderDate: deliveryDate,
          lastDeliverySlot: (order.deliverySlot || "").trim(),
        });
        return;
      }

      existing.orderCount += 1;
      existing.totalSpent += orderTotal;
      if (deliveryDate && deliveryDate > existing.lastOrderDate) {
        existing.lastOrderDate = deliveryDate;
        existing.lastDeliverySlot = (order.deliverySlot || "").trim();
        existing.address = address || existing.address;
      }
    });

    const q = query.trim().toLowerCase();
    const rows = Array.from(grouped.values());
    const filtered = q
      ? rows.filter(
          (row) =>
            row.name.toLowerCase().includes(q) ||
            row.phone.toLowerCase().includes(q) ||
            row.address.toLowerCase().includes(q),
        )
      : rows;

    return filtered.sort((a, b) => a.name.localeCompare(b.name, "id"));
  }, [orders, query]);

  const totalCustomers = filteredCustomers.length;
  const totalPages = Math.max(1, Math.ceil(totalCustomers / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalCustomers);
  const pagedCustomers = filteredCustomers.slice(startIndex, endIndex);
  const totalOrderCount = filteredCustomers.reduce(
    (sum, row) => sum + row.orderCount,
    0,
  );
  const totalSpend = filteredCustomers.reduce((sum, row) => sum + row.totalSpent, 0);

  return (
    <div className="space-y-6 pb-8">
      <GradientPageHeader
        title="Customer Database"
        description="Data customer dari seluruh booking order, otomatis tersusun rapi."
        icon={Users}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Total Customer
          </p>
          <p className="mt-1 text-2xl font-extrabold text-slate-800">{totalCustomers}</p>
        </div>
        <div className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Total Order
          </p>
          <p className="mt-1 text-2xl font-extrabold text-slate-800">{totalOrderCount}</p>
        </div>
        <div className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Total Belanja
          </p>
          <p className="mt-1 text-2xl font-extrabold text-emerald-700">{formatCurrency(totalSpend)}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[1fr_180px]">
          <div className="flex items-center gap-2 rounded-xl border border-indigo-200 px-3">
            <Search className="h-4 w-4 text-indigo-500" />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Cari nama, no hp, atau alamat..."
              className="h-10 w-full bg-transparent text-sm text-slate-700 outline-none"
            />
          </div>
          <select
            value={String(pageSize)}
            onChange={(event) => {
              setPageSize(Math.max(5, Number(event.target.value) || 25));
              setPage(1);
            }}
            className="h-10 rounded-xl border border-indigo-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-indigo-400"
          >
            <option value="10">10 / halaman</option>
            <option value="25">25 / halaman</option>
            <option value="50">50 / halaman</option>
            <option value="100">100 / halaman</option>
          </select>
        </div>
      </div>

      <div className="rounded-2xl border border-indigo-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 px-4 py-3 text-sm text-slate-600">
          <p className="font-semibold">
            Menampilkan {totalCustomers === 0 ? 0 : startIndex + 1}-{endIndex} dari {totalCustomers} customer
          </p>
          <p>
            Halaman {safePage} / {totalPages}
          </p>
        </div>

        <div className="hidden max-h-[62vh] overflow-auto md:block">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-indigo-50 text-left text-xs uppercase tracking-wide text-indigo-700">
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">No HP</th>
                <th className="px-4 py-3">Alamat Terakhir</th>
                <th className="px-4 py-3 text-right">Total Order</th>
                <th className="px-4 py-3 text-right">Total Belanja</th>
                <th className="px-4 py-3 text-right">Order Terakhir</th>
              </tr>
            </thead>
            <tbody>
              {pagedCustomers.map((customer) => (
                <tr key={`${customer.name}-${customer.phone}`} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold text-slate-800">{customer.name}</td>
                  <td className="px-4 py-3 text-slate-600">{customer.phone}</td>
                  <td className="px-4 py-3 text-slate-600">{customer.address}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-700">{customer.orderCount}</td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-700">{formatCurrency(customer.totalSpent)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    <p>{customer.lastOrderDate || "-"}</p>
                    <p className="text-xs text-slate-500">
                      {customer.lastDeliverySlot || "-"}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 p-4 md:hidden">
          {pagedCustomers.map((customer) => (
            <div key={`${customer.name}-${customer.phone}`} className="rounded-xl border border-slate-100 p-3">
              <p className="text-sm font-bold text-slate-800">{customer.name}</p>
              <p className="text-xs text-slate-600">{customer.phone}</p>
              <p className="mt-1 text-xs text-slate-500">{customer.address}</p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-slate-400">Order</p>
                  <p className="font-semibold text-slate-700">{customer.orderCount}</p>
                </div>
                <div>
                  <p className="text-slate-400">Belanja</p>
                  <p className="font-semibold text-emerald-700">{formatCurrency(customer.totalSpent)}</p>
                </div>
                <div>
                  <p className="text-slate-400">Terakhir</p>
                  <p className="font-semibold text-slate-700">
                    {customer.lastOrderDate || "-"}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {customer.lastDeliverySlot || "-"}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {pagedCustomers.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-500">
            Tidak ada data customer untuk filter ini.
          </div>
        ) : null}

        <div className="flex items-center justify-between border-t border-indigo-100 px-4 py-3">
          <button
            type="button"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={safePage <= 1}
            className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" /> Prev
          </button>
          <span className="text-xs font-semibold text-slate-600">
            {safePage} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={safePage >= totalPages}
            className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
