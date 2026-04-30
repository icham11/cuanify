import prisma from "@/lib/prisma";
import type { PricelistCategory } from "@/lib/bookings/pricelist";
import { calculateOrderTokenFromItems } from "@/lib/bookings/order-token-calculator";
import { buildDashboardProductName } from "@/lib/products/dashboard-name";
import {
  acquireProductWriteLock,
  collectDuplicateProductNames,
  deduplicateProductsForBusiness,
  normalizeProductName,
  normalizeProductNameKey,
} from "@/lib/products/uniqueness";

interface FlattenedCatalogProduct {
  category: string;
  productName: string;
  variantLabel: string;
  name: string;
  subcategory: string;
  sellingPrice: number;
  productionToken: number;
}

type ProductSyncDedupResult = {
  groupsMerged: number;
  removedProducts: number;
  touchedProductIds: number[];
};

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

const PRODUCT_SYNC_TX_TIMEOUT_MS = parsePositiveInteger(
  process.env.PRODUCT_SYNC_TX_TIMEOUT_MS,
  90_000,
);
const PRODUCT_SYNC_TX_MAX_WAIT_MS = parsePositiveInteger(
  process.env.PRODUCT_SYNC_TX_MAX_WAIT_MS,
  10_000,
);

function normalizeMoney(value: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed));
}

export function flattenCatalogProductsForDashboard(
  catalog: PricelistCategory[],
): FlattenedCatalogProduct[] {
  const rows: FlattenedCatalogProduct[] = [];
  const seen = new Set<string>();

  catalog.forEach((category) => {
    category.subcategories.forEach((subcategory) => {
      subcategory.products.forEach((product) => {
        product.variants.forEach((variant) => {
          const name = normalizeProductName(
            buildDashboardProductName({
              productName: product.name,
              variantLabel: variant.label,
              variantCount: product.variants.length,
            }),
          );
          const key = `${normalizeProductNameKey(subcategory.name)}||${normalizeProductNameKey(name)}`;
          if (seen.has(key)) return;
          seen.add(key);

          rows.push({
            category: category.category,
            productName: normalizeProductName(product.name),
            variantLabel: normalizeProductName(variant.label),
            name,
            subcategory: normalizeProductName(subcategory.name),
            sellingPrice: normalizeMoney(variant.price),
            productionToken: Math.max(
              0,
              Math.round(
                calculateOrderTokenFromItems([
                  {
                    category: category.category,
                    subcategory: subcategory.name,
                    productName: product.name,
                    size: variant.label,
                    difficulty: variant.label,
                    tokenDifficulty: variant.label,
                    quantity: 1,
                  },
                ]),
              ),
            ),
          });
        });
      });
    });
  });

  return rows;
}

async function hasDuplicateProducts(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  businessId: number,
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ normalizedName: string }>>`
    SELECT LOWER(REGEXP_REPLACE(BTRIM(p.name), E'\\s+', ' ', 'g')) AS "normalizedName"
    FROM "Product" p
    WHERE p."businessId" = ${businessId}
      AND p."deletedAt" IS NULL
    GROUP BY LOWER(REGEXP_REPLACE(BTRIM(p.name), E'\\s+', ' ', 'g'))
    HAVING COUNT(*) > 1
    LIMIT 1
  `;

  return rows.length > 0;
}

async function deduplicateProductsIfNeeded(args: {
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
  businessId: number;
}): Promise<ProductSyncDedupResult> {
  const shouldDeduplicate = await hasDuplicateProducts(args.tx, args.businessId);
  if (!shouldDeduplicate) {
    return {
      groupsMerged: 0,
      removedProducts: 0,
      touchedProductIds: [],
    };
  }

  return deduplicateProductsForBusiness({
    tx: args.tx,
    businessId: args.businessId,
  });
}

async function resolveCategoryIds(args: {
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
  businessId: number;
  categoryNames: string[];
}): Promise<Map<string, number>> {
  const { tx, businessId, categoryNames } = args;

  const existingCategories = await tx.category.findMany({
    where: {
      businessId,
    },
    select: { id: true, name: true },
  });

  const categoryIds = new Map<string, number>();
  existingCategories.forEach((category) => {
    categoryIds.set(normalizeProductNameKey(category.name), category.id);
  });

  const missingCategoryCreates: Array<{ businessId: number; name: string }> = [];
  for (const categoryName of categoryNames) {
    const key = normalizeProductNameKey(categoryName);
    if (!key || categoryIds.has(key)) continue;
    missingCategoryCreates.push({ businessId, name: categoryName });
    categoryIds.set(key, -1);
  }

  if (missingCategoryCreates.length > 0) {
    await tx.category.createMany({
      data: missingCategoryCreates,
    });

    const refreshedCategories = await tx.category.findMany({
      where: {
        businessId,
      },
      select: { id: true, name: true },
    });

    categoryIds.clear();
    refreshedCategories.forEach((category) => {
      categoryIds.set(normalizeProductNameKey(category.name), category.id);
    });
  }

  return categoryIds;
}

