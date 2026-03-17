import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth/session";
import { StockDocumentType, InventoryMovementType } from "@prisma/client";

/**
 * PATCH /api/ingredients/[id]
 *
 * Updates name, unit, and/or costPerUnit of an ingredient.
 * costPerUnit is persisted by updating (or creating) the ingredient's first inventory batch.
 *
 * Success (200): { "success": true }
 * Errors: 400 | 401 | 404 | 500
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { businessId } = await requireAuth();
    const { id } = await context.params;
    const ingredientId = Number(id);

    if (isNaN(ingredientId)) {
      return NextResponse.json({ error: "Invalid ingredient ID" }, { status: 400 });
    }


    const body = await request.json();
    const { name, unit, minStock, costPerUnit, initialStock, expirationDate } = body as {
      name?: string;
      unit?: string;
      minStock?: number;
      costPerUnit?: number;
      /** Quantity to set on the initial batch (replaces the AI placeholder qty=0) */
      initialStock?: number;
      /** ISO date string YYYY-MM-DD for the batch expiration */
      expirationDate?: string;
    };

    const ingredient = await prisma.ingredient.findFirst({
      where: { id: ingredientId, businessId },
      include: {
        inventoryBatches: {
          orderBy: { receivedAt: "asc" as const },
        },
      },
    });

    if (!ingredient) {
      return NextResponse.json({ error: "Ingredient not found" }, { status: 404 });
    }

    // Update name / unit / minStock directly on the ingredient
    if (name !== undefined || unit !== undefined || minStock !== undefined) {
      await prisma.ingredient.update({
        where: { id: ingredientId },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(unit !== undefined ? { unit } : {}),
          ...(minStock !== undefined ? { minStock } : {}),
        },
      });
    }

    // Persist costPerUnit / initialStock / expirationDate via the inventory-batch layer
    const batchPatch: Record<string, unknown> = {};
    if (costPerUnit !== undefined) batchPatch.costPerUnit = costPerUnit;
    if (initialStock !== undefined) batchPatch.remainingQty = initialStock;
    if (expirationDate !== undefined) batchPatch.expirationDate = expirationDate ? new Date(expirationDate) : null;

    if (Object.keys(batchPatch).length > 0) {
      const existingBatch = ingredient.inventoryBatches[0];
      if (existingBatch) {
        await prisma.inventoryBatch.update({
          where: { id: existingBatch.id },
          data: batchPatch,
        });
      } else {
        // No batch yet — create one (costPerUnit must have a value for the DB constraint)
        await prisma.inventoryBatch.create({
          data: {
            ingredientId,
            remainingQty: (batchPatch.remainingQty as number) ?? 0,
            costPerUnit: (batchPatch.costPerUnit as number) ?? 0,
            ...(batchPatch.expirationDate !== undefined
              ? { expirationDate: batchPatch.expirationDate as Date | null }
              : {}),
          },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("PATCH /api/ingredients/[id] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update ingredient" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/ingredients/[id]
 *
 * Permanently deletes an ingredient and all its inventory batches / movements.
 * Only allowed when the ingredient belongs to the authenticated user's business.
 *
 * Success (200):
 *   { "success": true }
 *
 * Errors:
 *   400 — { "error": "Invalid ingredient ID" }
 *   401 — { "error": "Unauthorized" }
 *   404 — { "error": "Ingredient not found" }
 *   500 — { "error": "Failed to delete ingredient" }
 */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { businessId } = await requireAuth();
    const { id } = await context.params;
    const ingredientId = Number(id);

    if (isNaN(ingredientId)) {
      return NextResponse.json({ error: "Invalid ingredient ID" }, { status: 400 });
    }

    const ingredient = await prisma.ingredient.findFirst({
      where: { id: ingredientId, businessId },
    });

    if (!ingredient) {
      return NextResponse.json({ error: "Ingredient not found" }, { status: 404 });
    }

    // Cascade-delete is handled by Prisma schema relations;
    // if not configured, delete child records manually first.
    await prisma.ingredient.delete({ where: { id: ingredientId } });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("DELETE /api/ingredients/[id] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete ingredient" },
      { status: 500 },
    );
  }
}

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { businessId } = await requireAuth();
    const { id } = await context.params;

    const ingredientId = Number(id);

    if (isNaN(ingredientId)) {
      return NextResponse.json({ error: "Invalid ingredient ID" }, { status: 400 });
    }

    const body = await request.json();
    const { quantity, costPerUnit, expirationDate, notes } = body;

    if (typeof quantity !== "number" || quantity <= 0) {
      return NextResponse.json({ error: "Quantity must be a positive number" }, { status: 400 });
    }

    if (typeof costPerUnit !== "number" || costPerUnit <= 0) {
      return NextResponse.json({ error: "Cost per unit must be a positive number" }, { status: 400 });
    }

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
      // 1️⃣ Create Stock Document (Purchase)
      const stockDoc = await tx.stockDocument.create({
        data: {
          businessId,
          type: StockDocumentType.Purchase,
          notes: notes ?? null,
        },
      });

      // 2️⃣ Create Inventory Movement (IN)
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

      // 3️⃣ Create Inventory Batch
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

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to restock ingredient",
      },
      { status: 500 },
    );
  }
}
