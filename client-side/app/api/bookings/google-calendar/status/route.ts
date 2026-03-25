import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/session";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAuth();

    const doc = await prisma.businessDocument.findFirst({
      where: {
        businessId: auth.businessId,
        sourceType: "google_calendar_oauth",
      },
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        metadata: true,
        updatedAt: true,
      },
    });

    const metadata =
      doc?.metadata && typeof doc.metadata === "object"
        ? (doc.metadata as {
            connectedEmail?: string;
            calendarId?: string;
            provider?: string;
          })
        : null;

    return NextResponse.json({
      connected: Boolean(metadata?.provider === "google_oauth"),
      connectedEmail: metadata?.connectedEmail || null,
      calendarId:
        metadata?.calendarId || process.env.GOOGLE_CALENDAR_ID || null,
      updatedAt: doc?.updatedAt?.toISOString() || null,
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to load Google Calendar status." },
      { status: 500 },
    );
  }
}
