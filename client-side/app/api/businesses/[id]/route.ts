import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { getBusinessOverviewSummary } from "@/lib/bookings/business-overview";
import {
  isPrismaConnectionTimeout,
  prismaConnectionErrorResponse,
} from "@/lib/prisma-errors";

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
      where: {
        id: businessId,
        OR: [
          { userId },
          {
            members: {
              some: {
                userId,
              },
            },
          },
        ],
      },
    });

    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const overview = await getBusinessOverviewSummary(businessId);

    return NextResponse.json({
      success: true,
      data: {
        ...business,
        _count: overview.counts,
        stats: overview.stats,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (isPrismaConnectionTimeout(error)) {
      return prismaConnectionErrorResponse("Koneksi database timeout saat memuat detail bisnis.");
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
    if (isPrismaConnectionTimeout(error)) {
      return prismaConnectionErrorResponse("Koneksi database timeout saat mengubah bisnis.");
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
    if (isPrismaConnectionTimeout(error)) {
      return prismaConnectionErrorResponse("Koneksi database timeout saat menghapus bisnis.");
    }
    return NextResponse.json({ error: "Failed to delete business" }, { status: 500 });
  }
}
