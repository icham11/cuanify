import { Badge } from "@/components/ui/badge";

const statusStyles: Record<string, string> = {
  DP: "border-amber-200 bg-amber-50 text-amber-700",
  Paid: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Pending: "border-gray-200 bg-gray-50 text-gray-600",
};

export function PaymentStatusBadge({ status }: { status: string }) {
  return (
    <Badge className={statusStyles[status] ?? "border-gray-200 bg-gray-50 text-gray-600"}>
      {status}
    </Badge>
  );
}
