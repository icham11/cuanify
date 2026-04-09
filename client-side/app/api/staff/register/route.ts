import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { requireAuth, requireRole, AuthError, ForbiddenError } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const ALLOWED_MEMBER_ROLES = ["Cashier", "Staff"] as const;
type ManagedMemberRole = (typeof ALLOWED_MEMBER_ROLES)[number];

/**
 * POST /api/staff/register — Owner creates a new Cashier/Staff account
 *
 * This is the "one-stop" registration for UMKM owners.
 * The owner fills in the kasir's name, email, and password,
 * and the system creates:
 *   1. A new User account
 *   2. A BusinessMember record linking the user to the owner's business as selected role
 *
 * Body: { name: string, email: string, password: string, role?: "Cashier" | "Staff" }
 *
 * Only Owner can call this.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    requireRole(auth, "Owner");

    const body = await request.json();
    const { name, email, password, businessId, role = "Staff" } = body;
    const targetBusinessId = businessId ? Number(businessId) : auth.businessId;
    const normalizedRole =
      typeof role === "string" && ALLOWED_MEMBER_ROLES.includes(role as ManagedMemberRole)
        ? (role as ManagedMemberRole)
        : null;

    // ── Validation ──
    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Nama kasir wajib diisi" }, { status: 400 });
    }
    if (!email || !email.trim()) {
      return NextResponse.json({ error: "Email kasir wajib diisi" }, { status: 400 });
    }
    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: "Password minimal 6 karakter" },
        { status: 400 },
      );
    }

    if (!normalizedRole) {
      return NextResponse.json(
        { error: `Role tidak valid. Gunakan ${ALLOWED_MEMBER_ROLES.join(" atau ")}.` },
        { status: 400 },
      );
    }

    // Basic email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json({ error: "Format email tidak valid" }, { status: 400 });
    }

    // ── Verify target business belongs to this owner ──
    const targetBusiness = await prisma.business.findFirst({
      where: { id: targetBusinessId, userId: auth.userId },
      select: { id: true, name: true },
    });
    if (!targetBusiness) {
      return NextResponse.json({ error: "Bisnis tidak ditemukan atau bukan milik Anda" }, { status: 403 });
    }

    // ── Check if email is already taken ──
    const existingUser = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (existingUser) {
      // User exists — check if they're already a member of this business
      const existingMember = await prisma.businessMember.findUnique({
        where: {
          businessId_userId: {
            businessId: targetBusinessId,
            userId: existingUser.id,
          },
        },
      });

      if (existingMember) {
        return NextResponse.json(
          { error: "User dengan email ini sudah menjadi staff di bisnis ini" },
          { status: 409 },
        );
      }

      // Can't add the owner themselves
      if (existingUser.id === auth.userId) {
        return NextResponse.json(
          { error: "Tidak bisa mendaftarkan diri sendiri sebagai kasir" },
          { status: 400 },
        );
      }

      // User exists but not yet a member — just add them as a member
      const member = await prisma.businessMember.create({
        data: {
          businessId: targetBusinessId,
          userId: existingUser.id,
          role: normalizedRole,
        },
      });

      return NextResponse.json(
        {
          success: true,
          data: {
            id: member.id,
            userId: existingUser.id,
            name: existingUser.name,
            email: existingUser.email,
            role: member.role,
            businessId: targetBusinessId,
            businessName: targetBusiness.name,
            joinedAt: member.createdAt,
            isNewAccount: false,
          },
          message: `${existingUser.name} sudah punya akun dan langsung ditambahkan sebagai ${normalizedRole} di ${targetBusiness.name}.`,
        },
        { status: 201 },
      );
    }

    // ── Create new User + BusinessMember in a transaction ──
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password: hashedPassword,
        },
      });

      const member = await tx.businessMember.create({
        data: {
          businessId: targetBusinessId,
          userId: newUser.id,
          role: normalizedRole,
        },
      });

      return { newUser, member };
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: result.member.id,
          userId: result.newUser.id,
          name: result.newUser.name,
          email: result.newUser.email,
          role: result.member.role,
          joinedAt: result.member.createdAt,
          isNewAccount: true,
        },
        message: `Akun ${normalizedRole.toLowerCase()} "${result.newUser.name}" berhasil dibuat dan ditambahkan ke bisnis Anda.`,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("POST /api/staff/register error:", error);
    return NextResponse.json(
      { error: "Gagal mendaftarkan kasir baru" },
      { status: 500 },
    );
  }
}

