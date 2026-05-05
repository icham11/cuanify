import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole, AuthError, ForbiddenError } from "@/lib/auth/session";
import type { AuthResult } from "@/lib/auth/session";
import type { UserRole } from "@prisma/client";
import { logAuth } from "@/lib/logger";

/**
 * Auth Guard — Centralized authentication wrapper for API routes.
 */

export interface AuthContext {
  userId: number;
  businessId: number;
  role: UserRole;
}

type AuthenticatedHandler = (
  request: NextRequest,
  auth: AuthContext,
) => Promise<NextResponse>;

/**
 * Wrap an API route handler with auth guard.
 */
export function withAuth(handler: AuthenticatedHandler) {
  return async (request: NextRequest, ..._args: unknown[]) => {
    try {
      const auth: AuthResult = await requireAuth();
      return await handler(request, auth);
    } catch (error: unknown) {
      if (error instanceof AuthError) {
        return NextResponse.json(
          { error: error.message || "Unauthorized" },
          { status: 401 },
        );
      }
      if (error instanceof ForbiddenError) {
        return NextResponse.json(
          { error: error.message || "Forbidden" },
          { status: 403 },
        );
      }

      logAuth.error("Unexpected auth guard error", { error });
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  };
}

/**
 * Wrap an API route handler with auth + role guard.
 *
 * Usage:
 * ```ts
 * export const DELETE = withAuthRole(["Owner"], async (request, auth) => {
 *   // Only Owner can reach here
 *   return NextResponse.json({ ok: true });
 * });
 * ```
 */
export function withAuthRole(allowedRoles: UserRole[], handler: AuthenticatedHandler) {
  return withAuth(async (request, auth) => {
    requireRole(auth as AuthResult, ...allowedRoles);
    return handler(request, auth);
  });
}

/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║              API ROUTES AUTH AUDIT — 2026-02-22              ║
 * ╠═══════════════════════════════════════════════════════════════╣
 * ║                                                               ║
 * ║  ✅ PROTECTED (requireAuth / withAuth)                        ║
 * ║  ─────────────────────────────────────                        ║
 * ║  GET/POST  /api/categories                                    ║
 * ║  GET/POST  /api/products                                      ║
 * ║  PATCH/DEL /api/products/[id]                                 ║
 * ║  GET/PUT   /api/products/[id]/recipe                          ║
 * ║  POST      /api/products/generate/name                        ║
 * ║  POST      /api/products/generate/image                       ║
 * ║  POST      /api/products/generate/recipe-image                ║
 * ║  POST      /api/products/generate/recommend-price             ║
 * ║  GET/POST  /api/ingredients                                   ║
 * ║  PATCH/DEL /api/ingredients/[id]                               ║
 * ║  POST      /api/ingredients/[id]/restock                      ║
 * ║  POST      /api/ingredients/[id]/consume                      ║
 * ║  GET/POST  /api/sales                                         ║
 * ║  POST      /api/sales/midtrans-token                          ║
 * ║  GET       /api/sales/[saleId]/invoice                        ║
 * ║  POST      /api/ai/chat                                       ║
 * ║  GET       /api/ai/chat (history)                             ║
 * ║  POST      /api/ai/insights                                   ║
 * ║  POST      /api/ai/rag/index                                  ║
 * ║  POST      /api/ai/rag/search                                 ║
 * ║  GET/POST  /api/ai/sessions                                   ║
 * ║  POST      /api/analyze-image              ← FIXED            ║
 * ║  GET/POST  /api/businesses                 (own JWT check)    ║
 * ║                                                               ║
 * ║  🔓 PUBLIC (intentionally unauthenticated)                    ║
 * ║  ─────────────────────────────────────────                    ║
 * ║  POST      /api/auth/login                                    ║
 * ║  POST      /api/auth/register                                 ║
 * ║  *         /api/auth/[...nextauth]                            ║
 * ║  GET       /api/analyze-image              (health check)     ║
 * ║                                                               ║
 * ║  🔑 SPECIAL AUTH                                              ║
 * ║  ─────────────────────────────────────────                    ║
 * ║  POST      /api/sales/midtrans-notification (webhook sig)     ║
 * ║  POST/GET  /api/cleanup-images             (CRON_SECRET)      ║
 * ║                                                               ║
 * ║  ⚠️  MOCK/DEV ONLY (should disable in production)             ║
 * ║  ─────────────────────────────────────────                    ║
 * ║  GET       /api/mock-business                                 ║
 * ║  POST      /api/mock-business/create                          ║
 * ║  GET       /api/mock-ingredients                              ║
 * ║                                                               ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */


