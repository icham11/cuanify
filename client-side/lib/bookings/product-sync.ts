import prisma from "@/lib/prisma";
import type { PricelistCategory } from "@/lib/bookings/pricelist";

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
          const name = buildDashboardProductName({
            productName: product.name,
            variantLabel: variant.label,
            variantCount: product.variants.length,
          });
          const key = `${subcategory.name.toLowerCase()}||${name.toLowerCase()}`;
          if (seen.has(key)) return;
          seen.add(key);

          rows.push({
            name,
            subcategory: subcategory.name,
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
  const categoryNames = Array.from(
    new Set(products.map((product) => product.subcategory.trim()).filter(Boolean)),
  );

  const result = await prisma.$transaction(
    async (tx) => {
      const existingCategories = await tx.category.findMany({
        where: {
          businessId: args.businessId,
          name: { in: categoryNames },
        },
        select: { id: true, name: true },
      });

      const categoryIds = new Map<string, number>();
      existingCategories.forEach((category) => {
        categoryIds.set(category.name.toLowerCase(), category.id);
      });

      for (const subcategory of categoryNames) {
        const existingId = categoryIds.get(subcategory.toLowerCase());
        if (existingId) {
          continue;
        }

        const created = await tx.category.create({
          data: {
            businessId: args.businessId,
            name: subcategory,
          },
          select: { id: true },
        });
        categoryIds.set(subcategory.toLowerCase(), created.id);
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
      });

      const compositeKey = (name: string, subcategory: string) =>
        `${subcategory.trim().toLowerCase()}||${name.trim().toLowerCase()}`;
      const nameKey = (name: string) => name.trim().toLowerCase();

      const existingByComposite = new Map<
        string,
        (typeof existingProducts)[number]
      >();
      const existingByName = new Map<
        string,
        Array<(typeof existingProducts)[number]>
      >();

      existingProducts.forEach((product) => {
        const categoryName = product.category?.name ?? "";
        existingByComposite.set(compositeKey(product.name, categoryName), product);

        const bucket = existingByName.get(nameKey(product.name)) ?? [];
        bucket.push(product);
        existingByName.set(nameKey(product.name), bucket);
      });

      let createdCount = 0;
      let updatedCount = 0;
      let reactivatedCount = 0;

      for (const product of products) {
        const subcategoryKey = product.subcategory.trim().toLowerCase();
        const resolvedCategoryId = categoryIds.get(subcategoryKey) ?? null;
        const nextCompositeKey = compositeKey(product.name, product.subcategory);
        const existingComposite = existingByComposite.get(nextCompositeKey);
        const sameNameCandidates = existingByName.get(nameKey(product.name)) ?? [];
        const fallbackByName =
          sameNameCandidates.length === 1 ? sameNameCandidates[0] : undefined;
        const matched = existingComposite ?? fallbackByName;

        if (matched) {
          await tx.product.update({
            where: { id: matched.id },
            data: {
              categoryId: resolvedCategoryId,
              name: product.name,
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
          continue;
        }

        await tx.product.create({
          data: {
            businessId: args.businessId,
            categoryId: resolvedCategoryId,
            name: product.name,
            sellingPrice: product.sellingPrice,
            recipeCost: 0,
            productType: "PreOrder",
          },
        });

        createdCount += 1;
      }

      return {
        deletedCount: 0,
        createdCount,
        updatedCount,
        reactivatedCount,
        subcategoryCount: categoryNames.length,
      };
    },
    { timeout: 30000 },
  );

  return result;
}
