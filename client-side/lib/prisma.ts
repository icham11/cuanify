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
    max: 3,                              // Serverless environment = max 3-5
    min: 0,                              // Jangan menahan idle connection
    idleTimeoutMillis: 10000,            // Tutup koneksi yang idle dalam 10 detik
    connectionTimeoutMillis: 5000,       // Timeout jika pool penuh dalam 5 detik
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
