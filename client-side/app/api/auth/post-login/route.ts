import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { ensureOwnerDefaultProducts } from "@/lib/bookings/owner-product-bootstrap";

/**
 * GET /api/auth/post-login
 *
 * After login (email/password or Google OAuth), this route checks the user's role
 * and redirects them to the correct page:
 *   - Owner → /dashboard/business
 *   - Admin → /bakery/bookings
 *   - Cashier → /pos
 *   - Staff   → /bakery/production
 *   - No business → /onboarding
 */
export async function GET(request: NextRequest) {
  const baseUrl = request.nextUrl.origin;

  try {
    const auth = await requireAuth();

    if (auth.role === "Owner") {
      try {
        await ensureOwnerDefaultProducts({ businessId: auth.businessId });
      } catch (bootstrapError) {
        console.error(
          "GET /api/auth/post-login owner product bootstrap error:",
          bootstrapError,
        );
      }
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

