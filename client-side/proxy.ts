import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { verifyToken } from "@/lib/auth/jwt";

/**
 * Proxy — runs BEFORE any page renders (replaces deprecated middleware.ts).
 *
 * Handles role-based redirects so non-owner roles never see Owner pages,
 * and unauthenticated users get sent to /login.
 *
 * Flow:
 *   1. Extract userId from JWT cookie or NextAuth session token
 *   2. If no auth → let /login, /register, /api, /_next pass through; block the rest → /login
 *   3. If auth and non-owner hitting blocked owner pages → redirect by role
 */

const STATIC_PATH_PREFIXES = [
  "/_next",
  "/favicon.ico",
  "/icons",
  "/manifest.json",
  "/sw.js",
];

const PUBLIC_PAGE_PREFIXES = ["/login", "/register", "/offline"];

const CASHIER_BLOCKED_PATHS = [
  "/home",
  "/dashboard/analytics",
  "/dashboard/products",
  "/dashboard/ingredients",
  "/dashboard/recipes",
  "/dashboard/ai",
  "/dashboard/business",
  "/dashboard/staff",
  "/dashboard/ai-analysis",
];

const STAFF_ALLOWED_PAGE_PREFIXES = ["/bakery/production"];

const ADMIN_ALLOWED_PAGE_PREFIXES = [
  "/bakery/dashboard",
  "/bakery/omzet-harian",
  "/bakery/bookings",
  "/bakery/calendar",
  "/bakery/production",
];

const STAFF_ALLOWED_API_RULES: Array<{
  prefix: string;
  methods: ReadonlyArray<string>;
}> = [
  // Auth endpoints — wajib untuk semua role
  { prefix: "/api/auth/me", methods: ["GET"] },
  { prefix: "/api/auth/logout", methods: ["POST"] },
  { prefix: "/api/auth/post-login", methods: ["GET"] },
  { prefix: "/api/auth/session", methods: ["GET"] },
  { prefix: "/api/auth/csrf", methods: ["GET"] },
  { prefix: "/api/auth/providers", methods: ["GET"] },

  // Business info — dibutuhkan untuk context bisnis
  { prefix: "/api/businesses", methods: ["GET"] },

  // Bakery settings — dibutuhkan oleh useBakerySettings (token limit, dll)
  { prefix: "/api/bakery/settings", methods: ["GET"] },

  // Booking orders — Staff perlu baca & sync data order produksi
  { prefix: "/api/bookings/orders", methods: ["GET", "POST"] },

  // Booking automations — Staff perlu trigger notif produksi
  { prefix: "/api/bookings/automations", methods: ["GET", "POST"] },

  // Staff tokens — untuk tracking token produksi harian Staff
  { prefix: "/api/bakery/production/staff-tokens", methods: ["GET"] },
];

const ADMIN_ALLOWED_API_RULES: Array<{
  prefix: string;
  methods: ReadonlyArray<string>;
}> = [
  { prefix: "/api/auth/me", methods: ["GET"] },
  { prefix: "/api/auth/logout", methods: ["POST"] },
  { prefix: "/api/auth/post-login", methods: ["GET"] },
  { prefix: "/api/auth/session", methods: ["GET"] },
  { prefix: "/api/auth/csrf", methods: ["GET"] },
  { prefix: "/api/auth/providers", methods: ["GET"] },
  { prefix: "/api/businesses", methods: ["GET"] },
  { prefix: "/api/staff", methods: ["GET"] },
  { prefix: "/api/bakery/settings", methods: ["GET"] },
  { prefix: "/api/bakery/production/staff-tokens", methods: ["GET"] },
  { prefix: "/api/bookings/orders", methods: ["GET", "POST"] },
  { prefix: "/api/bookings/automations", methods: ["GET", "POST"] },
  { prefix: "/api/bookings/capacity", methods: ["GET"] },
  { prefix: "/api/bookings/catalog-config", methods: ["GET", "PUT"] },
  { prefix: "/api/bookings/shipping/quote", methods: ["POST"] },
  { prefix: "/api/bookings/shipping/create-resi", methods: ["POST"] },
  { prefix: "/api/bookings/parse-whatsapp", methods: ["POST"] },
  { prefix: "/api/bookings/marketplace-email/latest", methods: ["GET"] },
  { prefix: "/api/bookings/google-calendar/connect", methods: ["GET"] },
  { prefix: "/api/bookings/google-calendar/callback", methods: ["GET"] },
  { prefix: "/api/bookings/google-calendar/disconnect", methods: ["POST"] },
  { prefix: "/api/bookings/google-calendar/status", methods: ["GET"] },
  { prefix: "/api/bookings/google-calendar/events", methods: ["GET"] },
  { prefix: "/api/admin/daily-omzet", methods: ["GET"] },
  { prefix: "/api/admin/daily-omzet/reconciliation", methods: ["GET"] },
  { prefix: "/api/sales", methods: ["GET"] },
];

const MOBILE_USER_AGENT_PATTERN = /Android|iPhone|iPad|iPod|Mobile/i;

