import { Badge } from "@/components/ui/badge";
import { normalizeOrderStatus } from "@/lib/bookings/order-status";

const statusStyles: Record<string, string> = {
  Inquiry: "border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] text-[var(--crumbella-muted)]",
  Quoted: "border-[#d8b870] bg-[#fbf0d8] text-[#9a6b10]",
  "DP Paid": "border-[#d8b870] bg-[#fbf0d8] text-[#9a6b10]",
  "In Production": "border-[var(--crumbella-border)] bg-[var(--crumbella-accent-soft)] text-[var(--crumbella-primary)]",
  Ready: "border-[#e0f0e8] bg-[#e0f0e8] text-[#2a5c3f]",
  Delivery: "border-[#e0f0e8] bg-[#e0f0e8] text-[#2a5c3f]",
  Delivered: "border-[#e0f0e8] bg-[#e0f0e8] text-[#2a5c3f]",
  Completed: "border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] text-[var(--crumbella-primary)]",
  Cancelled: "border-[#e8a0a0] bg-[#fdeaea] text-[#a83030]",
};

export default function StatusBadge({ status }: { status: string }) {
  const normalizedStatus = normalizeOrderStatus(status);

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
