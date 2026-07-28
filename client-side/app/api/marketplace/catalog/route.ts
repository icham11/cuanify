import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/session";
import { loadEffectiveBookingCatalog } from "@/lib/bookings/catalog-config-server";
import {
  flattenCatalogProductsForDashboard,
  syncBakeryCatalogToDashboardProducts,
} from "@/lib/bookings/product-sync";
import { normalizeProductNameKey } from "@/lib/products/uniqueness";
import {
  resolveMainProductCategory,
  shouldIgnoreProductCategory,
} from "@/lib/products/main-category";

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
        sellingPrice: true,
        cogs: true,
        minimumOrder: true,
        category: {
          select: {
            name: true,
          },
        },
      },
    });

    const productIdByName = new Map(
      products.map((product) => [
        normalizeProductNameKey(product.name),
        {
          id: product.id,
          name: product.name,
          sellingPrice: Number(product.sellingPrice ?? 0),
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
          displayName: mapped?.name ?? variant.name,
          price: mapped?.sellingPrice ?? variant.sellingPrice,
          cogs: mapped?.cogs ?? 0,
          minimumOrder: mapped?.minimumOrder ?? 0,
          productId: mapped?.id ?? null,
        };
      },
    );

    // Ensure every category shown on /dashboard/products also appears here.
    // Add active Products not already covered by the booking catalog, grouped by
    // the same main-category resolver so the marketplace selection matches the
    // products page. Each entry keeps its real productId so it stays sellable.
    const coveredProductIds = new Set(
      variants
        .map((variant) => variant.productId)
        .filter((id): id is number => id !== null),
    );
    const coveredNameKeys = new Set(
      variants.map((variant) => normalizeProductNameKey(variant.displayName)),
    );

    products.forEach((product) => {
      if (coveredProductIds.has(product.id)) return;

      const subcategoryName = product.category?.name?.trim() ?? "";
      if (!subcategoryName || shouldIgnoreProductCategory(subcategoryName)) {
        return;
      }

      const mainCategory = resolveMainProductCategory(subcategoryName);
      if (!mainCategory) return;

      const nameKey = normalizeProductNameKey(product.name);
      if (coveredNameKeys.has(nameKey)) return;
      coveredNameKeys.add(nameKey);

      variants.push({
        category: mainCategory,
        subcategory: subcategoryName,
        productName: product.name,
        size: "Reguler",
        displayName: product.name,
        price: Number(product.sellingPrice ?? 0),
        cogs: Number(product.cogs ?? 0),
        minimumOrder: Number(product.minimumOrder ?? 0),
        productId: product.id,
      });
    });

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
