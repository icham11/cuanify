import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth/session";
import { createIngredientSchema, bulkCreateIngredientsSchema } from "@/lib/validations/product";

export const runtime = "nodejs";

/**
 * GET /api/ingredients
 *
 * Query params: ?search=tepung&withBatches=true
 *
 * Success (200):
 *   {
 *     "success": true,
 *     "data": [{
 *       "id": 1, "name": "Tepung Terigu", "unit": "kg", "minStock": 5,
 *       "currentStock": 10, "costPerUnit": 12000,
 *       "inventoryBatches": [...]  // only when withBatches=true
 *     }]
 *   }
 *
 * Errors:
 *   401 — { "error": "Unauthorized" }
 *   500 — { "error": "Failed to fetch ingredients" }
 */
export async function GET(request: NextRequest) {
  try {
    const { businessId } = await requireAuth();

    const url = new URL(request.url);
    const search = url.searchParams.get("search") || "";
    const withBatches = url.searchParams.get("withBatches") === "true";

    const ingredients = await prisma.ingredient.findMany({
      where: {
        businessId,
        ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        inventoryBatches: {
          // Fetch ALL batches (including qty=0 AI-placeholder batches) so we can
          // fall back to the last batch's costPerUnit even when currentStock is 0.
          orderBy: { receivedAt: "asc" },
        },
      },
    });

    const data = ingredients.map((ing) => {
      const allBatches = ing.inventoryBatches;
      // Active batches only (qty > 0) used for stock & weighted-average cost
      const activeBatches = allBatches.filter((b) => Number(b.remainingQty) > 0);

      // ✅ TOTAL STOCK = sum of active batches
      // -1 is used as a sentinel for "never stocked" (no batches at all = just created, never configured)
      const currentStock =
        allBatches.length === 0 ? -1 : activeBatches.reduce((sum, b) => sum + Number(b.remainingQty), 0);

      // ✅ Weighted average cost
      const totalCost = activeBatches.reduce((sum, b) => sum + Number(b.remainingQty) * Number(b.costPerUnit), 0);

      // Fall back to the last batch regardless of qty (covers AI-created qty=0 placeholder batches)
      const costPerUnit =
        currentStock > 0
          ? totalCost / currentStock
          : allBatches.length > 0
            ? Number(allBatches[allBatches.length - 1].costPerUnit)
            : null;

      return {
        id: ing.id,
        name: ing.name,
        unit: ing.unit,
        minStock: ing.minStock,
        currentStock,
        costPerUnit,
        ...(withBatches ? { inventoryBatches: activeBatches } : {}),
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("GET /api/ingredients error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch ingredients",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/ingredients
 *
 * Single mode input (JSON):
 *   {
 *     "name": "Tepung Terigu", "unit": "kg", "minStock": 5,
 *     "initialBatch": { "quantity": 10, "costPerUnit": 12000, "expirationDate": "2026-06-01" }
 *   }
 *   initialBatch is optional.
 *
 * Bulk mode input (JSON):
 *   { "ingredients": [{ "name": "Gula", "unit": "kg", "initialBatch": { "quantity": 5, "costPerUnit": 14000 } }] }
 *
 * Success — Single (201 if new, 200 if existing):
 *   { "success": true, "data": { "id": 1, "name": "Tepung Terigu", "unit": "kg", "minStock": 5 } }
 *
 * Success — Bulk (201):
 *   { "success": true, "data": [{ "id": 2, "name": "Gula", "unit": "kg" }, ...] }
 *
 * Errors:
 *   400 — { "error": "Validation failed", "details": { ... } }
 *   401 — { "error": "Unauthorized" }
 *   500 — { "error": "Failed to create ingredient(s)" }
 */
/**
 * DELETE /api/ingredients
 *
 * Body: { "ids": [1, 2, 3] }
 *
 * Bulk-deletes the given ingredients (and cascade: batches / movements)
 * that belong to the authenticated user's business.
 *
 * Success (200): { "success": true, "deleted": 3 }
 * Errors: 400, 401, 500
 */
export async function DELETE(request: NextRequest) {
  try {
    const { businessId } = await requireAuth();
    const body = await request.json();
    const ids: unknown = body.ids;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "ids must be a non-empty array" }, { status: 400 });
    }

    const numericIds = ids.map(Number).filter((n) => !isNaN(n));
    if (numericIds.length === 0) {
      return NextResponse.json({ error: "No valid IDs provided" }, { status: 400 });
    }

    const { count } = await prisma.ingredient.deleteMany({
      where: { id: { in: numericIds }, businessId },
    });

    return NextResponse.json({ success: true, deleted: count });
  } catch (error: unknown) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("DELETE /api/ingredients error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete ingredients" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { businessId } = await requireAuth();
    const body = await request.json();

    // --- Bulk mode ---
    if (body.ingredients && Array.isArray(body.ingredients)) {
      const parsed = bulkCreateIngredientsSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          {
            error: "Validation failed",
            details: parsed.error.flatten().fieldErrors,
          },
          { status: 400 },
        );
      }

      const results = await prisma.$transaction(async (tx) => {
        const created: Awaited<ReturnType<typeof tx.ingredient.create>>[] = [];

        for (const item of parsed.data.ingredients) {
          // Find-or-create to avoid duplicates
          let ingredient = await tx.ingredient.findFirst({
            where: {
              businessId,
              name: { equals: item.name, mode: "insensitive" },
            },
          });

          // Biarkan minStock tetap -1 jika dari AI -1
          const minStockValue = item.minStock ?? -1;
          if (!ingredient) {
            ingredient = await tx.ingredient.create({
              data: {
                businessId,
                name: item.name,
                unit: item.unit,
                minStock: minStockValue,
              },
            });
          }

          // Optionally create initial inventory batch
          if (item.initialBatch) {
            await tx.inventoryBatch.create({
              data: {
                ingredientId: ingredient.id,
                remainingQty: item.initialBatch.quantity,
                costPerUnit: item.initialBatch.costPerUnit,
                expirationDate: item.initialBatch.expirationDate ? new Date(item.initialBatch.expirationDate) : null,
              },
            });
          }

          created.push(ingredient);
        }

        return created;
      });

      return NextResponse.json({ success: true, data: results }, { status: 201 });
    }

    // --- Single mode ---
    const parsed = createIngredientSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { name, unit, minStock, initialBatch } = parsed.data;
    // Jika minStock -1 dari AI, set ke 0
    const minStockValue = minStock === -1 ? 0 : (minStock ?? 0);

    // Check for existing ingredient with same name
    const existing = await prisma.ingredient.findFirst({
      where: {
        businessId,
        name: { equals: name, mode: "insensitive" },
      },
    });

    if (existing) {
      // If it already exists and there's an initial batch, just add the batch
      if (initialBatch) {
        await prisma.inventoryBatch.create({
          data: {
            ingredientId: existing.id,
            remainingQty: initialBatch.quantity,
            costPerUnit: initialBatch.costPerUnit,
            expirationDate: initialBatch.expirationDate ? new Date(initialBatch.expirationDate) : null,
          },
        });
      }
      return NextResponse.json({ success: true, data: existing });
    }

    const result = await prisma.$transaction(async (tx) => {
      const ingredient = await tx.ingredient.create({
        data: {
          businessId,
          name,
          unit,
          minStock: minStockValue,
        },
      });

      if (initialBatch) {
        await tx.inventoryBatch.create({
          data: {
            ingredientId: ingredient.id,
            remainingQty: initialBatch.quantity,
            costPerUnit: initialBatch.costPerUnit,
            expirationDate: initialBatch.expirationDate ? new Date(initialBatch.expirationDate) : null,
          },
        });
      }

      return ingredient;
    });

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error: unknown) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST /api/ingredients error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create ingredient(s)",
      },
      { status: 500 },
    );
  }
}
