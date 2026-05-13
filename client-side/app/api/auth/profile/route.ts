import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { getBusinessOverviewSummary } from "@/lib/bookings/business-overview";

export const runtime = "nodejs";

/**
 * GET /api/auth/profile — Get current user profile + stats
 */
export async function GET() {
  try {
    const { userId, businessId } = await requireAuth();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const [businessCount, overview] = await Promise.all([
      prisma.business.count({ where: { userId } }),
      businessId ? getBusinessOverviewSummary(businessId) : null,
    ]);

    return NextResponse.json({
      success: true,
      data: {
        ...user,
        stats: {
          businessCount,
          totalProducts: overview?.counts.products ?? 0,
          totalSales: overview?.stats.paidSalesCount ?? 0,
          totalRevenue: overview?.stats.totalRevenue ?? 0,
        },
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}

/**
 * PATCH /api/auth/profile — Update user name
 * Body: { name: string }
 */
export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await requireAuth();
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json({ error: "Name must be at least 2 characters" }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { name: name.trim() },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ success: true, data: user });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}

