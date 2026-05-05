import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { verifyToken } from "@/lib/auth/jwt"
import { ensureOwnerDefaultProducts } from "@/lib/bookings/owner-product-bootstrap"

function getUserIdFromJwt(req: NextRequest): number | undefined {
  const token = req.cookies.get("token")?.value
  if (!token) return undefined

  const decoded = verifyToken(token)
  if (decoded && typeof decoded === "object" && "userId" in decoded) {
    const userId = (decoded as { userId?: unknown }).userId
    if (typeof userId === "number") return userId
  }
  return undefined
}

/**
 * GET /api/businesses
 *
 * Success (200):
 *   { "success": true, "data": [...] }
 *
 * Errors:
 *   401 — { "error": "Unauthorized" }
 *   500 — { "error": "Failed to fetch businesses" }
 */
export async function GET(req: NextRequest) {
  try {
    let userId = getUserIdFromJwt(req)
    
    // Fallback ke NextAuth
    if (!userId) {
      const session = await getServerSession(authOptions)
      userId = session?.user?.id
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const businesses = await prisma.business.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    })

    // Also include businesses where user is a member (e.g. Cashier)
    const memberships = await prisma.businessMember.findMany({
      where: { userId: Number(userId) },
      include: { business: true },
      orderBy: { createdAt: "desc" },
    })

    // Merge: owned businesses first, then member businesses (avoid duplicates)
    const ownedIds = new Set(businesses.map((b) => b.id))
    const memberBusinesses = memberships
      .map((m) => m.business)
      .filter((b) => !ownedIds.has(b.id))

    const allBusinesses = [...businesses, ...memberBusinesses]

    return NextResponse.json({ success: true, data: allBusinesses })
  } catch (e) {
    return NextResponse.json(
        { error: "Failed to fetch businesses" },
        { status: 500 },
    )
  }
}

/**
 * POST /api/businesses
 *
 * Input (JSON):
 *   { "name": "Warung Sari", "location": "Jakarta" }  // location optional
 *
 * Success (201):
 *   { "success": true, "data": {...} }
 *
 * Errors:
 *   400 — { "error": "Name required" }
 *   401 — { "error": "Unauthorized" }
 *   500 — { "error": "Failed to create business" }
 */
export async function POST(req: NextRequest) {
  try {
    let userId = getUserIdFromJwt(req)
    
    // Fallback ke NextAuth
    if (!userId) {
      const session = await getServerSession(authOptions)
      userId = session?.user?.id
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { name, location } = body ?? {}

    if (!name) {
      return NextResponse.json({ error: "Name required" }, { status: 400 })
    }

    const business = await prisma.business.create({
      data: {
        name,
        location: location || null,
        userId,
      },
    })

    try {
      await ensureOwnerDefaultProducts({ businessId: business.id, force: true })
    } catch (bootstrapError) {
      console.error("POST /api/businesses owner product bootstrap error:", bootstrapError)
    }

    return NextResponse.json({ success: true, data: business }, { status: 201 })
  } catch (e) {
    return NextResponse.json(
        { error: "Failed to create business" },
        { status: 500 },
    )
  }
}