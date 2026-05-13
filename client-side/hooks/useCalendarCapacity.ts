"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_MAX_TOKEN } from "@/lib/calendar/getCalendarStatus";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CapacityEntry {
  date: string;
  usedToken: number;
  maxToken: number;
}

interface CapacityApiResponse {
  success?: boolean;
  data?: {
    defaultMaxToken?: number;
    date?: string;
    usedToken?: number;
    maxToken?: number;
    availableToken?: number;
    tokenNeeded?: number;
    isAvailable?: boolean;
    capacities?: Array<{
      date: string;
      usedToken: number;
      maxToken: number;
      availableToken?: number;
    }>;
  };
  error?: string;
}

interface UseCalendarCapacityReturn {
  /** Map of date (YYYY-MM-DD) → { usedToken, maxToken } */
  capacityMap: Map<string, CapacityEntry>;
  /** Whether the data is currently being fetched */
  isLoading: boolean;
  /** Error message if the fetch failed */
  error: string | null;
  /** Manually trigger a refetch for the current date range */
  refetch: () => void;
  /**
   * Get capacity for a specific date.
   * Returns default values (usedToken=0, maxToken=DEFAULT_MAX_TOKEN) if no data exists.
   */
  getCapacity: (dateKey: string) => CapacityEntry;
}

// ─── Helper ──────────────────────────────────────────────────────────────────

/**
 * Formats a Date to YYYY-MM-DD using local date parts (no timezone shift).
 */
function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Custom hook to fetch token capacity data for a date range.
 *
 * Fetches from GET /api/bookings/capacity?startDate=...&endDate=...
 * Re-fetches when startDate or endDate changes.
 *
 * @param startDate - Start of the range (Date object)
 * @param endDate - End of the range (Date object)
 */
export function useCalendarCapacity(
  startDate: Date,
  endDate: Date,
  fallbackMaxToken = DEFAULT_MAX_TOKEN,
): UseCalendarCapacityReturn {
  const [capacityMap, setCapacityMap] = useState<Map<string, CapacityEntry>>(
    new Map(),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [defaultMaxToken, setDefaultMaxToken] =
    useState<number>(fallbackMaxToken);

  // Track the current range as strings to detect changes
  const startStr = toLocalDateString(startDate);
  const endStr = toLocalDateString(endDate);

  // Use ref to avoid stale closure in refetch
  const rangeRef = useRef({ startStr, endStr });
  rangeRef.current = { startStr, endStr };

  useEffect(() => {
    if (Number.isFinite(fallbackMaxToken) && fallbackMaxToken > 0) {
      setDefaultMaxToken(Math.round(fallbackMaxToken));
    }
  }, [fallbackMaxToken]);

  const fetchCapacity = useCallback(async () => {
    const { startStr: s, endStr: e } = rangeRef.current;

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        startDate: s,
        endDate: e,
      });

      const response = await fetch(
        `/api/bookings/capacity?${params.toString()}`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        const payload = (await response
          .json()
          .catch(() => ({}))) as CapacityApiResponse;
        throw new Error(payload.error || `HTTP ${response.status}`);
      }

      const payload = (await response.json()) as CapacityApiResponse;

      const newMap = new Map<string, CapacityEntry>();
      const apiDefaultMaxToken = Number(payload.data?.defaultMaxToken);
      if (Number.isFinite(apiDefaultMaxToken) && apiDefaultMaxToken > 0) {
        setDefaultMaxToken(Math.round(apiDefaultMaxToken));
      }

      if (payload.data?.capacities) {
        for (const entry of payload.data.capacities) {
          // Normalize date to YYYY-MM-DD (handle potential Date objects from API)
          const dateKey = String(entry.date).slice(0, 10);
          newMap.set(dateKey, {
            date: dateKey,
            usedToken: Number(entry.usedToken) || 0,
            maxToken:
              Number(entry.maxToken) ||
              (Number.isFinite(apiDefaultMaxToken) && apiDefaultMaxToken > 0
                ? Math.round(apiDefaultMaxToken)
                : defaultMaxToken),
          });
        }
      }

      setCapacityMap(newMap);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load capacity data";
      setError(message);
      console.warn("[useCalendarCapacity] Fetch error:", message);
    } finally {
      setIsLoading(false);
    }
  }, [defaultMaxToken]);

  // Fetch on mount and when date range changes
  useEffect(() => {
    void fetchCapacity();
  }, [startStr, endStr, fetchCapacity]);

  const refetch = useCallback(() => {
    void fetchCapacity();
  }, [fetchCapacity]);

  /**
   * Get capacity for a specific date.
   * Returns default values if no data exists for that date.
   */
  const getCapacity = useCallback(
    (dateKey: string): CapacityEntry => {
      const entry = capacityMap.get(dateKey);
      if (entry) return entry;

      // Default: no tokens used, standard max
      return {
        date: dateKey,
        usedToken: 0,
        maxToken: defaultMaxToken,
      };
    },
    [capacityMap, defaultMaxToken],
  );

  return {
    capacityMap,
    isLoading,
    error,
    refetch,
    getCapacity,
  };
}
