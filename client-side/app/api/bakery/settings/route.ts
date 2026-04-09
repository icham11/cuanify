import { NextRequest, NextResponse } from "next/server";
import {
  AuthError,
  ForbiddenError,
  requireAuth,
  requireRole,
} from "@/lib/auth/session";
import {
  getBakeryBusinessSettings,
  upsertBakeryBusinessSettings,
} from "@/lib/bakery/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeBlockedDatesInput(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry));
}

export async function GET() {
  try {
    const auth = await requireAuth();

    const settings = await getBakeryBusinessSettings(auth.businessId);

    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    const message =
      error instanceof Error ? error.message : "Failed to load bakery settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth();
    requireRole(auth, "Owner");

    const body = (await request.json().catch(() => ({}))) as {
      dailyProductionTokenLimit?: unknown;
      blockedDates?: unknown;
    };

    const nextSettings = await upsertBakeryBusinessSettings({
      businessId: auth.businessId,
      userId: auth.userId,
      input: {
        dailyProductionTokenLimit:
          body.dailyProductionTokenLimit !== undefined
            ? Number(body.dailyProductionTokenLimit)
            : undefined,
        blockedDates:
          body.blockedDates !== undefined
            ? normalizeBlockedDatesInput(body.blockedDates)
            : undefined,
      },
    });

    return NextResponse.json({ success: true, data: nextSettings });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    const message =
      error instanceof Error
        ? error.message
        : "Failed to update bakery settings";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
