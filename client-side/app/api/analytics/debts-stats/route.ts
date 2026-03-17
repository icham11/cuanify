import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth/session";
import { DebtStatus } from "@prisma/client";

/**
 * GET /api/analytics/debts-stats
 * Returns aggregated debt analytics:
 * - total outstanding, collection rate, overdue count
 * - monthly payment trend (last 6 months)
 * - top outstanding customers
 */
export async function GET() {
  try {
    const { businessId } = await requireAuth();

    // ─── All debts for this business ─────────────────────────────────────
    const debts = await prisma.debt.findMany({
      where: { businessId },
      include: {
        payments: {
          orderBy: { createdAt: "asc" },
          select: { amount: true, createdAt: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const now = new Date();

    let totalDebt = 0;
    let totalPaid = 0;
    let overdueCount = 0;

    for (const d of debts) {
      if (d.status !== DebtStatus.Paid) {
        totalDebt += Number(d.totalAmount) - Number(d.paidAmount);
        if (d.dueDate && d.dueDate < now) overdueCount++;
      }
      totalPaid += Number(d.paidAmount);
    }

    const totalOriginal = debts.reduce((s, d) => s + Number(d.totalAmount), 0);
    const collectionRate = totalOriginal > 0 ? (totalPaid / totalOriginal) * 100 : 0;

    // ─── Payment trend: last 6 months ─────────────────────────────────────
    const trend: { month: string; collected: number; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      const label = start.toLocaleDateString("id-ID", {
        month: "short",
        year: "2-digit",
      });

      let collected = 0;
      let count = 0;
      for (const d of debts) {
        for (const p of d.payments) {
          if (p.createdAt >= start && p.createdAt <= end) {
            collected += Number(p.amount);
            count++;
          }
        }
      }

      trend.push({ month: label, collected, count });
    }

    // ─── Top 5 outstanding customers ─────────────────────────────────────
    const unpaidDebts = debts
      .filter((d) => d.status !== DebtStatus.Paid)
      .map((d) => ({
        customerName: d.customerName,
        customerPhone: d.customerPhone,
        outstanding: Number(d.totalAmount) - Number(d.paidAmount),
        dueDate: d.dueDate?.toISOString().split("T")[0] ?? null,
        isOverdue: d.dueDate ? d.dueDate < now : false,
        status: d.status,
      }))
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, 10);

    return NextResponse.json({
      success: true,
      summary: {
        totalOutstanding: Math.round(totalDebt),
        totalPaid: Math.round(totalPaid),
        collectionRate: Math.round(collectionRate * 10) / 10,
        overdueCount,
        totalDebtors: debts.filter((d) => d.status !== DebtStatus.Paid).length,
      },
      trend,
      topOutstanding: unpaidDebts,
    });
  } catch (error) {
    if (isAuthError(error)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("GET /api/analytics/debts-stats error:", error);
    return NextResponse.json({ error: "Failed to fetch debt analytics" }, { status: 500 });
  }
}
