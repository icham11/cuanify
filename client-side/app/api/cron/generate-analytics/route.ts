import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import ARIMA from "arima";
import { GROQ_MODELS, createGroqCompletion } from "@/lib/groq";
import { requireAuth } from "@/lib/auth/session";
import {
  calculateAdaptiveLookback,
  generateLookbackDates,
  calculateWeekdayMultipliers,
  applySeasonalityAdjustment,
  detectPriceChange,
  calculateNonLinearConfidence,
  calculateVolatilityAndBuffer,
  generateProductionRecommendation,
  calculateMAPE,
  mapeToAccuracy,
  toDateString,
  type DailySalesEntry,
} from "@/lib/forecasting/utils";
import {
  getBakeryDailyAnalytics,
  getBakeryForecastInputs,
  getBakeryHealthSeries,
  getBakeryProductAnalytics,
  hasBakeryOrders,
} from "@/lib/bookings/bakery-analytics";

/**
 * POST /api/cron/generate-analytics
 *
 * Daily cron job that generates forecasts + health scores for ALL businesses.
 * Designed to be called by an external scheduler (Vercel Cron, GitHub Actions, etc.)
 *
 * REFACTORED FORECAST SYSTEM v2:
 * - Adaptive lookback window (up to 60 days)
 * - Weekly seasonality adjustment
 * - Price change detection
 * - Non-linear confidence decay
 * - Dynamic production buffer based on volatility
 * - Forecast accuracy tracking (MAPE)
 *
 * Security: requires CRON_SECRET header to prevent unauthorized calls.
 *
 * Headers:
 *   Authorization: Bearer <CRON_SECRET>
 */

// ═══════════════════════════════════════════════════════════════════════════════
// FORECAST ACCURACY EVALUATION — runs as background evaluation
// ═══════════════════════════════════════════════════════════════════════════════

