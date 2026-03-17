"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bot,
  ShoppingCart,
  History,
  Boxes,
  Package,
  Building2,
  User,
  FileDown,
  Users,
  BookOpen,
  Clock,
  Factory,
} from "lucide-react";
import { useRole } from "@/context/RoleContext";

export default function SidebarNav() {
  const { isOwner, isCashier, userName, loading } = useRole();
  const pathname = usePathname();

  const isActive = (href: string) => pathname === href || (href !== "/dashboard" && pathname?.startsWith(href + "/"));

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-8 bg-indigo-100/50 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <nav className="space-y-6">
      {/* Kasir Mode Banner */}
      {isCashier && (
        <div className="p-3 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl">
          <div className="flex items-center gap-2 mb-1">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
            </span>
            <span className="text-xs font-bold text-amber-800">MODE KASIR</span>
          </div>
          {userName && <p className="text-[11px] text-amber-700 font-medium truncate pl-4.5">👤 {userName}</p>}
        </div>
      )}

      {/* Dashboard — Owner only */}
      {isOwner && (
        <div>
          <p className="text-[10px] font-bold text-indigo-400/70 uppercase tracking-wider px-3 mb-1.5">Dashboard</p>
          {/*<SidebarLink href="/dashboard" icon={BarChart3} label="Overview" active={isActive("/dashboard") && pathname === "/dashboard"} />*/}
          <SidebarLink href="/analytics" icon={BarChart3} label="Analytics" active={isActive("/analytics")} />
        </div>
      )}

      {/* AI Tools — Owner only */}
      {isOwner && (
        <div>
          <p className="text-[10px] font-bold text-indigo-400/70 uppercase tracking-wider px-3 mb-1.5">AI Tools</p>
          <SidebarLink
            href="/dashboard/ai-analysis"
            icon={Bot}
            label="AI Center"
            active={isActive("/dashboard/ai-analysis")}
            accent
          />
        </div>
      )}

      {/* Sales — All roles */}
      <div>
        <p className="text-[10px] font-bold text-indigo-400/70 uppercase tracking-wider px-3 mb-1.5">Sales</p>
        <SidebarLink href="/pos" icon={ShoppingCart} label="POS" active={isActive("/pos")} />
        <SidebarLink
          href="/dashboard/sales-history"
          icon={History}
          label="Sales History"
          active={isActive("/dashboard/sales-history")}
        />
        <SidebarLink href="/dashboard/debts" icon={BookOpen} label="Kasbon" active={isActive("/dashboard/debts")} />
        <SidebarLink
          href="/dashboard/shift-history"
          icon={Clock}
          label="Closing"
          active={isActive("/dashboard/shift-history")}
        />
        {isOwner && (
          <SidebarLink
            href="/dashboard/export"
            icon={FileDown}
            label="Export Data"
            active={isActive("/dashboard/export")}
          />
        )}
      </div>

      {/* Inventory — Owner only */}
      {isOwner && (
        <div>
          <p className="text-[10px] font-bold text-indigo-400/70 uppercase tracking-wider px-3 mb-1.5">Inventory</p>
          <SidebarLink
            href="/bakery/dashboard"
            icon={Factory}
            label="Bakery"
            active={isActive("/bakery/dashboard")}
          />
          <SidebarLink
            href="/bakery/bookings"
            icon={BookOpen}
            label="Orders"
            active={isActive("/bakery/bookings")}
          />
          <SidebarLink
            href="/dashboard/products"
            icon={Package}
            label="Products"
            active={isActive("/dashboard/products")}
          />
          <SidebarLink
            href="/dashboard/production"
            icon={Factory}
            label="Production"
            active={isActive("/dashboard/production")}
          />
          <SidebarLink
            href="/dashboard/ingredients"
            icon={Boxes}
            label="Ingredients"
            active={isActive("/dashboard/ingredients")}
          />
        </div>
      )}

      {/* Settings — Owner only */}
      {isOwner && (
        <div>
          <p className="text-[10px] font-bold text-indigo-400/70 uppercase tracking-wider px-3 mb-1.5">Settings</p>
          <SidebarLink
            href="/dashboard/business"
            icon={Building2}
            label="Business"
            active={isActive("/dashboard/business")}
          />
          <SidebarLink href="/dashboard/profile" icon={User} label="Profile" active={isActive("/dashboard/profile")} />
          <SidebarLink href="/dashboard/staff" icon={Users} label="Staff" active={isActive("/dashboard/staff")} />
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
      className={`flex items-center gap-2.5 py-2 px-3 rounded-lg text-[13px] font-medium transition-all ${
        active
          ? "bg-indigo-600 text-white shadow-md shadow-indigo-200/50"
          : accent
            ? "bg-gradient-to-r from-purple-50 to-indigo-50 text-purple-700 hover:from-purple-100 hover:to-indigo-100 border border-purple-200/60"
            : "text-gray-600 hover:bg-indigo-50/60 hover:text-indigo-700"
      }`}
    >
      <Icon className={`w-4 h-4 shrink-0 ${active ? "text-white" : ""}`} />
      <span className="truncate">{label}</span>
      {badge && (
        <span className="ml-auto text-[9px] bg-indigo-200 text-indigo-800 px-1.5 py-0.5 rounded-full font-bold">
          {badge}
        </span>
      )}
    </Link>
  );
}
