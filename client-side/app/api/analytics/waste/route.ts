import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth/session";
import { InventoryMovementType } from "@prisma/client";
import { getBakeryDailyAnalytics, hasBakeryOrders } from "@/lib/bookings/bakery-analytics";

export async function GET(request: Request) {
  try {
    const { businessId } = await requireAuth();

    const url = new URL(request.url);
    const allTime = url.searchParams.get("all") === "true";
    const daysParam = Number(url.searchParams.get("days")) || 0;
    const year = Number(url.searchParams.get("year")) || new Date().getFullYear();
    const month = Number(url.searchParams.get("month")) || new Date().getMonth() + 1;

    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (!allTime) {
      if (daysParam > 0) {
        endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
        startDate = new Date();
        startDate.setDate(startDate.getDate() - (daysParam - 1));
        startDate.setHours(0, 0, 0, 0);
      } else {
        startDate = new Date(year, month - 1, 1);
        endDate = new Date(year, month, 0, 23, 59, 59, 999);
      }
    }

    const dateFilter = startDate && endDate ? { gte: startDate, lte: endDate } : undefined;

    const wasteMovements = await prisma.inventoryMovement.findMany({
      where: {
        type: InventoryMovementType.Out,
        stockDocument: { businessId, type: "Waste" },
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
    });

    const totalWasteQty = wasteMovements.reduce((sum, movement) => sum + Number(movement.quantity), 0);
    const totalWasteCost = wasteMovements.reduce(
      (sum, movement) => sum + Number(movement.quantity) * Number(movement.costPerUnit),
      0,
    );

    const useBakery = await hasBakeryOrders(businessId);
    let totalRevenue = 0;

    if (useBakery) {
      const bakeryStartDate = startDate ?? new Date(2000, 0, 1);
      const bakeryEndDate = endDate ?? new Date();
      bakeryEndDate.setHours(23, 59, 59, 999);
      const bakery = await getBakeryDailyAnalytics(businessId, bakeryStartDate, bakeryEndDate);
      totalRevenue = bakery.totals.revenue;
    } else {
      const revenueRows = await prisma.businessMetrics.findMany({
        where: {
          businessId,
          ...(dateFilter ? { date: dateFilter } : {}),
        },
      });
      totalRevenue = revenueRows.reduce((sum, row) => sum + Number(row.totalRevenue), 0);
    }

    const wastePercentage = totalRevenue > 0 ? (totalWasteCost / totalRevenue) * 100 : 0;

    return NextResponse.json({
      success: true,
      data: {
        totalWasteQty,
        totalWasteCost,
        wastePercentage: Math.round(wastePercentage * 100) / 100,
      },
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Waste analytics error:", error);
    return NextResponse.json({ error: "Failed to fetch waste analytics" }, { status: 500 });
  }
}
