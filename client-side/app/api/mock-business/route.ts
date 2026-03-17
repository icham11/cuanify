import { NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * GET /api/mock-business
 *
 * ⚠️ DEV ONLY — Disabled in production.
 * Reads the mock_business cookie.
 *
 * Success (200):
 *   { "id": "biz_123", "name": "Toko Sari", "location": "Bandung" }
 *
 * Errors:
 *   403 — { "error": "Mock routes are disabled in production" }
 *   404 — "No business" (plain text)
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Mock routes are disabled in production" }, { status: 403 });
  }

  const cookieStore = cookies();
  const business = (await cookieStore).get("mock_business");

  if (!business) {
    return new NextResponse("No business", { status: 404 });
  }

  return NextResponse.json(JSON.parse(business.value));
}
