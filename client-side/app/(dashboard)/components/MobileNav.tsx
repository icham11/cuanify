"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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

export default function MobileNav({ jwtUserName, jwtUserEmail }: MobileNavProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [hasInlineTrigger, setHasInlineTrigger] = useState(false);
  const pathname = usePathname();
  const { isOwner, isAdmin, isStaff } = useRole();
  const isBakeryManager = isOwner || isAdmin;

  useEffect(() => {
    const updateInlineTrigger = () => {
      setHasInlineTrigger(Boolean(document.querySelector("[data-mobile-nav-trigger='inline']")));
    };

    const handleOpen = () => setIsDrawerOpen(true);
    updateInlineTrigger();
    window.addEventListener("crumbella:open-mobile-nav", handleOpen as EventListener);

    const observer = new MutationObserver(updateInlineTrigger);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.removeEventListener("crumbella:open-mobile-nav", handleOpen as EventListener);
      observer.disconnect();
    };
  }, []);

  const isActive = (href: string) => {
    if (!pathname) return false;
    if (href === "/dashboard/business") return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <>
      {!hasInlineTrigger ? (
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setIsDrawerOpen(true)}
          className="md:hidden fixed left-4 top-4 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] text-[var(--crumbella-primary)] shadow-[0_14px_30px_-18px_rgba(30,18,10,0.8)]"
        >
          <Menu className="h-5 w-5" />
        </button>
      ) : null}

      {isDrawerOpen ? (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-[#1e120a]/35" onClick={() => setIsDrawerOpen(false)} />

          <aside className="animate-slide-in-left relative h-full w-[84%] max-w-[340px] overflow-y-auto rounded-r-[34px] border-r border-[var(--crumbella-border)] bg-[linear-gradient(180deg,rgba(242,234,225,0.98)_0%,rgba(253,250,247,0.96)_100%)] shadow-[12px_0_40px_-18px_rgba(30,18,10,0.46)]">
            <div className="border-b border-[var(--crumbella-border)] px-5 pb-4 pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-extrabold tracking-tight text-[var(--crumbella-primary)]">Crumbella</p>
                  <p className="mt-1 text-[11px] text-[var(--crumbella-muted)]">Internal dashboard</p>
                </div>
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setIsDrawerOpen(false)}
                  className="rounded-2xl border border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] p-2 text-[var(--crumbella-muted)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="px-5 py-4">
              <SidebarUserInfo jwtUserName={jwtUserName} jwtUserEmail={jwtUserEmail} />
            </div>

            <div className="space-y-1 px-4 pb-6">
              {(isBakeryManager || isStaff) && (
                <>
                  <SectionLabel label="Bakery" />
                  {isOwner ? (
                    <NavLink
                      href="/bakery/dashboard"
                      icon={BarChart3}
                      label="Dashboard"
                      active={isActive("/bakery/dashboard")}
                      onClick={() => setIsDrawerOpen(false)}
                    />
                  ) : null}
                  {isBakeryManager ? (
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
                      {isAdmin ? (
                        <NavLink
                          href="/bakery/omzet-harian"
                          icon={History}
                          label="Omzet Harian"
                          active={isActive("/bakery/omzet-harian")}
                          onClick={() => setIsDrawerOpen(false)}
                        />
                      ) : null}
                    </>
                  ) : null}
                  <NavLink
                    href="/bakery/production"
                    icon={Factory}
                    label="Production"
                    active={isActive("/bakery/production")}
                    onClick={() => setIsDrawerOpen(false)}
                  />
                  {isOwner ? (
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
                  ) : null}
                </>
              )}

              {isOwner ? (
                <>
                  <SectionLabel label="Dashboard" />
                  <NavLink
                    href="/analytics"
                    icon={BarChart3}
                    label="Analytics"
                    active={isActive("/analytics")}
                    onClick={() => setIsDrawerOpen(false)}
                  />
                  <SectionLabel label="AI Tools" />
                  <NavLink
                    href="/dashboard/ai-analysis"
                    icon={Bot}
                    label="AI Center"
                    active={isActive("/dashboard/ai-analysis")}
                    onClick={() => setIsDrawerOpen(false)}
                  />
                </>
              ) : null}

              {isBakeryManager ? (
                <>
                  <SectionLabel label="Inventory" />
                  <NavLink
                    href="/dashboard/products"
                    icon={Package}
                    label="Products"
                    active={isActive("/dashboard/products")}
                    onClick={() => setIsDrawerOpen(false)}
                  />
                  <NavLink
                    href="/dashboard/add-ons"
                    icon={Package}
                    label="Add on"
                    active={isActive("/dashboard/add-ons")}
                    onClick={() => setIsDrawerOpen(false)}
                  />
                </>
              ) : null}

              {isOwner ? (
                <>
                  <SectionLabel label="Settings" />
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
              ) : null}

              {!isOwner && !isBakeryManager && !isStaff ? (
                <>
                  <SectionLabel label="Kasir" />
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
                    label="Riwayat"
                    active={isActive("/dashboard/sales-history")}
                    onClick={() => setIsDrawerOpen(false)}
                  />
                </>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

function SectionLabel({ label }: { label: string }) {
  return <p className="px-2 pb-2 pt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--crumbella-muted)]">{label}</p>;
}

function NavLink({
  href,
  icon: Icon,
  label,
  active,
  onClick,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`group relative flex items-center gap-3 rounded-2xl px-3 py-3 text-sm transition ${
        active
          ? "border border-[var(--crumbella-border)] bg-[var(--crumbella-accent-soft)] font-semibold text-[var(--crumbella-primary)] shadow-[0_12px_24px_-22px_rgba(124,52,16,0.95)]"
          : "text-[var(--crumbella-muted)] hover:bg-white/80 hover:text-[var(--crumbella-primary)]"
      }`}
    >
      {active ? <span className="absolute left-1 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-[var(--crumbella-accent)]" /> : null}
      <Icon
        className={`h-4.5 w-4.5 shrink-0 ${
          active ? "text-[var(--crumbella-accent)]" : "text-[var(--crumbella-muted)] group-hover:text-[var(--crumbella-accent)]"
        }`}
      />
      {label}
    </Link>
  );
}
