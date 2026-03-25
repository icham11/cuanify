import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/session";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const auth = await requireAuth();

    await prisma.businessDocument.deleteMany({
      where: {
        businessId: auth.businessId,
        sourceType: "google_calendar_oauth",
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to disconnect Google Calendar." },
      { status: 500 },
    );
  }
}
