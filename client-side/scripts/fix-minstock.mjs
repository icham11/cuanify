#!/usr/bin/env node
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import dotenv from "dotenv";

import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../.env");
dotenv.config({ path: envPath, override: true });

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DIRECT_URL or DATABASE_URL must be set");
}

const sslOptions = { rejectUnauthorized: false };
const pool = new Pool({ connectionString, ssl: sslOptions });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function fixMinStock() {
  const updated = await prisma.ingredient.updateMany({
    where: { minStock: -1 },
    data: { minStock: 0 },
  });
  console.log(`Updated ${updated.count} ingredients from minStock -1 to 0.`);
}

fixMinStock().then(() => prisma.$disconnect());
