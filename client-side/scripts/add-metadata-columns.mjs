import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import dotenv from "dotenv";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
dotenv.config({ path: ".env.local", override: false });
dotenv.config({ path: ".env", override: false });

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

console.log("Adding missing tables and columns...");

try {
  // Add metadata column to ProductForecast if it doesn't exist
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "ProductForecast" 
    ADD COLUMN IF NOT EXISTS "metadata" JSONB;
  `);
  console.log("✓ ProductForecast.metadata column added (or already exists)");

  // Add metadata column to BusinessForecast if it doesn't exist
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "BusinessForecast" 
    ADD COLUMN IF NOT EXISTS "metadata" JSONB;
  `);
  console.log("✓ BusinessForecast.metadata column added (or already exists)");

  // Create ForecastAccuracy table if it doesn't exist
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ForecastAccuracy" (
      "id" SERIAL PRIMARY KEY,
      "businessId" INTEGER NOT NULL UNIQUE,
      "accuracy7d" DECIMAL(5,2),
      "accuracy30d" DECIMAL(5,2),
      "mape7d" DECIMAL(5,2),
      "mape30d" DECIMAL(5,2),
      "sampleSize7d" INTEGER NOT NULL DEFAULT 0,
      "sampleSize30d" INTEGER NOT NULL DEFAULT 0,
      "lastEvaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ForecastAccuracy_businessId_fkey" FOREIGN KEY ("businessId") 
        REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);
  console.log("✓ ForecastAccuracy table created (or already exists)");

  // Create index on businessId
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ForecastAccuracy_businessId_idx" ON "ForecastAccuracy"("businessId");
  `);
  console.log("✓ ForecastAccuracy index created (or already exists)");

  console.log("\n✅ Done! Now regenerate Prisma Client:");
  console.log("   npx prisma generate");
} catch (error) {
  console.error("Error:", error);
} finally {
  await prisma.$disconnect();
}
