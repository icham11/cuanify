import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import GradientPageHeader from "@/components/bakery/shared/GradientPageHeader";
import ProductionTable from "@/components/bakery/production/ProductionTable";
import { Factory } from "lucide-react";

export default function ProductionPage() {
  return (
    <div className="space-y-6 pb-10">
      <GradientPageHeader
        title="Production"
        description="Track cakes in progress and prepare them for delivery."
        icon={Factory}
      />

      <Card className="rounded-xl shadow-sm">
        <CardHeader className="p-6 pb-2">
          <CardTitle>Production Queue</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6 pt-0">
          <ProductionTable />
        </CardContent>
      </Card>

      <Card className="rounded-xl shadow-sm">
        <CardHeader className="p-6 pb-2">
          <CardTitle>Operational Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-6 pb-6 pt-0 text-sm text-gray-600">
          <p>
            Orders are sorted by delivery date to prioritize urgent jobs first.
          </p>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-rose-700">Delivery Today</span>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-700">Delivery Tomorrow</span>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-gray-600">Normal</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
