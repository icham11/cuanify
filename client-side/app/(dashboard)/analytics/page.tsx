"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
  ReferenceLine,
  PieChart,
  Pie,
  Cell,
  Legend,
  ComposedChart,
} from "recharts";
import {
  TrendingUp,
  Package,
  RefreshCw,
  Info,
  HeartPulse,
  Trash2,
  BookOpen,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Sparkles,
  Loader2,
  Zap,
  DollarSign,
  ShoppingCart,
  Percent,
  Users,
} from "lucide-react";
import StatTile from "@/app/components/StatTile";
import { useDateRange } from "@/context/DateRangeContext";

// ═══════════════════════════════════════════════════════
// COMPACT CURRENCY HELPER
// ═══════════════════════════════════════════════════════

/** Mobile-friendly: "40,5 jt" instead of "40.492.500" */
function fmtCompact(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 1_000_000_000)
    return `Rp ${(val / 1_000_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`;
  if (abs >= 1_000_000) return `Rp ${(val / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  if (abs >= 1_000) return `Rp ${(val / 1_000).toLocaleString("id-ID", { maximumFractionDigits: 0 })} rb`;
  return `Rp ${val.toLocaleString("id-ID")}`;
}

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

type ProductAnalytics = {
  productId: number;
  productName: string;
  quantitySold: number;
  revenue: number;
  cost: number;
  profit: number;
  profitMargin: number;
  margin_avg: number;
};
type ProductSummary = {
  totalRevenue: number;
  totalProfit: number;
  totalQuantity: number;
};
type CategoryAnalytics = {
  categoryId: number | null;
  categoryName: string;
  quantitySold: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  contribution: number;
};

type HourlyPoint = {
  hour: string;
  revenue: number;
  profit: number;
  transactions: number;
};
type DailyPoint = {
  date: string;
  revenue: number;
  profit: number;
  growthRate: number;
};
type MonthlyPoint = { date: string; revenue: number; profit: number };
type GrowthComparison = {
  currentRevenue: number;
  prevRevenue: number;
  revenueGrowth: number;
  currentProfit: number;
  prevProfit: number;
  profitGrowth: number;
};
type Granularity = "24h" | "7d" | "30d" | "6mo";

type BizForecastDay = {
  date: string;
  predictedRevenue: number;
  predictedProfit: number;
  lowerBound: number;
  upperBound: number;
  confidenceScore: number;
};
type ProductForecastDay = {
  date: string;
  predictedQty: number;
  lowerBound: number;
  upperBound: number;
  confidenceScore: number;
  recommendedProduction: string;
};
type ProductForecastResult = {
  productId: number;
  productName: string;
  forecast: ProductForecastDay[];
  avgDailyQty: number;
};
type ForecastData = {
  cached: boolean;
  lastComputed: string | null;
  modelInfo: { arima: string; lookback: number; horizon: number };
  businessForecast: BizForecastDay[];
  productForecasts: ProductForecastResult[];
};

type HealthPoint = {
  date: string;
  revenueScore: number;
  profitScore: number;
  wasteScore: number;
  stabilityScore: number;
  overallScore: number;
  classification: string;
};
type WasteData = {
  totalWasteQty: number;
  totalWasteCost: number;
  wastePercentage: number;
};
type DebtSummary = {
  totalOutstanding: number;
  totalPaid: number;
  collectionRate: number;
  overdueCount: number;
  totalDebtors: number;
};
type TrendPoint = { month: string; collected: number; count: number };
type TopDebtor = {
  customerName: string;
  customerPhone: string | null;
  outstanding: number;
  dueDate: string | null;
  isOverdue: boolean;
  status: string;
};

// ═══════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

const SCORE_LINES = [
  {
    key: "overallScore",
    label: "Overall",
    color: "#6366f1",
    max: 100,
    description: "Gabungan dari 4 sub-skor di bawah",
    tip: "💡 Tingkatkan sub-skor yang paling rendah untuk meningkatkan skor keseluruhan",
  },
  {
    key: "revenueScore",
    label: "Pendapatan",
    color: "#10b981",
    max: 25,
    description: "Target 120% dari rata-rata bulanan Anda",
    tip: "💡 Capai 120% dari rata-rata pendapatan bulanan Anda untuk skor penuh",
  },
  {
    key: "profitScore",
    label: "Margin",
    color: "#f59e0b",
    max: 25,
    description: "Berdasarkan target margin 50%",
    tip: "💡 Target margin profit 50% untuk skor penuh. Evaluasi harga jual dan biaya bahan.",
  },
  {
    key: "wasteScore",
    label: "Efisiensi",
    color: "#ef4444",
    max: 25,
    description: "Semakin rendah limbah, semakin tinggi skor",
    tip: "💡 Jaga limbah di bawah 1% dari pendapatan untuk skor penuh. Kelola stok dengan baik.",
  },
  {
    key: "stabilityScore",
    label: "Stabilitas",
    color: "#8b5cf6",
    max: 25,
    description: "Konsistensi pendapatan harian",
    tip: "💡 Pendapatan harian yang konsisten = skor lebih tinggi. Hindari fluktuasi ekstrem.",
  },
];

// Moved _now and MONTHS out of module scope to avoid stale module-cache
// and SSR/client timezone divergence. Use buildMonths() inside components.
function buildMonths() {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label =
      i === 0
        ? "Bulan Ini"
        : d.toLocaleDateString("id-ID", {
            month: "long",
            year: "numeric",
            timeZone: "Asia/Jakarta",
          });
    return { year: d.getFullYear(), month: d.getMonth() + 1, label };
  }).reverse(); // oldest → newest left-to-right, matching the trend chart direction
}

type TabKey = "overview" | "products" | "growth" | "health" | "waste" | "kasbon";
const TABS: { key: TabKey; label: string; badge?: string }[] = [
  { key: "overview", label: "Ringkasan" },
  { key: "products", label: "Produk" },
  { key: "growth", label: "Pertumbuhan", badge: "AI" },
  { key: "health", label: "Kesehatan" },
  { key: "waste", label: "Limbah" },
  { key: "kasbon", label: "Kasbon" },
];

// ═══════════════════════════════════════════════════════
// SHARED HELPER COMPONENTS
// ═══════════════════════════════════════════════════════

function SummaryCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="p-4 rounded-xl bg-linear-to-br from-indigo-50 to-indigo-100/50 border border-indigo-100 hover:shadow-md transition">
      <p className="text-xs text-gray-500 mb-0.5">{title}</p>
      <p className="text-lg font-bold text-gray-900">{String(value)}</p>
    </div>
  );
}

function ConfidenceBadge({ score }: { score: number }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
        score >= 80
          ? "bg-green-100 text-green-700"
          : score >= 60
            ? "bg-yellow-100 text-yellow-700"
            : "bg-red-100 text-red-500"
      }`}
    >
      Keyakinan: {score}%
    </span>
  );
}