type AppRole = "Owner" | "Admin" | "Cashier" | "Staff";

function normalizeRole(value: unknown): AppRole | null {
  if (
    value === "Owner" ||
    value === "Admin" ||
    value === "Cashier" ||
    value === "Staff"
  ) {
    return value;
  }
  return null;
}

function isStaticPath(pathname: string) {
  return STATIC_PATH_PREFIXES.some((p) => pathname.startsWith(p));
}

function isPublicPage(pathname: string) {
  return PUBLIC_PAGE_PREFIXES.some((p) => pathname.startsWith(p));
}

function isApiPath(pathname: string) {
  return pathname.startsWith("/api");
}

function isMobileRequest(request: NextRequest) {
  const userAgent = request.headers.get("user-agent") || "";
  const secChUaMobile = request.headers.get("sec-ch-ua-mobile");

  return secChUaMobile === "?1" || MOBILE_USER_AGENT_PATTERN.test(userAgent);
}

function isStaffAllowedPage(pathname: string) {
  return STAFF_ALLOWED_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isAdminAllowedPage(pathname: string) {
  return ADMIN_ALLOWED_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isStaffAllowedApi(pathname: string, method: string) {
  return STAFF_ALLOWED_API_RULES.some((rule) => {
    if (!(pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`))) {
      return false;
    }
    return rule.methods.includes(method.toUpperCase());
  });
}

function isAdminAllowedApi(pathname: string, method: string) {
  return ADMIN_ALLOWED_API_RULES.some((rule) => {
    if (!(pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`))) {
      return false;
    }
    return rule.methods.includes(method.toUpperCase());
  });
}

function resolveRoleFromClaims(
  jwtToken: string | undefined,
  nextAuthToken: unknown,
): AppRole | null {
  if (jwtToken) {
    const decoded = verifyToken(jwtToken);
    if (decoded && typeof decoded === "object" && "role" in decoded) {
      const tokenRole = normalizeRole((decoded as { role?: unknown }).role);
      if (tokenRole) return tokenRole;
    }
  }

  if (
    nextAuthToken &&
    typeof nextAuthToken === "object" &&
    "role" in nextAuthToken
  ) {
    const nextAuthRole = normalizeRole(
      (nextAuthToken as { role?: unknown }).role,
    );
    if (nextAuthRole) return nextAuthRole;
  }

  return null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();
  const apiRequest = isApiPath(pathname);

  // Let static assets through.
  if (isStaticPath(pathname) || pathname.includes(".")) {
    return NextResponse.next();
  }

  // Always allow auth self-check endpoint to avoid proxy recursion.
  if (pathname === "/api/auth/me") {
    return NextResponse.next();
  }

  // Public pages stay public.
  if (!apiRequest && isPublicPage(pathname)) {
    return NextResponse.next();
  }

  // ── Check Authentication ──
  const jwtToken = request.cookies.get("token")?.value;
  const nextAuthToken = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  const isAuthenticated = !!jwtToken || !!nextAuthToken;

  // Not logged in → let API route decide, page route redirects to /login.
  if (!isAuthenticated) {
    if (apiRequest) {
      return NextResponse.next();
    }
    if (pathname === "/") {
      return NextResponse.next(); // Allow landing page
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const role = resolveRoleFromClaims(jwtToken, nextAuthToken);

  // API hardening: strict allowlist for Staff/Admin (deny by default).
  if (apiRequest && role === "Staff") {
    if (!isStaffAllowedApi(pathname, method)) {
      return NextResponse.json(
        {
          error:
            "Akses API ditolak untuk role Staff. Endpoint ini tidak termasuk allowlist.",
        },
        { status: 403 },
      );
    }
    return NextResponse.next();
  }

  if (apiRequest && role === "Admin") {
    if (!isAdminAllowedApi(pathname, method)) {
      return NextResponse.json(
        {
          error:
            "Akses API ditolak untuk role Admin. Endpoint ini tidak termasuk allowlist operasional.",
        },
        { status: 403 },
      );
    }
    return NextResponse.next();
  }

  // Page hardening for non-owner roles.
  if (role === "Cashier") {
    const blockedForCashier =
      pathname === "/home" ||
      pathname === "/" ||
      CASHIER_BLOCKED_PATHS.some((p) => pathname.startsWith(p));

    if (
      blockedForCashier &&
      pathname !== "/pos" &&
      !pathname.startsWith("/pos/") &&
      !pathname.startsWith("/dashboard/sales-history") &&
      !pathname.startsWith("/dashboard/debts")
    ) {
      return NextResponse.redirect(new URL("/pos", request.url));
    }
  }

  if (role === "Admin") {
    if (!isAdminAllowedPage(pathname)) {
      return NextResponse.redirect(new URL("/bakery/bookings", request.url));
    }
  }

  if (role === "Staff") {
    if (!isStaffAllowedPage(pathname)) {
      return NextResponse.redirect(new URL("/bakery/production", request.url));
    }
  }

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
