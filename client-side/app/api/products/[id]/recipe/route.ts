import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth/session";
import { recipeItemSchema } from "@/lib/validations/product";
import { recomputeRecipeCost } from "@/lib/computeRecipeCost";

export const runtime = "nodejs";

// ================= GET =================

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { businessId } = await requireAuth();
    const { id } = await context.params;

    const productId = Number(id);
    if (isNaN(productId)) {
      return NextResponse.json({ error: "Invalid product ID" }, { status: 400 });
    }

    const product = await prisma.product.findFirst({
      where: { id: productId, businessId, deletedAt: null },
      include: {
        recipes: {
          include: {
            ingredient: {
              include: {
                inventoryBatches: {
                  where: { remainingQty: { gt: 0 } },
                  select: { remainingQty: true },
                },
              },
            },
          },
        },
      },
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Compute currentStock (sum of active batch remainingQty) as a virtual field
    const data = product.recipes.map((r) => ({
      ...r,
      ingredient: {
        ...r.ingredient,
        currentStock: r.ingredient.inventoryBatches.reduce((sum, b) => sum + Number(b.remainingQty), 0),
      },
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ error: "Failed to fetch recipe" }, { status: 500 });
  }
}

// ================= POST =================

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { businessId } = await requireAuth();
    const { id } = await context.params;

    const productId = Number(id);
    if (isNaN(productId)) {
      return NextResponse.json({ error: "Invalid product ID" }, { status: 400 });
    }

    const body = await request.json();

    const parsed = recipeItemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    // Validate product belongs to business
    const product = await prisma.product.findFirst({
      where: { id: productId, businessId, deletedAt: null },
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const { ingredientId, quantity } = parsed.data;

    const recipe = await prisma.recipe.upsert({
      where: {
        productId_ingredientId: {
          productId,
          ingredientId,
        },
      },
      update: { quantity },
      create: {
        productId,
        ingredientId,
        quantity,
      },
    });

    // Recompute stored recipeCost for the product
    await recomputeRecipeCost(productId).catch(() => {});

    return NextResponse.json({ success: true, data: recipe }, { status: 201 });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Recipe error:", error);

    return NextResponse.json({ error: "Failed to create/update recipe" }, { status: 500 });
  }
}
