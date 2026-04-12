"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import GradientPageHeader from "@/components/bakery/shared/GradientPageHeader";
import ProductionTable from "@/components/bakery/production/ProductionTable";
import { Factory } from "lucide-react";

export default function ProductionPage() {
  return (
    <div className="relative space-y-6 pb-10">
      <div className="pointer-events-none absolute -left-4 top-20 h-24 w-24 rounded-full bg-[#f26a21]/12 blur-xl" />
      <div className="pointer-events-none absolute right-4 top-24 h-24 w-24 rounded-full bg-[#25b4c8]/12 blur-xl" />

      <GradientPageHeader
        title="Production"
        description="Rangkuman booking produksi, assignment staff, dan progres token per bulan."
        icon={Factory}
      />

      <Card className="relative overflow-hidden rounded-3xl bg-[linear-gradient(155deg,rgba(255,255,255,0.95)_0%,rgba(255,249,239,0.92)_60%,rgba(232,247,255,0.92)_100%)] ring-[#ffd8b7]">
        <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-[#f9bd1f]/16 blur-xl" />
        <CardHeader className="p-6 pb-2">
          <CardTitle className="text-xl text-[#243b5a]">Production Booking List</CardTitle>
          <p className="text-sm text-[#6b7280]">
            Monitor beban produksi, atur assignment staff, dan update status order dalam satu dashboard.
          </p>
        </CardHeader>
        <CardContent className="px-6 pb-6 pt-0">
          <ProductionTable />
        </CardContent>
      </Card>

    </div>
  );
}
