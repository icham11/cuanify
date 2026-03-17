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

// Replicate EXACT logic from updated insight gather (UTC-based)
const now = new Date();
const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
const fromUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29, 0, 0, 0, 0));

console.log("Date range (UTC-based):");
console.log("  From:", fromUTC.toISOString());
console.log("  To:", todayUTC.toISOString());

const metrics = await prisma.businessMetrics.findMany({
  where: { businessId: 11, date: { gte: fromUTC, lte: todayUTC } },
  orderBy: { date: "asc" },
});

console.log("  BusinessMetrics rows:", metrics.length);

// Zero-fill: build contiguous day array
const cursor = new Date(fromUTC);
const end = new Date(todayUTC);
end.setUTCHours(0, 0, 0, 0);
let dayCount = 0;
let total = 0;

while (cursor <= end) {
  const iso = cursor.toISOString().split("T")[0];
  const found = metrics.find((m) => m.date.toISOString().split("T")[0] === iso);
  const rev = Number(found?.totalRevenue ?? 0);
  if (!found) {
    console.log(`  ${iso}: (zero-fill)`);
  }
  total += rev;
  dayCount++;
  cursor.setUTCDate(cursor.getUTCDate() + 1);
}

const avg = dayCount > 0 ? Math.round(total / dayCount) : 0;

console.log("\nResult (UTC-based, matching insight gather logic):");
console.log("  Days:", dayCount);
console.log("  Total:", total.toLocaleString("id-ID"));
console.log("  Average:", avg.toLocaleString("id-ID"));
console.log("  (KPI card should show this)");

await prisma.$disconnect();
