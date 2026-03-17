"use client";

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";

interface ShiftRunningTotals {
  cashTotal: number;
  qrisTotal: number;
  transferTotal: number;
  digitalTotal: number;
  kasbonTotal: number;
  totalRevenue: number;
  transactionCount: number;
  expectedCash: number;
}

interface ActiveShift {
  id: number;
  status: string;
  openingCash: number;
  openedAt: string;
  openedBy: string;
  runningTotals: ShiftRunningTotals;
}

interface ShiftContextType {
  shift: ActiveShift | null;
  isOpen: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  openShift: (openingCash: number) => Promise<{ success: boolean; error?: string }>;
  closeShift: (actualCash: number, notes?: string) => Promise<{ success: boolean; data?: unknown; error?: string }>;
}

const ShiftContext = createContext<ShiftContextType | null>(null);

export function ShiftProvider({ children }: { children: ReactNode }) {
  const [shift, setShift] = useState<ActiveShift | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/cashier-shift/current");
      const json = await res.json();
      if (json.success) {
        setShift(json.data);
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openShift = useCallback(async (openingCash: number) => {
    try {
      const res = await fetch("/api/cashier-shift/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openingCash }),
      });
      const json = await res.json();
      if (json.success) {
        await refresh();
        return { success: true };
      }
      return { success: false, error: json.error };
    } catch {
      return { success: false, error: "Gagal membuka shift" };
    }
  }, [refresh]);

  const closeShift = useCallback(async (actualCash: number, notes?: string) => {
    try {
      const res = await fetch("/api/cashier-shift/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actualCash, notes }),
      });
      const json = await res.json();
      if (json.success) {
        setShift(null);
        return { success: true, data: json.data };
      }
      return { success: false, error: json.error };
    } catch {
      return { success: false, error: "Gagal menutup shift" };
    }
  }, []);

  return (
    <ShiftContext.Provider value={{ shift, isOpen: !!shift, loading, refresh, openShift, closeShift }}>
      {children}
    </ShiftContext.Provider>
  );
}

export function useShift() {
  const ctx = useContext(ShiftContext);
  if (!ctx) throw new Error("useShift must be used inside ShiftProvider");
  return ctx;
}

