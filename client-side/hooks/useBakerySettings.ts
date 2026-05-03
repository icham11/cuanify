"use client";

import { useCallback, useEffect, useState } from "react";
import type { BakeryBusinessSettings } from "@/lib/bakery/settings";

export const BAKERY_SETTINGS_UPDATED_EVENT = "bakery-settings-updated";

interface BakerySettingsResponse {
  success?: boolean;
  data?: BakeryBusinessSettings;
  error?: string;
}

export function useBakerySettings() {
  const [settings, setSettings] = useState<BakeryBusinessSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/bakery/settings", {
        cache: "no-store",
      });

      const payload = (await response
        .json()
        .catch(() => ({}))) as BakerySettingsResponse;

      if (!response.ok || !payload.data) {
        throw new Error(payload.error || "Failed to load bakery settings");
      }

      setSettings(payload.data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load bakery settings";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    const handleUpdated = () => {
      void refetch();
    };

    window.addEventListener(BAKERY_SETTINGS_UPDATED_EVENT, handleUpdated);
    return () => {
      window.removeEventListener(BAKERY_SETTINGS_UPDATED_EVENT, handleUpdated);
    };
  }, [refetch]);

  return {
    settings,
    isLoading,
    error,
    refetch,
  };
}
