import prisma from "@/lib/prisma";
import { BOOKING_PRODUCT_CATALOG } from "@/lib/bookings/pricelist";
import {
  flattenCatalogProductsForDashboard,
  syncBakeryCatalogToDashboardProducts,
} from "@/lib/bookings/product-sync";
import { normalizeProductNameKey } from "@/lib/products/uniqueness";

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

// Default 0 = ensure all hardcoded catalog products exist for every owner.
const OWNER_AUTO_BOOTSTRAP_MIN_PRODUCTS = parsePositiveInteger(
  process.env.OWNER_AUTO_BOOTSTRAP_MIN_PRODUCTS,
  0,
);

export type OwnerProductBootstrapResult = {
  skipped: boolean;
  existingProducts: number;
  reason?: "existing-products-threshold";
  syncResult?: Awaited<ReturnType<typeof syncBakeryCatalogToDashboardProducts>>;
};

async function getMissingHardcodedCatalogProductCount(
  businessId: number,
): Promise<number> {
  const hardcodedProducts = flattenCatalogProductsForDashboard(
    BOOKING_PRODUCT_CATALOG,
  );
  const existingProducts = await prisma.product.findMany({
    where: {
      businessId,
      deletedAt: null,
    },
    select: {
      name: true,
    },
  });

  const existingNames = new Set(
    existingProducts.map((product) => normalizeProductNameKey(product.name)),
  );

  return hardcodedProducts.filter(
    (product) => !existingNames.has(normalizeProductNameKey(product.name)),
  ).length;
}

export async function ensureOwnerDefaultProducts(args: {
  businessId: number;
  force?: boolean;
}): Promise<OwnerProductBootstrapResult> {
  const existingProducts = await prisma.product.count({
    where: {
      businessId: args.businessId,
      deletedAt: null,
    },
  });

  if (
    !args.force &&
    OWNER_AUTO_BOOTSTRAP_MIN_PRODUCTS > 0 &&
    existingProducts >= OWNER_AUTO_BOOTSTRAP_MIN_PRODUCTS
  ) {
    return {
      skipped: true,
      existingProducts,
      reason: "existing-products-threshold",
    };
  }

  const missingCatalogProducts = await getMissingHardcodedCatalogProductCount(
    args.businessId,
  );

  if (!args.force && missingCatalogProducts === 0) {
    return {
      skipped: true,
      existingProducts,
      reason: "existing-products-threshold",
    };
  }

  const syncResult = await syncBakeryCatalogToDashboardProducts({
    businessId: args.businessId,
    productCatalog: BOOKING_PRODUCT_CATALOG,
    deduplicateExistingProducts: false,
  });

  return {
    skipped: false,
    existingProducts,
    syncResult,
  };
}
