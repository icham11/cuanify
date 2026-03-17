import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth/session";
import { openShiftSchema } from "@/lib/validations/cashier-shift";

export const runtime = "nodejs";

/**
 * POST /api/cashier-shift/open
 *
 * Opens a new cashier shift for the business.
 * Only one shift can be open at a time per business.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    const body = await request.json();

    const parsed = openShiftSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Data tidak valid" },
        { status: 400 }
      );
    }

    const { openingCash } = parsed.data;

    // Check if there's already an open shift
    const existingShift = await prisma.cashierShift.findFirst({
      where: { businessId: auth.businessId, status: "Open" },
      select: { id: true, openedAt: true, openedBy: { select: { name: true } } },
    });

    if (existingShift) {
      return NextResponse.json(
        {
          error: `Shift sudah dibuka oleh ${existingShift.openedBy.name} pada ${new Date(existingShift.openedAt).toLocaleString("id-ID")}. Tutup shift terlebih dahulu.`,
        },
        { status: 409 }
      );
    }

    const shift = await prisma.cashierShift.create({
      data: {
        businessId: auth.businessId,
        userId: auth.userId,
        openingCash,
        status: "Open",
      },
      include: {
        openedBy: { select: { name: true, email: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: shift.id,
        openingCash: Number(shift.openingCash),
        openedAt: shift.openedAt,
        openedBy: shift.openedBy.name,
      },
      message: `Shift dibuka dengan modal Rp${Number(openingCash).toLocaleString("id-ID")}`,
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST /api/cashier-shift/open error:", error);
    const msg = error instanceof Error && error.message.includes("does not exist")
      ? "Tabel CashierShift belum ada. Jalankan migrasi database terlebih dahulu."
      : "Gagal membuka shift";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

