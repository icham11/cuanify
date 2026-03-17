"use client";

import { DateRangeProvider } from "@/context/DateRangeContext";
import { ShiftProvider } from "@/context/ShiftContext";

export default function DashboardClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DateRangeProvider>
      <ShiftProvider>{children}</ShiftProvider>
    </DateRangeProvider>
  );
}