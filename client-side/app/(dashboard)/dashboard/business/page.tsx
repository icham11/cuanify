"use client";

import { useEffect, useMemo, useState } from "react";
import { useBusiness } from "@/context/BusinessContext";
import { useRole } from "@/context/RoleContext";
import { BAKERY_SETTINGS_UPDATED_EVENT } from "@/hooks/useBakerySettings";
import { apiFetch } from "@/lib/api/client";
import {
  calculateBakeryFinancialSummary,
  filterBakeryOrdersByDateRange,
} from "@/lib/bakery/financial-summary";
import type { BakeryBusinessSettings } from "@/lib/bakery/settings";
import type { Product } from "@/types/product";
import { ChevronDown, Download, Loader2, Menu, Trophy } from "lucide-react";

type BakerySettingsResponse = {
  data?: BakeryBusinessSettings;
};

type BakeryOrdersResponse = {
  data?: {
    orders?: Array<{
      deliveryDate?: string;
      product?: string;
      totalPrice?: number;
      totalPaidAmount?: number;
      dpPaidAmount?: number;
      finalPaidAmount?: number;
      paymentStatus?: string;
      orderStatus?: string;
      paymentTransactions?: Array<{
        timestamp?: string;
        amount?: number;
        type?: string;
      }>;
      createdAt?: string;
      updatedAt?: string;
      items?: Array<{
        productName?: string;
        size?: string;
        quantity?: number;
        basePrice?: number;
        selectedPrice?: number;
        lineTotal?: number;
      }>;
    }>;
  };
};

type ProductsResponse = {
  data?: Product[];
};

type TopProductView = {
  productName: string;
  quantitySold: number;
  revenue: number;
};

type ViewState = {
  viewerName: string;
  businessName: string;
  businessLocation: string;
  currentRevenue: number;
  currentProfit: number;
  previousRevenue: number;
  totalCost: number;
  avgMargin: number;
  totalSalesCount: number;
  paidSalesCount: number;
  topProducts: TopProductView[];
  bakerySettings: BakeryBusinessSettings | null;
};

const EMPTY_VIEW_STATE: ViewState = {
  viewerName: "",
  businessName: "",
  businessLocation: "",
  currentRevenue: 0,
  currentProfit: 0,
  previousRevenue: 0,
  totalCost: 0,
  avgMargin: 0,
  totalSalesCount: 0,
  paidSalesCount: 0,
  topProducts: [],
  bakerySettings: null,
};

const BUSINESS_VIEW_CACHE = new Map<
  string,
  { value: ViewState; cachedAt: number }
>();

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(Math.round(Number(value || 0)));
}

function formatCompactRupiah(value: number) {
  const amount = Math.round(Number(value || 0));
  const absoluteAmount = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";

  if (absoluteAmount >= 1_000_000_000) {
    return `${sign}Rp${(absoluteAmount / 1_000_000_000).toFixed(1).replace(".0", "")}M`;
  }
  if (absoluteAmount >= 1_000_000) {
    return `${sign}Rp${(absoluteAmount / 1_000_000).toFixed(1).replace(".0", "")}jt`;
  }
  if (absoluteAmount >= 1_000) {
    return `${sign}Rp${(absoluteAmount / 1_000).toFixed(0)}rb`;
  }
  return `${sign}Rp${absoluteAmount}`;
}

function formatSignedCurrency(value: number) {
  const amount = Math.round(Math.abs(Number(value || 0)));
  return `${value >= 0 ? "+" : "-"}${formatCurrency(amount)}`;
}

function getMonthKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function getMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

