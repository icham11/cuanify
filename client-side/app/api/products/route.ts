import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  requireAuth,
  isAuthError,
  requireRole,
  ForbiddenError,
} from "@/lib/auth/session";
import { createProductSchema, bulkCreateProductsSchema } from "@/lib/validations/product";
import { normalizeDirectCogs } from "@/lib/cogs/config";
import {
  acquireProductWriteLock,
  collectDuplicateProductNames,
  findProductNameConflicts,
  normalizeProductName,
} from "@/lib/products/uniqueness";
import { getProductFieldAvailability } from "@/lib/products/prisma-product-capabilities";
import { ensureOwnerDefaultProducts } from "@/lib/bookings/owner-product-bootstrap";
import { loadEffectiveBookingCatalog } from "@/lib/bookings/catalog-config-server";
import { flattenCatalogProductsForDashboard } from "@/lib/bookings/product-sync";
import {
  isPrismaConnectionTimeout,
  prismaConnectionErrorResponse,
  throwIfPrismaTimeoutCooldownActive,
} from "@/lib/prisma-errors";

export const runtime = "nodejs";

// ---------- helpers ----------

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

const PRODUCT_TX_MAX_WAIT_MS = parsePositiveInteger(
  process.env.PRODUCT_TX_MAX_WAIT_MS,
  10_000,
);
const PRODUCT_BULK_TX_TIMEOUT_MS = parsePositiveInteger(
  process.env.PRODUCT_BULK_TX_TIMEOUT_MS,
  90_000,
);
const PRODUCT_SINGLE_TX_TIMEOUT_MS = parsePositiveInteger(
  process.env.PRODUCT_SINGLE_TX_TIMEOUT_MS,
  30_000,
);

function isExpiredTransactionError(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2028"
  ) {
    return true;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("expired transaction") ||
      message.includes("transaction api error")
    );
  }

  return false;
}

function normalizeTokenKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function getCatalogTokenMapFromCatalog(
  catalog: Awaited<ReturnType<typeof loadEffectiveBookingCatalog>>["productCatalog"],
): Map<string, number> {
  const rows = flattenCatalogProductsForDashboard(catalog);
  const map = new Map<string, number>();
  rows.forEach((row) => {
    map.set(
      normalizeTokenKey(row.name),
      Math.max(0, Number(row.productionToken ?? 0)),
    );
  });
  return map;
}

