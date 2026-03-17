import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth/session";

export const runtime = "nodejs";

/**
 * GET /api/businesses/[id] — Get single business details + stats
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireAuth();
    const { id } = await params;
    const businessId = Number(id);

    if (!businessId || isNaN(businessId)) {
      return NextResponse.json({ error: "Invalid business ID" }, { status: 400 });
    }

    const business = await prisma.business.findFirst({
      where: { id: businessId, userId },
      include: {
        _count: {
          select: {
            products: true,
            ingredients: true,
            categories: true,
            sales: true,
          },
        },
      },
    });

    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    // Revenue + metrics
    // marginAvg is derived directly from all-time totals — NOT from BusinessMetrics.marginAvg,
    // which only stores the value for a single day and would show the wrong figure.
    const [revenueAgg, paidSalesCount] = await Promise.all([
      prisma.sale.aggregate({
        where: { businessId, paymentStatus: "Paid" },
        _sum: { totalRevenue: true, totalCost: true },
      }),
      prisma.sale.count({ where: { businessId, paymentStatus: "Paid" } }),
    ]);

    const totalRevenue = Number(revenueAgg._sum.totalRevenue ?? 0);
    const totalCost = Number(revenueAgg._sum.totalCost ?? 0);
    const totalProfit = totalRevenue - totalCost;
    const marginAvg = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : null;

    return NextResponse.json({
      success: true,
      data: {
        ...business,
        stats: {
          totalRevenue,
          totalCost,
          totalProfit,
          paidSalesCount,
          marginAvg,
        },
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to fetch business" }, { status: 500 });
  }
}

/**
 * PATCH /api/businesses/[id] — Update business name/location
 * Body: { name?: string, location?: string }
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireAuth();
    const { id } = await params;
    const businessId = Number(id);

    if (!businessId || isNaN(businessId)) {
      return NextResponse.json({ error: "Invalid business ID" }, { status: 400 });
    }

    // Verify ownership
    const existing = await prisma.business.findFirst({
      where: { id: businessId, userId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || body.name.trim().length < 2) {
        return NextResponse.json({ error: "Name must be at least 2 characters" }, { status: 400 });
      }
      updates.name = body.name.trim();
    }

    if (body.location !== undefined) {
      updates.location = body.location?.trim() || null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const business = await prisma.business.update({
      where: { id: businessId },
      data: updates,
    });

    return NextResponse.json({ success: true, data: business });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to update business" }, { status: 500 });
  }
}

/**
 * DELETE /api/businesses/[id] — Delete a business (only if user has more than one)
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireAuth();
    const { id } = await params;
    const businessId = Number(id);

    const count = await prisma.business.count({ where: { userId } });
    if (count <= 1) {
      return NextResponse.json(
        { error: "Tidak dapat menghapus bisnis terakhir. Minimal harus ada 1 bisnis." },
        { status: 400 },
      );
    }

    const existing = await prisma.business.findFirst({
      where: { id: businessId, userId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    await prisma.business.delete({ where: { id: businessId } });

    return NextResponse.json({ success: true, message: "Business deleted" });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to delete business" }, { status: 500 });
  }
}
