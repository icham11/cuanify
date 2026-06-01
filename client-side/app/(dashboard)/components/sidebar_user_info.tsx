"use client";

import { useSession } from "next-auth/react";
import { useBusiness } from "@/context/BusinessContext";
import { useRole } from "@/context/RoleContext";
import LogoutButton from "./LogoutButton";

type Props = {
  jwtUserName?: string;
  jwtUserEmail?: string;
};

export default function SidebarUserInfo({ jwtUserName, jwtUserEmail }: Props) {
  const { data: session, status } = useSession();
  const { business, businesses, loading, switchBusiness } = useBusiness();
  const { role, userName: roleUserName } = useRole();
  const isCashier = role === "Cashier";

  const userName =
    roleUserName?.trim() ||
    session?.user?.name?.trim() ||
    jwtUserName?.trim() ||
    session?.user?.email?.trim() ||
    jwtUserEmail?.trim() ||
    "User";

  const businessName = loading ? "Loading business..." : business?.name ?? "No business";
  const roleLabel = role === "Owner" ? "Owner" : role === "Admin" ? "Admin" : role === "Staff" ? "Staff" : "Kasir";
  const initials =
    userName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U";

  return (
    <div className="w-full rounded-[28px] border border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] p-4 shadow-[0_16px_34px_-28px_rgba(30,18,10,0.42)]">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--crumbella-accent-soft)] text-sm font-extrabold text-[var(--crumbella-primary)]">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-bold text-[var(--foreground)]" title={userName}>
              {status === "loading" ? "Loading user..." : userName}
            </p>
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                isCashier
                  ? "bg-[#fbf0d8] text-[#9a6b10]"
                  : "bg-[var(--crumbella-accent-soft)] text-[var(--crumbella-primary)]"
              }`}
            >
              {roleLabel}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-[var(--crumbella-muted)]" title={businessName}>
            {businessName}
          </p>
        </div>
      </div>

      {businesses.length > 1 ? (
        <div className="mt-3">
          <label
            htmlFor="sidebar-business-switcher"
            className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--crumbella-muted)]"
          >
            Business Aktif
          </label>
          <select
            id="sidebar-business-switcher"
            value={business?.id ?? ""}
            onChange={(event) => {
              const nextBusinessId = event.target.value;
              if (!nextBusinessId || String(business?.id ?? "") === nextBusinessId) {
                return;
              }
              void switchBusiness(nextBusinessId);
            }}
            className="h-10 w-full rounded-2xl border border-[var(--crumbella-border)] bg-white px-3 text-xs font-semibold text-[var(--foreground)] outline-none transition focus:ring-2 focus:ring-[var(--crumbella-focus)]"
          >
            {businesses.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {isCashier ? (
        <div className="mt-3 rounded-2xl border border-[#ecd8a7] bg-[#fff8e8] px-3 py-2 text-[11px] font-medium text-[#9a6b10]">
          Mode kasir aktif untuk transaksi cepat dan shift.
        </div>
      ) : null}

      <div className="mt-4">
        <LogoutButton />
      </div>
    </div>
  );
}
