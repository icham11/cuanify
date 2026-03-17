import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/analytics/insights-cached
 *
 * Returns pre-generated AI insights for each analytics section.
 * These are generated during the daily cron job and stored in the AnalyticsInsight table.
 */
export async function GET() {
  try {
    const { businessId } = await requireAuth();

    const rows = await prisma.analyticsInsight.findMany({
      where: { businessId },
      select: { section: true, insight: true, generatedAt: true },
    });

    const insights: Record<string, { insight: string; generatedAt: string }> = {};
    for (const row of rows) {
      insights[row.section] = {
        insight: row.insight,
        generatedAt: row.generatedAt.toISOString(),
      };
    }

    return NextResponse.json({ success: true, insights });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/analytics/insights-cached error:", error);
    return NextResponse.json({ error: "Failed to fetch cached insights" }, { status: 500 });
  }
}
