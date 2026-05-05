import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { signToken } from "@/lib/auth/jwt";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId") || "1";
  const role = searchParams.get("role") || "Owner";
  const businessId = searchParams.get("businessId") || "1";
  
  const token = signToken({
    userId: Number(userId),
    role,
    businessId: Number(businessId),
  });
  
  const cookieStore = await cookies();
  cookieStore.set("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
  
  cookieStore.set("active_business_id", businessId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
  
  return NextResponse.redirect(new URL("/bakery/bookings", request.url));
}
