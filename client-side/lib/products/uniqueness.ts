import { Prisma } from "@prisma/client";

export const PRODUCT_WRITE_LOCK_NAMESPACE = 724001;

export function normalizeProductName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

export function normalizeProductNameKey(name: string): string {
  return normalizeProductName(name).toLowerCase();
}

export function collectDuplicateProductNames(names: string[]): string[] {
  const seen = new Map<string, string>();
  const duplicates = new Set<string>();

  names.forEach((name) => {
    const normalized = normalizeProductNameKey(name);
    if (!normalized) return;

    const firstSeen = seen.get(normalized);
    if (firstSeen) {
      duplicates.add(firstSeen);
      duplicates.add(normalizeProductName(name));
      return;
    }

    seen.set(normalized, normalizeProductName(name));
  });

  return [...duplicates];
}

export async function acquireProductWriteLock(
  tx: Prisma.TransactionClient,
  businessId: number,
): Promise<void> {
  await tx.$executeRawUnsafe(
    "SELECT pg_advisory_xact_lock($1, $2)",
    PRODUCT_WRITE_LOCK_NAMESPACE,
    businessId,
  );
}

export async function findProductNameConflicts(args: {
  tx: Prisma.TransactionClient;
  businessId: number;
  names: string[];
  excludeProductId?: number;
}): Promise<string[]> {
  const normalizedNames = [...new Set(
    args.names.map((name) => normalizeProductNameKey(name)).filter(Boolean),
  )];

  if (normalizedNames.length === 0) return [];

  const rows = await args.tx.$queryRaw<Array<{ name: string }>>`
    SELECT DISTINCT p.name
    FROM "Product" p
    WHERE p."businessId" = ${args.businessId}
      AND p."deletedAt" IS NULL
      AND LOWER(REGEXP_REPLACE(BTRIM(p.name), E'\\s+', ' ', 'g')) IN (
        ${Prisma.join(normalizedNames.map((name) => Prisma.sql`${name}`))}
      )
      ${
        args.excludeProductId === undefined
          ? Prisma.empty
          : Prisma.sql`AND p.id <> ${args.excludeProductId}`
      }
    ORDER BY p.name ASC
  `;

  return rows.map((row) => normalizeProductName(row.name));
}

type ProductDuplicateCandidate = {
  id: number;
  name: string;
  categoryId: number | null;
  sellingPrice: string;
  recipeCost: string;
  productType: "ReadyStock" | "PreOrder";
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  normalizedName: string;
  recipeCount: number;
  saleItemCount: number;
  productionBatchCount: number;
  metricsCount: number;
  forecastCount: number;
};

export type ProductDeduplicationResult = {
  businessId: number;
  groupsMerged: number;
  removedProducts: number;
  touchedProductIds: number[];
};

function compareDuplicateCandidates(
  left: ProductDuplicateCandidate,
  right: ProductDuplicateCandidate,
): number {
  const scoreComparisons = [
    right.saleItemCount - left.saleItemCount,
    right.productionBatchCount - left.productionBatchCount,
    right.recipeCount - left.recipeCount,
    right.metricsCount - left.metricsCount,
    right.forecastCount - left.forecastCount,
    Number(Boolean(right.categoryId)) - Number(Boolean(left.categoryId)),
    Number(Number(right.recipeCost) > 0) - Number(Number(left.recipeCost) > 0),
    Number(Number(right.sellingPrice) > 0) - Number(Number(left.sellingPrice) > 0),
  ];

  for (const comparison of scoreComparisons) {
    if (comparison !== 0) return comparison;
  }

  const createdAtComparison =
    left.createdAt.getTime() - right.createdAt.getTime();
  if (createdAtComparison !== 0) return createdAtComparison;

  return left.id - right.id;
}

