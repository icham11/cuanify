import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/session";
import {
  getSmartInsights,
  getInventoryAlerts,
  getSalesForecast,
  getMenuRecommendations,
  getProfitOptimization,
} from "@/lib/ai/smart-features";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveInsightsData(
  businessId: number,
  type: string | null | undefined,
) {
  switch (type) {
    case "inventory":
      return getInventoryAlerts(businessId);
    case "forecast":
      return getSalesForecast(businessId);
    case "menu":
      return getMenuRecommendations(businessId);
    case "profit":
      return getProfitOptimization(businessId);
    case "all":
    default:
      return getSmartInsights(businessId);
  }
}

/**
 * GET /api/ai/insights?type=all
 */
export async function GET(request: NextRequest) {
  try {
    const { businessId } = await requireAuth();
    const type = request.nextUrl.searchParams.get("type") || "all";
    const data = await resolveInsightsData(businessId, type);

    return NextResponse.json({
      success: true,
      type,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("AI Insights error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/ai/insights
 * Body: { type: "all" | "inventory" | "forecast" | "menu" | "profit" }
 */
export async function POST(request: NextRequest) {
  try {
    const { businessId } = await requireAuth();
    const body = await request.json();
    const { type = "all" } = body;
    const data = await resolveInsightsData(businessId, type);

    return NextResponse.json({
      success: true,
      type,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("AI Insights error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

