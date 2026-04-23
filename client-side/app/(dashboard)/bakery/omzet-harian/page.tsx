"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import GradientPageHeader from "@/components/bakery/shared/GradientPageHeader";
import { formatCurrency } from "@/components/orders/formatters";
import { useRole } from "@/context/RoleContext";
import {
  BarChart3,
  CalendarClock,
  Coins,
  ReceiptText,
  RefreshCcw,
} from "lucide-react";

type PaymentStatus = "Paid" | "DP Paid" | "Pending" | "Unknown";

interface DailyOmzetData {
  businessDate: string;
  businessDateLabel: string;
  timeZone: string;
  generatedAt: string;
  summary: {
    bookingCountCreatedToday: number;
    fullyPaidBookingCountCreatedToday: number;
    bookingSalesCreatedToday: number;
    pendingFromCreatedToday: number;
    paymentReceiptCountToday: number;
    dpReceivedToday: number;
    finalReceivedToday: number;
    totalPaymentsReceived: number;
  };
  reconciliation: {
    bakery: {
      bookingSalesCreatedToday: number;
      pendingSalesToday: number;
      paymentsReceivedToday: number;
      paymentReceiptCountToday: number;
    };
    deltaPaymentsMinusBookingSales: number;
  };
  sales: Array<{
    id: string;
    reference: string;
    customerName: string;
    paymentStatus: PaymentStatus;
    totalPrice: number;
    totalPaidAmount: number;
    remainingBalance: number;
    createdAt: string;
  }>;
  payments: Array<{
    id: string;
    reference: string;
    customerName: string;
    amount: number;
    paymentType: "DP" | "Final";
    note?: string;
    createdAt: string;
  }>;
}

const BUSINESS_TIME_ZONE = "Asia/Jakarta";
const SALES_PAGE_SIZE = 5;

function getJakartaDateKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTimeWib(dateIso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: BUSINESS_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(dateIso));
}

function formatPaymentStatusLabel(status: PaymentStatus): string {
  if (status === "Paid") return "Lunas";
  if (status === "DP Paid") return "DP";
  if (status === "Pending") return "Belum Bayar";
  return "-";
}

export default function AdminDailyOmzetPage() {
  const { loading: roleLoading, isAdmin, isOwner } = useRole();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<DailyOmzetData | null>(null);
  const [currentSalesPage, setCurrentSalesPage] = useState(1);
  const [selectedDate, setSelectedDate] = useState(() => toDateInputValue(new Date()));
  const dateKeyRef = useRef<string>(getJakartaDateKey());
  const canViewDailyOmzet = isAdmin || isOwner;

  const fetchDailyOmzet = useCallback(async (silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await fetch(
        `/api/admin/daily-omzet?date=${encodeURIComponent(selectedDate)}`,
        {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        },
      );

      const payload = (await response.json()) as {
        success?: boolean;
        data?: DailyOmzetData;
        error?: string;
      };

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || "Gagal memuat data omzet harian");
      }

      setData(payload.data);
      setError("");
      dateKeyRef.current = selectedDate;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal memuat data omzet harian",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    if (roleLoading || !canViewDailyOmzet) {
      if (!roleLoading) {
        setLoading(false);
      }
      return;
    }

    void fetchDailyOmzet(false);
  }, [canViewDailyOmzet, fetchDailyOmzet, roleLoading]);

  useEffect(() => {
    if (roleLoading || !canViewDailyOmzet) return;

    const timer = window.setInterval(() => {
      const currentDateKey = getJakartaDateKey();
      if (selectedDate === currentDateKey || currentDateKey !== dateKeyRef.current) {
        dateKeyRef.current = selectedDate;
        void fetchDailyOmzet(true);
      }
    }, 60_000);

    return () => window.clearInterval(timer);
  }, [canViewDailyOmzet, fetchDailyOmzet, roleLoading, selectedDate]);

  useEffect(() => {
    if (roleLoading || !canViewDailyOmzet) return;

    const handleFocus = () => {
      void fetchDailyOmzet(true);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void fetchDailyOmzet(true);
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [canViewDailyOmzet, fetchDailyOmzet, roleLoading]);

  const summaryCards = useMemo(() => {
    if (!data) return [];

    const paidBookingCount = data.sales.filter((sale) => sale.totalPaidAmount > 0)
      .length;
    const fullyPaidBookingCount = data.sales.filter(
      (sale) => sale.totalPaidAmount > 0 && sale.remainingBalance <= 0,
    ).length;
    const dpReceiptCount = data.payments.filter(
      (payment) => payment.paymentType === "DP" && payment.amount > 0,
    ).length;
    const finalReceiptCount = data.payments.filter(
      (payment) => payment.paymentType === "Final" && payment.amount > 0,
    ).length;

    return [
      {
        title: "Uang Masuk Hari Ini",
        value: formatCurrency(data.summary.totalPaymentsReceived),
        hint: `${paidBookingCount} booking menerima pembayaran di tanggal ini`,
        icon: ReceiptText,
      },
      {
        title: "Total Pesanan Hari Ini",
        value: formatCurrency(data.summary.bookingSalesCreatedToday),
        hint: `${data.summary.bookingCountCreatedToday} booking dibuat hari ini`,
        icon: BarChart3,
      },
      {
        title: "Sisa Belum Lunas Hari Ini",
        value: formatCurrency(data.summary.pendingFromCreatedToday),
        hint: "Sisa dari booking hari ini yang belum lunas",
        icon: CalendarClock,
      },
      {
        title: "Booking Lunas di Tanggal Ini",
        value: `${fullyPaidBookingCount} booking`,
        hint: `${dpReceiptCount} transaksi DP, ${finalReceiptCount} transaksi pelunasan`,
        icon: Coins,
      },
    ];
  }, [data]);

  const totalSales = data?.sales.length ?? 0;
  const totalSalesPages = Math.max(1, Math.ceil(totalSales / SALES_PAGE_SIZE));

  const paginatedSales = useMemo(() => {
    if (!data) return [];

    const startIndex = (currentSalesPage - 1) * SALES_PAGE_SIZE;
    const endIndex = startIndex + SALES_PAGE_SIZE;
    return data.sales.slice(startIndex, endIndex);
  }, [data, currentSalesPage]);

  useEffect(() => {
    setCurrentSalesPage((prev) => Math.min(prev, totalSalesPages));
  }, [totalSalesPages]);

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
          const Icon = card.icon;
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
                      <td className="py-2 pr-4 text-gray-600">{formatPaymentStatusLabel(sale.paymentStatus)}</td>
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
                    Menampilkan {(currentSalesPage - 1) * SALES_PAGE_SIZE + 1}-
                    {Math.min(currentSalesPage * SALES_PAGE_SIZE, totalSales)} dari {totalSales} booking
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setCurrentSalesPage((prev) => Math.max(1, prev - 1))
                      }
                      disabled={currentSalesPage === 1}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Sebelumnya
                    </button>

                    <span className="text-xs font-medium text-gray-500">
                      Halaman {currentSalesPage} / {totalSalesPages}
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        setCurrentSalesPage((prev) =>
                          Math.min(totalSalesPages, prev + 1),
                        )
                      }
                      disabled={currentSalesPage === totalSalesPages}
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
