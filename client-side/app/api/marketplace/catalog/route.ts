import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/session";
import { loadEffectiveBookingCatalog } from "@/lib/bookings/catalog-config-server";
import {
  flattenCatalogProductsForDashboard,
  syncBakeryCatalogToDashboardProducts,
} from "@/lib/bookings/product-sync";
import { normalizeProductNameKey } from "@/lib/products/uniqueness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAuth();
    const { productCatalog, addOnCatalog } = await loadEffectiveBookingCatalog(
      auth.businessId,
    );

    // Keep catalog-backed products available in Product so marketplace entries can
    // be recorded as sales without creating booking orders.
    if (auth.role === "Owner" || auth.role === "Admin") {
      try {
        await syncBakeryCatalogToDashboardProducts({
          businessId: auth.businessId,
          productCatalog,
          deduplicateExistingProducts: false,
          updateExistingProducts: false,
          reactivateDeletedProducts: false,
        });
      } catch (syncError) {
        console.warn("[marketplace/catalog] product sync skipped", {
          businessId: auth.businessId,
          message:
            syncError instanceof Error ? syncError.message : String(syncError),
        });
      }
    }

    const products = await prisma.product.findMany({
      where: {
        businessId: auth.businessId,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        cogs: true,
        minimumOrder: true,
      },
    });

    const productIdByName = new Map(
      products.map((product) => [
        normalizeProductNameKey(product.name),
        {
          id: product.id,
          cogs: Number(product.cogs ?? 0),
          minimumOrder: Number(product.minimumOrder ?? 0),
        },
      ]),
    );

    const variants = flattenCatalogProductsForDashboard(productCatalog).map(
      (variant) => {
        const mapped =
          productIdByName.get(normalizeProductNameKey(variant.name)) ?? null;
        return {
          category: variant.category,
          subcategory: variant.subcategory,
          productName: variant.productName,
          size: variant.variantLabel,
          displayName: variant.name,
          price: variant.sellingPrice,
          cogs: mapped?.cogs ?? 0,
          minimumOrder: mapped?.minimumOrder ?? 0,
          productId: mapped?.id ?? null,
        };
      },
    );

    return NextResponse.json({
      success: true,
      data: {
        productCatalog,
        addOnCatalog,
        variants,
      },
    });
  } catch (error) {
    console.error("GET /api/marketplace/catalog error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load marketplace catalog",
      },
      { status: 500 },
    );
  }
}
