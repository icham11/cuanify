import prisma from "@/lib/prisma";
import {
  buildEffectiveAddOnCatalog,
  buildEffectiveProductCatalog,
  normalizeCatalogAdminState,
} from "@/lib/bookings/catalog-state";
import {
  BOOKING_ADD_ON_CATALOG,
  BOOKING_PRODUCT_CATALOG,
  type CatalogAddOn,
  type PricelistCategory,
} from "@/lib/bookings/pricelist";

export interface EffectiveBookingCatalog {
  productCatalog: PricelistCategory[];
  addOnCatalog: Record<string, CatalogAddOn[]>;
}

export async function loadEffectiveBookingCatalog(
  businessId: number,
): Promise<EffectiveBookingCatalog> {
  const rows = await prisma.$queryRaw<Array<{ metadata: unknown }>>`
    SELECT metadata
    FROM "BusinessDocument"
    WHERE "businessId" = ${businessId}
      AND "sourceType" = 'bakery_catalog_config'
    ORDER BY "updatedAt" DESC
    LIMIT 1`;

  const rawState = rows[0]?.metadata;
  if (!rawState) {
    return {
      productCatalog: BOOKING_PRODUCT_CATALOG,
      addOnCatalog: BOOKING_ADD_ON_CATALOG,
    };
  }

  const state = normalizeCatalogAdminState(rawState);
  return {
    productCatalog: buildEffectiveProductCatalog(state),
    addOnCatalog: buildEffectiveAddOnCatalog(state),
  };
}
