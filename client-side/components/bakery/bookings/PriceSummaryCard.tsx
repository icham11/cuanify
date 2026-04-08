import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/components/orders/formatters";

interface PriceSummaryCardProps {
  basePrice: number;
  addOnTotal: number;
  deliveryFee: number;
  manualAdjustment?: number;
  totalPrice: number;
  categoryBreakdown?: Array<{
    label: string;
    amount: number;
    items?: Array<{
      label: string;
      quantity: number;
      baseAmount: number;
      addOnAmount: number;
      totalAmount: number;
      addOnDetails?: string[];
    }>;
  }>;
}

export default function PriceSummaryCard({
  basePrice,
  addOnTotal,
  deliveryFee,
  manualAdjustment = 0,
  totalPrice,
  categoryBreakdown,
}: PriceSummaryCardProps) {
  const hasCategoryBreakdown = (categoryBreakdown?.length ?? 0) > 0;

  return (
    <Card className="border-indigo-100 shadow-sm">
      <CardHeader className="p-6 pb-2">
        <CardTitle>Price Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-6 pb-6 pt-0">
        {hasCategoryBreakdown ? (
          <div className="space-y-2 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
              Breakdown per kategori
            </p>
            {categoryBreakdown?.map((entry) => (
              <div
                key={entry.label}
                className="rounded-md bg-white/80 px-2 py-2"
              >
                <div className="flex items-center justify-between text-sm text-indigo-900">
                  <span className="font-semibold">{entry.label}</span>
                  <span className="font-semibold">
                    {formatCurrency(entry.amount)}
                  </span>
                </div>
                {(entry.items?.length ?? 0) > 0 ? (
                  <div className="mt-1 space-y-1 border-t border-indigo-100 pt-1">
                    {entry.items?.map((item, index) => (
                      <div
                        key={`${entry.label}-${item.label}-${index}`}
                        className="rounded-sm bg-white px-2 py-1 text-xs text-gray-700"
                      >
                        <p className="font-medium text-gray-800">
                          {item.label} x{item.quantity}
                        </p>
                        <div className="mt-1 grid grid-cols-3 gap-2 text-[11px] text-gray-600">
                          <span>Base {formatCurrency(item.baseAmount)}</span>
                          <span>Add-on {formatCurrency(item.addOnAmount)}</span>
                          <span className="font-semibold text-gray-800">
                            Total {formatCurrency(item.totalAmount)}
                          </span>
                        </div>
                        {(item.addOnDetails?.length ?? 0) > 0 ? (
                          <p className="mt-1 text-[11px] text-gray-600">
                            Add-on detail: {item.addOnDetails?.join(", ")}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>Base Price</span>
          <span>{formatCurrency(basePrice)}</span>
        </div>
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>Add-ons</span>
          <span>{formatCurrency(addOnTotal)}</span>
        </div>
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>Ongkir</span>
          <span>{formatCurrency(deliveryFee)}</span>
        </div>
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>Adjustment</span>
          <span>{formatCurrency(manualAdjustment)}</span>
        </div>
        <div className="h-px bg-gray-100" />
        <div className="flex items-center justify-between rounded-lg bg-indigo-50 px-3 py-2 text-base font-semibold text-indigo-800">
          <span>Total Price</span>
          <span className="text-lg">{formatCurrency(totalPrice)}</span>
        </div>
        <p className="text-xs text-gray-500">
          Auto-updated from product base price, add-ons, ongkir, dan adjustment.
        </p>
      </CardContent>
    </Card>
  );
}
