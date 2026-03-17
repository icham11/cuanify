import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  // Strip sslmode from connection string — we configure SSL via the Pool object
  const rawUrl = process.env.DATABASE_URL ?? "";
  const cleanUrl = rawUrl.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");

  const pool = new Pool({
    connectionString: cleanUrl,
    ssl: { rejectUnauthorized: false },  // Supabase pooler requires this
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
