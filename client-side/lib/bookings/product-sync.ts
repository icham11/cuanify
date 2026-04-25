import prisma from "@/lib/prisma";
import { recomputeRecipeCost } from "@/lib/computeRecipeCost";
import type { PricelistCategory } from "@/lib/bookings/pricelist";
import {
  acquireProductWriteLock,
  collectDuplicateProductNames,
  deduplicateProductsForBusiness,
  normalizeProductName,
  normalizeProductNameKey,
} from "@/lib/products/uniqueness";

interface FlattenedCatalogProduct {
  name: string;
  subcategory: string;
  sellingPrice: number;
}

function normalizeMoney(value: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed));
}

export function buildDashboardProductName(args: {
  productName: string;
  variantLabel: string;
  variantCount: number;
}): string {
  if (
    args.variantCount === 1 &&
    ["standard", "start from"].includes(args.variantLabel.trim().toLowerCase())
  ) {
    return args.productName;
  }

  return `${args.productName} - ${args.variantLabel}`;
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
            name,
            subcategory: normalizeProductName(subcategory.name),
            sellingPrice: normalizeMoney(variant.price),
          });
        });
      });
    });
  });

  return rows;
}

export async function syncBakeryCatalogToDashboardProducts(args: {
  businessId: number;
  productCatalog: PricelistCategory[];
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

  const categoryNames = Array.from(
    new Set(
      products
        .map((product) => normalizeProductName(product.subcategory))
        .filter(Boolean),
    ),
  );

  const result = await prisma.$transaction(
    async (tx) => {
      await acquireProductWriteLock(tx, args.businessId);
      const dedupe = await deduplicateProductsForBusiness({
        tx,
        businessId: args.businessId,
      });

      const existingCategories = await tx.category.findMany({
        where: {
          businessId: args.businessId,
          name: { in: categoryNames },
        },
        select: { id: true, name: true },
      });

      const categoryIds = new Map<string, number>();
      existingCategories.forEach((category) => {
        categoryIds.set(normalizeProductNameKey(category.name), category.id);
      });

      for (const subcategory of categoryNames) {
        const existingId = categoryIds.get(
          normalizeProductNameKey(subcategory),
        );
        if (existingId) continue;

        const created = await tx.category.create({
          data: {
            businessId: args.businessId,
            name: subcategory,
          },
          select: { id: true },
        });
        categoryIds.set(normalizeProductNameKey(subcategory), created.id);
      }

      const existingProducts = await tx.product.findMany({
        where: {
          businessId: args.businessId,
        },
        include: {
          category: {
            select: { id: true, name: true },
          },
        },
        orderBy: [{ deletedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      });

      const existingByName = new Map<
        string,
        (typeof existingProducts)[number]
      >();

      existingProducts.forEach((product) => {
        const key = normalizeProductNameKey(product.name);
        if (!existingByName.has(key)) {
          existingByName.set(key, product);
        }
      });

      let createdCount = 0;
      let updatedCount = 0;
      let reactivatedCount = 0;
      const productsToCreate: Array<{
        businessId: number;
        categoryId: number | null;
        name: string;
        sellingPrice: number;
        recipeCost: number;
        productType: "PreOrder";
      }> = [];

      for (const product of products) {
        const normalizedName = normalizeProductName(product.name);
        const subcategoryKey = normalizeProductNameKey(product.subcategory);
        const resolvedCategoryId = categoryIds.get(subcategoryKey) ?? null;
        const matched = existingByName.get(
          normalizeProductNameKey(normalizedName),
        );

        if (matched) {
          await tx.product.update({
            where: { id: matched.id },
            data: {
              categoryId: resolvedCategoryId,
              name: normalizedName,
              sellingPrice: product.sellingPrice,
              productType: "PreOrder",
              isActive: true,
              deletedAt: null,
            },
          });

          updatedCount += 1;
          if (matched.deletedAt) {
            reactivatedCount += 1;
          }

          existingByName.set(normalizeProductNameKey(normalizedName), {
            ...matched,
            name: normalizedName,
            categoryId: resolvedCategoryId,
            deletedAt: null,
          });
          continue;
        }

        productsToCreate.push({
          businessId: args.businessId,
          categoryId: resolvedCategoryId,
          name: normalizedName,
          sellingPrice: product.sellingPrice,
          recipeCost: 0,
          productType: "PreOrder",
        });
        createdCount += 1;
      }

      if (productsToCreate.length > 0) {
        await tx.product.createMany({
          data: productsToCreate,
        });
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
    { timeout: 120000 },
  );

  if (result.touchedProductIds.length > 0) {
    await Promise.all(
      result.touchedProductIds.map((id) =>
        recomputeRecipeCost(id).catch(() => {}),
      ),
    );
  }

  return result;
}
