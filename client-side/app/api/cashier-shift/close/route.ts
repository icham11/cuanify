import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth/session";
import { closeShiftSchema } from "@/lib/validations/cashier-shift";

export const runtime = "nodejs";

/**
 * POST /api/cashier-shift/close
 *
 * Close the current active shift. Calculates expected cash from all cash sales
 * during the shift, compares with actual counted cash, records discrepancy.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    const body = await request.json();

    const parsed = closeShiftSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Data tidak valid" },
        { status: 400 }
      );
    }

    const { actualCash, notes } = parsed.data;

    const result = await prisma.$transaction(
      async (tx) => {
        // 1. Find active shift
        const shift = await tx.cashierShift.findFirst({
          where: { businessId: auth.businessId, status: "Open" },
        });

        if (!shift) {
          throw new Error("NO_OPEN_SHIFT");
        }

        // 2. Aggregate sales during this shift by payment method
        const paidSalesFilter: Prisma.SaleWhereInput = {
          cashierShiftId: shift.id,
          paymentStatus: "Paid",
        };
        const salesInShift = await tx.sale.findMany({
          where: paidSalesFilter,
          select: {
            paymentMethod: true,
            totalRevenue: true,
          },
        });

        // Also count pending (Midtrans) sales
        const allSalesCount = await tx.sale.count({
          where: { cashierShiftId: shift.id },
        });

        let cashTotal = 0;
        let qrisTotal = 0;
        let transferTotal = 0;
        let digitalTotal = 0;
        let kasbonTotal = 0;
        let totalRevenue = 0;

        for (const sale of salesInShift) {
          const rev = Number(sale.totalRevenue);
          totalRevenue += rev;

          switch (sale.paymentMethod) {
            case "Cash":
              cashTotal += rev;
              break;
            case "QRIS":
              qrisTotal += rev;
              break;
            case "Transfer":
              transferTotal += rev;
              break;
            case "Digital":
              digitalTotal += rev;
              break;
            case "Kasbon":
              kasbonTotal += rev;
              break;
          }
        }

        // 3. Calculate expected cash & discrepancy
        const openingCash = Number(shift.openingCash);
        const expectedCash = openingCash + cashTotal;
        const discrepancy = actualCash - expectedCash;

        // 4. Close the shift
        return tx.cashierShift.update({
          where: { id: shift.id },
          data: {
            status: "Closed",
            closedByUserId: auth.userId,
            closedAt: new Date(),
            actualCash,
            expectedCash,
            discrepancy,
            cashSalesTotal: cashTotal,
            qrisSalesTotal: qrisTotal,
            transferSalesTotal: transferTotal,
            digitalSalesTotal: digitalTotal,
            kasbonTotal: kasbonTotal,
            totalRevenue,
            transactionCount: allSalesCount,
            notes: notes || null,
          },
          include: {
            openedBy: { select: { name: true } },
            closedBy: { select: { name: true } },
          },
        });
      },
      { timeout: 15000 }
    );

    const discrepancy = Number(result.discrepancy);
    const expectedCash = Number(result.expectedCash);
    const discrepancyPct =
      expectedCash > 0 ? Math.abs(discrepancy / expectedCash) * 100 : 0;

    let discrepancyStatus: "match" | "minor" | "warning" | "critical";
    if (Math.abs(discrepancy) === 0) discrepancyStatus = "match";
    else if (discrepancyPct <= 1) discrepancyStatus = "minor";
    else if (discrepancyPct <= 5) discrepancyStatus = "warning";
    else discrepancyStatus = "critical";

    return NextResponse.json({
      success: true,
      data: {
        id: result.id,
        openedBy: result.openedBy.name,
        closedBy: result.closedBy?.name,
        openedAt: result.openedAt,
        closedAt: result.closedAt,
        openingCash: Number(result.openingCash),
        expectedCash: Number(result.expectedCash),
        actualCash: Number(result.actualCash),
        discrepancy,
        discrepancyPct: discrepancyPct.toFixed(1),
        discrepancyStatus,
        cashSalesTotal: Number(result.cashSalesTotal),
        qrisSalesTotal: Number(result.qrisSalesTotal),
        transferSalesTotal: Number(result.transferSalesTotal),
        digitalSalesTotal: Number(result.digitalSalesTotal),
        kasbonTotal: Number(result.kasbonTotal),
        totalRevenue: Number(result.totalRevenue),
        transactionCount: result.transactionCount,
        notes: result.notes,
      },
      message:
        discrepancyStatus === "match"
          ? "✅ Shift ditutup — uang cash cocok sempurna!"
          : discrepancyStatus === "minor"
            ? `Shift ditutup — selisih kecil Rp${Math.abs(discrepancy).toLocaleString("id-ID")}`
            : discrepancyStatus === "warning"
              ? `⚠️ Shift ditutup — selisih Rp${Math.abs(discrepancy).toLocaleString("id-ID")} (${discrepancyPct.toFixed(1)}%)`
              : `🚨 PERHATIAN: Selisih besar Rp${Math.abs(discrepancy).toLocaleString("id-ID")} (${discrepancyPct.toFixed(1)}%)!`,
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "NO_OPEN_SHIFT") {
      return NextResponse.json({ error: "Tidak ada shift yang sedang dibuka" }, { status: 404 });
    }
    console.error("POST /api/cashier-shift/close error:", error);
    return NextResponse.json({ error: "Gagal menutup shift" }, { status: 500 });
  }
}

