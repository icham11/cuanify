import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/session";
import { uploadRecipeImage } from "@/lib/imagekit";
import { generateRecipeByImage } from "@/lib/ai/product-generation";

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
 * Recipe extraction is kept for compatibility but does not create ingredients
 * while direct product COGS/HPP is the active cost source.
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
    await requireAuth();

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

    // AI validation + extraction
    const result = await generateRecipeByImage({
      imageUrl: aiImageUrl,
      productName: productName || undefined,
      existingIngredients: [],
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

    return NextResponse.json({
      success: true,
      isValid: true,
      data: {
        recipe: [],
        readyRecipe: [],
        summary: {
          total: 0,
          existingIngredients: 0,
          newIngredients: 0,
          newIngredientsCreated: [],
        },
      },
      meta: {
        imageUrl: uploadedImageUrl,
        uploadMode: uploadedImageUrl ? "imagekit" : "inline",
        uploadWarning,
        expiresIn: uploadedImageUrl ? "2 minutes" : null,
        note: "Recipe image parsing is disabled while direct COGS/HPP is active.",
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
