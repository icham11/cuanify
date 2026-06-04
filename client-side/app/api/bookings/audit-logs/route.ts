import { NextRequest, NextResponse } from "next/server";
import { ForbiddenError, requireAuth } from "@/lib/auth/session";
import { listBookingAuditEntries } from "@/lib/bookings/booking-audit";
import {
  isPrismaConnectionTimeout,
  prismaConnectionErrorResponse,
} from "@/lib/prisma-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { businessId, role } = await requireAuth();
    if (role !== "Owner") {
      throw new ForbiddenError("Hanya Owner yang dapat melihat log booking.");
    }

    const limitValue = Number(request.nextUrl.searchParams.get("limit") ?? "40");
    const entries = await listBookingAuditEntries({
      businessId,
      limit: Number.isFinite(limitValue) ? limitValue : 40,
    });

    return NextResponse.json({
      success: true,
      data: entries,
    });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (isPrismaConnectionTimeout(error)) {
      return prismaConnectionErrorResponse(
        "Database sedang sibuk saat memuat log booking.",
      );
    }
    console.error("[api/bookings/audit-logs] GET error:", error);
    return NextResponse.json(
      { error: "Gagal memuat log booking." },
      { status: 500 },
    );
  }
}
