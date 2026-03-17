import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth/session";
import { createCategorySchema } from "@/lib/validations/product";

export const runtime = "nodejs";

/**
 * GET /api/categories
 *
 * Success (200):
 *   {
 *     "success": true,
 *     "data": [
 *       { "id": 1, "name": "Minuman", "businessId": 1, "_count": { "products": 4 } }
 *     ]
 *   }
 *
 * Errors:
 *   401 — { "error": "Unauthorized" }
 *   500 — { "error": "Failed to fetch categories" }
 */
export async function GET() {
  try {
    const { businessId } = await requireAuth();

    const categories = await prisma.category.findMany({
      where: { businessId },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { products: true } },
      },
    });

    return NextResponse.json({ success: true, data: categories });
  } catch (error: unknown) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/categories error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch categories" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/categories
 *
 * Input (JSON):
 *   { "name": "Makanan" }
 *
 * Success (201 if created, 200 if existing):
 *   {
 *     "success": true,
 *     "data": { "id": 2, "name": "Makanan", "businessId": 1 }
 *   }
 *
 * Errors:
 *   400 — { "error": "Validation failed", "details": { "name": ["..."] } }
 *   401 — { "error": "Unauthorized" }
 *   500 — { "error": "Failed to create category" }
 */
export async function POST(request: NextRequest) {
  try {
    const { businessId } = await requireAuth();
    const body = await request.json();

    const parsed = createCategorySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { name } = parsed.data;

    // Find-or-create: avoid duplicates within the same business
    const existing = await prisma.category.findFirst({
      where: {
        businessId,
        name: { equals: name, mode: "insensitive" },
      },
    });

    if (existing) {
      return NextResponse.json({ success: true, data: existing });
    }

    const category = await prisma.category.create({
      data: { name, businessId },
    });

    return NextResponse.json({ success: true, data: category }, { status: 201 });
  } catch (error: unknown) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST /api/categories error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create category" },
      { status: 500 },
    );
  }
}
