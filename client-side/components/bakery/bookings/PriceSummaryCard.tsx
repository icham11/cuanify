import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/components/orders/formatters";

interface PriceSummaryCardProps {
  basePrice: number;
  addOnTotal: number;
  deliveryFee: number;
  totalPrice: number;
}

export default function PriceSummaryCard({
  basePrice,
  addOnTotal,
  deliveryFee,
  totalPrice,
}: PriceSummaryCardProps) {
  return (
    <Card className="border-indigo-100 shadow-sm">
      <CardHeader className="p-6 pb-2">
        <CardTitle>Price Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-6 pb-6 pt-0">
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>Base Price</span>
          <span>{formatCurrency(basePrice)}</span>
        </div>
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>Add-ons</span>
          <span>{formatCurrency(addOnTotal)}</span>
        </div>
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>Delivery Fee</span>
          <span>{formatCurrency(deliveryFee)}</span>
        </div>
        <div className="h-px bg-gray-100" />
        <div className="flex items-center justify-between rounded-lg bg-indigo-50 px-3 py-2 text-base font-semibold text-indigo-800">
          <span>Total Price</span>
          <span className="text-lg">{formatCurrency(totalPrice)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
