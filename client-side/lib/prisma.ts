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
  const isProduction = process.env.NODE_ENV === "production";
  const poolMax = Number(process.env.PGPOOL_MAX ?? (isProduction ? 10 : 15));
  const connectionTimeoutMillis = Number(
    process.env.PGPOOL_CONNECTION_TIMEOUT_MS ?? 15000,
  );
  const idleTimeoutMillis = Number(
    process.env.PGPOOL_IDLE_TIMEOUT_MS ?? 10000,
  );

  const pool = new Pool({
    connectionString: cleanUrl,
    ssl: { rejectUnauthorized: false },  // Supabase pooler requires this
    max: poolMax,                        // Avoid pool starvation during concurrent API calls
    min: 0,                              // Jangan menahan idle connection
    idleTimeoutMillis,                   // Tutup koneksi yang idle dalam 10 detik
    connectionTimeoutMillis,             // Tunggu koneksi lebih lama saat startup / burst traffic
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
