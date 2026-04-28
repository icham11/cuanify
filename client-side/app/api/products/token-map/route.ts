import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import { loadEffectiveBookingCatalog } from "@/lib/bookings/catalog-config-server";
import { flattenCatalogProductsForDashboard } from "@/lib/bookings/product-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export async function GET() {
  try {
    const { businessId } = await requireAuth();
    const [products, effectiveCatalog] = await Promise.all([
      prisma.product.findMany({
        where: {
          businessId,
          deletedAt: null,
        },
        select: {
          name: true,
          productionToken: true,
        },
        orderBy: {
          name: "asc",
        },
      }),
      loadEffectiveBookingCatalog(businessId),
    ]);

    const fallbackTokenMap = new Map<string, number>();
    flattenCatalogProductsForDashboard(effectiveCatalog.productCatalog).forEach(
      (item) => {
        fallbackTokenMap.set(normalizeKey(item.name), Math.max(0, Number(item.productionToken || 0)));
      },
    );

    const data = products.map((product) => {
      const current = Math.max(0, Number(product.productionToken || 0));
      if (current > 0) {
        return { name: product.name, productionToken: current };
      }
      const fallback = fallbackTokenMap.get(normalizeKey(product.name)) ?? 0;
      return { name: product.name, productionToken: fallback };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/products/token-map error:", error);
    return NextResponse.json(
      { error: "Failed to load product token map" },
      { status: 500 },
    );
  }
}