function getMonthRange(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const end = new Date(year, month, 0);
  return {
    startDate: `${year}-${String(month).padStart(2, "0")}-01`,
    endDate: `${year}-${String(month).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`,
    prevMonthKey: getMonthKey(new Date(year, month - 2, 1)),
  };
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function getRankEmoji(index: number) {
  if (index === 0) return "#1";
  if (index === 1) return "#2";
  if (index === 2) return "#3";
  return `#${index + 1}`;
}

function buildExportCsv(args: {
  monthLabel: string;
  businessName: string;
  revenue: number;
  totalCost: number;
  profit: number;
  activeOrders: number;
  margin: number;
  topProducts: Array<{
    productName: string;
    quantitySold: number;
    revenue: number;
  }>;
}) {
  const rows = [
    ["Business", args.businessName],
    ["Periode", args.monthLabel],
    ["Revenue", String(args.revenue)],
    ["COGS/HPP", String(args.totalCost)],
    ["Profit Bersih", String(args.profit)],
    ["Order Aktif", String(args.activeOrders)],
    ["Margin Kotor", String(args.margin)],
    [],
    ["Top Produk", "Order", "Revenue"],
    ...args.topProducts.map((item) => [
      item.productName,
      String(item.quantitySold),
      String(item.revenue),
    ]),
  ];

  return rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\n");
}

function didRequestFail(payload: unknown): boolean {
  return payload === null;
}

async function safeApiFetch<T>(
  path: string,
  timeoutMs = 15000,
): Promise<T | null> {
  try {
    return (await apiFetch(path, undefined, timeoutMs)) as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.warn(`Fetch timeout for ${path} after ${timeoutMs}ms`);
    } else {
      console.error(`Failed to fetch ${path}`, error);
    }
    return null;
  }
}

