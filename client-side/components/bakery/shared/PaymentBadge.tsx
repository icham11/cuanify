import { Badge } from "@/components/ui/badge";

const statusStyles: Record<string, string> = {
  "DP Paid": "border-amber-200 bg-amber-50 text-amber-700",
  Paid: "border-indigo-200 bg-indigo-50 text-indigo-700",
};

export default function PaymentBadge({ status }: { status: string }) {
  const normalizedStatus = status === "Pending" ? "DP Paid" : status;

  return (
    <Badge
      className={
        statusStyles[normalizedStatus] ??
        "border-gray-200 bg-gray-50 text-gray-600"
      }
    >
      {normalizedStatus || "Unknown"}
    </Badge>
  );
}
