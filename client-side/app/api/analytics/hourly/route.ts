import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth/session";

/**
 * GET /api/analytics/hourly
 * Returns revenue and transaction count for each hour in the last 24h.
 * Uses live SaleItem data, no pre-aggregated table needed.
 */
export async function GET() {
  try {
    const { businessId } = await requireAuth();

    const now = new Date();
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const sales = await prisma.sale.findMany({
      where: {
        businessId,
        createdAt: { gte: since },
      },
      select: {
        createdAt: true,
        totalRevenue: true,
        totalCost: true,
      },
    });

    // Build 24-slot array (hour 0 = oldest, hour 23 = most recent)
    const slots: {
      hour: string;
      revenue: number;
      profit: number;
      transactions: number;
    }[] = [];

    for (let i = 23; i >= 0; i--) {
      const slotStart = new Date(now.getTime() - (i + 1) * 60 * 60 * 1000);
      const slotEnd = new Date(now.getTime() - i * 60 * 60 * 1000);
      const label = slotStart.toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });

      const inSlot = sales.filter((s) => s.createdAt >= slotStart && s.createdAt < slotEnd);
      const revenue = inSlot.reduce((sum, s) => sum + Number(s.totalRevenue), 0);
      const cost = inSlot.reduce((sum, s) => sum + Number(s.totalCost), 0);

      slots.push({
        hour: label,
        revenue,
        profit: revenue - cost,
        transactions: inSlot.length,
      });
    }

    const totals = {
      revenue: slots.reduce((s, h) => s + h.revenue, 0),
      profit: slots.reduce((s, h) => s + h.profit, 0),
      transactions: slots.reduce((s, h) => s + h.transactions, 0),
    };

    return NextResponse.json({ success: true, data: slots, totals });
  } catch (error) {
    if (isAuthError(error)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("GET /api/analytics/hourly error:", error);
    return NextResponse.json({ error: "Failed to fetch hourly data" }, { status: 500 });
  }
}
