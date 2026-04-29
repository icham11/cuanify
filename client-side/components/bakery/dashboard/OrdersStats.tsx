"use client";

import { useMemo, useState } from "react";
import { endOfMonth, startOfMonth } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/components/orders/formatters";
import { useOrders } from "@/components/bakery/store";
import { useCalendarCapacity } from "@/hooks/useCalendarCapacity";
import {
  DAILY_PRODUCTION_TOKEN_LIMIT,
} from "@/lib/bookings/operations";
import {
  isOpenOrderStatus,
  normalizeOrderStatus,
} from "@/lib/bookings/order-status";
import { getJakartaTodayIsoDate } from "@/lib/bookings/shipping-schedule";
import { normalizeDateInput, parseSafeDate } from "@/lib/helpers/date-normalization";
import {
  BarChart3,
  CheckCircle2,
  Factory,
  PackageCheck,
  Wallet,
} from "lucide-react";

const icons = [BarChart3, CheckCircle2, Factory, PackageCheck, Wallet];

function getCapacityRangeFromOrders(orders: ReturnType<typeof useOrders>["orders"]) {
  const today = parseSafeDate(getJakartaTodayIsoDate()) ?? new Date();
  const candidateDates: Date[] = [today];

  for (const order of orders) {
    const normalized = normalizeDateInput((order.deliveryDate || "").trim());
    const parsed = normalized ? parseSafeDate(normalized) : null;
    if (parsed) {
      candidateDates.push(parsed);
    }
  }

  let start = startOfMonth(today);
  let end = endOfMonth(today);

  for (const date of candidateDates) {
    if (date < start) start = date;
    if (date > end) end = date;
  }

  return { start, end };
}

export default function OrdersStats() {
  const { orders } = useOrders();
  const [monthFilter, setMonthFilter] = useState("all");
  const [capacityPage, setCapacityPage] = useState(1);

  const capacityRange = useMemo(
    () => getCapacityRangeFromOrders(orders),
    [orders],
  );
  const { capacityMap, getCapacity } = useCalendarCapacity(
    capacityRange.start,
    capacityRange.end,
  );

  const capacityPerDay = useMemo(
    () =>
      Array.from(capacityMap.values())
        .sort((left, right) => right.date.localeCompare(left.date))
        .map((entry) => {
          const safeUsed = Math.max(0, Math.round(entry.usedToken));
          const safeMax = Math.max(1, Math.round(entry.maxToken));
          const remaining = Math.max(0, safeMax - safeUsed);
          const remainingPercent = Math.max(
            0,
            Math.round((remaining / safeMax) * 100),
          );
          return {
            date: entry.date,
            monthKey: entry.date.slice(0, 7),
            remaining,
            used: safeUsed,
            remainingPercent,
            usagePercent: Math.min(
              100,
              Math.round((safeUsed / safeMax) * 100),
            ),
            maxToken: safeMax,
          };
        }),
    [capacityMap],
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

  const todayIso = getJakartaTodayIsoDate();
  const todayCapacityRaw = getCapacity(todayIso);
  const todayCapacity = {
    remaining: Math.max(0, todayCapacityRaw.maxToken - todayCapacityRaw.usedToken),
    remainingPercent: Math.max(
      0,
      Math.round(
        ((Math.max(0, todayCapacityRaw.maxToken - todayCapacityRaw.usedToken)) /
          Math.max(1, todayCapacityRaw.maxToken)) *
          100,
      ),
    ),
  };

  summaryCards.push({
    title: "Today Capacity",
    value: `${todayCapacity.remainingPercent}% (${todayCapacity.remaining} tokens left)`,
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {summaryCards.map((card, index) => {
          const Icon = icons[index] ?? BarChart3;
          return (
            <Card key={card.title} className="rounded-xl shadow-sm">
              <CardHeader className="p-6 pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-gray-500">
                    {card.title}
                  </CardTitle>
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                    <Icon size={18} />
                  </span>
                </div>
              </CardHeader>
              <CardContent className="px-6 pb-6 pt-0">
                <div className="text-3xl font-semibold text-gray-900">
                  {card.value}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="rounded-xl shadow-sm">
        <CardHeader className="p-6 pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Production Capacity Harian
            </CardTitle>
            <select
              value={monthFilter}
              onChange={(event) => {
                setMonthFilter(event.target.value);
                setCapacityPage(1);
              }}
              className="h-9 min-w-40 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700"
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
        <CardContent className="space-y-3 px-6 pb-6 pt-0 text-sm">
          {filteredCapacity.length === 0 ? (
            <p className="text-gray-500">Belum ada data kapasitas produksi.</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full min-w-[620px] text-left text-xs">
                  <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
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
                      <tr key={entry.date} className="border-t border-gray-100">
                        <td className="px-3 py-2 font-semibold text-gray-800">
                          {entry.date}
                        </td>
                        <td className="px-3 py-2 text-gray-700">
                          {entry.used}/{entry.maxToken ?? DAILY_PRODUCTION_TOKEN_LIMIT}
                        </td>
                        <td className="px-3 py-2 text-gray-700">
                          {entry.remaining} token
                        </td>
                        <td className="px-3 py-2 font-semibold text-gray-800">
                          {entry.remainingPercent}%
                        </td>
                        <td className="px-3 py-2">
                          <div className="h-2 w-full rounded-full bg-gray-100">
                            <div
                              className={`h-2 rounded-full ${
                                entry.remainingPercent <= 20
                                  ? "bg-rose-500"
                                  : entry.remainingPercent <= 40
                                    ? "bg-amber-500"
                                    : "bg-emerald-500"
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
                <p className="text-xs text-gray-500">
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
                    className="rounded-md border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-700 disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <span className="text-xs font-semibold text-gray-600">
                    {safeCapacityPage}/{totalCapacityPages}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setCapacityPage((prev) => Math.min(totalCapacityPages, prev + 1))
                    }
                    disabled={safeCapacityPage >= totalCapacityPages}
                    className="rounded-md border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-700 disabled:opacity-40"
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
