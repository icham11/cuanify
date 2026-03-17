import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth/session";
import { generateProductByName } from "@/lib/ai/product-generation";
import { generateProductByNameSchema } from "@/lib/validations/product";
import { resolveIngredients } from "@/lib/helpers/resolve-ingredients";

export const runtime = "nodejs";

/**
 * POST /api/products/generate/name
 *
 * Generate a single product (with recipe) from just a product name using AI.
 * Auto-resolves ingredients (find existing or create new).
 *
 * Input (JSON):
 *   { "productName": "Nasi Goreng Spesial" }
 *
 * Success (200):
 *   {
 *     "success": true,
 *     "data": {
 *       "name": "Nasi Goreng Spesial", "categoryName": "Makanan", "sellingPrice": 25000,
 *       "recipe": [{
 *         "ingredientId": 1, "ingredientName": "Nasi", "unit": "gram",
 *         "quantity": 250, "costPerUnit": 50, "isNew": false
 *       }]
 *     },
 *     "readyToCreate": {
 *       "name": "Nasi Goreng Spesial", "categoryName": "Makanan", "sellingPrice": 25000,
 *       "recipe": [{ "ingredientId": 1, "quantity": 250 }]
 *     },
 *     "context": {
 *       "existingIngredientCount": 12, "existingCategoryCount": 3,
 *       "newIngredientsCreated": ["Kecap Manis"]
 *     }
 *   }
 *
 * Errors:
 *   400 — { "error": "Validation failed", "details": { "productName": ["..."] } }
 *   401 — { "error": "Unauthorized" }
 *   500 — { "error": "Failed to generate product" }
 */
export async function POST(request: NextRequest) {
  try {
    const { businessId } = await requireAuth();
    const body = await request.json();

    const parsed = generateProductByNameSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    // Fetch existing ingredients (with cost data) and categories for context
    const [rawIngredients, categories] = await Promise.all([
      prisma.ingredient.findMany({
        where: { businessId },
        select: {
          id: true,
          name: true,
          unit: true,
          inventoryBatches: {
            where: { remainingQty: { gt: 0 } },
            orderBy: { receivedAt: "desc" as const },
            select: { costPerUnit: true, remainingQty: true },
          },
        },
        orderBy: { name: "asc" },
      }),
      prisma.category.findMany({
        where: { businessId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);

    // Compute costPerUnit from batches (weighted average)
    const ingredients = rawIngredients.map((ing) => {
      const batches = ing.inventoryBatches;
      const totalQty = batches.reduce((s, b) => s + Number(b.remainingQty), 0);
      const totalCost = batches.reduce((s, b) => s + Number(b.remainingQty) * Number(b.costPerUnit), 0);
      const costPerUnit = totalQty > 0 ? totalCost / totalQty : batches[0] ? Number(batches[0].costPerUnit) : null;
      return { id: ing.id, name: ing.name, unit: ing.unit, costPerUnit };
    });

    const generated = await generateProductByName({
      productName: parsed.data.productName,
      existingIngredients: ingredients,
      existingCategories: categories,
    });

    // Auto-resolve ingredients: find existing or create new ones
    const { resolved, newIngredientsCreated } = await resolveIngredients(businessId, [generated]);
    const resolvedProduct = resolved[0];

    // Transform to POST /api/products ready format
    const readyProduct = {
      name: resolvedProduct.name,
      categoryName: resolvedProduct.categoryName,
      sellingPrice: resolvedProduct.sellingPrice,
      productType: resolvedProduct.productType ?? "PreOrder",
      recipe: resolvedProduct.recipe.map((r) => ({
        ingredientId: r.ingredientId,
        quantity: r.quantity,
      })),
    };

    return NextResponse.json({
      success: true,
      data: resolvedProduct,
      readyToCreate: readyProduct,
      context: {
        existingIngredientCount: ingredients.length,
        existingCategoryCount: categories.length,
        newIngredientsCreated,
        note: "Ingredients have been auto-resolved. Use readyToCreate payload to POST /api/products directly.",
      },
    });
  } catch (error: unknown) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST /api/products/generate/name error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to generate product",
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    );
  }
}
