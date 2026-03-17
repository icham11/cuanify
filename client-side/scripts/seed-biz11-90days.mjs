/**
 * Optimized Seed Script for Business #11 (90 Days)
 *
 * Generates 90 days of realistic historical transactional data with:
 * - Initial inventory setup with generous stock
 * - Daily sales with seasonality patterns
 * - Weekend boost (20-40% higher volume)
 * - Gradual upward trend (0.1-0.3% daily)
 * - Promo spike days
 * - FIFO inventory deduction
 * - BATCH OPERATIONS for speed
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

const BIZ = 16;
const SEED_TAG = "[SEED90]"; // internal cleanup marker only
const TXN_PREFIX = "TXN";
const DAYS = 90;

// Calculate dates - 90 days ending yesterday
const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const END_DATE = new Date(TODAY);
END_DATE.setDate(END_DATE.getDate() - 1);
const START_DATE = new Date(END_DATE);
START_DATE.setDate(START_DATE.getDate() - DAYS + 1);

// Base sales per day range
const BASE_MIN_SALES = 2;
const BASE_MAX_SALES = 8;

// Promo spike days (within 90 days)
const PROMO_DAYS = [15, 45, 75];

// Payment methods
const PAYMENT_METHODS = ["Cash", "Cash", "Cash", "Cash", "QRIS", "QRIS", "Transfer", "Digital"];
const KASBON_CHANCE = 0.05;

const CUSTOMER_NAMES = [
  "Pak Budi",
  "Bu Siti",
  "Mas Agus",
  "Mbak Dewi",
  "Pak Hendra",
  "Bu Rina",
  "Pak Joko",
  "Bu Maya",
  "Mas Andi",
  "Mbak Fitri",
];

const CUSTOMER_PHONES = [
  "081234567890",
  "082345678901",
  "083456789012",
  "084567890123",
  "085678901234",
  "086789012345",
  "087890123456",
  "088901234567",
];

// Waste schedule (within 90 days)
const WASTE_SCHEDULE = [
  { day: 7, reason: "Bahan basi" },
  { day: 18, reason: "Kemasan rusak" },
  { day: 29, reason: "Kadaluarsa" },
  { day: 42, reason: "Kontaminasi" },
  { day: 55, reason: "Penyimpanan salah" },
  { day: 68, reason: "Bahan busuk" },
  { day: 82, reason: "Bocor/tumpah" },
];

const WASTE_QTY_RANGES = {
  kg: [0.3, 1.5],
  gram: [30, 200],
  liter: [0.1, 0.8],
  pcs: [1, 8],
  lembar: [3, 15],
  buah: [1, 5],
};

/* ═══════════════════════════════════════════════════════════════════════
   UTILITY FUNCTIONS
   ═══════════════════════════════════════════════════════════════════════ */

let seed = 12345;
function random() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

function randomInt(min, max) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function randomFloat(min, max) {
  return random() * (max - min) + min;
}

function pickRandom(arr) {
  return arr[randomInt(0, arr.length - 1)];
}

function pickWeightedRandom(arr, weights) {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let r = random() * totalWeight;
  for (let i = 0; i < arr.length; i++) {
    r -= weights[i];
    if (r <= 0) return arr[i];
  }
  return arr[arr.length - 1];
}

