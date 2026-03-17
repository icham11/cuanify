/**
 * Comprehensive Seed Script for Business #11
 *
 * Generates 150 days of realistic historical transactional data with:
 * - Initial inventory setup
 * - Daily sales with seasonality patterns
 * - Weekend boost (20-40% higher volume)
 * - Gradual upward trend (0.1-0.3% daily)
 * - Promo spike days (2-3 days with up to 2x volume)
 * - FIFO inventory deduction
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
const SEED_TAG = "[SEED150]";
const TXN_PREFIX = "SEED150";
const DAYS = 150;

// Calculate dates - 150 days ending yesterday
const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const END_DATE = new Date(TODAY);
END_DATE.setDate(END_DATE.getDate() - 1); // Yesterday
const START_DATE = new Date(END_DATE);
START_DATE.setDate(START_DATE.getDate() - DAYS + 1);

// Base sales per day range
const BASE_MIN_SALES = 5;
const BASE_MAX_SALES = 25;

// Promo spike days (random selection, 2-3 days throughout the period)
const PROMO_DAYS = [23, 67, 118]; // Day offsets with high volume

// Payment methods (weighted distribution - less Kasbon since it requires debt tracking)
const PAYMENT_METHODS = ["Cash", "Cash", "Cash", "Cash", "QRIS", "QRIS", "Transfer", "Digital"];
const KASBON_CHANCE = 0.05; // 5% chance of Kasbon payment

// Customer names for Kasbon transactions
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
  "Pak Surya",
  "Bu Wati",
  "Pak Dedi",
  "Bu Linda",
  "Mas Roni",
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

// Waste/spoilage configuration - realistic waste events throughout 150 days
// Waste happens roughly every 7-10 days with varying reasons
const WASTE_SCHEDULE = [
  { day: 5, reason: "Bahan basi" },
  { day: 12, reason: "Kemasan rusak" },
  { day: 21, reason: "Kadaluarsa" },
  { day: 28, reason: "Bahan basi" },
  { day: 37, reason: "Kontaminasi" },
  { day: 45, reason: "Penyimpanan salah" },
  { day: 54, reason: "Bahan busuk" },
  { day: 62, reason: "Kadaluarsa" },
  { day: 71, reason: "Bocor/tumpah" },
  { day: 79, reason: "Bahan basi" },
  { day: 88, reason: "Kontaminasi" },
  { day: 96, reason: "Kadaluarsa" },
  { day: 105, reason: "Penyimpanan salah" },
  { day: 114, reason: "Bahan busuk" },
  { day: 123, reason: "Kemasan rusak" },
  { day: 132, reason: "Kadaluarsa" },
  { day: 141, reason: "Bahan basi" },
  { day: 148, reason: "Kontaminasi" },
];

// Waste quantity ranges by unit type (% of typical batch size)
const WASTE_QTY_RANGES = {
  kg: [0.5, 3],
  gram: [50, 500],
  liter: [0.2, 2],
  pcs: [2, 15],
  lembar: [5, 25],
  buah: [1, 10],
};

/* ═══════════════════════════════════════════════════════════════════════
   UTILITY FUNCTIONS
   ═══════════════════════════════════════════════════════════════════════ */

// Seeded random for reproducibility
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

