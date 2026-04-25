"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useBusiness } from "@/context/BusinessContext";
import { apiFetch } from "@/lib/api/client";
import { toast } from "sonner";
import {
  Building2,
  MapPin,
  Calendar,
  TrendingUp,
  Package,
  ShoppingCart,
  DollarSign,
  Percent,
  Edit3,
  Check,
  X,
  Plus,
  Trash2,
  BarChart3,
  Boxes,
  Loader2,
  RefreshCw,
  Star,
  ArrowRightLeft,
  AlertTriangle,
  Smile,
  CheckCircle2,
  Lightbulb,
  ShieldCheck,
  Flame,
  Award,
  // Greeting logic (copied from dashboard)
} from "lucide-react";
// import StatTile from "@/app/components/StatTile";

// Greeting logic
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Pagi";
  if (hour < 18) return "Siang";
  return "Malam";
}

// ─── Insight types ──────────────────────────────────────────
interface InsightItem {
  type: "positive" | "warning" | "danger" | "info";
  icon: React.ReactNode;
  title: string;
  description: string;
}

// ─── Redesigned Alert & Insight Modal ──────────────────────
function InsightModal({
  alerts,
  insights,
  onClose,
}: {
  alerts: {
    expired: { name: string; expirationDate?: string }[];
    expiring3: { name: string; expirationDate?: string }[];
    expiring7: { name: string; expirationDate?: string }[];
    lowStock: { name: string; currentStock?: number; minStock?: number }[];
  };
  insights: InsightItem[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"insights" | "alerts">("insights");
  const totalAlertCount =
    alerts.expired.length +
    alerts.expiring3.length +
    alerts.expiring7.length +
    alerts.lowStock.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden"
      >
        {/* Header */}
        <div className="bg-linear-to-r from-indigo-500 via-indigo-500 to-indigo-500 px-5 py-4 flex items-center justify-between">
          <h2 className="text-white font-bold text-lg">Ringkasan Hari Ini</h2>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white p-1 rounded-full hover:bg-white/20 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => setTab("insights")}
            className={`flex-1 py-3 text-sm font-semibold text-center transition ${
              tab === "insights"
                ? "text-indigo-600 border-b-2 border-indigo-500 bg-indigo-50/50"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Lightbulb className="w-4 h-4 inline mr-1.5 -mt-0.5" />
            Insight Positif
          </button>
          <button
            onClick={() => setTab("alerts")}
            className={`flex-1 py-3 text-sm font-semibold text-center transition relative ${
              tab === "alerts"
                ? "text-amber-600 border-b-2 border-amber-500 bg-amber-50/50"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <AlertTriangle className="w-4 h-4 inline mr-1.5 -mt-0.5" />
            Peringatan
            {totalAlertCount > 0 && (
              <span className="ml-1.5 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                {totalAlertCount}
              </span>
            )}
          </button>
        </div>

        {/* Content */}
        <div className="p-4 max-h-80 overflow-y-auto space-y-3">
          {tab === "insights" && (
            <>
              {insights.length === 0 ? (
                <div className="text-center text-gray-400 py-8">
                  <Lightbulb className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">Belum ada insight untuk hari ini</p>
                </div>
              ) : (
                insights.map((insight, idx) => {
                  const colorMap = {
                    positive:
                      "bg-emerald-50 border-emerald-200 text-emerald-700",
                    warning: "bg-amber-50 border-amber-200 text-amber-700",
                    danger: "bg-red-50 border-red-200 text-red-700",
                    info: "bg-blue-50 border-blue-200 text-blue-700",
                  };
                  return (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className={`flex gap-3 p-3 rounded-xl border ${colorMap[insight.type]}`}
                    >
                      <div className="shrink-0 mt-0.5">{insight.icon}</div>
                      <div>
                        <p className="font-semibold text-sm">{insight.title}</p>
                        <p className="text-xs opacity-80 mt-0.5">
                          {insight.description}
                        </p>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </>
          )}

          {tab === "alerts" && (
            <>
              {totalAlertCount === 0 ? (
                <div className="text-center py-8">
                  <ShieldCheck className="w-10 h-10 mx-auto mb-2 text-emerald-400" />
                  <p className="text-emerald-600 font-semibold">
                    Semua stok aman!
                  </p>
                  <p className="text-sm text-gray-400 mt-1">
                    Tidak ada peringatan saat ini
                  </p>
                </div>
              ) : (
                <>
                  {alerts.expired.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                      <p className="font-bold text-red-700 text-sm flex items-center gap-1.5 mb-2">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        Kadaluarsa ({alerts.expired.length})
                      </p>
                      <ul className="space-y-1">
                        {alerts.expired.map((item, idx) => (
                          <li
                            key={`exp-${idx}`}
                            className="text-sm text-red-600 flex items-center gap-2"
                          >
                            <span className="w-1 h-1 rounded-full bg-red-400 shrink-0" />
                            {item.name}
                            {item.expirationDate && (
                              <span className="text-xs text-red-400 ml-auto shrink-0">
                                {formatDate(item.expirationDate)}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {alerts.expiring3.length > 0 && (
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                      <p className="font-bold text-orange-700 text-sm flex items-center gap-1.5 mb-2">
                        <span className="w-2 h-2 rounded-full bg-orange-500" />
                        Kadaluarsa 3 hari lagi ({alerts.expiring3.length})
                      </p>
                      <ul className="space-y-1">
                        {alerts.expiring3.map((item, idx) => (
                          <li
                            key={`exp3-${idx}`}
                            className="text-sm text-orange-600 flex items-center gap-2"
                          >
                            <span className="w-1 h-1 rounded-full bg-orange-400 shrink-0" />
                            {item.name}
                            {item.expirationDate && (
                              <span className="text-xs text-orange-400 ml-auto shrink-0">
                                {formatDate(item.expirationDate)}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {alerts.expiring7.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                      <p className="font-bold text-amber-700 text-sm flex items-center gap-1.5 mb-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        Kadaluarsa 7 hari lagi ({alerts.expiring7.length})
                      </p>
                      <ul className="space-y-1">
                        {alerts.expiring7.map((item, idx) => (
                          <li
                            key={`exp7-${idx}`}
                            className="text-sm text-amber-600 flex items-center gap-2"
                          >
                            <span className="w-1 h-1 rounded-full bg-amber-400 shrink-0" />
                            {item.name}
                            {item.expirationDate && (
                              <span className="text-xs text-amber-400 ml-auto shrink-0">
                                {formatDate(item.expirationDate)}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {alerts.lowStock.length > 0 && (
                    <div className="bg-pink-50 border border-pink-200 rounded-xl p-3">
                      <p className="font-bold text-pink-700 text-sm flex items-center gap-1.5 mb-2">
                        <span className="w-2 h-2 rounded-full bg-pink-500" />
                        Stok Rendah ({alerts.lowStock.length})
                      </p>
                      <ul className="space-y-1">
                        {alerts.lowStock.map((item, idx) => (
                          <li
                            key={`ls-${idx}`}
                            className="text-sm text-pink-600 flex items-center gap-2"
                          >
                            <span className="w-1 h-1 rounded-full bg-pink-400 shrink-0" />
                            {item.name}
                            <span className="text-xs text-pink-400 ml-auto shrink-0">
                              {item.currentStock ?? "-"} /{" "}
                              {item.minStock ?? "-"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}

interface BusinessData {
  id: number;
  name: string;
  location: string | null;
  createdAt: string;
  updatedAt: string;
  _count: {
    products: number;
    ingredients: number;
    categories: number;
    sales: number;
  };
  stats: {
    totalRevenue: number;
    totalCost: number;
    totalProfit: number;
    paidSalesCount: number;
    marginAvg: number | null;
  };
}

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(n);
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

export default function BusinessPage() {
  const { business, refreshBusiness, switchBusiness } = useBusiness();
  const [data, setData] = useState<BusinessData | null>(null);
  const [allBusinesses, setAllBusinesses] = useState<BusinessData[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<number | null>(null);
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

  const [alerts, setAlerts] = useState({
    expired: [] as AlertItem[],
    expiring3: [] as AlertItem[],
    expiring7: [] as AlertItem[],
    lowStock: [] as AlertItem[],
  });
  const [insights, setInsights] = useState<InsightItem[]>([]);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [greeting, setGreeting] = useState("");

  // Compute greeting on client only to avoid SSR/client mismatch
  useEffect(() => {
    setGreeting(getGreeting());
  }, []);

  // Edit states
  const [editingName, setEditingName] = useState(false);
  const [editingLocation, setEditingLocation] = useState(false);
  const [nameVal, setNameVal] = useState("");
  const [locationVal, setLocationVal] = useState("");
  const [saving, setSaving] = useState(false);

  // New business form
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchBusiness = useCallback(async () => {
    try {
      setLoading(true);
      let targetBusinessId = business?.id;

      if (!targetBusinessId) {
        const listRes = await apiFetch("/api/businesses");
        const firstBusiness = listRes?.data?.[0];

        if (firstBusiness?.id) {
          targetBusinessId = firstBusiness.id;
        }
      }

      if (!targetBusinessId) {
        setData(null);
        setNameVal("");
        setLocationVal("");
        return;
      }

      const res = await apiFetch(`/api/businesses/${targetBusinessId}`);
      if (res.success) {
        setData(res.data);
        setNameVal(res.data.name);
        setLocationVal(res.data.location || "");
      }
    } catch {
      toast.error("Gagal memuat data bisnis");
    } finally {
      setLoading(false);
    }
  }, [business?.id]);

  const fetchInventoryAlerts = useCallback(async () => {
    try {
      const res = await apiFetch("/api/ingredients?withBatches=true");
      if (!res.success) return;

      const today = new Date();
      const expired: AlertItem[] = [];
      const expiring3: AlertItem[] = [];
      const expiring7: AlertItem[] = [];
      const lowStock: AlertItem[] = [];
      let safeCount = 0;
      let totalIngredients = 0;

      res.data.forEach((ingredient: Ingredient) => {
        totalIngredients++;
        const stock = ingredient.currentStock;
        const min = ingredient.minStock;

        if (stock >= 0 && min >= 0 && stock > min) {
          safeCount++;
        }

        if (stock >= 0 && min >= 0 && stock < min) {
          lowStock.push({
            name: ingredient.name,
            currentStock: stock,
            minStock: min,
          });
        }

        ingredient.inventoryBatches?.forEach((batch: InventoryBatch) => {
          if (!batch.expirationDate) return;

          const expDate = new Date(batch.expirationDate);
          const diffDays =
            (expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);

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

      // Generate positive insights
      const positiveInsights: InsightItem[] = [];

      if (safeCount > 0) {
        positiveInsights.push({
          type: "positive",
          icon: <ShieldCheck className="w-5 h-5 text-emerald-600" />,
          title: `${safeCount} dari ${totalIngredients} bahan baku stok aman`,
          description:
            safeCount === totalIngredients
              ? "Semua bahan baku Anda dalam kondisi stok yang cukup. Mantap!"
              : `${safeCount} bahan memiliki stok di atas minimum. Pertahankan!`,
        });
      }

      if (
        expired.length === 0 &&
        expiring3.length === 0 &&
        expiring7.length === 0
      ) {
        positiveInsights.push({
          type: "positive",
          icon: <CheckCircle2 className="w-5 h-5 text-emerald-600" />,
          title: "Tidak ada bahan kadaluarsa",
          description:
            "Semua bahan baku fresh dan siap dipakai. Great job mengelola inventory!",
        });
      }

      setInsights(positiveInsights);
    } catch {}
  }, []);

  const fetchAllBusinesses = useCallback(async () => {
    try {
      const res = await apiFetch("/api/businesses");
      if (res.success) setAllBusinesses(res.data);
    } catch {
      /* silent */
    }
  }, []);

  const totalAlertCount =
    alerts.expired.length +
    alerts.expiring3.length +
    alerts.expiring7.length +
    alerts.lowStock.length;
  const alertPulse = totalAlertCount > 0 ? "animate-pulse" : "";

  useEffect(() => {
    fetchBusiness();
    fetchAllBusinesses();
    fetchInventoryAlerts();
  }, [fetchBusiness, fetchAllBusinesses, fetchInventoryAlerts]);

  // Generate business-level insights when data changes
  useEffect(() => {
    if (!data?.stats) return;
    const s = data.stats;
    const c = data._count;
    const newInsights: InsightItem[] = [];

    // Revenue insight
    if (s.totalRevenue > 0) {
      newInsights.push({
        type: "positive",
        icon: <Flame className="w-5 h-5 text-emerald-600" />,
        title: `Total pendapatan ${formatRupiah(s.totalRevenue)}`,
        description: `Anda sudah menyelesaikan ${s.paidSalesCount} transaksi lunas. Terus tingkatkan!`,
      });
    }

    // Margin insight
    if (s.marginAvg != null && s.marginAvg > 30) {
      newInsights.push({
        type: "positive",
        icon: <Award className="w-5 h-5 text-emerald-600" />,
        title: `Margin rata-rata ${s.marginAvg.toFixed(1)}% — Sehat!`,
        description:
          "Margin di atas 30% menandakan bisnis Anda dalam kondisi sehat.",
      });
    } else if (s.marginAvg != null && s.marginAvg > 0 && s.marginAvg <= 30) {
      newInsights.push({
        type: "warning",
        icon: <TrendingUp className="w-5 h-5 text-amber-600" />,
        title: `Margin rata-rata ${s.marginAvg.toFixed(1)}%`,
        description:
          "Margin masih bisa ditingkatkan. Pertimbangkan review harga jual atau efisiensi bahan baku.",
      });
    }

    // Product catalog insight
    if (c.products > 0) {
      newInsights.push({
        type: "info",
        icon: <Package className="w-5 h-5 text-blue-600" />,
        title: `${c.products} produk aktif, ${c.categories} kategori`,
        description: `Portfolio produk Anda sudah tersusun rapi dengan ${c.ingredients} bahan baku terdaftar.`,
      });
    }

    // Profit insight
    if (s.totalProfit > 0) {
      newInsights.push({
        type: "positive",
        icon: <DollarSign className="w-5 h-5 text-emerald-600" />,
        title: `Profit bersih ${formatRupiah(s.totalProfit)}`,
        description:
          "Bisnis Anda menghasilkan keuntungan. Pertimbangkan untuk reinvestasi ke pengembangan produk.",
      });
    }

    // Merge with inventory insights (already set from fetchInventoryAlerts)
    setInsights((prev) => {
      // Keep inventory-related insights (ShieldCheck, CheckCircle2), merge with business ones
      const inventoryInsights = prev.filter(
        (i) => i.title.includes("bahan baku") || i.title.includes("kadaluarsa"),
      );
      return [...newInsights, ...inventoryInsights];
    });
  }, [data]);

  async function handleSave(field: "name" | "location") {
    if (!data) return;
    setSaving(true);
    try {
      const body =
        field === "name" ? { name: nameVal } : { location: locationVal };
      const res = await apiFetch(`/api/businesses/${data.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (res.success) {
        toast.success(
          `${field === "name" ? "Nama" : "Lokasi"} bisnis berhasil diperbarui`,
        );
        setEditingName(false);
        setEditingLocation(false);
        await fetchBusiness();
        await refreshBusiness();
      }
    } catch {
      toast.error("Gagal menyimpan perubahan");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return toast.error("Nama bisnis wajib diisi");
    setCreating(true);
    try {
      const res = await apiFetch("/api/businesses", {
        method: "POST",
        body: JSON.stringify({ name: newName, location: newLocation || null }),
      });
      if (res.success) {
        toast.success("Bisnis baru berhasil ditambahkan!");
        setShowNewForm(false);
        setNewName("");
        setNewLocation("");
        await fetchAllBusinesses();
        await refreshBusiness();
      }
    } catch {
      toast.error("Gagal membuat bisnis");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Hapus bisnis "${name}"? Semua data akan hilang.`)) return;
    try {
      const res = await apiFetch(`/api/businesses/${id}`, { method: "DELETE" });
      if (res.success) {
        toast.success("Bisnis berhasil dihapus");
        await fetchAllBusinesses();
        await refreshBusiness();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus bisnis");
    }
  }

  async function handleSwitch(id: number, name: string) {
    setSwitching(id);
    try {
      await switchBusiness(id);
      toast.success(`Beralih ke "${name}"`);
      // Re-fetch active business detail
      await fetchBusiness();
      await fetchAllBusinesses();
    } catch {
      toast.error("Gagal beralih bisnis");
    } finally {
      setSwitching(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
      </div>
    );
  }

  const stats = data?.stats;
  const counts = data?._count;

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-3">
            <div className="p-2 sm:p-2.5 bg-linear-to-br from-indigo-500 to-indigo-500 rounded-xl text-white">
              <Building2 className="w-5 h-5 sm:w-7 sm:h-7" />
            </div>
            Business
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            Kelola informasi dan performa bisnis Anda
          </p>
        </div>
        <button
          onClick={() => {
            fetchBusiness();
            fetchAllBusinesses();
          }}
          className="self-start flex items-center gap-2 px-4 py-2 text-sm text-gray-500 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </motion.div>
      {/* Greeting Banner */}
      <div className="bg-linear-to-r from-indigo-500 via-indigo-500 to-indigo-400 rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 shadow-xl">
        <h1 className="text-lg sm:text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
          <Smile className="text-yellow-300 shrink-0" size={24} />
          Selamat {greeting}, Semangat untuk mengelola bisnis Anda hari ini!
        </h1>
      </div>
      {/* Active Business Card */}
      {data && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="relative overflow-hidden bg-white rounded-2xl shadow-lg border border-gray-100"
        >
          {/* Decorative gradient bar */}
          <div className="h-2 bg-linear-to-r from-indigo-500 via-indigo-500 to-pink-500" />

          <div className="p-6 sm:p-8">
            {/* Business badge */}
            {/* Top Row */}
            <div className="flex items-start justify-between mb-6 gap-8 flex-col md:flex-row">
              {/* LEFT: Info bisnis */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-full border border-indigo-100">
                    <Star className="w-3 h-3" /> Bisnis Aktif
                  </span>
                  <span className="text-xs text-gray-400">ID: #{data.id}</span>
                </div>
                <div className="flex items-center gap-3 mb-2">
                  <Building2 className="w-5 h-5 text-indigo-400 shrink-0" />
                  {editingName ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        value={nameVal}
                        onChange={(e) => setNameVal(e.target.value)}
                        className="flex-1 px-3 py-2 border border-indigo-200 rounded-lg text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        autoFocus
                        onKeyDown={(e) =>
                          e.key === "Enter" && handleSave("name")
                        }
                      />
                      <button
                        onClick={() => handleSave("name")}
                        disabled={saving}
                        className="p-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 cursor-pointer disabled:opacity-50"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setEditingName(false);
                          setNameVal(data.name);
                        }}
                        className="p-2 bg-gray-100 text-gray-500 rounded-lg hover:bg-gray-200 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-1 group">
                      <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                        {data.name}
                      </h2>
                      <button
                        onClick={() => setEditingName(true)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-all cursor-pointer"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 mb-3">
                  <MapPin className="w-5 h-5 text-pink-400 shrink-0" />
                  {editingLocation ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        value={locationVal}
                        onChange={(e) => setLocationVal(e.target.value)}
                        placeholder="Masukkan lokasi bisnis..."
                        className="flex-1 px-3 py-2 border border-pink-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-pink-300"
                        autoFocus
                        onKeyDown={(e) =>
                          e.key === "Enter" && handleSave("location")
                        }
                      />
                      <button
                        onClick={() => handleSave("location")}
                        disabled={saving}
                        className="p-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 cursor-pointer disabled:opacity-50"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setEditingLocation(false);
                          setLocationVal(data.location || "");
                        }}
                        className="p-2 bg-gray-100 text-gray-500 rounded-lg hover:bg-gray-200 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-1 group">
                      <span className="text-gray-600">
                        {data.location || "Belum diatur"}
                      </span>
                      <button
                        onClick={() => setEditingLocation(true)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-pink-500 hover:bg-pink-50 rounded-lg transition-all cursor-pointer"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-400">
                  <Calendar className="w-5 h-5 shrink-0" />
                  Bergabung sejak {formatDate(data.createdAt)}
                </div>
              </div>
              {/* RIGHT: Insight & Alert Cards */}
              <div className="flex flex-col sm:flex-row gap-3 mt-4 md:mt-0 w-full md:w-auto">
                {/* Positive Insight Card */}
                <div
                  className="relative group bg-linear-to-br from-emerald-50 via-emerald-50/50 to-white border border-emerald-200 rounded-2xl p-4 shadow-md cursor-pointer hover:shadow-emerald-200/60 transition flex items-center gap-3 w-full md:w-56"
                  onClick={() => setIsAlertOpen(true)}
                >
                  <span className="rounded-full bg-emerald-100 p-2.5 shadow-sm shrink-0">
                    <Lightbulb className="text-emerald-600" size={22} />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-emerald-700 text-sm flex items-center gap-1.5">
                      Insight Hari Ini
                      {insights.length > 0 && (
                        <span className="bg-emerald-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                          {insights.length}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-emerald-600 mt-0.5 truncate">
                      {insights.length > 0
                        ? insights[0].title
                        : "Lihat ringkasan bisnis"}
                    </p>
                  </div>
                </div>

                {/* Warning Alert Card */}
                <div
                  className={`relative group border rounded-2xl p-4 shadow-md cursor-pointer transition flex items-center gap-3 w-full md:w-56 ${
                    totalAlertCount > 0
                      ? "bg-linear-to-br from-red-50 via-amber-50/50 to-white border-amber-200 hover:shadow-amber-200/60"
                      : "bg-linear-to-br from-emerald-50 via-white to-white border-emerald-200 hover:shadow-emerald-200/60"
                  }`}
                  onClick={() => setIsAlertOpen(true)}
                >
                  <span
                    className={`rounded-full p-2.5 shadow-sm shrink-0 ${
                      totalAlertCount > 0
                        ? `bg-amber-100 ${alertPulse}`
                        : "bg-emerald-100"
                    }`}
                  >
                    {totalAlertCount > 0 ? (
                      <AlertTriangle className="text-amber-600" size={22} />
                    ) : (
                      <ShieldCheck className="text-emerald-600" size={22} />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p
                      className={`font-semibold text-sm flex items-center gap-1.5 ${
                        totalAlertCount > 0
                          ? "text-amber-700"
                          : "text-emerald-700"
                      }`}
                    >
                      {totalAlertCount > 0 ? "Peringatan Stok" : "Stok Aman"}
                      {totalAlertCount > 0 && (
                        <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold animate-pulse">
                          {totalAlertCount}
                        </span>
                      )}
                    </p>
                    <p
                      className={`text-xs mt-0.5 ${totalAlertCount > 0 ? "text-amber-600" : "text-emerald-600"}`}
                    >
                      {totalAlertCount > 0
                        ? `${totalAlertCount} item perlu dicek`
                        : "Semua bahan baku aman"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Financial Stats Grid */}
            {stats && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <StatTile
                  icon={DollarSign}
                  label="Total Pendapatan"
                  value={formatRupiah(stats.totalRevenue)}
                  color="emerald"
                />
                <StatTile
                  icon={TrendingUp}
                  label="Total Profit"
                  value={formatRupiah(stats.totalProfit)}
                  color="blue"
                />
                <StatTile
                  icon={ShoppingCart}
                  label="Transaksi Lunas"
                  value={String(stats.paidSalesCount)}
                  color="indigo"
                />
                <StatTile
                  icon={Percent}
                  label="Margin Rata-rata"
                  value={
                    stats.marginAvg != null
                      ? `${stats.marginAvg.toFixed(1)}%`
                      : "—"
                  }
                  color="amber"
                />
              </div>
            )}

            {/* Operational Stats */}
            {counts && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MiniStat
                  icon={Package}
                  label="Produk"
                  value={counts.products}
                />
                <MiniStat
                  icon={Boxes}
                  label="Bahan"
                  value={counts.ingredients}
                />
                <MiniStat
                  icon={BarChart3}
                  label="Kategori"
                  value={counts.categories}
                />
                <MiniStat
                  icon={ShoppingCart}
                  label="Total Penjualan"
                  value={counts.sales}
                />
              </div>
            )}
          </div>
        </motion.div>
      )}
      {isAlertOpen && (
        <InsightModal
          alerts={alerts}
          insights={insights}
          onClose={() => setIsAlertOpen(false)}
        />
      )}

      {/* All Businesses List */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden"
      >
        <div className="p-6 flex items-center justify-between border-b border-gray-100">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Daftar Bisnis</h3>
            <p className="text-sm text-gray-500">
              {allBusinesses.length} bisnis terdaftar
            </p>
          </div>
          <button
            onClick={() => setShowNewForm(!showNewForm)}
            className="flex items-center gap-2 px-4 py-2.5 bg-linear-to-r from-indigo-500 to-indigo-500 text-white rounded-xl text-sm font-semibold hover:from-indigo-600 hover:to-indigo-600 transition shadow-md shadow-indigo-100 active:scale-[0.98] cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Tambah Bisnis
          </button>
        </div>

        {/* New Business Form */}
        <AnimatePresence>
          {showNewForm && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="p-6 bg-indigo-50/50 border-b border-indigo-100">
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Nama bisnis *"
                    className="flex-1 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                  <input
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    placeholder="Lokasi (opsional)"
                    className="flex-1 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                  <button
                    onClick={handleCreate}
                    disabled={creating || !newName.trim()}
                    className="px-6 py-2.5 bg-indigo-500 text-white rounded-xl text-sm font-semibold hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition"
                  >
                    {creating ? (
                      <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                    ) : (
                      "Simpan"
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Business List */}
        <div className="divide-y divide-gray-50">
          {allBusinesses.map((biz, i) => (
            <motion.div
              key={biz.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 * i }}
              className={`flex items-center justify-between p-5 hover:bg-gray-50/50 transition ${
                String(biz.id) === String(business?.id) ? "bg-indigo-50/30" : ""
              }`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm ${
                    String(biz.id) === String(business?.id)
                      ? "bg-linear-to-br from-indigo-500 to-indigo-500"
                      : "bg-gray-300"
                  }`}
                >
                  {biz.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900">{biz.name}</p>
                    {String(biz.id) === String(business?.id) && (
                      <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-bold">
                        AKTIF
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">
                    {biz.location || "Tidak ada lokasi"}
                  </p>
                </div>
              </div>
              {allBusinesses.length > 1 &&
                String(biz.id) !== String(business?.id) && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleSwitch(biz.id, biz.name)}
                      disabled={switching === biz.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition cursor-pointer disabled:opacity-50"
                      title="Beralih ke bisnis ini"
                    >
                      {switching === biz.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                      )}
                      Switch
                    </button>
                    <button
                      onClick={() => handleDelete(biz.id, biz.name)}
                      className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition cursor-pointer"
                      title="Hapus bisnis"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────

function StatTile({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    emerald:
      "from-emerald-50 to-emerald-100/50 border-emerald-100 text-emerald-700",
    blue: "from-blue-50 to-blue-100/50 border-blue-100 text-blue-700",
    indigo: "from-indigo-50 to-indigo-100/50 border-indigo-100 text-indigo-700",
    amber: "from-amber-50 to-amber-100/50 border-amber-100 text-amber-700",
  };
  const iconColorMap: Record<string, string> = {
    emerald: "bg-emerald-100 text-emerald-600",
    blue: "bg-blue-100 text-blue-600",
    indigo: "bg-indigo-100 text-indigo-600",
    amber: "bg-amber-100 text-amber-600",
  };

  return (
    <div className={`p-4 rounded-xl bg-linear-to-br border ${colorMap[color]}`}>
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${iconColorMap[color]}`}
      >
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-[10px] sm:text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm sm:text-base md:text-lg font-bold break-all leading-tight">
        {value}
      </p>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
      <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center shadow-sm border border-gray-100">
        <Icon className="w-4 h-4 text-gray-500" />
      </div>
      <div>
        <p className="text-lg font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-400">{label}</p>
      </div>
    </div>
  );
}
