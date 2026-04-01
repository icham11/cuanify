/**
 * POST /api/bookings/capacity/test
 *
 * Test-only endpoint for manipulating production_capacity directly.
 * Only available in development mode.
 *
 * Body:
 *   { "action": "set", "date": "YYYY-MM-DD", "usedToken": 598 }
 *   { "action": "reset", "date": "YYYY-MM-DD" }
 *   { "action": "consume", "date": "YYYY-MM-DD", "tokenUsed": 3 }
 *   { "action": "release", "date": "YYYY-MM-DD", "tokenToRelease": 3 }
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth/session";
import {
  ensureCapacityTable,
  consumeToken,
  releaseToken,
  getCapacityForDate,
  DEFAULT_MAX_TOKEN,
} from "@/lib/bookings/token-capacity-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Only allow in development
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Test endpoint not available in production" },
      { status: 403 },
    );
  }

  try {
    const { userId } = await requireAuth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get businessId for this user
    const businesses = await prisma.$queryRaw<{ id: number }[]>`
      SELECT id FROM "Business" WHERE "userId" = ${userId} LIMIT 1
    `;
    if (businesses.length === 0) {
      return NextResponse.json(
        { error: "No business found" },
        { status: 404 },
      );
    }
    const businessId = businesses[0].id;

    const body = await req.json();
    const { action, date, usedToken, tokenUsed, tokenToRelease } = body;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: "Invalid date format. Use YYYY-MM-DD." },
        { status: 400 },
      );
    }

    await ensureCapacityTable();

    switch (action) {
      case "set": {
        // Directly set usedToken for testing
        const setVal = Number(usedToken) || 0;
        await prisma.$executeRaw`
          INSERT INTO production_capacity (business_id, date, max_token, used_token, created_at, updated_at)
          VALUES (${businessId}, ${date}::date, ${DEFAULT_MAX_TOKEN}, ${setVal}, NOW(), NOW())
          ON CONFLICT (business_id, date)
          DO UPDATE SET used_token = ${setVal}, updated_at = NOW()
        `;
        const afterSet = await getCapacityForDate(businessId, date);
        return NextResponse.json({ success: true, action: "set", data: afterSet });
      }

      case "reset": {
        await prisma.$executeRaw`
          DELETE FROM production_capacity
          WHERE business_id = ${businessId} AND date = ${date}::date
        `;
        return NextResponse.json({ success: true, action: "reset", data: { date, maxToken: DEFAULT_MAX_TOKEN, usedToken: 0 } });
      }

      case "consume": {
        const result = await consumeToken(businessId, date, Number(tokenUsed) || 0);
        return NextResponse.json({ success: result.success, action: "consume", data: result });
      }

      case "release": {
        const result = await releaseToken(businessId, date, Number(tokenToRelease) || 0);
        return NextResponse.json({ success: result.success, action: "release", data: result });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}. Use set, reset, consume, or release.` },
          { status: 400 },
        );
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
