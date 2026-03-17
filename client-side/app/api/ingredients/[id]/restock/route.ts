import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth/session";
import { StockDocumentType, InventoryMovementType } from "@prisma/client";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { businessId } = await requireAuth();

    // ✅ WAJIB await params
    const { id } = await context.params;

    console.log("PARAMS ID:", id);

    const ingredientId = Number(id);

    if (isNaN(ingredientId)) {
      return NextResponse.json({ error: "Invalid ingredient ID" }, { status: 400 });
    }

    const body = await request.json();
    const { quantity, costPerUnit, expirationDate, notes } = body;

    if (!quantity || quantity <= 0) {
      return NextResponse.json({ error: "Quantity must be greater than 0" }, { status: 400 });
    }

    if (!costPerUnit || costPerUnit <= 0) {
      return NextResponse.json({ error: "Cost per unit must be greater than 0" }, { status: 400 });
    }
    console.log("Business ID:", businessId);
    console.log("Ingredient ID:", ingredientId);

    const allIngredients = await prisma.ingredient.findMany();
    console.log("ALL INGREDIENTS:", allIngredients);
    // ✅ Validate ingredient belongs to business
    const ingredient = await prisma.ingredient.findFirst({
      where: {
        id: ingredientId,
        businessId,
      },
    });

    if (!ingredient) {
      return NextResponse.json({ error: "Ingredient not found" }, { status: 404 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1️⃣ Create Stock Document
      const stockDoc = await tx.stockDocument.create({
        data: {
          businessId,
          type: StockDocumentType.Purchase,
          notes: notes ?? null,
        },
      });

      // 2️⃣ Inventory Movement (IN)
      await tx.inventoryMovement.create({
        data: {
          ingredientId,
          ingredientNameSnapshot: ingredient.name,
          ingredientUnitSnapshot: ingredient.unit,
          stockDocumentId: stockDoc.id,
          quantity,
          costPerUnit,
          type: InventoryMovementType.In,
        },
      });

      // 3️⃣ Inventory Batch
      await tx.inventoryBatch.create({
        data: {
          ingredientId,
          remainingQty: quantity,
          costPerUnit,
          expirationDate: expirationDate ? new Date(expirationDate) : null,
        },
      });

      return stockDoc;
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("RESTOCK error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to restock ingredient",
      },
      { status: 500 },
    );
  }
}
