#!/usr/bin/env node
import fs from "fs/promises";
import path from "path";

const envPath = path.resolve(process.cwd(), ".env");
const rawEnv = await fs.readFile(envPath, "utf8").catch(() => "");

function parseEnv(content) {
  const lines = content.split(/\r?\n/);
  const res = Object.create(null);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1).replace(/\\n/g, "\n");
    }
    res[key] = val;
  }
  return res;
}

const env = parseEnv(rawEnv);
const useDirect =
  process.argv.includes("--direct") || process.env.USE_DIRECT === "true";
const chosen = useDirect
  ? env.DIRECT_URL || env.DATABASE_URL
  : env.DATABASE_URL || env.DIRECT_URL;
if (!chosen) {
  console.error("No DATABASE_URL or DIRECT_URL found in .env");
  process.exit(2);
}

process.env.DATABASE_URL = chosen;

console.log(
  "[test-db-conn] Using DATABASE_URL:",
  process.env.DATABASE_URL.replace(/:[^:@]+@/, ":****@"),
);

try {
  const { PrismaClient } = await import("@prisma/client");
  const { Pool } = await import("pg");
  const { PrismaPg } = await import("@prisma/adapter-pg");

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 20000,
  });

  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter, log: ["error"] });

  try {
    const result = await prisma.$queryRaw`SELECT 1 as ok`;
    console.log("[test-db-conn] Success:", result);
    await prisma.$disconnect();
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error("[test-db-conn] Query error:", err);
    try {
      await prisma.$disconnect();
    } catch {}
    try {
      await pool.end();
    } catch {}
    process.exit(1);
  }
} catch (err) {
  console.error("[test-db-conn] Prisma import/initialization error:", err);
  process.exit(3);
}
