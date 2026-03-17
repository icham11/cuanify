import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import dotenv from "dotenv";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
dotenv.config({ path: ".env.local", override: false });
dotenv.config({ path: ".env", override: false });

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

console.log("Checking database schema...\n");

try {
  // Get all tables
  const tables = await prisma.$queryRaw`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `;

  console.log("=== TABLES IN DATABASE ===");
  for (const t of tables) {
    console.log(`  - ${t.table_name}`);
  }

  // Get columns for forecast-related tables
  const forecastTables = [
    "ProductForecast",
    "BusinessForecast",
    "ForecastAccuracy",
    "AnalyticsInsight",
    "BusinessHealthScores",
  ];

  for (const tableName of forecastTables) {
    console.log(`\n=== ${tableName} ===`);
    const columns = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${tableName}
      ORDER BY ordinal_position;
    `;

    if (columns.length === 0) {
      console.log("  (table does not exist)");
    } else {
      for (const col of columns) {
        console.log(
          `  ${col.column_name}: ${col.data_type} ${col.is_nullable === "NO" ? "NOT NULL" : ""} ${col.column_default ? `DEFAULT ${col.column_default}` : ""}`,
        );
      }
    }
  }

  // Check indexes
  console.log("\n=== INDEXES ON FORECAST TABLES ===");
  const indexes = await prisma.$queryRaw`
    SELECT indexname, tablename
    FROM pg_indexes
    WHERE schemaname = 'public' 
    AND (tablename LIKE '%Forecast%' OR tablename = 'AnalyticsInsight' OR tablename = 'BusinessHealthScores')
    ORDER BY tablename, indexname;
  `;
  for (const idx of indexes) {
    console.log(`  ${idx.tablename}: ${idx.indexname}`);
  }
} catch (error) {
  console.error("Error:", error);
} finally {
  await prisma.$disconnect();
}
