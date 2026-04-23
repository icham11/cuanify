import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth/session";
import { getBakeryGrowthAnalytics, hasBakeryOrders } from "@/lib/bookings/bakery-analytics";

export async function GET(request: Request) {
  try {
    const { businessId } = await requireAuth();

    const url = new URL(request.url);
    const year = Number(url.searchParams.get("year")) || new Date().getFullYear();
    const month = Number(url.searchParams.get("month")) || new Date().getMonth() + 1;

    const useBakery = await hasBakeryOrders(businessId);

    if (useBakery) {
      const data = await getBakeryGrowthAnalytics(businessId, year, month);
      return NextResponse.json({ success: true, data });
    }

    // Current month
    const currentStart = new Date(year, month - 1, 1);
    const currentEnd = new Date(year, month, 0);

    // Previous month
    const prevStart = new Date(year, month - 2, 1);
    const prevEnd = new Date(year, month - 1, 0);

    const currentMetrics = await prisma.businessMetrics.findMany({
      where: {
        businessId,
        date: {
          gte: currentStart,
          lte: currentEnd,
        },
      },
    });

    const prevMetrics = await prisma.businessMetrics.findMany({
      where: {
        businessId,
        date: {
          gte: prevStart,
          lte: prevEnd,
        },
      },
    });

    const currentRevenue = currentMetrics.reduce(
      (sum, m) => sum + Number(m.totalRevenue),
      0
    );

    const prevRevenue = prevMetrics.reduce(
      (sum, m) => sum + Number(m.totalRevenue),
      0
    );

    const currentProfit = currentMetrics.reduce(
      (sum, m) => sum + Number(m.totalProfit),
      0
    );

    const prevProfit = prevMetrics.reduce(
      (sum, m) => sum + Number(m.totalProfit),
      0
    );

    const revenueGrowth =
      prevRevenue > 0
        ? ((currentRevenue - prevRevenue) / prevRevenue) * 100
        : currentRevenue > 0
        ? 100
        : 0;

    const profitGrowth =
      prevProfit > 0
        ? ((currentProfit - prevProfit) / prevProfit) * 100
        : currentProfit > 0
        ? 100
        : 0;

    return NextResponse.json({
      success: true,
      data: {
        currentRevenue,
        prevRevenue,
        revenueGrowth: Math.round(revenueGrowth * 100) / 100,
        currentProfit,
        prevProfit,
        profitGrowth: Math.round(profitGrowth * 100) / 100,
      },
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Growth analytics error:", error);
    return NextResponse.json(
      { error: "Failed to fetch growth analytics" },
      { status: 500 }
    );
  }
}
