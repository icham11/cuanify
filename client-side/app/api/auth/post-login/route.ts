import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/session";

/**
 * GET /api/auth/post-login
 *
 * After login, this route checks the user's role
 * and redirects them to the correct page:
 *   - Owner → /dashboard/business
 *   - Admin → /bakery/bookings
 *   - Cashier → /pos
 *   - Staff   → /bakery/production
 *   - No business → /onboarding
 */
function getRedirectOrigin(request: NextRequest): string {
  const url = request.nextUrl.clone();

  if (url.hostname === "0.0.0.0" || url.hostname === "::") {
    url.hostname = "localhost";
  }

  return url.origin;
}

export async function GET(request: NextRequest) {
  const baseUrl = getRedirectOrigin(request);

  try {
    const auth = await requireAuth();

    if (auth.role === "Owner") {
      return NextResponse.redirect(new URL("/dashboard/business", baseUrl));
    }
    if (auth.role === "Admin") {
      return NextResponse.redirect(new URL("/bakery/bookings", baseUrl));
    }
    if (auth.role === "Cashier") {
      return NextResponse.redirect(new URL("/pos", baseUrl));
    }
    if (auth.role === "Staff") {
      return NextResponse.redirect(new URL("/bakery/production", baseUrl));
    }

    return NextResponse.redirect(new URL("/bakery/bookings", baseUrl));
  } catch (error) {
    if (error instanceof AuthError) {
      // No business found → onboarding
      if (error.message.includes("Business not found")) {
        return NextResponse.redirect(new URL("/onboarding", baseUrl));
      }
      // Not authenticated at all
      return NextResponse.redirect(new URL("/login", baseUrl));
    }
    return NextResponse.redirect(new URL("/login", baseUrl));
  }
}

