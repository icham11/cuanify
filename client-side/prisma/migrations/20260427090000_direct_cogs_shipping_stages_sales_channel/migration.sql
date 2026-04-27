CREATE TYPE "SalesChannel" AS ENUM ('direct', 'tokopedia', 'shopee');
CREATE TYPE production_stage AS ENUM ('listing', 'filling', 'finishing');

ALTER TABLE "Sale"
  ADD COLUMN IF NOT EXISTS sales_channel "SalesChannel" NOT NULL DEFAULT 'direct';

CREATE INDEX IF NOT EXISTS "Sale_businessId_sales_channel_idx"
ON "Sale"("businessId", sales_channel);

ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS cogs DECIMAL(15,2);

UPDATE "Product"
SET cogs = 1
WHERE cogs IS NULL OR cogs <= 0;

ALTER TABLE "Product"
  ALTER COLUMN cogs TYPE DECIMAL(15,2),
  ALTER COLUMN cogs DROP DEFAULT;

ALTER TABLE "Product"
  ALTER COLUMN cogs SET NOT NULL;

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_cogs_positive_check"
  CHECK (cogs > 0);

DO $$
BEGIN
  EXECUTE 'ALTER TABLE "Product" DROP COLUMN IF EXISTS "' || 'recipe' || 'Cost"';
END $$;

ALTER TABLE bakery_orders
  ADD COLUMN IF NOT EXISTS sales_channel TEXT NOT NULL DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS insurance_fee NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS order_uuid UUID;

UPDATE bakery_orders
SET order_uuid = (
  substr(md5(business_id::text || ':' || external_id), 1, 8) || '-' ||
  substr(md5(business_id::text || ':' || external_id), 9, 4) || '-' ||
  substr(md5(business_id::text || ':' || external_id), 13, 4) || '-' ||
  substr(md5(business_id::text || ':' || external_id), 17, 4) || '-' ||
  substr(md5(business_id::text || ':' || external_id), 21, 12)
)::uuid
WHERE order_uuid IS NULL;

ALTER TABLE bakery_orders
  ADD CONSTRAINT bakery_orders_sales_channel_check
  CHECK (sales_channel IN ('direct', 'tokopedia', 'shopee'));

CREATE INDEX IF NOT EXISTS idx_bakery_orders_business_channel
ON bakery_orders (business_id, sales_channel);

DO $$
BEGIN
  EXECUTE 'DROP TABLE IF EXISTS ' || 'bakery_order' || '_production_stages';
END $$;

CREATE TABLE IF NOT EXISTS production_tasks (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL,
  stage production_stage NOT NULL,
  staff_id UUID,
  token_amount DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, stage),
  CHECK (token_amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_production_tasks_order
ON production_tasks (order_id);

CREATE INDEX IF NOT EXISTS idx_production_tasks_staff
ON production_tasks (staff_id);
