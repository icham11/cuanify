import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { normalizeEmail } from "@/lib/auth/email";
import { requireAuth, requireRole, AuthError, ForbiddenError } from "@/lib/auth/session";
import {
  DatabaseTemporarilyUnavailableError,
  isPrismaConnectionTimeout,
  prismaConnectionErrorResponse,
} from "@/lib/prisma-errors";

export const dynamic = "force-dynamic";

type StaffListResponseData = {
  owner: {
    id: number;
    name: string | null;
    email: string | null;
    createdAt: Date;
  } | null;
  businesses: Array<{ id: number; name: string }>;
  members: Array<{
    id: number;
    userId: number;
    name: string | null;
    email: string | null;
    role: string;
    businessId: number;
    businessName: string;
    joinedAt: Date;
  }>;
};

const globalForStaffCache = globalThis as typeof globalThis & {
  __staffListCache?: Map<
    string,
    { expiresAt: number; data: StaffListResponseData }
  >;
};

const STAFF_LIST_CACHE_TTL_MS = 60_000;

function getStaffListCache() {
  if (!globalForStaffCache.__staffListCache) {
    globalForStaffCache.__staffListCache = new Map();
  }
  return globalForStaffCache.__staffListCache;
}

function readStaffListCache(key: string) {
  const entry = getStaffListCache().get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    getStaffListCache().delete(key);
    return null;
  }
  return entry.data;
}

function writeStaffListCache(key: string, data: StaffListResponseData) {
  getStaffListCache().set(key, {
    data,
    expiresAt: Date.now() + STAFF_LIST_CACHE_TTL_MS,
  });
}

function invalidateStaffListCacheForUser(userId: number) {
  const cache = getStaffListCache();
  for (const key of [...cache.keys()]) {
    const [, keyUserId] = key.split(":");
    if (Number(keyUserId) === userId) {
      cache.delete(key);
    }
  }
}

function getStaffCacheKey(auth: {
  role: string;
  userId: number;
  businessId: number;
}) {
  return `${auth.role}:${auth.userId}:${auth.businessId}`;
}

const ALLOWED_MEMBER_ROLES = ["Admin", "Cashier", "Staff"] as const;
type ManagedMemberRole = (typeof ALLOWED_MEMBER_ROLES)[number];

/**
 * GET /api/staff — List team members.
 * - Owner: across all owned businesses
 * - Admin/Staff/Cashier: active business only
 */