/** Find-or-create a category within the business (case-insensitive). */
async function resolveCategory(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  businessId: number,
  categoryName: string,
): Promise<number> {
  const existing = await tx.category.findFirst({
    where: {
      businessId,
      name: { equals: categoryName, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await tx.category.create({
    data: { businessId, name: categoryName },
    select: { id: true },
  });
  return created.id;
}

/** Check that all ingredient IDs belong to the given business. */
async function validateIngredients(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  businessId: number,
  ingredientIds: number[],
): Promise<void> {
  if (ingredientIds.length === 0) return;

  const unique = [...new Set(ingredientIds)];
  const found = await tx.ingredient.findMany({
    where: { id: { in: unique }, businessId },
    select: { id: true },
  });

  if (found.length !== unique.length) {
    const foundSet = new Set(found.map((i) => i.id));
    const missing = unique.filter((id) => !foundSet.has(id));
    throw new Error(`Ingredient IDs not found in this business: ${missing.join(", ")}`);
  }
}

// ---------- GET ----------

/**
 * GET /api/products
 *
 * Query params:
 *   ?search=kopi
 *   &categoryId=1
 *   &categoryIds=1,2,3
 *   &excludeCategoryNames=Archived,Hidden
 *   &sortBy=name|sellingPrice|createdAt   (default: createdAt)
 *   &sortOrder=asc|desc                   (default: desc)
 *   &withRecipe=true                      (default: true)
 *   &page=1                               (default: 1)
 *   &limit=10                             (default: 10, max: 100)
 */
export async function GET(request: NextRequest) {
  try {
    throwIfPrismaTimeoutCooldownActive();
    const auth = await requireAuth();
    const { businessId } = auth;
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode");
    const isFinancialMode = mode === "financial";

    const search = url.searchParams.get("search") || "";
    const categoryId = url.searchParams.get("categoryId");
    const categoryIds = (url.searchParams.get("categoryIds") || "")
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value > 0);
    const excludeCategoryNames = (
      url.searchParams.get("excludeCategoryNames") || ""
    )
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const withRecipe = url.searchParams.get("withRecipe") !== "false"; // default true
    const categoryFilterIds = categoryIds.length
      ? Array.from(new Set(categoryIds))
      : categoryId
        ? [Number(categoryId)]
        : [];

    // Sort params — DB-sortable fields (margin handled via raw SQL)
    const sortByRaw = url.searchParams.get("sortBy") ?? "createdAt";
    const sortOrder = (url.searchParams.get("sortOrder") ?? "desc") as "asc" | "desc";
    const isMarginSort = sortByRaw === "margin";
    const allowedSortFields = ["name", "sellingPrice", "cogs", "createdAt"] as const;
    type SortField = (typeof allowedSortFields)[number];
    const sortBy: SortField = (allowedSortFields as readonly string[]).includes(sortByRaw)
      ? (sortByRaw as SortField)
      : "createdAt";

    // Pagination params
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
    const limit = Math.min(999, Math.max(1, Number(url.searchParams.get("limit") ?? "10")));
    const skip = (page - 1) * limit;

    const shouldBootstrapOwnerDefaults =
      auth.role === "Owner" &&
      !isFinancialMode &&
      !search &&
      categoryFilterIds.length === 0 &&
      page === 1;

    if (shouldBootstrapOwnerDefaults) {
      try {
        await ensureOwnerDefaultProducts({ businessId });
      } catch (bootstrapError) {
        console.error("GET /api/products owner product bootstrap error:", bootstrapError);
      }
    }

    if (isFinancialMode) {
      const products = await prisma.product.findMany({
        where: {
          businessId,
          deletedAt: null,
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          name: true,
          cogs: true,
        },
      });

      return NextResponse.json({
        success: true,
        data: products.map((product) => ({
          id: product.id,
          name: product.name,
          cogs: Number(product.cogs),
        })),
      });
    }

    const where = {
      businessId,
      deletedAt: null as null,
      ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
      ...(categoryFilterIds.length === 1
        ? { categoryId: categoryFilterIds[0] }
        : categoryFilterIds.length > 1
          ? { categoryId: { in: categoryFilterIds } }
          : {}),
      ...(excludeCategoryNames.length
        ? {
            OR: [
              { categoryId: null },
              {
                category: {
                  is: { name: { notIn: excludeCategoryNames } },
                },
              },
            ],
          }
        : {}),
    };

    // Build raw WHERE fragments (reused for stats + margin sort query)
    const whereParts: Prisma.Sql[] = [Prisma.sql`"businessId" = ${businessId}`, Prisma.sql`"deletedAt" IS NULL`];
    if (search) whereParts.push(Prisma.sql`name ILIKE ${"%" + search + "%"}`);
    if (categoryFilterIds.length === 1) {
      whereParts.push(Prisma.sql`"categoryId" = ${categoryFilterIds[0]}`);
    } else if (categoryFilterIds.length > 1) {
      whereParts.push(Prisma.sql`"categoryId" IN (${Prisma.join(categoryFilterIds)})`);
    }
    if (excludeCategoryNames.length > 0) {
      whereParts.push(Prisma.sql`(
        "categoryId" IS NULL OR "categoryId" NOT IN (
          SELECT id
          FROM "Category"
          WHERE "businessId" = ${businessId}
            AND name IN (${Prisma.join(excludeCategoryNames)})
        )
      )`);
    }
    const whereRaw = Prisma.join(whereParts, " AND ");

    const [total, statsRows, { hasProductionToken, hasManualStock, hasMinimumOrder }] =
      await Promise.all([
        prisma.product.count({ where }),
        prisma.$queryRaw<{ avg_price: string | null; avg_margin: string | null }[]>`
          SELECT
            AVG("sellingPrice")::text                                                     AS avg_price,
            AVG(
              CASE WHEN "sellingPrice" > 0 AND "cogs" > 0
                   THEN GREATEST(-200, LEAST(100,
                        ("sellingPrice" - "cogs") / "sellingPrice" * 100))
                   ELSE NULL
              END
            )::text                                                                       AS avg_margin
          FROM "Product"
          WHERE ${whereRaw}
        `,
        getProductFieldAvailability(),
      ]);
    const totalPages = Math.ceil(total / limit) || 1;

    // Global stats — computed over ALL matching products, not just the current page
    // avgMargin: excludes products with no recipe (cogs=0) and clamps outliers to [-200, 100]
    // so a single mis-entered product with -1000% margin doesn't destroy the stat.
    const sr = statsRows[0];
    const avgSellingPrice = sr?.avg_price ? Math.round(Number(sr.avg_price)) : 0;
    const avgMargin = sr?.avg_margin ? Math.round(Number(sr.avg_margin)) : 0;
    const meta = { total, page, limit, totalPages, avgSellingPrice, avgMargin };

    let catalogTokenMapPromise: Promise<Map<string, number>> | null = null;
    const getCatalogTokenMap = () => {
      if (!catalogTokenMapPromise) {
        catalogTokenMapPromise = loadEffectiveBookingCatalog(businessId).then(
          ({ productCatalog }) => getCatalogTokenMapFromCatalog(productCatalog),
        );
      }
      return catalogTokenMapPromise;
    };

    const selectBase: Record<string, boolean> = {
      id: true,
      businessId: true,
      categoryId: true,
      name: true,
      sellingPrice: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      recipeCost: true,
      deletedAt: true,
      productType: true,
      cogs: true,
    };
    if (hasProductionToken) selectBase.productionToken = true;
    if (hasManualStock) selectBase.manualStock = true;
    if (hasMinimumOrder) selectBase.minimumOrder = true;

    // Split query paths so Prisma can infer ingredient.inventoryBatches type
    if (!withRecipe) {
      const products = (await prisma.product.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
        select: {
          ...selectBase,
          category: { select: { id: true, name: true } },
        },
      })) as Array<Record<string, unknown> & { name: string; category: { id: number; name: string } | null }>;
      const needsCatalogFallback =
        !hasProductionToken ||
        products.some(
          (product) =>
            Math.max(
              0,
              Number((product as { productionToken?: number }).productionToken ?? 0),
            ) <= 0,
        );
      const catalogTokenMap = needsCatalogFallback
        ? await getCatalogTokenMap()
        : null;
      const data = products.map((p) => ({
        ...p,
        productionToken: (() => {
          const current = Math.max(
            0,
            Number((p as { productionToken?: number }).productionToken ?? 0),
          );
          if (current > 0) return current;
          const fallback = catalogTokenMap?.get(normalizeTokenKey(p.name)) ?? 0;
          return fallback;
        })(),
        availableStock: Math.max(
          0,
          Number((p as { manualStock?: number }).manualStock ?? 0),
        ),
        minimumOrder: Math.max(
          0,
          Number((p as { minimumOrder?: number }).minimumOrder ?? 0),
        ),
      }));
      return NextResponse.json({ success: true, data, meta });
    }

    // For margin sort: get paginated+sorted IDs via raw SQL, then fetch data by those IDs
    let orderedIds: number[] | null = null;
    if (isMarginSort) {
      const sortDir = sortOrder === "asc" ? Prisma.sql`ASC NULLS LAST` : Prisma.sql`DESC NULLS LAST`;
      const marginRows = await prisma.$queryRaw<{ id: number }[]>`
        SELECT id
        FROM "Product"
        WHERE ${whereRaw}
        ORDER BY
          CASE WHEN "sellingPrice" = 0 THEN NULL
               ELSE ("sellingPrice" - "cogs") / "sellingPrice"
          END ${sortDir}
        LIMIT ${limit} OFFSET ${skip}
      `;
      orderedIds = marginRows.map((r) => Number(r.id));
    }

    const products = (await prisma.product.findMany({
      where: orderedIds ? { id: { in: orderedIds } } : where,
      orderBy: orderedIds ? undefined : { [sortBy]: sortOrder },
      skip: orderedIds ? undefined : skip,
      take: orderedIds ? undefined : limit,
      select: {
        ...selectBase,
        category: { select: { id: true, name: true } },
        productionBatches: {
          where: { remainingQty: { gt: 0 } },
          select: { remainingQty: true },
        },
        recipes: {
          include: {
            ingredient: {
              select: {
                id: true,
                name: true,
                unit: true,
                // Fetch ALL batches (including depleted qty=0 batches) so we can
                // fall back to the most recent batch's costPerUnit even when stock is 0.
                inventoryBatches: {
                  orderBy: { receivedAt: "desc" },
                  select: { costPerUnit: true, remainingQty: true },
                },
              },
            },
          },
        },
      },
    })) as unknown as Array<
      Record<string, unknown> & {
        id: number;
        name: string;
        cogs: number | string;
        category: { id: number; name: string } | null;
        productionBatches: Array<{ remainingQty: number }>;
        recipes: Array<{
          ingredient: {
            id: number;
            name: string;
            unit: string;
            inventoryBatches: Array<{ costPerUnit: number | string; remainingQty: number | string }>;
          };
          id: number;
          quantity: number | string;
          ingredientId: number;
          productId: number;
          createdAt: Date;
          updatedAt: Date;
        }>;
      }
    >;
    const needsCatalogFallback =
      !hasProductionToken ||
      products.some(
        (product) =>
          Math.max(
            0,
            Number((product as { productionToken?: number }).productionToken ?? 0),
          ) <= 0,
      );
    const catalogTokenMap = needsCatalogFallback
      ? await getCatalogTokenMap()
      : null;

    // Enrich recipe rows for backward-compatible API shape. Active COGS is always
    // the direct currency value stored on the product.
    const enriched = products.map((product) => {
      const recipesWithCost = product.recipes.map((r) => {
        const allBatches = r.ingredient.inventoryBatches;
        // Active batches (qty > 0) drive the weighted-average cost;
        // when stock is 0 we fall back to the most recent batch's costPerUnit.
        const activeBatches = allBatches.filter((b) => Number(b.remainingQty) > 0);
        const currentStock = activeBatches.reduce((sum, b) => sum + Number(b.remainingQty), 0);
        const totalCost = activeBatches.reduce((sum, b) => sum + Number(b.remainingQty) * Number(b.costPerUnit), 0);
        const costPerUnit =
          currentStock > 0
            ? totalCost / currentStock
            : allBatches[0] // ordered desc → [0] is the most recent batch
              ? Number(allBatches[0].costPerUnit)
              : null;

        return {
          ...r,
          ingredient: {
            id: r.ingredient.id,
            name: r.ingredient.name,
            unit: r.ingredient.unit,
            costPerUnit,
            currentStock,
          },
        };
      });

      return {
        ...product,
        productionToken: (() => {
          const current = Math.max(
            0,
            Number(
              (product as { productionToken?: number }).productionToken ?? 0,
            ),
          );
          if (current > 0) return current;
          const fallback =
            catalogTokenMap?.get(normalizeTokenKey(product.name)) ?? 0;
          return fallback;
        })(),
        recipes: recipesWithCost,
        cogs: Number(product.cogs),
        availableStock: Math.max(
          0,
          Number((product as { manualStock?: number }).manualStock ?? 0),
        ),
        minimumOrder: Math.max(
          0,
          Number((product as { minimumOrder?: number }).minimumOrder ?? 0),
        ),
        productionBatches: undefined,
      };
    });

    // Re-sort to preserve raw-SQL margin order
    const finalProducts = orderedIds
      ? (() => {
          const map = new Map(enriched.map((p) => [p.id, p]));
          return orderedIds.map((id) => map.get(id)).filter(Boolean) as typeof enriched;
        })()
      : enriched;

    return NextResponse.json({ success: true, data: finalProducts, meta });
  } catch (error: unknown) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (isPrismaConnectionTimeout(error)) {
      return prismaConnectionErrorResponse(
        "Koneksi database sedang penuh saat memuat produk. Coba lagi beberapa saat.",
      );
    }
    console.error("GET /api/products error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch products" },
      { status: 500 },
    );
  }
}

