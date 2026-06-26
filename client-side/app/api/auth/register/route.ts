import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { isValidEmail, normalizeEmail } from "@/lib/auth/email";
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
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = normalizeEmail(body?.email);
  const password = typeof body?.password === "string" ? body.password : "";

  if (!name || !email || !password) {
    return new NextResponse("Missing fields", { status: 400 });
  }

  if (!isValidEmail(email)) {
    return new NextResponse("Invalid email", { status: 400 });
  }

  const existingUser = await prisma.user.findFirst({
    where: {
      email: {
        equals: email,
        mode: "insensitive",
      },
    },
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

  const token = signToken({
    userId: user.id,
    name: user.name,
    email: user.email,
  });

  const response = NextResponse.json({ success: true });

  response.cookies.set("token", token, {
    httpOnly: true,
    path: "/",
  });

  return response;
}