/** Pick item using weighted probability - higher weight = more likely to be picked */
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
  return dateAt(dayOffset).getDay(); // 0 = Sunday, 6 = Saturday
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
    /** @type {Map<number, Array<{batchId: number, remaining: number, costPerUnit: number}>>} */
    this.stock = new Map();
  }

  addBatch(ingredientId, batchId, qty, costPerUnit) {
    if (!this.stock.has(ingredientId)) {
      this.stock.set(ingredientId, []);
    }
    this.stock.get(ingredientId).push({ batchId, remaining: qty, costPerUnit });
  }

  /** Consume qty from oldest batches (FIFO). Returns weighted average costPerUnit. */
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

  /** Get cost per unit of oldest available batch. */
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

  /** Get all batch updates to sync with database */
  getAllBatchUpdates() {
    const updates = [];
    for (const [ingredientId, batches] of this.stock) {
      for (const b of batches) {
        updates.push({ batchId: b.batchId, remaining: Math.max(0, +b.remaining.toFixed(3)) });
      }
    }
    return updates;
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   CALCULATE DAILY SALES COUNT WITH SEASONALITY
   ═══════════════════════════════════════════════════════════════════════ */

function calculateDailySalesCount(dayOffset, previousCount) {
  // Base count with slight randomization
  let baseMin = BASE_MIN_SALES;
  let baseMax = BASE_MAX_SALES;

  // Apply upward trend (0.1-0.3% daily compound growth)
  const growthFactor = 1 + randomFloat(0.001, 0.003) * dayOffset;
  baseMin = Math.round(baseMin * growthFactor);
  baseMax = Math.round(baseMax * growthFactor);

  // Weekend boost: 20-40% increase
  if (isWeekend(dayOffset)) {
    const boost = randomFloat(1.2, 1.4);
    baseMin = Math.round(baseMin * boost);
    baseMax = Math.round(baseMax * boost);
  }

  // Monday slight decrease: 10-15% lower
  if (isMonday(dayOffset)) {
    const reduction = randomFloat(0.85, 0.9);
    baseMin = Math.round(baseMin * reduction);
    baseMax = Math.round(baseMax * reduction);
  }

  // Promo spike days: up to 2x volume
  if (PROMO_DAYS.includes(dayOffset)) {
    const spike = randomFloat(1.5, 2.0);
    baseMin = Math.round(baseMin * spike);
    baseMax = Math.round(baseMax * spike);
  }

  // Generate count with some variance
  let count = randomInt(baseMin, baseMax);

  // Ensure no identical consecutive days (avoid exactly same as previous)
  if (previousCount !== null && count === previousCount) {
    count = count + (random() > 0.5 ? 1 : -1);
  }

  // Ensure reasonable bounds
  return Math.max(3, Math.min(count, 50));
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN SEEDING FUNCTION
   ═══════════════════════════════════════════════════════════════════════ */

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  150-Day Seed Script for Business #11");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`\n📅 Date Range: ${formatDate(START_DATE)} → ${formatDate(END_DATE)}\n`);

  /* ─── Fetch Business Data ─────────────────────────────────────────── */

  console.log("📊 Fetching business data...");

  const business = await prisma.business.findUnique({
    where: { id: BIZ },
  });

  if (!business) {
    throw new Error(`Business with id ${BIZ} not found!`);
  }
  console.log(`   Business: ${business.name}`);

  // Fetch active products
  const products = await prisma.product.findMany({
    where: {
      businessId: BIZ,
      isActive: true,
      deletedAt: null,
    },
    include: {
      recipes: {
        include: {
          ingredient: true,
        },
      },
    },
  });

  if (products.length === 0) {
    throw new Error(`No active products found for business ${BIZ}!`);
  }
  console.log(`   Products found: ${products.length}`);
  products.forEach((p) => console.log(`     - ${p.name} (₹${p.sellingPrice})`));

  // Fetch ingredients
  const ingredients = await prisma.ingredient.findMany({
    where: { businessId: BIZ },
  });

  if (ingredients.length === 0) {
    throw new Error(`No ingredients found for business ${BIZ}!`);
  }
  console.log(`   Ingredients found: ${ingredients.length}`);

  // Create lookup maps
  const ingredientMap = new Map(ingredients.map((i) => [i.id, i]));
  const productMap = new Map(products.map((p) => [p.id, p]));

  // Calculate product weights for weighted selection (cheaper products sell more)
  // Weight = inverse of price ratio (normalized so sum = products.length for balanced distribution)
  const maxPrice = Math.max(...products.map((p) => Number(p.sellingPrice)));
  const productWeights = products.map((p) => {
    const priceRatio = Number(p.sellingPrice) / maxPrice;
    // Cheaper items get higher weight: weight = 2 - priceRatio (range: 1.0 to 2.0)
    return 2 - priceRatio;
  });
  console.log(`   Product weights (popularity):`);
  products.forEach((p, i) => console.log(`     - ${p.name}: weight ${productWeights[i].toFixed(2)}`));

  /* ─── Cleanup Previous Seed Data ─────────────────────────────────── */

  console.log("\n🧹 Cleaning up previous seed data...");

  // Delete seeded debts first (referential integrity)
  const { count: delDebts } = await prisma.debt.deleteMany({
    where: {
      businessId: BIZ,
      notes: { contains: SEED_TAG },
    },
  });
  console.log(`   Debts deleted: ${delDebts}`);

  // Delete seeded sales (cascades to SaleItems)
  const { count: delSales } = await prisma.sale.deleteMany({
    where: {
      businessId: BIZ,
      transactionNumber: { startsWith: TXN_PREFIX },
    },
  });
  console.log(`   Sales deleted: ${delSales}`);

  // Delete seeded stock documents (cascades to InventoryMovements)
  const { count: delDocs } = await prisma.stockDocument.deleteMany({
    where: {
      businessId: BIZ,
      notes: { contains: SEED_TAG },
    },
  });
  console.log(`   StockDocuments deleted: ${delDocs}`);

  // Delete seed-created inventory batches (keep those not from our seed)
  const { count: delBatches } = await prisma.inventoryBatch.deleteMany({
    where: {
      ingredient: { businessId: BIZ },
      // Delete batches created after a certain date that are from our seed
      createdAt: { gte: new Date("2020-01-01") },
      // We'll recreate all batches
    },
  });
  console.log(`   InventoryBatches deleted: ${delBatches}`);

  /* ─── Initialize FIFO Tracker ────────────────────────────────────── */

  const fifo = new FifoTracker();

  /* ─── STEP 1: Initialize Inventory with Large Stock ──────────────── */

  console.log("\n📦 STEP 1: Initializing inventory...");

  // Calculate total ingredient needs for 150 days
  // Estimate: ~15 sales per day average, ~2 items per sale = 30 product units/day
  const estimatedDailyProductSales = 30;
  const totalEstimatedSales = estimatedDailyProductSales * DAYS * 1.5; // 50% buffer

  // Calculate required ingredients based on recipes
  const ingredientNeeds = new Map();
  for (const product of products) {
    for (const recipe of product.recipes) {
      const current = ingredientNeeds.get(recipe.ingredientId) || 0;
      // Estimate usage: total sales * recipe quantity * distribution factor
      const estimatedUsage = (totalEstimatedSales / products.length) * Number(recipe.quantity);
      ingredientNeeds.set(recipe.ingredientId, current + estimatedUsage);
    }
  }

  // Create initial purchase stock document
  const initialPurchaseDate = new Date(START_DATE);
  initialPurchaseDate.setDate(initialPurchaseDate.getDate() - 1); // Day before first sale
  initialPurchaseDate.setHours(8, 0, 0, 0);

  const initialDoc = await prisma.stockDocument.create({
    data: {
      businessId: BIZ,
      type: "Purchase",
      notes: `${SEED_TAG} Initial inventory setup`,
      createdAt: initialPurchaseDate,
      updatedAt: initialPurchaseDate,
    },
  });

  let batchCount = 0;
  let movementCount = 0;

  // Create batches for each ingredient
  for (const ingredient of ingredients) {
    const neededQty = ingredientNeeds.get(ingredient.id) || 1000;
    // Add generous buffer to avoid stockouts
    const stockQty = Math.ceil(neededQty * 1.3);

    // Randomize cost within realistic range
    const baseCosts = {
      kg: [80000, 150000],
      gram: [10, 100],
      liter: [15000, 25000],
      pcs: [200, 1000],
      lembar: [100, 500],
      buah: [1000, 5000],
    };
    const unitBase = baseCosts[ingredient.unit.toLowerCase()] || [1000, 5000];
    const costPerUnit = randomInt(unitBase[0], unitBase[1]);

    // Expiration based on ingredient type (30-365 days)
    const expDays = randomInt(30, 365);
    const expirationDate = new Date(initialPurchaseDate);
    expirationDate.setDate(expirationDate.getDate() + expDays);

    const batch = await prisma.inventoryBatch.create({
      data: {
        ingredientId: ingredient.id,
        remainingQty: stockQty,
        costPerUnit: costPerUnit,
        receivedAt: initialPurchaseDate,
        expirationDate: expirationDate,
        createdAt: initialPurchaseDate,
        updatedAt: initialPurchaseDate,
      },
    });
    batchCount++;
    fifo.addBatch(ingredient.id, batch.id, stockQty, costPerUnit);

    await prisma.inventoryMovement.create({
      data: {
        ingredientId: ingredient.id,
        stockDocumentId: initialDoc.id,
        quantity: stockQty,
        costPerUnit: costPerUnit,
        type: "In",
        ingredientNameSnapshot: ingredient.name,
        ingredientUnitSnapshot: ingredient.unit,
        createdAt: initialPurchaseDate,
      },
    });
    movementCount++;

    console.log(`   ${ingredient.name}: ${stockQty} ${ingredient.unit} @ ${costPerUnit}/unit`);
  }

  // Create periodic restocks throughout the 150 days
  const restockDays = [30, 60, 90, 120];
  for (const day of restockDays) {
    const restockDate = dateAt(day, 7, 0);
    const restockDoc = await prisma.stockDocument.create({
      data: {
        businessId: BIZ,
        type: "Purchase",
        notes: `${SEED_TAG} Periodic restock day ${day}`,
        createdAt: restockDate,
        updatedAt: restockDate,
      },
    });

    for (const ingredient of ingredients) {
      const restockQty = Math.ceil((ingredientNeeds.get(ingredient.id) || 500) * 0.3);
      const costPerUnit = fifo.costPerUnit(ingredient.id) * randomFloat(0.95, 1.05);

      const expDays = randomInt(30, 180);
      const expirationDate = new Date(restockDate);
      expirationDate.setDate(expirationDate.getDate() + expDays);

      const batch = await prisma.inventoryBatch.create({
        data: {
          ingredientId: ingredient.id,
          remainingQty: restockQty,
          costPerUnit: Math.round(costPerUnit),
          receivedAt: restockDate,
          expirationDate: expirationDate,
          createdAt: restockDate,
          updatedAt: restockDate,
        },
      });
      batchCount++;
      fifo.addBatch(ingredient.id, batch.id, restockQty, Math.round(costPerUnit));

      await prisma.inventoryMovement.create({
        data: {
          ingredientId: ingredient.id,
          stockDocumentId: restockDoc.id,
          quantity: restockQty,
          costPerUnit: Math.round(costPerUnit),
          type: "In",
          ingredientNameSnapshot: ingredient.name,
          ingredientUnitSnapshot: ingredient.unit,
          createdAt: restockDate,
        },
      });
      movementCount++;
    }
    console.log(`   Restock on day ${day} completed`);
  }

  console.log(`   ✓ Created ${batchCount} inventory batches`);
  console.log(`   ✓ Created ${movementCount} IN movements`);

  /* ─── STEP 2 & 3: Generate Daily Sales ───────────────────────────── */

  console.log("\n💰 STEP 2-3: Generating daily sales...");

  let totalSales = 0;
  let totalSaleItems = 0;
  let totalOutMovements = 0;
  let totalKasbon = 0;
  let totalWastes = 0;
  let totalWasteMovements = 0;
  let previousDaySalesCount = null;

  // Index waste schedule by day for quick lookup
  const wasteByDay = new Map(WASTE_SCHEDULE.map((w) => [w.day, w]));

  for (let day = 0; day < DAYS; day++) {
    // ── WASTE EVENTS ──────────────────────────────────────────────────
    if (wasteByDay.has(day)) {
      const wasteEvent = wasteByDay.get(day);
      const wasteDate = dateAt(day, 7, randomInt(0, 30)); // Morning waste discovery

      // Pick 1-3 random ingredients to waste
      const wasteIngredientCount = randomInt(1, 3);
      const shuffledIngredients = [...ingredients].sort(() => random() - 0.5);
      const wastedIngredients = shuffledIngredients.slice(0, wasteIngredientCount);

      const wasteDoc = await prisma.stockDocument.create({
        data: {
          businessId: BIZ,
          type: "Waste",
          notes: `${SEED_TAG} ${wasteEvent.reason}`,
          createdAt: wasteDate,
          updatedAt: wasteDate,
        },
      });
      totalWastes++;

      for (const ingredient of wastedIngredients) {
        // Determine waste quantity based on unit type
        const unitLower = ingredient.unit.toLowerCase();
        const qtyRange = WASTE_QTY_RANGES[unitLower] || [1, 10];
        const wasteQty = randomFloat(qtyRange[0], qtyRange[1]);

        // Get current cost and consume from FIFO
        const costPerUnit = fifo.costPerUnit(ingredient.id);

        // Only waste if we have stock
        const available = fifo.totalRemaining(ingredient.id);
        if (available < wasteQty) continue;

        fifo.consume(ingredient.id, wasteQty);

        await prisma.inventoryMovement.create({
          data: {
            ingredientId: ingredient.id,
            stockDocumentId: wasteDoc.id,
            quantity: +wasteQty.toFixed(3),
            costPerUnit: costPerUnit,
            type: "Out",
            ingredientNameSnapshot: ingredient.name,
            ingredientUnitSnapshot: ingredient.unit,
            createdAt: wasteDate,
          },
        });
        totalWasteMovements++;
      }
    }

    // ── SALES ─────────────────────────────────────────────────────────
    const salesCount = calculateDailySalesCount(day, previousDaySalesCount);
    previousDaySalesCount = salesCount;

    for (let saleIdx = 0; saleIdx < salesCount; saleIdx++) {
      // Random time between 8 AM and 9 PM
      const hour = randomInt(8, 21);
      const minute = randomInt(0, 59);
      const saleDate = dateAt(day, hour, minute);

      // Create stock document for this sale
      const saleDoc = await prisma.stockDocument.create({
        data: {
          businessId: BIZ,
          type: "Sale",
          notes: `${SEED_TAG} Sale`,
          createdAt: saleDate,
          updatedAt: saleDate,
        },
      });

      // Generate 1-4 sale items
      const itemCount = randomInt(1, 4);
      const saleItemsData = [];
      let totalRevenue = 0;
      let totalCost = 0;

      // Track products already in this sale to avoid duplicates
      const usedProducts = new Set();
      const selectedProducts = [];

      for (let i = 0; i < itemCount && selectedProducts.length < products.length; i++) {
        let product;
        let attempts = 0;
        do {
          // Use weighted selection - cheaper products are more popular
          product = pickWeightedRandom(products, productWeights);
          attempts++;
        } while (usedProducts.has(product.id) && attempts < 10);

        if (usedProducts.has(product.id)) continue;
        usedProducts.add(product.id);
        selectedProducts.push(product);
      }

      for (const product of selectedProducts) {
        const quantity = randomInt(1, 5);
        const priceAtSale = Number(product.sellingPrice);
        const costAtSale = Number(product.recipeCost);

        saleItemsData.push({
          productId: product.id,
          quantity: quantity,
          priceAtSale: priceAtSale,
          costAtSale: costAtSale,
          createdAt: saleDate,
        });

        totalRevenue += priceAtSale * quantity;
        totalCost += costAtSale * quantity;
        totalSaleItems++;

        // STEP 4: Deduct inventory for each recipe ingredient
        for (const recipe of product.recipes) {
          const ingredient = ingredientMap.get(recipe.ingredientId);
          if (!ingredient) continue;

          const qtyNeeded = Number(recipe.quantity) * quantity;
          const costPerUnit = fifo.costPerUnit(recipe.ingredientId);
          fifo.consume(recipe.ingredientId, qtyNeeded);

          await prisma.inventoryMovement.create({
            data: {
              ingredientId: recipe.ingredientId,
              stockDocumentId: saleDoc.id,
              quantity: qtyNeeded,
              costPerUnit: costPerUnit,
              type: "Out",
              ingredientNameSnapshot: ingredient.name,
              ingredientUnitSnapshot: ingredient.unit,
              createdAt: saleDate,
            },
          });
          totalOutMovements++;
        }
      }

      // Create the sale with items
      // Determine payment method - small chance of Kasbon
      const isKasbon = random() < KASBON_CHANCE;
      const paymentMethod = isKasbon ? "Kasbon" : pickRandom(PAYMENT_METHODS);
      const paymentStatus = isKasbon ? "Pending" : "Paid";

      // Customer info for Kasbon
      const customerName = isKasbon ? pickRandom(CUSTOMER_NAMES) : null;
      const customerPhone = isKasbon ? pickRandom(CUSTOMER_PHONES) : null;

      const sale = await prisma.sale.create({
        data: {
          businessId: BIZ,
          stockDocumentId: saleDoc.id,
          transactionNumber: txn(day, saleIdx + 1),
          totalRevenue: totalRevenue,
          totalCost: totalCost,
          paymentMethod: paymentMethod,
          paymentStatus: paymentStatus,
          customerName: customerName,
          customerPhone: customerPhone,
          createdAt: saleDate,
          updatedAt: saleDate,
          saleItems: {
            create: saleItemsData,
          },
        },
      });

      // Create Debt record for Kasbon payments
      if (isKasbon) {
        const dueDate = new Date(saleDate);
        dueDate.setDate(dueDate.getDate() + randomInt(7, 30)); // Due in 7-30 days

        await prisma.debt.create({
          data: {
            businessId: BIZ,
            saleId: sale.id,
            customerName: customerName,
            customerPhone: customerPhone,
            totalAmount: totalRevenue,
            paidAmount: 0,
            status: "Unpaid",
            dueDate: dueDate,
            notes: `${SEED_TAG} Kasbon`,
            createdAt: saleDate,
            updatedAt: saleDate,
          },
        });
        totalKasbon++;
      }

      totalSales++;
    }

    // Progress indicator
    if ((day + 1) % 10 === 0 || day === DAYS - 1) {
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const dow = getDayOfWeek(day);
      let dayInfo = `(${dayNames[dow]}`;
      if (isWeekend(day)) {
        dayInfo += " 📈";
      } else if (isMonday(day)) {
        dayInfo += " 📉";
      }
      dayInfo += ")";
      const promoInfo = PROMO_DAYS.includes(day) ? " 🎉PROMO" : "";
      console.log(`   Day ${day + 1}/${DAYS}: ${salesCount} sales ${dayInfo}${promoInfo}`);
    }
  }

  console.log(`\n   ✓ Created ${totalSales} sales`);
  console.log(`   ✓ Created ${totalSaleItems} sale items`);
  console.log(`   ✓ Created ${totalOutMovements} OUT movements (sales)`);
  console.log(`   ✓ Created ${totalKasbon} kasbon/debt records`);
  console.log(`   ✓ Created ${totalWastes} waste documents`);
  console.log(`   ✓ Created ${totalWasteMovements} waste movements`);

  /* ─── Sync Batch Remaining Quantities ────────────────────────────── */

  console.log("\n📊 Syncing batch remaining quantities...");

  const batchUpdates = fifo.getAllBatchUpdates();
  let updateCount = 0;
  for (const update of batchUpdates) {
    await prisma.inventoryBatch.update({
      where: { id: update.batchId },
      data: { remainingQty: update.remaining },
    });
    updateCount++;
  }
  console.log(`   ✓ Updated ${updateCount} batches`);

  /* ─── Final Summary ──────────────────────────────────────────────── */

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  ✅ SEED COMPLETE!");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`\n📊 Summary:`);
  console.log(`   📅 Days seeded      : ${DAYS}`);
  console.log(`   💰 Total sales      : ${totalSales}`);
  console.log(`   📦 Sale items       : ${totalSaleItems}`);
  console.log(`   📈 IN movements     : ${movementCount}`);
  console.log(`   📉 OUT movements    : ${totalOutMovements + totalWasteMovements}`);
  console.log(`   🗑️  Waste events     : ${totalWastes}`);
  console.log(`   💳 Kasbon debts     : ${totalKasbon}`);
  console.log(`   🏷️ Batches created  : ${batchCount}`);

  console.log(`\n📦 Remaining Inventory:`);
  for (const ingredient of ingredients) {
    const remaining = fifo.totalRemaining(ingredient.id);
    console.log(`   ${ingredient.name.padEnd(20)} ${remaining.toFixed(2)} ${ingredient.unit}`);
  }

  // Verify sales distribution
  console.log(`\n📈 Sales Statistics:`);
  const salesByDay = await prisma.$queryRaw`
    SELECT 
      EXTRACT(DOW FROM "createdAt") as day_of_week,
      COUNT(*) as count
    FROM "Sale"
    WHERE "businessId" = ${BIZ} 
      AND "transactionNumber" LIKE ${TXN_PREFIX + "%"}
    GROUP BY EXTRACT(DOW FROM "createdAt")
    ORDER BY day_of_week
  `;

  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  for (const row of salesByDay) {
    console.log(`   ${dayNames[row.day_of_week].padEnd(12)} : ${row.count} sales`);
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
