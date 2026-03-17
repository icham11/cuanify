import type { ComponentType } from "react";
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
        icon: BookOpen,
      },
      {
        label: "Production",
        href: "/bakery/production",
        icon: Factory,
      },
      {
        label: "Reports",
        href: "/bakery/reports",
        icon: FileDown,
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
        icon: BookOpen,
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
    ownerOnly: true,
    items: [
      {
        label: "Products",
        href: "/dashboard/products",
        icon: Package,
      },
      {
        label: "Production",
        href: "/dashboard/production",
        icon: Factory,
      },
      {
        label: "Ingredients",
        href: "/dashboard/ingredients",
        icon: Boxes,
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
