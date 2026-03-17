import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth/session";

/**
 * GET /api/analytics/last-updated
 *
 * Returns the most recent updatedAt timestamp across all analytics tables
 * for the authenticated business:
 *   - BusinessMetrics     (daily revenue / profit metrics)
 *   - BusinessForecast    (7-day predictions)
 *   - BusinessHealthScores (business health scoring)
 *   - AnalyticsInsight    (AI-generated insights)
 *
 * Used to display a global "Last updated" badge on the Analytics page.
 */
export async function GET() {
  try {
    const { businessId } = await requireAuth();

    const [latestMetric, latestForecast, latestHealth, latestInsight] = await Promise.all([
      prisma.businessMetrics.findFirst({
        where: { businessId },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
      prisma.businessForecast.findFirst({
        where: { businessId },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
      prisma.businessHealthScores.findFirst({
        where: { businessId },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
      prisma.analyticsInsight.findFirst({
        where: { businessId },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
    ]);

    const timestamps = [
      latestMetric?.updatedAt,
      latestForecast?.updatedAt,
      latestHealth?.updatedAt,
      latestInsight?.updatedAt,
    ].filter(Boolean) as Date[];

    const lastUpdated =
      timestamps.length > 0 ? new Date(Math.max(...timestamps.map((t) => t.getTime()))).toISOString() : null;

    return NextResponse.json({ lastUpdated });
  } catch (error) {
    if (isAuthError(error)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("GET /api/analytics/last-updated error:", error);
    return NextResponse.json({ error: "Failed to fetch last updated time" }, { status: 500 });
  }
}
