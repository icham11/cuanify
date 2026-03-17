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
        <CardContent className="px-6 pb-6 pt-0 text-sm text-gray-600">
          Sort by delivery date to prioritize urgent cakes and update statuses as production progresses.
        </CardContent>
      </Card>
    </div>
  );
}