async function evaluateForecastAccuracy(businessId: number) {
  try {
    const now = new Date();
    const since7d = new Date(now);
    since7d.setDate(since7d.getDate() - 7);
    const since30d = new Date(now);
    since30d.setDate(since30d.getDate() - 30);

    // Get past forecasts that we can now evaluate (predicted dates that have passed)
    const pastForecasts = await prisma.businessForecast.findMany({
      where: {
        businessId,
        date: { lt: now, gte: since30d },
      },
      orderBy: { date: "asc" },
    });

    const actualByDate = new Map<string, number>();
    if (await hasBakeryOrders(businessId)) {
      const bakery = await getBakeryDailyAnalytics(businessId, since30d, now);
      for (const point of bakery.data) {
        actualByDate.set(point.date, point.revenue);
      }
    } else {
      const actualMetrics = await prisma.businessMetrics.findMany({
        where: {
          businessId,
          date: { gte: since30d, lt: now },
        },
      });

      for (const m of actualMetrics) {
        actualByDate.set(toDateString(m.date), Number(m.totalRevenue));
      }
    }

    // Match forecasts with actuals
    const comparisons: {
      predicted: number;
      actual: number;
      daysAgo: number;
    }[] = [];
    for (const fc of pastForecasts) {
      const dateStr = toDateString(fc.date);
      const actual = actualByDate.get(dateStr);
      if (actual !== undefined && actual > 0) {
        const daysAgo = Math.floor((now.getTime() - fc.date.getTime()) / (1000 * 60 * 60 * 24));
        comparisons.push({
          predicted: Number(fc.predictedRevenue),
          actual,
          daysAgo,
        });
      }
    }

    // Calculate 7-day and 30-day MAPE
    const last7d = comparisons.filter((c) => c.daysAgo <= 7);
    const last30d = comparisons;

    const mape7d = calculateMAPE(last7d);
    const mape30d = calculateMAPE(last30d);
    const accuracy7d = mapeToAccuracy(mape7d);
    const accuracy30d = mapeToAccuracy(mape30d);

    // Store accuracy metrics
    try {
      await prisma.forecastAccuracy.upsert({
        where: { businessId },
        update: {
          mape7d,
          mape30d,
          accuracy7d,
          accuracy30d,
          sampleSize7d: last7d.length,
          sampleSize30d: last30d.length,
          lastEvaluatedAt: now,
        },
        create: {
          businessId,
          mape7d,
          mape30d,
          accuracy7d,
          accuracy30d,
          sampleSize7d: last7d.length,
          sampleSize30d: last30d.length,
          lastEvaluatedAt: now,
        },
      });
    } catch {
      /* model may not exist yet */
    }

    console.log(
      `[ACCURACY] Business ${businessId}: 7d accuracy=${accuracy7d?.toFixed(1) ?? "N/A"}% (n=${last7d.length}), ` +
        `30d accuracy=${accuracy30d?.toFixed(1) ?? "N/A"}% (n=${last30d.length})`,
    );
  } catch (err) {
    console.error(`[ACCURACY] Failed for business ${businessId}:`, err);
    // Non-critical - don't fail the entire job
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN FORECAST GENERATION — refactored with all improvements
// ═══════════════════════════════════════════════════════════════════════════════

async function generateForecastForBusiness(businessId: number) {
  const now = new Date();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const useBakery = await hasBakeryOrders(businessId);

  // ─── Cleanup: Delete old forecasts (before today) ──────────────────────
  await Promise.all([
    prisma.businessForecast.deleteMany({
      where: { businessId, date: { lt: today } },
    }),
    prisma.productForecast.deleteMany({
      where: { product: { businessId }, date: { lt: today } },
    }),
  ]);

  // ─── Step 1: Determine Adaptive Lookback Window ────────────────────────
  // Query to find earliest sale date for this business
  const earliestSale = useBakery
    ? (
        await prisma.$queryRaw<Array<{ created_at: Date }>>`
          SELECT created_at
          FROM bakery_orders
          WHERE business_id = ${businessId}
            AND payment_status = 'Paid'
          ORDER BY created_at ASC
          LIMIT 1
        `
      )[0]
    : await prisma.sale.findFirst({
        where: { businessId, paymentStatus: "Paid" },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      });

  let lookbackDays = 30; // Default fallback
  if (earliestSale) {
    const firstDate =
      "created_at" in earliestSale ? earliestSale.created_at : earliestSale.createdAt;
    const daysSinceFirst = Math.floor((now.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
    lookbackDays = calculateAdaptiveLookback(daysSinceFirst);
  }

  const since = new Date(now);
  since.setDate(since.getDate() - lookbackDays);
  since.setHours(0, 0, 0, 0);

  const allDates = generateLookbackDates(lookbackDays, now);

  console.log(`[FORECAST] Business ${businessId}: Using ${lookbackDays}-day adaptive lookback`);

  // ─── Step 2: Fetch Product Sales Data with Prices ──────────────────────
  const byProduct = new Map<number, { entries: DailySalesEntry[]; historicalPrices: number[] }>();
  const productPriceMap = new Map<number, { sellingPrice: number; recipeCost: number }>();
  if (useBakery) {
    const forecastInputs = await getBakeryForecastInputs(businessId, since, now);
    for (const series of forecastInputs.productSeries) {
      byProduct.set(series.productId, {
        entries: series.entries,
        historicalPrices: series.historicalPrices,
      });
    }
    forecastInputs.productPriceMap.forEach((value, key) => {
      productPriceMap.set(key, value);
    });
  } else {
    type DailyQtyRow = {
      productId: number;
      date: string;
      qty: number;
      avgPrice: number;
    };
    const rawRows = await prisma.$queryRaw<DailyQtyRow[]>`
      SELECT
        si."productId"::int AS "productId",
        DATE(s."createdAt") AS "date",
        SUM(si.quantity)::int AS qty,
        AVG(si."priceAtSale")::numeric AS "avgPrice"
      FROM "SaleItem" si
      JOIN "Sale" s ON s.id = si."saleId"
      WHERE s."businessId" = ${businessId}
        AND s."paymentStatus" = 'Paid'
        AND s."createdAt" >= ${since}
      GROUP BY si."productId", DATE(s."createdAt")
      ORDER BY si."productId", DATE(s."createdAt")
    `;

    for (const row of rawRows) {
      const pid = Number(row.productId);
      if (!byProduct.has(pid)) {
        byProduct.set(pid, { entries: [], historicalPrices: [] });
      }
      const dateStr =
        typeof row.date === "string" ? row.date.split("T")[0] : new Date(row.date).toISOString().split("T")[0];
      byProduct.get(pid)!.entries.push({ date: dateStr, qty: Number(row.qty) });
      byProduct.get(pid)!.historicalPrices.push(Number(row.avgPrice));
    }

    const products = await prisma.product.findMany({
      where: { businessId, deletedAt: null, isActive: true },
      select: { id: true, sellingPrice: true, recipeCost: true },
    });

    for (const p of products) {
      productPriceMap.set(p.id, {
        sellingPrice: Number(p.sellingPrice),
        recipeCost: Number(p.recipeCost),
      });
    }
  }

  console.log(`[FORECAST] Business ${businessId}: ${byProduct.size} products with sales data`);

  // ─── Step 4: Generate Product-Level Forecasts ──────────────────────────
  const productForecastMap = new Map<
    number,
    {
      date: string;
      qty: number;
      lower: number;
      upper: number;
      metadata: object;
    }[]
  >();
  let skippedProducts = 0;
  const priceChangeNotes: string[] = [];

  for (const [productId, data] of byProduct) {
    const { entries, historicalPrices } = data;

    // Build time series with zero-fill for missing days
    const series = allDates.map((d) => {
      const found = entries.find((e) => e.date === d);
      return found ? found.qty : 0;
    });
    const nonZero = series.filter((v) => v > 0).length;

    if (nonZero < 1) {
      skippedProducts++;
      continue;
    }

    // ─── 4a: Calculate Weekday Multipliers (Seasonality) ─────────────────
    const weekdayMultipliers = calculateWeekdayMultipliers(entries);

    // ─── 4b: Calculate Volatility and Dynamic Buffer ─────────────────────
    const volatility = calculateVolatilityAndBuffer(series);

    // ─── 4c: Detect Price Changes ────────────────────────────────────────
    const currentPrice = productPriceMap.get(productId)?.sellingPrice ?? 0;
    const priceChangeInfo = detectPriceChange(historicalPrices, currentPrice);
    if (priceChangeInfo.detected) {
      const productName = (
        await prisma.product.findUnique({
          where: { id: productId },
          select: { name: true },
        })
      )?.name;
      priceChangeNotes.push(`${productName}: ${priceChangeInfo.note}`);
    }

    // ─── 4d: Generate Base Forecast (ARIMA or WMA) ───────────────────────
    let preds: number[];
    let errs: number[];
    let method: "ARIMA" | "WMA" = "WMA";

    if (nonZero >= 5) {
      try {
        const arima = new ARIMA({ auto: true, verbose: false });
        arima.train(series);
        const [p, e] = arima.predict(7) as [number[], number[]];
        preds = p;
        errs = e;
        method = "ARIMA";
      } catch {
        // Fallback to WMA
        const window = Math.min(series.length, 14);
        const recent = series.slice(-window);
        let wSum = 0,
          wTotal = 0;
        recent.forEach((v, idx) => {
          const w = idx + 1;
          wSum += v * w;
          wTotal += w;
        });
        preds = Array(7).fill(Math.round(wSum / wTotal));
        errs = Array(7).fill(1);
      }
    } else {
      // Not enough data - use WMA
      const window = Math.min(series.length, 14);
      const recent = series.slice(-window);
      let wSum = 0,
        wTotal = 0;
      recent.forEach((v, idx) => {
        const w = idx + 1;
        wSum += v * w;
        wTotal += w;
      });
      const wma = wTotal > 0 ? Math.round(wSum / wTotal) : 0;
      preds = Array(7).fill(wma);
      errs = Array(7).fill(Math.max(1, wma * 0.3));
    }

    // ─── 4e: Apply Seasonality Adjustment ────────────────────────────────
    preds = applySeasonalityAdjustment(preds, now, weekdayMultipliers);

    // ─── 4f: Cap predictions to reasonable bounds ────────────────────────
    const maxQty = Math.max(...series, 1);
    preds = preds.map((v) => Math.max(0, Math.min(v, maxQty * 2)));
    const avgQty = series.reduce((s, v) => s + v, 0) / Math.max(nonZero, 1);
    const qtyCap = Math.max(avgQty * 3, 1);

    // ─── 4g: Save Product Forecasts ──────────────────────────────────────
    const forecastsForProduct: {
      date: string;
      qty: number;
      lower: number;
      upper: number;
      metadata: object;
    }[] = [];

    await Promise.all(
      preds.map((val, i) => {
        const forecastDate = new Date(now);
        forecastDate.setDate(forecastDate.getDate() + i + 1);
        const dateStr = forecastDate.toISOString().split("T")[0];
        const se = errs?.[i] ?? Math.abs(val) * 0.2;
        const qty = Math.max(0, Math.round(val));
        const lower = Math.max(0, Math.round(val - 1.96 * se));
        const rawUpper = Math.round(val + 1.96 * se);
        const upper = Math.max(qty, Math.min(rawUpper, Math.round(qty + qtyCap)));

        // Non-linear confidence decay
        const confidence = calculateNonLinearConfidence(i);

        // Dynamic production recommendation
        const rec = generateProductionRecommendation(qty, volatility);

        // Metadata for transparency
        const metadata = {
          method,
          volatilityLevel: volatility.level,
          bufferPercent: volatility.bufferPercentage,
          seasonalityMultiplier: weekdayMultipliers[forecastDate.getDay()],
          priceChangeDetected: priceChangeInfo.detected,
        };

        forecastsForProduct.push({
          date: dateStr,
          qty,
          lower,
          upper,
          metadata,
        });

        return prisma.productForecast.upsert({
          where: { productId_date: { productId, date: new Date(dateStr) } },
          update: {
            predictedQty: qty,
            lowerBound: lower,
            upperBound: upper,
            confidenceScore: confidence,
            recommendedProduction: rec,
          },
          create: {
            productId,
            date: new Date(dateStr),
            predictedQty: qty,
            lowerBound: lower,
            upperBound: upper,
            confidenceScore: confidence,
            recommendedProduction: rec,
          },
        });
      }),
    );

    productForecastMap.set(productId, forecastsForProduct);
  }

  console.log(
    `[FORECAST] Business ${businessId}: Generated forecasts for ${productForecastMap.size} products, ` +
      `skipped ${skippedProducts} (insufficient data)`,
  );

  // ─── Step 5: Aggregate to Business Forecast ────────────────────────────
  const forecastDates: string[] = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    forecastDates.push(d.toISOString().split("T")[0]);
  }

  const dailyAggregates: {
    date: string;
    predictedRevenue: number;
    predictedCost: number;
    lowerRevenue: number;
    upperRevenue: number;
  }[] = [];

  for (const dateStr of forecastDates) {
    let totalRevenue = 0;
    let totalCost = 0;
    let totalLowerRevenue = 0;
    let totalUpperRevenue = 0;

    for (const [productId, forecasts] of productForecastMap) {
      const dayForecast = forecasts.find((f) => f.date === dateStr);
      if (!dayForecast) continue;

      const prices = productPriceMap.get(productId);
      if (!prices) continue;

      totalRevenue += dayForecast.qty * prices.sellingPrice;
      totalCost += dayForecast.qty * prices.recipeCost;
      totalLowerRevenue += dayForecast.lower * prices.sellingPrice;
      totalUpperRevenue += dayForecast.upper * prices.sellingPrice;
    }

    dailyAggregates.push({
      date: dateStr,
      predictedRevenue: Math.round(totalRevenue),
      predictedCost: Math.round(totalCost),
      lowerRevenue: Math.round(totalLowerRevenue),
      upperRevenue: Math.round(totalUpperRevenue),
    });
  }

  // ─── Fallback: Use Historical Average if No Product Forecasts ──────────
  if (dailyAggregates.length === 0 || dailyAggregates.every((d) => d.predictedRevenue === 0)) {
    console.log(`[FORECAST] Business ${businessId}: Using historical average fallback`);
    const bakeryFallback = useBakery ? await getBakeryDailyAnalytics(businessId, since, now) : null;
    const bizMetrics = useBakery
      ? []
      : await prisma.businessMetrics.findMany({
          where: { businessId, date: { gte: since } },
          orderBy: { date: "asc" },
        });

    const rowCount = useBakery ? bakeryFallback?.data.length ?? 0 : bizMetrics.length;
    if (rowCount >= 7) {
      const avgRevenue = useBakery
        ? (bakeryFallback?.totals.revenue ?? 0) / Math.max(1, bakeryFallback?.data.length ?? 1)
        : bizMetrics.reduce((s, m) => s + Number(m.totalRevenue), 0) / bizMetrics.length;
      const avgProfit = useBakery
        ? (bakeryFallback?.totals.profit ?? 0) / Math.max(1, bakeryFallback?.data.length ?? 1)
        : bizMetrics.reduce((s, m) => s + Number(m.totalProfit), 0) / bizMetrics.length;

      for (let i = 0; i < forecastDates.length; i++) {
        dailyAggregates[i] = {
          date: forecastDates[i],
          predictedRevenue: Math.round(avgRevenue),
          predictedCost: Math.round(avgRevenue - avgProfit),
          lowerRevenue: Math.round(avgRevenue * 0.7),
          upperRevenue: Math.round(avgRevenue * 1.3),
        };
      }
    }
  }

  // ─── Step 6: Save Business Forecasts with Metadata ─────────────────────
  if (dailyAggregates.length > 0) {
    console.log(
      `[FORECAST] Business ${businessId}: Saving ${dailyAggregates.length} days, ` +
        `first day revenue = Rp ${dailyAggregates[0]?.predictedRevenue.toLocaleString()}`,
    );

    await Promise.all(
      dailyAggregates.map((agg, i) => {
        const predictedProfit = agg.predictedRevenue - agg.predictedCost;
        const confidence = calculateNonLinearConfidence(i);

        return prisma.businessForecast.upsert({
          where: { businessId_date: { businessId, date: new Date(agg.date) } },
          update: {
            predictedRevenue: agg.predictedRevenue,
            predictedProfit: Math.max(0, predictedProfit),
            lowerBound: agg.lowerRevenue,
            upperBound: agg.upperRevenue,
            confidenceScore: confidence,
          },
          create: {
            businessId,
            date: new Date(agg.date),
            predictedRevenue: agg.predictedRevenue,
            predictedProfit: Math.max(0, predictedProfit),
            lowerBound: agg.lowerRevenue,
            upperBound: agg.upperRevenue,
            confidenceScore: confidence,
          },
        });
      }),
    );
  }

  // ─── Step 7: Evaluate Forecast Accuracy (Background) ───────────────────
  // This runs after forecast generation and doesn't block the main flow
  await evaluateForecastAccuracy(businessId);
}

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH SCORE GENERATION — calculates and saves daily business health scores
// ═══════════════════════════════════════════════════════════════════════════════

async function generateHealthScoreForBusiness(businessId: number) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const since30d = new Date(today);
  since30d.setDate(since30d.getDate() - 30);
  const useBakery = await hasBakeryOrders(businessId);

  if (useBakery) {
    const series = await getBakeryHealthSeries(businessId, 30);
    const latest = series.length > 0 ? series[series.length - 1] : null;
    if (!latest) return;

    await prisma.businessHealthScores.upsert({
      where: { businessId_date: { businessId, date: today } },
      update: {
        revenueScore: latest.revenueScore,
        profitScore: latest.profitScore,
        wasteScore: latest.wasteScore,
        stabilityScore: latest.stabilityScore,
        overallScore: latest.overallScore,
        classification: latest.classification,
      },
      create: {
        businessId,
        date: today,
        revenueScore: latest.revenueScore,
        profitScore: latest.profitScore,
        wasteScore: latest.wasteScore,
        stabilityScore: latest.stabilityScore,
        overallScore: latest.overallScore,
        classification: latest.classification,
      },
    });
    return;
  }

  // ─── 1. Get Business Metrics for last 30 days ───
  const metrics = await prisma.businessMetrics.findMany({
    where: {
      businessId,
      date: { gte: since30d },
    },
    orderBy: { date: "asc" },
  });

  const totalRevenue30d = metrics.reduce((sum, m) => sum + Number(m.totalRevenue), 0);
  const totalProfit30d = metrics.reduce((sum, m) => sum + Number(m.totalProfit), 0);
  const avgMargin = totalRevenue30d > 0 ? (totalProfit30d / totalRevenue30d) * 100 : 0;

  // ─── 2. Get Waste Data for last 30 days ───
  const wasteMovements = await prisma.$queryRaw<{ totalWasteCost: number }[]>`
    SELECT COALESCE(SUM(ABS(im.quantity) * im."costPerUnit"), 0)::numeric AS "totalWasteCost"
    FROM "InventoryMovement" im
    JOIN "StockDocument" sd ON sd.id = im."stockDocumentId"
    WHERE sd."businessId" = ${businessId}
      AND sd.type = 'Waste'
      AND im."createdAt" >= ${since30d}
  `;
  const totalWasteCost = Number(wasteMovements[0]?.totalWasteCost ?? 0);
  const wastePercentage = totalRevenue30d > 0 ? (totalWasteCost / totalRevenue30d) * 100 : 0;

  // ─── 3. Calculate Revenue Score (0-25) ───
  // Dynamic target: 120% of business's own average monthly revenue
  // This auto-adapts to each business's scale
  const avgDailyRevenue = metrics.length > 0 ? totalRevenue30d / metrics.length : 0;
  const REVENUE_TARGET = Math.max(avgDailyRevenue * 30 * 1.2, 100000); // Min 100k to avoid division issues
  const revenueScore = Math.min(25, (totalRevenue30d / REVENUE_TARGET) * 25);

  // ─── 4. Calculate Profit Score (0-25) ───
  // Linear scale: 50%+ margin = 25, 0% = 0
  const MARGIN_TARGET = 50;
  const profitScore = Math.min(25, (avgMargin / MARGIN_TARGET) * 25);

  // ─── 5. Calculate Waste Score (0-25) ───
  // Inverted: lower waste = higher score
  // <1% waste = 25, 5%+ waste = 0
  const wasteScore = Math.max(0, 25 - wastePercentage * 5);

  // ─── 6. Calculate Stability Score (0-25) ───
  // Uses Coefficient of Variation of daily revenue
  // CoV < 0.3 = very stable (25), CoV > 1 = unstable (0)
  let stabilityScore = 12.5; // Default middle score if not enough data

  if (metrics.length >= 7) {
    const dailyRevenues = metrics.map((m) => Number(m.totalRevenue));
    const mean = dailyRevenues.reduce((a, b) => a + b, 0) / dailyRevenues.length;

    if (mean > 0) {
      const squaredDiffs = dailyRevenues.map((rev) => Math.pow(rev - mean, 2));
      const variance = squaredDiffs.reduce((a, b) => a + b, 0) / dailyRevenues.length;
      const stdDev = Math.sqrt(variance);
      const coefficientOfVariation = stdDev / mean;

      // Scale: CoV 0 = 25, CoV 1+ = 0
      stabilityScore = Math.max(0, Math.min(25, 25 - coefficientOfVariation * 25));
    }
  }

  // ─── 7. Calculate Overall Score ───
  const overallScore = revenueScore + profitScore + wasteScore + stabilityScore;

  // ─── 8. Determine Classification ───
  let classification: string;
  if (overallScore >= 80) classification = "Excellent";
  else if (overallScore >= 60) classification = "Healthy";
  else if (overallScore >= 40) classification = "Warning";
  else classification = "Critical";

  // ─── 9. Save to Database ───
  await prisma.businessHealthScores.upsert({
    where: { businessId_date: { businessId, date: today } },
    update: {
      revenueScore,
      profitScore,
      wasteScore,
      stabilityScore,
      overallScore,
      classification,
    },
    create: {
      businessId,
      date: today,
      revenueScore,
      profitScore,
      wasteScore,
      stabilityScore,
      overallScore,
      classification,
    },
  });

  console.log(
    `[HEALTH] Business ${businessId}: revenue=${revenueScore.toFixed(1)}, profit=${profitScore.toFixed(1)}, waste=${wasteScore.toFixed(1)}, stability=${stabilityScore.toFixed(1)}, overall=${overallScore.toFixed(1)} (${classification})`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AI INSIGHT GENERATION — brief chart labels per section
// ═══════════════════════════════════════════════════════════════════════════════

const INSIGHT_SECTIONS: {
  key: string;
  prompt: string;
  gather: (bid: number) => Promise<string>;
}[] = [
  {
    key: "revenue",
    prompt:
      "Berikan 1-2 kalimat ringkas dan profesional tentang tren pendapatan harian bisnis ini. Soroti pola utama (naik, turun, atau stabil) serta implikasinya terhadap kinerja penjualan.",
    gather: async (bid) => {
      if (await hasBakeryOrders(bid)) {
        const now = new Date();
        const from = new Date(now);
        from.setDate(from.getDate() - 29);
        from.setHours(0, 0, 0, 0);
        const bakery = await getBakeryDailyAnalytics(bid, from, now);
        const total = bakery.totals.revenue;
        const dayCount = bakery.data.length;
        const avg = dayCount > 0 ? Math.round(total / dayCount) : 0;
        return `Pendapatan ${dayCount} hari terakhir: Rp ${total.toLocaleString("id-ID")}, rata-rata harian Rp ${avg.toLocaleString("id-ID")}.`;
      }
      // Match EXACTLY what frontend /api/analytics/daily returns:
      // Use UTC boundaries to match database DATE type (stored as midnight UTC)
      const now = new Date();
      const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
      const fromUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29, 0, 0, 0, 0));

      const metrics = await prisma.businessMetrics.findMany({
        where: { businessId: bid, date: { gte: fromUTC, lte: todayUTC } },
        orderBy: { date: "asc" },
      });

      // Zero-fill: build contiguous day array (same as /api/analytics/daily)
      const cursor = new Date(fromUTC);
      const end = new Date(todayUTC);
      end.setUTCHours(0, 0, 0, 0);
      let dayCount = 0;
      let total = 0;

      while (cursor <= end) {
        const iso = cursor.toISOString().split("T")[0];
        const found = metrics.find((m) => m.date.toISOString().split("T")[0] === iso);
        total += Number(found?.totalRevenue ?? 0);
        dayCount++;
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }

      const avg = dayCount > 0 ? Math.round(total / dayCount) : 0;
      return `Pendapatan ${dayCount} hari terakhir: Rp ${total.toLocaleString("id-ID")}, rata-rata harian Rp ${avg.toLocaleString("id-ID")}.`;
    },
  },
  {
    key: "growth",
    prompt:
      "Berikan 1-2 kalimat ringkas tentang pertumbuhan bisnis bulan ini dibandingkan bulan lalu, dengan menyoroti arah pertumbuhan (positif, stagnan, atau negatif) dan dampaknya ke keberlanjutan bisnis.",
    gather: async (bid) => {
      if (await hasBakeryOrders(bid)) {
        const now = new Date();
        const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        const [cur, prev] = await Promise.all([
          getBakeryDailyAnalytics(bid, thisMonth, now),
          getBakeryDailyAnalytics(bid, lastMonth, lastMonthEnd),
        ]);
        const curRev = cur.totals.revenue;
        const prevRev = prev.totals.revenue;
        const growth = prevRev > 0 ? (((curRev - prevRev) / prevRev) * 100).toFixed(1) : "N/A";
        return `Pendapatan bulan ini: Rp ${curRev.toLocaleString("id-ID")}, bulan lalu: Rp ${prevRev.toLocaleString("id-ID")}, pertumbuhan: ${growth}%.`;
      }
      const now = new Date();
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const [cur, prev] = await Promise.all([
        prisma.businessMetrics.findMany({
          where: { businessId: bid, date: { gte: thisMonth } },
        }),
        prisma.businessMetrics.findMany({
          where: { businessId: bid, date: { gte: lastMonth, lt: thisMonth } },
        }),
      ]);
      const curRev = cur.reduce((s, x) => s + Number(x.totalRevenue), 0);
      const prevRev = prev.reduce((s, x) => s + Number(x.totalRevenue), 0);
      const growth = prevRev > 0 ? (((curRev - prevRev) / prevRev) * 100).toFixed(1) : "N/A";
      return `Pendapatan bulan ini: Rp ${curRev.toLocaleString("id-ID")}, bulan lalu: Rp ${prevRev.toLocaleString("id-ID")}, pertumbuhan: ${growth}%.`;
    },
  },
  {
    key: "products",
    prompt:
      "Berikan 1-2 kalimat ringkas dan bernada bisnis tentang performa produk: produk mana yang paling berkontribusi ke omzet dan profit, serta pesan singkat yang dapat dibaca manajemen.",
    gather: async (bid) => {
      if (await hasBakeryOrders(bid)) {
        const since = new Date();
        since.setDate(since.getDate() - 30);
        const rows = await getBakeryProductAnalytics(bid, since, new Date());
        if (rows.length === 0) return "Belum ada data penjualan produk 30 hari terakhir.";
        return `Top produk: ${rows
          .slice(0, 5)
          .map((r) => `${r.productName} (${r.quantitySold} pcs, Rp ${Math.round(r.revenue).toLocaleString("id-ID")})`)
          .join(", ")}.`;
      }
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const rows = await prisma.$queryRaw<{ name: string; qty: number; revenue: number }[]>`
        SELECT p.name, SUM(si.quantity)::int AS qty, SUM(si.quantity * si."priceAtSale")::numeric AS revenue
        FROM "SaleItem" si
        JOIN "Sale" s ON s.id = si."saleId"
        JOIN "Product" p ON p.id = si."productId"
        WHERE s."businessId" = ${bid} AND s."paymentStatus" = 'Paid' AND s."createdAt" >= ${since}
        GROUP BY p.name ORDER BY revenue DESC LIMIT 5
      `;
      if (rows.length === 0) return "Belum ada data penjualan produk 30 hari terakhir.";
      return `Top produk: ${rows.map((r) => `${r.name} (${r.qty} pcs, Rp ${Number(r.revenue).toLocaleString("id-ID")})`).join(", ")}.`;
    },
  },
  {
    key: "health",
    prompt:
      "Berikan 1-2 kalimat ringkas dan jelas tentang skor kesehatan bisnis dan klasifikasi saat ini, dengan menekankan apakah kondisi tergolong sehat, perlu perhatian, atau berisiko. Perlu diketahui semakin besar skor ,informasi ini bisa kamu gunakan dengan bijak.",
    gather: async (bid) => {
      const latest = await prisma.businessHealthScores.findFirst({
        where: { businessId: bid },
        orderBy: { date: "desc" },
      });
      if (!latest) return "Belum ada data skor kesehatan bisnis.";
      return `Skor: overall ${latest.overallScore.toFixed(1)}, revenue ${latest.revenueScore.toFixed(1)}, profit ${latest.profitScore.toFixed(1)}, waste ${latest.wasteScore.toFixed(1)}, stability ${latest.stabilityScore.toFixed(1)}. Klasifikasi: ${latest.classification ?? "N/A"}.`;
    },
  },
  {
    key: "waste",
    prompt:
      "Berikan 1-2 kalimat ringkas dan profesional tentang tingkat limbah/waste bisnis ini terhadap pendapatan, serta apakah levelnya masih wajar atau sudah menggerus profit.",
    gather: async (bid) => {
      if (await hasBakeryOrders(bid)) {
        const since = new Date();
        since.setDate(since.getDate() - 30);
        const wasteMoves = await prisma.$queryRaw<{ totalWaste: number }[]>`
          SELECT COALESCE(SUM(ABS(im.quantity) * im."costPerUnit"), 0)::numeric AS "totalWaste"
          FROM "InventoryMovement" im
          JOIN "StockDocument" sd ON sd.id = im."stockDocumentId"
          WHERE sd."businessId" = ${bid}
            AND sd.type = 'Waste'
            AND im."createdAt" >= ${since}
        `;
        const waste = Number(wasteMoves[0]?.totalWaste ?? 0);
        const bakery = await getBakeryDailyAnalytics(bid, since, new Date());
        const rev = bakery.totals.revenue;
        const pct = rev > 0 ? ((waste / rev) * 100).toFixed(1) : "0";
        return `Biaya limbah 30 hari: Rp ${waste.toLocaleString("id-ID")} (${pct}% dari pendapatan Rp ${rev.toLocaleString("id-ID")}).`;
      }
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const wasteMoves = await prisma.$queryRaw<{ totalWaste: number }[]>`
        SELECT COALESCE(SUM(ABS(im.quantity) * im."costPerUnit"), 0)::numeric AS "totalWaste"
        FROM "InventoryMovement" im
        JOIN "StockDocument" sd ON sd.id = im."stockDocumentId"
        WHERE sd."businessId" = ${bid}
          AND sd.type = 'Waste'
          AND im."createdAt" >= ${since}
      `;
      const waste = Number(wasteMoves[0]?.totalWaste ?? 0);
      const metrics = await prisma.businessMetrics.findMany({
        where: { businessId: bid, date: { gte: since } },
      });
      const rev = metrics.reduce((s, m) => s + Number(m.totalRevenue), 0);
      const pct = rev > 0 ? ((waste / rev) * 100).toFixed(1) : "0";
      return `Biaya limbah 30 hari: Rp ${waste.toLocaleString("id-ID")} (${pct}% dari pendapatan Rp ${rev.toLocaleString("id-ID")}).`;
    },
  },
  {
    key: "kasbon",
    prompt:
      "Berikan 1-2 kalimat ringkas tentang status kasbon/piutang bisnis ini, dengan fokus pada besarnya piutang tertunggak dan implikasinya terhadap arus kas.",
    gather: async (bid) => {
      const debts = await prisma.debt.findMany({
        where: { businessId: bid },
        include: { payments: true },
      });
      const total = debts.reduce((s, d) => s + Number(d.totalAmount), 0);
      const paid = debts.reduce((s, d) => s + d.payments.reduce((ps, p) => ps + Number(p.amount), 0), 0);
      const outstanding = total - paid;
      const overdue = debts.filter((d) => (d.status as string) === "overdue").length;
      return `Total kasbon: Rp ${total.toLocaleString("id-ID")}, terbayar: Rp ${paid.toLocaleString("id-ID")}, sisa: Rp ${outstanding.toLocaleString("id-ID")}, jatuh tempo: ${overdue}.`;
    },
  },
  {
    key: "forecast",
    prompt:
      "Berikan 1-2 kalimat ringkas tentang prediksi pendapatan dan laba 7 hari ke depan. Bandingkan dengan rata-rata aktual minggu lalu. Perhatikan tren naik/turun dan hari-hari penting.",
    gather: async (bid) => {
      const now = new Date();
      const fc = await prisma.businessForecast.findMany({
        where: { businessId: bid },
        orderBy: { date: "asc" },
      });
      if (fc.length === 0) return "Belum ada data prediksi.";

      // Get last 7 days actual data for comparison
      const since7d = new Date(now);
      since7d.setDate(since7d.getDate() - 7);
      const bakeryActuals = (await hasBakeryOrders(bid))
        ? await getBakeryDailyAnalytics(bid, since7d, now)
        : null;
      const recentMetrics = bakeryActuals
        ? null
        : await prisma.businessMetrics.findMany({
            where: { businessId: bid, date: { gte: since7d } },
            orderBy: { date: "asc" },
          });

      const actualAvg = bakeryActuals
        ? Math.round(bakeryActuals.totals.revenue / Math.max(1, bakeryActuals.data.length))
        : recentMetrics && recentMetrics.length > 0
          ? Math.round(recentMetrics.reduce((s, m) => s + Number(m.totalRevenue), 0) / recentMetrics.length)
          : 0;
      const actualProfitAvg = bakeryActuals
        ? Math.round(bakeryActuals.totals.profit / Math.max(1, bakeryActuals.data.length))
        : recentMetrics && recentMetrics.length > 0
          ? Math.round(recentMetrics.reduce((s, m) => s + Number(m.totalProfit), 0) / recentMetrics.length)
          : 0;

      const forecastAvg = Math.round(fc.reduce((s, f) => s + Number(f.predictedRevenue), 0) / fc.length);
      const forecastProfitAvg = Math.round(fc.reduce((s, f) => s + Number(f.predictedProfit), 0) / fc.length);

      const revenueChange = actualAvg > 0 ? (((forecastAvg - actualAvg) / actualAvg) * 100).toFixed(1) : "N/A";
      const profitChange =
        actualProfitAvg > 0 ? (((forecastProfitAvg - actualProfitAvg) / actualProfitAvg) * 100).toFixed(1) : "N/A";

      // Calendar context - Indonesian holidays and weekends
      const dateStr = now.toLocaleDateString("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      const weekendDays = fc.filter((f) => {
        const day = new Date(f.date).getDay();
        return day === 0 || day === 6;
      }).length;

      // Build context string
      let context = `Tanggal hari ini: ${dateStr}.\n`;
      context += `\nRata-rata AKTUAL 7 hari terakhir: Pendapatan Rp ${actualAvg.toLocaleString("id-ID")}, Laba Rp ${actualProfitAvg.toLocaleString("id-ID")}.`;
      context += `\nRata-rata PREDIKSI 7 hari ke depan: Pendapatan Rp ${forecastAvg.toLocaleString("id-ID")} (${revenueChange}%), Laba Rp ${forecastProfitAvg.toLocaleString("id-ID")} (${profitChange}%).`;
      context += `\nJumlah hari weekend dalam prediksi: ${weekendDays} hari.`;
      context += `\n\nDetail prediksi harian:\n`;
      context += fc
        .map((f) => {
          const dayName = new Date(f.date).toLocaleDateString("id-ID", {
            weekday: "short",
            day: "numeric",
            month: "short",
          });
          return `${dayName}: rev Rp ${Number(f.predictedRevenue).toLocaleString("id-ID")}, profit Rp ${Number(f.predictedProfit).toLocaleString("id-ID")}, keyakinan ${Number(f.confidenceScore)}%`;
        })
        .join("; ");

      return context;
    },
  },
];

async function generateInsightsForBusiness(businessId: number) {
  for (const section of INSIGHT_SECTIONS) {
    try {
      const dataContext = await section.gather(businessId);
      if (dataContext.includes("Belum ada")) {
        // Skip sections with no data
        continue;
      }

      // Build calendar-aware system prompt
      const now = new Date();
      const dateContext = now.toLocaleDateString("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });

      const completion = await createGroqCompletion({
        messages: [
          {
            role: "system",
            content:
              `Kamu adalah konsultan bisnis AI untuk UMKM Indonesia. Hari ini ${dateContext}. ` +
              `Berikan ringkasan SANGAT singkat (1-2 kalimat) dalam Bahasa Indonesia dengan gaya profesional seperti catatan analis bisnis. ` +
              `PENTING: Gunakan ANGKA PERSIS yang diberikan dalam data, JANGAN menghitung ulang atau memperkirakan. ` +
              `Fokus pada pesan yang relevan untuk pemilik/manajer bisnis (misalnya tren utama, risiko, atau peluang). ` +
              `Jangan gunakan markdown atau emotikon. Langsung sampaikan poin utama secara lugas.`,
          },
          {
            role: "user",
            content: `${section.prompt}\n\nData:\n${dataContext}`,
          },
        ],
        model: GROQ_MODELS.text.primary,
        temperature: 0.3,
        maxTokens: 150,
      });

      const insight = completion.choices?.[0]?.message?.content?.trim();
      if (!insight) continue;

      await prisma.analyticsInsight.upsert({
        where: { businessId_section: { businessId, section: section.key } },
        update: { insight, generatedAt: new Date() },
        create: {
          businessId,
          section: section.key,
          insight,
          generatedAt: new Date(),
        },
      });
    } catch (err) {
      console.error(`[CRON] Insight generation failed for biz ${businessId}, section ${section.key}:`, err);
    }
  }
}

async function handleCronRequest(req: NextRequest) {
  // Allow access via CRON_SECRET or authenticated user session
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const hasCronSecret = cronSecret && authHeader === `Bearer ${cronSecret}`;

  let authedUser: { userId: number; businessId: number } | null = null;
  if (!hasCronSecret) {
    try {
      authedUser = await requireAuth();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    // If called by an authenticated user, only generate for their business
    // If called by cron (CRON_SECRET), generate for all businesses
    const businesses = authedUser
      ? await prisma.business.findMany({
          where: { id: authedUser.businessId },
          select: { id: true, name: true },
        })
      : await prisma.business.findMany({ select: { id: true, name: true } });
    const results: { businessId: number; name: string; status: string }[] = [];

    for (const biz of businesses) {
      try {
        await generateForecastForBusiness(biz.id);
        await generateHealthScoreForBusiness(biz.id);
        await generateInsightsForBusiness(biz.id);
        results.push({ businessId: biz.id, name: biz.name, status: "success" });
      } catch (err) {
        console.error(`[CRON] Forecast failed for business ${biz.id}:`, err);
        results.push({
          businessId: biz.id,
          name: biz.name,
          status: `error: ${String(err).slice(0, 100)}`,
        });
      }
    }

    console.log(
      `[CRON] Analytics generation complete: ${results.filter((r) => r.status === "success").length}/${results.length} succeeded`,
    );

    return NextResponse.json({
      success: true,
      generatedAt: new Date().toISOString(),
      results,
    });
  } catch (error) {
    console.error("[CRON] generate-analytics error:", error);
    return NextResponse.json({ error: "Failed to generate analytics", details: String(error) }, { status: 500 });
  }
}

// Vercel Cron Jobs always send GET requests
export async function GET(req: NextRequest) {
  return handleCronRequest(req);
}

// Allow manual POST calls (authenticated users or direct API calls with CRON_SECRET)
export async function POST(req: NextRequest) {
  return handleCronRequest(req);
}
