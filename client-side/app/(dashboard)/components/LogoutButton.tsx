"use client"

import { signOut, useSession } from "next-auth/react"
import { LogOut, Loader2 } from "lucide-react"
import { useState } from "react"

/**
 * Full logout — clears ALL auth state:
 *   1. JWT cookie (token)
 *   2. active_business_id cookie
 *   3. NextAuth session (if using Google login)
 *   4. localStorage & sessionStorage
 *   5. Service Worker caches (PWA)
 */
function clearAllClientState() {
  // Clear all known cookies
  const cookiesToClear = ["token", "active_business_id"];
  cookiesToClear.forEach((name) => {
    document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;`;
    // Also try with domain variations
    document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; domain=${window.location.hostname}`;
  });

  // Clear ALL cookies (brute force — catch any NextAuth leftovers)
  document.cookie.split(";").forEach((c) => {
    const name = c.trim().split("=")[0];
    if (name) {
      document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;`;
    }
  });

  // Clear localStorage & sessionStorage
  try { localStorage.clear(); } catch { /* ignore */ }
  try { sessionStorage.clear(); } catch { /* ignore */ }

  // Clear service worker caches (PWA)
  if ("caches" in window) {
    caches.keys().then((names) => {
      names.forEach((name) => caches.delete(name));
    });
  }
}

export default function LogoutButton() {
  const { data: session } = useSession()
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    setLoggingOut(true)

    // 1. Call server to clear httpOnly cookies (token can't be cleared client-side!)
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" })
    } catch { /* continue even if this fails */ }

    // 2. Clear all client-side state
    clearAllClientState()

    if (session) {
      // NextAuth (Google) — signOut will redirect
      await signOut({ callbackUrl: "/" })
    } else {
      // JWT (email/password) — hard redirect
      window.location.replace("/")
    }
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loggingOut}
      className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#f8d9c6] bg-[#fff4ed] px-4 py-2.5 text-sm font-semibold text-[#b4531a] transition hover:bg-[#ffe8da] disabled:opacity-50"
    >
      {loggingOut ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <LogOut className="w-4 h-4" />
      )}
      {loggingOut ? "Keluar..." : "Logout"}
    </button>
  )
}
