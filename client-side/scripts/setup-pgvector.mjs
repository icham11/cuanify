// Script to setup pgvector extension and BusinessDocument table
// Run: node scripts/setup-pgvector.mjs

import "dotenv/config";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local", override: false });
dotenv.config({ path: ".env", override: false });

const { Client } = pg;

async function main() {
  // Strip sslmode from URL — we configure SSL via the client object
  const rawUrl = process.env.DATABASE_URL || "";
  const cleanUrl = rawUrl.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");

  const client = new Client({
    connectionString: cleanUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log("✅ Connected to database");

  // 1. Enable pgvector extension
  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS vector;");
    console.log("✅ pgvector extension enabled");
  } catch (e) {
    console.warn("⚠️ pgvector extension may already exist or not available:", e.message);
  }

  // 2. Create BusinessDocument table
  await client.query(`
    CREATE TABLE IF NOT EXISTS "BusinessDocument" (
      "id" SERIAL PRIMARY KEY,
      "businessId" INTEGER NOT NULL,
      "content" TEXT NOT NULL,
      "embedding" vector(768),
      "sourceType" VARCHAR(50) NOT NULL,
      "sourceId" INTEGER,
      "metadata" JSONB DEFAULT '{}',
      "chunkIndex" INTEGER DEFAULT 0,
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
      
      CONSTRAINT "BusinessDocument_businessId_fkey" 
        FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE
    );
  `);
  console.log("✅ BusinessDocument table created");

  // 2b. Add contentHash column if missing (incremental sync)
  try {
    await client.query(`
      ALTER TABLE "BusinessDocument"
      ADD COLUMN IF NOT EXISTS "contentHash" VARCHAR(64);
    `);
    console.log("✅ contentHash column ensured");
  } catch (e) {
    console.warn("⚠️ contentHash column may already exist:", e.message);
  }

  // 2c. Add unique constraint for incremental sync
  // NOTE: We use COALESCE for sourceId because PostgreSQL treats NULL != NULL
  // in unique indexes, which would allow duplicate entries for chunks where sourceId IS NULL
  try {
    // Drop old index if it exists (it didn't handle NULLs properly)
    await client.query(`DROP INDEX IF EXISTS "BusinessDocument_sync_key";`);
    await client.query(`
      CREATE UNIQUE INDEX "BusinessDocument_sync_key"
        ON "BusinessDocument" ("businessId", "sourceType", COALESCE("sourceId", -1), "chunkIndex");
    `);
    console.log("✅ Unique sync key index created (with NULL-safe COALESCE)");
  } catch (e) {
    // If it fails due to existing duplicates, just create a non-unique index
    console.warn("⚠️ Unique sync key index failed (possible duplicates):", e.message);
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS "BusinessDocument_sync_key_nonuniq"
          ON "BusinessDocument" ("businessId", "sourceType", COALESCE("sourceId", -1), "chunkIndex");
      `);
      console.log("✅ Non-unique sync key index created as fallback");
    } catch { /* ignore */ }
  }

  // 2d. Add contentHash lookup index
  try {
    await client.query(`
      CREATE INDEX IF NOT EXISTS "BusinessDocument_contentHash_idx"
        ON "BusinessDocument" ("businessId", "contentHash");
    `);
    console.log("✅ contentHash index created");
  } catch (e) {
    console.warn("⚠️ contentHash index may already exist:", e.message);
  }

  // 2e. Add metadata GIN index for PDF document filename lookups
  try {
    await client.query(`
      CREATE INDEX IF NOT EXISTS "BusinessDocument_metadata_gin_idx"
        ON "BusinessDocument" USING gin ("metadata");
    `);
    console.log("✅ metadata GIN index created");
  } catch (e) {
    console.warn("⚠️ metadata GIN index may already exist:", e.message);
  }

  // 3. Create indexes
  await client.query(`
    CREATE INDEX IF NOT EXISTS "BusinessDocument_businessId_idx" 
      ON "BusinessDocument" ("businessId");
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS "BusinessDocument_sourceType_idx" 
      ON "BusinessDocument" ("sourceType");
  `);
  console.log("✅ Basic indexes created");

  // 4. Create HNSW index for fast vector search
  try {
    await client.query(`
      CREATE INDEX IF NOT EXISTS "BusinessDocument_embedding_hnsw_idx" 
        ON "BusinessDocument" 
        USING hnsw ("embedding" vector_cosine_ops)
        WITH (m = 16, ef_construction = 64);
    `);
    console.log("✅ HNSW vector index created");
  } catch (e) {
    console.warn("⚠️ HNSW index creation failed (may need more data):", e.message);
    // Fallback to IVFFlat or no index
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS "BusinessDocument_embedding_idx" 
          ON "BusinessDocument" 
          USING ivfflat ("embedding" vector_cosine_ops)
          WITH (lists = 10);
      `);
      console.log("✅ IVFFlat vector index created as fallback");
    } catch {
      console.log("ℹ️ Vector index will be created later when there's enough data");
    }
  }

  // 5. Verify
  const res = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'BusinessDocument'
    ORDER BY ordinal_position;
  `);
  console.log("\n📋 BusinessDocument columns:");
  for (const row of res.rows) {
    console.log(`   - ${row.column_name}: ${row.data_type}`);
  }

  await client.end();
  console.log("\n🎉 pgvector setup complete!");
}

main().catch((e) => {
  console.error("❌ Setup failed:", e.message);
  process.exit(1);
});

