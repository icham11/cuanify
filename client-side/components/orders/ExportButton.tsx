import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ExportButton({ onClick }: { onClick?: () => void }) {
  return (
    <Button variant="outline" onClick={onClick} className="gap-2">
      <Download size={16} />
      Export to Excel
    </Button>
  );
}
