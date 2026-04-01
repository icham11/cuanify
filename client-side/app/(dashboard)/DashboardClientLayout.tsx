"use client";

import { useEffect, useState } from "react";
import { DateRangeProvider } from "@/context/DateRangeContext";
import { ShiftProvider } from "@/context/ShiftContext";

export default function DashboardClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setMounted(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-white px-4 py-6">
        <div className="mx-auto h-10 w-48 animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }

  return (
    <DateRangeProvider>
      <ShiftProvider>{children}</ShiftProvider>
    </DateRangeProvider>
  );
}
