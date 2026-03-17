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

/**
 * POST /api/ai/insights
 * Body: { type: "all" | "inventory" | "forecast" | "menu" | "profit" }
 */
export async function POST(request: NextRequest) {
  try {
    const { businessId } = await requireAuth();
    const body = await request.json();
    const { type = "all" } = body;

    let data;

    switch (type) {
      case "inventory":
        data = await getInventoryAlerts(businessId);
        break;
      case "forecast":
        data = await getSalesForecast(businessId);
        break;
      case "menu":
        data = await getMenuRecommendations(businessId);
        break;
      case "profit":
        data = await getProfitOptimization(businessId);
        break;
      case "all":
      default:
        data = await getSmartInsights(businessId);
        break;
    }

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

