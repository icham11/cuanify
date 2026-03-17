import { NextRequest, NextResponse } from "next/server";
import {
  analyzeSalesData,
  analyzeInventoryData,
  analyzeProductPerformance,
  getBusinessHealthScore,
  analyzeRecipeCosts,
} from "@/lib/groq";
import { requireAuth, AuthError } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/business-analytics
 *
 * Auth: Required (JWT / NextAuth session)
 *
 * Input (JSON):
 *   {
 *     "type": "sales" | "inventory" | "product-performance" | "business-health" | "recipe-costs",
 *     "data": { ... },
 *     "imageUrl": "https://..."  // optional
 *   }
 *
 *   For "product-performance": data must include { products, sales }
 *   For "recipe-costs": data must include { recipes, ingredients }
 *
 * Success (200):
 *   {
 *     "success": true, "type": "sales",
 *     "analysis": "Your sales show a 15% upward trend...",
 *     "timestamp": "2026-02-19T10:30:00.000Z"
 *   }
 *
 * Errors:
 *   401 — { "error": "Unauthorized" }
 *   400 — { "error": "Missing type or data in request body" }
 *   400 — { "error": "Product performance analysis requires both products and sales data" }
 *   400 — { "error": "Recipe cost analysis requires both recipes and ingredients data" }
 *   400 — { "error": "Unknown analysis type: xyz" }
 *   500 — { "error": "...", "details": "..." }
 */
export async function POST(request: NextRequest) {
  try {
    // Auth guard
    await requireAuth();

    const body = await request.json();
    const { type, data, imageUrl } = body;

    if (!type || !data) {
      return NextResponse.json({ error: "Missing type or data in request body" }, { status: 400 });
    }

    let analysis: string;

    switch (type) {
      case "sales":
        analysis = await analyzeSalesData(data, imageUrl);
        break;

      case "inventory":
        analysis = await analyzeInventoryData(data, imageUrl);
        break;

      case "product-performance":
        if (!data.products || !data.sales) {
          return NextResponse.json(
            { error: "Product performance analysis requires both products and sales data" },
            { status: 400 },
          );
        }
        analysis = await analyzeProductPerformance(data.products, data.sales, imageUrl);
        break;

      case "business-health":
        analysis = await getBusinessHealthScore(data, imageUrl);
        break;

      case "recipe-costs":
        if (!data.recipes || !data.ingredients) {
          return NextResponse.json(
            { error: "Recipe cost analysis requires both recipes and ingredients data" },
            { status: 400 },
          );
        }
        analysis = await analyzeRecipeCosts(data.recipes, data.ingredients, imageUrl);
        break;

      default:
        return NextResponse.json({ error: `Unknown analysis type: ${type}` }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      type,
      analysis,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("Business analytics error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: errorMessage || "Failed to analyze business data",
        details: String(error),
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/business-analytics
 *
 * Success (200):
 *   {
 *     "status": "ok",
 *     "message": "Business analytics API is ready",
 *     "supportedTypes": ["sales", "inventory", "product-performance", "business-health", "recipe-costs"],
 *     "description": { "sales": "...", "inventory": "...", ... }
 *   }
 */
// GET endpoint to check API status
export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "Business analytics API is ready",
    supportedTypes: ["sales", "inventory", "product-performance", "business-health", "recipe-costs"],
    description: {
      sales: "Analyze sales data for revenue trends and payment insights",
      inventory: "Analyze inventory levels and stock management",
      "product-performance": "Analyze product sales performance and profitability",
      "business-health": "Calculate overall business health score",
      "recipe-costs": "Analyze recipe costs and ingredient optimization",
    },
  });
}
