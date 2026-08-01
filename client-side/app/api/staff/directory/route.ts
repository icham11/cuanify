import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth/session";
import {
  DatabaseTemporarilyUnavailableError,
  isPrismaConnectionTimeout,
  prismaConnectionErrorResponse,
} from "@/lib/prisma-errors";

export const dynamic = "force-dynamic";

type DirectoryEntry = {
  userId: number;
  name: string;
  role: string;
};

const DIRECTORY_CACHE_TTL_MS = 60_000;

const globalForDirectoryCache = globalThis as typeof globalThis & {
  __staffDirectoryCache?: Map<
    number,
    { expiresAt: number; members: DirectoryEntry[] }
  >;
};

function getDirectoryCache() {
  if (!globalForDirectoryCache.__staffDirectoryCache) {
    globalForDirectoryCache.__staffDirectoryCache = new Map();
  }
  return globalForDirectoryCache.__staffDirectoryCache;
}

/**
 * GET /api/staff/directory — Direktori nama anggota bisnis aktif.
 *
 * Berbeda dengan GET /api/staff (khusus Owner/Admin, mengembalikan email dan
 * data keanggotaan lengkap), endpoint ini hanya mengembalikan pasangan
 * userId + nama + role sehingga aman dibuka untuk semua role. Dipakai UI
 * produksi agar Staff bisa melihat nama rekan yang memegang sebuah stage.
 */
export async function GET() {
  try {
    const auth = await requireAuth();
    if (!auth.businessId) {
      return NextResponse.json({ success: true, data: { members: [] } });
    }

    const cached = getDirectoryCache().get(auth.businessId);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({
        success: true,
        data: { members: cached.members },
      });
    }

    const [business, members] = await Promise.all([
      prisma.business.findUnique({
        where: { id: auth.businessId },
        select: { user: { select: { id: true, name: true } } },
      }),
      prisma.businessMember.findMany({
        where: { businessId: auth.businessId },
        select: {
          userId: true,
          role: true,
          user: { select: { name: true } },
        },
      }),
    ]);

    const byUserId = new Map<number, DirectoryEntry>();

    if (business?.user?.id) {
      byUserId.set(business.user.id, {
        userId: business.user.id,
        name: (business.user.name ?? "").trim(),
        role: "Owner",
      });
    }

    for (const member of members) {
      byUserId.set(member.userId, {
        userId: member.userId,
        name: (member.user?.name ?? "").trim(),
        role: member.role,
      });
    }

    const directory = Array.from(byUserId.values()).filter(
      (entry) => entry.name.length > 0,
    );

    getDirectoryCache().set(auth.businessId, {
      members: directory,
      expiresAt: Date.now() + DIRECTORY_CACHE_TTL_MS,
    });

    return NextResponse.json({
      success: true,
      data: { members: directory },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (
      error instanceof DatabaseTemporarilyUnavailableError ||
      isPrismaConnectionTimeout(error)
    ) {
      return prismaConnectionErrorResponse(
        "Koneksi database timeout saat memuat direktori staff.",
      );
    }
    return NextResponse.json(
      { error: "Gagal memuat direktori staff." },
      { status: 500 },
    );
  }
}
