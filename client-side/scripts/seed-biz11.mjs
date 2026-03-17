/**
 * Seed script for Business #11 "Kambing Guling"
 *
 * Seeds: StockDocument (Purchase / Sale / Waste),
 *        InventoryMovement, InventoryBatch, Sale, SaleItem
 *
 * Idempotent — re-running deletes previous seed data first.
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
if (!connectionString) throw new Error("DIRECT_URL or DATABASE_URL required");

const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/* ═══════════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════════ */

const BIZ = 11;
const SEED_TAG = "[SEED]";
const TXN_PREFIX = "KG-SEED";
const DAYS = 30;

// 30 days ending yesterday (Feb 22) → starts Jan 24 2026
const TODAY = new Date("2026-02-23T00:00:00.000Z");
const START = new Date(TODAY);
START.setDate(TODAY.getDate() - DAYS);

// IDs of batches that existed before seeding
const ORIGINAL_BATCH_IDS = [271, 272, 273, 274, 275, 276, 277];

/* ─── Product / Ingredient / Recipe maps (from DB) ──────────────────── */

const PRODUCTS = {
  187: { name: "Kambing Guling", price: 200000, cost: 141500 },
  188: { name: "Kambing Guling Premium", price: 275000, cost: 145500 },
};
const PRODUCT_IDS = [187, 188];

const INGREDIENTS = {
  257: { name: "Daging Kambing", unit: "kg" },
  258: { name: "Bumbu Guling", unit: "gram" },
  259: { name: "Minyak Goreng", unit: "liter" },
  260: { name: "Garam", unit: "gram" },
  261: { name: "Lada", unit: "gram" },
  262: { name: "Daun Salam", unit: "lembar" },
  263: { name: "Serai", unit: "pcs" },
};

const RECIPES = {
  187: [
    { ingredientId: 257, qty: 1 },
    { ingredientId: 258, qty: 200 },
    { ingredientId: 259, qty: 0.5 },
    { ingredientId: 260, qty: 50 },
    { ingredientId: 261, qty: 20 },
  ],
  188: [
    { ingredientId: 257, qty: 1 },
    { ingredientId: 258, qty: 200 },
    { ingredientId: 259, qty: 0.5 },
    { ingredientId: 260, qty: 50 },
    { ingredientId: 261, qty: 50 },
    { ingredientId: 262, qty: 5 },
    { ingredientId: 263, qty: 3 },
  ],
};

/* ─── Original batch state (pre-seed) ──────────────────────────────── */

const ORIGINAL_BATCHES = [
  { id: 271, ingredientId: 257, remainingQty: 20, costPerUnit: 120000 },
  { id: 272, ingredientId: 258, remainingQty: 2000, costPerUnit: 50 },
  { id: 273, ingredientId: 259, remainingQty: 10, costPerUnit: 20000 },
  { id: 274, ingredientId: 260, remainingQty: 500, costPerUnit: 10 },
  { id: 275, ingredientId: 261, remainingQty: 500, costPerUnit: 50 },
  { id: 276, ingredientId: 262, remainingQty: 50, costPerUnit: 200 },
  { id: 277, ingredientId: 263, remainingQty: 300, costPerUnit: 500 },
];

/* ─── Purchase schedule (day offset → restock) ─────────────────────── */

