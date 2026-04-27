import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth/session";
import { uploadProductImage } from "@/lib/imagekit";
import { generateProductsByImage } from "@/lib/ai/product-generation";

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
 * POST /api/products/generate/image
 *
 * Generate multiple products from an image (menu, price list, product display).
 * Ingredients are intentionally not resolved/created; COGS is direct input.
 *
 * Input: FormData with `file` (image, max 10MB, JPEG/PNG/WebP)
 *
 * Success (200):
 *   {
 *     "success": true, "isValid": true,
 *     "data": [{
 *       "name": "Nasi Goreng", "categoryName": "Makanan", "sellingPrice": 20000,
 *       "recipe": [{
 *         "ingredientId": 1, "ingredientName": "Nasi", "unit": "gram",
 *         "quantity": 200, "costPerUnit": 50, "isNew": false
 *       }]
 *     }],
 *     "readyToCreate": {
 *       "products": [{
 *         "name": "Nasi Goreng", "categoryName": "Makanan", "sellingPrice": 20000,
 *         "recipe": [{ "ingredientId": 1, "quantity": 200 }]
 *       }]
 *     },
 *     "meta": {
 *       "productsFound": 1, "newIngredientsCreated": ["Sambal"],
 *       "imageUrl": "https://...", "expiresIn": "2 minutes"
 *     }
 *   }
 *
 * Invalid image (422):
 *   { "success": false, "isValid": false, "error": "...", "products": [] }
 *
 * Errors:
 *   400 — { "error": "No image file provided" }
 *   400 — { "error": "File must be an image (JPEG, PNG, WebP)" }
 *   400 — { "error": "Image must be smaller than 10MB" }
 *   401 — { "error": "Unauthorized" }
 *   500 — { "error": "Failed to process image" }
 */
export async function POST(request: NextRequest) {
  try {
    const { businessId } = await requireAuth();

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No image file provided" }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image (JPEG, PNG, WebP)" }, { status: 400 });
    }

    // Validate file size (max 10MB)
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
      const uploadResult = await uploadProductImage(buffer, "product-list", 2);
      aiImageUrl = uploadResult.url;
      uploadedImageUrl = uploadResult.url;
    } catch (uploadError) {
      uploadWarning = getErrorMessage(uploadError);
      console.warn(
        "ImageKit upload failed for /api/products/generate/image, using inline data URL fallback:",
        uploadWarning,
      );
    }

    // Fetch categories and product names for AI context + duplicate check.
    const [categories, existingProductsRaw] = await Promise.all([
      prisma.category.findMany({
        where: { businessId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.product.findMany({
        where: { businessId, deletedAt: null },
        select: { name: true },
      }),
    ]);

    const existingProductNames = existingProductsRaw.map((p) => p.name);
    const existingNamesSet = new Set(existingProductNames.map((n) => n.toLowerCase()));

    // AI validation + extraction — passing existing product names so AI skips them
    const result = await generateProductsByImage({
      imageUrl: aiImageUrl,
      existingIngredients: [],
      existingCategories: categories,
      existingProductNames,
    });

    if (!result.isValid) {
      return NextResponse.json(
        {
          success: false,
          isValid: false,
          error: result.error,
          products: [],
        },
        { status: 422 },
      );
    }

    // Backend duplicate filter as a safety net (catches AI oversights)
    const newProducts = result.products.filter((p) => !existingNamesSet.has(p.name.trim().toLowerCase()));

    if (newProducts.length === 0) {
      const duplicateNames = result.products.map((p) => p.name);
      return NextResponse.json(
        {
          success: false,
          isValid: false,
          error: `All ${duplicateNames.length} product${duplicateNames.length !== 1 ? "s" : ""} found in this image already exist in your product list: ${duplicateNames.join(", ")}.`,
          products: [],
        },
        { status: 409 },
      );
    }

    const directProducts = newProducts.map((product) => ({
      ...product,
      recipe: [],
    }));

    // Transform to POST /api/products ready format
    const readyProducts = directProducts.map((p) => ({
      name: p.name,
      categoryName: p.categoryName,
      sellingPrice: p.sellingPrice,
      cogs: p.cogs,
      productType: p.productType ?? "PreOrder",
      recipe: [],
    }));

    return NextResponse.json({
      success: true,
      isValid: true,
      data: directProducts,
      readyToCreate: { products: readyProducts },
      meta: {
        productsFound: directProducts.length,
        newIngredientsCreated: [],
        skippedDuplicates: result.products.length - newProducts.length,
        imageUrl: uploadedImageUrl,
        uploadMode: uploadedImageUrl ? "imagekit" : "inline",
        uploadWarning,
        expiresIn: uploadedImageUrl ? "2 minutes" : null,
        note: "COGS/HPP memakai nominal langsung. Ingredients tidak dibuat otomatis.",
      },
    });
  } catch (error: unknown) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST /api/products/generate/image error:", error);
    const errorMessage = getErrorMessage(error);
    return NextResponse.json(
      {
        error: errorMessage || "Failed to process image",
      },
      { status: 500 },
    );
  }
}
