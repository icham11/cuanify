"use client";

import { useEffect, useState } from "react";
import RevenueChart from "../components/charts/RevenueChart";
import { TrendingUp, AlertTriangle, Smile } from "lucide-react";

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
        setLoading(true);

        const { start, end } = getDateRange(range);

        const salesUrl = new URL("/api/sales", window.location.origin);
        if (start) salesUrl.searchParams.set("startDate", start.toISOString());
        if (end) salesUrl.searchParams.set("endDate", end.toISOString());

        const [salesRes, ingredientRes] = await Promise.all([
          fetch(salesUrl.toString()),
          fetch("/api/ingredients?withBatches=true"),
        ]);

        const salesData = await salesRes.json();
        const ingredientData = await ingredientRes.json();

        if (salesRes.ok && salesData.success) {
          setTodayRevenue(salesData.data.totalRevenue);
          setTodayTransactions(salesData.data.analytics.transactionCount);
          setMonthProfit(salesData.data.analytics.totalProfit);
        }

        if (ingredientRes.ok && ingredientData.success) {
          const today = new Date();
          const expired: AlertItem[] = [];
          const expiring3: AlertItem[] = [];
          const expiring7: AlertItem[] = [];
          const lowStock: AlertItem[] = [];

          ingredientData.data.forEach((ingredient: Ingredient) => {
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
        }
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
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-indigo-600 border-t-transparent" />
      </div>
    );

  return (
    <>
      <div className="space-y-5 sm:space-y-6 lg:space-y-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 rounded-2xl p-5 sm:p-8 shadow-lg shadow-indigo-200/30">
          <h1 className="text-xl sm:text-3xl font-bold text-white flex items-center gap-3">
            <Smile className="text-yellow-300 shrink-0" size={24} />
            Good {greeting || "..."}, Polo
          </h1>
          <p className="text-indigo-200 mt-2 text-xs sm:text-sm">Here&apos;s your business performance overview.</p>
        </div>

        {/* Filter */}
        <div className="flex flex-wrap gap-2 sm:gap-3">
          {["today", "7d", "30d", "all"].map((r) => (
            <button
              key={r}
              onClick={() => setRange(r as "today" | "7d" | "30d" | "all")}
              className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition ${
                range === r
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-200/50"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200"
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
          className="relative group bg-linear-to-r from-amber-100 via-amber-50 to-white border border-amber-200 rounded-2xl p-6 shadow-lg cursor-pointer hover:shadow-amber-300/40 transition flex items-center justify-between"
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
        <div className="bg-white border border-indigo-100 rounded-2xl shadow-sm p-4 sm:p-6 lg:p-8">
          <h2 className="text-base sm:text-lg font-semibold text-gray-800 mb-4 sm:mb-6 flex items-center gap-2">
            <TrendingUp size={20} className="text-indigo-500" />
            Revenue Trend
          </h2>
          <RevenueChart />
        </div>

        {/* AI Insight */}
        <div className="bg-white border border-indigo-100 rounded-2xl shadow-sm p-4 sm:p-6 lg:p-8">
          <h2 className="text-base sm:text-lg font-semibold text-gray-800 mb-4">🤖 AI Insight</h2>
          <p className="text-gray-600 text-sm leading-relaxed">{aiInsight}</p>
        </div>
      </div>

      {isAlertOpen && <PremiumModal alerts={alerts} onClose={() => setIsAlertOpen(false)} />}
    </>
  );
}

/* Extra Components */

function GlassCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="bg-white/80 backdrop-blur border border-indigo-100 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-sm hover:shadow-md hover:border-indigo-200 transition">
      <p className="text-xs sm:text-sm text-gray-500">{title}</p>
      <h2 className="text-lg sm:text-2xl font-bold text-gray-900 mt-1 sm:mt-2 truncate">{value}</h2>
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
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-lg relative"
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
