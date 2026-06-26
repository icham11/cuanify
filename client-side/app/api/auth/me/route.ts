import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { verifyToken } from "@/lib/auth/jwt";
import {
  DatabaseTemporarilyUnavailableError,
  isPrismaConnectionTimeout,
} from "@/lib/prisma-errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/me — Returns current user info including role and name.
 *
 * The `role` field reflects the user's role for their ACTIVE business:
 *   - If they OWN a business → role = "Owner" (always takes priority)
 *   - If they're only a member → role = "Admin" | "Cashier" | "Staff"
 *
 * This prevents the bug where an Owner of Business A who is also
 * added as member in Business B accidentally gets treated as member.
 */
export async function GET() {
  try {
    const auth = await requireAuth();
    const cookieStore = await cookies();
    const decoded = verifyToken(cookieStore.get("token")?.value || "");
    const tokenPayload =
      decoded && typeof decoded === "object"
        ? (decoded as Record<string, unknown>)
        : null;

    let name =
      typeof tokenPayload?.name === "string" && tokenPayload.name.trim()
        ? tokenPayload.name
        : "User";
    let email =
      typeof tokenPayload?.email === "string" ? tokenPayload.email : "";
    let businessName = "";

    try {
      const shouldLoadUser =
        !name || name === "User" || !email;

      const [user, business] = await Promise.all([
        shouldLoadUser
          ? prisma.user.findUnique({
              where: { id: auth.userId },
              select: { name: true, email: true },
            })
          : Promise.resolve(null),
        prisma.business.findUnique({
          where: { id: auth.businessId },
          select: { name: true },
        }),
      ]);

      if (user?.name) {
        name = user.name;
      }
      if (user?.email) {
        email = user.email;
      }
      if (business?.name) {
        businessName = business.name;
      }
    } catch (error) {
      if (
        !(error instanceof DatabaseTemporarilyUnavailableError) &&
        !isPrismaConnectionTimeout(error)
      ) {
        throw error;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        userId: auth.userId,
        businessId: auth.businessId,
        businessName,
        role: auth.role,
        name,
        email,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

