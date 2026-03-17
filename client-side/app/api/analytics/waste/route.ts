import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth/session";
import { InventoryMovementType } from "@prisma/client";

export async function GET(request: Request) {
  try {
    const { businessId } = await requireAuth();

    const url = new URL(request.url);
    const allTime = url.searchParams.get("all") === "true";
    const daysParam = Number(url.searchParams.get("days")) || 0;
    const year = Number(url.searchParams.get("year")) || new Date().getFullYear();
    const month = Number(url.searchParams.get("month")) || new Date().getMonth() + 1;

    // ── Compute date range ──────────────────────────────
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (!allTime) {
      if (daysParam > 0) {
        // Last N days (today inclusive)
        endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
        startDate = new Date();
        startDate.setDate(startDate.getDate() - (daysParam - 1));
        startDate.setHours(0, 0, 0, 0);
      } else {
        // Specific calendar month — fix endDate to end-of-day of last day
        startDate = new Date(year, month - 1, 1);
        endDate = new Date(year, month, 0, 23, 59, 59, 999);
      }
    }
    // allTime: no date filter applied

    const dateFilter = startDate && endDate ? { gte: startDate, lte: endDate } : undefined;

    // ── 1. Waste movements ──────────────────────────────
    const wasteMovements = await prisma.inventoryMovement.findMany({
      where: {
        type: InventoryMovementType.Out,
        stockDocument: { businessId, type: "Waste" },
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
    });

    const totalWasteQty = wasteMovements.reduce((sum, m) => sum + Number(m.quantity), 0);
    const totalWasteCost = wasteMovements.reduce((sum, m) => sum + Number(m.quantity) * Number(m.costPerUnit), 0);

    // ── 2. Revenue for the same period ──────────────────
    const revenueRows = await prisma.businessMetrics.findMany({
      where: {
        businessId,
        ...(dateFilter ? { date: dateFilter } : {}),
      },
    });

    const totalRevenue = revenueRows.reduce((sum, m) => sum + Number(m.totalRevenue), 0);
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
