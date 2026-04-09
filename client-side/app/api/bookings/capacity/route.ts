import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth/session";
import {
  getCapacityForDate,
  getCapacityForDateRange,
  checkTokenAvailability,
} from "@/lib/bookings/token-capacity-service";
import { getBakeryBusinessSettings } from "@/lib/bakery/settings";
import { normalizeDateInput } from "@/lib/helpers/date-normalization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/bookings/capacity
 *
 * Query params:
 *   - date: YYYY-MM-DD (single date capacity)
 *   - startDate & endDate: YYYY-MM-DD (date range capacity)
 *   - tokenNeeded: number (optional, checks availability)
 *
 * Returns:
 *   Single date:
 *     { success: true, data: { date, maxToken, usedToken, availableToken, isAvailable? } }
 *
 *   Date range:
 *     { success: true, data: { capacities: [...] } }
 */
export async function GET(request: NextRequest) {
  try {
    const { businessId } = await requireAuth();
    const settings = await getBakeryBusinessSettings(businessId);
    const { searchParams } = new URL(request.url);

    const date = searchParams.get("date");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const tokenNeededParam = searchParams.get("tokenNeeded");

    // ── Date range query ──
    if (startDate && endDate) {
      const normalizedStartDate = normalizeDateInput(startDate);
      const normalizedEndDate = normalizeDateInput(endDate);
      if (!normalizedStartDate || !normalizedEndDate) {
        return NextResponse.json(
          { error: "Invalid date format. Use YYYY-MM-DD." },
          { status: 400 },
        );
      }

      const capacities = await getCapacityForDateRange(
        businessId,
        normalizedStartDate,
        normalizedEndDate,
      );

      return NextResponse.json({
        success: true,
        data: {
          defaultMaxToken: settings.dailyProductionTokenLimit,
          capacities: capacities.map((c) => ({
            ...c,
            availableToken: c.maxToken - c.usedToken,
          })),
        },
      });
    }

    // ── Single date query ──
    if (!date) {
      return NextResponse.json(
        {
          error:
            "Missing required query parameter: 'date' (YYYY-MM-DD) or 'startDate' + 'endDate'.",
        },
        { status: 400 },
      );
    }

    const normalizedDate = normalizeDateInput(date);
    if (!normalizedDate) {
      return NextResponse.json(
        { error: "Invalid date format. Use YYYY-MM-DD." },
        { status: 400 },
      );
    }

    const capacity = await getCapacityForDate(businessId, normalizedDate);
    const availableToken = capacity.maxToken - capacity.usedToken;

    const responseData: Record<string, unknown> = {
      ...capacity,
      availableToken,
    };

    // Optional: check availability for a specific token amount
    if (tokenNeededParam) {
      const tokenNeeded = Number(tokenNeededParam);
      if (!Number.isFinite(tokenNeeded) || tokenNeeded < 0) {
        return NextResponse.json(
          {
            error: "Invalid tokenNeeded value. Must be a non-negative number.",
          },
          { status: 400 },
        );
      }

      const isAvailable = await checkTokenAvailability(
        businessId,
        normalizedDate,
        tokenNeeded,
      );
      responseData.tokenNeeded = tokenNeeded;
      responseData.isAvailable = isAvailable;
    }

    return NextResponse.json({
      success: true,
      data: {
        defaultMaxToken: settings.dailyProductionTokenLimit,
        ...responseData,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/bookings/capacity] GET error:", message);

    return NextResponse.json(
      { error: "Failed to retrieve production capacity." },
      { status: 500 },
    );
  }
}
