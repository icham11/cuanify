import { NextResponse } from "next/server";
import {
  requireAuth,
  requireRole,
  isAuthError,
  isForbiddenError,
} from "@/lib/auth/session";
import { buildDailyOmzetSnapshot } from "@/lib/admin/daily-omzet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAuth();
    requireRole(auth, "Admin");

    const snapshot = await buildDailyOmzetSnapshot(auth.businessId);

    return NextResponse.json({
      success: true,
      data: {
        businessDate: snapshot.businessDate,
        businessDateLabel: snapshot.businessDateLabel,
        timeZone: snapshot.timeZone,
        generatedAt: snapshot.generatedAt,
        reconciliation: snapshot.reconciliation,
      },
    });
  } catch (error: unknown) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (isForbiddenError(error)) {
      return NextResponse.json(
        { error: "Akses ditolak. Endpoint ini khusus Admin." },
        { status: 403 },
      );
    }

    console.error("GET /api/admin/daily-omzet/reconciliation error:", error);
    return NextResponse.json(
      { error: "Gagal memuat data rekonsiliasi omzet harian" },
      { status: 500 },
    );
  }
}
