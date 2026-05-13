"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BellRing,
  Bot,
  Brain,
  Camera,
  CalendarClock,
  Database,
  Factory,
  FileText,
  Loader2,
  PackageCheck,
  RefreshCw,
  Sparkles,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import ImageAnalyzer from "@/app/(dashboard)/components/ai/ImageAnalyzer";
import AIChatPage from "@/app/(dashboard)/components/ai/AIChatPage";
import SmartInsightsPanel from "@/app/(dashboard)/components/ai/SmartInsightsPanel";
import DocumentUploader from "@/app/(dashboard)/components/ai/DocumentUploader";
import { useApiQuery } from "@/hooks/useApiQuery";
import {
  bakeryOrdersUrl,
  productionListUrl,
  aiRagIndexUrl,
  invalidateAiInsightsCaches,
  invalidateAiRagStatusCaches,
  API_CACHE_TTL_5_MIN_MS,
} from "@/lib/api/cache-keys";
import {
  BAKERY_ORDERS_STORAGE_EVENT,
  summarizeLocalBakeryOrders,
  type LocalBakerySummary,
  type LocalBakeryOrder,
} from "@/lib/bookings/local-orders";

type AITab = "chat" | "insights" | "documents" | "image";

const tabs: { id: AITab; label: string; icon: typeof Bot; desc: string; gradient: string }[] = [
  { id: "chat", label: "AI Assistant", icon: Bot, desc: "Tanya jawab cerdas", gradient: "from-indigo-500 to-violet-500" },
  { id: "insights", label: "Smart Insights", icon: Brain, desc: "Analisis & prediksi", gradient: "from-emerald-500 to-teal-500" },
  { id: "documents", label: "Dokumen", icon: FileText, desc: "Upload PDF ke AI", gradient: "from-amber-500 to-orange-500" },
  { id: "image", label: "Analisis Gambar", icon: Camera, desc: "Foto invoice & stok", gradient: "from-rose-500 to-pink-500" },
];

interface BakeryOrdersApiResponse {
  success?: boolean;
  data?: {
    source?: string;
    orders?: LocalBakeryOrder[];
    updatedAt?: string | null;
  };
}

interface ProductionSummaryItem {
  productId: number;
  productName: string;
  sellingPrice: number | string;
  cogs: number | string;
  availableStock: number;
}

interface ProductionBatchItem {
  id: number;
  productId: number;
  quantity: number;
  remainingQty: number;
  costPerUnit: number | string;
  producedAt: string;
  product: {
    id: number;
    name: string;
    sellingPrice: number | string;
  };
}

interface ProductionSnapshotSummary {
  totalBatches: number;
  activeProducts: number;
  totalAvailableStock: number;
  recentBatches: number;
  latestProducedAt: string | null;
  topProductName: string | null;
}

interface ProductionApiResponse {
  success?: boolean;
  summary?: ProductionSummaryItem[];
  data?: ProductionBatchItem[];
}

interface RagIndexResponse {
  success?: boolean;
  indexed?: boolean;
  documentCount?: number;
  lastUpdated?: string | null;
}

function formatJakartaDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function buildEmptyProductionSummary(): ProductionSnapshotSummary {
  return {
    totalBatches: 0,
    activeProducts: 0,
    totalAvailableStock: 0,
    recentBatches: 0,
    latestProducedAt: null,
    topProductName: null,
  };
}

function summarizeProductionSnapshot(
  summary: ProductionSummaryItem[] | undefined,
  batches: ProductionBatchItem[] | undefined,
): ProductionSnapshotSummary {
  const safeSummary = Array.isArray(summary) ? summary : [];
  const safeBatches = Array.isArray(batches) ? batches : [];
  const totalAvailableStock = safeSummary.reduce(
    (sum, item) => sum + Number(item.availableStock || 0),
    0,
  );
  const latestProducedAt = safeBatches[0]?.producedAt ?? null;
  const recentCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentBatches = safeBatches.filter((batch) => {
    const producedAt = new Date(batch.producedAt);
    return !Number.isNaN(producedAt.getTime()) && producedAt.getTime() >= recentCutoff;
  }).length;
  const topProductName =
    safeSummary
      .slice()
      .sort((a, b) => Number(b.availableStock || 0) - Number(a.availableStock || 0))[0]
      ?.productName ?? null;

  return {
    totalBatches: safeBatches.length,
    activeProducts: safeSummary.length,
    totalAvailableStock,
    recentBatches,
    latestProducedAt,
    topProductName,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const containerVariants: any = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const itemVariants: any = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 260, damping: 24 } },
};

