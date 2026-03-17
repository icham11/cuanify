"use client";

import { createContext, useContext, useState, useMemo } from "react";

type RangeType = "today" | "7d" | "30d" | "all";

type DateRangeContextType = {
  range: RangeType;
  setRange: (r: RangeType) => void;
  start?: Date;
  end?: Date;
};

const DateRangeContext = createContext<DateRangeContextType | null>(null);

// Never call new Date() at module level or during render.
// This function is only invoked inside useMemo (client-side, post-mount safe).
function calculateRange(range: RangeType) {
  const now = new Date();
  const end = new Date(now);

  if (range === "all") return { start: undefined, end };

  const start = new Date(now);

  if (range === "today") start.setHours(0, 0, 0, 0);
  if (range === "7d") {
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  }
  if (range === "30d") {
    start.setDate(now.getDate() - 29);
    start.setHours(0, 0, 0, 0);
  }

  return { start, end };
}

export function DateRangeProvider({ children }: { children: React.ReactNode }) {
  const [range, setRange] = useState<RangeType>("7d");

  // useMemo ensures new Date() is only called when `range` changes,
  // not on every render. The initial value is stable across hydration
  // because Date objects are not directly serialised into SSR HTML —
  // they are only used as inputs to fetch() inside useEffect callbacks.
  const { start, end } = useMemo(() => calculateRange(range), [range]);

  return <DateRangeContext.Provider value={{ range, setRange, start, end }}>{children}</DateRangeContext.Provider>;
}

export function useDateRange() {
  const context = useContext(DateRangeContext);
  if (!context) throw new Error("useDateRange must be used inside provider");
  return context;
}
