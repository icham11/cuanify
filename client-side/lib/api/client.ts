type ApiCacheEntry = {
  data: unknown;
  cachedAt: number;
  expiresAt: number;
};

const API_CACHE_PREFIX = "api-fetch-cache:v1:";
const DEFAULT_API_CACHE_TTL_MS = 2 * 60 * 1000;

const apiMemoryCache = new Map<string, ApiCacheEntry>();
const apiInFlightRequests = new Map<string, Promise<unknown>>();

function resolveRequestMethod(input: RequestInfo, init?: RequestInit): string {
  return (init?.method ?? (input instanceof Request ? input.method : "GET"))
    .toUpperCase()
    .trim();
}

function resolveRequestUrl(input: RequestInfo): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function isCacheableRequest(input: RequestInfo, init?: RequestInit) {
  return (
    typeof window !== "undefined" &&
    resolveRequestMethod(input, init) === "GET" &&
    init?.cache !== "no-store"
  );
}

function buildApiCacheKey(input: RequestInfo, init?: RequestInit) {
  return `${resolveRequestMethod(input, init)}:${resolveRequestUrl(input)}`;
}

function readApiCacheFromStorage(cacheKey: string): ApiCacheEntry | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(`${API_CACHE_PREFIX}${cacheKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ApiCacheEntry;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.cachedAt !== "number" ||
      typeof parsed.expiresAt !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeApiCacheToStorage(cacheKey: string, entry: ApiCacheEntry) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(
      `${API_CACHE_PREFIX}${cacheKey}`,
      JSON.stringify(entry),
    );
  } catch {
    // Ignore storage quota / serialization errors and keep memory cache only.
  }
}

function removeApiCacheStorage(cacheKey: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(`${API_CACHE_PREFIX}${cacheKey}`);
  } catch {
    // Ignore storage errors.
  }
}

function getFreshApiCacheEntry(cacheKey: string): ApiCacheEntry | null {
  const now = Date.now();
  const memoryEntry = apiMemoryCache.get(cacheKey);
  if (memoryEntry) {
    if (memoryEntry.expiresAt > now) return memoryEntry;
    apiMemoryCache.delete(cacheKey);
    removeApiCacheStorage(cacheKey);
  }

  const storageEntry = readApiCacheFromStorage(cacheKey);
  if (!storageEntry) return null;
  if (storageEntry.expiresAt <= now) {
    removeApiCacheStorage(cacheKey);
    return null;
  }

  apiMemoryCache.set(cacheKey, storageEntry);
  return storageEntry;
}

function writeApiCacheEntry(
  cacheKey: string,
  data: unknown,
  ttlMs = DEFAULT_API_CACHE_TTL_MS,
) {
  const entry: ApiCacheEntry = {
    data,
    cachedAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
  };

  apiMemoryCache.set(cacheKey, entry);
  writeApiCacheToStorage(cacheKey, entry);
}

function shouldIncludeJsonContentType(init?: RequestInit) {
  const method = resolveRequestMethod("/__dummy__", init);
  return method !== "GET" && method !== "HEAD";
}

export function peekApiCache<T>(
  input: RequestInfo,
  init?: RequestInit,
): T | null {
  if (!isCacheableRequest(input, init)) return null;
  const entry = getFreshApiCacheEntry(buildApiCacheKey(input, init));
  return (entry?.data as T | undefined) ?? null;
}

export function primeApiCache(
  input: RequestInfo,
  data: unknown,
  init?: RequestInit,
  ttlMs = DEFAULT_API_CACHE_TTL_MS,
) {
  if (!isCacheableRequest(input, init)) return;
  writeApiCacheEntry(buildApiCacheKey(input, init), data, ttlMs);
}

export function invalidateApiCache(
  matcher?:
    | string
    | RegExp
    | ((cacheKey: string) => boolean),
) {
  const matches =
    typeof matcher === "function"
      ? matcher
      : matcher instanceof RegExp
        ? (cacheKey: string) => matcher.test(cacheKey)
        : typeof matcher === "string"
          ? (cacheKey: string) => cacheKey.includes(matcher)
          : () => true;

  const memoryKeys = [...apiMemoryCache.keys()];
  for (const cacheKey of memoryKeys) {
    if (!matches(cacheKey)) continue;
    apiMemoryCache.delete(cacheKey);
    removeApiCacheStorage(cacheKey);
  }

  if (typeof window === "undefined") return;

  try {
    const keysToRemove: string[] = [];
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const storageKey = window.sessionStorage.key(index);
      if (!storageKey || !storageKey.startsWith(API_CACHE_PREFIX)) continue;
      const cacheKey = storageKey.slice(API_CACHE_PREFIX.length);
      if (matches(cacheKey)) {
        keysToRemove.push(storageKey);
      }
    }

    keysToRemove.forEach((storageKey) => {
      window.sessionStorage.removeItem(storageKey);
    });
  } catch {
    // Ignore storage enumeration errors.
  }
}

export async function apiFetch(
  input: RequestInfo,
  init?: RequestInit & { signal?: AbortSignal },
  timeoutMs = 30000,
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const shouldUseCache = isCacheableRequest(input, init);
  const cacheKey = shouldUseCache ? buildApiCacheKey(input, init) : null;

  try {
    if (cacheKey) {
      const cachedEntry = getFreshApiCacheEntry(cacheKey);
      if (cachedEntry) {
        return cachedEntry.data;
      }

      const inFlightRequest = apiInFlightRequests.get(cacheKey);
      if (inFlightRequest) {
        return inFlightRequest;
      }
    }

    const signal = init?.signal || controller.signal;
    const headers = {
      ...(shouldIncludeJsonContentType(init)
        ? { "Content-Type": "application/json" }
        : {}),
      ...(init?.headers || {}),
    };

    const requestPromise = (async () => {
      const res = await fetch(input, {
        credentials: "include",
        ...init,
        signal,
        headers,
      });

      if (res.status === 401) {
        throw new Error("Unauthorized");
      }

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || "API Error");
      }

      const json = await res.json();
      if (cacheKey) {
        writeApiCacheEntry(cacheKey, json);
      }
      return json;
    })();

    if (cacheKey) {
      apiInFlightRequests.set(cacheKey, requestPromise);
    }

    return await requestPromise;
  } finally {
    if (cacheKey) {
      apiInFlightRequests.delete(cacheKey);
    }
    clearTimeout(timeoutId);
  }
}