async function mergeRecipes(
  tx: Prisma.TransactionClient,
  canonicalId: number,
  duplicateId: number,
): Promise<void> {
  const duplicateRecipes = await tx.recipe.findMany({
    where: { productId: duplicateId },
    orderBy: { id: "asc" },
  });

  for (const recipe of duplicateRecipes) {
    const existing = await tx.recipe.findFirst({
      where: {
        productId: canonicalId,
        ingredientId: recipe.ingredientId,
      },
      select: { id: true, quantity: true },
    });

    if (!existing) {
      await tx.recipe.update({
        where: { id: recipe.id },
        data: { productId: canonicalId },
      });
      continue;
    }

    if (Number(existing.quantity) <= 0 && Number(recipe.quantity) > 0) {
      await tx.recipe.update({
        where: { id: existing.id },
        data: { quantity: recipe.quantity },
      });
    }

    await tx.recipe.delete({ where: { id: recipe.id } });
  }
}

async function mergeProductMetrics(
  tx: Prisma.TransactionClient,
  canonicalId: number,
  duplicateId: number,
): Promise<void> {
  const metrics = await tx.productMetrics.findMany({
    where: { productId: duplicateId },
    orderBy: { date: "asc" },
  });

  for (const metric of metrics) {
    const existing = await tx.productMetrics.findFirst({
      where: { productId: canonicalId, date: metric.date },
      select: { id: true },
    });

    if (!existing) {
      await tx.productMetrics.update({
        where: { id: metric.id },
        data: { productId: canonicalId },
      });
      continue;
    }

    await tx.productMetrics.update({
      where: { id: existing.id },
      data: {
        quantitySold: { increment: metric.quantitySold },
        revenue: { increment: metric.revenue },
        cost: { increment: metric.cost },
        profit: { increment: metric.profit },
      },
    });

    await tx.productMetrics.delete({ where: { id: metric.id } });
  }
}

async function mergeProductForecasts(
  tx: Prisma.TransactionClient,
  canonicalId: number,
  duplicateId: number,
): Promise<void> {
  const forecasts = await tx.productForecast.findMany({
    where: { productId: duplicateId },
    orderBy: { date: "asc" },
  });

  for (const forecast of forecasts) {
    const existing = await tx.productForecast.findFirst({
      where: { productId: canonicalId, date: forecast.date },
    });

    if (!existing) {
      await tx.productForecast.update({
        where: { id: forecast.id },
        data: { productId: canonicalId },
      });
      continue;
    }

    if (forecast.updatedAt > existing.updatedAt) {
      await tx.productForecast.update({
        where: { id: existing.id },
        data: {
          predictedQty: forecast.predictedQty,
          lowerBound: forecast.lowerBound,
          upperBound: forecast.upperBound,
          recommendedProduction: forecast.recommendedProduction,
          confidenceScore: forecast.confidenceScore,
          metadata:
            forecast.metadata === null
              ? Prisma.JsonNull
              : (forecast.metadata ?? undefined),
        },
      });
    }

    await tx.productForecast.delete({ where: { id: forecast.id } });
  }
}

async function mergeDuplicateProductIntoCanonical(args: {
  tx: Prisma.TransactionClient;
  canonical: ProductDuplicateCandidate;
  duplicate: ProductDuplicateCandidate;
}): Promise<void> {
  const { tx, canonical, duplicate } = args;

  await tx.product.update({
    where: { id: canonical.id },
    data: {
      name: normalizeProductName(canonical.name),
      categoryId: canonical.categoryId ?? duplicate.categoryId ?? undefined,
      isActive: canonical.isActive || duplicate.isActive,
      sellingPrice:
        Number(canonical.sellingPrice) > 0
          ? canonical.sellingPrice
          : duplicate.sellingPrice,
      recipeCost:
        Number(canonical.recipeCost) > 0
          ? canonical.recipeCost
          : duplicate.recipeCost,
    },
  });

  await mergeRecipes(tx, canonical.id, duplicate.id);
  await tx.saleItem.updateMany({
    where: { productId: duplicate.id },
    data: { productId: canonical.id },
  });
  await tx.productionBatch.updateMany({
    where: { productId: duplicate.id },
    data: { productId: canonical.id },
  });
  await mergeProductMetrics(tx, canonical.id, duplicate.id);
  await mergeProductForecasts(tx, canonical.id, duplicate.id);

  await tx.product.delete({ where: { id: duplicate.id } });
}

