-- Add direct product COGS column. Active COGS is entered per product,
-- not computed from ingredients.
ALTER TABLE "Product"
  ADD COLUMN "cogs" DECIMAL(15,2) NOT NULL;
