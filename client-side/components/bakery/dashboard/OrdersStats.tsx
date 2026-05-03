"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/components/orders/formatters";
import { useOrders } from "@/components/bakery/store";
import {
  DAILY_PRODUCTION_TOKEN_LIMIT,
  summarizeProductionTokensByItems,
} from "@/lib/bookings/operations";
import {
  isOpenOrderStatus,
  normalizeOrderStatus,
} from "@/lib/bookings/order-status";
import {
  BarChart3,
  CheckCircle2,
  Factory,
  PackageCheck,
  Wallet,
} from "lucide-react";

const icons = [BarChart3, CheckCircle2, Factory, PackageCheck, Wallet];

export default function OrdersStats() {
  const { orders } = useOrders();
  const [monthFilter, setMonthFilter] = useState("all");
  const [capacityPage, setCapacityPage] = useState(1);

  const capacityPerDay = useMemo(
    () =>
      Array.from(
        orders.reduce((map, order) => {
          const date = (order.deliveryDate || "").trim();
          if (!date) return map;
          const used = map.get(date) ?? 0;
          map.set(
            date,
            used + summarizeProductionTokensByItems(order.items ?? []),
          );
          return map;
        }, new Map<string, number>()),
      )
        .sort(([left], [right]) => right.localeCompare(left))
        .map(([date, used]) => {
          const safeUsed = Math.max(0, Math.round(used));
          const remaining = Math.max(0, DAILY_PRODUCTION_TOKEN_LIMIT - safeUsed);
          const remainingPercent = Math.max(
            0,
            Math.round((remaining / DAILY_PRODUCTION_TOKEN_LIMIT) * 100),
          );
          return {
            date,
            monthKey: date.slice(0, 7),
            remaining,
            used: safeUsed,
            remainingPercent,
            usagePercent: Math.min(
              100,
              Math.round((safeUsed / DAILY_PRODUCTION_TOKEN_LIMIT) * 100),
            ),
          };
        }),
    [orders],
  );

  const monthOptions = useMemo(
    () => Array.from(new Set(capacityPerDay.map((entry) => entry.monthKey))),
    [capacityPerDay],
  );

  const filteredCapacity = useMemo(
    () =>
      monthFilter === "all"
        ? capacityPerDay
        : capacityPerDay.filter((entry) => entry.monthKey === monthFilter),
    [capacityPerDay, monthFilter],
  );

  const CAPACITY_PAGE_SIZE = 14;
  const totalCapacityPages = Math.max(
    1,
    Math.ceil(filteredCapacity.length / CAPACITY_PAGE_SIZE),
  );
  const safeCapacityPage = Math.min(capacityPage, totalCapacityPages);
  const pagedCapacity = filteredCapacity.slice(
    (safeCapacityPage - 1) * CAPACITY_PAGE_SIZE,
    safeCapacityPage * CAPACITY_PAGE_SIZE,
  );

  const summaryCards = [
    { title: "Total Orders", value: String(orders.length) },
    {
      title: "Active Queue",
      value: String(
        orders.filter((order) => isOpenOrderStatus(order.orderStatus)).length,
      ),
    },
    {
      title: "In Production",
      value: String(
        orders.filter(
          (order) =>
            normalizeOrderStatus(order.orderStatus) === "In Production",
        ).length,
      ),
    },
    {
      title: "Completed",
      value: String(
        orders.filter((order) =>
          ["Completed", "Delivery"].includes(
            normalizeOrderStatus(order.orderStatus),
          ),
        ).length,
      ),
    },
    {
      title: "Total Revenue",
      value: formatCurrency(
        orders.reduce((sum, order) => sum + (order.totalPrice || 0), 0),
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {summaryCards.map((card, index) => {
          const Icon = icons[index] ?? BarChart3;
          return (
            <Card key={card.title} className="rounded-2xl">
              <CardHeader className="p-5 pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--crumbella-muted)]">
                    {card.title}
                  </CardTitle>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--crumbella-border)] bg-[var(--crumbella-accent-soft)] text-[var(--crumbella-primary)]">
                    <Icon size={18} />
                  </span>
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-5 pt-0">
                <div className="text-3xl font-semibold text-[var(--foreground)]">
                  {card.value}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="rounded-2xl">
        <CardHeader className="p-5 pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm font-medium text-[var(--crumbella-muted)]">
              Production Capacity Harian
            </CardTitle>
            <select
              value={monthFilter}
              onChange={(event) => {
                setMonthFilter(event.target.value);
                setCapacityPage(1);
              }}
              className="h-9 min-w-40 rounded-lg border border-[var(--crumbella-border)] bg-white px-3 text-xs font-medium text-[var(--foreground)]"
            >
              <option value="all">Semua bulan</option>
              {monthOptions.map((month) => (
                <option key={month} value={month}>
                  {month}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 px-5 pb-5 pt-0 text-sm">
          {filteredCapacity.length === 0 ? (
            <p className="text-[var(--crumbella-muted)]">Belum ada data kapasitas produksi.</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-[var(--crumbella-border)]">
                <table className="w-full min-w-[620px] text-left text-xs">
                  <thead className="bg-[var(--crumbella-accent-soft)]/50 text-[11px] uppercase tracking-wide text-[var(--crumbella-muted)]">
                    <tr>
                      <th className="px-3 py-2">Tanggal</th>
                      <th className="px-3 py-2">Terpakai</th>
                      <th className="px-3 py-2">Sisa</th>
                      <th className="px-3 py-2">Sisa %</th>
                      <th className="px-3 py-2">Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedCapacity.map((entry) => (
                      <tr key={entry.date} className="border-t border-[var(--crumbella-border)]">
                        <td className="px-3 py-2 font-semibold text-[var(--foreground)]">
                          {entry.date}
                        </td>
                        <td className="px-3 py-2 text-[var(--foreground)]">
                          {entry.used}/{DAILY_PRODUCTION_TOKEN_LIMIT}
                        </td>
                        <td className="px-3 py-2 text-[var(--foreground)]">
                          {entry.remaining} token
                        </td>
                        <td className="px-3 py-2 font-semibold text-[var(--foreground)]">
                          {entry.remainingPercent}%
                        </td>
                        <td className="px-3 py-2">
                          <div className="h-2 w-full rounded-full bg-[var(--crumbella-border)]">
                            <div
                              className={`h-2 rounded-full ${
                                entry.remainingPercent <= 20
                                  ? "bg-[#a83030]"
                                  : entry.remainingPercent <= 40
                                    ? "bg-[#9a6b10]"
                                    : "bg-[#2a5c3f]"
                              }`}
                              style={{ width: `${entry.usagePercent}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs text-[var(--crumbella-muted)]">
                  Menampilkan {(safeCapacityPage - 1) * CAPACITY_PAGE_SIZE + 1}-
                  {Math.min(
                    safeCapacityPage * CAPACITY_PAGE_SIZE,
                    filteredCapacity.length,
                  )}{" "}
                  dari {filteredCapacity.length} hari
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCapacityPage((prev) => Math.max(1, prev - 1))}
                    disabled={safeCapacityPage <= 1}
                    className="rounded-md border border-[var(--crumbella-border)] px-2 py-1 text-xs font-semibold text-[var(--foreground)] disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <span className="text-xs font-semibold text-[var(--crumbella-muted)]">
                    {safeCapacityPage}/{totalCapacityPages}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setCapacityPage((prev) => Math.min(totalCapacityPages, prev + 1))
                    }
                    disabled={safeCapacityPage >= totalCapacityPages}
                    className="rounded-md border border-[var(--crumbella-border)] px-2 py-1 text-xs font-semibold text-[var(--foreground)] disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
