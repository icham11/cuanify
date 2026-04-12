"use client"

import { useSession } from "next-auth/react"
import { useBusiness } from "@/context/BusinessContext"
import { useRole } from "@/context/RoleContext"
import LogoutButton from "./LogoutButton"

type Props = {
  jwtUserName?: string
  jwtUserEmail?: string
}

export default function SidebarUserInfo({ jwtUserName, jwtUserEmail }: Props) {
  const { data: session, status } = useSession()
  const { business, loading } = useBusiness()
  const { isCashier, userName: roleUserName } = useRole()

  const userName =
    roleUserName?.trim() ||
    session?.user?.name?.trim() ||
    jwtUserName?.trim() ||
    session?.user?.email?.trim() ||
    jwtUserEmail?.trim() ||
    "User"

  const businessName = loading ? "Loading business..." : business?.name ?? "No business"

  return (
    <div className="w-full rounded-3xl bg-[linear-gradient(145deg,rgba(255,255,255,0.95)_0%,rgba(255,245,230,0.92)_100%)] p-4 shadow-[0_16px_34px_-24px_rgba(23,58,122,0.8)] ring-1 ring-white/75 backdrop-blur-sm">
      {/* Kasir Mode Badge */}
      {isCashier && (
        <div className="mb-3 flex w-full flex-col items-center">
          <div className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-100 px-3 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
            </span>
            <span className="text-[11px] font-bold text-amber-800 tracking-wide">MODE KASIR</span>
          </div>
        </div>
      )}

      {/* Avatar/Icon */}
      <div
        className={`mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-[20px] border border-[#ffe1c2] shadow-sm ${
          isCashier
            ? 'bg-linear-to-br from-amber-100 via-yellow-50 to-white'
            : 'bg-linear-to-br from-[#fff4ed] via-[#e9f8ff] to-white'
        }`}
      >
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="mx-auto">
          <circle cx="12" cy="12" r="12" fill={isCashier ? "#fef3c7" : "#fff4ed"} />
          <path d="M12 13c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1c0-2.66-5.33-4-8-4z" fill={isCashier ? "#d97706" : "#f36f21"} />
        </svg>
      </div>

      <div className="mb-1 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9ca3af]">
        {isCashier ? "Kasir" : "Logged In"}
      </div>

      <div className="truncate text-center text-base font-bold text-[#243b5a]" title={userName}>
        {status === "loading" ? "Loading user..." : userName}
      </div>

      <div className="mt-1 truncate text-center text-xs font-medium text-[#6b7280]" title={businessName}>
        {businessName}
      </div>

      {/* Logout button */}
      <div className="mt-3 flex w-full justify-center">
        <LogoutButton />
      </div>
    </div>
  )
}
