import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { signToken } from "@/lib/auth/jwt";

/**
 * POST /api/auth/register
 *
 * Input (JSON):
 *   { "name": "John", "email": "john@example.com", "password": "secret123" }
 *
 * Success (200):
 *   { "success": true }
 *   + Sets httpOnly cookie: token=<JWT>
 *
 * Errors:
 *   400 — "Missing fields" (plain text)
 *   400 — "User already exists" (plain text)
 */
export async function POST(req: Request) {
  const body = await req.json();
  const { name, email, password } = body;

  if (!name || !email || !password) {
    return new NextResponse("Missing fields", { status: 400 });
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    return new NextResponse("User already exists", { status: 400 });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
    },
  });

  const token = signToken({ userId: user.id });

  const response = NextResponse.json({ success: true });

  response.cookies.set("token", token, {
    httpOnly: true,
    path: "/",
  });

  return response;
}
