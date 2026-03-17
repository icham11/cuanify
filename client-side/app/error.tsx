"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, RefreshCw, Home, ChevronDown, ChevronUp, Bug, Copy, Check } from "lucide-react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    console.error("[AppError]", error);
  }, [error]);

  const handleCopyError = () => {
    const text = `Error: ${error.message}\nDigest: ${error.digest || "N/A"}\nTimestamp: ${new Date().toISOString()}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-red-50 via-white to-orange-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="max-w-md w-full"
      >
        {/* Animated Icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
          className="flex justify-center mb-6"
        >
          <div className="relative">
            <div className="absolute inset-0 bg-red-200 rounded-full animate-ping opacity-20" />
            <div className="relative p-5 bg-linear-to-br from-red-500 to-orange-500 rounded-full shadow-lg shadow-red-200">
              <AlertTriangle className="w-10 h-10 text-white" />
            </div>
          </div>
        </motion.div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl shadow-xl border border-red-100 overflow-hidden"
        >
          <div className="px-8 pt-8 pb-4 text-center">
            <h1 className="text-2xl font-bold text-gray-900">Oops! Ada Masalah 😥</h1>
            <p className="text-gray-500 mt-2 text-sm leading-relaxed">
              Terjadi kesalahan saat memuat halaman ini.
              Jangan khawatir, coba muat ulang atau kembali ke beranda.
            </p>
          </div>

          {/* Error Details (Collapsible) */}
          <div className="px-8 pb-4">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 rounded-xl text-sm text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Bug className="w-4 h-4" />
                Detail Error
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
                className="mt-3 p-4 bg-red-50 rounded-xl border border-red-100"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-mono text-red-600 break-all leading-relaxed">
                    {error.message || "Unknown error occurred"}
                  </p>
                  <button
                    onClick={handleCopyError}
                    className="shrink-0 p-1.5 hover:bg-red-100 rounded-lg transition-colors cursor-pointer"
                    title="Copy error"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-green-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-red-400" />
                    )}
                  </button>
                </div>
                {error.digest && (
                  <p className="text-xs text-red-400 mt-2 font-mono">
                    Digest: {error.digest}
                  </p>
                )}
              </motion.div>
            )}
          </div>

          {/* Actions */}
          <div className="px-8 pb-8 flex gap-3">
            <button
              onClick={reset}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-linear-to-r from-red-500 to-orange-500 text-white rounded-xl font-semibold hover:from-red-600 hover:to-orange-600 transition-all shadow-md shadow-red-100 active:scale-[0.98] cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              Coba Lagi
            </button>
            <Link
              href="/"
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-all active:scale-[0.98]"
            >
              <Home className="w-4 h-4" />
              Beranda
            </Link>
          </div>
        </motion.div>

        {/* Footer hint */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center text-xs text-gray-400 mt-4"
        >
          Jika masalah terus terjadi, hubungi tim support
        </motion.p>
      </motion.div>
    </div>
  );
}
