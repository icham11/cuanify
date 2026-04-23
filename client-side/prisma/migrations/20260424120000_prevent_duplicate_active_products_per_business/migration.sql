CREATE UNIQUE INDEX IF NOT EXISTS "Product_businessId_normalized_name_active_key"
ON "Product" (
  "businessId",
  LOWER(REGEXP_REPLACE(BTRIM(name), E'\\s+', ' ', 'g'))
)
WHERE "deletedAt" IS NULL;
