"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import GradientPageHeader from "@/components/bakery/shared/GradientPageHeader";
import ProductionTable from "@/components/bakery/production/ProductionTable";
import { Factory } from "lucide-react";

export default function ProductionPage() {
  return (
    <div className="space-y-6 bg-linear-to-b from-slate-50/70 to-white pb-10">
      <GradientPageHeader
        title="Production"
        description="Rangkuman booking produksi, assignment staff, dan progres token per bulan."
        icon={Factory}
      />

      <Card className="rounded-2xl border-slate-200/80 shadow-sm">
        <CardHeader className="p-6 pb-2">
          <CardTitle className="text-xl">Production Booking List</CardTitle>
          <p className="text-sm text-slate-500">
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
