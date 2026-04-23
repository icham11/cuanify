import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  requireRole,
  isAuthError,
  isForbiddenError,
} from "@/lib/auth/session";
import { buildDailyOmzetSnapshot } from "@/lib/admin/daily-omzet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    requireRole(auth, "Owner", "Admin");
    const date = new URL(request.url).searchParams.get("date") ?? undefined;

    const snapshot = await buildDailyOmzetSnapshot(
      auth.businessId,
      new Date(),
      date,
    );

    return NextResponse.json({
      success: true,
      data: snapshot,
    });
  } catch (error: unknown) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (isForbiddenError(error)) {
      return NextResponse.json(
        { error: "Akses ditolak. Halaman ini khusus Owner/Admin." },
        { status: 403 },
      );
    }

    console.error("GET /api/admin/daily-omzet error:", error);
    return NextResponse.json(
      { error: "Gagal memuat data omzet harian" },
      { status: 500 },
    );
  }
}