function BreakdownRow({
  label,
  note,
  amount,
  tone = "negative",
  children,
}: {
  label: string;
  note?: string;
  amount: number;
  tone?: "positive" | "negative" | "profit";
  children?: React.ReactNode;
}) {
  const amountClassName =
    tone === "positive"
      ? "text-[#17653d]"
      : tone === "profit"
        ? amount >= 0
          ? "text-[#17653d] font-extrabold"
          : "text-[#c85d34] font-extrabold"
        : "text-[#c85d34]";

  return (
    <div
      className={`px-4 py-3 ${
        tone === "profit"
          ? amount >= 0
            ? "bg-[#e4f4ee]"
            : "bg-[#fff1ec]"
          : "border-b border-[#ead8cb]"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p
            className={`text-[15px] leading-tight ${
              tone === "profit"
                ? amount >= 0
                  ? "font-bold text-[#17653d]"
                  : "font-bold text-[#c85d34]"
                : "text-[#23150f]"
            }`}
          >
            {label}
          </p>
          {note ? (
            <p className="mt-1 text-[11px] leading-tight text-[#b58872]">
              {note}
            </p>
          ) : null}
        </div>
        <p
          className={`shrink-0 font-mono text-[14px] leading-tight ${amountClassName}`}
        >
          {formatSignedCurrency(
            tone === "positive" || tone === "profit"
              ? amount
              : -Math.abs(amount),
          )}
        </p>
      </div>
      {children ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}

export default function BusinessPage() {
  const { business, loading: businessLoading } = useBusiness();
  const { userName } = useRole();
  const [selectedMonth, setSelectedMonth] = useState(getMonthKey(new Date()));
  const [viewState, setViewState] = useState<ViewState>(EMPTY_VIEW_STATE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const monthOptions = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
      const value = getMonthKey(date);
      return { value, label: getMonthLabel(value) };
    });
  }, []);

  const reloadKey = useMemo(() => BAKERY_SETTINGS_UPDATED_EVENT, []);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    const handleSettingsUpdated = () => {
      setRefreshToken((current) => current + 1);
    };

    window.addEventListener(reloadKey, handleSettingsUpdated);
    return () => {
      window.removeEventListener(reloadKey, handleSettingsUpdated);
    };
  }, [reloadKey]);

  useEffect(() => {
    if (!business?.id) return;

    let active = true;

    const load = async () => {
      const cacheKey = `${business.id}:${selectedMonth}`;
      const cachedEntry = BUSINESS_VIEW_CACHE.get(cacheKey);

      if (cachedEntry) {
        setViewState(cachedEntry.value);
        setLoading(false);
      } else {
        setLoading(true);
      }
      setError(null);

      const currentRange = getMonthRange(selectedMonth);
      const previousRange = getMonthRange(currentRange.prevMonthKey);

      const [
        bakerySettingsPayload,
        ordersPayload,
        productsPayload,
      ] = await Promise.all([
        safeApiFetch<BakerySettingsResponse>("/api/bakery/settings"),
        safeApiFetch<BakeryOrdersResponse>("/api/bookings/orders?mode=financial"),
        safeApiFetch<ProductsResponse>("/api/products?mode=financial&limit=999"),
      ]);

      if (!active) return;

      const ordersRequestFailed = didRequestFail(ordersPayload);
      const productsRequestFailed = didRequestFail(productsPayload);

      const bakerySettings = bakerySettingsPayload?.data ?? null;
      const orders = ordersPayload?.data?.orders ?? [];
      const products = productsPayload?.data ?? [];
      const deliveryRangeOrders = filterBakeryOrdersByDateRange(
        orders,
        currentRange.startDate,
        currentRange.endDate,
      );
      const currentSummary = calculateBakeryFinancialSummary({
        orders,
        products,
        settings: bakerySettings,
        fromDate: currentRange.startDate,
        toDate: currentRange.endDate,
      });
      const previousSummary = calculateBakeryFinancialSummary({
        orders,
        products,
        settings: bakerySettings,
        fromDate: previousRange.startDate,
        toDate: previousRange.endDate,
      });

      const currentRevenue = currentSummary.totalRevenue;
      const currentProfit = currentSummary.grossProfit;
      const totalCost = currentSummary.cogsCost;
      const previousRevenue = previousSummary.totalRevenue;
      const avgMargin =
        currentRevenue > 0
          ? (currentProfit / currentRevenue) * 100
          : 0;

      const nextViewState: ViewState = {
        viewerName: userName?.trim() || "",
        businessName: business.name,
        businessLocation: business.location || "",
        currentRevenue,
        currentProfit,
        previousRevenue,
        totalCost,
        avgMargin,
        totalSalesCount: deliveryRangeOrders.length,
        paidSalesCount: deliveryRangeOrders.filter((order) => {
          const totalPaid = Number(order.totalPaidAmount ?? 0);
          const fallbackPaid =
            Number(order.dpPaidAmount ?? 0) + Number(order.finalPaidAmount ?? 0);
          return totalPaid > 0 || fallbackPaid > 0;
        }).length,
        topProducts: currentSummary.topProducts,
        bakerySettings,
      };
      BUSINESS_VIEW_CACHE.set(cacheKey, {
        value: nextViewState,
        cachedAt: Date.now(),
      });
      setViewState(nextViewState);

      const hasPrimaryData =
        Boolean(business?.id) ||
        currentRevenue > 0 ||
        currentProfit > 0 ||
        deliveryRangeOrders.length > 0 ||
        currentSummary.paidOrdersCount > 0 ||
        currentSummary.topProducts.length > 0;
      const hasBackendFailure =
        ordersRequestFailed ||
        productsRequestFailed;

      setError(
        hasBackendFailure && !hasPrimaryData
          ? "Data business belum berhasil dimuat dari backend untuk periode ini."
          : null,
      );
      setLoading(false);
    };

    void load();

    return () => {
      active = false;
    };
  }, [business?.id, business?.name, business?.location, selectedMonth, refreshToken, userName]);

  const monthLabel = useMemo(
    () => getMonthLabel(selectedMonth),
    [selectedMonth],
  );
  const previousMonthLabel = useMemo(() => {
    const { prevMonthKey } = getMonthRange(selectedMonth);
    return getMonthLabel(prevMonthKey);
  }, [selectedMonth]);

  const revenueGrowth = useMemo(() => {
    if (viewState.previousRevenue <= 0) {
      return viewState.currentRevenue > 0 ? 100 : 0;
    }
    return (
      ((viewState.currentRevenue - viewState.previousRevenue) /
        viewState.previousRevenue) *
      100
    );
  }, [viewState.currentRevenue, viewState.previousRevenue]);

  const selectedMonthExpenses = (
    viewState.bakerySettings?.monthlyExpenses ?? []
  ).filter((entry) => entry.monthKey === selectedMonth);
  const expenseAmountByCategory = new Map(
    selectedMonthExpenses.map((entry) => [
      entry.category,
      Number(entry.amount || 0),
    ]),
  );
  const customExpenses = selectedMonthExpenses.filter(
    (entry) => entry.category === "custom",
  );
  const staffPayrollRows = (
    viewState.bakerySettings?.staffSettings ?? []
  ).filter((entry) => entry.isActive);
  const staffCost = staffPayrollRows.reduce(
    (sum, entry) => sum + Number(entry.takeHomePay || 0),
    0,
  );
  const refundCost = Number(expenseAmountByCategory.get("refund") ?? 0);
  const adsCost = Number(expenseAmountByCategory.get("ads") ?? 0);
  const customExpenseTotal = customExpenses.reduce(
    (sum, entry) => sum + Number(entry.amount || 0),
    0,
  );
  const totalOperationalCost =
    staffCost + refundCost + adsCost + customExpenseTotal;
  const netProfit = viewState.currentProfit - totalOperationalCost;
  const avatarLabel = getInitials(
    `${viewState.viewerName || "Owner"} ${viewState.businessName || ""}`,
  );

  const handleExport = () => {
    const csv = buildExportCsv({
      monthLabel,
      businessName: viewState.businessName || "Business",
      revenue: viewState.currentRevenue,
      totalCost: viewState.totalCost,
      profit: netProfit,
      activeOrders: viewState.paidSalesCount,
      margin: viewState.avgMargin,
      topProducts: viewState.topProducts,
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `business-${selectedMonth}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (businessLoading || loading) {
    return (
      <div className="min-h-[60vh] px-4 py-6">
        <div className="mx-auto flex max-w-3xl items-center justify-center rounded-[28px] border border-[#dac8ba] bg-[#f7efe7] px-6 py-20 shadow-[0_12px_35px_rgba(84,56,36,0.08)]">
          <Loader2 className="mr-3 h-5 w-5 animate-spin text-[#c86030]" />
          <span className="text-sm font-medium text-[#6b4a38]">
            Memuat ringkasan business...
          </span>
        </div>
      </div>
    );
  }

  if (!business?.id) {
    return (
      <div className="min-h-[60vh] px-4 py-6">
        <div className="mx-auto max-w-3xl rounded-[28px] border border-[#dac8ba] bg-[#f7efe7] px-6 py-10 text-center shadow-[0_12px_35px_rgba(84,56,36,0.08)]">
          <p className="text-sm font-semibold text-[#6b4a38]">
            Tidak ada business aktif.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-3 pb-10 pt-4 text-[#23150f] sm:px-4">
      <div className="overflow-hidden rounded-[34px] border border-[#e4d2c4] bg-[#f8efe5] px-4 pb-6 pt-3 shadow-[0_26px_55px_-42px_rgba(94,53,30,0.6)] sm:px-5 xl:px-6">
      <div className="overflow-hidden rounded-[30px] border border-[#dcc8b8] bg-[#f7efe7] shadow-[0_14px_36px_rgba(84,56,36,0.10)]">
        <div className="flex flex-wrap items-center gap-3 border-b border-[#e5d4c7] px-5 py-4">
          <button
            type="button"
            className="rounded-full p-2 text-[#7d553f] transition hover:bg-[#efe3d8]"
            aria-label="Business menu"
          >
            <Menu size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-[26px] font-extrabold leading-none tracking-[-0.03em] text-[#1f120e]">
              Business
            </h1>
            <p className="mt-1 truncate text-[12px] text-[#bf8c73]">
              {viewState.businessName}
              {viewState.viewerName ? ` / ${viewState.viewerName}` : ""}
            </p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f0d6c2] text-sm font-bold text-[#a24d22]">
            {avatarLabel || "BS"}
          </div>
        </div>

        <div className="space-y-5 px-4 py-4 sm:px-5 lg:px-6">
          <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
            <label className="relative flex-1">
              <select
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
                className="h-11 w-full appearance-none rounded-xl border border-[#dbcabc] bg-white px-3 pr-10 text-sm font-semibold text-[#23150f] shadow-[0_2px_8px_rgba(84,56,36,0.06)] outline-none transition focus:border-[#d88a5d]"
              >
                {monthOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={16}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#b58872]"
              />
            </label>
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#c86030] px-4 text-sm font-bold text-white shadow-[0_6px_18px_rgba(200,96,48,0.28)] transition hover:bg-[#b85628]"
            >
              <Download size={15} />
              Export
            </button>
          </div>

          <section className="overflow-hidden rounded-[18px] border border-[#dbcabc] bg-white shadow-[0_2px_10px_rgba(84,56,36,0.06)]">
            <div className="grid grid-cols-1 divide-y divide-[#ead8cb] px-4 py-4 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              <div className="pr-3">
                <p className="text-[11px] text-[#b58872]">Total Revenue</p>
                <p className="mt-1 text-[20px] font-extrabold leading-none text-[#1f120e]">
                  {formatCompactRupiah(viewState.currentRevenue)}
                </p>
                <p
                  className={`mt-2 text-[11px] font-semibold ${
                    revenueGrowth >= 0 ? "text-[#17653d]" : "text-[#c85d34]"
                  }`}
                >
                  {revenueGrowth >= 0 ? "+" : "-"}{" "}
                  {`${revenueGrowth >= 0 ? "+" : ""}${Math.round(revenueGrowth)}%`}{" "}
                  vs {previousMonthLabel}
                </p>
              </div>
              <div className="pt-4 sm:pl-3 sm:pt-0">
                <p className="text-[11px] text-[#b58872]">Profit Bersih</p>
                <p
                  className={`mt-1 text-[20px] font-extrabold leading-none ${
                    netProfit >= 0 ? "text-[#17653d]" : "text-[#c85d34]"
                  }`}
                >
                  {formatCompactRupiah(netProfit)}
                </p>
                <p className="mt-2 text-[11px] text-[#b58872]">
                  setelah semua biaya yang tersedia
                </p>
              </div>
            </div>
            <div className="border-t border-[#ead8cb] bg-[#fff8f3] px-4 py-3">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#7d675a]">
                <span className="font-semibold text-[#1f120e]">
                  Sales:
                </span>
                <span className="rounded-full bg-[#fbf0d8] px-2.5 py-1 font-semibold text-[#9a6b10]">
                  Total {viewState.totalSalesCount}
                </span>
                <span className="rounded-full bg-[#e4f4ee] px-2.5 py-1 font-semibold text-[#17653d]">
                  Paid {viewState.paidSalesCount}
                </span>
              </div>
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]">
            <section className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[28px] font-extrabold leading-none tracking-[-0.03em] text-[#1f120e]">
                  Rincian Biaya
                </h2>
                {viewState.businessLocation ? (
                  <span className="text-[11px] font-medium text-[#bf8c73]">
                    {viewState.businessLocation}
                  </span>
                ) : null}
              </div>

            <div className="overflow-hidden rounded-[18px] border border-[#dbcabc] bg-white shadow-[0_2px_10px_rgba(84,56,36,0.06)]">
              <BreakdownRow
                label="Revenue"
                amount={viewState.currentRevenue}
                tone="positive"
              />
              <BreakdownRow
                label="COGS / HPP"
                note="Otomatis dari produk"
                amount={viewState.totalCost}
              />
              <BreakdownRow
                label="Gaji Staff"
                note={
                  staffPayrollRows.length > 0
                    ? "Payroll bulanan aktif"
                    : "Belum ada payroll aktif"
                }
                amount={staffCost}
              >
                {staffPayrollRows.length > 0 ? (
                  <div className="space-y-1 border-l-2 border-[#ead8cb] pl-3">
                    {staffPayrollRows.slice(0, 4).map((entry) => (
                      <div
                        key={entry.userId}
                        className="flex items-center justify-between gap-3 text-[11px] text-[#7d675a]"
                      >
                        <span className="truncate">{entry.name}</span>
                        <span className="font-mono">
                          {formatCurrency(Number(entry.takeHomePay || 0))}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </BreakdownRow>
              <BreakdownRow
                label="Retur / Refund"
                note="Input bulanan owner"
                amount={refundCost}
              />
              <BreakdownRow
                label="Biaya Iklan"
                note="Input bulanan owner"
                amount={adsCost}
              />
              {customExpenses.length > 0 ? (
                customExpenses.map((entry) => (
                  <BreakdownRow
                    key={entry.id}
                    label={entry.name}
                    note={entry.note || "Custom / Input bulanan"}
                    amount={Number(entry.amount || 0)}
                  />
                ))
              ) : (
                <BreakdownRow
                  label="Packaging Tambahan"
                  note="Custom / Input bulanan"
                  amount={0}
                />
              )}
              <BreakdownRow
                label="Profit Bersih"
                amount={netProfit}
                tone="profit"
              />
            </div>
            </section>

            <aside className="space-y-5">
              <section className="grid grid-cols-2 gap-3 sm:grid-cols-2">
                <div className="rounded-[18px] border border-[#dbcabc] bg-white px-4 py-4 shadow-[0_2px_10px_rgba(84,56,36,0.06)]">
                  <p className="text-[11px] text-[#7d675a]">Sales Tercatat</p>
                  <p className="mt-1 text-[22px] font-extrabold leading-none text-[#1f120e]">
                    {viewState.totalSalesCount}
                  </p>
                </div>
                <div className="rounded-[18px] border border-[#dbcabc] bg-white px-4 py-4 shadow-[0_2px_10px_rgba(84,56,36,0.06)]">
                  <p className="text-[11px] text-[#7d675a]">Margin Kotor</p>
                  <p className="mt-1 text-[22px] font-extrabold leading-none text-[#17653d]">
                    {Math.round(viewState.avgMargin)}%
                  </p>
                </div>
              </section>

              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="inline-flex items-center gap-2 text-[28px] font-extrabold leading-none tracking-[-0.03em] text-[#1f120e]">
                    <Trophy size={18} className="text-[#cc8a27]" />
                    Top Produk
                  </h2>
                  <span className="text-[12px] font-semibold text-[#b0663f]">
                    by Revenue
                  </span>
                </div>

                <div className="overflow-hidden rounded-[18px] border border-[#dbcabc] bg-white shadow-[0_2px_10px_rgba(84,56,36,0.06)]">
                  {viewState.topProducts.length > 0 ? (
                    viewState.topProducts.slice(0, 5).map((item, index) => (
                      <div
                        key={`${item.productName}-${index}`}
                        className={`flex items-center gap-3 px-4 py-3 ${
                          index < Math.min(viewState.topProducts.length, 5) - 1
                            ? "border-b border-[#ead8cb]"
                            : ""
                        }`}
                      >
                        <div className="text-base">{getRankEmoji(index)}</div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-bold leading-tight text-[#1f120e]">
                            {item.productName}
                          </p>
                          <p className="mt-1 text-[11px] text-[#7d675a]">
                            {item.quantitySold} order
                          </p>
                        </div>
                        <p className="shrink-0 font-mono text-[14px] font-bold text-[#c86030]">
                          {formatCurrency(item.revenue)}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-8 text-center text-sm text-[#9b7b69]">
                      Belum ada data produk untuk {monthLabel}.
                    </div>
                  )}
                </div>
              </section>
            </aside>
          </div>

          {error ? (
            <div className="rounded-2xl border border-[#f1c5b8] bg-[#fff1eb] px-4 py-3 text-sm text-[#a54a2d]">
              {error}
            </div>
          ) : null}
        </div>
      </div>
      </div>
    </div>
  );
}
