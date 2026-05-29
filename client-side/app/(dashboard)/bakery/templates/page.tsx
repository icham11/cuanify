import { Metadata } from "next";
import { OrderTemplateManager } from "@/components/bakery/templates/OrderTemplateManager";

export const metadata: Metadata = {
  title: "Order Templates - Cuanify",
  description: "Kelola template dinamis untuk parsing WhatsApp pesanan",
};

export default function OrderTemplatesPage() {
  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Order Templates</h2>
      </div>
      <OrderTemplateManager />
    </div>
  );
}
