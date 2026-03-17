import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/components/orders/formatters";

interface PriceSummaryCardProps {
  basePrice: number;
  addOnTotal: number;
  deliveryFee: number;
  totalPrice: number;
}

export function PriceSummaryCard({
  basePrice,
  addOnTotal,
  deliveryFee,
  totalPrice,
}: PriceSummaryCardProps) {
  return (
    <Card className="border-emerald-100 shadow-md">
      <CardHeader>
        <CardTitle>Price Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
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
        <div className="flex items-center justify-between text-base font-semibold text-emerald-700">
          <span>Total Price</span>
          <span>{formatCurrency(totalPrice)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
