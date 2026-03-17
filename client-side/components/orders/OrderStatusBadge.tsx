import { Badge } from "@/components/ui/badge";

const statusStyles: Record<string, string> = {
  Pending: "border-amber-200 bg-amber-50 text-amber-700",
  Confirmed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  "In Production": "border-blue-200 bg-blue-50 text-blue-700",
  Ready: "border-sky-200 bg-sky-50 text-sky-700",
  Delivered: "border-gray-200 bg-gray-100 text-gray-700",
};

export function OrderStatusBadge({ status }: { status: string }) {
  return (
    <Badge className={statusStyles[status] ?? "border-gray-200 bg-gray-50 text-gray-600"}>
      {status}
    </Badge>
  );
}
