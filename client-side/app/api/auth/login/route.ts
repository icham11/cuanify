import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { normalizeEmail } from "@/lib/auth/email";
import { signToken } from "@/lib/auth/jwt";
import {
  isPrismaConnectionTimeout,
  prismaConnectionErrorResponse,
  withPrismaRetry,
} from "@/lib/prisma-errors";

export const runtime = "nodejs";

/**
 * POST /api/auth/login
 *
 * Input (JSON):
 *   { "email": "user@example.com", "password": "secret123" }
 *
 * Success (200):
 *   { "success": true }
 *   + Sets httpOnly cookie: token=<JWT>
 *
 * Errors:
 *   400 — "Missing credentials" (plain text)
 *   401 — "Invalid credentials" (plain text)
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const email = normalizeEmail(body?.email);
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email dan password wajib diisi" },
        { status: 400 },
      );
    }

    const user = await withPrismaRetry(() =>
      prisma.user.findFirst({
        where: {
          email: {
            equals: email,
            mode: "insensitive",
          },
        },
      }),
    );

    if (!user) {
      return NextResponse.json(
        { error: "Email atau password salah" },
        { status: 401 },
      );
    }

    if (!user.password) {
      return NextResponse.json(
        { error: "Akun ini tidak menggunakan password login" },
        { status: 400 },
      );
    }

    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      return NextResponse.json(
        { error: "Email atau password salah" },
        { status: 401 },
      );
    }

    if (user.email !== email) {
      void withPrismaRetry(() =>
        prisma.user.update({
          where: { id: user.id },
          data: { email },
        }),
      ).catch((error) => {
        console.warn("[auth/login] Failed to normalize user email:", error);
      });
    }

    const ownedBusiness = await withPrismaRetry(() =>
      prisma.business.findFirst({
        where: { userId: user.id },
        select: { id: true },
        orderBy: { createdAt: "desc" },
      }),
    );

    const membership = ownedBusiness
      ? null
      : await withPrismaRetry(() =>
          prisma.businessMember.findFirst({
            where: { userId: user.id },
            select: { businessId: true, role: true },
            orderBy: { createdAt: "desc" },
          }),
        );

    const role = ownedBusiness ? "Owner" : membership?.role;
    const businessId = ownedBusiness?.id ?? membership?.businessId;

    const token = signToken({
      userId: user.id,
      name: user.name,
      email,
      ...(role ? { role } : {}),
      ...(businessId ? { businessId } : {}),
    });

    const response = NextResponse.json({ success: true });

    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    if (businessId) {
      response.cookies.set("active_business_id", String(businessId), {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60,
      });
    }

    for (const legacyCookieName of [
      "next-auth.session-token",
      "__Secure-next-auth.session-token",
      "next-auth.callback-url",
      "__Secure-next-auth.callback-url",
      "next-auth.csrf-token",
      "__Host-next-auth.csrf-token",
    ]) {
      response.cookies.set(legacyCookieName, "", {
        httpOnly: true,
        secure:
          process.env.NODE_ENV === "production" ||
          legacyCookieName.startsWith("__"),
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });
    }

    return response;
  } catch (error) {
    console.error("[auth/login] Failed to process login request:", error);

    if (isPrismaConnectionTimeout(error)) {
      return prismaConnectionErrorResponse(
        "Koneksi database sedang sibuk. Coba login lagi beberapa saat.",
      );
    }

    return NextResponse.json(
      { error: "Terjadi kesalahan saat login" },
      { status: 500 },
    );
  }
}
