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
import { normalizeProductNameKey } from "@/lib/products/uniqueness";

export interface EffectiveBookingCatalog {
  productCatalog: PricelistCategory[];
  addOnCatalog: Record<string, CatalogAddOn[]>;
}

function buildDynamicKeywords(productName: string): string[] {
  const normalized = productName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return [];
  const words = normalized.split(" ").filter((w) => w.length > 2);
  const keywords = new Set<string>();
  keywords.add(normalized);
  for (const w of words) keywords.add(w);
  return Array.from(keywords);
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
  const state = rawState ? normalizeCatalogAdminState(rawState) : null;

  const effectiveProductCatalog = state
    ? buildEffectiveProductCatalog(state)
    : BOOKING_PRODUCT_CATALOG;

  const effectiveAddOnCatalog = state
    ? buildEffectiveAddOnCatalog(state)
    : BOOKING_ADD_ON_CATALOG;
  const allowedCategories = new Set(
    effectiveProductCatalog.map((entry) => entry.category),
  );

  // 1. Fetch active products from DB
  const dbProducts = await prisma.product.findMany({
    where: { businessId, isActive: true, deletedAt: null },
    include: { category: true },
  });

  // 2. Build Set of existing product names to avoid duplicates
  const existingNames = new Set<string>();
  for (const category of effectiveProductCatalog) {
    for (const sub of category.subcategories) {
      for (const prod of sub.products) {
        for (const variant of prod.variants) {
          const isStandardVariant = ["standard", "start from"].includes(
            variant.label.trim().toLowerCase()
          );
          let name = prod.name;
          if (prod.variants.length > 1 && !isStandardVariant) {
            name = `${prod.name} - ${variant.label}`;
          }
          existingNames.add(normalizeProductNameKey(name));
          existingNames.add(normalizeProductNameKey(prod.name));
        }
      }
    }
  }

  // 3. Inject new DB products
  const dbCatalog = JSON.parse(
    JSON.stringify(effectiveProductCatalog),
  ) as PricelistCategory[];

  for (const dbProduct of dbProducts) {
    const categoryName = dbProduct.category?.name || "";
    if (!allowedCategories.has(categoryName)) continue;

    const dbNameKey = normalizeProductNameKey(dbProduct.name);
    if (existingNames.has(dbNameKey)) continue;

    // Find or create category
    let category = dbCatalog.find(
      (c) => c.category.toLowerCase() === categoryName.toLowerCase(),
    );
    if (!category) {
      category = {
        category: categoryName,
        keywords: [categoryName.toLowerCase()],
        subcategories: [],
      };
      dbCatalog.push(category);
    }

    // Find or create subcategory
    const subcatName = "Custom Menu";
    let subcategory = category.subcategories.find((s) => s.name === subcatName);
    if (!subcategory) {
      subcategory = {
        name: subcatName,
        keywords: ["custom", "lainnya", "menu"],
        products: [],
      };
      category.subcategories.push(subcategory);
    }

    // Add product
    subcategory.products.push({
      name: dbProduct.name,
      keywords: buildDynamicKeywords(dbProduct.name),
      defaultVariant: "Standard",
      variants: [
        {
          label: "Standard",
          price: Number(dbProduct.sellingPrice),
          keywords: ["standard", "default"],
        },
      ],
    });

    existingNames.add(dbNameKey);
  }

  return {
    productCatalog: dbCatalog,
    addOnCatalog: effectiveAddOnCatalog,
  };
}
