import { Badge } from "@/components/ui/badge";

const statusStyles: Record<string, string> = {
  Inquiry: "border-slate-200 bg-slate-100 text-slate-700",
  Quoted: "border-blue-200 bg-blue-50 text-blue-700",
  "DP Paid": "border-cyan-200 bg-cyan-50 text-cyan-700",
  Confirmed: "border-sky-200 bg-sky-50 text-sky-700",
  "In Production": "border-indigo-200 bg-indigo-50 text-indigo-700",
  Ready: "border-blue-200 bg-blue-50 text-blue-700",
  Delivered: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Completed: "border-indigo-200 bg-indigo-100 text-indigo-800",
  Cancelled: "border-rose-200 bg-rose-50 text-rose-700",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <Badge className={statusStyles[status] ?? "border-gray-200 bg-gray-50 text-gray-600"}>
      {status || "Unknown"}
    </Badge>
  );
}
