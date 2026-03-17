import prisma from "@/lib/prisma";

// Transaction client type
export type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Generate unique transaction number */
export function generateTransactionNumber(): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `TRX-${timestamp}-${random}`;
}

/**
 * Calculate recipe cost for a product based on FIFO inventory batches.
 * Returns total cost for the given quantity.
 */
export async function calculateProductCost(tx: TxClient, productId: number, quantity: number): Promise<number> {
  const recipes = await tx.recipe.findMany({
    where: { productId },
    include: {
      ingredient: {
        select: {
          id: true,
          inventoryBatches: {
            where: { remainingQty: { gt: 0 } },
            orderBy: { receivedAt: "asc" }, // FIFO
            select: { costPerUnit: true, remainingQty: true },
          },
        },
      },
    },
  });

  let totalCost = 0;

  for (const recipe of recipes) {
    const batches = recipe.ingredient.inventoryBatches;
    if (batches.length === 0) continue;

    // Calculate weighted average cost
    const totalQty = batches.reduce((sum, b) => sum + Number(b.remainingQty), 0);
    const totalValue = batches.reduce((sum, b) => sum + Number(b.remainingQty) * Number(b.costPerUnit), 0);
    const avgCost = totalQty > 0 ? totalValue / totalQty : 0;

    // Cost for this recipe item
    totalCost += Number(recipe.quantity) * avgCost * quantity;
  }

  return totalCost;
}

/**
 * Deduct ingredients from inventory using FIFO method.
 * Creates InventoryMovement records for full audit trail.
 */
export async function deductInventory(
  tx: TxClient,
  productId: number,
  quantity: number,
  stockDocumentId: number,
): Promise<void> {
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
            orderBy: { receivedAt: "asc" }, // FIFO
          },
        },
      },
    },
  });

  for (const recipe of recipes) {
    let remainingToDeduct = Number(recipe.quantity) * quantity;
    const batches = recipe.ingredient.inventoryBatches;

    for (const batch of batches) {
      if (remainingToDeduct <= 0) break;

      const batchQty = Number(batch.remainingQty);
      const deduction = Math.min(batchQty, remainingToDeduct);

      await tx.inventoryBatch.update({
        where: { id: batch.id },
        data: { remainingQty: batchQty - deduction },
      });

      await tx.inventoryMovement.create({
        data: {
          ingredientId: recipe.ingredient.id,
          ingredientNameSnapshot: recipe.ingredient.name,
          ingredientUnitSnapshot: recipe.ingredient.unit,
          stockDocumentId,
          quantity: deduction,
          costPerUnit: batch.costPerUnit,
          type: "Out",
        },
      });

      remainingToDeduct -= deduction;
    }

    // 🔥 Safety check
    if (remainingToDeduct > 0) {
      throw new Error("Insufficient stock");
    }
  }
}

/**
 * Update (upsert) daily BusinessMetrics after a sale.
 */
export async function updateBusinessMetrics(tx: TxClient, businessId: number, revenue: number, cost: number) {
  const today = new Date();
  const dateOnly = new Date(today.toISOString().split("T")[0]);

  const existing = await tx.businessMetrics.findUnique({
    where: {
      businessId_date: { businessId, date: dateOnly },
    },
  });

  if (existing) {
    const newRevenue = Number(existing.totalRevenue) + revenue;
    const newCost = Number(existing.totalCost) + cost;
    const newProfit = newRevenue - newCost;
    const newMargin = newRevenue > 0 ? (newProfit / newRevenue) * 100 : 0;

    await tx.businessMetrics.update({
      where: { businessId_date: { businessId, date: dateOnly } },
      data: {
        totalRevenue: newRevenue,
        totalCost: newCost,
        totalProfit: newProfit,
        marginAvg: newMargin,
      },
    });
  } else {
    const profit = revenue - cost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

    await tx.businessMetrics.create({
      data: {
        businessId,
        date: dateOnly,
        totalRevenue: revenue,
        totalCost: cost,
        totalProfit: profit,
        marginAvg: margin,
        growthRate: 0,
      },
    });
  }
}

/**
 * Update (upsert) daily ProductMetrics after a sale.
 */
export async function updateProductMetrics(
  tx: TxClient,
  productId: number,
  quantity: number,
  revenue: number,
  cost: number,
) {
  const today = new Date();
  const dateOnly = new Date(today.toISOString().split("T")[0]);

  const existing = await tx.productMetrics.findUnique({
    where: {
      productId_date: { productId, date: dateOnly },
    },
  });

  if (existing) {
    const newQty = existing.quantitySold + quantity;
    const newRevenue = Number(existing.revenue) + revenue;
    const newCost = Number(existing.cost) + cost;
    const newProfit = newRevenue - newCost;

    await tx.productMetrics.update({
      where: { productId_date: { productId, date: dateOnly } },
      data: {
        quantitySold: newQty,
        revenue: newRevenue,
        cost: newCost,
        profit: newProfit,
      },
    });
  } else {
    await tx.productMetrics.create({
      data: {
        productId,
        date: dateOnly,
        quantitySold: quantity,
        revenue,
        cost,
        profit: revenue - cost,
      },
    });
  }
}

/**
 * Recompute and persist the recipeCost on a Product row.
 * Uses current weighted-average batch costs.
 * Uses raw SQL to avoid stale Prisma client type issues.
 */
export async function recomputeRecipeCost(tx: TxClient, productId: number): Promise<void> {
  const recipes = await tx.recipe.findMany({
    where: { productId },
    include: {
      ingredient: {
        select: {
          inventoryBatches: {
            where: { remainingQty: { gt: 0 } },
            select: { costPerUnit: true, remainingQty: true },
          },
        },
      },
    },
  });

  let recipeCost = 0;

  for (const recipe of recipes) {
    const batches = recipe.ingredient.inventoryBatches;
    const totalQty = batches.reduce((sum, b) => sum + Number(b.remainingQty), 0);
    const totalValue = batches.reduce((sum, b) => sum + Number(b.remainingQty) * Number(b.costPerUnit), 0);
    const avgCost = totalQty > 0 ? totalValue / totalQty : batches[0] ? Number(batches[0].costPerUnit) : 0;
    recipeCost += Number(recipe.quantity) * avgCost;
  }

  const rounded = Math.round(recipeCost * 100) / 100;

  await tx.$executeRawUnsafe(
    `UPDATE "Product" SET "recipeCost" = $1, "updatedAt" = NOW() WHERE id = $2`,
    rounded,
    productId,
  );
}
