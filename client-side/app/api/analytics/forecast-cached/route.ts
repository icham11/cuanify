import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth/session";
import { getBakeryDailyAnalytics, hasBakeryOrders } from "@/lib/bookings/bakery-analytics";

/**
 * GET /api/analytics/forecast-cached
 *
 * Returns the LAST computed forecast stored in the DB without re-running the model.
 * The client should call POST /api/cron/generate-analytics to trigger a fresh computation.
 *
 * REFACTORED v2 - Now includes:
 * - Adaptive lookback metadata
 * - Price change detection notes
 * - Forecast accuracy metrics (MAPE)
 * - Per-product volatility/buffer info
 *
 * Response shape matches /api/analytics/forecast so the UI can use the same types.
 */
export async function GET() {
  try {
    const { businessId } = await requireAuth();

    // Only return forecasts for today and the next 7 days (use UTC to avoid timezone issues)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const maxDate = new Date(today);
    maxDate.setUTCDate(maxDate.getUTCDate() + 8); // next 7 days + today as buffer

    // ─── Business forecast ──────────────────────────────────────────────
    const bizForecastRows = await prisma.businessForecast.findMany({
      where: {
        businessId,
        date: { gte: today, lt: maxDate },
      },
      orderBy: { date: "asc" },
    });

    // Extract metadata from first forecast (all days share same metadata)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const forecastMetadata = (bizForecastRows[0] as any)?.metadata as {
      lookbackDays?: number;
      productsForecasted?: number;
      priceChangesDetected?: boolean;
      priceChangeNotes?: string[];
      generatedAt?: string;
    } | null;

    const businessForecast = bizForecastRows.map((r) => ({
      date: r.date.toISOString().split("T")[0],
      predictedRevenue: Number(r.predictedRevenue),
      predictedProfit: Number(r.predictedProfit ?? 0),
      lowerBound: Number(r.lowerBound),
      upperBound: Number(r.upperBound),
      confidenceScore: Number(r.confidenceScore),
    }));

    // ─── Product forecasts ──────────────────────────────────────────────
    const prodForecastRows = await prisma.productForecast.findMany({
      where: {
        product: { businessId },
        date: { gte: today, lt: maxDate },
      },
      include: {
        product: { select: { id: true, name: true } },
      },
      orderBy: { date: "asc" },
    });

    // Group by productId
    const productMap = new Map<
      number,
      {
        productId: number;
        productName: string;
        forecast: {
          date: string;
          predictedQty: number;
          lowerBound: number;
          upperBound: number;
          confidenceScore: number;
          recommendedProduction: string;
          metadata?: object;
        }[];
        totalQty: number;
        dayCount: number;
        volatilityLevel?: string;
        bufferPercent?: number;
      }
    >();

    for (const row of prodForecastRows) {
      const pid = row.product.id;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rowMetadata = (row as any).metadata as {
        volatilityLevel?: string;
        bufferPercent?: number;
        method?: string;
        seasonalityMultiplier?: number;
      } | null;

      if (!productMap.has(pid)) {
        productMap.set(pid, {
          productId: pid,
          productName: row.product.name,
          forecast: [],
          totalQty: 0,
          dayCount: 0,
          volatilityLevel: rowMetadata?.volatilityLevel,
          bufferPercent: rowMetadata?.bufferPercent,
        });
      }
      const entry = productMap.get(pid)!;
      entry.forecast.push({
        date: row.date.toISOString().split("T")[0],
        predictedQty: row.predictedQty,
        lowerBound: row.lowerBound,
        upperBound: row.upperBound,
        confidenceScore: Number(row.confidenceScore),
        recommendedProduction: row.recommendedProduction ?? "",
        metadata: rowMetadata ?? undefined,
      });
      entry.totalQty += row.predictedQty;
      entry.dayCount++;
    }

    const productForecasts = [...productMap.values()].map((p) => ({
      productId: p.productId,
      productName: p.productName,
      forecast: p.forecast,
      avgDailyQty: p.dayCount > 0 ? Math.round(p.totalQty / p.dayCount) : 0,
      volatilityLevel: p.volatilityLevel,
      bufferPercent: p.bufferPercent,
    }));

    // ─── Forecast Accuracy Metrics ──────────────────────────────────────
    let accuracyData: Record<string, unknown> | null = null;
    try {
      accuracyData = await prisma.forecastAccuracy.findUnique({
        where: { businessId },
      });
    } catch {
      /* model may not exist */
    }

    const accuracy = accuracyData
      ? {
          accuracy7d: accuracyData.accuracy7d ? Number(accuracyData.accuracy7d) : null,
          accuracy30d: accuracyData.accuracy30d ? Number(accuracyData.accuracy30d) : null,
          mape7d: accuracyData.mape7d ? Number(accuracyData.mape7d) : null,
          mape30d: accuracyData.mape30d ? Number(accuracyData.mape30d) : null,
          sampleSize7d: accuracyData.sampleSize7d,
          sampleSize30d: accuracyData.sampleSize30d,
          lastEvaluatedAt: accuracyData.lastEvaluatedAt ? String(accuracyData.lastEvaluatedAt) : null,
        }
      : null;

    // ─── Sufficiency Check ─────────────────────────────────────────────
    // Require at least 7 distinct days with non-zero revenue in the last 30 days
    const MIN_DATA_DAYS = 7;
    const since30d = new Date(today);
    since30d.setUTCDate(since30d.getUTCDate() - 30);
    const useBakery = await hasBakeryOrders(businessId);
    let nonZeroRevenueDays = 0;

    if (useBakery) {
      const bakery = await getBakeryDailyAnalytics(businessId, since30d, today);
      nonZeroRevenueDays = bakery.data.filter((point) => point.revenue > 0).length;
    } else {
      const revenueMetrics = await prisma.businessMetrics.findMany({
        where: {
          businessId,
          date: { gte: since30d, lt: today },
          totalRevenue: { gt: 0 },
        },
        select: { date: true },
      });
      nonZeroRevenueDays = revenueMetrics.length;
    }

    const hasSufficientData = nonZeroRevenueDays >= MIN_DATA_DAYS;

    // ─── Metadata ───────────────────────────────────────────────────────
    const lastComputed = bizForecastRows[0]?.updatedAt ?? null;

    return NextResponse.json({
      success: true,
      cached: true,
      lastComputed: lastComputed ? lastComputed.toISOString() : null,
      modelInfo: {
        arima: "ARIMA(auto)",
        lookback: forecastMetadata?.lookbackDays ?? 30,
        horizon: 7,
        features: [
          "adaptive-lookback",
          "weekly-seasonality",
          "price-change-detection",
          "non-linear-confidence",
          "dynamic-buffer",
          "accuracy-tracking",
        ],
      },
      hasSufficientData,
      nonZeroRevenueDays,
      minDataDays: MIN_DATA_DAYS,
      accuracy,
      priceChangesDetected: forecastMetadata?.priceChangesDetected ?? false,
      priceChangeNotes: forecastMetadata?.priceChangeNotes ?? [],
      businessForecast: hasSufficientData ? businessForecast : [],
      productForecasts: hasSufficientData ? productForecasts : [],
    });
  } catch (error) {
    if (isAuthError(error)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("GET /api/analytics/forecast-cached error:", error);
    return NextResponse.json({ error: "Failed to fetch cached forecast" }, { status: 500 });
  }
}
