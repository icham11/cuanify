"use client";

import useSWR, { type SWRConfiguration } from "swr";
import { apiFetch, invalidateApiCache, peekApiCache } from "@/lib/api/client";
import { API_CACHE_TTL_5_MIN_MS } from "@/lib/api/cache-keys";

type ApiQueryOptions<T> = Omit<
  SWRConfiguration<T, Error>,
  "fetcher" | "fallbackData"
> & {
  enabled?: boolean;
  ttlMs?: number;
  fallbackData?: T;
};

export function useApiQuery<T>(
  key: string | null,
  options?: ApiQueryOptions<T>,
) {
  const {
    enabled = true,
    ttlMs = API_CACHE_TTL_5_MIN_MS,
    fallbackData: fallbackOverride,
    ...swrOptions
  } = options ?? {};

  const fallbackData =
    key == null
      ? undefined
      : fallbackOverride ??
        peekApiCache<T>(key, undefined, { allowStale: true }) ??
        undefined;

  const swr = useSWR<T, Error>(
    enabled ? key : null,
    (url: string) =>
      apiFetch(url, { cacheTtlMs: ttlMs }) as Promise<T>,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: true,
      keepPreviousData: true,
      shouldRetryOnError: false,
      dedupingInterval: 10_000,
      ...swrOptions,
      fallbackData,
    },
  );

  return {
    ...swr,
    errorMessage: swr.error?.message ?? null,
    isLoading: !swr.data && (swr.isLoading || swr.isValidating),
    refresh: async (options?: { force?: boolean }) => {
      if (key && options?.force) {
        invalidateApiCache(key);
      }
      return swr.mutate();
    },
  };
}