export async function deduplicateProductsForBusiness(args: {
  tx: Prisma.TransactionClient;
  businessId: number;
}): Promise<ProductDeduplicationResult> {
  const { tx, businessId } = args;

  const candidates = await tx.$queryRaw<ProductDuplicateCandidate[]>`
    SELECT
      p.id,
      p.name,
      p."categoryId",
      p."sellingPrice"::text AS "sellingPrice",
      p."recipeCost"::text AS "recipeCost",
      p."productType"::text AS "productType",
      p."isActive",
      p."createdAt",
      p."updatedAt",
      LOWER(REGEXP_REPLACE(BTRIM(p.name), E'\\s+', ' ', 'g')) AS "normalizedName",
      COALESCE(recipe_counts.count, 0)::int AS "recipeCount",
      COALESCE(sale_item_counts.count, 0)::int AS "saleItemCount",
      COALESCE(batch_counts.count, 0)::int AS "productionBatchCount",
      COALESCE(metric_counts.count, 0)::int AS "metricsCount",
      COALESCE(forecast_counts.count, 0)::int AS "forecastCount"
    FROM "Product" p
    LEFT JOIN (
      SELECT "productId", COUNT(*) AS count
      FROM "Recipe"
      GROUP BY "productId"
    ) recipe_counts ON recipe_counts."productId" = p.id
    LEFT JOIN (
      SELECT "productId", COUNT(*) AS count
      FROM "SaleItem"
      GROUP BY "productId"
    ) sale_item_counts ON sale_item_counts."productId" = p.id
    LEFT JOIN (
      SELECT "productId", COUNT(*) AS count
      FROM "ProductionBatch"
      GROUP BY "productId"
    ) batch_counts ON batch_counts."productId" = p.id
    LEFT JOIN (
      SELECT "productId", COUNT(*) AS count
      FROM "ProductMetrics"
      GROUP BY "productId"
    ) metric_counts ON metric_counts."productId" = p.id
    LEFT JOIN (
      SELECT "productId", COUNT(*) AS count
      FROM "ProductForecast"
      GROUP BY "productId"
    ) forecast_counts ON forecast_counts."productId" = p.id
    WHERE p."businessId" = ${businessId}
      AND p."deletedAt" IS NULL
    ORDER BY p.id ASC
  `;

  const grouped = new Map<string, ProductDuplicateCandidate[]>();
  candidates.forEach((candidate) => {
    const bucket = grouped.get(candidate.normalizedName) ?? [];
    bucket.push(candidate);
    grouped.set(candidate.normalizedName, bucket);
  });

  let groupsMerged = 0;
  let removedProducts = 0;
  const touchedProductIds = new Set<number>();

  for (const group of grouped.values()) {
    if (group.length < 2) continue;

    const sorted = [...group].sort(compareDuplicateCandidates);
    const canonical = sorted[0];
    const duplicates = sorted.slice(1);

    groupsMerged += 1;
    touchedProductIds.add(canonical.id);

    for (const duplicate of duplicates) {
      await mergeDuplicateProductIntoCanonical({
        tx,
        canonical,
        duplicate,
      });
      canonical.categoryId ??= duplicate.categoryId;
      canonical.isActive ||= duplicate.isActive;
      if (Number(canonical.sellingPrice) <= 0 && Number(duplicate.sellingPrice) > 0) {
        canonical.sellingPrice = duplicate.sellingPrice;
      }
      if (Number(canonical.recipeCost) <= 0 && Number(duplicate.recipeCost) > 0) {
        canonical.recipeCost = duplicate.recipeCost;
      }
      removedProducts += 1;
    }
  }

  return {
    businessId,
    groupsMerged,
    removedProducts,
    touchedProductIds: [...touchedProductIds],
  };
}
