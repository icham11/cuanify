import { Badge } from "@/components/ui/badge";

const statusStyles: Record<string, string> = {
  "DP Paid": "border-amber-200 bg-amber-50 text-amber-700",
  Paid: "border-indigo-200 bg-indigo-50 text-indigo-700",
  Pending: "border-gray-200 bg-gray-100 text-gray-700",
};

export default function PaymentBadge({ status }: { status: string }) {
  return (
    <Badge className={statusStyles[status] ?? "border-gray-200 bg-gray-50 text-gray-600"}>
      {status || "Unknown"}
    </Badge>
  );
}
