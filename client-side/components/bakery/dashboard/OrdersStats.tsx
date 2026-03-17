import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { bakerySummaryCards } from "@/components/bakery/mockData";
import { BarChart3, CheckCircle2, Factory, PackageCheck, Wallet } from "lucide-react";

const icons = [BarChart3, CheckCircle2, Factory, PackageCheck, Wallet];

export default function OrdersStats() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {bakerySummaryCards.map((card, index) => {
        const Icon = icons[index] ?? BarChart3;
        return (
          <Card key={card.title} className="rounded-xl shadow-sm">
            <CardHeader className="p-6 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-500">
                  {card.title}
                </CardTitle>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                  <Icon size={18} />
                </span>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-6 pt-0">
              <div className="text-3xl font-semibold text-gray-900">
                {card.value}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
