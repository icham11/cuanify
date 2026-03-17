import { Badge } from "@/components/ui/badge";

export default function PriorityBadge({ label, tone }: { label: string; tone: "danger" | "warning" | "neutral" }) {
  const styles =
    tone === "danger"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-gray-200 bg-gray-50 text-gray-600";

  return <Badge className={styles}>{label}</Badge>;
}
