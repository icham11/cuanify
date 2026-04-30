import { cookies, headers } from "next/headers"
import { getServerSession } from "next-auth"
import { getToken } from "next-auth/jwt"
import { authOptions } from "@/lib/auth"
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
  role: UserRole // "Owner" | "Admin" | "Cashier" | "Staff"
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
): Promise<{ userId: number; businessId?: number; role?: UserRole } | undefined> {
  const cookieToken = cookieStore.get("token")?.value
  if (cookieToken) {
    const decoded = verifyToken(cookieToken)
    if (decoded && typeof decoded === "object" && "userId" in decoded) {
      const parsed = normalizeNumericId((decoded as { userId: unknown }).userId)
      if (parsed) {
        return {
          userId: parsed,
          businessId: normalizeNumericId((decoded as { businessId?: unknown }).businessId),
          role: (decoded as { role?: UserRole }).role,
        }
      }
    }
  }

  const authHeader = headerList.get("authorization")
  if (authHeader?.startsWith("Bearer ")) {
    const bearerToken = authHeader.replace("Bearer ", "")
    const decoded = verifyToken(bearerToken)
    if (decoded && typeof decoded === "object" && "userId" in decoded) {
      const parsed = normalizeNumericId((decoded as { userId: unknown }).userId)
      if (parsed) {
        return {
          userId: parsed,
          businessId: normalizeNumericId((decoded as { businessId?: unknown }).businessId),
          role: (decoded as { role?: UserRole }).role,
        }
      }
    }
  }

  return undefined
}

async function resolveUserIdFromNextAuthJwt(): Promise<number | undefined> {
  try {
    // 1. Try official getServerSession (App Router recommended way)
    const session = await getServerSession(authOptions)
    if (session?.user?.id) {
      const directId = normalizeNumericId(session.user.id)
      if (directId) return directId
    }

    // 2. Fallback to getToken with a properly formatted mock request (more reliable in some Vercel Edge cases)
    const cookieStore = await cookies()
    const headerList = await headers()
    
    const token = await getToken({
      req: {
        headers: Object.fromEntries(headerList.entries()),
        cookies: Object.fromEntries(cookieStore.getAll().map(c => [c.name, c.value]))
      } as any,
      secret: process.env.NEXTAUTH_SECRET,
      secureCookie: process.env.NODE_ENV === "production" || process.env.NEXTAUTH_URL?.startsWith("https")
    })

    if (token) {
      const directId =
        normalizeNumericId((token as Record<string, unknown>).id) ??
        normalizeNumericId((token as Record<string, unknown>).userId) ??
        normalizeNumericId(token.sub)

      if (directId) return directId

      if (typeof token.email === "string" && token.email.trim() !== "") {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email },
          select: { id: true },
        })
        if (dbUser) return dbUser.id
      }
    }

    // 3. Last resort fallback for session email
    if (session?.user?.email) {
      const dbUser = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      })
      if (dbUser) return dbUser.id
    }
  } catch (error) {
    console.error("[Auth] resolveUserIdFromNextAuthJwt error:", error)
  }

  return undefined
}

export async function requireAuth(): Promise<AuthResult> {
  const cookieStore = await cookies()
  const headerList = await headers()

  // 1) Try NextAuth JWT cookie/header first (Google OAuth flow)
  let userId = await resolveUserIdFromNextAuthJwt()
  let jwtBusinessId: number | undefined
  let jwtRole: UserRole | undefined

  if (!userId) {
    const customAuth = await resolveUserIdFromCustomJwt(cookieStore, headerList)
    if (customAuth) {
      userId = customAuth.userId
      jwtBusinessId = customAuth.businessId
      jwtRole = customAuth.role
    }
  }

  if (!userId) {
    const hasNextAuth = cookieStore.get("next-auth.session-token") || cookieStore.get("__Secure-next-auth.session-token")
    const hasCustom = cookieStore.get("token")
    
    let reason = "Sesi tidak ditemukan."
    if (!hasNextAuth && !hasCustom) reason = "Anda belum login atau cookie diblokir browser."
    else if (hasNextAuth && !userId) reason = "Sesi Google ditemukan tapi gagal divalidasi (Secret mismatch?)."
    else if (hasCustom && !userId) reason = "Token login ditemukan tapi gagal divalidasi (JWT Secret mismatch?)."

    throw new AuthError(`Unauthorized: ${reason}`)
  }

  const preferredId = cookieStore.get("active_business_id")?.value

  // Jika tidak ada request ganti bisnis (preferredId) dan token JWT memiliki informasi lengkap,
  // bypass pengecekan database sepenuhnya.
  if (!preferredId && jwtBusinessId && jwtRole) {
    return {
      userId: Number(userId),
      businessId: jwtBusinessId,
      role: jwtRole,
    }
  }

  // 4️⃣ Resolve active business — respect cookie preference for multi-business switch
  let business = null

  if (preferredId) {
    // Try to find the preferred business — must belong to this user (as owner)
    business = await prisma.business.findFirst({
      where: { id: Number(preferredId), userId: Number(userId) },
    })

    // Or as a member (admin/cashier/staff)
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

  // 5️⃣ If not an owner, check if they're a member of any business
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
    throw new AuthError(`Business not found for user ID: ${userId}. Pastikan Anda sudah membuat bisnis di halaman Onboarding.`)
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
