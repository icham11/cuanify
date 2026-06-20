"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, invalidateApiCache } from "@/lib/api/client";
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
let cachedSettingsScope = "";
const SETTINGS_CACHE_TTL_MS = 5 * 60 * 1000;
const SETTINGS_STORAGE_KEY = "bakery-settings-cache:v1";
const BAKERY_SETTINGS_API_CACHE_MATCHER = /\/api\/bakery\/settings(?:\?|$)/;

function getActiveBusinessScope() {
  if (typeof document === "undefined") return "anon";
  const match = document.cookie.match(
    /(?:^|;\s*)active_business_id=([^;]*)/,
  );
  return match ? decodeURIComponent(match[1]) : "anon";
}

function getSettingsStorageKey(scope: string) {
  return `${SETTINGS_STORAGE_KEY}:${scope}`;
}

function resetInMemorySettingsCache() {
  cachedSettings = null;
  cachedSettingsFetchedAt = 0;
  inFlightSettingsRequest = null;
}

function ensureSettingsCacheScope(scope: string) {
  if (cachedSettingsScope === scope) return;
  cachedSettingsScope = scope;
  resetInMemorySettingsCache();
}

function readSettingsFromStorage(scope: string) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(getSettingsStorageKey(scope));
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
  scope: string,
  data: BakeryBusinessSettings,
  fetchedAt: number,
) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      getSettingsStorageKey(scope),
      JSON.stringify({ data, fetchedAt }),
    );
  } catch {
    // Ignore storage errors.
  }
}

export function invalidateBakerySettingsCache() {
  resetInMemorySettingsCache();
  invalidateApiCache(BAKERY_SETTINGS_API_CACHE_MATCHER);

  if (typeof window === "undefined") return;
  try {
    const keysToRemove: string[] = [];
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (!key || !key.startsWith(`${SETTINGS_STORAGE_KEY}:`)) continue;
      keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    // Ignore storage errors.
  }
}

async function fetchBakerySettingsFromApi(
  scope: string,
  options?: { force?: boolean },
): Promise<BakeryBusinessSettings | null> {
  if (options?.force) {
    invalidateApiCache(BAKERY_SETTINGS_API_CACHE_MATCHER);
  }

  const payload = (await apiFetch("/api/bakery/settings", {
    cache: options?.force ? "no-store" : undefined,
    cacheTtlMs: options?.force ? 0 : SETTINGS_CACHE_TTL_MS,
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

  // Do not persist transient default fallback into memory/session cache.
  // Otherwise a brief DB timeout can make legacy defaults "come back"
  // for the next 5 minutes even after the API recovers.
  if (payload.stale === true && payload.source === "default-fallback") {
    return payload.data;
  }

  cachedSettings = payload.data;
  cachedSettingsFetchedAt = Date.now();
  writeSettingsToStorage(scope, payload.data, cachedSettingsFetchedAt);
  return payload.data;
}

export function useBakerySettings(options?: { enabled?: boolean }) {
  const scope = getActiveBusinessScope();
  ensureSettingsCacheScope(scope);

  if (!cachedSettings) {
    const cachedFromStorage = readSettingsFromStorage(scope);
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
      if (options?.force) {
        const nextSettings = await fetchBakerySettingsFromApi(scope, {
          force: true,
        });
        setSettings(nextSettings);
        return nextSettings;
      }

      if (!inFlightSettingsRequest) {
        inFlightSettingsRequest = fetchBakerySettingsFromApi(scope).finally(
          () => {
            inFlightSettingsRequest = null;
          },
        );
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
  }, [scope]);

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
