"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import type { BakeryBusinessSettings } from "@/lib/bakery/settings";

export const BAKERY_SETTINGS_UPDATED_EVENT = "bakery-settings-updated";

interface BakerySettingsResponse {
  success?: boolean;
  data?: BakeryBusinessSettings;
  error?: string;
  stale?: boolean;
  source?: string;
}

let cachedSettings: BakeryBusinessSettings | null = null;
let cachedSettingsFetchedAt = 0;
let inFlightSettingsRequest: Promise<BakeryBusinessSettings | null> | null = null;
const SETTINGS_CACHE_TTL_MS = 5 * 60 * 1000;
const SETTINGS_STORAGE_KEY = "bakery-settings-cache:v1";

function readSettingsFromStorage() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      data?: BakeryBusinessSettings;
      fetchedAt?: number;
    };
    if (!parsed?.data || typeof parsed.fetchedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSettingsToStorage(
  data: BakeryBusinessSettings,
  fetchedAt: number,
) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ data, fetchedAt }),
    );
  } catch {
    // Ignore storage errors.
  }
}

export function invalidateBakerySettingsCache() {
  cachedSettings = null;
  cachedSettingsFetchedAt = 0;
  inFlightSettingsRequest = null;

  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SETTINGS_STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
}

async function fetchBakerySettingsFromApi(): Promise<BakeryBusinessSettings | null> {
  const payload = (await apiFetch("/api/bakery/settings", {
    cacheTtlMs: SETTINGS_CACHE_TTL_MS,
  })) as BakerySettingsResponse;

  if (!payload.data) {
    throw new Error(payload.error || "Failed to load bakery settings");
  }

  if (
    payload.stale === true &&
    payload.source === "default-fallback" &&
    cachedSettings
  ) {
    return cachedSettings;
  }

  cachedSettings = payload.data;
  cachedSettingsFetchedAt = Date.now();
  writeSettingsToStorage(payload.data, cachedSettingsFetchedAt);
  return payload.data;
}

export function useBakerySettings(options?: { enabled?: boolean }) {
  if (!cachedSettings) {
    const cachedFromStorage = readSettingsFromStorage();
    if (cachedFromStorage) {
      cachedSettings = cachedFromStorage.data ?? null;
      cachedSettingsFetchedAt = cachedFromStorage.fetchedAt ?? 0;
    }
  }

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

  // Catatan: Listener window.focus dan visibilitychange sengaja DIHAPUS.
  // Settings bakery adalah data yang jarang berubah; cache TTL 5 menit sudah cukup.
  // Forced refetch setiap user alt-tab menyebabkan lonjakan request ke Neon DB.
  // Jika ada perubahan settings, komponen akan re-fetch via event BAKERY_SETTINGS_UPDATED_EVENT.

  return {
    settings,
    isLoading,
    error,
    refetch,
  };
}
