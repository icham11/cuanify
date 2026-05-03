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
      ? "border-[#e8a0a0] bg-[#fdeaea] text-[#a83030]"
      : tone === "warning"
        ? "border-[#d8b870] bg-[#fbf0d8] text-[#9a6b10]"
        : "border-[var(--crumbella-border)] bg-[var(--crumbella-accent-soft)] text-[var(--crumbella-primary)]";

  return <Badge className={styles}>{label}</Badge>;
}
