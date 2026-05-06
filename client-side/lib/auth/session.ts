import { cache } from "react"
import { cookies, headers } from "next/headers"
import { getServerSession } from "next-auth"
import { getToken } from "next-auth/jwt"
import { authOptions } from "@/lib/auth"
import { verifyToken } from "@/lib/auth/jwt"
import prisma from "@/lib/prisma"
import {
  isPrismaConnectionTimeout,
  isPrismaTimeoutCooldownActive,
  DatabaseTemporarilyUnavailableError,
} from "@/lib/prisma-errors"
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
  role: UserRole
}

type BusinessAccessResult =
  | { businessId: number; role: UserRole }
  | null

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
    const session = await getServerSession(authOptions)
    if (session?.user?.id) {
      const directId = normalizeNumericId(session.user.id)
      if (directId) return directId
    }

    const cookieStore = await cookies()
    const headerList = await headers()
    const tokenRequest = {
      headers: Object.fromEntries(headerList.entries()),
      cookies: Object.fromEntries(cookieStore.getAll().map((c) => [c.name, c.value])),
    } as NonNullable<Parameters<typeof getToken>[0]["req"]>

    const token = await getToken({
      req: tokenRequest,
      secret: process.env.NEXTAUTH_SECRET,
      secureCookie:
        process.env.NODE_ENV === "production" ||
        process.env.NEXTAUTH_URL?.startsWith("https"),
    })

    if (token) {
      const directId =
        normalizeNumericId((token as Record<string, unknown>).id) ??
        normalizeNumericId((token as Record<string, unknown>).userId) ??
        normalizeNumericId(token.sub)

      if (directId) return directId

      if (isPrismaTimeoutCooldownActive()) {
        return undefined
      }

      if (typeof token.email === "string" && token.email.trim() !== "") {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email },
          select: { id: true },
        })
        if (dbUser) return dbUser.id
      }
    }

    if (isPrismaTimeoutCooldownActive()) {
      return undefined
    }

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

async function resolveBusinessAccess(args: {
  userId: number
  businessId: number
}): Promise<BusinessAccessResult> {
  const ownedBusiness = await prisma.business.findFirst({
    where: {
      id: args.businessId,
      userId: args.userId,
    },
    select: { id: true },
  })

  if (ownedBusiness) {
    return {
      businessId: ownedBusiness.id,
      role: "Owner" as UserRole,
    }
  }

  const membership = await prisma.businessMember.findFirst({
    where: {
      userId: args.userId,
      businessId: args.businessId,
    },
    select: {
      businessId: true,
      role: true,
    },
  })

  if (membership) {
    return {
      businessId: membership.businessId,
      role: membership.role,
    }
  }

  return null
}

export const requireAuth = cache(async (): Promise<AuthResult> => {
  const cookieStore = await cookies()
  const headerList = await headers()
  const customAuth = await resolveUserIdFromCustomJwt(cookieStore, headerList)

  let userId: number | undefined = customAuth?.userId
  if (!userId) {
    userId = await resolveUserIdFromNextAuthJwt()
  }
  
  const jwtBusinessId: number | undefined = customAuth?.businessId
  const jwtRole: UserRole | undefined = customAuth?.role

  if (!userId) {
    const hasNextAuth =
      cookieStore.get("next-auth.session-token") ||
      cookieStore.get("__Secure-next-auth.session-token")
    const hasCustom = cookieStore.get("token")

    let reason = "Sesi tidak ditemukan."
    if (!hasNextAuth && !hasCustom) reason = "Anda belum login atau cookie diblokir browser."
    else if (hasNextAuth && !userId) reason = "Sesi Google ditemukan tapi gagal divalidasi (Secret mismatch?)."
    else if (hasCustom && !userId) reason = "Token login ditemukan tapi gagal divalidasi (JWT Secret mismatch?)."

    throw new AuthError(`Unauthorized: ${reason}`)
  }

  const preferredId = cookieStore.get("active_business_id")?.value
  const normalizedPreferredId = normalizeNumericId(preferredId)

  if (isPrismaTimeoutCooldownActive()) {
    if (jwtBusinessId && jwtRole) {
      return {
        userId: Number(userId),
        businessId: jwtBusinessId,
        role: jwtRole,
      }
    }

    throw new DatabaseTemporarilyUnavailableError()
  }

  let business = null

  const requestedBusinessId = normalizedPreferredId ?? jwtBusinessId

  if (requestedBusinessId) {
    try {
      const requestedAccess = await resolveBusinessAccess({
        userId: Number(userId),
        businessId: requestedBusinessId,
      })

      if (requestedAccess) {
        return {
          userId: Number(userId),
          businessId: requestedAccess.businessId,
          role: requestedAccess.role,
        }
      }
    } catch (error) {
      if (
        isPrismaConnectionTimeout(error) &&
        jwtBusinessId &&
        jwtRole
      ) {
        console.warn(
          "[Auth] Prisma timeout while resolving active business. Falling back to JWT business context.",
        )
        return {
          userId: Number(userId),
          businessId: jwtBusinessId,
          role: jwtRole,
        }
      }
      throw error
    }
  }

  if (!business) {
    business = await prisma.business.findFirst({
      where: { userId: Number(userId) },
      orderBy: { createdAt: "desc" },
    })
  }

  if (!business) {
    const membership = await prisma.businessMember.findFirst({
      where: { userId: Number(userId) },
      include: { business: true },
      orderBy: { createdAt: "desc" },
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
    throw new AuthError(
      `Business not found for user ID: ${userId}. Pastikan Anda sudah membuat bisnis di halaman Onboarding.`,
    )
  }

  return {
    userId: Number(userId),
    businessId: business.id,
    role: "Owner" as UserRole,
  }
})

export function requireRole(auth: AuthResult, ...allowedRoles: UserRole[]): void {
  if (!allowedRoles.includes(auth.role)) {
    throw new ForbiddenError(
      `Akses ditolak. Hanya ${allowedRoles.join("/")} yang bisa mengakses fitur ini.`,
    )
  }
}
