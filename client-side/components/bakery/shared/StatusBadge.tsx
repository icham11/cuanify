import { Badge } from "@/components/ui/badge";

const statusStyles: Record<string, string> = {
  Pending: "border-gray-200 bg-gray-100 text-gray-700",
  Confirmed: "border-blue-200 bg-blue-50 text-blue-700",
  "In Production": "border-indigo-200 bg-indigo-50 text-indigo-700",
  Ready: "border-purple-200 bg-purple-50 text-purple-700",
  Delivered: "border-emerald-200 bg-emerald-100 text-emerald-700",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <Badge className={statusStyles[status] ?? "border-gray-200 bg-gray-50 text-gray-600"}>
      {status}
    </Badge>
  );
}
