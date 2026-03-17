import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/debts — List all debts (piutang) for the business
 * Query params: ?status=Unpaid|Partial|Paid&search=customer_name
 */
export async function GET(request: NextRequest) {
  try {
    const { businessId } = await requireAuth();

    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const search = url.searchParams.get("search");

    const debts = await prisma.debt.findMany({
      where: {
        businessId,
        ...(status ? { status: status as "Unpaid" | "Partial" | "Paid" } : {}),
        ...(search
          ? { customerName: { contains: search, mode: "insensitive" as const } }
          : {}),
      },
      include: {
        sale: {
          select: {
            transactionNumber: true,
            createdAt: true,
            saleItems: {
              include: { product: { select: { name: true } } },
            },
          },
        },
        payments: {
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Compute summary
    const totalDebt = debts.reduce((s, d) => s + Number(d.totalAmount) - Number(d.paidAmount), 0);
    const unpaidCount = debts.filter((d) => d.status !== "Paid").length;

    return NextResponse.json({
      success: true,
      data: debts.map((d) => ({
        id: d.id,
        saleId: d.saleId,
        transactionNumber: d.sale.transactionNumber,
        customerName: d.customerName,
        customerPhone: d.customerPhone,
        totalAmount: Number(d.totalAmount),
        paidAmount: Number(d.paidAmount),
        remaining: Number(d.totalAmount) - Number(d.paidAmount),
        status: d.status,
        notes: d.notes,
        dueDate: d.dueDate,
        createdAt: d.createdAt,
        items: d.sale.saleItems.map((si) => si.product.name).join(", "),
        payments: d.payments.map((p) => ({
          id: p.id,
          amount: Number(p.amount),
          notes: p.notes,
          createdAt: p.createdAt,
        })),
      })),
      summary: {
        totalDebt: Math.round(totalDebt),
        unpaidCount,
        totalCount: debts.length,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: 401 });
    console.error("GET /api/debts error:", error);
    return NextResponse.json({ error: "Gagal memuat data kasbon" }, { status: 500 });
  }
}

