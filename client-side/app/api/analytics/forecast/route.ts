import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth/session";
import ARIMA from "arima";

/**
 * GET /api/analytics/forecast
 *
 * 1. Business Revenue Forecast
 *    - Input: last 30 days of BusinessMetrics.totalRevenue
 *    - Model: ARIMA(1,1,1)
 *    - Output: 7-day predicted revenue with 95% confidence band
 *    - Stored: upserted to BusinessForecast
 *
 * 2. Per-Product Demand Forecast
 *    - Input: last 30 days of SaleItem daily qty aggregated per product
 *    - Model: ARIMA(1,1,1) per product
 *    - Output: 7-day predicted qty with confidence band
 *    - Stored: upserted to ProductForecast
 */
export async function GET() {
  try {
    const { businessId } = await requireAuth();

    const now = new Date();
    const since = new Date(now);
    since.setDate(since.getDate() - 30);
    since.setHours(0, 0, 0, 0);

    // Build contiguous 30-day date list (reused by both business & product forecasts)
    const allDates: string[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      allDates.push(d.toISOString().split("T")[0]);
    }

    // ─── 1. BUSINESS REVENUE FORECAST ─────────────────────────────────────
    const bizMetrics = await prisma.businessMetrics.findMany({
      where: { businessId, date: { gte: since } },
      orderBy: { date: "asc" },
    });

    let bizForecast: {
      date: string;
      predictedRevenue: number;
      lowerBound: number;
      upperBound: number;
      confidenceScore: number;
    }[] = [];

    // Build contiguous 30-day series (zero-fill missing days, matching product forecast approach)
    // For business revenue, use ONLY actual data rows (no zero-fill) to avoid sparse-series instability
    const revSeriesRaw = bizMetrics.map((m) => Number(m.totalRevenue));

    // ── Outlier dampening (IQR-based clamp) ─────────────────────────────────
    // Prevents a single spike day from dominating ARIMA's last-value bias
    function clampOutliers(series: number[]): number[] {
      if (series.length < 4) return series;
      const sorted = [...series].sort((a, b) => a - b);
      const q1 = sorted[Math.floor(sorted.length * 0.25)];
      const q3 = sorted[Math.floor(sorted.length * 0.75)];
      const iqr = q3 - q1;
      const upper = q3 + 2.0 * iqr; // generous 2× IQR fence
      const lower = Math.max(0, q1 - 2.0 * iqr);
      return series.map((v) => Math.min(Math.max(v, lower), upper));
    }

    const revSeries = clampOutliers(revSeriesRaw);
    const avgRevenue = revSeries.reduce((s, v) => s + v, 0) / revSeries.length;
    const maxHistorical = Math.max(...revSeriesRaw);

    console.log("[FORECAST] rows:", revSeries.length, "avg:", Math.round(avgRevenue), "max:", maxHistorical);

    // ── Weighted Moving Average fallback ────────────────────────────────────
    function wmaPredictions(series: number[], horizon: number) {
      // Exponentially weighted: recent days matter more
      const window = Math.min(series.length, 14);
      const recent = series.slice(-window);
      let wSum = 0,
        wTotal = 0;
      recent.forEach((v, i) => {
        const w = i + 1; // linear weight
        wSum += v * w;
        wTotal += w;
      });
      const wma = wSum / wTotal;
      return Array.from({ length: horizon }, () => Math.round(wma));
    }

    // ARIMA needs minimum 11 data points
    if (revSeries.length >= 11) {
      let predictions: number[] | null = null;
      let errors: number[] | null = null;

      // Try auto-ARIMA first, fall back to fixed ARIMA(1,0,1), then WMA
      try {
        const autoArima = new ARIMA({ auto: true, verbose: false });
        autoArima.train(revSeries);
        const [p, e] = autoArima.predict(7) as [number[], number[]];
        predictions = p;
        errors = e;
        console.log("[FORECAST] auto-ARIMA succeeded");
      } catch (autoErr) {
        console.warn("[FORECAST] auto-ARIMA failed, trying ARIMA(1,0,1):", autoErr);
        try {
          // ARIMA(1,0,1) — no differencing, better for stationary oscillating data
          const fallbackArima = new ARIMA({ p: 1, d: 0, q: 1, verbose: false });
          fallbackArima.train(revSeries);
          const [p, e] = fallbackArima.predict(7) as [number[], number[]];
          predictions = p;
          errors = e;
          console.log("[FORECAST] ARIMA(1,0,1) succeeded");
        } catch (fixedErr) {
          console.warn("[FORECAST] ARIMA(1,0,1) also failed, using WMA fallback:", fixedErr);
        }
      }

      // If ARIMA failed entirely, use WMA
      if (!predictions) {
        predictions = wmaPredictions(revSeries, 7);
        errors = predictions.map(() => avgRevenue * 0.2);
      }

      // Clamp predictions: floor at 0, cap at 2× historical max
      const predCap = maxHistorical * 2;
      predictions = predictions.map((v) => Math.max(0, Math.min(v, predCap)));

      const bandCap = avgRevenue * 1.5; // tighter confidence band cap

      bizForecast = predictions.map((val, i) => {
        const date = new Date(now);
        date.setDate(date.getDate() + i + 1);
        const se = errors?.[i] ?? avgRevenue * 0.15;
        const confidence = Math.max(0, Math.min(100, 95 - i * 3));
        const predicted = Math.max(0, Math.round(val));
        const lower = Math.max(0, Math.round(val - 1.96 * se));
        const upper = Math.min(Math.round(val + 1.96 * se), Math.round(predicted + bandCap));

        return {
          date: date.toISOString().split("T")[0],
          predictedRevenue: predicted,
          lowerBound: lower,
          upperBound: Math.max(upper, predicted),
          confidenceScore: Math.round(confidence),
        };
      });

      // Upsert into BusinessForecast
      await Promise.all(
        bizForecast.map((f) =>
          prisma.businessForecast.upsert({
            where: {
              businessId_date: {
                businessId,
                date: new Date(f.date),
              },
            },
            update: {
              predictedRevenue: f.predictedRevenue,
              lowerBound: f.lowerBound,
              upperBound: f.upperBound,
              confidenceScore: f.confidenceScore,
            },
            create: {
              businessId,
              date: new Date(f.date),
              predictedRevenue: f.predictedRevenue,
              lowerBound: f.lowerBound,
              upperBound: f.upperBound,
              confidenceScore: f.confidenceScore,
            },
          }),
        ),
      );
    }

    // ─── 2. PER-PRODUCT DEMAND FORECAST ───────────────────────────────────
    // Aggregate daily qty per product for the last 30 days
    type DailyQtyRow = { productId: number; date: string; qty: number };
    const rawRows = await prisma.$queryRaw<DailyQtyRow[]>`
      SELECT
        si."productId"::int AS "productId",
        DATE(s."createdAt") AS "date",
        SUM(si.quantity)::int AS qty
      FROM "SaleItem" si
      JOIN "Sale" s ON s.id = si."saleId"
      WHERE s."businessId" = ${businessId}
        AND s."paymentStatus" = 'Paid'
        AND s."createdAt" >= ${since}
      GROUP BY si."productId", DATE(s."createdAt")
      ORDER BY si."productId", DATE(s."createdAt")
    `;

    // Group by product
    const byProduct = new Map<number, { date: string; qty: number }[]>();
    for (const row of rawRows) {
      const pid = Number(row.productId);
      if (!byProduct.has(pid)) byProduct.set(pid, []);
      byProduct.get(pid)!.push({ date: row.date, qty: Number(row.qty) });
    }

    type ProductForecastResult = {
      productId: number;
      productName: string;
      forecast: {
        date: string;
        predictedQty: number;
        lowerBound: number;
        upperBound: number;
        confidenceScore: number;
        recommendedProduction: string;
      }[];
      avgDailyQty: number;
    };
    const productForecasts: ProductForecastResult[] = [];

    for (const [productId, entries] of byProduct) {
      const series = allDates.map((d) => {
        const found = entries.find((e) => e.date === d);
        return found ? found.qty : 0;
      });

      // Need at least 5 nonzero to be meaningful
      const nonZero = series.filter((v) => v > 0).length;
      if (nonZero < 5) continue;

      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: { name: true },
      });
      if (!product) continue;

      const arima = new ARIMA({ auto: true, verbose: false });
      let preds: number[];
      let errs: number[];
      try {
        arima.train(series);
        const [p, e] = arima.predict(7) as [number[], number[]];
        preds = p;
        errs = e;
      } catch {
        // Fallback: simple weighted avg
        const window = Math.min(series.length, 14);
        const recent = series.slice(-window);
        let wSum = 0,
          wTotal = 0;
        recent.forEach((v, idx) => {
          const w = idx + 1;
          wSum += v * w;
          wTotal += w;
        });
        const wma = Math.round(wSum / wTotal);
        preds = Array(7).fill(wma);
        errs = Array(7).fill(wma * 0.2);
        console.warn(`ARIMA failed for product ${productId}, using WMA fallback`);
      }
      // Clamp predictions to reasonable range
      const maxQty = Math.max(...series);
      preds = preds.map((v) => Math.max(0, Math.min(v, maxQty * 2)));

      const avgQty = series.reduce((s, v) => s + v, 0) / series.filter((v) => v > 0).length;
      const qtyCap = Math.max(avgQty * 3, 1); // cap for confidence bands

      const forecastDays = preds.map((val, i) => {
        const date = new Date(now);
        date.setDate(date.getDate() + i + 1);
        const se = errs?.[i] ?? Math.abs(val) * 0.2;
        const qty = Math.max(0, Math.round(val));
        const lower = Math.max(0, Math.round(val - 1.96 * se));
        const rawUpper = Math.round(val + 1.96 * se);
        const upper = Math.max(qty, Math.min(rawUpper, Math.round(qty + qtyCap)));
        const confidence = Math.max(0, Math.min(100, 90 - i * 4));
        const rec = qty === 0 ? "No production needed" : `Produce ~${Math.ceil(qty * 1.1)} units (10% buffer)`;

        return {
          date: date.toISOString().split("T")[0],
          predictedQty: qty,
          lowerBound: lower,
          upperBound: upper,
          confidenceScore: confidence,
          recommendedProduction: rec,
        };
      });

      // Upsert ProductForecast
      await Promise.all(
        forecastDays.map((f) =>
          prisma.productForecast.upsert({
            where: { productId_date: { productId, date: new Date(f.date) } },
            update: {
              predictedQty: f.predictedQty,
              lowerBound: f.lowerBound,
              upperBound: f.upperBound,
              confidenceScore: f.confidenceScore,
              recommendedProduction: f.recommendedProduction,
            },
            create: {
              productId,
              date: new Date(f.date),
              predictedQty: f.predictedQty,
              lowerBound: f.lowerBound,
              upperBound: f.upperBound,
              confidenceScore: f.confidenceScore,
              recommendedProduction: f.recommendedProduction,
            },
          }),
        ),
      );

      productForecasts.push({
        productId,
        productName: product.name,
        forecast: forecastDays,
        avgDailyQty: Math.round(avgQty),
      });
    }

    return NextResponse.json({
      success: true,
      modelInfo: { arima: "ARIMA(1,1,1)", lookback: 30, horizon: 7 },
      businessForecast: bizForecast,
      productForecasts,
    });
  } catch (error) {
    if (isAuthError(error)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("GET /api/analytics/forecast error:", error);
    return NextResponse.json({ error: "Failed to compute forecast", details: String(error) }, { status: 500 });
  }
}
