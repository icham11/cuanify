"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import GradientPageHeader from "@/components/bakery/shared/GradientPageHeader";
import { formatCurrency } from "@/components/orders/formatters";
import { useRole } from "@/context/RoleContext";
import {
  buildDailyOmzetSummaryCards,
  formatDailyOmzetPaymentStatusLabel,
  formatTimeWib,
} from "@/lib/admin/daily-omzet-shared";
import { useDailyOmzetSnapshot } from "@/lib/admin/use-daily-omzet-snapshot";
import {
  BarChart3,
  Coins,
  RefreshCcw,
  Wallet,
} from "lucide-react";

const SALES_PAGE_SIZE = 5;

export default function AdminDailyOmzetPage() {
  const { loading: roleLoading, isAdmin, isOwner } = useRole();
  const [currentSalesPage, setCurrentSalesPage] = useState(1);
  const canViewDailyOmzet = isAdmin || isOwner;
  const {
    data,
    error,
    fetchDailyOmzet,
    loading,
    refreshing,
    selectedDate,
    setSelectedDate,
  } = useDailyOmzetSnapshot({
    enabled: !roleLoading && canViewDailyOmzet,
  });

  const summaryCards = useMemo(() => {
    if (!data) return [];
    return buildDailyOmzetSummaryCards(data, formatCurrency);
  }, [data]);

  const totalSales = data?.sales.length ?? 0;
  const totalSalesPages = Math.max(1, Math.ceil(totalSales / SALES_PAGE_SIZE));
  const activeSalesPage = Math.min(currentSalesPage, totalSalesPages);

  const paginatedSales = useMemo(() => {
    if (!data) return [];

    const startIndex = (activeSalesPage - 1) * SALES_PAGE_SIZE;
    const endIndex = startIndex + SALES_PAGE_SIZE;
    return data.sales.slice(startIndex, endIndex);
  }, [activeSalesPage, data]);

  if (roleLoading || loading) {
    return (
      <div className="space-y-6 pb-10">
        <GradientPageHeader
          title="Omzet Harian"
          description="Memuat ringkasan penjualan booking hari ini..."
          icon={BarChart3}
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
          {Array.from({ length: 4 }).map((_, idx) => (
            <Card key={idx} className="rounded-xl shadow-sm">
              <CardContent className="px-6 py-6">
                <div className="h-4 w-28 animate-pulse rounded bg-gray-100" />
                <div className="mt-3 h-8 w-40 animate-pulse rounded bg-gray-100" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!canViewDailyOmzet) {
    return (
      <div className="space-y-6 pb-10">
        <GradientPageHeader
          title="Omzet Harian"
          description="Halaman ini khusus untuk role Owner dan Admin."
          icon={BarChart3}
        />
        <Card className="rounded-xl shadow-sm">
          <CardContent className="px-6 py-8 text-sm text-gray-600">
            Kamu tidak punya akses ke halaman ini.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6 pb-10">
        <GradientPageHeader
          title="Omzet Harian"
          description="Ringkasan booking hari ini"
          icon={BarChart3}
          actions={
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Tanggal
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  className="h-10 rounded-xl border border-[#dbe2ea] bg-white px-3 text-sm font-medium text-gray-900 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#334e68]"
                />
              </label>
              <button
                type="button"
                onClick={() => void fetchDailyOmzet(true)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
                disabled={refreshing}
              >
                <RefreshCcw
                  className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                />
                {refreshing ? "Menyegarkan..." : "Refresh"}
              </button>
            </div>
          }
        />
        <Card className="rounded-xl border border-amber-200 shadow-sm">
          <CardContent className="px-6 py-4 text-sm text-amber-800">
            Data belum tersedia. Silakan tekan refresh.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <GradientPageHeader
        title="Omzet Harian"
        description={
          `Ringkasan booking untuk ${data.businessDateLabel} (${data.timeZone})`
        }
        icon={BarChart3}
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Tanggal
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="h-10 rounded-xl border border-[#dbe2ea] bg-white px-3 text-sm font-medium text-gray-900 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#334e68]"
              />
            </label>
            <button
              type="button"
              onClick={() => void fetchDailyOmzet(true)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
              disabled={refreshing}
            >
              <RefreshCcw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Menyegarkan..." : "Refresh"}
            </button>
          </div>
        }
      />

      {error ? (
        <Card className="rounded-xl border border-rose-200 shadow-sm">
          <CardContent className="px-6 py-4 text-sm text-rose-700">{error}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
        {summaryCards.map((card) => {
          const Icon =
            card.key === "paymentsReceived"
              ? Wallet
              : card.key === "bookingSales"
                ? BarChart3
                : card.key === "pendingBalance"
                  ? RefreshCcw
                  : Coins;
          return (
            <Card key={card.title} className="rounded-xl shadow-sm">
              <CardHeader className="p-6 pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm font-medium text-gray-500">{card.title}</CardTitle>
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-50 text-indigo-700">
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                </div>
              </CardHeader>
              <CardContent className="px-6 pb-6 pt-0">
                <div className="text-2xl font-semibold text-gray-900">{card.value}</div>
                <div className="mt-1 text-xs text-gray-500">{card.hint}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="rounded-xl shadow-sm">
        <CardContent className="px-6 py-4 text-sm text-gray-600">
          Cara baca halaman ini: booking pada tanggal terpilih yang sudah dibayar (DP atau Lunas) langsung dihitung sebagai uang masuk sesuai nominal yang dibayarkan.
        </CardContent>
      </Card>

      <Card className="rounded-xl shadow-sm">
        <CardHeader className="p-6 pb-2">
          <CardTitle>Daftar Booking Dibayar Pada Tanggal Ini</CardTitle>
          <p className="text-xs text-gray-500">
            Booking yang menerima DP 50% atau pelunasan di tanggal terpilih akan muncul di sini.
          </p>
        </CardHeader>
        <CardContent className="px-6 pb-6 pt-0">
          {data?.sales.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="py-2 pr-4">Jam</th>
                    <th className="py-2 pr-4">Kode Booking</th>
                    <th className="py-2 pr-4">Customer</th>
                    <th className="py-2 pr-4">Status Bayar</th>
                    <th className="py-2 text-right">Total Pesanan</th>
                    <th className="py-2 text-right">Dibayar Hari Ini</th>
                    <th className="py-2 text-right">Sisa</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedSales.map((sale) => (
                    <tr key={sale.id} className="border-b border-gray-50">
                      <td className="py-2 pr-4 text-gray-600">{formatTimeWib(sale.createdAt)}</td>
                      <td className="py-2 pr-4 font-medium text-gray-800">
                        <Link
                          href={`/bakery/bookings/${sale.id}`}
                          className="text-indigo-700 underline decoration-indigo-200 underline-offset-2 transition hover:text-indigo-900"
                        >
                          {sale.reference}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 text-gray-600">{sale.customerName}</td>
                      <td className="py-2 pr-4 text-gray-600">
                        {formatDailyOmzetPaymentStatusLabel(sale.paymentStatus)}
                      </td>
                      <td className="py-2 text-right font-semibold text-gray-900">
                        {formatCurrency(sale.totalPrice)}
                      </td>
                      <td className="py-2 text-right font-semibold text-gray-900">
                        {formatCurrency(sale.totalPaidAmount)}
                      </td>
                      <td className="py-2 text-right font-semibold text-gray-900">
                        {formatCurrency(sale.remainingBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {totalSalesPages > 1 ? (
                <div className="mt-4 flex flex-col gap-2 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    Menampilkan {(activeSalesPage - 1) * SALES_PAGE_SIZE + 1}-
                    {Math.min(activeSalesPage * SALES_PAGE_SIZE, totalSales)} dari {totalSales} booking
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setCurrentSalesPage((prev) =>
                          Math.max(1, Math.min(prev, totalSalesPages) - 1),
                        )
                      }
                      disabled={activeSalesPage === 1}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Sebelumnya
                    </button>

                    <span className="text-xs font-medium text-gray-500">
                      Halaman {activeSalesPage} / {totalSalesPages}
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        setCurrentSalesPage((prev) =>
                          Math.min(totalSalesPages, Math.min(prev, totalSalesPages) + 1),
                        )
                      }
                      disabled={activeSalesPage === totalSalesPages}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Berikutnya
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/70 px-4 py-6 text-center text-sm text-gray-500">
              Belum ada pembayaran booking pada tanggal ini.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-gray-500">
        Terakhir diperbarui {data ? formatTimeWib(data.generatedAt) : "-"} WIB. Data diperbarui otomatis setiap 1 menit.
      </div>
    </div>
  );
}
