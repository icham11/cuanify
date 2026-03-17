import { apiFetch } from "./client"

export type Business = {
  id: string
  name: string
  location: string
}

const ACTIVE_BUSINESS_COOKIE = "active_business_id"

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
}

// 🔹 CREATE business
export async function createBusiness(data: {
  name: string
  location: string
}) {
  return apiFetch("/api/businesses", {
    method: "POST",
    body: JSON.stringify(data),
  })
}