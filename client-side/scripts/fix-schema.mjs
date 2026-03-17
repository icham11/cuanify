#!/usr/bin/env node
/**
 * Fix missing Sale table columns by running raw SQL
 * This script adds customer and invoice fields to the Sale table
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: false });
dotenv.config({ path: ".env", override: false });


const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DIRECT_URL or DATABASE_URL must be set");
}

const sslOptions = {
  rejectUnauthorized: false,
};

const pool = new Pool({
  connectionString,
  ssl: sslOptions,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function fixSchema() {
  try {
    console.log("🔧 Starting schema migration...\n");

    // Add customerName
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "customerName" TEXT`
    );
    console.log("✓ Added customerName column");

    // Add customerEmail
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "customerEmail" TEXT`
    );
    console.log("✓ Added customerEmail column");

    // Add customerPhone
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "customerPhone" TEXT`
    );
    console.log("✓ Added customerPhone column");

    // Add invoiceId
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "invoiceId" TEXT`
    );
    console.log("✓ Added invoiceId column");

    // Add invoiceUrl
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "invoiceUrl" TEXT`
    );
    console.log("✓ Added invoiceUrl column");

    // Add invoiceStatus
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "invoiceStatus" TEXT`
    );
    console.log("✓ Added invoiceStatus column");

    // Add createdAt to SaleItem if missing
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`
    );
    console.log("✓ Added createdAt column to SaleItem");

    console.log("\n✅ Schema migration completed successfully!");
    console.log("Database is now in sync with Prisma schema.\n");
  } catch (error) {
    console.error("❌ Migration error:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

fixSchema().catch((error) => {
  console.error("Fatal error:", error.message);
  process.exit(1);
});

