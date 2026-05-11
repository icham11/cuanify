"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bot,
  CalendarDays,
  Coins,
  Package,
  Building2,
  User,
  FileText,
  Users,
  ClipboardList,
  Factory,
  Settings2,
  ContactRound,
  Store,
} from "lucide-react";
import { useRole } from "@/context/RoleContext";

export default function SidebarNav() {
  const { isOwner, isAdmin, isCashier, isStaff, userName, loading } = useRole();
  const isBakeryManager = isOwner || isAdmin;
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href ||
    (href !== "/dashboard" && pathname?.startsWith(href + "/"));

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-9 rounded-xl bg-[#eef2f7] animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <nav className="space-y-7">
      {(isCashier || isStaff) && (
        <div
          className={`rounded-2xl border p-3.5 shadow-sm ${
            isStaff
              ? "border-sky-200 bg-linear-to-r from-sky-50 via-cyan-50 to-[#fff9df]"
              : "border-amber-200 bg-linear-to-r from-amber-50 via-[#fff9df] to-orange-50"
          }`}
        >
          <div className="mb-1 flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
                  isStaff ? "bg-sky-500" : "bg-amber-500"
                }`}
              />
              <span
                className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                  isStaff ? "bg-sky-500" : "bg-amber-500"
                }`}
              />
            </span>
            <span className={`text-xs font-bold tracking-wide ${isStaff ? "text-sky-800" : "text-amber-800"}`}>
              {isStaff ? "MODE STAFF" : "MODE KASIR"}
            </span>
          </div>
          {userName && (
            <p
              className={`truncate pl-4.5 text-[11px] font-medium ${isStaff ? "text-sky-700" : "text-amber-700"}`}
            >
              {userName}
            </p>
          )}
        </div>
      )}

      {(isBakeryManager || isStaff) && (
        <div>
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#5f78a1]">
            Bakery
          </p>
          {isOwner && (
            <SidebarLink
              href="/bakery/dashboard"
              icon={BarChart3}
              label="Dashboard"
              active={isActive("/bakery/dashboard")}
            />
          )}
          {isBakeryManager && (
            <>
              <SidebarLink
                href="/bakery/bookings"
                icon={ClipboardList}
                label="Bookings"
                active={isActive("/bakery/bookings")}
              />
              <SidebarLink
                href="/bakery/calendar"
                icon={CalendarDays}
                label="Calendar"
                active={isActive("/bakery/calendar")}
              />
              {isAdmin && (
                <SidebarLink
                  href="/bakery/omzet-harian"
                  icon={Coins}
                  label="Omzet Harian"
                  active={isActive("/bakery/omzet-harian")}
                />
              )}
            </>
          )}
          <SidebarLink
            href="/bakery/production"
            icon={Factory}
            label="Production"
            active={isActive("/bakery/production")}
          />
          {isBakeryManager && (
            <>
              <SidebarLink
                href="/bakery/reports"
                icon={FileText}
                label="Reports"
                active={isActive("/bakery/reports")}
              />
              <SidebarLink
                href="/bakery/ecommerce"
                icon={Store}
                label="E-Commerce"
                active={isActive("/bakery/ecommerce")}
              />
              <SidebarLink
                href="/bakery/customers"
                icon={ContactRound}
                label="Customers"
                active={isActive("/bakery/customers")}
              />
            </>
          )}
        </div>
      )}

      {isOwner && (
        <div>
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#5f78a1]">
            AI Tools
          </p>
          <SidebarLink
            href="/dashboard/ai-analysis"
            icon={Bot}
            label="AI Center"
            active={isActive("/dashboard/ai-analysis")}
          />
        </div>
      )}

      {isBakeryManager && (
        <div>
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#5f78a1]">
            Inventory
          </p>
          <SidebarLink
            href="/dashboard/products"
            icon={Package}
            label="Products"
            active={isActive("/dashboard/products")}
          />
          <SidebarLink
            href="/dashboard/add-ons"
            icon={Package}
            label="Add on"
            active={isActive("/dashboard/add-ons")}
          />
        </div>
      )}

      {isOwner && (
        <div>
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#5f78a1]">
            Settings
          </p>
          <SidebarLink
            href="/dashboard/business"
            icon={Building2}
            label="Business"
            active={isActive("/dashboard/business")}
          />
          <SidebarLink
            href="/dashboard/business/bakery-settings"
            icon={Settings2}
            label="Bakery Settings"
            active={isActive("/dashboard/business/bakery-settings")}
          />
          <SidebarLink
            href="/dashboard/profile"
            icon={User}
            label="Profile"
            active={isActive("/dashboard/profile")}
          />
          <SidebarLink
            href="/dashboard/staff"
            icon={Users}
            label="Staff"
            active={isActive("/dashboard/staff")}
          />
        </div>
      )}
    </nav>
  );
}

function SidebarLink({
  href,
  icon: Icon,
  label,
  active,
  accent,
  badge,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  accent?: boolean;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      className={`group relative flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200 ${
        active
          ? "bg-linear-to-r from-[#ffe8cf] via-[#fff3c8] to-[#e2f7fc] text-[#a94713] shadow-[0_12px_24px_-18px_rgba(242,106,33,0.95)] ring-1 ring-[#ffc894]/70"
          : accent
            ? "bg-linear-to-r from-[#e5f7fb] via-[#fff4df] to-[#e8efff] text-[#173a7a] ring-1 ring-[#8ad9e4]/60 hover:brightness-95"
            : "text-[#4b5563] hover:bg-linear-to-r hover:from-[#fff4df] hover:via-[#e9f8ff] hover:to-[#fff1d8] hover:text-[#173a7a] hover:ring-1 hover:ring-[#ffd8b7]/65"
      }`}
    >
      {active ? (
        <span className="absolute left-1 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-[#f36f21]" />
      ) : null}
      <Icon
        className={`h-4 w-4 shrink-0 transition ${
          active ? "text-[#f26a21]" : "text-[#43639b] group-hover:text-[#f26a21]"
        }`}
      />
      <span className="truncate">{label}</span>
      {badge && (
        <span className="ml-auto rounded-full bg-[#ffe1cf] px-1.5 py-0.5 text-[9px] font-bold text-[#b4531a]">
          {badge}
        </span>
      )}
    </Link>
  );
}
