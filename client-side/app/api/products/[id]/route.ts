import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth/session";
import { z } from "zod";
import { recomputeRecipeCost } from "@/lib/computeRecipeCost";

export const runtime = "nodejs";

// ---------- PATCH /api/products/[id] — update selling price only ----------


import { recipeItemSchema } from "@/lib/validations/product";

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  categoryId: z.coerce.number().int().optional(),
  categoryName: z.string().min(1).max(100).optional(),
  sellingPrice: z.coerce.number().positive("Selling price must be positive").optional(),
  productType: z.enum(["ReadyStock", "PreOrder"]).optional(),
  createdAt: z.string().datetime().optional(),
  recipe: z.array(recipeItemSchema).optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { businessId } = await requireAuth();
    const { id: idParam } = await params;
    const id = Number(idParam);
    if (!id || isNaN(id)) {
      return NextResponse.json({ error: "Invalid product ID" }, { status: 400 });
    }

    // Ownership check — also blocks patching soft-deleted products
    const existing = await prisma.product.findFirst({
      where: { id, businessId, deletedAt: null },
      include: { recipes: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      console.error("PATCH /api/products/[id] validation failed:", JSON.stringify(parsed.error.flatten(), null, 2), "Body:", JSON.stringify(body));
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    let categoryId = parsed.data.categoryId;
    if (!categoryId && parsed.data.categoryName) {
      // Find or create category by name (case-insensitive)
      let category = await prisma.category.findFirst({
        where: { businessId, name: { equals: parsed.data.categoryName, mode: "insensitive" } },
      });
      if (!category) {
        category = await prisma.category.create({
          data: { businessId, name: parsed.data.categoryName },
        });
      }
      categoryId = category.id;
    }

    // Prepare update data
    const updateData: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (categoryId !== undefined) updateData.categoryId = categoryId;
    if (parsed.data.sellingPrice !== undefined) updateData.sellingPrice = parsed.data.sellingPrice;
    if (parsed.data.productType !== undefined) updateData.productType = parsed.data.productType;
    if (parsed.data.createdAt !== undefined) updateData.createdAt = new Date(parsed.data.createdAt);

    // Update product main fields
    const updatedProduct = await prisma.product.update({
      where: { id },
      data: updateData,
      include: {
        category: { select: { id: true, name: true } },
        recipes: { include: { ingredient: true } },
      },
    });

    // Update recipe if provided (replace all)
    if (parsed.data.recipe) {
      // Delete old recipes
      await prisma.recipe.deleteMany({ where: { productId: id } });
      // Insert new recipes
      if (parsed.data.recipe.length > 0) {
        await prisma.recipe.createMany({
          data: parsed.data.recipe.map((r) => ({
            productId: id,
            ingredientId: r.ingredientId,
            quantity: r.quantity,
          })),
        });
      }
      // Recompute recipeCost after recipe update
      try {
        await recomputeRecipeCost(id);
      } catch {
        // non-critical — cost will be stale until next recompute
      }
    }

    // Refetch updated product with relations
    const result = await prisma.product.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
        recipes: { include: { ingredient: true } },
      },
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("PATCH /api/products/[id] error:", error);
    return NextResponse.json({ error: "Failed to update product" }, { status: 500 });
  }
}

// ---------- DELETE /api/products/[id] — delete product + cascades recipes ----------

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { businessId } = await requireAuth();
    const { id: idParam } = await params;
    const id = Number(idParam);
    if (!id || isNaN(id)) {
      return NextResponse.json({ error: "Invalid product ID" }, { status: 400 });
    }

    // Ownership check
    const existing = await prisma.product.findFirst({
      where: { id, businessId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Soft-delete: keeps SaleItem / ProductMetrics / ProductForecast intact
    await prisma.product.update({ where: { id }, data: { deletedAt: new Date() } });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("DELETE /api/products/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete product" }, { status: 500 });
  }
}
