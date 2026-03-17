import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth/session";
import { GROQ_MODELS, createGroqCompletion } from "@/lib/groq";
import { recommendPriceSchema } from "@/lib/validations/product";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * POST /api/products/generate/recommend-price
 *
 * Generate a recommended selling price based on recipe cost.
 *
 * Input (JSON):
 *   { "recipeCost": 12000, "categoryName": "Minuman", "productName": "Es Kopi" }
 *   categoryName and productName are optional.
 *
 * Success (200):
 *   {
 *     "success": true,
 *     "data": {
 *       "recommendedPrice": 25000, "margin": 52,
 *       "reasoning": "Standard UMKM beverage markup...",
 *       "recipeCost": 12000
 *     }
 *   }
 *
 * When recipeCost is 0:
 *   { "success": true, "data": { "recommendedPrice": 0, "margin": 0, "reasoning": "Recipe cost is zero..." } }
 *
 * Errors:
 *   400 — { "error": "Validation failed", "details": { ... } }
 *   401 — { "error": "Unauthorized" }
 *   500 — { "error": "Failed to generate price recommendation" }
 */
export async function POST(request: NextRequest) {
  try {
    const { businessId } = await requireAuth();
    const body = await request.json();

    const parsed = recommendPriceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { recipeCost, categoryName, productName } = parsed.data;

    // Guard: no ingredients means no meaningful recommendation
    if (recipeCost === 0) {
      return NextResponse.json(
        { error: "Add ingredients to the recipe before requesting a price recommendation." },
        { status: 400 },
      );
    }

    // Fetch existing products for pricing context (prefer same category, up to 15)
    const existingProducts = await prisma.product.findMany({
      where: {
        businessId,
        deletedAt: null,
        sellingPrice: { gt: 0 },
        ...(categoryName ? { category: { name: { equals: categoryName, mode: "insensitive" } } } : {}),
      },
      select: {
        name: true,
        sellingPrice: true,
        recipeCost: true,
        category: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 15,
    });

    // If same-category returned nothing, fall back to any category (global context)
    const contextProducts =
      existingProducts.length > 0
        ? existingProducts
        : await prisma.product.findMany({
            where: { businessId, deletedAt: null, sellingPrice: { gt: 0 } },
            select: {
              name: true,
              sellingPrice: true,
              recipeCost: true,
              category: { select: { name: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 15,
          });

    // ── Server-side analytics for richer prompt context ──────────────────
    const prices = contextProducts.map((p) => Number(p.sellingPrice)).filter((p) => p > 0);
    const avgPrice = prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;
    const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

    // Detect business positioning tier from existing prices
    const positioningTier =
      avgPrice === 0 ? "unknown" : avgPrice < 15000 ? "budget" : avgPrice < 35000 ? "mid-market" : "premium";

    // Detect premium/value signals in the product name
    const nameLower = (productName || "").toLowerCase();
    const premiumKeywords = [
      "spesial",
      "special",
      "premium",
      "royal",
      "jumbo",
      "xl",
      "large",
      "signature",
      "deluxe",
      "istimewa",
    ];
    const valueKeywords = ["mini", "small", "hemat", "ekonomis", "biasa", "reguler", "original"];
    const hasPremiumSignal = premiumKeywords.some((k) => nameLower.includes(k));
    const hasValueSignal = valueKeywords.some((k) => nameLower.includes(k));
    const nameSignal = hasPremiumSignal ? "premium" : hasValueSignal ? "value/budget" : "standard";

    const existingPriceContext =
      contextProducts.length > 0
        ? contextProducts
            .map((p) => {
              const sp = Number(p.sellingPrice);
              const rc = Number(p.recipeCost);
              const m = sp > 0 && rc >= 0 ? Math.round(((sp - rc) / sp) * 100) : null;
              return `- ${p.name} (${p.category?.name ?? "Uncategorized"}): Rp ${sp.toLocaleString("id-ID")}${
                m !== null ? `, margin ${m}%` : ""
              }`;
            })
            .join("\n")
        : "(no existing products yet)";

    const businessStats =
      prices.length > 0
        ? `Business pricing stats (same/similar category): avg Rp ${avgPrice.toLocaleString("id-ID")}, range Rp ${minPrice.toLocaleString("id-ID")}–Rp ${maxPrice.toLocaleString("id-ID")}, positioning: ${positioningTier}`
        : "No existing products to benchmark against.";

    const prompt = `You are a strategic pricing consultant specialising in Indonesian UMKM food & beverage businesses.

## Product to price
- Name: ${productName || "Unknown"}
- Category: ${categoryName || "Unknown"}
- Recipe cost: Rp ${recipeCost.toLocaleString("id-ID")}
- Name signals: ${nameSignal} (detected from product name keywords)

## This business's existing products (pricing benchmarks)
${existingPriceContext}

## Business positioning summary
${businessStats}

## Your task — apply ALL of the following marketing tactics:

1. **What is the product?**
   Identify the actual item from the name (e.g. "Es Kopi Susu" = iced milk coffee → premium-margin beverage; "Nasi Goreng" = fried rice → moderate-margin staple food). Use appropriate base margin: beverages 60–150%, food staples 40–80%, snacks/desserts 50–100%.

2. **Perceived value & name premium**
   If the name contains premium signals (Spesial, Premium, Royal, XL, Jumbo, Signature, Deluxe, Istimewa), increase price 15–30% above the category average to justify the premium positioning.
   If it contains value/budget signals (Mini, Hemat, Ekonomis, Reguler), price 10–20% below category average to win price-sensitive customers.

3. **Business positioning anchor**
   Match the ${positioningTier} tier detected from existing prices. A budget-tier business should rarely exceed Rp ${(avgPrice * 1.4).toLocaleString("id-ID")}; a premium-tier business should rarely go below Rp ${(avgPrice * 0.7).toLocaleString("id-ID")}.

4. **Charm pricing psychology**
   - Premium products (margin >60%): use clean round thousands (Rp 25.000, Rp 30.000) — signals confidence & quality.
   - Mid-tier products: use Rp X.500 endings (Rp 17.500, Rp 22.500) — feels like a deal without cheapening.
   - Avoid price thresholds that feel wrong (e.g. Rp 21.000 is awkward; choose Rp 20.000 or Rp 22.000 instead).
   - Never land just above a round-number threshold (e.g. Rp 26.000 feels more expensive than Rp 25.000 for minimal gain).

5. **Competitive differentiation**
   - If this product is a common/competitive type (kopi, nasi goreng, mie ayam): price at or slightly below the category average to drive trial.
   - If this product is unique or specialty: price toward the top of the range to maximise margin.

6. **Hard constraint**: recommended price must be ≥ recipe cost (Rp ${recipeCost.toLocaleString("id-ID")}).

Respond with ONLY this JSON (no markdown):
{
  "recommendedPrice": 25000,
  "margin": 65.5,
  "reasoning": "Satu kalimat taktis dalam Bahasa Indonesia yang menjelaskan keputusan utama harga ini."
}

"margin" = ((recommendedPrice - recipeCost) / recommendedPrice) * 100.
"reasoning" MUST be in Indonesian (Bahasa Indonesia) and explain the key tactic used.`;

    const completion = await createGroqCompletion({
      messages: [
        {
          role: "system",
          content: "You are a pricing expert. Respond ONLY with valid JSON, no markdown or explanations.",
        },
        { role: "user", content: prompt },
      ],
      model: GROQ_MODELS.text.primary,
      temperature: 0.3,
      maxTokens: 512,
      responseFormat: { type: "json_object" },
    });

    const raw = completion.choices?.[0]?.message?.content || "";

    try {
      const result = JSON.parse(raw);
      const recommendedPrice = Number(result.recommendedPrice);
      // Ensure the price is never below cost
      const safePrice = recommendedPrice >= recipeCost ? recommendedPrice : Math.ceil((recipeCost * 2) / 1000) * 1000;
      const safeMargin = safePrice > 0 ? Math.round(((safePrice - recipeCost) / safePrice) * 100) : 50;
      return NextResponse.json({
        success: true,
        data: {
          recommendedPrice: safePrice,
          margin: Number(result.margin) || safeMargin,
          reasoning: String(result.reasoning || "Standard UMKM markup applied."),
          recipeCost,
        },
      });
    } catch {
      // Fallback: simple 2x markup with rounding
      const fallbackPrice = Math.ceil((recipeCost * 2) / 1000) * 1000;
      return NextResponse.json({
        success: true,
        data: {
          recommendedPrice: fallbackPrice,
          margin: Math.round(((fallbackPrice - recipeCost) / fallbackPrice) * 100),
          reasoning: "Standard 2x markup with rounding (AI parse failed).",
          recipeCost,
        },
      });
    }
  } catch (error: unknown) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST /api/products/generate/recommend-price error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to generate price recommendation",
      },
      { status: 500 },
    );
  }
}
