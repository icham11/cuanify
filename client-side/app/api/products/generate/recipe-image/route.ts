import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth/session";
import { uploadRecipeImage } from "@/lib/imagekit";
import { generateRecipeByImage } from "@/lib/ai/product-generation";
import { resolveIngredients } from "@/lib/helpers/resolve-ingredients";

export const runtime = "nodejs";

function toInlineDataUrl(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType || "image/jpeg"};base64,${buffer.toString("base64")}`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * POST /api/products/generate/recipe-image
 *
 * Generate a recipe from an image (recipe card, ingredient photo, finished dish).
 * Auto-resolves ingredients (find existing or create new).
 *
 * Input: FormData with `file` (image, max 10MB) + optional `productName` (string)
 *
 * Success (200):
 *   {
 *     "success": true, "isValid": true,
 *     "data": {
 *       "recipe": [{
 *         "ingredientId": 1, "ingredientName": "Tepung", "unit": "kg",
 *         "quantity": 0.5, "costPerUnit": 12000, "isNew": false
 *       }],
 *       "readyRecipe": [{ "ingredientId": 1, "quantity": 0.5 }],
 *       "summary": {
 *         "total": 2, "existingIngredients": 1, "newIngredients": 1,
 *         "newIngredientsCreated": ["Vanili"]
 *       }
 *     },
 *     "meta": { "imageUrl": "https://...", "expiresIn": "2 minutes" }
 *   }
 *
 * Invalid image (422):
 *   { "success": false, "isValid": false, "error": "...", "recipe": [] }
 *
 * Errors:
 *   400 — { "error": "No image file provided" }
 *   400 — { "error": "File must be an image (JPEG, PNG, WebP)" }
 *   400 — { "error": "Image must be smaller than 10MB" }
 *   401 — { "error": "Unauthorized" }
 *   500 — { "error": "Failed to process recipe image" }
 */
export async function POST(request: NextRequest) {
  try {
    const { businessId } = await requireAuth();

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const productName = formData.get("productName") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No image file provided" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image (JPEG, PNG, WebP)" }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Image must be smaller than 10MB" }, { status: 400 });
    }

    // Upload to ImageKit (auto-expires in 2 minutes)
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    let aiImageUrl = toInlineDataUrl(buffer, file.type);
    let uploadedImageUrl: string | null = null;
    let uploadWarning: string | null = null;

    try {
      const uploadResult = await uploadRecipeImage(buffer, productName || "recipe", 2);
      aiImageUrl = uploadResult.url;
      uploadedImageUrl = uploadResult.url;
    } catch (uploadError) {
      uploadWarning = getErrorMessage(uploadError);
      console.warn(
        "ImageKit upload failed for /api/products/generate/recipe-image, using inline data URL fallback:",
        uploadWarning,
      );
    }

    // Fetch existing ingredients (with cost data) for AI context
    const rawIngredients = await prisma.ingredient.findMany({
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
    });

    const ingredients = rawIngredients.map((ing) => {
      const batches = ing.inventoryBatches;
      const totalQty = batches.reduce((s, b) => s + Number(b.remainingQty), 0);
      const totalCost = batches.reduce((s, b) => s + Number(b.remainingQty) * Number(b.costPerUnit), 0);
      const costPerUnit = totalQty > 0 ? totalCost / totalQty : batches[0] ? Number(batches[0].costPerUnit) : null;
      return { id: ing.id, name: ing.name, unit: ing.unit, costPerUnit };
    });

    // AI validation + extraction
    const result = await generateRecipeByImage({
      imageUrl: aiImageUrl,
      productName: productName || undefined,
      existingIngredients: ingredients,
    });

    if (!result.isValid) {
      return NextResponse.json(
        {
          success: false,
          isValid: false,
          error: result.error,
          recipe: [],
        },
        { status: 422 },
      );
    }

    // Build a temporary AIGeneratedProduct shape to reuse resolveIngredients
    const tempProduct = {
      name: productName || "temp",
      categoryName: "temp",
      sellingPrice: 0,
      recipe: result.recipe,
    };

    const { resolved, newIngredientsCreated } = await resolveIngredients(businessId, [tempProduct]);
    const resolvedRecipe = resolved[0].recipe;

    // Ready-to-use recipe for POST /api/products
    const readyRecipe = resolvedRecipe.map((r) => ({
      ingredientId: r.ingredientId,
      quantity: r.quantity,
    }));

    return NextResponse.json({
      success: true,
      isValid: true,
      data: {
        recipe: resolvedRecipe,
        readyRecipe,
        summary: {
          total: resolvedRecipe.length,
          existingIngredients: resolvedRecipe.filter((r) => !r.isNew).length,
          newIngredients: resolvedRecipe.filter((r) => r.isNew).length,
          newIngredientsCreated,
        },
      },
      meta: {
        imageUrl: uploadedImageUrl,
        uploadMode: uploadedImageUrl ? "imagekit" : "inline",
        uploadWarning,
        expiresIn: uploadedImageUrl ? "2 minutes" : null,
        note: "Ingredients have been auto-resolved. Use readyRecipe in your POST /api/products payload.",
      },
    });
  } catch (error: unknown) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST /api/products/generate/recipe-image error:", error);
    const errorMessage = getErrorMessage(error);
    return NextResponse.json(
      {
        error: errorMessage || "Failed to process recipe image",
      },
      { status: 500 },
    );
  }
}
