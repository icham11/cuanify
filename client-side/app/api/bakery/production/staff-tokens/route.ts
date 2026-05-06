import { NextRequest, NextResponse } from "next/server";
import {
  AuthError,
  requireAuth,
} from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    return NextResponse.json({
      success: false,
      error:
        "Fitur reset token sudah dihapus. Token staff sekarang dihitung otomatis per hari.",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : "Failed to fetch token resets";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth();

    return NextResponse.json({
      success: false,
      error:
        "Fitur reset token sudah dihapus. Assignment yang sudah diambil hanya bisa dipindahkan oleh owner/admin.",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : "Failed to reset tokens";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
