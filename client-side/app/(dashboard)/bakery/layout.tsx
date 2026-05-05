"use client";

import { usePathname } from "next/navigation";
import { OrdersProvider } from "@/components/bakery/store";

function shouldEnableOrdersProvider(pathname: string | null) {
  if (!pathname) return false;

  return (
    pathname.startsWith("/bakery/bookings") ||
    pathname.startsWith("/bakery/calendar") ||
    pathname.startsWith("/bakery/customers") ||
    pathname.startsWith("/bakery/dashboard") ||
    pathname.startsWith("/bakery/production") ||
    pathname.startsWith("/bakery/reports")
  );
}

export default function BakeryLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <OrdersProvider enabled={shouldEnableOrdersProvider(pathname)}>
      {children}
    </OrdersProvider>
  );
}
