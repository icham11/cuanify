"use client";

import { signOut } from "next-auth/react";

function clearAllClientState() {
  // Clear all cookies
  document.cookie.split(";").forEach((c) => {
    const name = c.trim().split("=")[0];
    if (name) {
      document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;`;
    }
  });
  try { localStorage.clear(); } catch { /* ignore */ }
  try { sessionStorage.clear(); } catch { /* ignore */ }
  if ("caches" in window) {
    caches.keys().then((names) => names.forEach((n) => caches.delete(n)));
  }
}

export default function LogoutButton() {
  return (
    <button
      onClick={async () => {
        try { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }); } catch { /* ok */ }
        clearAllClientState();
        signOut({ callbackUrl: "/" });
      }}
      className="w-full py-2 rounded-lg bg-red-500 text-white font-bold text-base shadow hover:bg-red-600 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-400 mt-4"
    >
      Logout
    </button>
  );
}
