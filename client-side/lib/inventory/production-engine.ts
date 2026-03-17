/**
 * Production Engine — handles Ready Stock product production & deduction.
 *
 * Ready Stock flow:
 * 1. PRODUCE: Owner produces X units → ingredients deducted via FIFO → ProductionBatch created
 * 2. SELL (POS): When sold, deduct from ProductionBatch (FIFO by producedAt) instead of ingredients
 *
 * This separates "when ingredients are consumed" from "when the product is sold".
 */

import type { TxClient } from "@/lib/services/saleHelpers";

// ==================== PRODUCTION (ingredient → product) ====================

/**
 * Check if there are enough ingredients to produce `quantity` units of a product.
 * Returns { canProduce: true, totalCost } or { canProduce: false, missing: [...] }.
 */
export async function checkProductionAvailability(
  tx: TxClient,
  productId: number,
  quantity: number,
): Promise<
  | { canProduce: true; totalCost: number }
  | { canProduce: false; missing: { ingredientName: string; needed: number; available: number; unit: string }[] }
> {
  const recipes = await tx.recipe.findMany({
    where: { productId },
    include: {
      ingredient: {
        select: {
          id: true,
          name: true,
          unit: true,
          inventoryBatches: {
            where: { remainingQty: { gt: 0 } },
            orderBy: { receivedAt: "asc" },
            select: { costPerUnit: true, remainingQty: true },
          },
        },
      },
    },
  });

  const missing: { ingredientName: string; needed: number; available: number; unit: string }[] = [];
  let totalCost = 0;

  for (const recipe of recipes) {
    const needed = Number(recipe.quantity) * quantity;
    const batches = recipe.ingredient.inventoryBatches;
    const available = batches.reduce((sum, b) => sum + Number(b.remainingQty), 0);

    if (available < needed) {
      missing.push({
        ingredientName: recipe.ingredient.name,
        needed,
        available,
        unit: recipe.ingredient.unit,
      });
    } else {
      // Calculate FIFO cost
      let remaining = needed;
      for (const batch of batches) {
        if (remaining <= 0) break;
        const take = Math.min(Number(batch.remainingQty), remaining);
        totalCost += take * Number(batch.costPerUnit);
        remaining -= take;
      }
    }
  }

  if (missing.length > 0) {
    return { canProduce: false, missing };
  }

  return { canProduce: true, totalCost };
}

// ==================== SALE DEDUCTION (productionBatch → sold) ====================

/**
 * Check how many units of a ReadyStock product are available (sum of production batch remaining).
 */
export async function getReadyStockAvailable(
  tx: TxClient,
  productId: number,
): Promise<number> {
  const result = await tx.productionBatch.aggregate({
    where: { productId, remainingQty: { gt: 0 } },
    _sum: { remainingQty: true },
  });
  return result._sum.remainingQty ?? 0;
}

/**
 * Deduct from ProductionBatch using FIFO (oldest produced first).
 * Returns the weighted average cost per unit for the deducted items.
 */
export async function deductProductionBatch(
  tx: TxClient,
  productId: number,
  quantity: number,
): Promise<{ totalCost: number; costPerUnit: number }> {
  const batches = await tx.productionBatch.findMany({
    where: { productId, remainingQty: { gt: 0 } },
    orderBy: { producedAt: "asc" }, // FIFO
  });

  let remaining = quantity;
  let totalCost = 0;

  for (const batch of batches) {
    if (remaining <= 0) break;

    const batchQty = batch.remainingQty;
    const take = Math.min(batchQty, remaining);

    await tx.productionBatch.update({
      where: { id: batch.id },
      data: { remainingQty: batchQty - take },
    });

    totalCost += take * Number(batch.costPerUnit);
    remaining -= take;
  }

  if (remaining > 0) {
    throw new Error(`Stok produksi tidak cukup. Kurang ${remaining} unit.`);
  }

  return {
    totalCost,
    costPerUnit: quantity > 0 ? totalCost / quantity : 0,
  };
}

