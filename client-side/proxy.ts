import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Proxy — runs BEFORE any page renders (replaces deprecated middleware.ts).
 *
 * Handles role-based redirects so Cashiers never see Owner pages,
 * and unauthenticated users get sent to /login.
 *
 * Flow:
 *   1. Extract userId from JWT cookie or NextAuth session token
 *   2. If no auth → let /login, /register, /api, /_next pass through; block the rest → /login
 *   3. If auth and is Cashier hitting /home or /dashboard (overview) → redirect to /pos
 */

// Pages that require NO authentication
const PUBLIC_PATHS = ["/login", "/register", "/onboarding", "/api", "/_next", "/favicon.ico", "/icons", "/manifest.json", "/sw.js", "/offline"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Let public paths and static assets through
  if (isPublic(pathname) || pathname.includes(".")) {
    return NextResponse.next();
  }

  // ── Check Authentication ──
  const jwtToken = request.cookies.get("token")?.value;
  const nextAuthToken = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  const isAuthenticated = !!jwtToken || !!nextAuthToken;

  // Not logged in → redirect to /login (except root landing page)
  if (!isAuthenticated) {
    if (pathname === "/") {
      return NextResponse.next(); // Allow landing page
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // ── Authenticated — check if Cashier needs redirect ──
  const cashierBlockedPaths = ["/home", "/dashboard/analytics", "/dashboard/products", "/dashboard/ingredients", "/dashboard/recipes", "/dashboard/ai", "/dashboard/business", "/dashboard/staff", "/dashboard/ai-analysis"];
  const needsRoleCheck = pathname === "/home" || pathname === "/" || cashierBlockedPaths.some((p) => pathname.startsWith(p));

  if (needsRoleCheck) {
    try {
      const meUrl = new URL("/api/auth/me", request.url);
      const meRes = await fetch(meUrl.toString(), {
        headers: {
          cookie: request.headers.get("cookie") || "",
        },
      });

      if (meRes.ok) {
        const meData = await meRes.json();
        const role = meData?.data?.role;

        if (role === "Cashier") {
          if (pathname !== "/pos" && !pathname.startsWith("/pos/") &&
              !pathname.startsWith("/dashboard/sales-history") &&
              !pathname.startsWith("/dashboard/debts")) {
            return NextResponse.redirect(new URL("/pos", request.url));
          }
        }

          // Redirect ke /home dan /pos dari root dihapus, biarkan user tetap di '/'
      }
    } catch {
      // If role check fails, let the page handle it
    }
  }

    // Redirect default ke /home dihapus, biarkan user tetap di '/'

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static, _next/image (Next.js internals)
     * - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};


    // Tidak ada logic sisa di bawah, pastikan file ditutup dengan benar

