import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function readPositiveIntegerEnv(name: string, fallback: number) {
  const rawValue = process.env[name];
  if (!rawValue) return fallback;

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function createPrismaClient() {
  const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DIRECT_URL or DATABASE_URL is not set");
  }

  const maxConnections = readPositiveIntegerEnv(
    "NEON_POOL_MAX_CONNECTIONS",
    3,
  );
  const idleTimeoutMillis = readPositiveIntegerEnv(
    "NEON_POOL_IDLE_TIMEOUT_MS",
    10_000,
  );
  const connectionTimeoutMillis = readPositiveIntegerEnv(
    "NEON_POOL_CONNECTION_TIMEOUT_MS",
    15_000,
  );

  // To reduce connection overhead in serverless environments like Vercel,
  // we use Neon's serverless adapter over WebSockets.
  // Keep the pool intentionally small and release idle sockets quickly so
  // Neon can scale to zero after traffic stops.
  const adapter = new PrismaNeon({
    connectionString: databaseUrl,
    max: maxConnections,
    min: 0,
    idleTimeoutMillis,
    connectionTimeoutMillis,
    allowExitOnIdle: true,
  });

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
