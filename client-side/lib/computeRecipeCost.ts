import prisma from "@/lib/prisma";

/**
 * Recomputes and stores the `recipeCost` for a product based on current
 * weighted-average inventory batch costs. Call after recipe rows are
 * created, updated, or deleted for a product.
 */
export async function recomputeRecipeCost(productId: number): Promise<void> {
  const recipes = await prisma.recipe.findMany({
    where: { productId },
    include: {
      ingredient: {
        include: {
          // Fetch ALL batches so we can fall back to the most recent cost when stock = 0.
          inventoryBatches: {
            orderBy: { receivedAt: "desc" as const },
            select: { costPerUnit: true, remainingQty: true },
          },
        },
      },
    },
  });

  const recipeCost = recipes.reduce((sum, r) => {
    const allBatches = r.ingredient.inventoryBatches;
    const activeBatches = allBatches.filter((b) => Number(b.remainingQty) > 0);
    const currentStock = activeBatches.reduce((s, b) => s + Number(b.remainingQty), 0);
    const totalCost = activeBatches.reduce((s, b) => s + Number(b.remainingQty) * Number(b.costPerUnit), 0);
    // Fall back to most-recent batch (ordered desc → index 0) when stock is depleted
    const costPerUnit =
      currentStock > 0 ? totalCost / currentStock : allBatches[0] ? Number(allBatches[0].costPerUnit) : 0;
    return sum + Number(r.quantity) * costPerUnit;
  }, 0);

  await prisma.$executeRawUnsafe(
    `UPDATE "Product" SET "recipeCost" = $1, "updatedAt" = NOW() WHERE id = $2`,
    Math.round(recipeCost * 100) / 100,
    productId,
  );
}
