import "dotenv/config";
import { defineConfig } from "prisma/config";

function normalizeSupabaseDatabaseUrl(rawUrl: string | undefined) {
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

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url:
      normalizeSupabaseDatabaseUrl(process.env.DIRECT_URL) ||
      normalizeSupabaseDatabaseUrl(process.env.DATABASE_URL) ||
      "postgresql://postgres:postgres@127.0.0.1:5432/postgres?schema=public",
  },
});