export async function syncBakeryCatalogToDashboardProducts(args: {
  businessId: number;
  productCatalog: PricelistCategory[];
  deduplicateExistingProducts?: boolean;
  updateExistingProducts?: boolean;
  reactivateDeletedProducts?: boolean;
}) {
  const products = flattenCatalogProductsForDashboard(args.productCatalog);
  const duplicateCatalogNames = collectDuplicateProductNames(
    products.map((product) => product.name),
  );
  if (duplicateCatalogNames.length > 0) {
    throw new Error(
      `Bakery catalog contains duplicate product names: ${duplicateCatalogNames.join(", ")}.`,
    );
  }

  const categoryNamesByKey = new Map<string, string>();
  products.forEach((product) => {
    const categoryName = normalizeProductName(product.subcategory);
    const key = normalizeProductNameKey(categoryName);
    if (!key || categoryNamesByKey.has(key)) return;
    categoryNamesByKey.set(key, categoryName);
  });

  const categoryNames = [...categoryNamesByKey.values()];

  const result = await prisma.$transaction(
    async (tx) => {
      await acquireProductWriteLock(tx, args.businessId);

      const dedupe = args.deduplicateExistingProducts === false
        ? {
            groupsMerged: 0,
            removedProducts: 0,
            touchedProductIds: [],
          }
        : await deduplicateProductsIfNeeded({
            tx,
            businessId: args.businessId,
          });

      const categoryIds = await resolveCategoryIds({
        tx,
        businessId: args.businessId,
        categoryNames,
      });
      const existingProducts = await tx.product.findMany({
        where: {
          businessId: args.businessId,
        },
        select: {
          id: true,
          name: true,
          categoryId: true,
          sellingPrice: true,
          productionToken: true,
          productType: true,
          isActive: true,
          deletedAt: true,
        },
        orderBy: [{ deletedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      });

      const existingByName = new Map<
        string,
        (typeof existingProducts)[number]
      >();

      existingProducts.forEach((product) => {
        const key = normalizeProductNameKey(product.name);
        const current = existingByName.get(key);
        if (!current || (current.deletedAt && !product.deletedAt)) {
          existingByName.set(key, product);
        }
      });

      let createdCount = 0;
      let updatedCount = 0;
      let reactivatedCount = 0;
      const shouldUpdateExisting = args.updateExistingProducts !== false;
      const shouldReactivateDeleted = args.reactivateDeletedProducts === true;
      const productsToCreate: Array<{
        businessId: number;
        categoryId: number | null;
        name: string;
        sellingPrice: number;
        cogs: number;
        productType: "PreOrder";
        productionToken: number;
      }> = [];

      for (const product of products) {
        const normalizedName = normalizeProductName(product.name);
        const subcategoryKey = normalizeProductNameKey(product.subcategory);
        const resolvedCategoryId = categoryIds.get(subcategoryKey) ?? null;
        const matched = existingByName.get(
          normalizeProductNameKey(normalizedName),
        );

        if (matched) {
          if (matched.deletedAt && !shouldReactivateDeleted) {
            continue;
          }

          if (!shouldUpdateExisting) {
            continue;
          }

          const needsUpdate =
            matched.categoryId !== resolvedCategoryId ||
            normalizeProductName(matched.name) !== normalizedName ||
            Number(matched.sellingPrice) !== product.sellingPrice ||
            Number(matched.productionToken ?? 0) !== product.productionToken ||
            matched.productType !== "PreOrder" ||
            matched.isActive !== true ||
            matched.deletedAt !== null;

          if (needsUpdate) {
            await tx.product.update({
              where: { id: matched.id },
              data: {
                categoryId: resolvedCategoryId,
                name: normalizedName,
                sellingPrice: product.sellingPrice,
                productionToken: product.productionToken,
                productType: "PreOrder",
                isActive: true,
                ...(shouldReactivateDeleted ? { deletedAt: null } : {}),
              },
            });

            updatedCount += 1;
            if (matched.deletedAt) {
              reactivatedCount += 1;
            }
          }

          continue;
        }

        productsToCreate.push({
          businessId: args.businessId,
          categoryId: resolvedCategoryId,
          name: normalizedName,
          sellingPrice: product.sellingPrice,
          productionToken: product.productionToken,
          cogs: 0,
          productType: "PreOrder",
        });
      }

      if (productsToCreate.length > 0) {
        const created = await tx.product.createMany({
          data: productsToCreate,
        });
        createdCount += created.count;
      }

      return {
        deletedCount: 0,
        createdCount,
        updatedCount,
        reactivatedCount,
        subcategoryCount: categoryNames.length,
        deduplicatedGroups: dedupe.groupsMerged,
        deduplicatedProducts: dedupe.removedProducts,
        touchedProductIds: dedupe.touchedProductIds,
      };
    },
    {
      maxWait: PRODUCT_SYNC_TX_MAX_WAIT_MS,
      timeout: PRODUCT_SYNC_TX_TIMEOUT_MS,
    },
  );

  return result;
}