export default function AIAnalysisPage() {
  const [activeTab, setActiveTab] = useState<AITab>("chat");
  const [mounted, setMounted] = useState(false);
  const [syncingRag, setSyncingRag] = useState(false);

  const bakeryOrdersQuery = useApiQuery<BakeryOrdersApiResponse>(bakeryOrdersUrl, {
    ttlMs: API_CACHE_TTL_5_MIN_MS,
  });
  const productionQuery = useApiQuery<ProductionApiResponse>(productionListUrl(50), {
    ttlMs: API_CACHE_TTL_5_MIN_MS,
  });
  const ragStatusQuery = useApiQuery<RagIndexResponse>(aiRagIndexUrl, {
    ttlMs: API_CACHE_TTL_5_MIN_MS,
  });

  const bakerySummary = useMemo<LocalBakerySummary>(() => {
    const orders = bakeryOrdersQuery.data?.data?.orders;
    return Array.isArray(orders)
      ? summarizeLocalBakeryOrders(orders)
      : summarizeLocalBakeryOrders([]);
  }, [bakeryOrdersQuery.data]);
  const bakerySource = bakeryOrdersQuery.data?.data?.source || "unavailable";
  const bakeryUpdatedAt = bakeryOrdersQuery.data?.data?.updatedAt ?? null;
  const productionSummary = useMemo(
    () =>
      summarizeProductionSnapshot(
        productionQuery.data?.summary,
        productionQuery.data?.data,
      ) ?? buildEmptyProductionSummary(),
    [productionQuery.data],
  );
  const ragStatus = {
    success: Boolean(ragStatusQuery.data?.success),
    indexed: Boolean(ragStatusQuery.data?.indexed),
    documentCount: Number(ragStatusQuery.data?.documentCount ?? 0),
    lastUpdated: ragStatusQuery.data?.lastUpdated ?? null,
  };
  const snapshotLoading =
    bakeryOrdersQuery.isValidating ||
    productionQuery.isValidating ||
    ragStatusQuery.isValidating;
  const bakerySourceLabel =
    bakerySource === "rows"
      ? "Server rows"
      : bakerySource === "snapshot"
        ? "Server snapshot"
        : bakerySource === "snapshot-fallback"
          ? "Server fallback"
          : bakerySource === "unavailable"
            ? "Server unavailable"
            : bakerySource;

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);

  const refreshSnapshot = useCallback(async (options?: { force?: boolean }) => {
    await Promise.all([
      bakeryOrdersQuery.refresh(options),
      productionQuery.refresh(options),
      ragStatusQuery.refresh(options),
    ]);
  }, [bakeryOrdersQuery, productionQuery, ragStatusQuery]);

  const syncRagIndex = useCallback(async () => {
    if (syncingRag) return;

    setSyncingRag(true);
    try {
      const response = await fetch("/api/ai/rag/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        credentials: "include",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        message?: string;
        error?: string;
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Gagal sinkron AI index");
      }

      toast.success(payload.message || "AI index berhasil disinkronkan");
      invalidateAiRagStatusCaches();
      invalidateAiInsightsCaches();
      await refreshSnapshot({ force: true });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal sinkron AI index",
      );
    } finally {
      setSyncingRag(false);
    }
  }, [refreshSnapshot, syncingRag]);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;

    const handleRefresh = () => {
      void refreshSnapshot({ force: true });
    };
    window.addEventListener(
      BAKERY_ORDERS_STORAGE_EVENT,
      handleRefresh as EventListener,
    );

    return () => {
      window.removeEventListener(
        BAKERY_ORDERS_STORAGE_EVENT,
        handleRefresh as EventListener,
      );
    };
  }, [mounted, refreshSnapshot]);

  if (!mounted) return null;

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="min-h-screen pb-[calc(5rem+env(safe-area-inset-bottom))]"
    >
      {/* Ambient background blobs */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-indigo-200/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-[400px] h-[400px] bg-violet-200/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-100/10 rounded-full blur-3xl" />
      </div>

      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* ─── Header ─── */}
        <motion.div variants={itemVariants} className="relative overflow-hidden rounded-xl sm:rounded-2xl bg-white/80 backdrop-blur-xl border border-white/60 shadow-lg shadow-indigo-500/5">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 via-transparent to-violet-50/50" />
          <div className="relative px-4 sm:px-6 py-4 sm:py-5 flex items-center gap-3 sm:gap-4">
            <motion.div
              className="relative w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30"
              whileHover={{ scale: 1.05, rotate: 5 }}
              transition={{ type: "spring", stiffness: 400 }}
            >
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-white animate-pulse" />
            </motion.div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">AI Center</h1>
              <p className="text-sm text-gray-500">Pusat AI untuk analisis bisnis, prediksi, dan rekomendasi</p>
            </div>
          </div>
        </motion.div>

        {/* ─── Tab Navigation ─── */}
        <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
          {tabs.map((tab, i) => {
            const isActive = activeTab === tab.id;
            return (
              <motion.button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative group overflow-hidden rounded-xl p-3 sm:p-4 text-left transition-all duration-300 border ${
                  isActive
                    ? "bg-white shadow-lg shadow-gray-200/60 border-gray-200/80 ring-1 ring-gray-900/5"
                    : "bg-white/60 backdrop-blur-sm border-white/60 hover:bg-white hover:shadow-md hover:border-gray-200/80"
                }`}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, type: "spring", stiffness: 260, damping: 24 }}
              >
                {/* Active indicator top line */}
                <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${tab.gradient} transition-opacity duration-300 ${isActive ? "opacity-100" : "opacity-0"}`} />

                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center transition-all duration-300 shrink-0 ${
                    isActive
                      ? `bg-gradient-to-br ${tab.gradient} shadow-md`
                      : "bg-gray-100 group-hover:bg-gray-200"
                  }`}>
                    <tab.icon className={`w-4 h-4 sm:w-[18px] sm:h-[18px] transition-colors ${isActive ? "text-white" : "text-gray-500 group-hover:text-gray-700"}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-[13px] sm:text-sm font-semibold leading-tight transition-colors ${isActive ? "text-gray-900" : "text-gray-600 group-hover:text-gray-800"}`}>
                      {tab.label}
                    </p>
                    <p className={`text-[11px] mt-0.5 leading-tight transition-colors ${isActive ? "text-gray-500" : "text-gray-400"}`}>
                      {tab.desc}
                    </p>
                  </div>
                </div>

                {/* Subtle background glow on active */}
                {isActive && (
                  <motion.div
                    layoutId="activeTabGlow"
                    className={`absolute inset-0 -z-10 bg-gradient-to-br ${tab.gradient} opacity-[0.04] rounded-xl`}
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}
              </motion.button>
            );
          })}
        </motion.div>

        {/* ─── Live Data Sync ─── */}
        <motion.div variants={itemVariants} className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl sm:rounded-2xl border border-amber-100 bg-linear-to-br from-amber-50 via-orange-50 to-rose-50 p-4 sm:p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-amber-900">Bakery Operations</h3>
                <p className="text-xs text-amber-700/80">
                  Live dari /api/bookings/orders
                </p>
              </div>
              <span className="rounded-full bg-white/75 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                {snapshotLoading ? "Refreshing..." : bakerySourceLabel}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-white/70 bg-white/75 p-3">
                <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <PackageCheck className="h-3.5 w-3.5" />
                  Total Booking
                </p>
                <p className="mt-1 text-xl font-bold text-gray-900">{bakerySummary.totalOrders}</p>
              </div>
              <div className="rounded-lg border border-white/70 bg-white/75 p-3">
                <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <Truck className="h-3.5 w-3.5" />
                  Resi Aktif
                </p>
                <p className="mt-1 text-xl font-bold text-gray-900">
                  {bakerySummary.withResi}/{bakerySummary.totalOrders}
                </p>
              </div>
              <div className="rounded-lg border border-white/70 bg-white/75 p-3">
                <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <CalendarClock className="h-3.5 w-3.5" />
                  Kirim Hari Ini
                </p>
                <p className="mt-1 text-xl font-bold text-gray-900">{bakerySummary.deliveryToday}</p>
              </div>
              <div className="rounded-lg border border-white/70 bg-white/75 p-3">
                <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <BellRing className="h-3.5 w-3.5" />
                  Pending Automasi
                </p>
                <p className="mt-1 text-xl font-bold text-gray-900">{bakerySummary.pendingAutomation}</p>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-amber-800/80">
              Sync terakhir: {formatJakartaDateTime(bakeryUpdatedAt)}
            </p>
            <p className="mt-1 text-[11px] text-amber-700/80">
              Omzet booking: Rp {Math.round(bakerySummary.totalRevenue).toLocaleString("id-ID")}
            </p>
          </div>

          <div className="rounded-xl sm:rounded-2xl border border-violet-100 bg-linear-to-br from-violet-50 via-fuchsia-50 to-indigo-50 p-4 sm:p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-violet-900">Production Queue</h3>
                <p className="text-xs text-violet-700/80">
                  Live dari /api/production
                </p>
              </div>
              <span className="rounded-full bg-white/75 px-2.5 py-1 text-[11px] font-medium text-violet-700">
                {snapshotLoading ? "Refreshing..." : "Server live"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-white/70 bg-white/75 p-3">
                <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <Factory className="h-3.5 w-3.5" />
                  Batch Total
                </p>
                <p className="mt-1 text-xl font-bold text-gray-900">{productionSummary.totalBatches}</p>
              </div>
              <div className="rounded-lg border border-white/70 bg-white/75 p-3">
                <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <Database className="h-3.5 w-3.5" />
                  Produk Aktif
                </p>
                <p className="mt-1 text-xl font-bold text-gray-900">{productionSummary.activeProducts}</p>
              </div>
              <div className="rounded-lg border border-white/70 bg-white/75 p-3">
                <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <PackageCheck className="h-3.5 w-3.5" />
                  Stok Ready
                </p>
                <p className="mt-1 text-xl font-bold text-gray-900">
                  {productionSummary.totalAvailableStock}
                </p>
              </div>
              <div className="rounded-lg border border-white/70 bg-white/75 p-3">
                <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <CalendarClock className="h-3.5 w-3.5" />
                  7 Hari
                </p>
                <p className="mt-1 text-xl font-bold text-gray-900">{productionSummary.recentBatches}</p>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-violet-800/80">
              Batch terbaru: {formatJakartaDateTime(productionSummary.latestProducedAt)}
            </p>
            <p className="mt-1 text-[11px] text-violet-700/80">
              Produk dengan stok terbesar: {productionSummary.topProductName || "-"}
            </p>
          </div>

          <div className="rounded-xl sm:rounded-2xl border border-sky-100 bg-linear-to-br from-sky-50 via-indigo-50 to-cyan-50 p-4 sm:p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-sky-900">AI Sync Status</h3>
                <p className="text-xs text-sky-700/80">
                  RAG index untuk bakery, production, dan data bisnis lain
                </p>
              </div>
              <span className="rounded-full bg-white/75 px-2.5 py-1 text-[11px] font-medium text-sky-700">
                {ragStatus.indexed ? "Synced" : "Needs sync"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-white/70 bg-white/75 p-3">
                <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <Database className="h-3.5 w-3.5" />
                  Dokumen Vektor
                </p>
                <p className="mt-1 text-xl font-bold text-gray-900">{ragStatus.documentCount}</p>
              </div>
              <div className="rounded-lg border border-white/70 bg-white/75 p-3">
                <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <CalendarClock className="h-3.5 w-3.5" />
                  Update
                </p>
                <p className="mt-1 text-[11px] font-semibold text-gray-900">
                  {formatJakartaDateTime(ragStatus.lastUpdated)}
                </p>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-sky-800/80">
              Index AI sekarang ikut memasukkan bakery snapshot dan production batch terbaru.
            </p>
            <button
              type="button"
              onClick={() => {
                void syncRagIndex();
              }}
              disabled={syncingRag}
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {syncingRag ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {syncingRag ? "Syncing..." : "Sinkron AI"}
            </button>
          </div>
        </motion.div>

        {/* ─── Tab Content ─── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 16, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.99 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
          >
            {activeTab === "chat" && <AIChatPage />}
            {activeTab === "insights" && <SmartInsightsPanel />}
            {activeTab === "image" && (
              <div className="space-y-4">
                <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg shadow-gray-200/40 border border-white/60 p-6">
                  <ImageAnalyzer />
                </div>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="rounded-xl p-4 bg-amber-50/80 backdrop-blur-sm border border-amber-200/60 flex items-start gap-3"
                >
                  <Camera className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <h3 className="font-semibold text-amber-800 text-sm">Catatan</h3>
                    <p className="text-sm text-amber-700/80 mt-0.5">
                      Gambar yang diupload akan <strong>otomatis terhapus setelah 1 menit</strong> untuk menghemat storage.
                    </p>
                  </div>
                </motion.div>
              </div>
            )}
            {activeTab === "documents" && (
              <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg shadow-gray-200/40 border border-white/60 p-6">
                <DocumentUploader />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