const PURCHASES = [
  {
    day: 0,
    notes: `${SEED_TAG} Restock awal periode`,
    items: [
      { id: 257, qty: 15, cost: 118000, expDays: 7 },
      { id: 258, qty: 5000, cost: 48, expDays: 30 },
      { id: 259, qty: 8, cost: 19500, expDays: 180 },
      { id: 260, qty: 2000, cost: 10, expDays: 365 },
      { id: 261, qty: 800, cost: 48, expDays: 365 },
      { id: 262, qty: 80, cost: 190, expDays: 10 },
      { id: 263, qty: 50, cost: 480, expDays: 14 },
    ],
  },
  {
    day: 7,
    notes: `${SEED_TAG} Restock mingguan #1`,
    items: [
      { id: 257, qty: 10, cost: 122000, expDays: 7 },
      { id: 258, qty: 3000, cost: 52, expDays: 30 },
      { id: 262, qty: 50, cost: 200, expDays: 10 },
      { id: 263, qty: 30, cost: 500, expDays: 14 },
    ],
  },
  {
    day: 14,
    notes: `${SEED_TAG} Restock mingguan #2`,
    items: [
      { id: 257, qty: 10, cost: 125000, expDays: 7 },
      { id: 258, qty: 3000, cost: 50, expDays: 30 },
      { id: 259, qty: 5, cost: 20500, expDays: 180 },
      { id: 260, qty: 1000, cost: 10, expDays: 365 },
      { id: 261, qty: 500, cost: 50, expDays: 365 },
      { id: 262, qty: 50, cost: 200, expDays: 10 },
      { id: 263, qty: 30, cost: 500, expDays: 14 },
    ],
  },
  {
    day: 21,
    notes: `${SEED_TAG} Restock mingguan #3`,
    items: [
      { id: 257, qty: 10, cost: 121000, expDays: 7 },
      { id: 258, qty: 3000, cost: 50, expDays: 30 },
      { id: 259, qty: 5, cost: 21000, expDays: 180 },
      { id: 260, qty: 500, cost: 12, expDays: 365 },
      { id: 261, qty: 300, cost: 52, expDays: 365 },
      { id: 262, qty: 40, cost: 210, expDays: 10 },
      { id: 263, qty: 30, cost: 520, expDays: 14 },
    ],
  },
  {
    day: 27,
    notes: `${SEED_TAG} Restock akhir periode`,
    items: [
      { id: 257, qty: 10, cost: 123000, expDays: 7 },
      { id: 258, qty: 2000, cost: 50, expDays: 30 },
      { id: 260, qty: 500, cost: 12, expDays: 365 },
      { id: 261, qty: 300, cost: 52, expDays: 365 },
    ],
  },
];

/* ─── Waste schedule ───────────────────────────────────────────────── */

const WASTES = [
  { day: 3, notes: `${SEED_TAG} Daging kambing basi`, items: [{ id: 257, qty: 1 }] },
  { day: 9, notes: `${SEED_TAG} Daun salam layu`, items: [{ id: 262, qty: 10 }] },
  { day: 15, notes: `${SEED_TAG} Daging kambing tak layak`, items: [{ id: 257, qty: 0.5 }] },
  { day: 20, notes: `${SEED_TAG} Serai busuk`, items: [{ id: 263, qty: 5 }] },
  { day: 26, notes: `${SEED_TAG} Minyak goreng bocor`, items: [{ id: 259, qty: 0.5 }] },
];

/* ─── Payment methods (weighted toward Cash) ───────────────────────── */

const PAYMENT_METHODS = ["Cash", "QRIS", "Transfer", "Cash", "Digital"];

/* ═══════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════ */

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pick(seed, arr) {
  return arr[hashSeed(seed) % arr.length];
}

function between(seed, min, max) {
  return min + (hashSeed(seed) % (max - min + 1));
}