// ---------- POST ----------

/**
 * POST /api/products
 *
 * Single input (JSON):
 *   {
 *     "name": "Kopi Susu", "categoryName": "Minuman", "sellingPrice": 25000,
 *     "recipe": [{ "ingredientId": 1, "quantity": 0.02 }]
 *   }
 *
 * Bulk input (JSON):
 *   { "products": [ ...single shape... ] }
 *
 * Success (201):
 *   {
 *     "success": true,
 *     "data": {
 *       "id": 1, "name": "Kopi Susu", "sellingPrice": 25000,
 *       "categoryId": 1,
 *       "category": { "id": 1, "name": "Minuman" },
 *       "recipes": [{
 *         "id": 1, "quantity": 0.02,
 *         "ingredient": { "id": 1, "name": "Kopi Bubuk", "unit": "kg" }
 *       }]
 *     }
 *   }
 *
 * Errors:
 *   400 — { "error": "Validation failed", "details": { ... } }
 *   400 — { "error": "Ingredient IDs not found in this business: 99" }
 *   401 — { "error": "Unauthorized" }
 *   409 — { "error": "Product \"Kopi Susu\" already exists." }
 *   500 — { "error": "Failed to create product(s)" }
 */
export async function POST(request: NextRequest) {
  try {
    throwIfPrismaTimeoutCooldownActive();
    const auth = await requireAuth();
    requireRole(auth, "Owner");
    const { businessId } = auth;
    const body = await request.json();
    const { hasProductionToken, hasManualStock, hasMinimumOrder } =
      await getProductFieldAvailability();

    // Determine single vs bulk
    const isBulk = body.products && Array.isArray(body.products);

    if (isBulk) {
      const parsed = bulkCreateProductsSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
          { status: 400 },
        );
      }

      // Run creates inside a transaction (no refetch inside — avoids timeout)
      const createdIds = await prisma.$transaction(
        async (tx) => {
          await acquireProductWriteLock(tx, businessId);

          const productNames = parsed.data.products.map((p) =>
            normalizeProductName(p.name),
          );

          const requestDuplicates = collectDuplicateProductNames(productNames);
          if (requestDuplicates.length > 0) {
            throw new Error(
              `Request contains duplicate product names: ${requestDuplicates.join(", ")}.`,
            );
          }

          // Duplicate check
          const duplicates = await findProductNameConflicts({
            tx,
            businessId,
            names: productNames,
          });
          if (duplicates.length > 0) {
            throw new Error(`Products already exist: ${duplicates.join(", ")}. Remove duplicates or rename them.`);
          }

          // Validate all ingredient IDs upfront
          const allIngredientIds = parsed.data.products.flatMap((p) => p.recipe.map((r) => r.ingredientId));
          await validateIngredients(tx, businessId, allIngredientIds);

          const ids: number[] = [];

          for (const item of parsed.data.products) {
            const categoryId = await resolveCategory(tx, businessId, item.categoryName);
            const normalizedName = normalizeProductName(item.name);

            const productData: Record<string, unknown> = {
              businessId,
              categoryId,
              name: normalizedName,
              sellingPrice: item.sellingPrice,
              cogs: normalizeDirectCogs(item.cogs),
              productType: item.productType ?? "PreOrder",
            };
            if (hasProductionToken) {
              productData.productionToken = item.productionToken ?? 0;
            }
            if (hasManualStock) {
              productData.manualStock = item.manualStock ?? 0;
            }
            if (hasMinimumOrder) {
              productData.minimumOrder = item.minimumOrder ?? 0;
            }

            const product = await tx.product.create({
              data: productData,
            });

            if (item.recipe.length > 0) {
              await tx.recipe.createMany({
                data: item.recipe.map((r) => ({
                  productId: product.id,
                  ingredientId: r.ingredientId,
                  quantity: r.quantity,
                })),
              });
            }

            ids.push(product.id);
          }

          return ids;
        },
        {
          maxWait: PRODUCT_TX_MAX_WAIT_MS,
          timeout: PRODUCT_BULK_TX_TIMEOUT_MS,
        },
      );

      // Refetch with relations OUTSIDE the transaction
      const result = await prisma.product.findMany({
        where: { id: { in: createdIds } },
        include: {
          category: { select: { id: true, name: true } },
          recipes: {
            include: {
              ingredient: { select: { id: true, name: true, unit: true } },
            },
          },
        },
      });

      return NextResponse.json({ success: true, data: result }, { status: 201 });
    }

    // --- Single product ---
    const parsed = createProductSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const {
      name,
      categoryName,
      sellingPrice,
      recipe,
      productType,
      cogs,
      manualCogs,
      productionToken,
      manualStock,
      minimumOrder,
    } = parsed.data;

    // Run creates inside a transaction (refetch outside to avoid timeout)
    const createdId = await prisma.$transaction(
      async (tx) => {
        await acquireProductWriteLock(tx, businessId);

        const normalizedName = normalizeProductName(name);

        // Duplicate check
        const duplicates = await findProductNameConflicts({
          tx,
          businessId,
          names: [normalizedName],
        });
        if (duplicates.length > 0) {
          throw new Error(`Product "${normalizedName}" already exists.`);
        }

        // Validate ingredients
        const ingredientIds = recipe.map((r) => r.ingredientId);
        await validateIngredients(tx, businessId, ingredientIds);

        // Resolve category
        const categoryId = await resolveCategory(tx, businessId, categoryName);

        // Create product
        const productData: Record<string, unknown> = {
          businessId,
          categoryId,
          name: normalizedName,
          sellingPrice,
          cogs: normalizeDirectCogs(cogs),
          productType: productType ?? "PreOrder",
          recipeCost:
            recipe.length === 0 && manualCogs !== undefined ? manualCogs : 0,
        };
        if (hasProductionToken) {
          productData.productionToken = productionToken ?? 0;
        }
        if (hasManualStock) {
          productData.manualStock = manualStock ?? 0;
        }
        if (hasMinimumOrder) {
          productData.minimumOrder = minimumOrder ?? 0;
        }

        const product = await tx.product.create({
          data: productData,
        });

        // Create recipe entries
        if (recipe.length > 0) {
          await tx.recipe.createMany({
            data: recipe.map((r) => ({
              productId: product.id,
              ingredientId: r.ingredientId,
              quantity: r.quantity,
            })),
          });
        }

        return product.id;
      },
      {
        maxWait: PRODUCT_TX_MAX_WAIT_MS,
        timeout: PRODUCT_SINGLE_TX_TIMEOUT_MS,
      },
    );

    // Refetch with relations OUTSIDE the transaction
    const result = await prisma.product.findUnique({
      where: { id: createdId },
      include: {
        category: { select: { id: true, name: true } },
        recipes: {
          include: {
            ingredient: { select: { id: true, name: true, unit: true } },
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error: unknown) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    // Transaction errors from duplicate / validation checks
    if (
      error instanceof Error &&
      (error.message.includes("already exist") ||
        error.message.includes("duplicate product names"))
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (isExpiredTransactionError(error)) {
      return NextResponse.json(
        {
          error:
            "Database sedang sibuk memproses sinkronisasi produk. Coba lagi beberapa detik lagi.",
        },
        { status: 503 },
      );
    }
    if (isPrismaConnectionTimeout(error)) {
      return prismaConnectionErrorResponse(
        "Koneksi database sedang penuh saat menyimpan produk. Coba lagi beberapa saat.",
      );
    }
    if (error instanceof Error && error.message.includes("not found")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("POST /api/products error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create product(s)" },
      { status: 500 },
    );
  }
}

// ---------- DELETE (bulk) ----------

/**
 * DELETE /api/products
 * Body: { ids: number[] }
 * Deletes multiple products (and their recipes via cascade) that belong to the business.
 */
export async function DELETE(request: NextRequest) {
  try {
    throwIfPrismaTimeoutCooldownActive();
    const auth = await requireAuth();
    requireRole(auth, "Owner");
    const { businessId } = auth;

    const body = await request.json();
    const ids: number[] = Array.isArray(body?.ids) ? body.ids.map(Number) : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: "No product IDs provided" }, { status: 400 });
    }

    // Verify all IDs belong to this business
    const owned = await prisma.product.findMany({
      where: { id: { in: ids }, businessId },
      select: { id: true },
    });
    if (owned.length !== ids.length) {
      return NextResponse.json({ error: "Some products were not found" }, { status: 404 });
    }

    // Soft-delete: SaleItem / ProductMetrics / ProductForecast rows are preserved
    const now = new Date();
    await prisma.product.updateMany({ where: { id: { in: ids }, businessId }, data: { deletedAt: now } });

    return NextResponse.json({ success: true, deleted: ids.length });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (isPrismaConnectionTimeout(error)) {
      return prismaConnectionErrorResponse(
        "Koneksi database sedang penuh saat menghapus produk. Coba lagi beberapa saat.",
      );
    }
    console.error("DELETE /api/products error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete products" },
      { status: 500 },
    );
  }
}
