import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth/session";

export const runtime = "nodejs";

/**
 * GET /api/cashier-shift/current
 *
 * Returns the currently active (Open) shift for the business,
 * including running totals from sales in this shift.
 */
export async function GET() {
  try {
    const auth = await requireAuth();

    const shift = await prisma.cashierShift.findFirst({
      where: { businessId: auth.businessId, status: "Open" },
      include: {
        openedBy: { select: { name: true, email: true } },
      },
    });

    if (!shift) {
      return NextResponse.json({ success: true, data: null });
    }

    // Get running totals from sales during this shift
    const paidSalesFilter: Prisma.SaleWhereInput = {
      cashierShiftId: shift.id,
      paymentStatus: "Paid",
    };
    const salesInShift = await prisma.sale.findMany({
      where: paidSalesFilter,
      select: { paymentMethod: true, totalRevenue: true },
    });

    const totalCount = await prisma.sale.count({
      where: { cashierShiftId: shift.id },
    });

    let cashTotal = 0;
    let qrisTotal = 0;
    let transferTotal = 0;
    let digitalTotal = 0;
    let kasbonTotal = 0;
    let totalRevenue = 0;

    for (const s of salesInShift) {
      const rev = Number(s.totalRevenue);
      totalRevenue += rev;
      switch (s.paymentMethod) {
        case "Cash": cashTotal += rev; break;
        case "QRIS": qrisTotal += rev; break;
        case "Transfer": transferTotal += rev; break;
        case "Digital": digitalTotal += rev; break;
        case "Kasbon": kasbonTotal += rev; break;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        id: shift.id,
        status: shift.status,
        openingCash: Number(shift.openingCash),
        openedAt: shift.openedAt,
        openedBy: shift.openedBy.name,
        // Running totals
        runningTotals: {
          cashTotal,
          qrisTotal,
          transferTotal,
          digitalTotal,
          kasbonTotal,
          totalRevenue,
          transactionCount: totalCount,
          expectedCash: Number(shift.openingCash) + cashTotal,
        },
      },
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/cashier-shift/current error:", error);
    return NextResponse.json({ error: "Gagal memuat shift" }, { status: 500 });
  }
}

