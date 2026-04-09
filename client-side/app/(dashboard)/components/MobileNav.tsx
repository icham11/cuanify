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
  FileDown,
  FileText,
  Users,
  ClipboardList,
  Clock,
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
  const { isOwner, isCashier, userName } = useRole();

  const isActive = (href: string) => {
    if (!pathname) return false;
    // Exact match for top-level routes to avoid false positives
    if (href === "/dashboard/business") return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  };

  // Bottom nav items — max 5
  const bottomItems = isOwner
    ? [
        { href: "/dashboard/business", icon: Building2, label: "Home" },
        { href: "/pos", icon: ShoppingCart, label: "POS" },
        { href: "/dashboard/products", icon: Package, label: "Produk" },
        { href: "/dashboard/sales-history", icon: History, label: "Riwayat" },
      ]
    : [
        { href: "/pos", icon: ShoppingCart, label: "POS" },
        { href: "/dashboard/sales-history", icon: History, label: "Riwayat" },
        { href: "/dashboard/debts", icon: ClipboardList, label: "Kasbon" },
      ];

  return (
    <>
      {/* ─── Mobile Bottom Navigation Bar ─── */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-lg border-t border-gray-200 safe-area-bottom">
        <div className="flex items-center justify-around px-1 py-1.5">
          {bottomItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all min-w-0 flex-1 ${
                  active
                    ? "text-indigo-600 bg-indigo-50"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <item.icon
                  className={`w-5 h-5 ${active ? "text-indigo-600" : ""}`}
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
            className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-gray-500 hover:text-gray-700 transition min-w-0 flex-1"
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
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setIsDrawerOpen(false)}
          />
          {/* Drawer */}
          <div className="relative ml-auto w-80 max-w-[85vw] h-full bg-white shadow-2xl overflow-y-auto flex flex-col animate-slide-in-right">
            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center">
                <Image
                  src="/cuanify-logo.svg"
                  alt="Cuanify"
                  width={130}
                  height={32}
                  className="h-8 w-auto"
                />
              </div>
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="p-2 hover:bg-gray-100 rounded-xl transition"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Kasir mode banner */}
            {isCashier && (
              <div className="mx-4 mt-4 p-3 bg-linear-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                  </span>
                  <span className="text-xs font-bold text-amber-800">
                    MODE KASIR
                  </span>
                </div>
                {userName && (
                  <p className="text-[11px] text-amber-700 font-medium mt-1 pl-4">
                    👤 {userName}
                  </p>
                )}
              </div>
            )}

            {/* Nav links */}
            <div className="flex-1 px-4 py-4 space-y-1">
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
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-3 pt-4 pb-1">
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

              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-3 pt-4 pb-1">
                Sales
              </p>
              <NavLink
                href="/pos"
                icon={ShoppingCart}
                label="POS"
                active={isActive("/pos")}
                onClick={() => setIsDrawerOpen(false)}
              />
              <NavLink
                href="/dashboard/sales-history"
                icon={History}
                label="Sales History"
                active={isActive("/dashboard/sales-history")}
                onClick={() => setIsDrawerOpen(false)}
              />
              <NavLink
                href="/dashboard/debts"
                icon={ClipboardList}
                label="Kasbon"
                active={isActive("/dashboard/debts")}
                onClick={() => setIsDrawerOpen(false)}
              />
              <NavLink
                href="/dashboard/shift-history"
                icon={Clock}
                label="Closing"
                active={isActive("/dashboard/shift-history")}
                onClick={() => setIsDrawerOpen(false)}
              />
              {isOwner && (
                <NavLink
                  href="/dashboard/export"
                  icon={FileDown}
                  label="Export Data"
                  active={isActive("/dashboard/export")}
                  onClick={() => setIsDrawerOpen(false)}
                />
              )}

              {isOwner && (
                <>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-3 pt-4 pb-1">
                    Bakery
                  </p>
                  <NavLink
                    href="/bakery/dashboard"
                    icon={BarChart3}
                    label="Dashboard"
                    active={isActive("/bakery/dashboard")}
                    onClick={() => setIsDrawerOpen(false)}
                  />
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
                  <NavLink
                    href="/bakery/production"
                    icon={Factory}
                    label="Production"
                    active={isActive("/bakery/production")}
                    onClick={() => setIsDrawerOpen(false)}
                  />
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

                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-3 pt-4 pb-1">
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
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-3 pt-4 pb-1">
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
            <div className="border-t border-gray-100 px-4 py-4">
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
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
        active
          ? "bg-indigo-50 text-indigo-700 font-semibold"
          : accent
            ? "bg-linear-to-r from-purple-50 to-indigo-50 text-purple-700 border border-purple-200 hover:from-purple-100 hover:to-indigo-100"
            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
      }`}
    >
      <Icon className="w-4.5 h-4.5 shrink-0" />
      {label}
    </Link>
  );
}