function GaugeBar({
  label,
  value,
  color,
  max = 100,
  description,
  tip,
}: {
  label: string;
  value: number;
  color: string;
  max?: number;
  description?: string;
  tip?: string;
}) {
  const percentage = (value / max) * 100;
  return (
    <div title={tip || description} className="cursor-help">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-600">{label}</span>
        <span className="text-xs font-bold" style={{ color }}>
          {value.toFixed(1)}/{max}
        </span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2">
        <div
          className="h-2 rounded-full transition-all duration-700"
          style={{
            width: `${Math.min(100, percentage)}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  );
}

function GrowthBadge({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <span className={`flex items-center gap-1 text-sm font-semibold ${up ? "text-green-600" : "text-red-500"}`}>
      {up ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function classColors(cls: string) {
  switch (cls) {
    case "Excellent":
      return "bg-green-100 text-green-700";
    case "Healthy":
      return "bg-blue-100 text-blue-700";
    case "Warning":
      return "bg-yellow-100 text-yellow-700";
    case "Critical":
      return "bg-red-100 text-red-600";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

// ═══════════════════════════════════════════════════════
// AI INSIGHT LABEL — static pre-generated insight
// ═══════════════════════════════════════════════════════

type InsightsMap = Record<string, { insight: string; generatedAt: string }>;

function useInsights() {
  const [insights, setInsights] = useState<InsightsMap>({});
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/analytics/insights-cached");
        if (res.ok) {
          const json = await res.json();
          setInsights(json.insights ?? {});
        }
      } catch {
        /* non-critical */
      }
    }
    load();
  }, []);
  return insights;
}

function AIInsightLabel({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <div className="bg-linear-to-r from-violet-50 to-indigo-50 rounded-2xl border border-indigo-100 px-5 py-4 flex items-start gap-3">
      <Sparkles className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
      <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap leading-relaxed text-[13px]">
        {text}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// EMPTY STATE — first-time data prompt
// ═══════════════════════════════════════════════════════

function EmptyAnalytics() {
  const [generating, setGenerating] = useState(false);
  const [hasProducts, setHasProducts] = useState<boolean | null>(null);
  const [hasSales, setHasSales] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkPrerequisites() {
      try {
        // Check for products
        const prodRes = await fetch("/api/products");
        const prodJson = await prodRes.json();
        const products = prodJson.data ?? prodJson.products ?? [];
        setHasProducts(products.length > 0);

        // Check for sales (last 30 days)
        const now = new Date();
        const from = new Date(now);
        from.setDate(from.getDate() - 30);
        const salesRes = await fetch(`/api/analytics/daily?from=${from.toISOString()}&to=${now.toISOString()}`);
        const salesJson = await salesRes.json();
        setHasSales((salesJson.data ?? []).some((d: { revenue: number }) => d.revenue > 0));
      } catch {
        // On error, allow proceeding
        setHasProducts(true);
        setHasSales(false);
      }
    }
    checkPrerequisites();
  }, []);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/cron/generate-analytics", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Gagal menjalankan analisis");
      toast.success("Analisis berhasil dibuat! Memuat ulang...");
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghasilkan analisis");
    } finally {
      setGenerating(false);
    }
  }

  // Loading state
  if (hasProducts === null) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  // No products - must add products first
  if (!hasProducts) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Package className="w-10 h-10 text-amber-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-3">Tambahkan Produk Terlebih Dahulu</h2>
          <p className="text-gray-500 mb-6 leading-relaxed">
            Untuk menggunakan fitur analitik, Anda perlu menambahkan produk terlebih dahulu. Sistem akan menganalisis
            performa penjualan produk Anda.
          </p>
          <a
            href="/dashboard/products"
            className="inline-flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-indigo-700 transition"
          >
            <Package className="w-5 h-5" />
            Tambah Produk
          </a>
        </div>
      </div>
    );
  }

  // Has products, can proceed with analysis
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <BarChart3 className="w-10 h-10 text-indigo-500" />
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-3">Belum Ada Data Analitik</h2>
        <p className="text-gray-500 mb-6 leading-relaxed">
          Untuk memulai, jalankan analisis pertama Anda. Sistem akan menghasilkan prediksi penjualan, skor kesehatan
          bisnis, dan wawasan berbasis AI untuk membantu pengambilan keputusan.
        </p>
        {hasSales === false && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-6 text-left">
            <p className="text-sm text-amber-700">
              <strong>Info:</strong> Belum ada data penjualan. Analisis akan lebih akurat setelah ada transaksi.
            </p>
          </div>
        )}
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="inline-flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-indigo-700 transition disabled:opacity-50 cursor-pointer"
        >
          {generating ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Sedang menganalisis...
            </>
          ) : (
            <>
              <Zap className="w-5 h-5" />
              Buat Analisis Pertama
            </>
          )}
        </button>
        <p className="text-xs text-gray-400 mt-4">Analisis akan diperbarui otomatis setiap hari.</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const { range, setRange } = useDateRange();
  const showDateFilter = activeTab === "overview" || activeTab === "products";
  const [hasData, setHasData] = useState<boolean | null>(null);
  const [generating, setGenerating] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  async function handleManualGenerate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/cron/generate-analytics", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Gagal menjalankan analisis");
      toast.success("Analisis berhasil dibuat! Memuat ulang...");
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      toast.error("Gagal menjalankan analisis");
    } finally {
      setGenerating(false);
    }
  }

  // Check if business has any metrics data + fetch last updated timestamp
  useEffect(() => {
    async function check() {
      try {
        const now = new Date();
        const from = new Date(now);
        from.setDate(from.getDate() - 30);
        const res = await fetch(`/api/analytics/daily?from=${from.toISOString()}&to=${now.toISOString()}`);
        const json = await res.json();
        setHasData((json.data ?? []).some((d: { revenue: number }) => d.revenue > 0));
      } catch {
        setHasData(true); // assume data exists on error
      }
    }
    async function fetchLastUpdated() {
      try {
        const res = await fetch("/api/analytics/last-updated");
        if (res.ok) {
          const json = await res.json();
          setLastUpdated(json.lastUpdated ?? null);
        }
      } catch {
        /* non-critical */
      }
    }
    check();
    fetchLastUpdated();
  }, []);

  if (hasData === null) {
    return (
      <div className="min-h-screen bg-linear-to-br from-indigo-50 via-white to-blue-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (hasData === false) {
    return (
      <div className="min-h-screen bg-linear-to-br from-indigo-50 via-white to-blue-50 py-8 px-2 md:px-8">
        <div className="max-w-7xl mx-auto">
          <EmptyAnalytics />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6 lg:space-y-8">
      {/* Header */}
      <div className="bg-linear-to-r from-indigo-600 via-purple-600 to-indigo-600 rounded-2xl p-5 sm:p-8 shadow-lg shadow-indigo-200/30">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-white flex items-center gap-2 sm:gap-3">
              <BarChart3 className="w-6 h-6 sm:w-8 sm:h-8 shrink-0" /> Analytics
            </h1>
            <p className="text-indigo-200 mt-1 text-xs sm:text-sm">Wawasan bisnis, performa &amp; prediksi penjualan</p>
            <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-indigo-300 mt-1.5">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              {lastUpdated ? (
                <span>
                  Terakhir diperbarui:{" "}
                  <span className="font-medium text-indigo-100">
                    {new Date(lastUpdated).toLocaleString("id-ID", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Asia/Jakarta",
                    })}
                  </span>
                </span>
              ) : (
                <span>Analytics belum pernah di-generate</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 self-start shrink-0 flex-wrap justify-end">
            {process.env.NODE_ENV === "development" && (
              <button
                onClick={handleManualGenerate}
                disabled={generating}
                title="Dev only — generate analytics"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-400/20 border border-amber-300/40 text-amber-200 hover:bg-amber-400/30 transition disabled:opacity-50 cursor-pointer"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5" /> Generate (Dev)
                  </>
                )}
              </button>
            )}
            {showDateFilter && (
              <div className="inline-flex items-center gap-0.5 bg-white/10 border border-white/20 rounded-xl p-0.5 sm:p-1 backdrop-blur-sm">
                {(["today", "7d", "30d", "all"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRange(r)}
                    className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold transition cursor-pointer ${
                      range === r ? "bg-white text-indigo-700 shadow" : "text-white/80 hover:bg-white/20"
                    }`}
                  >
                    {r === "today" ? "Hari Ini" : r === "7d" ? "7 Hari" : r === "30d" ? "30 Hari" : "Semua"}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tab bar — horizontal scroll on mobile */}
      <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-1 -mx-2 px-2 scrollbar-none">
        {TABS.map((t) => (
          <button
            key={t.key}
            data-tab={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-1 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === t.key
                ? "bg-indigo-600 text-white shadow"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-indigo-50"
            }`}
          >
            {t.label}
            {t.badge && (
              <span className="text-[9px] sm:text-[10px] bg-indigo-200 text-indigo-800 px-1 sm:px-1.5 py-0.5 rounded-full font-bold">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Active section */}
      <div>
        {activeTab === "overview" && <OverviewSection />}
        {activeTab === "products" && <ProductsSection />}
        {activeTab === "growth" && <GrowthSection />}
        {activeTab === "health" && <HealthSection />}
        {activeTab === "waste" && <WasteSection />}
        {activeTab === "kasbon" && <KasbonSection />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// OVERVIEW SECTION
// ═══════════════════════════════════════════════════════

function OverviewSection() {
  const { start, end, range } = useDateRange();
  const [summary, setSummary] = useState<ProductSummary | null>(null);
  const [topProducts, setTopProducts] = useState<ProductAnalytics[]>([]);
  const [health, setHealth] = useState<HealthPoint | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!end) return;
    async function fetchData() {
      setLoading(true);
      try {
        const prodUrl = new URL("/api/analytics/products", window.location.origin);
        if (start) prodUrl.searchParams.set("from", start.toISOString());
        prodUrl.searchParams.set("to", end!.toISOString());

        const [prodRes, healthRes] = await Promise.allSettled([
          fetch(prodUrl.toString()),
          fetch("/api/analytics/health?days=30"),
        ]);

        if (prodRes.status === "fulfilled" && prodRes.value.ok) {
          const j = await prodRes.value.json();
          setSummary(j.summary ?? null);
          setTopProducts((j.products ?? []).slice(0, 5));
        }
        if (healthRes.status === "fulfilled" && healthRes.value.ok) {
          const j = await healthRes.value.json();
          setHealth(j.latest ?? null);
        }
      } catch {
        /* non-critical */
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [start, end]);

  const margin =
    summary && summary.totalRevenue > 0 ? ((summary.totalProfit / summary.totalRevenue) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6">
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-2xl h-24 animate-pulse shadow-sm border border-gray-100" />
          ))}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <StatTile
            icon={DollarSign}
            label="Pendapatan"
            value={fmtCompact(summary.totalRevenue)}
            color="indigo"
            subtext={
              range === "today"
                ? "Hari ini"
                : range === "7d"
                  ? "7 hari terakhir"
                  : range === "30d"
                    ? "30 hari terakhir"
                    : "Semua waktu"
            }
          />
          <StatTile icon={TrendingUp} label="Laba" value={fmtCompact(summary.totalProfit)} color="emerald" />
          <StatTile icon={Package} label="Qty Terjual" value={String(summary.totalQuantity)} color="purple" />
          <StatTile icon={Percent} label="Margin" value={`${margin}%`} color="amber" />
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-8 text-center text-gray-400 shadow-sm border border-gray-100">
          Belum ada data penjualan untuk periode ini.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {/* Top products */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6">
          <h2 className="text-base font-bold text-indigo-700 mb-4 flex items-center gap-2">
            <Package className="w-4 h-4" /> Produk Terlaris
          </h2>
          {topProducts.length === 0 ? (
            <p className="text-sm text-gray-400">Belum ada data produk.</p>
          ) : (
            <div className="space-y-3">
              {topProducts.map((p, i) => (
                <div key={p.productId} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">{p.productName}</p>
                    <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
                      <div
                        className="h-1.5 rounded-full bg-indigo-400"
                        style={{
                          width: `${summary ? Math.min(100, (p.revenue / summary.totalRevenue) * 100) : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-gray-600 shrink-0">{fmtCompact(p.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Health snapshot */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6">
          <h2 className="text-base font-bold text-indigo-700 mb-4 flex items-center gap-2">
            <HeartPulse className="w-4 h-4" /> Kesehatan Bisnis
          </h2>
          {!health ? (
            <p className="text-sm text-gray-400">Belum ada skor kesehatan.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-600">Skor Keseluruhan</span>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-indigo-700">{health.overallScore.toFixed(1)}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${classColors(health.classification)}`}>
                    {health.classification}
                  </span>
                </div>
              </div>
              {SCORE_LINES.filter((s) => s.key !== "overallScore").map((s) => (
                <GaugeBar
                  key={s.key}
                  label={s.label}
                  value={health[s.key as keyof HealthPoint] as number}
                  color={s.color}
                  max={s.max}
                  description={s.description}
                  tip={s.tip}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick nav cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4">
        {[
          {
            label: "Produk & Kategori",
            icon: <Package className="w-4 h-4 sm:w-5 sm:h-5" />,
            color: "indigo",
            tab: "products",
          },
          {
            label: "Tren Pertumbuhan",
            icon: <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />,
            color: "blue",
            tab: "growth",
          },
          {
            label: "Skor Kesehatan",
            icon: <HeartPulse className="w-4 h-4 sm:w-5 sm:h-5" />,
            color: "green",
            tab: "health",
          },
          {
            label: "Analisis Limbah",
            icon: <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />,
            color: "red",
            tab: "waste",
          },
          {
            label: "Kasbon / Utang",
            icon: <BookOpen className="w-4 h-4 sm:w-5 sm:h-5" />,
            color: "amber",
            tab: "kasbon",
          },
        ].map((item) => (
          <button
            key={item.tab}
            className={`bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 shadow-sm border border-gray-100 hover:border-${item.color}-300 hover:shadow-md transition text-left flex items-center gap-2 sm:gap-3 group cursor-pointer`}
            onClick={() => {
              const el = document.querySelector(`[data-tab="${item.tab}"]`);
              if (el) (el as HTMLButtonElement).click();
            }}
          >
            <span
              className={`p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-${item.color}-100 text-${item.color}-600 group-hover:scale-110 transition`}
            >
              {item.icon}
            </span>
            <span className="text-xs sm:text-sm font-semibold text-gray-700">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// PRODUCTS SECTION
// ═══════════════════════════════════════════════════════

function ProductsSection() {
  const { start, end, range } = useDateRange();
  const [data, setData] = useState<ProductAnalytics[]>([]);
  const [summary, setSummary] = useState<ProductSummary | null>(null);
  const [previousSummary, setPreviousSummary] = useState<ProductSummary | null>(null);
  const [categoryData, setCategoryData] = useState<CategoryAnalytics[]>([]);
  const [productTab, setProductTab] = useState<"products" | "categories">("products");
  const [loading, setLoading] = useState(true);
  const insights = useInsights();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const totalPages = Math.ceil(data.length / pageSize);

  function getPreviousRange(s?: Date, e?: Date) {
    if (!s || !e) return { prevStart: undefined, prevEnd: undefined };
    const diff = e.getTime() - s.getTime();
    const prevEnd = new Date(s.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - diff);
    return { prevStart, prevEnd };
  }

  useEffect(() => {
    if (!end) return;
    async function fetchData() {
      setLoading(true);
      try {
        const currentUrl = new URL("/api/analytics/products", window.location.origin);
        if (start) currentUrl.searchParams.set("from", start.toISOString());
        currentUrl.searchParams.set("to", end!.toISOString());

        const { prevStart, prevEnd } = getPreviousRange(start, end);
        const prevUrl = new URL("/api/analytics/products", window.location.origin);
        if (prevStart) prevUrl.searchParams.set("from", prevStart.toISOString());
        if (prevEnd) prevUrl.searchParams.set("to", prevEnd.toISOString());

        const catUrl = new URL("/api/analytics/category", window.location.origin);
        if (start) catUrl.searchParams.set("from", start.toISOString());
        catUrl.searchParams.set("to", end!.toISOString());

        const [curRes, prevRes, catRes] = await Promise.all([
          fetch(currentUrl.toString()),
          fetch(prevUrl.toString()),
          fetch(catUrl.toString()),
        ]);

        const [curJson, prevJson, catJson] = await Promise.all([curRes.json(), prevRes.json(), catRes.json()]);

        setData(curJson.products ?? []);
        setSummary(curJson.summary ?? null);
        setPreviousSummary(prevJson.summary ?? null);
        setCategoryData(catJson.categories ?? []);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to fetch analytics");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
    setPage(1);
  }, [start, end]);

  if (loading || !summary) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400">Memuat analitik produk…</div>
      </div>
    );
  }

  const margin = summary.totalRevenue > 0 ? ((summary.totalProfit / summary.totalRevenue) * 100).toFixed(1) : "0";
  let revenueGrowth = 0;
  if (previousSummary && previousSummary.totalRevenue > 0) {
    revenueGrowth = ((summary.totalRevenue - previousSummary.totalRevenue) / previousSummary.totalRevenue) * 100;
  }

  return (
    <div className="space-y-8">
      {/* Sub-tab switcher */}
      <div className="flex gap-2">
        {(["products", "categories"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setProductTab(t)}
            className={`px-5 py-2 rounded-xl font-semibold text-sm transition cursor-pointer ${
              productTab === t
                ? "bg-indigo-600 text-white shadow"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-indigo-50"
            }`}
          >
            {t === "products" ? "Produk" : "Per Kategori"}
          </button>
        ))}
      </div>

      {productTab === "products" && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <StatTile
              icon={DollarSign}
              label="Pendapatan"
              value={fmtCompact(summary.totalRevenue)}
              color="indigo"
              subtext={
                previousSummary && range !== "all"
                  ? `${revenueGrowth >= 0 ? "▲" : "▼"} ${Math.abs(revenueGrowth).toFixed(1)}% vs sebelumnya`
                  : undefined
              }
            />
            <StatTile icon={TrendingUp} label="Laba" value={fmtCompact(summary.totalProfit)} color="emerald" />
            <StatTile icon={Package} label="Jumlah Terjual" value={String(summary.totalQuantity)} color="purple" />
            <StatTile icon={Percent} label="Margin" value={`${margin}%`} color="amber" />
          </div>

          {/* Revenue by product chart */}
          <div className="bg-white rounded-2xl p-4 sm:p-8 shadow-lg border border-gray-100">
            <h2 className="text-lg font-semibold mb-6 text-indigo-700">Pendapatan per Produk</h2>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={data}>
                <XAxis dataKey="productName" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => fmtCompact(v)} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs space-y-0.5">
                        <p className="font-semibold text-gray-700 mb-1">{label}</p>
                        <p className="text-indigo-600">Pendapatan: {fmtCompact(Number(payload[0]?.value ?? 0))}</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="revenue" radius={[8, 8, 0, 0]} fill="#6366F1" />
              </BarChart>
            </ResponsiveContainer>
            {/* AI Insight for products - placed close to relevant chart */}
            {data.length > 0 && (
              <div className="mt-4">
                <AIInsightLabel text={insights.products?.insight} />
              </div>
            )}
          </div>

          {/* Product table */}
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-x-auto">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-indigo-700">Rincian Detail</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-indigo-50 text-indigo-700">
                <tr>
                  <th className="text-left px-3 sm:px-5 py-2 sm:py-3 font-semibold">Produk</th>
                  <th className="text-right px-3 sm:px-5 py-2 sm:py-3 font-semibold">Qty</th>
                  <th className="text-right px-3 sm:px-5 py-2 sm:py-3 font-semibold">Pendapatan</th>
                  <th className="text-right px-3 sm:px-5 py-2 sm:py-3 font-semibold hidden sm:table-cell">Biaya</th>
                  <th className="text-right px-3 sm:px-5 py-2 sm:py-3 font-semibold">Laba</th>
                  <th className="text-right px-3 sm:px-5 py-2 sm:py-3 font-semibold">Margin</th>
                  <th className="text-right px-3 sm:px-5 py-2 sm:py-3 font-semibold hidden sm:table-cell">
                    Kontribusi
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-gray-400">
                      Belum ada data
                    </td>
                  </tr>
                ) : (
                  data.slice((page - 1) * pageSize, page * pageSize).map((p, idx) => {
                    const contribution = summary.totalRevenue > 0 ? (p.revenue / summary.totalRevenue) * 100 : 0;
                    return (
                      <tr
                        key={p.productId}
                        className={`border-b border-gray-100 ${idx % 2 === 0 ? "bg-white" : "bg-indigo-50"} hover:bg-indigo-100`}
                      >
                        <td className="px-3 sm:px-5 py-2 sm:py-3 font-semibold text-indigo-700">
                          <span className="inline-block bg-indigo-100 text-indigo-700 rounded-lg px-2 py-0.5 text-xs font-medium truncate max-w-30 sm:max-w-none">
                            {p.productName}
                          </span>
                        </td>
                        <td className="px-3 sm:px-5 py-2 sm:py-3 text-right text-gray-700">{p.quantitySold}</td>
                        <td className="px-3 sm:px-5 py-2 sm:py-3 text-right font-semibold text-gray-700 whitespace-nowrap">
                          {fmtCompact(p.revenue)}
                        </td>
                        <td className="px-3 sm:px-5 py-2 sm:py-3 text-right text-gray-700 whitespace-nowrap hidden sm:table-cell">
                          {fmtCompact(p.cost)}
                        </td>
                        <td className="px-3 sm:px-5 py-2 sm:py-3 text-right text-green-600 font-bold whitespace-nowrap">
                          {fmtCompact(p.profit)}
                        </td>
                        <td className="px-3 sm:px-5 py-2 sm:py-3 text-right">
                          <span className="bg-green-50 text-green-700 rounded px-2 py-0.5 text-xs font-semibold">
                            {p.profitMargin.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-3 sm:px-5 py-2 sm:py-3 text-right hidden sm:table-cell">
                          <span className="bg-yellow-50 text-yellow-700 rounded px-2 py-0.5 text-xs font-semibold">
                            {contribution.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
                <span className="text-sm text-gray-500">
                  Page <strong>{page}</strong> dari <strong>{totalPages}</strong>
                </span>
                <div className="flex gap-1">
                  <button
                    className="w-8 h-8 rounded-full border border-gray-300 bg-white text-gray-700 font-bold hover:bg-indigo-50 disabled:opacity-40"
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                  >
                    ‹
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                    .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                      if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push("...");
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((item, idx) =>
                      item === "..." ? (
                        <span key={`e${idx}`} className="w-8 h-8 flex items-center justify-center text-gray-400">
                          …
                        </span>
                      ) : (
                        <button
                          key={item}
                          className={`w-8 h-8 rounded-full font-bold border transition ${item === page ? "bg-indigo-600 text-white shadow" : "bg-white text-gray-700 hover:bg-indigo-50 border-gray-300"}`}
                          onClick={() => setPage(item as number)}
                          disabled={item === page}
                        >
                          {item}
                        </button>
                      ),
                    )}
                  <button
                    className="w-8 h-8 rounded-full border border-gray-300 bg-white text-gray-700 font-bold hover:bg-indigo-50 disabled:opacity-40"
                    disabled={page === totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    ›
                  </button>
                </div>
                <select
                  className="px-2 py-1 rounded-xl border border-gray-300 text-sm bg-white"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  {[10, 20, 50].map((s) => (
                    <option key={s} value={s}>
                      {s} per halaman
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </>
      )}

      {productTab === "categories" && (
        <>
          {/* Category pie chart */}
          <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-100">
            <h2 className="text-lg font-semibold mb-6 text-indigo-700">Kontribusi Pendapatan per Kategori</h2>
            {categoryData.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-gray-400">Belum ada data kategori</div>
            ) : (
              <div className="flex flex-col md:flex-row gap-8 items-center">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={categoryData}
                      dataKey="revenue"
                      nameKey="categoryName"
                      cx="50%"
                      cy="50%"
                      outerRadius={110}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      label={(props: any) => `${props.categoryName} ${Number(props.contribution).toFixed(1)}%`}
                    >
                      {categoryData.map((_, idx) => (
                        <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs space-y-0.5">
                            <p className="font-semibold text-gray-700 mb-1">{payload[0].name}</p>
                            <p className="text-indigo-600">Pendapatan: {fmtCompact(Number(payload[0].value ?? 0))}</p>
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-2 min-w-40">
                  {categoryData.map((cat, idx) => (
                    <div key={cat.categoryId ?? idx} className="flex items-center gap-2 text-sm">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                      />
                      <span className="text-gray-700 font-medium">{cat.categoryName}</span>
                      <span className="ml-auto text-indigo-600 font-semibold">{cat.contribution.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Category table */}
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-x-auto">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-indigo-700">Rincian Kategori</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-indigo-50 text-indigo-700">
                <tr>
                  <th className="text-left px-3 sm:px-5 py-2 sm:py-3 font-semibold">Kategori</th>
                  <th className="text-right px-3 sm:px-5 py-2 sm:py-3 font-semibold">Qty</th>
                  <th className="text-right px-3 sm:px-5 py-2 sm:py-3 font-semibold">Pendapatan</th>
                  <th className="text-right px-3 sm:px-5 py-2 sm:py-3 font-semibold hidden sm:table-cell">Biaya</th>
                  <th className="text-right px-3 sm:px-5 py-2 sm:py-3 font-semibold">Laba</th>
                  <th className="text-right px-3 sm:px-5 py-2 sm:py-3 font-semibold">Margin</th>
                  <th className="text-right px-3 sm:px-5 py-2 sm:py-3 font-semibold hidden sm:table-cell">
                    Kontribusi
                  </th>
                </tr>
              </thead>
              <tbody>
                {categoryData.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-gray-400">
                      Belum ada data
                    </td>
                  </tr>
                ) : (
                  categoryData.map((cat, idx) => (
                    <tr
                      key={cat.categoryId ?? idx}
                      className={`border-b border-gray-100 ${idx % 2 === 0 ? "bg-white" : "bg-indigo-50"} hover:bg-indigo-100`}
                    >
                      <td className="px-3 sm:px-5 py-2 sm:py-3 font-semibold">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{
                              backgroundColor: COLORS[idx % COLORS.length],
                            }}
                          />
                          <span className="text-indigo-700 truncate max-w-25 sm:max-w-none">
                            {cat.categoryName}
                          </span>
                        </span>
                      </td>
                      <td className="px-3 sm:px-5 py-2 sm:py-3 text-right text-gray-700">{cat.quantitySold}</td>
                      <td className="px-3 sm:px-5 py-2 sm:py-3 text-right font-semibold text-gray-700 whitespace-nowrap">
                        {fmtCompact(cat.revenue)}
                      </td>
                      <td className="px-3 sm:px-5 py-2 sm:py-3 text-right text-gray-700 whitespace-nowrap hidden sm:table-cell">
                        {fmtCompact(cat.cost)}
                      </td>
                      <td className="px-3 sm:px-5 py-2 sm:py-3 text-right text-green-600 font-bold whitespace-nowrap">
                        {fmtCompact(cat.profit)}
                      </td>
                      <td className="px-3 sm:px-5 py-2 sm:py-3 text-right">
                        <span className="bg-green-50 text-green-700 rounded px-2 py-0.5 text-xs font-semibold">
                          {cat.margin.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-3 sm:px-5 py-2 sm:py-3 text-right hidden sm:table-cell">
                        <span className="bg-yellow-50 text-yellow-700 rounded px-2 py-0.5 text-xs font-semibold">
                          {cat.contribution.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
// ═══════════════════════════════════════════════════════

// ─── 7-day rolling average helper ─────────────
function rollingAvg(data: { revenue: number }[], window = 7) {
  return data.map((_, i) => {
    const slice = data.slice(Math.max(0, i - window + 1), i + 1);
    if (slice.length < 3) return null;
    return Math.round(slice.reduce((s, d) => s + d.revenue, 0) / slice.length);
  });
}

function GrowthSection() {
  const [granularity, setGranularity] = useState<Granularity>("30d");
  const [dailyData, setDailyData] = useState<DailyPoint[]>([]);
  const [hourlyData, setHourlyData] = useState<HourlyPoint[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlyPoint[]>([]);
  const [growth, setGrowth] = useState<GrowthComparison | null>(null);
  const [forecastData, setForecastData] = useState<BizForecastDay[]>([]);
  const [hasSufficientData, setHasSufficientData] = useState(true);
  const [nonZeroRevenueDays, setNonZeroRevenueDays] = useState(0);
  const [minDataDays, setMinDataDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const insights = useInsights();

  const fetchGranularity = useCallback(async (g: Granularity) => {
    setLoading(true);
    try {
      if (g === "24h") {
        const res = await fetch("/api/analytics/hourly");
        const json = await res.json();
        setHourlyData(json.data ?? []);
      } else if (g === "7d" || g === "30d") {
        // 7d = 6 days back, 30d = 29 days back (30 days total)
        const days = g === "7d" ? 6 : 29;
        const now = new Date();
        const from = new Date(now);
        from.setDate(from.getDate() - days);
        const res = await fetch(`/api/analytics/daily?from=${from.toISOString()}&to=${now.toISOString()}`);
        const json = await res.json();
        setDailyData(json.data ?? []);
      } else {
        const now = new Date();
        const months: MonthlyPoint[] = [];
        for (let i = 5; i >= 0; i--) {
          const y = new Date(now.getFullYear(), now.getMonth() - i).getFullYear();
          const m = new Date(now.getFullYear(), now.getMonth() - i).getMonth() + 1;
          const res = await fetch(`/api/analytics/monthly?year=${y}&month=${m}`);
          const json = await res.json();
          months.push({
            date: `${y}-${String(m).padStart(2, "0")}`,
            revenue: (json.data ?? []).reduce((s: number, d: { revenue: number }) => s + d.revenue, 0),
            profit: (json.data ?? []).reduce((s: number, d: { profit: number }) => s + d.profit, 0),
          });
        }
        setMonthlyData(months);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  async function fetchGrowth() {
    try {
      const now = new Date();
      const res = await fetch(`/api/analytics/growth?year=${now.getFullYear()}&month=${now.getMonth() + 1}`);
      const json = await res.json();
      if (json.data) setGrowth(json.data);
    } catch {
      /* non-critical */
    }
  }

  async function fetchForecast() {
    try {
      const res = await fetch("/api/analytics/forecast-cached");
      if (res.ok) {
        const json = await res.json();
        setForecastData(json.businessForecast ?? []);
        setHasSufficientData(json.hasSufficientData ?? false);
        setNonZeroRevenueDays(json.nonZeroRevenueDays ?? 0);
        setMinDataDays(json.minDataDays ?? 7);
      }
    } catch {
      /* non-critical */
    }
  }

  useEffect(() => {
    fetchGrowth();
    fetchForecast();
    fetchGranularity(granularity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleGranularity(g: string) {
    const gran = g as Granularity;
    setGranularity(gran);
    fetchGranularity(gran);
  }

  // Derived KPIs
  const totalRevenue =
    granularity === "24h"
      ? hourlyData.reduce((s, d) => s + d.revenue, 0)
      : dailyData.reduce((s, d) => s + d.revenue, 0);
  const totalProfit =
    granularity === "24h" ? hourlyData.reduce((s, d) => s + d.profit, 0) : dailyData.reduce((s, d) => s + d.profit, 0);
  const activeHours = hourlyData.filter((d) => d.revenue > 0).length;
  const aov =
    granularity === "24h"
      ? activeHours > 0
        ? Math.round(totalRevenue / activeHours)
        : 0
      : dailyData.length > 0
        ? Math.round(totalRevenue / dailyData.length)
        : 0;
  const last7 = dailyData.slice(-7);
  const avg7rev = last7.length > 0 ? Math.round(last7.reduce((s, d) => s + d.revenue, 0) / last7.length) : 0;

  // Chart-ready data with forecast appended
  const movingAvgValues = rollingAvg(dailyData, 7);
  const dailyChartData = dailyData.map((d, i) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      timeZone: "Asia/Jakarta",
    }),
    movingAvg: movingAvgValues[i],
    marginPct: d.revenue > 0 ? Math.round((d.profit / d.revenue) * 1000) / 10 : null,
    isForecast: false,
    predicted: null as number | null,
    predictedRevenue: null as number | null,
    predictedProfit: null as number | null,
  }));

  // Hourly chart data
  const hourlyChartData = hourlyData.map((d) => ({
    ...d,
    label: d.hour,
    marginPct: d.revenue > 0 ? Math.round((d.profit / d.revenue) * 1000) / 10 : null,
  }));

  // Append forecast points to chart (semi-transparent predicted bars)
  // Calculate rolling 7-day average for forecast (continuing from actual data)
  // Combine last 6 actual revenues with forecast revenues for rolling calculation
  const lastActualRevenues = dailyChartData.slice(-6).map((d) => d.revenue ?? 0);
  const forecastRevenues = forecastData.map((f) => f.predictedRevenue);
  const combinedRevenues = [...lastActualRevenues, ...forecastRevenues];

  const forecastPoints = forecastData.map((f, i) => {
    // For each forecast day, calculate 7-day rolling average
    // using previous actual data + forecast data up to this point
    const startIdx = i; // starts at 0 which means lastActualRevenues[0..5] + forecastRevenues[0]
    const windowValues = combinedRevenues.slice(startIdx, startIdx + 7);
    const rollingAvg =
      windowValues.length > 0 ? Math.round(windowValues.reduce((sum, v) => sum + v, 0) / windowValues.length) : 0;

    return {
      date: f.date,
      revenue: null as number | null,
      profit: null as number | null,
      growthRate: 0,
      label: new Date(f.date).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        timeZone: "Asia/Jakarta",
      }),
      movingAvg: null,
      marginPct: null,
      isForecast: true,
      predicted: null as number | null,
      predictedRevenue: f.predictedRevenue,
      predictedProfit: f.predictedProfit,
      predictedMovingAvg: rollingAvg,
      lowerBound: f.lowerBound,
      upperBound: f.upperBound,
      confidenceScore: f.confidenceScore,
      // Asymmetric error deltas for ErrorBar
      revBoundLower: f.predictedRevenue - f.lowerBound,
      revBoundUpper: f.upperBound - f.predictedRevenue,
    };
  });

  // Include forecast for both 7d and 30d views only when we have sufficient data
  const combinedChartData =
    (granularity === "30d" || granularity === "7d") && hasSufficientData
      ? [...dailyChartData, ...forecastPoints]
      : dailyChartData;

  const avgMargin = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 1000) / 10 : 0;
  const monthlyChartData = monthlyData.map((d) => ({
    ...d,
    label: new Date(d.date + "-01").toLocaleDateString("id-ID", {
      month: "short",
      year: "2-digit",
      timeZone: "Asia/Jakarta",
    }),
  }));

  const isHourly = granularity === "24h";
  const isDaily = granularity === "7d" || granularity === "30d";
  const xInterval = granularity === "24h" ? 2 : granularity === "7d" ? 0 : 3;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-indigo-700 flex items-center gap-2 mb-1">
          <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6" /> Analitik Pertumbuhan
        </h2>
        <p className="text-sm text-gray-500">
          {granularity === "24h"
            ? "Performa per jam dalam 24 jam terakhir."
            : `Batang menunjukkan nilai ${granularity === "6mo" ? "bulanan" : "harian"} aktual. Garis putus-putus oranye adalah rata-rata bergulir 7 hari.`}
          {hasSufficientData &&
            forecastData.length > 0 &&
            (granularity === "30d" || granularity === "7d") &&
            " Batang transparan di ujung kanan menunjukkan prediksi AI untuk " +
              forecastData.length +
              " hari ke depan."}
        </p>
        {!hasSufficientData && (granularity === "30d" || granularity === "7d") && (
          <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-800">Data belum cukup untuk prediksi AI</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Diperlukan minimal <span className="font-bold">{minDataDays} hari</span> dengan transaksi dalam 30
                  hari terakhir.
                </p>
                {/* Progress bar */}
                <div className="mt-2">
                  <div className="flex justify-between text-xs text-amber-700 mb-1">
                    <span>Progress data</span>
                    <span className="font-bold">
                      {nonZeroRevenueDays} / {minDataDays} hari
                    </span>
                  </div>
                  <div className="w-full bg-amber-200 rounded-full h-2">
                    <div
                      className="bg-amber-500 h-2 rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, (nonZeroRevenueDays / minDataDays) * 100)}%`,
                      }}
                    />
                  </div>
                  <p className="text-xs text-amber-600 mt-1">
                    {nonZeroRevenueDays === 0
                      ? "Belum ada transaksi tercatat."
                      : `Butuh ${Math.max(0, minDataDays - nonZeroRevenueDays)} hari lagi untuk mengaktifkan prediksi.`}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* KPI cards - for hourly and daily views */}
      {(isHourly || isDaily) && (hourlyData.length > 0 || dailyData.length > 0) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <StatTile
            icon={DollarSign}
            label="Total Pendapatan"
            value={fmtCompact(totalRevenue)}
            color="indigo"
            subtext={
              granularity === "24h" ? "24 jam terakhir" : granularity === "7d" ? "7 hari terakhir" : "30 hari terakhir"
            }
          />
          <StatTile
            icon={TrendingUp}
            label="Total Laba"
            value={fmtCompact(totalProfit)}
            color="emerald"
            subtext={`Margin: ${totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : "0"}%`}
          />
          <StatTile
            icon={BarChart3}
            label={isHourly ? "Rata-rata Per Jam" : "Rata-rata Harian"}
            value={aov > 0 ? fmtCompact(aov) : "-"}
            color="purple"
            subtext={isHourly ? `Dari ${activeHours} jam aktif` : `${dailyData.length} hari terakhir`}
          />
          <StatTile
            icon={Zap}
            label={isHourly ? "Total Transaksi" : "Rata-rata 7 Hari"}
            value={
              isHourly
                ? String(hourlyData.reduce((s, d) => s + d.transactions, 0))
                : avg7rev > 0
                  ? fmtCompact(avg7rev)
                  : "-"
            }
            color="blue"
            subtext={isHourly ? "Dalam 24 jam terakhir" : "Rata-rata bergulir"}
          />
        </div>
      )}

      {/* MoM comparison strip */}
      {growth && !isHourly && (
        <div className="flex flex-col sm:flex-row flex-wrap gap-3">
          <div className="flex items-center gap-2 sm:gap-3 bg-indigo-50 border border-indigo-100 rounded-xl px-3 sm:px-4 py-2 sm:py-3 min-w-0">
            <span className="text-xs text-indigo-600 font-semibold whitespace-nowrap">Pendapatan MoM</span>
            <span className="text-xs sm:text-sm font-bold text-indigo-800 truncate">
              {fmtCompact(growth.currentRevenue)}
            </span>
            <GrowthBadge value={growth.revenueGrowth} />
          </div>
          <div className="flex items-center gap-2 sm:gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-3 sm:px-4 py-2 sm:py-3 min-w-0">
            <span className="text-xs text-emerald-600 font-semibold whitespace-nowrap">Laba MoM</span>
            <span className="text-xs sm:text-sm font-bold text-emerald-800 truncate">
              {fmtCompact(growth.currentProfit)}
            </span>
            <GrowthBadge value={growth.profitGrowth} />
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-xs text-gray-400 italic bg-white border border-gray-100 rounded-xl px-4 py-3">
            <Info className="w-3.5 h-3.5 shrink-0" />
            Pertumbuhan bermakna jika volume transaksi konsisten
          </div>
        </div>
      )}

      {/* View switcher */}
      <div className="flex gap-2 flex-wrap">
        {(["24h", "7d", "30d", "6mo"] as Granularity[]).map((g) => (
          <button
            key={g}
            onClick={() => handleGranularity(g)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${
              granularity === g
                ? "bg-indigo-600 text-white shadow"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-indigo-50"
            }`}
          >
            {g === "24h" ? "24 Jam" : g === "7d" ? "7 Hari" : g === "30d" ? "30 Hari" : "6 Bulan"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl shadow p-16 flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : isHourly ? (
        <>
          {/* Hourly chart */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <div className="flex items-start justify-between mb-1">
              <h3 className="text-base font-bold text-indigo-700">Pendapatan &amp; Laba Per Jam (24 Jam Terakhir)</h3>
            </div>
            <div className="flex flex-wrap gap-4 mb-5 mt-1">
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-3 h-3 rounded bg-indigo-400 inline-block" />
                Pendapatan
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-3 h-3 rounded bg-emerald-300 inline-block" />
                Laba
              </span>
            </div>
            {hourlyChartData.length === 0 ? (
              <p className="text-center text-gray-400 py-12">Tidak ada data untuk periode ini.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={hourlyChartData} barCategoryGap="15%" barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    axisLine={false}
                    tickLine={false}
                    interval={xInterval}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#9ca3af" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => fmtCompact(v)}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs space-y-0.5">
                          <p className="font-semibold text-gray-700 mb-1">{label}</p>
                          {payload.map((p, i) =>
                            p.value != null ? (
                              <p key={i} style={{ color: p.color }}>
                                {p.name === "profit" ? "Laba" : "Pendapatan"}: {fmtCompact(Number(p.value))}
                              </p>
                            ) : null,
                          )}
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="revenue" fill="#818cf8" radius={[4, 4, 0, 0]} name="revenue" />
                  <Bar dataKey="profit" fill="#6ee7b7" radius={[4, 4, 0, 0]} name="profit" />
                </ComposedChart>
              </ResponsiveContainer>
            )}
            {/* AI Insight for hourly */}
            {hourlyData.length > 0 && (
              <div className="mt-4">
                <AIInsightLabel text={insights.revenue?.insight} />
              </div>
            )}
          </div>
        </>
      ) : isDaily ? (
        <>
          {/* Combo chart: Revenue bars + Profit bars + rolling avg line + forecast */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <div className="flex items-start justify-between mb-1">
              <h3 className="text-base font-bold text-indigo-700">
                Pendapatan &amp; Laba Harian (
                {granularity === "7d"
                  ? hasSufficientData
                    ? "1 Minggu + Prediksi"
                    : "1 Minggu"
                  : hasSufficientData
                    ? "30 Hari + 7 Hari Prediksi"
                    : "30 Hari"}
                )
              </h3>
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-4 mb-5 mt-1">
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-3 h-3 rounded bg-indigo-400 inline-block" />
                Pendapatan
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-3 h-3 rounded bg-emerald-300 inline-block" />
                Laba
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="inline-block w-6 border-t-2 border-dashed border-orange-400" />
                Rata-rata 7 hari
              </span>
              {hasSufficientData && forecastData.length > 0 && (
                <>
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="w-3 h-3 rounded bg-indigo-300/50 inline-block border border-dashed border-indigo-400" />
                    Prediksi Pendapatan
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="w-3 h-3 rounded bg-emerald-300/50 inline-block border border-dashed border-emerald-400" />
                    Prediksi Laba
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="inline-block w-6 border-t-2 border-dashed border-violet-500" />
                    Prediksi Rata-rata 7 hari
                  </span>
                </>
              )}
            </div>
            {combinedChartData.length === 0 ? (
              <p className="text-center text-gray-400 py-12">Tidak ada data untuk periode ini.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={combinedChartData} barCategoryGap="15%" barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    axisLine={false}
                    tickLine={false}
                    interval={xInterval}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#9ca3af" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => fmtCompact(v)}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]?.payload as {
                        isForecast?: boolean;
                        predictedRevenue?: number;
                        predictedProfit?: number;
                        lowerBound?: number;
                        upperBound?: number;
                        confidenceScore?: number;
                      };
                      if (d?.isForecast) {
                        return (
                          <div className="bg-white border border-violet-200 rounded-xl shadow-lg p-3 text-xs space-y-0.5">
                            <p className="font-semibold text-violet-700 mb-1">{label} — Prediksi</p>
                            <p className="text-indigo-600">Pendapatan: {fmtCompact(d.predictedRevenue ?? 0)}</p>
                            <p className="text-emerald-600">Laba: {fmtCompact(d.predictedProfit ?? 0)}</p>
                            <p className="text-gray-400 mt-1">Kepercayaan: {d.confidenceScore ?? 0}%</p>
                          </div>
                        );
                      }
                      const labelMap: Record<string, string> = {
                        revenue: "Pendapatan",
                        profit: "Laba",
                        movingAvg: "Rata-rata 7 hari",
                        predictedRevenue: "Prediksi Pendapatan",
                        predictedProfit: "Prediksi Laba",
                        predictedMovingAvg: "Prediksi Rata-rata 7 hari",
                      };
                      return (
                        <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs space-y-0.5">
                          <p className="font-semibold text-gray-700 mb-1">{label}</p>
                          {payload.map((p, i) =>
                            p.value != null ? (
                              <p key={i} style={{ color: p.color }}>
                                {labelMap[p.name as string] ?? p.name}: {fmtCompact(Number(p.value))}
                              </p>
                            ) : null,
                          )}
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="revenue" fill="#818cf8" radius={[4, 4, 0, 0]} name="revenue" />
                  <Bar dataKey="profit" fill="#6ee7b7" radius={[4, 4, 0, 0]} name="profit" />
                  {/* Forecast bars — semi-transparent, appended after actual data */}
                  {hasSufficientData && forecastData.length > 0 && (
                    <Bar
                      dataKey="predictedRevenue"
                      fill="#818cf8"
                      fillOpacity={0.35}
                      radius={[4, 4, 0, 0]}
                      name="predictedRevenue"
                      strokeDasharray="4 2"
                      stroke="#818cf8"
                      strokeWidth={1}
                    />
                  )}
                  {hasSufficientData && forecastData.length > 0 && (
                    <Bar
                      dataKey="predictedProfit"
                      fill="#6ee7b7"
                      fillOpacity={0.35}
                      radius={[4, 4, 0, 0]}
                      name="predictedProfit"
                      strokeDasharray="4 2"
                      stroke="#6ee7b7"
                      strokeWidth={1}
                    />
                  )}
                  {/* Forecast boundary reference line */}
                  {hasSufficientData && forecastData.length > 0 && dailyChartData.length > 0 && (
                    <ReferenceLine
                      x={dailyChartData[dailyChartData.length - 1].label}
                      stroke="#8b5cf6"
                      strokeDasharray="6 4"
                      strokeWidth={1.5}
                      label={{
                        value: "Prediksi →",
                        position: "top",
                        fontSize: 10,
                        fill: "#7c3aed",
                      }}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="movingAvg"
                    stroke="#f97316"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                    dot={false}
                    activeDot={{ r: 4, fill: "#f97316" }}
                    connectNulls={false}
                    name="movingAvg"
                  />
                  {/* Forecast 7-day average line */}
                  {hasSufficientData && forecastData.length > 0 && (
                    <Line
                      type="monotone"
                      dataKey="predictedMovingAvg"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      strokeDasharray="5 3"
                      dot={false}
                      activeDot={{ r: 4, fill: "#8b5cf6" }}
                      connectNulls={false}
                      name="predictedMovingAvg"
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            )}
            {/* AI Insight for revenue - placed close to relevant chart */}
            {dailyData.length > 0 && (
              <div className="mt-4">
                <AIInsightLabel text={insights.revenue?.insight} />
              </div>
            )}
          </div>

          {/* Forecast summary card */}
          {hasSufficientData && forecastData.length > 0 && (granularity === "30d" || granularity === "7d") && (
            <div className="bg-linear-to-r from-violet-50 to-indigo-50 rounded-2xl border border-violet-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-5 h-5 text-violet-600" />
                <h3 className="text-sm font-bold text-violet-700">Prediksi {forecastData.length} Hari ke Depan</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
                {forecastData.map((f, i) => (
                  <div
                    key={f.date}
                    className={`bg-white/70 rounded-xl p-3${forecastData.length % 2 !== 0 && i === forecastData.length - 1 ? " col-span-2 sm:col-span-1" : ""}`}
                  >
                    <p className="text-xs text-gray-500">
                      {new Date(f.date).toLocaleDateString("id-ID", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        timeZone: "Asia/Jakarta",
                      })}
                    </p>
                    <p className="text-sm font-bold text-violet-700 mt-1">{fmtCompact(f.predictedRevenue)}</p>
                    <p className="text-xs text-emerald-600 font-semibold">Laba: {fmtCompact(f.predictedProfit ?? 0)}</p>
                    <ConfidenceBadge score={f.confidenceScore} />
                  </div>
                ))}
              </div>
              {/* AI Insight for forecast */}
              {insights.forecast?.insight && (
                <div className="mt-3">
                  <AIInsightLabel text={insights.forecast.insight} />
                </div>
              )}
            </div>
          )}

          {/* ── Sales day frequency strip ──────────────────── */}
          {dailyChartData.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-base font-bold text-indigo-700 mb-1">Sekilas Hari Penjualan</h3>
              <p className="text-xs text-gray-400 mb-4">
                Setiap batang = satu hari. Tinggi = pendapatan relatif. Arahkan kursor untuk detail.
              </p>
              <ResponsiveContainer width="100%" height={100}>
                <BarChart data={dailyChartData} barCategoryGap="15%">
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 9, fill: "#9ca3af" }}
                    axisLine={false}
                    tickLine={false}
                    interval={granularity === "7d" ? 0 : 4}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.[0]) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs space-y-0.5">
                          <p className="font-semibold text-gray-700 mb-1">{d.label}</p>
                          <p className="text-indigo-600">Pendapatan: {fmtCompact(Number(d.revenue))}</p>
                          <p className="text-emerald-600">Laba: {fmtCompact(Number(d.profit))}</p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="revenue" radius={[3, 3, 0, 0]} fill="#a5b4fc" activeBar={{ fill: "#6366f1" }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Margin Trend ──────────────────────────────────────────── */}
          {dailyChartData.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-base font-bold text-indigo-700">Tren Margin</h3>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">
                  Rata-rata {avgMargin}%
                </span>
              </div>
              <p className="text-xs text-gray-400 mb-4">
                Persentase margin laba harian. Area berwarna memudahkan deteksi penurunan di bawah rata-rata.
              </p>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={dailyChartData.filter((d) => d.marginPct !== null)}>
                  <defs>
                    <linearGradient id="marginGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    axisLine={false}
                    tickLine={false}
                    interval={granularity === "7d" ? 0 : 3}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${v}%`}
                    domain={[0, "auto"]}
                  />
                  <ReferenceLine
                    y={avgMargin}
                    stroke="#6b7280"
                    strokeDasharray="4 4"
                    strokeWidth={1}
                    label={{
                      value: `Rata-rata ${avgMargin}%`,
                      position: "right",
                      fontSize: 10,
                      fill: "#6b7280",
                    }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.[0]) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs space-y-0.5">
                          <p className="font-semibold text-gray-700 mb-1">{d.label}</p>
                          <p className="text-emerald-600">Margin: {d.marginPct}%</p>
                          <p className="text-emerald-600">Laba: {fmtCompact(Number(d.profit))}</p>
                          <p className="text-indigo-600">Pendapatan: {fmtCompact(Number(d.revenue))}</p>
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="marginPct"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#marginGrad)"
                    dot={{ r: 3, fill: "#10b981", strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: "#059669" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Daily Summary Table ───────────────────────────────────── */}
          {dailyChartData.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-5 border-b border-gray-100">
                <h3 className="font-bold text-indigo-700 text-sm">Ringkasan Harian</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Rincian {granularity === "7d" ? "7 hari terakhir" : "30 hari terakhir"} — pendapatan, laba, margin
                  &amp; perubahan harian.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-indigo-50 text-indigo-700">
                    <tr>
                      <th className="text-left px-3 sm:px-5 py-2 sm:py-3 font-semibold">Tanggal</th>
                      <th className="text-right px-3 sm:px-5 py-2 sm:py-3 font-semibold">Pendapatan</th>
                      <th className="text-right px-3 sm:px-5 py-2 sm:py-3 font-semibold">Laba</th>
                      <th className="text-right px-3 sm:px-5 py-2 sm:py-3 font-semibold hidden sm:table-cell">
                        Margin
                      </th>
                      <th className="text-right px-3 sm:px-5 py-2 sm:py-3 font-semibold hidden sm:table-cell">
                        vs Sebelumnya
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyChartData.map((d, i) => {
                      const prev = dailyChartData[i - 1];
                      const dod = prev && prev.revenue > 0 ? ((d.revenue - prev.revenue) / prev.revenue) * 100 : null;
                      const margin = d.revenue > 0 ? ((d.profit / d.revenue) * 100).toFixed(1) : null;
                      return (
                        <tr
                          key={d.date}
                          className={`border-b border-gray-50 ${i % 2 === 0 ? "bg-white" : "bg-indigo-50/30"}`}
                        >
                          <td className="px-3 sm:px-5 py-2 sm:py-3 font-medium text-gray-700">{d.label}</td>
                          <td className="px-3 sm:px-5 py-2 sm:py-3 text-right font-semibold text-indigo-700 whitespace-nowrap">
                            {d.revenue > 0 ? fmtCompact(d.revenue) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 sm:px-5 py-2 sm:py-3 text-right text-emerald-600 font-semibold whitespace-nowrap">
                            {d.profit > 0 ? fmtCompact(d.profit) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 sm:px-5 py-2 sm:py-3 text-right hidden sm:table-cell">
                            {margin !== null ? (
                              <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-semibold">
                                {margin}%
                              </span>
                            ) : (
                              <span className="text-gray-300 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-3 sm:px-5 py-2 sm:py-3 text-right hidden sm:table-cell">
                            {dod === null ? (
                              <span className="text-gray-300 text-xs">—</span>
                            ) : (
                              <GrowthBadge value={dod} />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        /* ── Monthly view: grouped bars + summary table ────────────────── */
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <h3 className="text-base font-bold text-indigo-700 mb-1">
              Pendapatan &amp; Laba Bulanan — 6 Bulan Terakhir
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              Batang berdampingan menunjukkan jarak antara pendapatan dan laba setiap bulan.
            </p>
            {monthlyChartData.length === 0 ? (
              <p className="text-center text-gray-400 py-12">Belum ada data bulanan.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={monthlyChartData} barCategoryGap="25%" barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#9ca3af" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => fmtCompact(v)}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs space-y-0.5">
                          <p className="font-semibold text-gray-700 mb-1">{label}</p>
                          {payload.map((p, i) =>
                            p.value != null ? (
                              <p key={i} style={{ color: p.color }}>
                                {p.name === "profit" ? "Laba" : "Pendapatan"}: {fmtCompact(Number(p.value))}
                              </p>
                            ) : null,
                          )}
                        </div>
                      );
                    }}
                  />
                  <Legend formatter={(value) => (value === "revenue" ? "Pendapatan" : "Laba")} />
                  <Bar dataKey="revenue" fill="#818cf8" radius={[4, 4, 0, 0]} name="revenue" />
                  <Bar dataKey="profit" fill="#6ee7b7" radius={[4, 4, 0, 0]} name="profit" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* AI Insight for growth */}
          {monthlyChartData.length > 0 && <AIInsightLabel text={insights.growth?.insight} />}

          {monthlyChartData.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-5 border-b border-gray-100">
                <h3 className="font-bold text-indigo-700 text-sm">Ringkasan Bulanan</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-indigo-50 text-indigo-700">
                    <tr>
                      <th className="text-left px-3 sm:px-5 py-2 sm:py-3 font-semibold">Bulan</th>
                      <th className="text-right px-3 sm:px-5 py-2 sm:py-3 font-semibold">Pendapatan</th>
                      <th className="text-right px-3 sm:px-5 py-2 sm:py-3 font-semibold">Laba</th>
                      <th className="text-right px-3 sm:px-5 py-2 sm:py-3 font-semibold hidden sm:table-cell">
                        Margin
                      </th>
                      <th className="text-right px-3 sm:px-5 py-2 sm:py-3 font-semibold hidden sm:table-cell">
                        vs Sebelumnya
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyChartData.map((m, i) => {
                      const prev = monthlyChartData[i - 1];
                      const mom = prev && prev.revenue > 0 ? ((m.revenue - prev.revenue) / prev.revenue) * 100 : null;
                      const margin = m.revenue > 0 ? ((m.profit / m.revenue) * 100).toFixed(1) : null;
                      return (
                        <tr
                          key={m.date}
                          className={`border-b border-gray-50 ${i % 2 === 0 ? "bg-white" : "bg-indigo-50/30"}`}
                        >
                          <td className="px-3 sm:px-5 py-2 sm:py-3 font-medium text-gray-700">{m.label}</td>
                          <td className="px-3 sm:px-5 py-2 sm:py-3 text-right font-semibold text-indigo-700 whitespace-nowrap">
                            {m.revenue > 0 ? fmtCompact(m.revenue) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 sm:px-5 py-2 sm:py-3 text-right text-emerald-600 font-semibold whitespace-nowrap">
                            {m.profit > 0 ? fmtCompact(m.profit) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 sm:px-5 py-2 sm:py-3 text-right hidden sm:table-cell">
                            {margin !== null ? (
                              <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-semibold">
                                {margin}%
                              </span>
                            ) : (
                              <span className="text-gray-300 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-3 sm:px-5 py-2 sm:py-3 text-right hidden sm:table-cell">
                            {mom === null ? (
                              <span className="text-gray-300 text-xs">—</span>
                            ) : (
                              <GrowthBadge value={mom} />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// HEALTH SECTION
// ═══════════════════════════════════════════════════════

function HealthSection() {
  const [series, setSeries] = useState<HealthPoint[]>([]);
  const [latest, setLatest] = useState<HealthPoint | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const insights = useInsights();

  async function fetchData(d = days) {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics/health?days=${d}`);
      if (!res.ok) throw new Error("Failed to fetch health scores");
      const json = await res.json();
      setSeries(json.data ?? []);
      setLatest(json.latest ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const chartData = series.map((d) => ({
    ...d,
    date: new Date(d.date).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      timeZone: "Asia/Jakarta",
    }),
  }));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-indigo-700 flex items-center gap-2">
            <HeartPulse className="w-5 h-5 sm:w-6 sm:h-6" /> Kesehatan Bisnis
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Skor dihitung dari pendapatan, margin profit, efisiensi limbah, dan stabilitas penjualan 30 hari terakhir
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              onClick={() => {
                setDays(d);
                fetchData(d);
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition cursor-pointer ${days === d ? "bg-indigo-600 text-white shadow" : "bg-white border border-gray-200 text-gray-600 hover:bg-indigo-50"}`}
            >
              {d}d
            </button>
          ))}
          <button
            onClick={() => fetchData()}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm bg-white border border-gray-200 px-3 py-1.5 rounded-xl hover:bg-indigo-50 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {latest && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800">Snapshot Saat Ini</h3>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${classColors(latest.classification)}`}>
                {latest.classification}
              </span>
            </div>
            <div className="space-y-3">
              {SCORE_LINES.map((s) => (
                <GaugeBar
                  key={s.key}
                  label={s.label}
                  value={latest[s.key as keyof HealthPoint] as number}
                  color={s.color}
                  max={s.max}
                  description={s.description}
                  tip={s.tip}
                />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {SCORE_LINES.map((s) => {
              const val = latest[s.key as keyof HealthPoint] as number;
              const percentage = (val / s.max) * 100;
              return (
                <div
                  key={s.key}
                  className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 cursor-help"
                  title={s.tip}
                >
                  <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                  <p className="text-lg sm:text-2xl font-bold" style={{ color: s.color }}>
                    {val.toFixed(1)}
                    <span className="text-sm font-normal text-gray-400">/{s.max}</span>
                  </p>
                  <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
                    <div
                      className="h-1.5 rounded-full"
                      style={{
                        width: `${Math.min(100, percentage)}%`,
                        backgroundColor: s.color,
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1.5 line-clamp-1">{s.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* AI Insight */}
      {series.length > 0 && insights.health?.insight && <AIInsightLabel text={insights.health.insight} />}

      {/* Cara Perhitungan Skor */}
      <div className="bg-linear-to-br from-indigo-50 to-white rounded-2xl shadow-sm border border-indigo-100 p-6">
        <h3 className="font-bold text-indigo-700 mb-5 flex items-center gap-2">
          <Info className="w-4 h-4" /> Cara Perhitungan Skor
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h4 className="font-semibold text-gray-700 text-sm">Sub-Skor (masing-masing 0–25 poin)</h4>
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
              <p className="text-sm font-semibold text-emerald-800">Pendapatan</p>
              <p className="text-xs text-emerald-700 mt-1">
                Target = 120% dari rata-rata pendapatan bulanan bisnis kamu sendiri (min Rp 100.000). Skor naik
                proporsional hingga target tercapai.
              </p>
              <code className="text-xs bg-white/70 px-2 py-0.5 rounded mt-1.5 inline-block text-emerald-900 font-mono">
                min(25, pendapatan30h / target × 25)
              </code>
            </div>
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
              <p className="text-sm font-semibold text-amber-800">Margin Profit</p>
              <p className="text-xs text-amber-700 mt-1">
                Target margin 50%. Linear: 0% margin = 0 poin, 50% ke atas = 25 poin penuh.
              </p>
              <code className="text-xs bg-white/70 px-2 py-0.5 rounded mt-1.5 inline-block text-amber-900 font-mono">
                min(25, margin% / 50 × 25)
              </code>
            </div>
            <div className="p-3 bg-red-50 rounded-xl border border-red-100">
              <p className="text-sm font-semibold text-red-800">Efisiensi Limbah</p>
              <p className="text-xs text-red-700 mt-1">
                Skor terbalik: limbah rendah = poin tinggi. Di bawah 1% = 25 poin. Setiap +1% mengurangi 5 poin. 5% ke
                atas = 0 poin.
              </p>
              <code className="text-xs bg-white/70 px-2 py-0.5 rounded mt-1.5 inline-block text-red-900 font-mono">
                max(0, 25 - (waste% × 5))
              </code>
            </div>
            <div className="p-3 bg-violet-50 rounded-xl border border-violet-100">
              <p className="text-sm font-semibold text-violet-800">Stabilitas Penjualan</p>
              <p className="text-xs text-violet-700 mt-1">
                Menggunakan Coefficient of Variation (CoV) pendapatan harian. CoV = standar deviasi dibagi rata-rata.
                CoV mendekati 0 (sangat konsisten) = 25 poin. CoV 1 ke atas (sangat fluktuatif) = 0 poin. Default 12.5
                jika data kurang dari 7 hari.
              </p>
              <code className="text-xs bg-white/70 px-2 py-0.5 rounded mt-1.5 inline-block text-violet-900 font-mono">
                max(0, min(25, 25 - CoV × 25))
              </code>
            </div>
          </div>
          <div className="space-y-4">
            <h4 className="font-semibold text-gray-700 text-sm">Klasifikasi Skor Total (0–100)</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between px-4 py-2.5 bg-green-50 rounded-xl border border-green-100">
                <span className="text-sm font-bold text-green-700">Excellent</span>
                <span className="text-xs text-green-600 font-semibold">80–100 poin</span>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5 bg-blue-50 rounded-xl border border-blue-100">
                <span className="text-sm font-bold text-blue-700">Healthy</span>
                <span className="text-xs text-blue-600 font-semibold">60–79 poin</span>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5 bg-yellow-50 rounded-xl border border-yellow-100">
                <span className="text-sm font-bold text-yellow-700">Warning</span>
                <span className="text-xs text-yellow-600 font-semibold">40–59 poin</span>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5 bg-red-50 rounded-xl border border-red-100">
                <span className="text-sm font-bold text-red-700">Critical</span>
                <span className="text-xs text-red-600 font-semibold">Di bawah 40 poin</span>
              </div>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              Skor dihitung otomatis setiap hari dari data 30 hari terakhir. Keempat sub-skor dijumlahkan menjadi skor
              total 0 hingga 100.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
        <h3 className="text-lg font-bold text-indigo-700 mb-6">Tren Skor</h3>
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : chartData.length === 0 ? (
          <p className="text-center text-gray-400 py-10">Belum ada data skor kesehatan.</p>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs space-y-0.5">
                      <p className="font-semibold text-gray-700 mb-1">{label}</p>
                      {payload.map((p, i) =>
                        p.value != null ? (
                          <p key={i} style={{ color: p.color as string }}>
                            {p.name}: {p.value}
                          </p>
                        ) : null,
                      )}
                    </div>
                  );
                }}
              />
              <Legend />
              {SCORE_LINES.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {series.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <h3 className="font-bold text-indigo-700">Riwayat Klasifikasi</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-indigo-50 text-indigo-700">
                <tr>
                  <th className="text-left px-3 sm:px-5 py-2 sm:py-3">Tanggal</th>
                  <th className="text-right px-3 sm:px-5 py-2 sm:py-3">Overall</th>
                  <th className="text-right px-3 sm:px-5 py-2 sm:py-3 hidden sm:table-cell">Pendapatan</th>
                  <th className="text-right px-3 sm:px-5 py-2 sm:py-3 hidden sm:table-cell">Margin</th>
                  <th className="text-right px-3 sm:px-5 py-2 sm:py-3 hidden sm:table-cell">Efisiensi</th>
                  <th className="text-right px-3 sm:px-5 py-2 sm:py-3 hidden sm:table-cell">Stabilitas</th>
                  <th className="text-center px-3 sm:px-5 py-2 sm:py-3">Klasifikasi</th>
                </tr>
              </thead>
              <tbody>
                {[...series]
                  .reverse()
                  .slice(0, 14)
                  .map((d, i) => (
                    <tr
                      key={d.date}
                      className={`border-b border-gray-50 ${i % 2 === 0 ? "bg-white" : "bg-indigo-50/30"}`}
                    >
                      <td className="px-3 sm:px-5 py-2 font-medium text-gray-700 whitespace-nowrap">
                        {new Date(d.date).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "2-digit",
                          timeZone: "Asia/Jakarta",
                        })}
                      </td>
                      <td className="px-3 sm:px-5 py-2 text-right font-bold text-indigo-700">
                        {d.overallScore.toFixed(1)}
                      </td>
                      <td className="px-3 sm:px-5 py-2 text-right text-gray-600 hidden sm:table-cell">
                        {d.revenueScore.toFixed(1)}
                      </td>
                      <td className="px-3 sm:px-5 py-2 text-right text-gray-600 hidden sm:table-cell">
                        {d.profitScore.toFixed(1)}
                      </td>
                      <td className="px-3 sm:px-5 py-2 text-right text-gray-600 hidden sm:table-cell">
                        {d.wasteScore.toFixed(1)}
                      </td>
                      <td className="px-3 sm:px-5 py-2 text-right text-gray-600 hidden sm:table-cell">
                        {d.stabilityScore.toFixed(1)}
                      </td>
                      <td className="px-3 sm:px-5 py-2 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${classColors(d.classification)}`}
                        >
                          {d.classification}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// WASTE SECTION
// ═══════════════════════════════════════════════════════

function WasteSection() {
  // Build months oldest→newest so buttons and chart share the same direction
  const MONTHS = useMemo(() => buildMonths(), []);
  // Default selection = last index (current month)
  const [selected, setSelected] = useState(MONTHS.length - 1);
  const [specialFilter, setSpecialFilter] = useState<"all" | "7d" | "30d" | null>(null);
  const [data, setData] = useState<WasteData | null>(null);
  const [trendData, setTrendData] = useState<{ label: string; cost: number; pct: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const insights = useInsights();

  useEffect(() => {
    fetchAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch all 6 months for the trend chart and default to current month stats
  async function fetchAll() {
    setLoading(true);
    try {
      const results = await Promise.all(
        MONTHS.map((m) => fetch(`/api/analytics/waste?year=${m.year}&month=${m.month}`).then((r) => r.json())),
      );
      // Current month is the last entry (MONTHS is oldest→newest)
      setData(results[results.length - 1].data ?? null);
      const trend = results.map((r, i) => ({
        label: MONTHS[i].label === "Bulan Ini" ? "Skrg" : MONTHS[i].label.split(" ")[0],
        cost: r.data?.totalWasteCost ?? 0,
        pct: r.data?.wastePercentage ?? 0,
      }));
      setTrendData(trend);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function fetchMonth(idx: number) {
    setSelected(idx);
    setSpecialFilter(null);
    setLoading(true);
    try {
      const m = MONTHS[idx];
      const res = await fetch(`/api/analytics/waste?year=${m.year}&month=${m.month}`);
      const json = await res.json();
      setData(json.data ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function fetchSpecial(mode: "all" | "7d" | "30d") {
    setSpecialFilter(mode);
    setLoading(true);
    try {
      const url =
        mode === "all"
          ? "/api/analytics/waste?all=true"
          : mode === "7d"
            ? "/api/analytics/waste?days=7"
            : "/api/analytics/waste?days=30";
      const res = await fetch(url);
      const json = await res.json();
      setData(json.data ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  const SPECIAL_FILTERS: { key: "all" | "7d" | "30d"; label: string }[] = [
    { key: "all", label: "Semua" },
    { key: "7d", label: "7 Hari" },
    { key: "30d", label: "30 Hari" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-red-600 flex items-center gap-2">
          <Trash2 className="w-6 h-6" /> Analitik Limbah
        </h2>
        <p className="text-sm text-gray-500 mt-1">Kuantitas limbah, biaya, dan persentase dari pendapatan</p>
      </div>

      <div className="-mx-1 px-1 overflow-x-auto pb-2 scrollbar-none">
        <div className="flex items-center gap-2 w-max">
          {/* Quick range filters */}
          {SPECIAL_FILTERS.map((sf) => (
            <button
              key={sf.key}
              onClick={() => fetchSpecial(sf.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition cursor-pointer whitespace-nowrap ${
                specialFilter === sf.key
                  ? "bg-red-500 text-white shadow"
                  : "bg-white border border-gray-200 text-gray-600 hover:bg-red-50"
              }`}
            >
              {sf.label}
            </button>
          ))}
          {/* Divider */}
          <span className="w-px h-5 bg-gray-200 shrink-0" />
          {/* Calendar month filters — oldest first (left) to newest (right) */}
          {MONTHS.map((m, i) => (
            <button
              key={i}
              onClick={() => fetchMonth(i)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition cursor-pointer whitespace-nowrap ${
                specialFilter === null && selected === i
                  ? "bg-red-500 text-white shadow"
                  : "bg-white border border-gray-200 text-gray-600 hover:bg-red-50"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl shadow p-6 animate-pulse h-24" />
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <StatTile icon={Trash2} label="Qty Limbah" value={`${data.totalWasteQty.toFixed(1)} unit`} color="red" />
          <StatTile icon={DollarSign} label="Biaya Limbah" value={fmtCompact(data.totalWasteCost)} color="amber" />
          <StatTile
            icon={AlertTriangle}
            label="% dari Pendapatan"
            value={`${data.wastePercentage}%`}
            color={data.wastePercentage > 10 ? "red" : data.wastePercentage > 5 ? "yellow" : "green"}
            subtext={
              data.wastePercentage > 10
                ? "Tinggi — periksa limbah"
                : data.wastePercentage > 5
                  ? "Sedang — perlu dipantau"
                  : "Dalam batas wajar"
            }
          />
        </div>
      ) : (
        <p className="text-gray-400 text-center py-8">Tidak ada data limbah untuk periode ini.</p>
      )}

      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-6">Tren Biaya Limbah 6 Bulan</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={trendData} barSize={36}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => fmtCompact(v)}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload;
                return (
                  <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs space-y-0.5">
                    <p className="font-semibold text-gray-700 mb-1">{label}</p>
                    <p className="text-red-600">Biaya Limbah: {fmtCompact(Number(d?.cost ?? 0))}</p>
                    <p className="text-orange-500">Limbah: {d?.pct ?? 0}%</p>
                  </div>
                );
              }}
            />
            <Bar dataKey="cost" radius={[6, 6, 0, 0]} name="cost">
              {trendData.map((entry, i) => {
                const isSelected = specialFilter === null && i === selected;
                const baseColor = entry.pct > 10 ? "#ef4444" : entry.pct > 5 ? "#f97316" : "#22c55e";
                return (
                  <Cell
                    key={i}
                    fill={baseColor}
                    opacity={isSelected ? 1 : 0.45}
                    stroke={isSelected ? baseColor : "none"}
                    strokeWidth={2}
                  />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="flex justify-around mt-2">
          {trendData.map((d, i) => (
            <div key={i} className="text-center">
              <span
                className={`text-xs font-semibold ${
                  specialFilter === null && i === selected ? "underline underline-offset-2" : ""
                } ${d.pct > 10 ? "text-red-500" : d.pct > 5 ? "text-orange-500" : "text-green-600"}`}
              >
                {d.pct}%
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-green-500 inline-block" /> ≤5% — Sehat
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-orange-500 inline-block" /> 5–10% — Sedang
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-red-500 inline-block" /> &gt;10% — Tinggi
        </span>
      </div>

      {/* AI Insight for waste */}
      {insights.waste?.insight && <AIInsightLabel text={insights.waste.insight} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// KASBON / DEBT SECTION
// ═══════════════════════════════════════════════════════

function KasbonSection() {
  const [summary, setSummary] = useState<DebtSummary | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [topDebtors, setTopDebtors] = useState<TopDebtor[]>([]);
  const [loading, setLoading] = useState(true);
  const insights = useInsights();

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch("/api/analytics/debts-stats");
      if (!res.ok) throw new Error("Failed to fetch debt analytics");
      const json = await res.json();
      setSummary(json.summary ?? null);
      setTrend(json.trend ?? []);
      setTopDebtors(json.topOutstanding ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  const collectionColor =
    (summary?.collectionRate ?? 0) >= 80
      ? "text-green-600"
      : (summary?.collectionRate ?? 0) >= 50
        ? "text-yellow-600"
        : "text-red-500";

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-amber-700 flex items-center gap-2">
          <BookOpen className="w-6 h-6" /> Analitik Kasbon
        </h2>
        <p className="text-sm text-gray-500 mt-1">Penagihan hutang, saldo terutang, dan tren pembayaran</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="bg-white rounded-2xl shadow p-4 animate-pulse h-24" />
          ))}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
          <StatTile icon={AlertCircle} label="Belum Lunas" value={fmtCompact(summary.totalOutstanding)} color="red" />
          <StatTile icon={CheckCircle2} label="Total Dibayar" value={fmtCompact(summary.totalPaid)} color="emerald" />
          <StatTile icon={TrendingUp} label="Tingkat Penagihan" value={`${summary.collectionRate}%`} color="indigo" />
          <StatTile
            icon={Clock}
            label="Jatuh Tempo"
            value={String(summary.overdueCount)}
            color={summary.overdueCount > 0 ? "red" : "green"}
          />
          <StatTile icon={Users} label="Debitur Aktif" value={String(summary.totalDebtors)} color="purple" />
        </div>
      ) : null}

      {summary && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-800">Tingkat Penagihan</h3>
            <span className={`text-lg font-bold ${collectionColor}`}>{summary.collectionRate}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-4">
            <div
              className="h-4 rounded-full transition-all duration-700"
              style={{
                width: `${Math.min(100, summary.collectionRate)}%`,
                backgroundColor:
                  summary.collectionRate >= 80 ? "#22c55e" : summary.collectionRate >= 50 ? "#f59e0b" : "#ef4444",
              }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
        <h3 className="text-lg font-bold text-amber-700 mb-4">Tren Penagihan Bulanan</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={trend} barSize={36}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => fmtCompact(v)}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs space-y-0.5">
                    <p className="font-semibold text-gray-700 mb-1">{label}</p>
                    <p className="text-amber-600">Terkumpul: {fmtCompact(Number(payload[0]?.value ?? 0))}</p>
                  </div>
                );
              }}
            />
            <Bar dataKey="collected" radius={[6, 6, 0, 0]} name="collected">
              {trend.map((_, i) => (
                <Cell key={i} fill={i === trend.length - 1 ? "#f59e0b" : "#6366f1"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {/* AI Insight for kasbon - placed close to relevant chart */}
        {summary && (
          <div className="mt-4">
            <AIInsightLabel text={insights.kasbon?.insight} />
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <h3 className="font-bold text-amber-700">Pelanggan dengan Hutang Terbesar</h3>
        </div>
        {topDebtors.length === 0 ? (
          <div className="p-10 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
            <p className="text-gray-400">Semua hutang sudah lunas! 🎉</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-amber-50 text-amber-700">
                <tr>
                  <th className="text-left px-3 sm:px-5 py-2 sm:py-3 font-semibold">Pelanggan</th>
                  <th className="text-left px-3 sm:px-5 py-2 sm:py-3 font-semibold hidden sm:table-cell">Telepon</th>
                  <th className="text-right px-3 sm:px-5 py-2 sm:py-3 font-semibold">Belum Lunas</th>
                  <th className="text-center px-3 sm:px-5 py-2 sm:py-3 font-semibold hidden sm:table-cell">
                    Jatuh Tempo
                  </th>
                  <th className="text-center px-3 sm:px-5 py-2 sm:py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {topDebtors.map((d, i) => (
                  <tr key={i} className={`border-b border-gray-50 ${i % 2 === 0 ? "bg-white" : "bg-amber-50/30"}`}>
                    <td className="px-3 sm:px-5 py-2 sm:py-3 font-semibold text-gray-800 truncate max-w-30 sm:max-w-none">
                      {d.customerName}
                    </td>
                    <td className="px-3 sm:px-5 py-2 sm:py-3 text-gray-500 hidden sm:table-cell">
                      {d.customerPhone ?? "—"}
                    </td>
                    <td className="px-3 sm:px-5 py-2 sm:py-3 text-right font-bold text-amber-700 whitespace-nowrap">
                      {fmtCompact(d.outstanding)}
                    </td>
                    <td className="px-3 sm:px-5 py-2 sm:py-3 text-center text-gray-500 hidden sm:table-cell whitespace-nowrap">
                      {d.dueDate
                        ? new Date(d.dueDate).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "2-digit",
                            timeZone: "Asia/Jakarta",
                          })
                        : "—"}
                    </td>
                    <td className="px-3 sm:px-5 py-2 sm:py-3 text-center">
                      {d.isOverdue ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-600 rounded-full text-xs font-semibold">
                          <AlertTriangle className="w-3 h-3" /> <span className="hidden sm:inline">Jatuh Tempo</span>
                          <span className="sm:hidden">Late</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-semibold">
                          <Clock className="w-3 h-3" /> {d.status}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
