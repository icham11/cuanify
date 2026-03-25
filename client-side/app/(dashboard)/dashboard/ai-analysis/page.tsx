"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Brain, Camera, FileText, Sparkles, PackageCheck, Truck, BellRing, CalendarClock } from "lucide-react";
import ImageAnalyzer from "@/app/(dashboard)/components/ai/ImageAnalyzer";
import AIChatPage from "@/app/(dashboard)/components/ai/AIChatPage";
import SmartInsightsPanel from "@/app/(dashboard)/components/ai/SmartInsightsPanel";
import DocumentUploader from "@/app/(dashboard)/components/ai/DocumentUploader";
import {
  BAKERY_ORDERS_STORAGE_EVENT,
  readLocalBakeryOrders,
  summarizeLocalBakeryOrders,
  type LocalBakerySummary,
} from "@/lib/bookings/local-orders";

type AITab = "chat" | "insights" | "documents" | "image";

const tabs: { id: AITab; label: string; icon: typeof Bot; desc: string; gradient: string }[] = [
  { id: "chat", label: "AI Assistant", icon: Bot, desc: "Tanya jawab cerdas", gradient: "from-indigo-500 to-violet-500" },
  { id: "insights", label: "Smart Insights", icon: Brain, desc: "Analisis & prediksi", gradient: "from-emerald-500 to-teal-500" },
  { id: "documents", label: "Dokumen", icon: FileText, desc: "Upload PDF ke AI", gradient: "from-amber-500 to-orange-500" },
  { id: "image", label: "Analisis Gambar", icon: Camera, desc: "Foto invoice & stok", gradient: "from-rose-500 to-pink-500" },
];

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
  const [bakerySummary, setBakerySummary] = useState<LocalBakerySummary>(() =>
    summarizeLocalBakeryOrders([])
  );

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;

    const refreshSummary = () => {
      const orders = readLocalBakeryOrders();
      setBakerySummary(summarizeLocalBakeryOrders(orders));
    };

    refreshSummary();
    window.addEventListener("storage", refreshSummary);
    window.addEventListener(BAKERY_ORDERS_STORAGE_EVENT, refreshSummary as EventListener);

    return () => {
      window.removeEventListener("storage", refreshSummary);
      window.removeEventListener(BAKERY_ORDERS_STORAGE_EVENT, refreshSummary as EventListener);
    };
  }, [mounted]);

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

        {/* ─── Bakery Snapshot ─── */}
        <motion.div
          variants={itemVariants}
          className="rounded-xl sm:rounded-2xl border border-amber-100 bg-linear-to-br from-amber-50 via-orange-50 to-rose-50 p-4 sm:p-5"
        >
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-amber-900">Bakery Operations Snapshot</h3>
              <p className="text-xs text-amber-700/80">
                Ringkasan data terbaru dari modul Bakery (booking, resi, automasi)
              </p>
            </div>
            <span className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-medium text-amber-700">
              Local live
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-white/70 bg-white/70 p-3">
              <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <PackageCheck className="h-3.5 w-3.5" />
                Total Booking
              </p>
              <p className="mt-1 text-xl font-bold text-gray-900">{bakerySummary.totalOrders}</p>
            </div>
            <div className="rounded-lg border border-white/70 bg-white/70 p-3">
              <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <Truck className="h-3.5 w-3.5" />
                Resi Aktif
              </p>
              <p className="mt-1 text-xl font-bold text-gray-900">
                {bakerySummary.withResi}/{bakerySummary.totalOrders}
              </p>
            </div>
            <div className="rounded-lg border border-white/70 bg-white/70 p-3">
              <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <CalendarClock className="h-3.5 w-3.5" />
                Kirim Hari Ini
              </p>
              <p className="mt-1 text-xl font-bold text-gray-900">{bakerySummary.deliveryToday}</p>
            </div>
            <div className="rounded-lg border border-white/70 bg-white/70 p-3">
              <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <BellRing className="h-3.5 w-3.5" />
                Pending Automasi
              </p>
              <p className="mt-1 text-xl font-bold text-gray-900">{bakerySummary.pendingAutomation}</p>
            </div>
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
