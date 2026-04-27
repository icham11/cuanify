import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth/session";
import { generateProductByName } from "@/lib/ai/product-generation";
import { generateProductByNameSchema } from "@/lib/validations/product";

export const runtime = "nodejs";

/**
 * POST /api/products/generate/name
 *
 * Generate a single product from just a product name using AI.
 * Ingredients are intentionally not resolved/created; COGS is direct input.
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

    const categories = await prisma.category.findMany({
      where: { businessId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    const generated = await generateProductByName({
      productName: parsed.data.productName,
      existingIngredients: [],
      existingCategories: categories,
    });
    const directProduct = {
      ...generated,
      recipe: [],
    };

    // Transform to POST /api/products ready format
    const readyProduct = {
      name: directProduct.name,
      categoryName: directProduct.categoryName,
      sellingPrice: directProduct.sellingPrice,
      cogs: directProduct.cogs,
      productType: directProduct.productType ?? "PreOrder",
      recipe: [],
    };

    return NextResponse.json({
      success: true,
      data: directProduct,
      readyToCreate: readyProduct,
      context: {
        existingCategoryCount: categories.length,
        note: "COGS/HPP memakai nominal langsung. Ingredients tidak dibuat otomatis.",
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
