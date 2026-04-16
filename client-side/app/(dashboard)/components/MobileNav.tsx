"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  ShoppingCart,
  Package,
  Menu,
  X,
  History,
  Bot,
  Boxes,
  Building2,
  User,
  FileText,
  Users,
  ClipboardList,
  Factory,
  Settings2,
} from "lucide-react";
import { useRole } from "@/context/RoleContext";
import SidebarUserInfo from "./sidebar_user_info";

interface MobileNavProps {
  jwtUserName?: string;
  jwtUserEmail?: string;
}

export default function MobileNav({
  jwtUserName,
  jwtUserEmail,
}: MobileNavProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const pathname = usePathname();
  const { isOwner, isAdmin, isCashier, isStaff, userName } = useRole();
  const isBakeryManager = isOwner || isAdmin;

  const isActive = (href: string) => {
    if (!pathname) return false;
    // Exact match for top-level routes to avoid false positives
    if (href === "/dashboard/business") return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  };

  // Bottom nav items — max 5
  const bottomItems = isOwner
    ? [
        { href: "/bakery/dashboard", icon: BarChart3, label: "Bakery" },
        { href: "/bakery/bookings", icon: ClipboardList, label: "Bookings" },
        { href: "/bakery/production", icon: Factory, label: "Produksi" },
        { href: "/bakery/calendar", icon: CalendarDays, label: "Calendar" },
      ]
    : isAdmin
      ? [
          { href: "/bakery/bookings", icon: ClipboardList, label: "Bookings" },
          { href: "/bakery/production", icon: Factory, label: "Produksi" },
          { href: "/bakery/calendar", icon: CalendarDays, label: "Calendar" },
          { href: "/bakery/omzet-harian", icon: History, label: "Omzet" },
        ]
    : isStaff
      ? [{ href: "/bakery/production", icon: Factory, label: "Produksi" }]
      : [
          { href: "/pos", icon: ShoppingCart, label: "POS" },
          { href: "/dashboard/sales-history", icon: History, label: "Riwayat" },
          { href: "/dashboard/debts", icon: ClipboardList, label: "Kasbon" },
        ];

  return (
    <>
      {/* ─── Mobile Bottom Navigation Bar ─── */}
      <div className="safe-area-bottom fixed inset-x-0 bottom-0 z-40 border-t border-[#ffd8b7] bg-[linear-gradient(90deg,#fff8ec_0%,#ffefd8_45%,#e9f8ff_100%)]/95 backdrop-blur-lg md:hidden">
        <div className="flex items-center justify-around px-1 py-1.5">
          {bottomItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-2xl px-3 py-1.5 transition-all ${
                  active
                    ? "bg-linear-to-r from-[#ffe8cf] via-[#fff3c8] to-[#e2f7fc] text-[#a94713]"
                    : "text-gray-500 hover:text-[#173a7a]"
                }`}
              >
                <item.icon
                  className={`h-5 w-5 ${active ? "text-[#f26a21]" : ""}`}
                />
                <span className="text-[10px] font-medium truncate">
                  {item.label}
                </span>
              </Link>
            );
          })}
          {/* Hamburger for full menu */}
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-2xl px-3 py-1.5 text-gray-500 transition hover:text-[#173a7a]"
          >
            <Menu className="w-5 h-5" />
            <span className="text-[10px] font-medium">Menu</span>
          </button>
        </div>
      </div>

      {/* ─── Mobile Drawer Overlay ─── */}
      {isDrawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-[#111827]/45 backdrop-blur-sm"
            onClick={() => setIsDrawerOpen(false)}
          />
          {/* Drawer */}
          <div className="animate-slide-in-right relative ml-auto flex h-full w-80 max-w-[85vw] flex-col overflow-y-auto border-l border-[#ffd8b7] bg-linear-to-b from-[#fff9ef] via-[#ffefdb] to-[#e9f8ff] shadow-2xl">
            <div className="pointer-events-none absolute -left-8 top-16 h-28 w-28 rounded-full bg-[#f26a21]/15 blur-2xl" />
            <div className="pointer-events-none absolute right-4 bottom-12 h-24 w-24 rounded-full bg-[#25b4c8]/15 blur-2xl" />
            {/* Drawer header */}
            <div className="flex items-center justify-between border-b border-[#ffd8b7] px-5 py-4">
              <div className="flex items-center gap-2.5">
                <Image
                  src="/branding/Copy%20of%20naik%20payung.png"
                  alt="Crumbella Mascot"
                  width={72}
                  height={72}
                  className="h-14 w-14 object-contain"
                />
              </div>
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="rounded-2xl p-2 transition hover:bg-[#f3f4f6]"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Kasir mode banner */}
            {(isCashier || isStaff) && (
              <div
                className={`mx-4 mt-4 p-3 rounded-xl border ${
                  isStaff
                    ? "bg-linear-to-r from-sky-50 to-cyan-50 border-sky-200"
                    : "bg-linear-to-r from-amber-50 to-orange-50 border-amber-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span
                      className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                        isStaff ? "bg-sky-500" : "bg-amber-500"
                      }`}
                    />
                    <span
                      className={`relative inline-flex rounded-full h-2 w-2 ${
                        isStaff ? "bg-sky-500" : "bg-amber-500"
                      }`}
                    />
                  </span>
                  <span
                    className={`text-xs font-bold ${
                      isStaff ? "text-sky-800" : "text-amber-800"
                    }`}
                  >
                    {isStaff ? "MODE STAFF" : "MODE KASIR"}
                  </span>
                </div>
                {userName && (
                  <p
                    className={`text-[11px] font-medium mt-1 pl-4 ${
                      isStaff ? "text-sky-700" : "text-amber-700"
                    }`}
                  >
                    👤 {userName}
                  </p>
                )}
              </div>
            )}

            {/* Nav links */}
            <div className="relative flex-1 space-y-1 px-4 py-4">
              {(isBakeryManager || isStaff) && (
                <>
                  <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#5f78a1]">
                    Bakery
                  </p>
                  {isOwner && (
                    <>
                      <NavLink
                        href="/bakery/dashboard"
                        icon={BarChart3}
                        label="Dashboard"
                        active={isActive("/bakery/dashboard")}
                        onClick={() => setIsDrawerOpen(false)}
                      />
                    </>
                  )}
                  {isBakeryManager && (
                    <>
                      <NavLink
                        href="/bakery/bookings"
                        icon={ClipboardList}
                        label="Bookings"
                        active={isActive("/bakery/bookings")}
                        onClick={() => setIsDrawerOpen(false)}
                      />
                      <NavLink
                        href="/bakery/calendar"
                        icon={CalendarDays}
                        label="Calendar"
                        active={isActive("/bakery/calendar")}
                        onClick={() => setIsDrawerOpen(false)}
                      />
                    </>
                  )}
                  <NavLink
                    href="/bakery/production"
                    icon={Factory}
                    label="Production"
                    active={isActive("/bakery/production")}
                    onClick={() => setIsDrawerOpen(false)}
                  />
                  {isOwner && (
                    <>
                      <NavLink
                        href="/bakery/reports"
                        icon={FileText}
                        label="Reports"
                        active={isActive("/bakery/reports")}
                        onClick={() => setIsDrawerOpen(false)}
                      />
                      <NavLink
                        href="/bakery/catalog"
                        icon={Settings2}
                        label="Catalog"
                        active={isActive("/bakery/catalog")}
                        onClick={() => setIsDrawerOpen(false)}
                      />
                    </>
                  )}
                </>
              )}

              {isOwner && (
                <>
                  {/*<p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-3 pt-2 pb-1">*/}
                  {/*  Dashboard*/}
                  {/*</p>*/}
                  {/*<NavLink href="/dashboard" icon={BarChart3} label="Overview" active={isActive("/dashboard") && pathname === "/dashboard"} onClick={() => setIsDrawerOpen(false)} />*/}
                  <NavLink
                    href="/analytics"
                    icon={BarChart3}
                    label="Analytics"
                    active={isActive("/analytics")}
                    onClick={() => setIsDrawerOpen(false)}
                  />
                </>
              )}

              {isOwner && (
                <>
                  <p className="px-3 pb-1 pt-4 text-[10px] font-bold uppercase tracking-[0.14em] text-[#5f78a1]">
                    AI Tools
                  </p>
                  <NavLink
                    href="/dashboard/ai-analysis"
                    icon={Bot}
                    label="AI Center"
                    active={isActive("/dashboard/ai-analysis")}
                    onClick={() => setIsDrawerOpen(false)}
                    accent
                  />
                </>
              )}

              {isOwner && (
                <>
                  <p className="px-3 pb-1 pt-4 text-[10px] font-bold uppercase tracking-[0.14em] text-[#5f78a1]">
                    Inventory
                  </p>
                  <NavLink
                    href="/dashboard/products"
                    icon={Package}
                    label="Products"
                    active={isActive("/dashboard/products")}
                    onClick={() => setIsDrawerOpen(false)}
                  />
                  <NavLink
                    href="/dashboard/ingredients"
                    icon={Boxes}
                    label="Ingredients"
                    active={isActive("/dashboard/ingredients")}
                    onClick={() => setIsDrawerOpen(false)}
                  />
                </>
              )}

              {isOwner && (
                <>
                  <p className="px-3 pb-1 pt-4 text-[10px] font-bold uppercase tracking-[0.14em] text-[#5f78a1]">
                    Settings
                  </p>
                  <NavLink
                    href="/dashboard/business"
                    icon={Building2}
                    label="Business"
                    active={isActive("/dashboard/business")}
                    onClick={() => setIsDrawerOpen(false)}
                  />
                  <NavLink
                    href="/dashboard/business/bakery-settings"
                    icon={Settings2}
                    label="Bakery Settings"
                    active={isActive("/dashboard/business/bakery-settings")}
                    onClick={() => setIsDrawerOpen(false)}
                  />
                  <NavLink
                    href="/dashboard/profile"
                    icon={User}
                    label="Profile"
                    active={isActive("/dashboard/profile")}
                    onClick={() => setIsDrawerOpen(false)}
                  />
                  <NavLink
                    href="/dashboard/staff"
                    icon={Users}
                    label="Staff"
                    active={isActive("/dashboard/staff")}
                    onClick={() => setIsDrawerOpen(false)}
                  />
                </>
              )}
            </div>

            {/* User info at bottom */}
            <div className="border-t border-[#ffd8b7] px-4 py-4">
              <SidebarUserInfo
                jwtUserName={jwtUserName}
                jwtUserEmail={jwtUserEmail}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function NavLink({
  href,
  icon: Icon,
  label,
  active,
  accent,
  onClick,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  accent?: boolean;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all ${
        active
          ? "border border-[#ffc894] bg-linear-to-r from-[#ffe8cf] via-[#fff3c8] to-[#e2f7fc] font-semibold text-[#a94713]"
          : accent
            ? "border border-[#8ad9e4] bg-linear-to-r from-[#e5f7fb] via-[#fff4df] to-[#e8efff] text-[#173a7a] hover:brightness-95"
            : "text-gray-600 hover:bg-linear-to-r hover:from-[#fff4df] hover:via-[#e9f8ff] hover:to-[#fff1d8] hover:text-[#173a7a]"
      }`}
    >
      <Icon
        className={`h-4.5 w-4.5 shrink-0 ${
          active ? "text-[#f26a21]" : "text-[#43639b] group-hover:text-[#f26a21]"
        }`}
      />
      {label}
    </Link>
  );
}
