-- Add stored recipeCost column to Product for server-side sorting
ALTER TABLE "Product"
  ADD COLUMN "recipeCost" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Backfill: set recipeCost from most-recent inventory batch cost per ingredient
UPDATE "Product" p
SET "recipeCost" = COALESCE((
  SELECT ROUND(SUM(
    r.quantity::numeric * COALESCE(
      (
        SELECT ib."costPerUnit"::numeric
        FROM "InventoryBatch" ib
        WHERE ib."ingredientId" = r."ingredientId"
          AND ib."remainingQty" > 0
        ORDER BY ib."receivedAt" DESC
        LIMIT 1
      ),
      0
    )
  ))
  FROM "Recipe" r
  WHERE r."productId" = p.id
), 0);
