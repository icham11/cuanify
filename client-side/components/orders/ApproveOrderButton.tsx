import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ApproveOrderButtonProps {
  approved: boolean;
  onApprove: () => void;
}

export function ApproveOrderButton({ approved, onApprove }: ApproveOrderButtonProps) {
  return (
    <Button
      onClick={onApprove}
      disabled={approved}
      className="gap-2"
      variant={approved ? "secondary" : "default"}
    >
      <CheckCircle2 size={16} />
      {approved ? "Approved" : "Approve Order"}
    </Button>
  );
}
