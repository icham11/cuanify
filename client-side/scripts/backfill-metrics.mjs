/**
 * Backfill BusinessMetrics from existing Sale data.
 *
 * Run once when BusinessMetrics is empty or out-of-sync (e.g. after seeding):
 *   node scripts/backfill-metrics.mjs
 *
 * - Looks back LOOKBACK_DAYS days from today
 * - Only counts Paid sales
 * - Upserts (does not duplicate) — safe to re-run
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import dotenv from "dotenv";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
dotenv.config({ path: ".env.local", override: false });
dotenv.config({ path: ".env", override: false });

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error("DIRECT_URL or DATABASE_URL env variable is required");

const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const LOOKBACK_DAYS = 95; // Go back further to be safe

async function main() {
  console.log(`🔄 Backfilling BusinessMetrics — last ${LOOKBACK_DAYS} days of Paid sales...\n`);

  const businesses = await prisma.business.findMany({ select: { id: true, name: true } });
  console.log(`Found ${businesses.length} business(es)\n`);

  const now = new Date();
  const since = new Date(now);
  since.setDate(since.getDate() - LOOKBACK_DAYS);
  since.setHours(0, 0, 0, 0);

  let totalUpserted = 0;

  for (const biz of businesses) {
    const sales = await prisma.sale.findMany({
      where: {
        businessId: biz.id,
        paymentStatus: "Paid",
        createdAt: { gte: since },
      },
      select: {
        totalRevenue: true,
        totalCost: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    if (sales.length === 0) {
      console.log(`  Business ${biz.id} (${biz.name}): no paid sales in range — skipped`);
      continue;
    }

    // Group by local date string (YYYY-MM-DD)
    /** @type {Map<string, { revenue: number; cost: number }>} */
    const byDate = new Map();
    for (const sale of sales) {
      // Use UTC date to match @db.Date storage behaviour in Prisma
      const dateKey = sale.createdAt.toISOString().split("T")[0];
      const existing = byDate.get(dateKey) ?? { revenue: 0, cost: 0 };
      existing.revenue += Number(sale.totalRevenue);
      existing.cost += Number(sale.totalCost);
      byDate.set(dateKey, existing);
    }

    // Compute growthRate per day (requires ordered data)
    const sortedKeys = [...byDate.keys()].sort();
    let prevRevenue = 0;

    let dayCount = 0;
    for (const dateStr of sortedKeys) {
      const { revenue, cost } = byDate.get(dateStr);
      const date = new Date(dateStr + "T00:00:00.000Z");
      const profit = revenue - cost;
      const marginAvg = revenue > 0 ? (profit / revenue) * 100 : 0;
      const growthRate = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0;

      await prisma.businessMetrics.upsert({
        where: { businessId_date: { businessId: biz.id, date } },
        update: {
          totalRevenue: revenue,
          totalCost: cost,
          totalProfit: profit,
          marginAvg: Number(marginAvg.toFixed(4)),
          growthRate: Number(growthRate.toFixed(4)),
        },
        create: {
          businessId: biz.id,
          date,
          totalRevenue: revenue,
          totalCost: cost,
          totalProfit: profit,
          marginAvg: Number(marginAvg.toFixed(4)),
          growthRate: Number(growthRate.toFixed(4)),
        },
      });

      prevRevenue = revenue;
      dayCount++;
    }

    totalUpserted += dayCount;
    console.log(`  ✓ Business ${biz.id} (${biz.name}): ${dayCount} day(s) upserted`);
  }

  console.log(`\n✅ Done — ${totalUpserted} BusinessMetrics row(s) upserted across ${businesses.length} business(es).`);

  await prisma.$disconnect();
  await pool.end();
}

main().catch((err) => {
  console.error("❌ Backfill failed:", err);
  process.exit(1);
});
