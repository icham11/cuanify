"use client";

import { OrdersProvider } from "@/components/bakery/store";

export default function BakeryLayout({ children }: { children: React.ReactNode }) {
  return <OrdersProvider>{children}</OrdersProvider>;
}
