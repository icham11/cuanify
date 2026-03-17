"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, RefreshCw, Home, Bug } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-linear-to-br from-red-50 via-white to-orange-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="max-w-lg w-full bg-white rounded-2xl shadow-xl border border-red-100 overflow-hidden"
        >
          {/* Header */}
          <div className="bg-linear-to-r from-red-500 to-orange-500 px-8 py-6">
            <motion.div
              initial={{ y: -10 }}
              animate={{ y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex items-center gap-3"
            >
              <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
                <AlertTriangle className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Terjadi Kesalahan Kritis</h1>
                <p className="text-red-100 text-sm">Aplikasi mengalami error tak terduga</p>
              </div>
            </motion.div>
          </div>

          {/* Content */}
          <div className="px-8 py-6 space-y-4">
            <div className="flex items-start gap-3 p-4 bg-red-50 rounded-xl border border-red-100">
              <Bug className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-800">Detail Error</p>
                <p className="text-sm text-red-600 mt-1 font-mono break-all">
                  {error.message || "Unknown error"}
                </p>
                {error.digest && (
                  <p className="text-xs text-red-400 mt-2 font-mono">
                    Digest: {error.digest}
                  </p>
                )}
              </div>
            </div>

            <p className="text-gray-500 text-sm leading-relaxed">
              Terjadi error pada level aplikasi. Coba muat ulang halaman,
              atau kembali ke halaman utama.
            </p>
          </div>

          {/* Actions */}
          <div className="px-8 pb-8 flex gap-3">
            <button
              onClick={reset}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-all active:scale-[0.98] cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              Muat Ulang
            </button>
            <button
              onClick={() => { window.location.href = "/"; }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-all active:scale-[0.98] cursor-pointer"
            >
              <Home className="w-4 h-4" />
              Beranda
            </button>
          </div>
        </motion.div>
      </body>
    </html>
  );
}


