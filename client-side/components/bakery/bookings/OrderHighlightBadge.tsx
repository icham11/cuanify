import { Badge } from "@/components/ui/badge";

export default function OrderHighlightBadge({
  label,
  tone,
}: {
  label: string;
  tone: "warning" | "danger" | "info";
}) {
  const styles =
    tone === "danger"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-sky-200 bg-sky-50 text-sky-700";

  return <Badge className={styles}>{label}</Badge>;
}
