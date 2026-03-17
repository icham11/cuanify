import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { signToken } from "@/lib/auth/jwt";

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
  const body = await req.json();
  const { email, password } = body;

  if (!email || !password) {
    return new NextResponse("Missing credentials", { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    return new NextResponse("Invalid credentials", { status: 401 });
  }

  const isValid = await bcrypt.compare(password, user.password);

  if (!isValid) {
    return new NextResponse("Invalid credentials", { status: 401 });
  }


  const token = signToken({ userId: user.id, name: user.name, email: user.email })


  const response = NextResponse.json({ success: true });

  response.cookies.set("token", token, {
    httpOnly: true,
    path: "/",
  });

  return response;
}
