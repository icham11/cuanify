"use client";

import GradientPageHeader from "@/components/bakery/shared/GradientPageHeader";
import ProductionTable from "@/components/bakery/production/ProductionTable";
import { useRole } from "@/context/RoleContext";
import { Factory } from "lucide-react";

export default function ProductionPage() {
  const { isStaff } = useRole();

  return (
    <div className="space-y-4 pb-10">
      <GradientPageHeader
        title={isStaff ? "Assign" : "Produksi"}
        description={
          isStaff
            ? "Pilih proses yang akan di-assign ke akun staff ini"
            : "Queue aktif dan assignment staff"
        }
        icon={Factory}
      />
      <ProductionTable />
    </div>
  );
}
