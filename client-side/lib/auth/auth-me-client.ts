"use client";

export type ClientUserRole = "Owner" | "Admin" | "Cashier" | "Staff";

export interface AuthMePayload {
  userId: number;
  businessId: number;
  businessName: string;
  role: ClientUserRole;
  name: string;
  email: string;
}

interface AuthMeResponse {
  success?: boolean;
  data?: Partial<AuthMePayload>;
  error?: string;
}

let cachedAuthMe: AuthMePayload | null = null;
let cachedAuthMeFetchedAt = 0;
let inFlightAuthMeRequest: Promise<AuthMePayload | null> | null = null;
let cachedAuthMeScope = "";

const AUTH_ME_CACHE_TTL_MS = 5 * 60 * 1000;
const AUTH_ME_STORAGE_KEY = "auth-me-cache:v1";

function getActiveBusinessScope() {
  if (typeof document === "undefined") return "anon";
  const match = document.cookie.match(
    /(?:^|;\s*)active_business_id=([^;]*)/,
  );
  return match ? decodeURIComponent(match[1]) : "anon";
}

function getAuthMeStorageKey(scope: string) {
  return `${AUTH_ME_STORAGE_KEY}:${scope}`;
}

function resetInMemoryAuthMeCache() {
  cachedAuthMe = null;
  cachedAuthMeFetchedAt = 0;
  inFlightAuthMeRequest = null;
}

function ensureAuthMeCacheScope(scope: string) {
  if (cachedAuthMeScope === scope) return;
  cachedAuthMeScope = scope;
  resetInMemoryAuthMeCache();
}

function readAuthMeFromStorage(scope: string) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(getAuthMeStorageKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      data?: Partial<AuthMePayload>;
      fetchedAt?: number;
    };
    if (typeof parsed?.fetchedAt !== "number") return null;

    const normalized = normalizeAuthMePayload(parsed.data);
    if (!normalized) return null;

    return {
      data: normalized,
      fetchedAt: parsed.fetchedAt,
    };
  } catch {
    return null;
  }
}

function writeAuthMeToStorage(
  scope: string,
  payload: AuthMePayload,
  fetchedAt: number,
) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      getAuthMeStorageKey(scope),
      JSON.stringify({ data: payload, fetchedAt }),
    );
  } catch {
    // Ignore storage errors.
  }
}

export function invalidateAuthMeCache() {
  resetInMemoryAuthMeCache();

  if (typeof window === "undefined") return;
  try {
    const keysToRemove: string[] = [];
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (!key || !key.startsWith(`${AUTH_ME_STORAGE_KEY}:`)) continue;
      keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    // Ignore storage errors.
  }
}

function normalizeRole(value: unknown): ClientUserRole | null {
  if (
    value === "Owner" ||
    value === "Admin" ||
    value === "Cashier" ||
    value === "Staff"
  ) {
    return value;
  }

  return null;
}

function normalizeAuthMePayload(value: Partial<AuthMePayload> | undefined) {
  const userId = Number(value?.userId);
  const businessId = Number(value?.businessId);
  const role = normalizeRole(value?.role);

  if (!Number.isInteger(userId) || userId <= 0) return null;
  if (!Number.isInteger(businessId) || businessId <= 0) return null;
  if (!role) return null;

  return {
    userId,
    businessId,
    businessName:
      typeof value?.businessName === "string" ? value.businessName : "",
    role,
    name: typeof value?.name === "string" ? value.name : "User",
    email: typeof value?.email === "string" ? value.email : "",
  } satisfies AuthMePayload;
}

export async function fetchAuthMe(options?: { force?: boolean }) {
  const scope = getActiveBusinessScope();
  ensureAuthMeCacheScope(scope);

  if (!cachedAuthMe) {
    const cachedFromStorage = readAuthMeFromStorage(scope);
    if (cachedFromStorage) {
      cachedAuthMe = cachedFromStorage.data;
      cachedAuthMeFetchedAt = cachedFromStorage.fetchedAt;
    }
  }

  const shouldUseCache =
    !options?.force &&
    cachedAuthMe &&
    Date.now() - cachedAuthMeFetchedAt < AUTH_ME_CACHE_TTL_MS;

  if (shouldUseCache) {
    return cachedAuthMe;
  }

  if (!inFlightAuthMeRequest) {
    inFlightAuthMeRequest = fetch("/api/auth/me", {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = (await response
          .json()
          .catch(() => ({}))) as AuthMeResponse;

        if (!response.ok) {
          throw new Error(payload.error || "Failed to load auth profile");
        }

        const normalized = normalizeAuthMePayload(payload.data);
        if (!normalized) {
          throw new Error("Invalid auth profile payload");
        }

        cachedAuthMe = normalized;
        cachedAuthMeFetchedAt = Date.now();
        writeAuthMeToStorage(scope, normalized, cachedAuthMeFetchedAt);
        return normalized;
      })
      .finally(() => {
        inFlightAuthMeRequest = null;
      });
  }

  return inFlightAuthMeRequest;
}
