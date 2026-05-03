import { Badge } from "@/components/ui/badge";

const statusStyles: Record<string, string> = {
  "DP Paid": "border-[#d8b870] bg-[#fbf0d8] text-[#9a6b10]",
  Paid: "border-[var(--crumbella-border)] bg-[var(--crumbella-accent-soft)] text-[var(--crumbella-primary)]",
};

export default function PaymentBadge({ status }: { status: string }) {
  const normalizedStatus = status === "Pending" ? "DP Paid" : status;

  return (
    <Badge
      className={
        statusStyles[normalizedStatus] ??
        "border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] text-[var(--crumbella-muted)]"
      }
    >
      {normalizedStatus || "Unknown"}
    </Badge>
  );
}