function dateAt(dayOffset, hour = 10) {
  const d = new Date(START);
  d.setDate(d.getDate() + dayOffset);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

function txn(dayOffset, idx) {
  const d = dateAt(dayOffset).toISOString().slice(0, 10).replace(/-/g, "");
  return `${TXN_PREFIX}-${d}-${String(idx).padStart(3, "0")}`;
}

/* ═══════════════════════════════════════════════════════════════════════
   FIFO INVENTORY TRACKER
   ═══════════════════════════════════════════════════════════════════════ */

class FifoTracker {
  constructor() {
    /** @type {Record<number, {batchId:number, remaining:number, costPerUnit:number}[]>} */
    this.stock = {};
  }

  addBatch(ingredientId, batchId, qty, costPerUnit) {
    if (!this.stock[ingredientId]) this.stock[ingredientId] = [];
    this.stock[ingredientId].push({ batchId, remaining: qty, costPerUnit });
  }

  /** Consume qty from oldest batches (FIFO). Returns effective costPerUnit. */
  consume(ingredientId, qty) {
    const batches = this.stock[ingredientId] || [];
    let left = qty;
    let totalCost = 0;

    for (const b of batches) {
      if (left <= 0.0001) break;
      const take = Math.min(b.remaining, left);
      b.remaining = +(b.remaining - take).toFixed(6);
      left = +(left - take).toFixed(6);
      totalCost += take * b.costPerUnit;
    }

    if (left > 0.001) {
      const ing = INGREDIENTS[ingredientId];
      console.warn(`  ⚠ Stock short for ${ing.name}: needed ${qty} ${ing.unit}, short by ${left.toFixed(3)}`);
    }
    return qty > 0 ? totalCost / qty : 0;
  }

  /** Cost of the oldest batch with remaining stock. */
  costPerUnit(ingredientId) {
    for (const b of this.stock[ingredientId] || []) {
      if (b.remaining > 0) return b.costPerUnit;
    }
    return 0;
  }

  totalRemaining(ingredientId) {
    return (this.stock[ingredientId] || []).reduce((s, b) => s + b.remaining, 0);
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════════════════════════════════ */

async function main() {
  console.log("🧹 Cleaning up previous seed data …");

  // 1. Delete seeded sales (cascades → SaleItems, Debt)
  const { count: delSales } = await prisma.sale.deleteMany({
    where: { businessId: BIZ, transactionNumber: { startsWith: TXN_PREFIX } },
  });
  console.log(`   Sales deleted: ${delSales}`);

  // 2. Delete seeded stock documents (cascades → InventoryMovements)
  const { count: delDocs } = await prisma.stockDocument.deleteMany({
    where: { businessId: BIZ, notes: { contains: SEED_TAG } },
  });
  console.log(`   StockDocuments deleted: ${delDocs}`);

  // 3. Delete seed-created inventory batches (keep originals)
  const { count: delBatch } = await prisma.inventoryBatch.deleteMany({
    where: {
      ingredient: { businessId: BIZ },
      id: { notIn: ORIGINAL_BATCH_IDS },
    },
  });
  console.log(`   Seed batches deleted: ${delBatch}`);

  // 4. Reset original batches to pre-seed state & backdate receivedAt
  const preDate = new Date("2026-01-23T06:00:00.000Z");
  for (const ob of ORIGINAL_BATCHES) {
    await prisma.inventoryBatch.update({
      where: { id: ob.id },
      data: { remainingQty: ob.remainingQty, receivedAt: preDate },
    });
  }
  console.log(`   Reset ${ORIGINAL_BATCHES.length} original batches`);

  /* ─── Initialise FIFO tracker with existing batches ─────────────── */

  const fifo = new FifoTracker();
  for (const ob of ORIGINAL_BATCHES) {
    fifo.addBatch(ob.ingredientId, ob.id, ob.remainingQty, ob.costPerUnit);
  }

  /* ─── Index events by day ───────────────────────────────────────── */

  const purchaseByDay = Object.fromEntries(PURCHASES.map((p) => [p.day, p]));
  const wasteByDay = Object.fromEntries(WASTES.map((w) => [w.day, w]));

  let stats = { purchases: 0, wastes: 0, sales: 0, movements: 0, batches: 0 };

  console.log(
    `\n📦 Seeding ${DAYS} days (${START.toISOString().slice(0, 10)} → ${dateAt(DAYS - 1)
      .toISOString()
      .slice(0, 10)}) …\n`,
  );

  /* ─── Day-by-day loop ───────────────────────────────────────────── */

  for (let day = 0; day < DAYS; day++) {
    /* ── PURCHASES ────────────────────────────────────────────────── */
    if (purchaseByDay[day]) {
      const p = purchaseByDay[day];
      const ts = dateAt(day, 6);

      const doc = await prisma.stockDocument.create({
        data: {
          businessId: BIZ,
          type: "Purchase",
          notes: p.notes,
          createdAt: ts,
          updatedAt: ts,
        },
      });
      stats.purchases++;

      for (const item of p.items) {
        const expDate = new Date(ts.getTime() + item.expDays * 86400000);

        const batch = await prisma.inventoryBatch.create({
          data: {
            ingredientId: item.id,
            remainingQty: item.qty,
            costPerUnit: item.cost,
            receivedAt: ts,
            expirationDate: expDate,
            createdAt: ts,
            updatedAt: ts,
          },
        });
        stats.batches++;
        fifo.addBatch(item.id, batch.id, item.qty, item.cost);

        await prisma.inventoryMovement.create({
          data: {
            ingredientId: item.id,
            stockDocumentId: doc.id,
            quantity: item.qty,
            costPerUnit: item.cost,
            type: "In",
            ingredientNameSnapshot: INGREDIENTS[item.id].name,
            ingredientUnitSnapshot: INGREDIENTS[item.id].unit,
            createdAt: ts,
          },
        });
        stats.movements++;
      }
    }

    /* ── WASTE ─────────────────────────────────────────────────────── */
    if (wasteByDay[day]) {
      const w = wasteByDay[day];
      const ts = dateAt(day, 7);

      const doc = await prisma.stockDocument.create({
        data: {
          businessId: BIZ,
          type: "Waste",
          notes: w.notes,
          createdAt: ts,
          updatedAt: ts,
        },
      });
      stats.wastes++;

      for (const item of w.items) {
        const cpu = fifo.costPerUnit(item.id);
        fifo.consume(item.id, item.qty);

        await prisma.inventoryMovement.create({
          data: {
            ingredientId: item.id,
            stockDocumentId: doc.id,
            quantity: item.qty,
            costPerUnit: cpu,
            type: "Out",
            ingredientNameSnapshot: INGREDIENTS[item.id].name,
            ingredientUnitSnapshot: INGREDIENTS[item.id].unit,
            createdAt: ts,
          },
        });
        stats.movements++;
      }
    }

    /* ── SALES ─────────────────────────────────────────────────────── */
    const salesCount = between(`day-${day}-cnt`, 1, 2);

    for (let s = 0; s < salesCount; s++) {
      const hour = between(`day-${day}-s${s}-hr`, 9, 17);
      const ts = dateAt(day, hour);
      const productId = pick(`day-${day}-s${s}-pid`, PRODUCT_IDS);
      const product = PRODUCTS[productId];
      const recipe = RECIPES[productId];
      const paymentMethod = pick(`day-${day}-s${s}-pay`, PAYMENT_METHODS);

      // Create stock document for this sale
      const doc = await prisma.stockDocument.create({
        data: {
          businessId: BIZ,
          type: "Sale",
          notes: `${SEED_TAG} Penjualan ${product.name}`,
          createdAt: ts,
          updatedAt: ts,
        },
      });

      // OUT movements per recipe ingredient
      for (const r of recipe) {
        const cpu = fifo.costPerUnit(r.ingredientId);
        fifo.consume(r.ingredientId, r.qty);

        await prisma.inventoryMovement.create({
          data: {
            ingredientId: r.ingredientId,
            stockDocumentId: doc.id,
            quantity: r.qty,
            costPerUnit: cpu,
            type: "Out",
            ingredientNameSnapshot: INGREDIENTS[r.ingredientId].name,
            ingredientUnitSnapshot: INGREDIENTS[r.ingredientId].unit,
            createdAt: ts,
          },
        });
        stats.movements++;
      }

      // Sale + SaleItem
      const totalRevenue = product.price;
      const totalCost = product.cost;

      await prisma.sale.create({
        data: {
          businessId: BIZ,
          stockDocumentId: doc.id,
          transactionNumber: txn(day, s + 1),
          totalRevenue,
          totalCost,
          paymentMethod,
          paymentStatus: "Paid",
          createdAt: ts,
          updatedAt: ts,
          saleItems: {
            create: [
              {
                productId,
                quantity: 1,
                priceAtSale: product.price,
                costAtSale: product.cost,
                createdAt: ts,
              },
            ],
          },
        },
      });
      stats.sales++;
    }

    // Progress dot every 5 days
    if ((day + 1) % 5 === 0) process.stdout.write(`  Day ${day + 1}/${DAYS} ✓\n`);
  }

  /* ─── Sync batch remainingQty from FIFO tracker ─────────────────── */

  console.log("\n📊 Syncing batch remaining quantities …");
  let batchUpdates = 0;
  for (const [ingId, batches] of Object.entries(fifo.stock)) {
    for (const b of batches) {
      await prisma.inventoryBatch.update({
        where: { id: b.batchId },
        data: { remainingQty: Math.max(0, +b.remaining.toFixed(3)) },
      });
      batchUpdates++;
    }
  }
  console.log(`   Updated ${batchUpdates} batches`);

  /* ─── Summary ───────────────────────────────────────────────────── */

  console.log("\n✅ Seed complete!");
  console.log(`   📦 Purchase docs : ${stats.purchases}`);
  console.log(`   🗑️  Waste docs    : ${stats.wastes}`);
  console.log(`   💰 Sales          : ${stats.sales}`);
  console.log(`   📈 Movements      : ${stats.movements}`);
  console.log(`   📦 New batches    : ${stats.batches}`);

  console.log("\n📊 Remaining inventory:");
  for (const [id, info] of Object.entries(INGREDIENTS)) {
    const rem = fifo.totalRemaining(Number(id));
    console.log(`   ${info.name.padEnd(15)} ${rem.toFixed(1)} ${info.unit}`);
  }
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
