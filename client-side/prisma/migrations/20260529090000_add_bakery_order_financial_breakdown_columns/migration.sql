ALTER TABLE bakery_orders
  ADD COLUMN IF NOT EXISTS design_adjustment_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS product_adjustment NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS non_product_adjustment NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS product_subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS product_discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_charge NUMERIC(14,2) NOT NULL DEFAULT 0;

UPDATE bakery_orders
SET
  non_product_adjustment = CASE
    WHEN COALESCE(non_product_adjustment, 0) = 0 THEN COALESCE(manual_adjustment, 0)
    ELSE non_product_adjustment
  END,
  product_subtotal = CASE
    WHEN COALESCE(product_subtotal, 0) > 0 THEN product_subtotal
    ELSE COALESCE(base_price, 0) + COALESCE(design_adjustment_total, 0) + COALESCE(add_on_total, 0) + COALESCE(product_adjustment, 0)
  END
WHERE deleted_at IS NULL;
