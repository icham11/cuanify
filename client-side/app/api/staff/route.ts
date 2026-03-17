import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireRole, AuthError, ForbiddenError } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/staff — List all staff members across ALL businesses owned by this user
 * Only Owner can see this.
 */
export async function GET() {
  try {
    const auth = await requireAuth();
    requireRole(auth, "Owner");

    // Get ALL businesses owned by this user
    const ownedBusinesses = await prisma.business.findMany({
      where: { userId: auth.userId },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    });

    const ownedBusinessIds = ownedBusinesses.map((b) => b.id);

    // Get all members across all owned businesses
    const members = await prisma.businessMember.findMany({
      where: { businessId: { in: ownedBusinessIds } },
      include: {
        user: {
          select: { id: true, name: true, email: true, createdAt: true },
        },
        business: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Also include the owner
    const owner = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { id: true, name: true, email: true, createdAt: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        owner,
        businesses: ownedBusinesses,
        members: members.map((m) => ({
          id: m.id,
          userId: m.userId,
          name: m.user.name,
          email: m.user.email,
          role: m.role,
          businessId: m.businessId,
          businessName: m.business.name,
          joinedAt: m.createdAt,
        })),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    console.error("GET /api/staff error:", error);
    return NextResponse.json({ error: "Gagal memuat data staff" }, { status: 500 });
  }
}

/**
 * POST /api/staff — Invite a cashier by email to the ACTIVE business
 * Body: { email: string, role?: "Cashier", businessId?: number }
 * Only Owner can invite.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    requireRole(auth, "Owner");

    const body = await request.json();
    const { email, role = "Cashier", businessId } = body;
    const targetBusinessId = businessId ? Number(businessId) : auth.businessId;

    if (!email) {
      return NextResponse.json({ error: "Email wajib diisi" }, { status: 400 });
    }

    if (role !== "Cashier") {
      return NextResponse.json({ error: "Hanya bisa menambahkan role Cashier" }, { status: 400 });
    }

    // Verify the target business belongs to this owner
    const targetBusiness = await prisma.business.findFirst({
      where: { id: targetBusinessId, userId: auth.userId },
    });
    if (!targetBusiness) {
      return NextResponse.json({ error: "Bisnis tidak ditemukan atau bukan milik Anda" }, { status: 403 });
    }

    // Find user by email
    const targetUser = await prisma.user.findUnique({ where: { email } });
    if (!targetUser) {
      return NextResponse.json(
        { error: "User dengan email tersebut belum terdaftar. Minta mereka register dulu." },
        { status: 404 },
      );
    }

    // Can't add yourself
    if (targetUser.id === auth.userId) {
      return NextResponse.json({ error: "Tidak bisa menambahkan diri sendiri" }, { status: 400 });
    }

    // Check if already a member of this specific business
    const existing = await prisma.businessMember.findUnique({
      where: { businessId_userId: { businessId: targetBusinessId, userId: targetUser.id } },
    });

    if (existing) {
      return NextResponse.json({ error: "User sudah menjadi anggota bisnis ini" }, { status: 409 });
    }

    const member = await prisma.businessMember.create({
      data: {
        businessId: targetBusinessId,
        userId: targetUser.id,
        role: "Cashier",
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: member.id,
        userId: targetUser.id,
        name: targetUser.name,
        email: targetUser.email,
        role: member.role,
        businessId: targetBusinessId,
        businessName: targetBusiness.name,
        joinedAt: member.createdAt,
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    console.error("POST /api/staff error:", error);
    return NextResponse.json({ error: "Gagal menambahkan staff" }, { status: 500 });
  }
}

/**
 * PATCH /api/staff — Edit a staff member
 * Body: { memberId: number, name?: string, businessId?: number }
 * Owner can:
 *   - Update the kasir's display name
 *   - Reassign the kasir to a different business (owned by the same owner)
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth();
    requireRole(auth, "Owner");

    const body = await request.json();
    const { memberId, name, businessId } = body;

    if (!memberId) {
      return NextResponse.json({ error: "memberId wajib diisi" }, { status: 400 });
    }

    // Find the member — must belong to one of owner's businesses
    const ownedBusinesses = await prisma.business.findMany({
      where: { userId: auth.userId },
      select: { id: true },
    });
    const ownedIds = ownedBusinesses.map((b) => b.id);

    const member = await prisma.businessMember.findFirst({
      where: { id: Number(memberId), businessId: { in: ownedIds } },
      include: { user: true },
    });

    if (!member) {
      return NextResponse.json({ error: "Staff tidak ditemukan" }, { status: 404 });
    }

    // Update user name if provided
    if (name && name.trim()) {
      await prisma.user.update({
        where: { id: member.userId },
        data: { name: name.trim() },
      });
    }

    // Reassign to different business if provided
    if (businessId && Number(businessId) !== member.businessId) {
      const newBusinessId = Number(businessId);

      // Verify owner owns the target business
      if (!ownedIds.includes(newBusinessId)) {
        return NextResponse.json({ error: "Bisnis tujuan bukan milik Anda" }, { status: 403 });
      }

      // Check if already a member of the target business
      const existingInTarget = await prisma.businessMember.findUnique({
        where: { businessId_userId: { businessId: newBusinessId, userId: member.userId } },
      });

      if (existingInTarget) {
        return NextResponse.json(
          { error: "Kasir sudah terdaftar di bisnis tujuan" },
          { status: 409 },
        );
      }

      // Move: delete old membership, create new one
      await prisma.$transaction([
        prisma.businessMember.delete({ where: { id: member.id } }),
        prisma.businessMember.create({
          data: {
            businessId: newBusinessId,
            userId: member.userId,
            role: member.role,
          },
        }),
      ]);
    }

    // Fetch updated data
    const updatedUser = await prisma.user.findUnique({
      where: { id: member.userId },
      select: { name: true, email: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: member.id,
        userId: member.userId,
        name: updatedUser?.name,
        email: updatedUser?.email,
      },
      message: "Staff berhasil diperbarui",
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    console.error("PATCH /api/staff error:", error);
    return NextResponse.json({ error: "Gagal memperbarui staff" }, { status: 500 });
  }
}

/**
 * DELETE /api/staff — Remove a staff member
 * Body: { memberId: number }
 * Only Owner can remove. Works across all owned businesses.
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth();
    requireRole(auth, "Owner");

    const body = await request.json();
    const { memberId } = body;

    if (!memberId) {
      return NextResponse.json({ error: "memberId wajib diisi" }, { status: 400 });
    }

    // Find across all owner's businesses
    const ownedBusinesses = await prisma.business.findMany({
      where: { userId: auth.userId },
      select: { id: true },
    });
    const ownedIds = ownedBusinesses.map((b) => b.id);

    const member = await prisma.businessMember.findFirst({
      where: { id: Number(memberId), businessId: { in: ownedIds } },
    });

    if (!member) {
      return NextResponse.json({ error: "Staff tidak ditemukan" }, { status: 404 });
    }

    await prisma.businessMember.delete({ where: { id: member.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    console.error("DELETE /api/staff error:", error);
    return NextResponse.json({ error: "Gagal menghapus staff" }, { status: 500 });
  }
}

