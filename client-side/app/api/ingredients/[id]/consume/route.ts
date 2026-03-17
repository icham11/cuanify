import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth/session";
import { StockDocumentType, InventoryMovementType } from "@prisma/client";

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
    const { quantity, notes, batchId } = body as { quantity: number; notes?: string; batchId?: number };

    if (typeof quantity !== "number" || quantity <= 0) {
      return NextResponse.json({ error: "Quantity must be a positive number" }, { status: 400 });
    }

    const ingredient = await prisma.ingredient.findFirst({
      where: { id: ingredientId, businessId },
    });

    if (!ingredient) {
      return NextResponse.json({ error: "Ingredient not found" }, { status: 404 });
    }

    const result = await prisma.$transaction(async (tx) => {
      let totalCost = 0;

      if (batchId) {
        // 🎯 Targeted single-batch deduction
        const batch = await tx.inventoryBatch.findFirst({
          where: { id: batchId, ingredientId, remainingQty: { gt: 0 } },
        });
        if (!batch) throw new Error("Batch tidak ditemukan atau sudah kosong");
        const available = Number(batch.remainingQty);
        if (available < quantity) {
          throw new Error(`Stok batch tidak mencukupi (tersisa ${available} ${ingredient.unit})`);
        }
        await tx.inventoryBatch.update({
          where: { id: batchId },
          data: { remainingQty: available - quantity },
        });
        totalCost = quantity * Number(batch.costPerUnit);
      } else {
        // 🔥 FIFO deduction across all batches
        const batches = await tx.inventoryBatch.findMany({
          where: { ingredientId, remainingQty: { gt: 0 } },
          orderBy: { receivedAt: "asc" },
        });
        const totalStock = batches.reduce((sum, b) => sum + Number(b.remainingQty), 0);
        if (totalStock < quantity) throw new Error("Insufficient stock");

        let remainingToDeduct = quantity;
        for (const batch of batches) {
          if (remainingToDeduct <= 0) break;
          const available = Number(batch.remainingQty);
          const deductQty = Math.min(available, remainingToDeduct);
          await tx.inventoryBatch.update({
            where: { id: batch.id },
            data: { remainingQty: available - deductQty },
          });
          totalCost += deductQty * Number(batch.costPerUnit);
          remainingToDeduct -= deductQty;
        }
      }

      // 📄 Create Stock Document (Waste)
      const stockDoc = await tx.stockDocument.create({
        data: {
          businessId,
          type: StockDocumentType.Waste,
          notes: notes ?? null,
        },
      });

      // 📦 Create Movement OUT
      await tx.inventoryMovement.create({
        data: {
          ingredientId,
          ingredientNameSnapshot: ingredient.name,
          ingredientUnitSnapshot: ingredient.unit,
          stockDocumentId: stockDoc.id,
          quantity,
          costPerUnit: totalCost / quantity,
          type: InventoryMovementType.Out,
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
        error: error instanceof Error ? error.message : "Failed to consume stock",
      },
      { status: 500 },
    );
  }
}
