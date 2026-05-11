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

const AUTH_ME_CACHE_TTL_MS = 30_000;

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
        return normalized;
      })
      .finally(() => {
        inFlightAuthMeRequest = null;
      });
  }

  return inFlightAuthMeRequest;
}
