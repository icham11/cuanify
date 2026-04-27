import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth/session";

export const runtime = "nodejs";

/**
 * GET /api/cashier-shift — Shift history
 * Query: ?page=1&limit=10
 *
 * Owner sees all shifts, Cashier sees only their own.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();

    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? "10")));
    const skip = (page - 1) * limit;

    const where = {
      businessId: auth.businessId,
      // Non-owner users can only see their own shifts.
      ...(auth.role !== "Owner" ? { userId: auth.userId } : {}),
    };

    const [shifts, total] = await Promise.all([
      prisma.cashierShift.findMany({
        where,
        include: {
          openedBy: { select: { name: true } },
          closedBy: { select: { name: true } },
        },
        orderBy: { openedAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.cashierShift.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: shifts.map((s: any) => ({
        id: s.id,
        status: s.status,
        openedBy: s.openedBy.name,
        closedBy: s.closedBy?.name || null,
        openingCash: Number(s.openingCash),
        expectedCash: s.expectedCash ? Number(s.expectedCash) : null,
        actualCash: s.actualCash ? Number(s.actualCash) : null,
        discrepancy: s.discrepancy ? Number(s.discrepancy) : null,
        cashSalesTotal: s.cashSalesTotal ? Number(s.cashSalesTotal) : 0,
        qrisSalesTotal: s.qrisSalesTotal ? Number(s.qrisSalesTotal) : 0,
        transferSalesTotal: s.transferSalesTotal ? Number(s.transferSalesTotal) : 0,
        digitalSalesTotal: s.digitalSalesTotal ? Number(s.digitalSalesTotal) : 0,
        kasbonTotal: s.kasbonTotal ? Number(s.kasbonTotal) : 0,
        marketplaceSalesTotal: s.marketplaceSalesTotal ? Number(s.marketplaceSalesTotal) : 0,
        totalRevenue: s.totalRevenue ? Number(s.totalRevenue) : 0,
        transactionCount: s.transactionCount || 0,
        notes: s.notes,
        openedAt: s.openedAt,
        closedAt: s.closedAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/cashier-shift error:", error);
    return NextResponse.json({ error: "Gagal memuat riwayat shift" }, { status: 500 });
  }
}

