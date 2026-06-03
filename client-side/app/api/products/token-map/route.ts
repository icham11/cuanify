import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import { loadEffectiveBookingCatalog } from "@/lib/bookings/catalog-config-server";
import { flattenCatalogProductsForDashboard } from "@/lib/bookings/product-sync";
import {
  getCachedProductTokenMap,
  setCachedProductTokenMap,
  type ProductTokenMapEntry,
} from "@/lib/products/product-token-map-cache";
import {
  isPrismaConnectionTimeout,
  prismaConnectionErrorResponse,
  withPrismaRetry,
} from "@/lib/prisma-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export async function GET() {
  try {
    const { businessId } = await requireAuth();
    const cached = getCachedProductTokenMap(businessId);
    if (cached) {
      return NextResponse.json({ success: true, data: cached });
    }

    const products = await withPrismaRetry(() =>
      prisma.product.findMany({
        where: {
          businessId,
          deletedAt: null,
        },
        select: {
          name: true,
          productionToken: true,
          weightGram: true,
          minimumOrder: true,
        },
        orderBy: {
          name: "asc",
        },
      }),
    );

    const needsFallbackTokenCatalog = products.some(
      (product) => Math.max(0, Number(product.productionToken || 0)) === 0,
    );

    const fallbackTokenMap = new Map<string, number>();
    if (needsFallbackTokenCatalog) {
      const effectiveCatalog = await loadEffectiveBookingCatalog(businessId);
      flattenCatalogProductsForDashboard(effectiveCatalog.productCatalog).forEach(
        (item) => {
          fallbackTokenMap.set(
            normalizeKey(item.name),
            Math.max(0, Number(item.productionToken || 0)),
          );
        },
      );
    }

    const data: ProductTokenMapEntry[] = products.map((product) => {
      const current = Math.max(0, Number(product.productionToken || 0)); // Parsing token produksi aktif dari DB
      const fallback = fallbackTokenMap.get(normalizeKey(product.name)) ?? 0; // Dapatkan fallback token jika token DB bernilai 0
      return { // Kembalikan objek data produk terformat
        name: product.name, // Nama produk dashboard
        productionToken: current > 0 ? current : fallback, // Gunakan token aktif DB atau fallback katalog
        weightGram: Math.max(0, Number(product.weightGram || 0)), // Berat produk aktif dari DB (gram)
        minimumOrder: Math.max(0, Number(product.minimumOrder || 0)), // Sertakan batas minimal order dari DB
      }; // Akhir pengembalian objek
    }); // Akhir pemetaan map data

    setCachedProductTokenMap(businessId, data);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (isPrismaConnectionTimeout(error)) {
      return prismaConnectionErrorResponse(
        "Koneksi database sedang sibuk atau offline (Serverless Timeout).",
      );
    }
    console.error("GET /api/products/token-map error:", error);
    return NextResponse.json(
      { error: "Failed to load product token map" },
      { status: 500 },
    );
  }
}

