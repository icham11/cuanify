"use client";

import { useCallback, useEffect, useState } from "react";
import type { BakeryBusinessSettings } from "@/lib/bakery/settings";

export const BAKERY_SETTINGS_UPDATED_EVENT = "bakery-settings-updated";

interface BakerySettingsResponse {
  success?: boolean;
  data?: BakeryBusinessSettings;
  error?: string;
}

let cachedSettings: BakeryBusinessSettings | null = null;
let cachedSettingsFetchedAt = 0;
let inFlightSettingsRequest: Promise<BakeryBusinessSettings | null> | null = null;
const SETTINGS_CACHE_TTL_MS = 60_000;

async function fetchBakerySettingsFromApi(): Promise<BakeryBusinessSettings | null> {
  const response = await fetch("/api/bakery/settings", {
    cache: "no-store",
  });

  const payload = (await response
    .json()
    .catch(() => ({}))) as BakerySettingsResponse;

  if (!response.ok || !payload.data) {
    throw new Error(payload.error || "Failed to load bakery settings");
  }

  cachedSettings = payload.data;
  cachedSettingsFetchedAt = Date.now();
  return payload.data;
}

export function useBakerySettings(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const [settings, setSettings] = useState<BakeryBusinessSettings | null>(
    cachedSettings,
  );
  const [isLoading, setIsLoading] = useState(enabled && !cachedSettings);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async (options?: { force?: boolean }) => {
    const shouldUseCache =
      !options?.force &&
      cachedSettings &&
      Date.now() - cachedSettingsFetchedAt < SETTINGS_CACHE_TTL_MS;

    if (shouldUseCache) {
      setSettings(cachedSettings);
      setIsLoading(false);
      setError(null);
      return cachedSettings;
    }

    setIsLoading(!cachedSettings);
    setError(null);

    try {
      if (!inFlightSettingsRequest) {
        inFlightSettingsRequest = fetchBakerySettingsFromApi().finally(() => {
          inFlightSettingsRequest = null;
        });
      }

      const nextSettings = await inFlightSettingsRequest;
      setSettings(nextSettings);
      return nextSettings;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load bakery settings";
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    void refetch().catch(() => {});
  }, [enabled, refetch]);

  useEffect(() => {
    if (!enabled) return;

    const handleUpdated = () => {
      void refetch({ force: true }).catch(() => {});
    };

    window.addEventListener(BAKERY_SETTINGS_UPDATED_EVENT, handleUpdated);
    return () => {
      window.removeEventListener(BAKERY_SETTINGS_UPDATED_EVENT, handleUpdated);
    };
  }, [enabled, refetch]);

  return {
    settings,
    isLoading,
    error,
    refetch,
  };
}
