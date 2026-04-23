import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth/session";
import { getBakeryHealthSeries, hasBakeryOrders } from "@/lib/bookings/bakery-analytics";

/**
 * GET /api/analytics/health?days=30
 * Returns all 5 BusinessHealthScores sub-scores + classification over time.
 * Also returns the latest snapshot as a summary.
 */
export async function GET(request: NextRequest) {
  try {
    const { businessId } = await requireAuth();

    const { searchParams } = new URL(request.url);
    const days = Number(searchParams.get("days") ?? 30);

    const useBakery = await hasBakeryOrders(businessId);

    if (useBakery) {
      const series = await getBakeryHealthSeries(businessId, days);
      const latest = series.length > 0 ? series[series.length - 1] : null;
      return NextResponse.json({ success: true, data: series, latest });
    }

    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const scores = await prisma.businessHealthScores.findMany({
      where: {
        businessId,
        date: { gte: since },
      },
      orderBy: { date: "asc" },
    });

    const series = scores.map((s) => ({
      date: s.date.toISOString().split("T")[0],
      revenueScore: s.revenueScore,
      profitScore: s.profitScore,
      wasteScore: s.wasteScore,
      stabilityScore: s.stabilityScore,
      overallScore: s.overallScore,
      classification: s.classification ?? "Unknown",
    }));

    // Latest snapshot
    const latest = series.length > 0 ? series[series.length - 1] : null;

    return NextResponse.json({ success: true, data: series, latest });
  } catch (error) {
    if (isAuthError(error)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("GET /api/analytics/health error:", error);
    return NextResponse.json({ error: "Failed to fetch health scores" }, { status: 500 });
  }
}
