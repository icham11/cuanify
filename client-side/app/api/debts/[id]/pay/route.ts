import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * POST /api/debts/[id]/pay — Record a payment towards a debt (kasbon)
 * Body: { amount: number, notes?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { businessId } = await requireAuth();
    const { id } = await params;
    const debtId = Number(id);

    const body = await request.json();
    const { amount, notes } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "Jumlah pembayaran harus lebih dari 0" }, { status: 400 });
    }

    // Find the debt
    const debt = await prisma.debt.findFirst({
      where: { id: debtId, businessId },
    });

    if (!debt) {
      return NextResponse.json({ error: "Kasbon tidak ditemukan" }, { status: 404 });
    }

    if (debt.status === "Paid") {
      return NextResponse.json({ error: "Kasbon sudah lunas" }, { status: 400 });
    }

    const remaining = Number(debt.totalAmount) - Number(debt.paidAmount);
    const payAmount = Math.min(amount, remaining);
    const newPaid = Number(debt.paidAmount) + payAmount;
    const isFullyPaid = newPaid >= Number(debt.totalAmount);

    // Transaction: create payment + update debt + update sale status
    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.debtPayment.create({
        data: {
          debtId,
          amount: payAmount,
          notes: notes || null,
        },
      });

      const updatedDebt = await tx.debt.update({
        where: { id: debtId },
        data: {
          paidAmount: newPaid,
          status: isFullyPaid ? "Paid" : "Partial",
        },
      });

      // If fully paid, update sale payment status to Paid
      if (isFullyPaid) {
        await tx.sale.update({
          where: { id: debt.saleId },
          data: { paymentStatus: "Paid" },
        });
      }

      return { payment, updatedDebt };
    });

    return NextResponse.json({
      success: true,
      data: {
        paymentId: result.payment.id,
        amountPaid: payAmount,
        totalPaid: newPaid,
        remaining: Number(debt.totalAmount) - newPaid,
        status: result.updatedDebt.status,
        isFullyPaid,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: 401 });
    console.error("POST /api/debts/[id]/pay error:", error);
    return NextResponse.json({ error: "Gagal memproses pembayaran kasbon" }, { status: 500 });
  }
}

