"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DailyOmzetSnapshot,
  getJakartaDateKey,
  toDateInputValue,
} from "@/lib/admin/daily-omzet-shared";
import {
  BAKERY_ORDERS_STORAGE_KEY,
  BAKERY_ORDERS_UPDATED_EVENT,
} from "@/lib/bookings/client-events";

interface UseDailyOmzetSnapshotOptions {
  enabled?: boolean;
  initialDate?: string;
}

export function useDailyOmzetSnapshot(
  options: UseDailyOmzetSnapshotOptions = {},
) {
  const { enabled = true, initialDate } = options;
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<DailyOmzetSnapshot | null>(null);
  const [selectedDate, setSelectedDate] = useState(
    () => initialDate ?? toDateInputValue(new Date()),
  );
  const dateKeyRef = useRef<string>(getJakartaDateKey());

  const fetchDailyOmzet = useCallback(
    async (silent = false) => {
      if (!enabled) return;

      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const response = await fetch(
          `/api/admin/daily-omzet?date=${encodeURIComponent(selectedDate)}`,
          {
            method: "GET",
            credentials: "include",
            cache: "no-store",
          },
        );

        const payload = (await response.json()) as {
          success?: boolean;
          data?: DailyOmzetSnapshot;
          error?: string;
        };

        if (!response.ok || !payload.success || !payload.data) {
          throw new Error(payload.error || "Gagal memuat data omzet harian");
        }

        setData(payload.data);
        setError("");
        dateKeyRef.current = selectedDate;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Gagal memuat data omzet harian",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [enabled, selectedDate],
  );

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    void fetchDailyOmzet(false);
  }, [enabled, fetchDailyOmzet]);

  useEffect(() => {
    if (!enabled) return;

    const timer = window.setInterval(() => {
      const currentDateKey = getJakartaDateKey();
      if (selectedDate === currentDateKey || currentDateKey !== dateKeyRef.current) {
        dateKeyRef.current = selectedDate;
        void fetchDailyOmzet(true);
      }
    }, 60_000);

    return () => window.clearInterval(timer);
  }, [enabled, fetchDailyOmzet, selectedDate]);

  useEffect(() => {
    if (!enabled) return;

    const handleFocus = () => {
      void fetchDailyOmzet(true);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void fetchDailyOmzet(true);
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, fetchDailyOmzet]);

  useEffect(() => {
    if (!enabled) return;

    const handleOrdersUpdated = () => {
      void fetchDailyOmzet(true);
    };

    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === BAKERY_ORDERS_STORAGE_KEY ||
        event.key?.startsWith(`${BAKERY_ORDERS_STORAGE_KEY}:`)
      ) {
        void fetchDailyOmzet(true);
      }
    };

    window.addEventListener(BAKERY_ORDERS_UPDATED_EVENT, handleOrdersUpdated);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(
        BAKERY_ORDERS_UPDATED_EVENT,
        handleOrdersUpdated,
      );
      window.removeEventListener("storage", handleStorage);
    };
  }, [enabled, fetchDailyOmzet]);

  return {
    data,
    error,
    fetchDailyOmzet,
    loading,
    refreshing,
    selectedDate,
    setSelectedDate,
  };
}
