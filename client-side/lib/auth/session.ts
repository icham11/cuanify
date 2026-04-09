import { cookies, headers } from "next/headers"
import { getToken } from "next-auth/jwt"
import { verifyToken } from "@/lib/auth/jwt"
import prisma from "@/lib/prisma"
import type { UserRole } from "@prisma/client"

export class AuthError extends Error {}
export class ForbiddenError extends Error {}

export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError
}

export function isForbiddenError(error: unknown): error is ForbiddenError {
  return error instanceof ForbiddenError
}

export type AuthResult = {
  userId: number
  businessId: number
  role: UserRole // "Owner" | "Cashier" | "Staff"
}

function normalizeNumericId(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return undefined
}

async function resolveUserIdFromCustomJwt(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  headerList: Awaited<ReturnType<typeof headers>>,
): Promise<number | undefined> {
  // 1) Try JWT from app cookie (set by /api/auth/login and /api/auth/register)
  const cookieToken = cookieStore.get("token")?.value
  if (cookieToken) {
    const decoded = verifyToken(cookieToken)
    if (decoded && typeof decoded === "object" && "userId" in decoded) {
      const parsed = normalizeNumericId((decoded as { userId: unknown }).userId)
      if (parsed) return parsed
    }
  }

  // 2) Try JWT from Bearer header (Postman/API use case)
  const authHeader = headerList.get("authorization")
  if (authHeader?.startsWith("Bearer ")) {
    const bearerToken = authHeader.replace("Bearer ", "")
    const decoded = verifyToken(bearerToken)
    if (decoded && typeof decoded === "object" && "userId" in decoded) {
      const parsed = normalizeNumericId((decoded as { userId: unknown }).userId)
      if (parsed) return parsed
    }
  }

  return undefined
}

async function resolveUserIdFromNextAuthJwt(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  headerList: Awaited<ReturnType<typeof headers>>,
): Promise<number | undefined> {
  // Build a lightweight req shape accepted by next-auth getToken()
  const req = {
    headers: headerList,
    cookies: cookieStore,
  } as unknown as NonNullable<Parameters<typeof getToken>[0]["req"]>

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  })

  if (!token) return undefined

  // Prefer explicit numeric identifiers if present
  const directId =
    normalizeNumericId((token as Record<string, unknown>).id) ??
    normalizeNumericId((token as Record<string, unknown>).userId) ??
    normalizeNumericId(token.sub)

  if (directId) {
    return directId
  }

  // OAuth JWT usually has email + provider `sub`; map email to Prisma user
  if (typeof token.email === "string" && token.email.trim() !== "") {
    const dbUser = await prisma.user.findUnique({
      where: { email: token.email },
      select: { id: true },
    })
    return dbUser?.id
  }

  return undefined
}

export async function requireAuth(): Promise<AuthResult> {
  const cookieStore = await cookies()
  const headerList = await headers()

  // 1) Try NextAuth JWT cookie/header first (Google OAuth flow)
  let userId = await resolveUserIdFromNextAuthJwt(cookieStore, headerList)

  // 2) Fallback to app JWT auth flow (email/password + API clients)
  if (!userId) {
    userId = await resolveUserIdFromCustomJwt(cookieStore, headerList)
  }

  if (!userId) {
    throw new AuthError("Unauthorized")
  }

  // 4️⃣ Resolve active business — respect cookie preference for multi-business switch
  const preferredId = cookieStore.get("active_business_id")?.value

  let business = null

  if (preferredId) {
    // Try to find the preferred business — must belong to this user (as owner)
    business = await prisma.business.findFirst({
      where: { id: Number(preferredId), userId: Number(userId) },
    })

    // Or as a member (cashier)
    if (!business) {
      const membership = await prisma.businessMember.findFirst({
        where: { userId: Number(userId), businessId: Number(preferredId) },
        include: { business: true },
      })
      if (membership) {
        return {
          userId: Number(userId),
          businessId: membership.businessId,
          role: membership.role,
        }
      }
    }
  }

  // Fallback: pick the first business owned by this user
  if (!business) {
    business = await prisma.business.findFirst({
      where: { userId: Number(userId) },
      orderBy: { createdAt: "asc" },
    })
  }

  // 5️⃣ If not an owner, check if they're a member (Cashier) of any business
  if (!business) {
    const membership = await prisma.businessMember.findFirst({
      where: { userId: Number(userId) },
      include: { business: true },
      orderBy: { createdAt: "asc" },
    })

    if (membership) {
      return {
        userId: Number(userId),
        businessId: membership.businessId,
        role: membership.role,
      }
    }
  }

  if (!business) {
    throw new AuthError("Business not found for this user")
  }

  // Owner of the business
  return {
    userId: Number(userId),
    businessId: business.id,
    role: "Owner" as UserRole,
  }
}

/**
 * Require a specific role. Call AFTER requireAuth().
 * Usage:
 *   const auth = await requireAuth();
 *   requireRole(auth, "Owner");
 */
export function requireRole(auth: AuthResult, ...allowedRoles: UserRole[]): void {
  if (!allowedRoles.includes(auth.role)) {
    throw new ForbiddenError(
      `Akses ditolak. Hanya ${allowedRoles.join("/")} yang bisa mengakses fitur ini.`
    )
  }
}
