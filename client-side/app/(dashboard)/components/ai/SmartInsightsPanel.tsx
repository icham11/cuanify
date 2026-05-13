"use client";

import { useState } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Brain,
  RefreshCw,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Utensils,
  DollarSign,
  BarChart3,
  CheckCircle,
  XCircle,
  CircleAlert,
  Sparkles,
  PlusCircle,
  Megaphone,
  Pencil,
  Smile,
  HelpCircle,
  Dumbbell,
  Lightbulb,
} from "lucide-react";
import { useApiQuery } from "@/hooks/useApiQuery";
import { peekApiCache } from "@/lib/api/client";
import { aiInsightsUrl, API_CACHE_TTL_5_MIN_MS } from "@/lib/api/cache-keys";

interface InventoryAlert {
  ingredientName: string;
  currentStock: number;
  minStock: number;
  unit: string;
  daysUntilEmpty: number | null;
  severity: "critical" | "warning" | "info";
  suggestion: string;
}

interface SalesForecastItem {
  productName: string;
  currentTrend: string;
  predicted7Days: number;
  predicted30Days: number;
  confidence: number;
  recommendation: string;
}

interface MenuRecommendation {
  type: "new_product" | "modify_existing" | "remove" | "promotion";
  name: string;
  reason: string;
  expectedImpact: string;
  priority: "high" | "medium" | "low";
}

interface ProfitOptimization {
  area: string;
  currentValue: string;
  suggestion: string;
  potentialSavings: string;
  difficulty: "easy" | "medium" | "hard";
}

interface SmartInsightsData {
  inventoryAlerts: InventoryAlert[];
  salesForecast: SalesForecastItem[];
  menuRecommendations: MenuRecommendation[];
  profitOptimizations: ProfitOptimization[];
  summary: string;
  generatedAt: string;
}

type TabType = "overview" | "inventory" | "forecast" | "menu" | "profit";

