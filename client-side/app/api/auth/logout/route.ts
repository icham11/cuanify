import { NextResponse } from "next/server";

/**
 * POST /api/auth/logout
 *
 * Clears the httpOnly JWT `token` cookie and `active_business_id` cookie.
 * Must be called from the client before redirecting to /login.
 */
export async function POST() {
  const response = NextResponse.json({ success: true });

  // Clear the httpOnly JWT token cookie
  response.cookies.set("token", "", {
    httpOnly: true,
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });

  // Clear the active_business_id cookie
  response.cookies.set("active_business_id", "", {
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });

  return response;
}

