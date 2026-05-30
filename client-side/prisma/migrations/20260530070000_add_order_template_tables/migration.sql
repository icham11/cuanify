CREATE TABLE IF NOT EXISTS "OrderTemplate" (
  "id" SERIAL PRIMARY KEY,
  "businessId" INTEGER NOT NULL REFERENCES "Business"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "typeKey" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "OrderTemplateField" (
  "id" SERIAL PRIMARY KEY,
  "templateId" INTEGER NOT NULL REFERENCES "OrderTemplate"("id") ON DELETE CASCADE,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "isRequired" BOOLEAN NOT NULL DEFAULT false,
  "displayOrder" INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS "OrderTemplate_businessId_idx"
ON "OrderTemplate" ("businessId");

CREATE UNIQUE INDEX IF NOT EXISTS "OrderTemplate_businessId_typeKey_key"
ON "OrderTemplate" ("businessId", "typeKey");

CREATE INDEX IF NOT EXISTS "OrderTemplateField_templateId_idx"
ON "OrderTemplateField" ("templateId");
