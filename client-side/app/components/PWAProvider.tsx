"use client";

import { useEffect, useState, useCallback } from "react";
import { Wifi, WifiOff, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function PWAProvider() {
  const [isOffline, setIsOffline] = useState(false);
  const [showOfflineBanner, setShowOfflineBanner] = useState(false);

  const handleOffline = useCallback(() => {
    setIsOffline(true);
    setShowOfflineBanner(true);
  }, []);

  const handleOnline = useCallback(() => {
    setIsOffline(false);
    setTimeout(() => setShowOfflineBanner(false), 3000);
  }, []);

  useEffect(() => {
    // Stability first: keep the connectivity banner, but leave service workers
    // disabled until the deployment/runtime path is verified on production.
    if (!navigator.onLine) {
      requestAnimationFrame(() => handleOffline());
    }

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [handleOffline, handleOnline]);

  return (
    <AnimatePresence>
      {showOfflineBanner && (
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          className={`fixed top-0 left-0 right-0 z-9999 flex items-center justify-center gap-2 px-4 py-2.5 text-center text-sm font-medium ${
            isOffline ? "bg-amber-500 text-white" : "bg-green-500 text-white"
          }`}
        >
          {isOffline ? (
            <>
              <WifiOff className="h-4 w-4" />
              <span>Anda sedang offline - beberapa fitur mungkin terbatas</span>
            </>
          ) : (
            <>
              <Wifi className="h-4 w-4" />
              <span>Koneksi kembali!</span>
            </>
          )}
          <button
            onClick={() => setShowOfflineBanner(false)}
            className="ml-2 cursor-pointer rounded p-0.5 hover:bg-white/20"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