function dateAt(dayOffset, hour = 10, minute = 0) {
  const d = new Date(START_DATE);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

function txn(dayOffset, idx) {
  const d = dateAt(dayOffset);
  const dateStr = formatDate(d).replace(/-/g, "");
  return `${TXN_PREFIX}-${dateStr}-${String(idx).padStart(4, "0")}`;
}

function getDayOfWeek(dayOffset) {
  return dateAt(dayOffset).getDay();
}

function isWeekend(dayOffset) {
  const dow = getDayOfWeek(dayOffset);
  return dow === 0 || dow === 6;
}

function isMonday(dayOffset) {
  return getDayOfWeek(dayOffset) === 1;
}

/* ═══════════════════════════════════════════════════════════════════════
   FIFO INVENTORY TRACKER
   ═══════════════════════════════════════════════════════════════════════ */

class FifoTracker {
  constructor() {
    this.stock = new Map();
  }

  addBatch(ingredientId, batchId, qty, costPerUnit) {
    if (!this.stock.has(ingredientId)) {
      this.stock.set(ingredientId, []);
    }
    this.stock.get(ingredientId).push({ batchId, remaining: qty, costPerUnit });
  }

  consume(ingredientId, qty) {
    const batches = this.stock.get(ingredientId) || [];
    let left = qty;
    let totalCost = 0;
    let totalConsumed = 0;

    for (const b of batches) {
      if (left <= 0.0001) break;
      if (b.remaining <= 0) continue;
      const take = Math.min(b.remaining, left);
      b.remaining = +(b.remaining - take).toFixed(6);
      left = +(left - take).toFixed(6);
      totalCost += take * b.costPerUnit;
      totalConsumed += take;
    }

    if (left > 0.001) {
      console.warn(`  ⚠ Stock short for ingredient ${ingredientId}: needed ${qty}, short by ${left.toFixed(3)}`);
    }
    return totalConsumed > 0 ? totalCost / totalConsumed : 0;
  }

  costPerUnit(ingredientId) {
    const batches = this.stock.get(ingredientId) || [];
    for (const b of batches) {
      if (b.remaining > 0) return b.costPerUnit;
    }
    return 0;
  }

  totalRemaining(ingredientId) {
    const batches = this.stock.get(ingredientId) || [];
    return batches.reduce((sum, b) => sum + b.remaining, 0);
  }

  getAllBatchUpdates() {
    const updates = [];
    for (const [, batches] of this.stock) {
      for (const b of batches) {
        updates.push({ batchId: b.batchId, remaining: Math.max(0, +b.remaining.toFixed(3)) });
      }
    }
    return updates;
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   CALCULATE DAILY SALES COUNT
   ═══════════════════════════════════════════════════════════════════════ */

function calculateDailySalesCount(dayOffset, previousCount) {
  let baseMin = BASE_MIN_SALES;
  let baseMax = BASE_MAX_SALES;

  const growthFactor = 1 + randomFloat(0.001, 0.003) * dayOffset;
  baseMin = Math.round(baseMin * growthFactor);
  baseMax = Math.round(baseMax * growthFactor);

  if (isWeekend(dayOffset)) {
    const boost = randomFloat(1.2, 1.4);
    baseMin = Math.round(baseMin * boost);
    baseMax = Math.round(baseMax * boost);
  }

  if (isMonday(dayOffset)) {
    const reduction = randomFloat(0.85, 0.9);
    baseMin = Math.round(baseMin * reduction);
    baseMax = Math.round(baseMax * reduction);
  }

  if (PROMO_DAYS.includes(dayOffset)) {
    const spike = randomFloat(1.5, 2.0);
    baseMin = Math.round(baseMin * spike);
    baseMax = Math.round(baseMax * spike);
  }

  let count = randomInt(baseMin, baseMax);
  if (previousCount !== null && count === previousCount) {
    count = count + (random() > 0.5 ? 1 : -1);
  }
  return Math.max(3, Math.min(count, 40));
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN SEEDING FUNCTION
   ═══════════════════════════════════════════════════════════════════════ */

async function main() {
  const startTime = Date.now();

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  90-Day Optimized Seed Script for Business #11");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`\n📅 Date Range: ${formatDate(START_DATE)} → ${formatDate(END_DATE)}\n`);

  /* ─── Fetch Business Data ─────────────────────────────────────────── */

  console.log("📊 Fetching business data...");

  const business = await prisma.business.findUnique({ where: { id: BIZ } });
  if (!business) throw new Error(`Business with id ${BIZ} not found!`);
  console.log(`   Business: ${business.name}`);

  const products = await prisma.product.findMany({
    where: { businessId: BIZ, isActive: true, deletedAt: null },
    include: { recipes: { include: { ingredient: true } } },
  });
  if (products.length === 0) throw new Error(`No active products found for business ${BIZ}!`);
  console.log(`   Products found: ${products.length}`);

  const ingredients = await prisma.ingredient.findMany({ where: { businessId: BIZ } });
  if (ingredients.length === 0) throw new Error(`No ingredients found for business ${BIZ}!`);
  console.log(`   Ingredients found: ${ingredients.length}`);

  const ingredientMap = new Map(ingredients.map((i) => [i.id, i]));

  // Product weights for weighted selection
  const maxPrice = Math.max(...products.map((p) => Number(p.sellingPrice)));
  const productWeights = products.map((p) => 2 - Number(p.sellingPrice) / maxPrice);

  /* ─── Cleanup Previous Seed Data ─────────────────────────────────── */

  console.log("\n🧹 Cleaning up previous seed data...");

  await prisma.debt.deleteMany({ where: { businessId: BIZ } });
  await prisma.sale.deleteMany({ where: { businessId: BIZ, transactionNumber: { startsWith: TXN_PREFIX } } });
  await prisma.stockDocument.deleteMany({ where: { businessId: BIZ } });
  await prisma.inventoryBatch.deleteMany({
    where: { ingredient: { businessId: BIZ }, createdAt: { gte: new Date("2020-01-01") } },
  });
  console.log("   ✓ Cleanup complete");

  /* ─── Initialize FIFO Tracker ────────────────────────────────────── */

  const fifo = new FifoTracker();

  /* ─── STEP 1: Initialize Inventory (GENEROUS STOCK) ──────────────── */

  console.log("\n📦 STEP 1: Initializing inventory...");

  // Calculate needs - reasonable for 90 days
  const estimatedDailyProductSales = 10; // ~7-10 sales/day * ~1.5 items avg
  const totalEstimatedSales = estimatedDailyProductSales * DAYS * 1.0; // 1.0x (no buffer)

  const ingredientNeeds = new Map();
  for (const product of products) {
    for (const recipe of product.recipes) {
      const current = ingredientNeeds.get(recipe.ingredientId) || 0;
      const estimatedUsage = (totalEstimatedSales / products.length) * Number(recipe.quantity);
      ingredientNeeds.set(recipe.ingredientId, current + estimatedUsage);
    }
  }

  const initialPurchaseDate = new Date(START_DATE);
  initialPurchaseDate.setDate(initialPurchaseDate.getDate() - 1);
  initialPurchaseDate.setHours(8, 0, 0, 0);

  const initialDoc = await prisma.stockDocument.create({
    data: {
      businessId: BIZ,
      type: "Purchase",
      notes: `Initial inventory setup`,
      createdAt: initialPurchaseDate,
      updatedAt: initialPurchaseDate,
    },
  });

  // BATCH: Create all initial batches and movements
  const batchData = [];
  const movementData = [];
  const baseCosts = {
    kg: [80000, 150000],
    gram: [10, 100],
    liter: [15000, 25000],
    pcs: [200, 1000],
    lembar: [100, 500],
    buah: [1000, 5000],
  };

  for (const ingredient of ingredients) {
    const neededQty = ingredientNeeds.get(ingredient.id) || 500;
    const stockQty = Math.ceil(neededQty * 3.5); // 1.8x buffer for 90 days
    const unitBase = baseCosts[ingredient.unit.toLowerCase()] || [1000, 5000];
    const costPerUnit = randomInt(unitBase[0], unitBase[1]);
    const expDays = randomInt(30, 365);
    const expirationDate = new Date(initialPurchaseDate);
    expirationDate.setDate(expirationDate.getDate() + expDays);

    batchData.push({
      ingredientId: ingredient.id,
      remainingQty: stockQty,
      costPerUnit,
      receivedAt: initialPurchaseDate,
      expirationDate,
      createdAt: initialPurchaseDate,
      updatedAt: initialPurchaseDate,
      _costForFifo: costPerUnit,
      _qtyForFifo: stockQty,
    });

    movementData.push({
      ingredientId: ingredient.id,
      stockDocumentId: initialDoc.id,
      quantity: stockQty,
      costPerUnit,
      type: "In",
      ingredientNameSnapshot: ingredient.name,
      ingredientUnitSnapshot: ingredient.unit,
      createdAt: initialPurchaseDate,
    });
  }

  // Create batches one by one (need IDs for FIFO tracker)
  for (const data of batchData) {
    const { _costForFifo, _qtyForFifo, ...batchInsert } = data;
    const batch = await prisma.inventoryBatch.create({ data: batchInsert });
    fifo.addBatch(data.ingredientId, batch.id, _qtyForFifo, _costForFifo);
  }

  // BATCH: Create all movements at once
  await prisma.inventoryMovement.createMany({ data: movementData });
  console.log(`   ✓ Created ${batchData.length} batches, ${movementData.length} IN movements`);

  /* ─── STEP 2-4: Generate Sales (OPTIMIZED) ───────────────────────── */

  console.log("\n💰 STEP 2-4: Generating daily sales...");

  let totalSales = 0;
  let totalSaleItems = 0;
  let totalOutMovements = 0;
  let totalKasbon = 0;
  let totalWastes = 0;
  let previousDaySalesCount = null;

  const wasteByDay = new Map(WASTE_SCHEDULE.map((w) => [w.day, w]));

  // Process in daily batches
  for (let day = 0; day < DAYS; day++) {
    // ── WASTE EVENTS ──────────────────────────────────────────────────
    if (wasteByDay.has(day)) {
      const wasteEvent = wasteByDay.get(day);
      const wasteDate = dateAt(day, 7, randomInt(0, 30));
      const wasteIngredientCount = randomInt(1, 2);
      const shuffledIngredients = [...ingredients].sort(() => random() - 0.5);
      const wastedIngredients = shuffledIngredients.slice(0, wasteIngredientCount);

      const wasteDoc = await prisma.stockDocument.create({
        data: {
          businessId: BIZ,
          type: "Waste",
          notes: `${wasteEvent.reason}`,
          createdAt: wasteDate,
          updatedAt: wasteDate,
        },
      });
      totalWastes++;

      const wasteMovements = [];
      for (const ingredient of wastedIngredients) {
        const unitLower = ingredient.unit.toLowerCase();
        const qtyRange = WASTE_QTY_RANGES[unitLower] || [1, 5];
        const wasteQty = randomFloat(qtyRange[0], qtyRange[1]);
        const costPerUnit = fifo.costPerUnit(ingredient.id);
        const available = fifo.totalRemaining(ingredient.id);
        if (available < wasteQty) continue;
        fifo.consume(ingredient.id, wasteQty);

        wasteMovements.push({
          ingredientId: ingredient.id,
          stockDocumentId: wasteDoc.id,
          quantity: +wasteQty.toFixed(3),
          costPerUnit,
          type: "Out",
          ingredientNameSnapshot: ingredient.name,
          ingredientUnitSnapshot: ingredient.unit,
          createdAt: wasteDate,
        });
      }
      if (wasteMovements.length > 0) {
        await prisma.inventoryMovement.createMany({ data: wasteMovements });
      }
    }

    // ── SALES ─────────────────────────────────────────────────────────
    const salesCount = calculateDailySalesCount(day, previousDaySalesCount);
    previousDaySalesCount = salesCount;

    // Collect all data for this day
    const daySales = [];
    const dayStockDocs = [];
    const dayMovements = [];

    for (let saleIdx = 0; saleIdx < salesCount; saleIdx++) {
      const hour = randomInt(8, 21);
      const minute = randomInt(0, 59);
      const saleDate = dateAt(day, hour, minute);

      // Create stock document first (need ID)
      const saleDoc = await prisma.stockDocument.create({
        data: {
          businessId: BIZ,
          type: "Sale",
          notes: `Sale`,
          createdAt: saleDate,
          updatedAt: saleDate,
        },
      });

      // Generate sale items
      const itemCount = randomInt(1, 3);
      const saleItemsData = [];
      let totalRevenue = 0;
      let totalCost = 0;
      const usedProducts = new Set();
      const selectedProducts = [];

      for (let i = 0; i < itemCount && selectedProducts.length < products.length; i++) {
        let product;
        let attempts = 0;
        do {
          product = pickWeightedRandom(products, productWeights);
          attempts++;
        } while (usedProducts.has(product.id) && attempts < 10);
        if (usedProducts.has(product.id)) continue;
        usedProducts.add(product.id);
        selectedProducts.push(product);
      }

      for (const product of selectedProducts) {
        const quantity = randomInt(1, 3);
        const priceAtSale = Number(product.sellingPrice);
        const costAtSale = Number(product.recipeCost);

        saleItemsData.push({
          productId: product.id,
          quantity,
          priceAtSale,
          costAtSale,
          createdAt: saleDate,
        });

        totalRevenue += priceAtSale * quantity;
        totalCost += costAtSale * quantity;
        totalSaleItems++;

        // Deduct inventory
        for (const recipe of product.recipes) {
          const ingredient = ingredientMap.get(recipe.ingredientId);
          if (!ingredient) continue;
          const qtyNeeded = Number(recipe.quantity) * quantity;
          const costPerUnit = fifo.costPerUnit(recipe.ingredientId);
          fifo.consume(recipe.ingredientId, qtyNeeded);

          dayMovements.push({
            ingredientId: recipe.ingredientId,
            stockDocumentId: saleDoc.id,
            quantity: qtyNeeded,
            costPerUnit,
            type: "Out",
            ingredientNameSnapshot: ingredient.name,
            ingredientUnitSnapshot: ingredient.unit,
            createdAt: saleDate,
          });
          totalOutMovements++;
        }
      }

      // Create sale
      const isKasbon = random() < KASBON_CHANCE;
      const paymentMethod = isKasbon ? "Kasbon" : pickRandom(PAYMENT_METHODS);
      const paymentStatus = isKasbon ? "Pending" : "Paid";
      const customerName = isKasbon ? pickRandom(CUSTOMER_NAMES) : null;
      const customerPhone = isKasbon ? pickRandom(CUSTOMER_PHONES) : null;

      const sale = await prisma.sale.create({
        data: {
          businessId: BIZ,
          stockDocumentId: saleDoc.id,
          transactionNumber: txn(day, saleIdx + 1),
          totalRevenue,
          totalCost,
          paymentMethod,
          paymentStatus,
          customerName,
          customerPhone,
          createdAt: saleDate,
          updatedAt: saleDate,
          saleItems: { create: saleItemsData },
        },
      });

      if (isKasbon) {
        const dueDate = new Date(saleDate);
        dueDate.setDate(dueDate.getDate() + randomInt(7, 30));
        await prisma.debt.create({
          data: {
            businessId: BIZ,
            saleId: sale.id,
            customerName,
            customerPhone,
            totalAmount: totalRevenue,
            paidAmount: 0,
            status: "Unpaid",
            dueDate,
            notes: `Kasbon`,
            createdAt: saleDate,
            updatedAt: saleDate,
          },
        });
        totalKasbon++;
      }
      totalSales++;
    }

    // BATCH: Create all movements for this day
    if (dayMovements.length > 0) {
      await prisma.inventoryMovement.createMany({ data: dayMovements });
    }

    // Progress every 10 days
    if ((day + 1) % 10 === 0 || day === DAYS - 1) {
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const dow = getDayOfWeek(day);
      let dayInfo = `(${dayNames[dow]}`;
      if (isWeekend(day)) dayInfo += " 📈";
      else if (isMonday(day)) dayInfo += " 📉";
      dayInfo += ")";
      const promoInfo = PROMO_DAYS.includes(day) ? " 🎉PROMO" : "";
      console.log(`   Day ${day + 1}/${DAYS}: ${salesCount} sales ${dayInfo}${promoInfo}`);
    }
  }

  console.log(`\n   ✓ Created ${totalSales} sales`);
  console.log(`   ✓ Created ${totalSaleItems} sale items`);
  console.log(`   ✓ Created ${totalOutMovements} OUT movements`);
  console.log(`   ✓ Created ${totalKasbon} kasbon records`);
  console.log(`   ✓ Created ${totalWastes} waste events`);

  /* ─── Sync Batch Quantities ──────────────────────────────────────── */

  console.log("\n📊 Syncing batch quantities...");
  const batchUpdates = fifo.getAllBatchUpdates();
  for (const update of batchUpdates) {
    await prisma.inventoryBatch.update({
      where: { id: update.batchId },
      data: { remainingQty: update.remaining },
    });
  }
  console.log(`   ✓ Updated ${batchUpdates.length} batches`);

  /* ─── Summary ────────────────────────────────────────────────────── */

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log(`  ✅ SEED COMPLETE in ${elapsed}s`);
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`\n📊 Summary:`);
  console.log(`   📅 Days seeded      : ${DAYS}`);
  console.log(`   💰 Total sales      : ${totalSales}`);
  console.log(`   📦 Sale items       : ${totalSaleItems}`);
  console.log(`   📉 OUT movements    : ${totalOutMovements}`);
  console.log(`   🗑️  Waste events     : ${totalWastes}`);
  console.log(`   💳 Kasbon debts     : ${totalKasbon}`);

  console.log(`\n📦 Remaining Inventory:`);
  for (const ingredient of ingredients) {
    const remaining = fifo.totalRemaining(ingredient.id);
    console.log(`   ${ingredient.name.padEnd(20)} ${remaining.toFixed(2)} ${ingredient.unit}`);
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
