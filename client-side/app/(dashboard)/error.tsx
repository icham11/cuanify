"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  RefreshCw,
  LayoutDashboard,
  Home,
  ChevronDown,
  ChevronUp,
  Bug,
  Copy,
  Check,
  MessageCircle,
} from "lucide-react";
import Link from "next/link";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    console.error("[DashboardError]", error);
  }, [error]);

  const handleCopyError = () => {
    const text = [
      `Error: ${error.message}`,
      `Digest: ${error.digest || "N/A"}`,
      `Page: ${typeof window !== "undefined" ? window.location.pathname : "unknown"}`,
      `Time: ${new Date().toISOString()}`,
    ].join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="flex-1 flex items-center justify-center p-6 bg-linear-to-br from-orange-50/50 via-white to-red-50/50 min-h-[60vh]">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-md w-full"
      >
        {/* Animated Icon */}
        <motion.div
          initial={{ scale: 0, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
          className="flex justify-center mb-6"
        >
          <div className="relative">
            <div className="absolute inset-0 bg-orange-200 rounded-2xl animate-pulse opacity-30" />
            <div className="relative p-5 bg-linear-to-br from-orange-500 to-red-500 rounded-2xl shadow-lg shadow-orange-200">
              <AlertTriangle className="w-9 h-9 text-white" />
            </div>
          </div>
        </motion.div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-orange-100 overflow-hidden">
          <div className="px-8 pt-8 pb-3 text-center">
            <h1 className="text-xl font-bold text-gray-900">
              Terjadi Kesalahan di Dashboard
            </h1>
            <p className="text-gray-500 mt-2 text-sm leading-relaxed">
              Komponen ini mengalami error. Data kamu aman — coba muat ulang
              bagian ini.
            </p>
          </div>

          {/* Quick info pills */}
          <div className="px-8 pb-3">
            <div className="flex flex-wrap gap-2 justify-center">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-50 text-green-700 text-xs font-medium rounded-full border border-green-100">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                Data aman
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full border border-blue-100">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                Sesi aktif
              </span>
            </div>
          </div>

          {/* Error Details (Collapsible) */}
          <div className="px-8 pb-4">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 rounded-xl text-sm text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Bug className="w-4 h-4" />
                Lihat Detail Error
              </span>
              {showDetails ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>

            {showDetails && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="mt-3 p-4 bg-orange-50 rounded-xl border border-orange-100"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-orange-700 break-all leading-relaxed">
                      {error.message || "Unknown error"}
                    </p>
                    {error.digest && (
                      <p className="text-xs text-orange-400 mt-1.5 font-mono">
                        Digest: {error.digest}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={handleCopyError}
                    className="shrink-0 p-1.5 hover:bg-orange-100 rounded-lg transition-colors cursor-pointer"
                    title="Copy error info"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-green-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-orange-400" />
                    )}
                  </button>
                </div>
              </motion.div>
            )}
          </div>

          {/* Actions */}
          <div className="px-8 pb-6 space-y-3">
            <div className="flex gap-3">
              <button
                onClick={reset}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-linear-to-r from-orange-500 to-red-500 text-white rounded-xl font-semibold hover:from-orange-600 hover:to-red-600 transition-all shadow-md shadow-orange-100 active:scale-[0.98] cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                Muat Ulang
              </button>
              <Link
                href="/dashboard/business"
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-all active:scale-[0.98]"
              >
                <LayoutDashboard className="w-4 h-4" />
                Dashboard
              </Link>
            </div>
            <Link
              href="/"
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-gray-500 text-sm hover:text-gray-700 transition-colors"
            >
              <Home className="w-3.5 h-3.5" />
              Kembali ke Beranda
            </Link>
          </div>
        </div>

        {/* AI hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-4 flex items-center justify-center gap-2"
        >
          <Link
            href="/dashboard/ai-analysis"
            className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-blue-500 transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Tanya AI Assistant kalau butuh bantuan
          </Link>
        </motion.div>
      </motion.div>
    </div>
  );
}
