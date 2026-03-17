import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth/session";

/**
 * GET /api/analytics/daily?from=ISO&to=ISO
 * Returns revenue/profit/growthRate per calendar day for an arbitrary range.
 * Reads from BusinessMetrics (pre-aggregated nightly).
 * Missing days are filled with zeros so charts are contiguous.
 */
export async function GET(request: NextRequest) {
  try {
    const { businessId } = await requireAuth();

    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    const now = new Date();
    const fromDate = fromParam ? new Date(fromParam) : new Date(now.getFullYear(), now.getMonth(), 1);
    const toDate = toParam ? new Date(toParam) : now;

    // Clamp toDate to end of day
    toDate.setHours(23, 59, 59, 999);

    const metrics = await prisma.businessMetrics.findMany({
      where: {
        businessId,
        date: { gte: fromDate, lte: toDate },
      },
      orderBy: { date: "asc" },
    });

    // Build contiguous day array
    const result: {
      date: string;
      revenue: number;
      cost: number;
      profit: number;
      margin: number;
      growthRate: number;
    }[] = [];

    const cursor = new Date(fromDate);
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(toDate);
    end.setHours(0, 0, 0, 0);

    while (cursor <= end) {
      const iso = cursor.toISOString().split("T")[0];
      const found = metrics.find((m) => m.date.toISOString().split("T")[0] === iso);
      result.push({
        date: iso,
        revenue: Number(found?.totalRevenue ?? 0),
        cost: Number(found?.totalCost ?? 0),
        profit: Number(found?.totalProfit ?? 0),
        margin: found?.marginAvg ?? 0,
        growthRate: found?.growthRate ?? 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    const totals = result.reduce(
      (acc, d) => {
        acc.revenue += d.revenue;
        acc.profit += d.profit;
        acc.cost += d.cost;
        return acc;
      },
      { revenue: 0, profit: 0, cost: 0 },
    );

    return NextResponse.json({ success: true, data: result, totals });
  } catch (error) {
    if (isAuthError(error)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("GET /api/analytics/daily error:", error);
    return NextResponse.json({ error: "Failed to fetch daily analytics" }, { status: 500 });
  }
}