export default function SmartInsightsPanel() {
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const insightsKey = aiInsightsUrl("all");
  const cachedInsights = peekApiCache<{ data?: SmartInsightsData }>(
    insightsKey,
    undefined,
    { allowStale: true },
  );
  const [shouldLoadInsights, setShouldLoadInsights] = useState(
    Boolean(cachedInsights?.data),
  );
  const insightsQuery = useApiQuery<{
    success?: boolean;
    data?: SmartInsightsData;
    error?: string;
  }>(shouldLoadInsights ? insightsKey : null, {
    ttlMs: API_CACHE_TTL_5_MIN_MS,
  });
  const data = insightsQuery.data?.data ?? cachedInsights?.data ?? null;
  const loading = shouldLoadInsights && insightsQuery.isLoading;
  const error = shouldLoadInsights ? insightsQuery.errorMessage ?? "" : "";

  const fetchInsights = async () => {
    if (!shouldLoadInsights) {
      setShouldLoadInsights(true);
      return;
    }
    try {
      await insightsQuery.refresh({ force: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal memuat insights";
      toast.error(msg);
    }
  };

  const tabs: { id: TabType; label: string; icon: typeof BarChart3 }[] = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "inventory", label: "Stok Alert", icon: AlertTriangle },
    { id: "forecast", label: "Prediksi", icon: TrendingUp },
    { id: "menu", label: "Rekomendasi", icon: Utensils },
    { id: "profit", label: "Optimasi", icon: DollarSign },
  ];

  const severityColors: Record<string, string> = {
    critical: "bg-red-50 text-red-800 border-red-200",
    warning: "bg-yellow-50 text-yellow-800 border-yellow-200",
    info: "bg-blue-50 text-blue-800 border-blue-200",
  };

  const priorityColors: Record<string, string> = {
    high: "bg-red-100 text-red-700",
    medium: "bg-yellow-100 text-yellow-700",
    low: "bg-green-100 text-green-700",
  };

  const difficultyConfig: Record<string, { color: string; icon: typeof Smile }> = {
    easy: { color: "bg-green-100 text-green-700", icon: Smile },
    medium: { color: "bg-yellow-100 text-yellow-700", icon: HelpCircle },
    hard: { color: "bg-red-100 text-red-700", icon: Dumbbell },
  };

  const trendIcons: Record<string, typeof TrendingUp> = {
    naik: TrendingUp,
    turun: TrendingDown,
    stabil: ArrowRight,
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-white font-bold text-lg">Smart AI Insights</h2>
            <p className="text-purple-200 text-xs">
              {data
                ? "Update: " + new Date(data.generatedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
                : "Klik Generate untuk memulai"}
            </p>
          </div>
        </div>
        <button
          onClick={fetchInsights}
          disabled={loading}
          className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Analyzing..." : "Generate Insights"}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-gray-50 px-2 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={
              "flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap " +
              (activeTab === tab.id
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700")
            }
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-6 min-h-[300px]">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg mb-4 flex items-center gap-2">
            <XCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {!data && !loading && !error && (
          <div className="text-center py-12">
            <div className="w-14 h-14 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Brain className="w-7 h-7 text-purple-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">AI Insights Belum Di-generate</h3>
            <p className="text-sm text-gray-500 mb-4">
              Klik &quot;Generate Insights&quot; untuk analisis AI berdasarkan data bisnis Anda
            </p>
          </div>
        )}

        {loading && (
          <div className="text-center py-12">
            <div className="inline-flex items-center gap-3 px-6 py-3 bg-indigo-50 rounded-xl">
              <svg className="animate-spin h-5 w-5 text-indigo-600" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-indigo-700 font-medium">AI sedang menganalisis data bisnis...</span>
            </div>
          </div>
        )}

        {data && !loading && (
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* ===== OVERVIEW ===== */}
            {activeTab === "overview" && (
              <div className="space-y-4">
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-4 rounded-xl border border-indigo-200">
                  <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">{data.summary}</pre>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-red-50 p-4 rounded-xl border border-red-200">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-5 h-5 text-red-600" />
                      <span className="font-semibold text-red-800">Stok Alert</span>
                    </div>
                    <p className="text-2xl font-bold text-red-700">{data.inventoryAlerts.length}</p>
                    <p className="text-xs text-red-600">
                      {data.inventoryAlerts.filter((a) => a.severity === "critical").length} kritis
                    </p>
                  </div>
                  <div className="bg-blue-50 p-4 rounded-xl border border-blue-200">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-5 h-5 text-blue-600" />
                      <span className="font-semibold text-blue-800">Prediksi</span>
                    </div>
                    <p className="text-2xl font-bold text-blue-700">{data.salesForecast.length}</p>
                    <p className="text-xs text-blue-600">produk diprediksi</p>
                  </div>
                  <div className="bg-green-50 p-4 rounded-xl border border-green-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Utensils className="w-5 h-5 text-green-600" />
                      <span className="font-semibold text-green-800">Rekomendasi</span>
                    </div>
                    <p className="text-2xl font-bold text-green-700">{data.menuRecommendations.length}</p>
                    <p className="text-xs text-green-600">saran menu</p>
                  </div>
                  <div className="bg-purple-50 p-4 rounded-xl border border-purple-200">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="w-5 h-5 text-purple-600" />
                      <span className="font-semibold text-purple-800">Optimasi</span>
                    </div>
                    <p className="text-2xl font-bold text-purple-700">{data.profitOptimizations.length}</p>
                    <p className="text-xs text-purple-600">peluang profit</p>
                  </div>
                </div>
              </div>
            )}

            {/* ===== INVENTORY ALERTS ===== */}
            {activeTab === "inventory" && (
              <div className="space-y-3">
                {data.inventoryAlerts.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-2" />
                    <p className="text-gray-600">Semua stok aman!</p>
                  </div>
                ) : (
                  data.inventoryAlerts.map((alert, i) => (
                    <div key={i} className={"p-4 rounded-xl border " + severityColors[alert.severity]}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold">{alert.ingredientName}</span>
                        <span
                          className={
                            "text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1 " +
                            (alert.severity === "critical"
                              ? "bg-red-200 text-red-800"
                              : "bg-yellow-200 text-yellow-800")
                          }
                        >
                          {alert.severity === "critical" ? (
                            <>
                              <CircleAlert className="w-3 h-3" /> Kritis
                            </>
                          ) : (
                            <>
                              <AlertTriangle className="w-3 h-3" /> Peringatan
                            </>
                          )}
                        </span>
                      </div>
                      <p className="text-sm mb-1">
                        Stok: <strong>{alert.currentStock}</strong> / {alert.minStock} {alert.unit}
                        {alert.daysUntilEmpty !== null && <span className="ml-2">· ~{alert.daysUntilEmpty} hari</span>}
                      </p>
                      <p className="text-xs opacity-80">{alert.suggestion}</p>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ===== SALES FORECAST ===== */}
            {activeTab === "forecast" && (
              <div className="space-y-3">
                {data.salesForecast.length === 0 ? (
                  <div className="text-center py-8">
                    <BarChart3 className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-600">Belum cukup data</p>
                  </div>
                ) : (
                  data.salesForecast.map((item, i) => {
                    const TrendIcon = trendIcons[item.currentTrend] || ArrowRight;
                    return (
                      <div key={i} className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-gray-800">{item.productName}</span>
                          <span className="text-sm flex items-center gap-1 text-gray-600">
                            <TrendIcon className="w-4 h-4" /> {item.currentTrend}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-3 mb-2">
                          <div className="text-center p-2 bg-white rounded-lg">
                            <p className="text-xs text-gray-500">7 Hari</p>
                            <p className="font-bold text-indigo-600">{item.predicted7Days}</p>
                          </div>
                          <div className="text-center p-2 bg-white rounded-lg">
                            <p className="text-xs text-gray-500">30 Hari</p>
                            <p className="font-bold text-indigo-600">{item.predicted30Days}</p>
                          </div>
                          <div className="text-center p-2 bg-white rounded-lg">
                            <p className="text-xs text-gray-500">Confidence</p>
                            <p className="font-bold text-green-600">{(item.confidence * 100).toFixed(0)}%</p>
                          </div>
                        </div>
                        <p className="text-xs text-gray-600 flex items-center gap-1">
                          <Lightbulb className="w-3 h-3 text-amber-500 shrink-0" />
                          {item.recommendation}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* ===== MENU RECOMMENDATIONS ===== */}
            {activeTab === "menu" && (
              <div className="space-y-3">
                {data.menuRecommendations.length === 0 ? (
                  <div className="text-center py-8">
                    <Utensils className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-600">Belum ada rekomendasi</p>
                  </div>
                ) : (
                  data.menuRecommendations.map((rec, i) => {
                    const typeConfig = {
                      new_product: { icon: PlusCircle, label: "Baru", color: "bg-green-100 text-green-700" },
                      promotion: { icon: Megaphone, label: "Promo", color: "bg-blue-100 text-blue-700" },
                      remove: { icon: XCircle, label: "Hapus", color: "bg-red-100 text-red-700" },
                      modify_existing: { icon: Pencil, label: "Ubah", color: "bg-yellow-100 text-yellow-700" },
                    }[rec.type] || { icon: Sparkles, label: rec.type, color: "bg-gray-100 text-gray-700" };
                    const TypeIcon = typeConfig.icon;
                    return (
                      <div key={i} className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${typeConfig.color}`}
                            >
                              <TypeIcon className="w-3 h-3" /> {typeConfig.label}
                            </span>
                            <span className="font-semibold text-gray-800">{rec.name}</span>
                          </div>
                          <span className={"text-xs px-2 py-0.5 rounded-full " + priorityColors[rec.priority]}>
                            {rec.priority}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mb-1">{rec.reason}</p>
                        <p className="text-xs text-indigo-600 flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" /> {rec.expectedImpact}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* ===== PROFIT OPTIMIZATION ===== */}
            {activeTab === "profit" && (
              <div className="space-y-3">
                {data.profitOptimizations.length === 0 ? (
                  <div className="text-center py-8">
                    <DollarSign className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-600">Belum ada saran</p>
                  </div>
                ) : (
                  data.profitOptimizations.map((opt, i) => {
                    const dc = difficultyConfig[opt.difficulty] || difficultyConfig.medium;
                    const DiffIcon = dc.icon;
                    return (
                      <div key={i} className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-gray-800 capitalize">{opt.area}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${dc.color}`}>
                            <DiffIcon className="w-3 h-3" />
                            {opt.difficulty === "easy" ? "Mudah" : opt.difficulty === "medium" ? "Sedang" : "Sulit"}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mb-1">Saat ini: {opt.currentValue}</p>
                        <p className="text-sm text-gray-700 mb-1">{opt.suggestion}</p>
                        <p className="text-xs font-medium text-green-600 flex items-center gap-1">
                          <DollarSign className="w-3 h-3" /> Potensi: {opt.potentialSavings}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
