import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/session";

/**
 * GET /api/auth/post-login
 *
 * After login (email/password or Google OAuth), this route checks the user's role
 * and redirects them to the correct page:
 *   - Owner  → /dashboard
 *   - Cashier → /pos
 *   - No business → /onboarding
 */
export async function GET(request: NextRequest) {
  const baseUrl = request.nextUrl.origin;

  try {
    const auth = await requireAuth();

    if (auth.role === "Owner") {
      return NextResponse.redirect(new URL("/dashboard/business", baseUrl));
    }
    if (auth.role === "Cashier") {
      return NextResponse.redirect(new URL("/pos", baseUrl));
    }

    return NextResponse.redirect(new URL("/dashboard/business", baseUrl));
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

