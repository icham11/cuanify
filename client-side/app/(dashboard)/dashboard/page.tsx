"use client";

import { useEffect, useState } from "react";
import RevenueChart from "../components/charts/RevenueChart";
import { TrendingUp, AlertTriangle, Smile } from "lucide-react";
import { apiFetch, peekApiCache } from "@/lib/api/client";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(value);

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Morning";
  if (hour < 18) return "Afternoon";
  return "Evening";
}

interface AlertItem {
  name: string;
  expirationDate?: string;
  currentStock?: number;
  minStock?: number;
}

interface InventoryBatch {
  expirationDate?: string;
}

interface Ingredient {
  name: string;
  currentStock: number;
  minStock: number;
  inventoryBatches?: InventoryBatch[];
}

type SalesSummaryResponse = {
  success?: boolean;
  data?: {
    summary?: {
      totalRevenue?: number;
      transactionCount?: number;
      totalProfit?: number;
    };
  };
};

type IngredientsResponse = {
  success?: boolean;
  data?: Ingredient[];
};

export default function DashboardPage() {
  // const router = useRouter(); // Unused, remove

  const [greeting, setGreeting] = useState("");
  const [todayRevenue, setTodayRevenue] = useState<number>(0);
  const [todayTransactions, setTodayTransactions] = useState<number>(0);
  const [monthProfit, setMonthProfit] = useState<number>(0);

  const [alerts, setAlerts] = useState({
    expired: [] as AlertItem[],
    expiring3: [] as AlertItem[],
    expiring7: [] as AlertItem[],
    lowStock: [] as AlertItem[],
  });

  const [aiInsight] = useState("Your revenue is stable this month. Consider increasing volume to boost growth.");

  const [loading, setLoading] = useState(true);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [range, setRange] = useState<"today" | "7d" | "30d" | "all">("today");

  // Move totalAlertCount up so it's defined before alertPulse
  const totalAlertCount =
    alerts.expired.length + alerts.expiring3.length + alerts.expiring7.length + alerts.lowStock.length;
  // Animation for alert icon
  const alertPulse = totalAlertCount > 0 ? "animate-pulse" : "";

  function getDateRange(range: "today" | "7d" | "30d" | "all") {
    const now = new Date();
    const end = new Date(now);

    if (range === "all") return { start: undefined, end };

    const start = new Date(now);

    if (range === "today") start.setHours(0, 0, 0, 0);
    if (range === "7d") {
      start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);
    }
    if (range === "30d") {
      start.setDate(now.getDate() - 29);
      start.setHours(0, 0, 0, 0);
    }

    return { start, end };
  }

  // Set greeting on client only to avoid hydration mismatch
  useEffect(() => {
    setGreeting(getGreeting());
  }, []);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const { start, end } = getDateRange(range);
        const salesUrl = new URL("/api/sales", window.location.origin);
        if (start) salesUrl.searchParams.set("startDate", start.toISOString());
        if (end) salesUrl.searchParams.set("endDate", end.toISOString());
        const salesUrlString = salesUrl.toString();
        const ingredientsUrl = "/api/ingredients?withBatches=true";

        const cachedSalesData = peekApiCache<SalesSummaryResponse>(salesUrlString);
        const cachedIngredientData =
          peekApiCache<IngredientsResponse>(ingredientsUrl);
        const hasCachedPayload =
          Boolean(cachedSalesData?.success) || Boolean(cachedIngredientData?.success);

        if (!hasCachedPayload) {
          setLoading(true);
        }

        const applySalesPayload = (salesData?: SalesSummaryResponse | null) => {
          if (!salesData?.success) return;
          const summary = salesData.data?.summary ?? {};
          setTodayRevenue(Number(summary.totalRevenue || 0));
          setTodayTransactions(Number(summary.transactionCount || 0));
          setMonthProfit(Number(summary.totalProfit || 0));
        };

        const applyIngredientPayload = (
          ingredientData?: IngredientsResponse | null,
        ) => {
          if (!ingredientData?.success) return;
          const today = new Date();
          const expired: AlertItem[] = [];
          const expiring3: AlertItem[] = [];
          const expiring7: AlertItem[] = [];
          const lowStock: AlertItem[] = [];

          ingredientData.data?.forEach((ingredient: Ingredient) => {
            if (ingredient.currentStock < ingredient.minStock) {
              lowStock.push({
                name: ingredient.name,
                currentStock: ingredient.currentStock,
                minStock: ingredient.minStock,
              });
            }

            ingredient.inventoryBatches?.forEach((batch: InventoryBatch) => {
              if (!batch.expirationDate) return;

              const expDate = new Date(batch.expirationDate);
              const diffDays = (expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);

              if (diffDays < 0)
                expired.push({
                  name: ingredient.name,
                  expirationDate: batch.expirationDate,
                });
              else if (diffDays <= 3)
                expiring3.push({
                  name: ingredient.name,
                  expirationDate: batch.expirationDate,
                });
              else if (diffDays <= 7)
                expiring7.push({
                  name: ingredient.name,
                  expirationDate: batch.expirationDate,
                });
            });
          });

          setAlerts({ expired, expiring3, expiring7, lowStock });
        };

        if (hasCachedPayload) {
          applySalesPayload(cachedSalesData);
          applyIngredientPayload(cachedIngredientData);
          setLoading(false);
        }

        const [salesData, ingredientData] = await Promise.all([
          apiFetch(salesUrlString),
          apiFetch(ingredientsUrl),
        ]);

        applySalesPayload(salesData as SalesSummaryResponse);
        applyIngredientPayload(ingredientData as IngredientsResponse);
      } catch (error) {
        console.error("Dashboard load error:", error);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, [range]);

  // Removed duplicate totalAlertCount declaration

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#243b5a] border-t-transparent" />
      </div>
    );

  return (
    <>
      <div className="relative space-y-5 sm:space-y-6 lg:space-y-8">
        <div className="pointer-events-none absolute -left-8 top-24 h-24 w-24 rounded-full bg-[#f26a21]/14 blur-xl" />
        <div className="pointer-events-none absolute right-0 top-10 h-24 w-24 rounded-full bg-[#25b4c8]/14 blur-xl" />

        {/* Header */}
        <div className="rounded-2xl border border-[#ffc894] bg-linear-to-r from-[#173a7a] via-[#f26a21] to-[#25b4c8] p-5 shadow-lg shadow-slate-200/40 sm:p-8">
          <h1 className="flex items-center gap-3 text-xl font-bold text-white sm:text-3xl">
            <Smile className="shrink-0 text-[#ffd8a8]" size={24} />
            Good {greeting || "..."}, Crumbella Team
          </h1>
          <p className="mt-2 text-xs text-slate-200 sm:text-sm">
            Here&apos;s your cake business performance overview.
          </p>
        </div>

        {/* Filter */}
        <div className="flex flex-wrap gap-2 sm:gap-3">
          {["today", "7d", "30d", "all"].map((r) => (
            <button
              key={r}
              onClick={() => setRange(r as "today" | "7d" | "30d" | "all")}
              className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition ${
                range === r
                  ? "bg-[#243b5a] text-white shadow-md shadow-slate-200/60"
                  : "border border-[#ffd8b7] bg-white text-gray-600 hover:border-[#25b4c8] hover:bg-[#eaf9fd] hover:text-[#145066]"
              }`}
            >
              {r.toUpperCase()}
            </button>
          ))}
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
          <GlassCard title="Revenue" value={formatCurrency(todayRevenue)} />
          <GlassCard title="Transactions" value={todayTransactions} />
          <GlassCard title="Profit" value={formatCurrency(monthProfit)} />
          <GlassCard
            title="Avg Margin"
            value={todayRevenue > 0 ? `${((monthProfit / todayRevenue) * 100).toFixed(1)}%` : "0%"}
          />
        </div>

        {/* Inventory Alerts Card */}
        <div
          className="relative group flex cursor-pointer items-center justify-between rounded-2xl border border-amber-200 bg-linear-to-r from-amber-100 via-amber-50 to-white p-6 shadow-lg transition hover:shadow-amber-300/40"
          onClick={() => setIsAlertOpen(true)}
        >
          <div className="flex items-center gap-4">
            <span className={`rounded-full bg-amber-200 p-3 shadow-md ${alertPulse}`}>
              <AlertTriangle className="text-amber-600" size={28} />
            </span>
            <div>
              <p className="font-semibold text-amber-700 text-lg flex items-center gap-2">
                Peringatan Stok
                {totalAlertCount > 0 && (
                  <span className="bg-amber-500 text-white text-xs px-2 py-1 rounded-full animate-bounce">
                    {totalAlertCount}
                  </span>
                )}
              </p>
              <p className="text-sm text-amber-600 mt-1">
                {totalAlertCount > 0 ? `${totalAlertCount} items need attention` : "All inventory is healthy!"}
              </p>
            </div>
          </div>
          <div className="absolute right-6 top-6">
            {totalAlertCount > 0 && <span className="animate-ping inline-block w-3 h-3 bg-amber-400 rounded-full" />}
          </div>
        </div>

        {/* Chart */}
        <div className="rounded-2xl border border-[#8ad9e4] bg-linear-to-br from-white via-[#f7fdff] to-[#eaf9fd] p-4 shadow-sm sm:p-6 lg:p-8">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-[#243b5a] sm:mb-6 sm:text-lg">
            <TrendingUp size={20} className="text-[#f36f21]" />
            Revenue Trend
          </h2>
          <RevenueChart />
        </div>

        {/* AI Insight */}
        <div className="rounded-2xl border border-[#ffd8b7] bg-linear-to-br from-white via-[#fffaf1] to-[#fff2df] p-4 shadow-sm sm:p-6 lg:p-8">
          <h2 className="mb-4 text-base font-semibold text-[#243b5a] sm:text-lg">🤖 AI Insight</h2>
          <p className="text-gray-600 text-sm leading-relaxed">{aiInsight}</p>
        </div>
      </div>

      {isAlertOpen && <PremiumModal alerts={alerts} onClose={() => setIsAlertOpen(false)} />}
    </>
  );
}

/* Extra Components */

function GlassCard({ title, value }: { title: string; value: string | number }) {
  const toneClass =
    title === "Revenue"
      ? "before:bg-[#f26a21]"
      : title === "Transactions"
        ? "before:bg-[#25b4c8]"
        : title === "Profit"
          ? "before:bg-[#f9bd1f]"
          : "before:bg-[#2a4d91]";

  return (
    <div className={`relative rounded-xl border border-[#ffd8b7] bg-white/90 p-4 pt-5 shadow-sm transition before:absolute before:left-4 before:top-0 before:h-1 before:w-14 before:rounded-full hover:-translate-y-0.5 hover:border-[#ffc894] hover:shadow-md sm:rounded-2xl sm:p-6 sm:pt-7 ${toneClass}`}>
      <p className="text-xs text-[#6b7280] sm:text-sm">{title}</p>
      <h2 className="mt-1 truncate text-lg font-bold text-[#243b5a] sm:mt-2 sm:text-2xl">{value}</h2>
    </div>
  );
}

function PremiumModal({
  alerts,
  onClose,
}: {
  alerts: {
    expired: AlertItem[];
    expiring3: AlertItem[];
    expiring7: AlertItem[];
    lowStock: AlertItem[];
  };
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/45 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-lg rounded-3xl border border-[#ffd8b7] bg-white p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 text-xl" onClick={onClose}>
          ×
        </button>
        <h2 className="text-2xl font-bold mb-6 text-amber-700 flex items-center gap-2">
          <AlertTriangle className="text-amber-500" size={24} /> Peringatan Stok
        </h2>
        <div className="space-y-4">
          {/* Low Stock */}
          {alerts.lowStock.length > 0 && (
            <div>
              <p className="font-semibold text-red-600 mb-2">Low Stock</p>
              <ul className="space-y-1">
                {alerts.lowStock.map((a, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span className="inline-block w-2 h-2 bg-red-500 rounded-full mr-1" />
                    <span className="font-medium">{a.name}</span>
                    <span className="text-xs text-slate-500">
                      ({a.currentStock}/{a.minStock})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* Expired */}
          {alerts.expired.length > 0 && (
            <div>
              <p className="font-semibold text-amber-700 mb-2">Expired</p>
              <ul className="space-y-1">
                {alerts.expired.map((a, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span className="inline-block w-2 h-2 bg-amber-700 rounded-full mr-1" />
                    <span className="font-medium">{a.name}</span>
                    <span className="text-xs text-slate-500">({a.expirationDate})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* Expiring in 3 days */}
          {alerts.expiring3.length > 0 && (
            <div>
              <p className="font-semibold text-orange-500 mb-2">Expiring Soon (≤3 days)</p>
              <ul className="space-y-1">
                {alerts.expiring3.map((a, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span className="inline-block w-2 h-2 bg-orange-400 rounded-full mr-1" />
                    <span className="font-medium">{a.name}</span>
                    <span className="text-xs text-slate-500">({a.expirationDate})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* Expiring in 7 days */}
          {alerts.expiring7.length > 0 && (
            <div>
              <p className="font-semibold text-yellow-500 mb-2">Expiring Soon (≤7 days)</p>
              <ul className="space-y-1">
                {alerts.expiring7.map((a, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span className="inline-block w-2 h-2 bg-yellow-400 rounded-full mr-1" />
                    <span className="font-medium">{a.name}</span>
                    <span className="text-xs text-slate-500">({a.expirationDate})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* No Alerts */}
          {alerts.lowStock.length === 0 &&
            alerts.expired.length === 0 &&
            alerts.expiring3.length === 0 &&
            alerts.expiring7.length === 0 && (
              <div className="text-green-600 text-center font-semibold text-lg">🎉 All inventory is healthy!</div>
            )}
        </div>
      </div>
    </div>
  );
}
