-- ============================================================
-- Migration: soft_delete_and_movement_snapshots
-- 1. Product.deletedAt  — soft-delete flag (null = active)
-- 2. InventoryMovement snapshot columns for ingredient name/unit
-- 3. InventoryMovement.ingredientId → nullable + SET NULL on delete
--    so audit rows survive when an ingredient is deleted
-- ============================================================

-- 1. Product soft-delete
ALTER TABLE "Product" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "Product_businessId_deletedAt_idx" ON "Product"("businessId", "deletedAt");

-- 2. InventoryMovement snapshot columns
ALTER TABLE "InventoryMovement" ADD COLUMN "ingredientNameSnapshot" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN "ingredientUnitSnapshot" TEXT;

-- 3. Make ingredientId nullable and switch to SET NULL on delete
--    Drop old NOT NULL constraint
ALTER TABLE "InventoryMovement" ALTER COLUMN "ingredientId" DROP NOT NULL;

--    Drop old FK (Cascade) and recreate with SET NULL
ALTER TABLE "InventoryMovement" DROP CONSTRAINT IF EXISTS "InventoryMovement_ingredientId_fkey";
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_ingredientId_fkey"
  FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
