import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  pgPool: Pool | undefined;
  prisma: PrismaClient | undefined;
};

function normalizeSupabaseDatabaseUrl(rawUrl: string) {
  if (!rawUrl) return rawUrl;

  try {
    const parsed = new URL(rawUrl);
    const isSupabaseHost = parsed.hostname.endsWith(".supabase.com");
    const usesLegacyDatabaseName = parsed.pathname === "/umkm-helper";

    if (isSupabaseHost && usesLegacyDatabaseName) {
      parsed.pathname = "/postgres";
      return parsed.toString();
    }
  } catch {
    return rawUrl;
  }

  return rawUrl;
}

function isSupabaseSessionPoolerUrl(rawUrl: string): boolean {
  if (!rawUrl) return false;

  try {
    const parsed = new URL(rawUrl);
    return (
      parsed.hostname.endsWith(".pooler.supabase.com") &&
      (parsed.port === "" || parsed.port === "5432")
    );
  } catch {
    return false;
  }
}

function isSupabasePoolerUrl(rawUrl: string): boolean {
  if (!rawUrl) return false;

  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname.endsWith(".pooler.supabase.com");
  } catch {
    return false;
  }
}

function isSupabaseDirectUrl(rawUrl: string): boolean {
  if (!rawUrl) return false;

  try {
    const parsed = new URL(rawUrl);
    return (
      parsed.hostname.endsWith(".supabase.co") &&
      !parsed.hostname.endsWith(".pooler.supabase.com")
    );
  } catch {
    return false;
  }
}

function resolveDatabaseUrl() {
  const databaseUrl = normalizeSupabaseDatabaseUrl(
    process.env.DATABASE_URL ?? "",
  );
  const directUrl = normalizeSupabaseDatabaseUrl(process.env.DIRECT_URL ?? "");
  const forceDirectRuntime = process.env.PRISMA_RUNTIME_USE_DIRECT_URL === "true";

  if (forceDirectRuntime && directUrl && !isSupabasePoolerUrl(directUrl)) {
    return directUrl;
  }

  if (databaseUrl) {
    return databaseUrl;
  }

  if (directUrl && !isSupabasePoolerUrl(directUrl)) {
    return directUrl;
  }

  return directUrl;
}

function createPrismaClient() {
  const rawUrl = resolveDatabaseUrl();
  const cleanUrl = rawUrl.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
  try {
    const parsed = new URL(cleanUrl);
    const host = parsed.hostname || cleanUrl;
    const info = `host=${host}`;
    // Log which DB URL form we're using to aid debugging timeouts
    // eslint-disable-next-line no-console
    console.log(`[Prisma] Resolved DB -> ${info}`);
  } catch (e) {
    // ignore logging failures
  }
  const isProduction = process.env.NODE_ENV === "production";
  const isDevelopment = process.env.NODE_ENV !== "production";

  const isSupabaseSessionPooler = isSupabaseSessionPoolerUrl(cleanUrl);
  const usesSupabasePooler = isSupabasePoolerUrl(cleanUrl);
  const usesSupabaseDirect = isSupabaseDirectUrl(cleanUrl);

  function parsePositiveInteger(value: string | undefined, fallback: number) {
    if (!value) return fallback;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
  }

  // Supabase session mode on port 5432 has a very small hard client cap.
  // In Next.js, multiple route workers can exist at once, so even a modest
  // per-process pool quickly exhausts that limit. Force a single DB session
  // per runtime process for this transport and let requests queue instead.
  // More tolerant defaults in development to reduce transient timeouts.
  const defaultPoolMax = isSupabaseSessionPooler
    ? 1
    : isDevelopment
      ? 10
      : usesSupabasePooler
        ? 2
        : usesSupabaseDirect
          ? 2
        : isProduction
          ? 10
          : 5;
  const requestedPoolMax = parsePositiveInteger(
    process.env.PGPOOL_MAX,
    defaultPoolMax,
  );
  const poolMax = isSupabaseSessionPooler
    ? 1
    : requestedPoolMax;
  const connectionTimeoutMillis = Number(
    process.env.PGPOOL_CONNECTION_TIMEOUT_MS ??
      (isDevelopment ? 30000 : usesSupabasePooler ? 5000 : 10000),
  );
  const idleTimeoutMillis = Number(
    process.env.PGPOOL_IDLE_TIMEOUT_MS ??
      (isDevelopment ? 30000 : isSupabaseSessionPooler ? 5000 : 10000),
  );

  const pool =
    globalForPrisma.pgPool ??
    new Pool({
      connectionString: cleanUrl,
      ssl: { rejectUnauthorized: false },
      max: poolMax,
      min: 0,
      idleTimeoutMillis,
      connectionTimeoutMillis,
      allowExitOnIdle: true,
    });

  globalForPrisma.pgPool = pool;

  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

globalForPrisma.prisma = prisma;

export default prisma;
