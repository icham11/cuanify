"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import MarketplaceOrderPage from "@/components/bakery/marketplace/MarketplaceOrderPage";
import { useRole } from "@/context/RoleContext";

export default function BakeryEcommercePage() {
  const router = useRouter();
  const { isOwner, isAdmin, loading } = useRole();
  const canAccessEcommerce = isOwner || isAdmin;

  useEffect(() => {
    if (loading || canAccessEcommerce) return;
    router.replace("/bakery/production");
  }, [canAccessEcommerce, loading, router]);

  if (loading || !canAccessEcommerce) {
    return null;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-10">
      <section className="space-y-3 rounded-[28px] border border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] p-4 shadow-[0_16px_30px_-24px_rgba(30,18,10,0.45)]">
        <MarketplaceOrderPage />
      </section>
    </div>
  );
}
