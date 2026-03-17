import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/me — Returns current user info including role and name.
 *
 * The `role` field reflects the user's role for their ACTIVE business:
 *   - If they OWN a business → role = "Owner" (always takes priority)
 *   - If they're only a member (cashier) → role = "Cashier"
 *
 * This prevents the bug where an Owner of Business A who is also
 * added as Cashier in Business B accidentally gets treated as Cashier.
 */
export async function GET() {
  try {
    const auth = await requireAuth();

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { name: true, email: true },
    });

    // Also fetch the active business name for context
    const business = await prisma.business.findUnique({
      where: { id: auth.businessId },
      select: { name: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        userId: auth.userId,
        businessId: auth.businessId,
        businessName: business?.name || "",
        role: auth.role,
        name: user?.name || "User",
        email: user?.email || "",
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