export async function GET() {
  try {
    const auth = await requireAuth();
    if (
      auth.role !== "Owner" &&
      auth.role !== "Admin" &&
      auth.role !== "Staff" &&
      auth.role !== "Cashier"
    ) {
      throw new ForbiddenError("Akses ditolak.");
    }

    const cacheKey = getStaffCacheKey(auth);
    const cached = readStaffListCache(cacheKey);
    if (cached) {
      return NextResponse.json({ success: true, data: cached });
    }

    const businesses =
      auth.role === "Owner"
        ? await prisma.business.findMany({
            where: { userId: auth.userId },
            select: { id: true, name: true },
            orderBy: { createdAt: "asc" },
          })
        : await prisma.business.findMany({
            where: { id: auth.businessId },
            select: { id: true, name: true },
            take: 1,
          });

    const businessIds = businesses.map((b) => b.id);

    // Get members for allowed business scope.
    const members = await prisma.businessMember.findMany({
      where: { businessId: { in: businessIds } },
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

    const owner =
      auth.role === "Owner"
        ? await prisma.user.findUnique({
            where: { id: auth.userId },
            select: { id: true, name: true, email: true, createdAt: true },
          })
        : null;

    const responseData: StaffListResponseData = {
      owner,
      businesses,
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
    };

    writeStaffListCache(cacheKey, responseData);

    return NextResponse.json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (
      error instanceof DatabaseTemporarilyUnavailableError ||
      isPrismaConnectionTimeout(error)
    ) {
      const auth = await requireAuth().catch(() => null);
      const cached = auth ? readStaffListCache(getStaffCacheKey(auth)) : null;

      if (cached) {
        return NextResponse.json({
          success: true,
          data: cached,
          stale: true,
          source: "memory-cache-fallback",
        });
      }

      if (auth) {
        return NextResponse.json({
          success: true,
          data: {
            owner: null,
            businesses: [],
            members: [],
          },
          stale: true,
          source: "empty-fallback",
        });
      }

      return prismaConnectionErrorResponse("Koneksi database timeout saat memuat anggota tim.");
    }
    console.error("GET /api/staff error:", error);
    return NextResponse.json({ error: "Gagal memuat data anggota tim" }, { status: 500 });
  }
}

/**
 * POST /api/staff — Invite an admin/cashier/staff by email to the ACTIVE business
 * Body: { email: string, role?: "Admin" | "Cashier" | "Staff", businessId?: number }
 * Only Owner can invite.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    requireRole(auth, "Owner");

    const body = await request.json();
    const role = body?.role ?? "Staff";
    const email = normalizeEmail(body?.email);
    const { businessId } = body;
    const targetBusinessId = businessId ? Number(businessId) : auth.businessId;
    const normalizedRole =
      typeof role === "string" && ALLOWED_MEMBER_ROLES.includes(role as ManagedMemberRole)
        ? (role as ManagedMemberRole)
        : null;

    if (!email) {
      return NextResponse.json({ error: "Email wajib diisi" }, { status: 400 });
    }

    if (!normalizedRole) {
      return NextResponse.json(
        { error: `Role tidak valid. Gunakan ${ALLOWED_MEMBER_ROLES.join(" atau ")}.` },
        { status: 400 },
      );
    }

    // Verify the target business belongs to this owner
    const targetBusiness = await prisma.business.findFirst({
      where: { id: targetBusinessId, userId: auth.userId },
    });
    if (!targetBusiness) {
      return NextResponse.json({ error: "Bisnis tidak ditemukan atau bukan milik Anda" }, { status: 403 });
    }

    // Find user by email
    const targetUser = await prisma.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: "insensitive",
        },
      },
    });
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
        role: normalizedRole,
      },
    });

    invalidateStaffListCacheForUser(auth.userId);
    invalidateStaffListCacheForUser(targetUser.id);

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
    if (isPrismaConnectionTimeout(error)) {
      return prismaConnectionErrorResponse("Koneksi database timeout saat menambahkan anggota tim.");
    }
    console.error("POST /api/staff error:", error);
    return NextResponse.json({ error: "Gagal menambahkan anggota tim" }, { status: 500 });
  }
}

/**
 * PATCH /api/staff — Edit a team member
 * Body: { memberId: number, name?: string, businessId?: number, role?: "Admin" | "Cashier" | "Staff" }
 * Owner can:
 *   - Update the member display name
 *   - Update the member role (Admin/Cashier/Staff)
 *   - Reassign the member to a different business (owned by the same owner)
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth();
    requireRole(auth, "Owner");

    const body = await request.json();
    const { memberId, name, businessId, role } = body;
    const normalizedRole =
      typeof role === "string" && ALLOWED_MEMBER_ROLES.includes(role as ManagedMemberRole)
        ? (role as ManagedMemberRole)
        : null;

    if (!memberId) {
      return NextResponse.json({ error: "memberId wajib diisi" }, { status: 400 });
    }

    if (role && !normalizedRole) {
      return NextResponse.json(
        { error: `Role tidak valid. Gunakan ${ALLOWED_MEMBER_ROLES.join(" atau ")}.` },
        { status: 400 },
      );
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
      return NextResponse.json({ error: "Anggota tim tidak ditemukan" }, { status: 404 });
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
          { error: "Anggota tim sudah terdaftar di bisnis tujuan" },
          { status: 409 },
        );
      }

      // Move: delete old membership, create new one (keeping current role unless role override is provided)
      await prisma.$transaction([
        prisma.businessMember.delete({ where: { id: member.id } }),
        prisma.businessMember.create({
          data: {
            businessId: newBusinessId,
            userId: member.userId,
            role: normalizedRole ?? member.role,
          },
        }),
      ]);
    } else if (normalizedRole && normalizedRole !== member.role) {
      await prisma.businessMember.update({
        where: { id: member.id },
        data: { role: normalizedRole },
      });
    }

    invalidateStaffListCacheForUser(auth.userId);
    invalidateStaffListCacheForUser(member.userId);

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
        role: normalizedRole ?? member.role,
      },
      message: "Anggota tim berhasil diperbarui",
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    console.error("PATCH /api/staff error:", error);
    return NextResponse.json({ error: "Gagal memperbarui anggota tim" }, { status: 500 });
  }
}

/**
 * DELETE /api/staff — Remove a team member
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
      return NextResponse.json({ error: "Anggota tim tidak ditemukan" }, { status: 404 });
    }

    await prisma.businessMember.delete({ where: { id: member.id } });
    invalidateStaffListCacheForUser(auth.userId);
    invalidateStaffListCacheForUser(member.userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    console.error("DELETE /api/staff error:", error);
    return NextResponse.json({ error: "Gagal menghapus anggota tim" }, { status: 500 });
  }
}

