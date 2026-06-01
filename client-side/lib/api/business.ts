import { apiFetch, invalidateApiCache, peekApiCache } from "./client"
import { invalidateAuthMeCache } from "@/lib/auth/auth-me-client"
import { invalidateBakerySettingsCache } from "@/hooks/useBakerySettings"
import { BAKERY_ORDERS_UPDATED_EVENT } from "@/lib/bookings/client-events"

export type Business = {
  id: string
  name: string
  location: string
}

const ACTIVE_BUSINESS_COOKIE = "active_business_id"
export const ACTIVE_BUSINESS_CHANGED_EVENT = "activeBusinessChanged"

/** Read active_business_id cookie from the browser. */
function getActiveBusinessId(): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${ACTIVE_BUSINESS_COOKIE}=([^;]*)`)
  )
  return match ? decodeURIComponent(match[1]) : null
}

/** Write active_business_id cookie (httpOnly=false so client can set it). */
function setActiveBusinessCookie(id: string) {
  document.cookie = `${ACTIVE_BUSINESS_COOKIE}=${id};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`
}

// 🔹 GET all businesses for current user
export async function getAllBusinesses(): Promise<Business[]> {
  try {
    const result = await apiFetch("/api/businesses")
    if (!result?.success) return []
    return result.data ?? []
  } catch {
    return []
  }
}

// 🔹 GET current (active) business — respects cookie preference
export async function getCurrentBusiness(): Promise<Business | null> {
  try {
    const result = await apiFetch("/api/businesses")
    if (!result?.success) return null

    const list: Business[] = result.data ?? []
    if (list.length === 0) return null

    // If there's a saved preference, use it
    const savedId = getActiveBusinessId()
    if (savedId) {
      const found = list.find((b) => String(b.id) === savedId)
      if (found) return found
    }

    // Otherwise, pick the first one and persist
    const first = list[0]
    setActiveBusinessCookie(String(first.id))
    return first
  } catch {
    return null
  }
}

/**
 * Switch the active business.
 * Sets a cookie so the server-side `requireAuth` can also read it.
 */
export function switchBusiness(id: string | number) {
  setActiveBusinessCookie(String(id))
  invalidateAuthMeCache()
  invalidateBakerySettingsCache()
  invalidateApiCache()
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(ACTIVE_BUSINESS_CHANGED_EVENT, {
        detail: { businessId: String(id) },
      }),
    )
    window.dispatchEvent(new Event(BAKERY_ORDERS_UPDATED_EVENT))
  }
}

// 🔹 CREATE business
export async function createBusiness(data: {
  name: string
  location: string
}) {
  const result = await apiFetch("/api/businesses", {
    method: "POST",
    body: JSON.stringify(data),
  })
  invalidateApiCache("/api/businesses")
  return result
}

export function peekBusinessesCache(): Business[] {
  const payload = peekApiCache<{ success?: boolean; data?: Business[] }>(
    "/api/businesses",
  );
  return payload?.success && Array.isArray(payload.data) ? payload.data : [];
}
