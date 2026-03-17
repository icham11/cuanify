"use client";

import { useEffect, useState, useCallback } from "react";
import { Wifi, WifiOff, X, Download } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * PWA Registration & Offline Status Component
 *
 * - Registers the service worker
 * - Shows an offline banner when connectivity is lost
 * - Shows install prompt (beforeinstallprompt)
 */
export default function PWAProvider() {
  const [isOffline, setIsOffline] = useState(false);
  const [showOfflineBanner, setShowOfflineBanner] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [showInstall, setShowInstall] = useState(false);

  const handleOffline = useCallback(() => {
    setIsOffline(true);
    setShowOfflineBanner(true);
  }, []);

  const handleOnline = useCallback(() => {
    setIsOffline(false);
    setTimeout(() => setShowOfflineBanner(false), 3000);
  }, []);

  useEffect(() => {
    // ─── Register Service Worker ───
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          console.log("[PWA] Service Worker registered:", reg.scope);
        })
        .catch((err) => {
          console.warn("[PWA] Service Worker registration failed:", err);
        });
    }

    // Check initial state via rAF (avoids sync setState-in-effect lint rule)
    if (!navigator.onLine) {
      requestAnimationFrame(() => handleOffline());
    }

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    // ─── Install Prompt ───
    const handleInstallEvt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
      setShowInstall(true);
    };
    window.addEventListener("beforeinstallprompt", handleInstallEvt);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("beforeinstallprompt", handleInstallEvt);
    };
  }, [handleOffline, handleOnline]);

  async function handleInstallClick() {
    if (!installPrompt) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (installPrompt as any).prompt();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (installPrompt as any).userChoice;
    if (result.outcome === "accepted") {
      setShowInstall(false);
      setInstallPrompt(null);
    }
  }

  return (
    <>
      {/* Offline/Online Banner */}
      <AnimatePresence>
        {showOfflineBanner && (
          <motion.div
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            className={`fixed top-0 left-0 right-0 z-9999 px-4 py-2.5 text-center text-sm font-medium flex items-center justify-center gap-2 ${
              isOffline
                ? "bg-amber-500 text-white"
                : "bg-green-500 text-white"
            }`}
          >
            {isOffline ? (
              <>
                <WifiOff className="w-4 h-4" />
                <span>Anda sedang offline — beberapa fitur mungkin terbatas</span>
              </>
            ) : (
              <>
                <Wifi className="w-4 h-4" />
                <span>Koneksi kembali! ✓</span>
              </>
            )}
            <button
              onClick={() => setShowOfflineBanner(false)}
              className="ml-2 p-0.5 rounded hover:bg-white/20 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Install PWA Prompt */}
      <AnimatePresence>
        {showInstall && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-9998 bg-white rounded-2xl shadow-2xl border border-gray-200 p-4"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center shrink-0">
                <Download className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm">Install Cuanify</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Install aplikasi di perangkat Anda untuk akses cepat dan pengalaman yang lebih baik
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleInstallClick}
                    className="flex-1 py-2 px-3 bg-indigo-500 text-white text-xs font-semibold rounded-lg hover:bg-indigo-600 cursor-pointer transition"
                  >
                    Install
                  </button>
                  <button
                    onClick={() => setShowInstall(false)}
                    className="py-2 px-3 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-200 cursor-pointer transition"
                  >
                    Nanti
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
