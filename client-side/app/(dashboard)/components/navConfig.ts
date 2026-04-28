import type { ComponentType } from "react";
import {
  BarChart3,
  Bot,
  CalendarDays,
  ShoppingCart,
  History,
  Package,
  Building2,
  User,
  FileDown,
  Users,
  ClipboardList,
  Clock,
  Factory,
  FileText,
  Settings2,
  ContactRound,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  accent?: boolean;
  badge?: string;
  ownerOnly?: boolean;
}

export interface NavSection {
  title: string;
  ownerOnly?: boolean;
  items: NavItem[];
}

export const navSections: NavSection[] = [
  {
    title: "Dashboard",
    ownerOnly: true,
    items: [
      {
        label: "Analytics",
        href: "/analytics",
        icon: BarChart3,
      },
    ],
  },
  {
    title: "Bakery",
    items: [
      {
        label: "Dashboard",
        href: "/bakery/dashboard",
        icon: BarChart3,
      },
      {
        label: "Bookings",
        href: "/bakery/bookings",
        icon: ClipboardList,
      },
      {
        label: "Calendar",
        href: "/bakery/calendar",
        icon: CalendarDays,
      },
      {
        label: "Production",
        href: "/bakery/production",
        icon: Factory,
      },
      {
        label: "Reports",
        href: "/bakery/reports",
        icon: FileText,
      },
      {
        label: "Catalog",
        href: "/bakery/catalog",
        icon: Settings2,
      },
      {
        label: "Customers",
        href: "/bakery/customers",
        icon: ContactRound,
      },
    ],
  },
  {
    title: "AI Tools",
    ownerOnly: true,
    items: [
      {
        label: "AI Center",
        href: "/dashboard/ai-analysis",
        icon: Bot,
        accent: true,
      },
    ],
  },
  {
    title: "Sales",
    items: [
      {
        label: "POS",
        href: "/pos",
        icon: ShoppingCart,
      },
      {
        label: "Sales History",
        href: "/dashboard/sales-history",
        icon: History,
      },
      {
        label: "Kasbon",
        href: "/dashboard/debts",
        icon: ClipboardList,
      },
      {
        label: "Closing",
        href: "/dashboard/shift-history",
        icon: Clock,
      },
      {
        label: "Export Data",
        href: "/dashboard/export",
        icon: FileDown,
        ownerOnly: true,
      },
    ],
  },
  {
    title: "Inventory",
    items: [
      {
        label: "Products",
        href: "/dashboard/products",
        icon: Package,
      },
      {
        label: "Add on",
        href: "/dashboard/add-ons",
        icon: Package,
      },
    ],
  },
  {
    title: "Settings",
    ownerOnly: true,
    items: [
      {
        label: "Business",
        href: "/dashboard/business",
        icon: Building2,
      },
      {
        label: "Profile",
        href: "/dashboard/profile",
        icon: User,
      },
      {
        label: "Staff",
        href: "/dashboard/staff",
        icon: Users,
      },
    ],
  },
];
