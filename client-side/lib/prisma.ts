import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

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

  const maxConnections = readPositiveIntegerEnv("DB_POOL_MAX_CONNECTIONS", 3);
  const idleTimeoutMillis = readPositiveIntegerEnv(
    "DB_POOL_IDLE_TIMEOUT_MS",
    10_000,
  );
  const connectionTimeoutMillis = readPositiveIntegerEnv(
    "DB_POOL_CONNECTION_TIMEOUT_MS",
    15_000,
  );

  // Supabase is reached over plain TCP with node-postgres. Its pooler presents a
  // certificate signed by Supabase's own CA, which is not in Node's trust store,
  // so verification is disabled while the connection stays TLS-encrypted.
  // Keep the pool intentionally small and release idle sockets quickly so
  // serverless instances do not hold connections open after traffic stops.
  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    max: maxConnections,
    min: 0,
    idleTimeoutMillis,
    connectionTimeoutMillis,
    allowExitOnIdle: true,
    ssl: { rejectUnauthorized: false },
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
