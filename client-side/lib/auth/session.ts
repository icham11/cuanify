import { cache } from "react"
import { cookies, headers } from "next/headers"
import { getServerSession } from "next-auth"
import { getToken } from "next-auth/jwt"
import { authOptions } from "@/lib/auth"
import { normalizeEmail } from "@/lib/auth/email"
import { verifyToken } from "@/lib/auth/jwt"
import prisma from "@/lib/prisma"
import {
  isPrismaConnectionTimeout,
  isPrismaTimeoutCooldownActive,
  DatabaseTemporarilyUnavailableError,
  markPrismaTimeoutCooldown,
  withPrismaRetry,
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

type CacheEntry<T> = {
  expiresAt: number
  value: T
}

type MembershipSnapshot = {
  businessId: number
  role: UserRole
}

const AUTH_LOOKUP_CACHE_TTL_MS = 60_000
const globalForAuthLookupCache = globalThis as typeof globalThis & {
  __authBusinessAccessCache?: Map<string, CacheEntry<BusinessAccessResult>>
  __authOwnedBusinessCache?: Map<string, CacheEntry<{ id: number } | null>>
  __authMembershipCache?: Map<string, CacheEntry<MembershipSnapshot | null>>
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message
  }
  return String(error)
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

function getBusinessAccessCache() {
  if (!globalForAuthLookupCache.__authBusinessAccessCache) {
    globalForAuthLookupCache.__authBusinessAccessCache = new Map()
  }
  return globalForAuthLookupCache.__authBusinessAccessCache
}

function getOwnedBusinessCache() {
  if (!globalForAuthLookupCache.__authOwnedBusinessCache) {
    globalForAuthLookupCache.__authOwnedBusinessCache = new Map()
  }
  return globalForAuthLookupCache.__authOwnedBusinessCache
}

function getMembershipCache() {
  if (!globalForAuthLookupCache.__authMembershipCache) {
    globalForAuthLookupCache.__authMembershipCache = new Map()
  }
  return globalForAuthLookupCache.__authMembershipCache
}

function readCacheEntry<T>(cache: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const entry = cache.get(key)
  if (!entry) return undefined
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key)
    return undefined
  }
  return entry.value
}

function writeCacheEntry<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + AUTH_LOOKUP_CACHE_TTL_MS,
  })
  return value
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

async function resolvePayloadFromNextAuth(): Promise<{ userId?: number; businessId?: number; role?: UserRole } | undefined> {
  try { // Blok try-catch untuk mengamankan data NextAuth dari kegagalan server
    // 1. Ambil session NextAuth dari context server
    const session = await getServerSession(authOptions)
    // Ambil user dari session jika ada
    const sessionUser =
      session?.user && typeof session.user === "object"
        ? (session.user as Record<string, unknown>)
        : null

    let userId: number | undefined = undefined
    let businessId: number | undefined = undefined
    let role: UserRole | undefined = undefined

    // 2. Ekstrak data dari session NextAuth user
    if (sessionUser) {
      if (sessionUser.id) userId = normalizeNumericId(sessionUser.id)
      if (sessionUser.businessId) businessId = normalizeNumericId(sessionUser.businessId)
      if (sessionUser.role) role = sessionUser.role as UserRole
    }

    // 3. Muat cookies dan headers untuk verifikasi token NextAuth JWT
    const cookieStore = await cookies()
    const headerList = await headers()
    const tokenRequest = {
      headers: Object.fromEntries(headerList.entries()),
      cookies: Object.fromEntries(cookieStore.getAll().map((c) => [c.name, c.value])),
    } as NonNullable<Parameters<typeof getToken>[0]["req"]>

    // Dapatkan JWT Token terenkripsi dari cookies NextAuth
    const token = await getToken({
      req: tokenRequest,
      secret: process.env.NEXTAUTH_SECRET,
      secureCookie:
        process.env.NODE_ENV === "production" ||
        process.env.NEXTAUTH_URL?.startsWith("https"),
    })

    // 4. Jika token JWT NextAuth valid, ekstrak payload di dalamnya
    if (token) {
      if (!userId) {
        userId =
          normalizeNumericId((token as Record<string, unknown>).id) ??
          normalizeNumericId((token as Record<string, unknown>).userId) ??
          normalizeNumericId(token.sub)
      }
      if (!businessId) {
        businessId =
          normalizeNumericId((token as Record<string, unknown>).businessId) ??
          normalizeNumericId((token as Record<string, unknown>).activeBusinessId)
      }
      if (!role) {
        role = (token as Record<string, unknown>).role as UserRole
      }

      // Jika user ID kosong tetapi email terisi, lakukan kueri pencarian user ke DB secara aman
      const normalizedTokenEmail = normalizeEmail(token.email)
      if (!userId && normalizedTokenEmail) {
        // Jangan lakukan kueri DB jika status cooldown koneksi aktif
        if (!isPrismaTimeoutCooldownActive()) {
          const dbUser = await prisma.user.findFirst({
            where: {
              email: {
                equals: normalizedTokenEmail,
                mode: "insensitive",
              },
            },
            select: { id: true },
          })
          if (dbUser) userId = dbUser.id
        }
      }
    }

    // 5. Fallback pencarian user ID lewat email dari session jika token tidak lengkap
    const normalizedSessionEmail = normalizeEmail(sessionUser?.email)
    if (!userId && normalizedSessionEmail) {
      // Jangan lakukan kueri DB jika status cooldown koneksi aktif
      if (!isPrismaTimeoutCooldownActive()) {
        const dbUser = await prisma.user.findFirst({
          where: {
            email: {
              equals: normalizedSessionEmail,
              mode: "insensitive",
            },
          },
          select: { id: true },
        })
        if (dbUser) userId = dbUser.id
      }
    }

    // Kembalikan objek payload yang berhasil di-extract jika userId terisi
    if (userId) {
      return { userId, businessId, role }
    }
  } catch (error) { // Tangkap transient error
    if (isPrismaConnectionTimeout(error)) {
      markPrismaTimeoutCooldown()
    }
    console.error("[Auth] resolvePayloadFromNextAuth error:", error)
  }
  return undefined
}

async function resolveLatestOwnedBusiness(userId: number) {
  const cacheKey = String(userId)
  const cached = readCacheEntry(getOwnedBusinessCache(), cacheKey)
  if (cached !== undefined) {
    return cached
  }

  const business = await withPrismaRetry(() =>
    prisma.business.findFirst({
      where: { userId },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    }),
  )

  return writeCacheEntry(getOwnedBusinessCache(), cacheKey, business)
}

async function resolveLatestMembership(userId: number) {
  const cacheKey = String(userId)
  const cached = readCacheEntry(getMembershipCache(), cacheKey)
  if (cached !== undefined) {
    return cached
  }

  const membership = await withPrismaRetry(() =>
    prisma.businessMember.findFirst({
      where: { userId },
      select: {
        businessId: true,
        role: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  )

  return writeCacheEntry(getMembershipCache(), cacheKey, membership)
}

async function resolveBusinessAccess(args: {
  userId: number // ID pengguna yang sedang diperiksa aksesnya
  businessId: number // ID bisnis yang ingin diakses oleh pengguna
}): Promise<BusinessAccessResult> { // Mengembalikan informasi hak akses bisnis atau null jika ditolak
  const cacheKey = `${args.userId}:${args.businessId}`
  const cached = readCacheEntry(getBusinessAccessCache(), cacheKey)
  if (cached !== undefined) {
    return cached
  }

  // Bungkus seluruh operasi kueri dengan helper withPrismaRetry agar tahan terhadap error koneksi transient (misalnya Neon DB cold-start)
  return withPrismaRetry(async () => {
    try { // Mulai blok try-catch untuk mengamankan kueri bisnis owner dari driver pool exhaustion
      // Cari data apakah pengguna adalah pemilik (owner) dari bisnis tersebut
      const ownedBusiness = await prisma.business.findFirst({
        where: {
          id: args.businessId, // Filter berdasarkan ID bisnis
          userId: args.userId, // Filter berdasarkan ID user pemilik
        },
        select: { id: true }, // Hanya ambil kolom ID untuk minimalisasi payload kueri
      })

      // Jika ditemukan, kembalikan ID bisnis dengan peran akses sebagai Owner
      if (ownedBusiness) {
        return writeCacheEntry(getBusinessAccessCache(), cacheKey, {
          businessId: ownedBusiness.id,
          role: "Owner" as UserRole,
        })
      }
    } catch (err) { // Tangkap kesalahan transient database jika terjadi pool timeout
      // Jika kegagalan disebabkan oleh connection timeout, jangan sembunyikan error tersebut
      if (isPrismaConnectionTimeout(err)) {
        // Lempar kembali error-nya agar ditangkap oleh pembungkus withPrismaRetry untuk dicoba ulang
        throw err
      }
      // Cetak log peringatan jika kegagalan disebabkan oleh masalah non-koneksi
      console.warn(`[resolveBusinessAccess] Owned business query failed:`, err)
    }

    try { // Mulai blok try-catch untuk mengamankan kueri data keanggotaan (membership)
      // Cari data apakah pengguna terdaftar sebagai staff/member di bisnis tersebut
      const membership = await prisma.businessMember.findFirst({
        where: {
          userId: args.userId, // Filter berdasarkan ID user
          businessId: args.businessId, // Filter berdasarkan ID bisnis tujuan
        },
        select: {
          businessId: true, // Ambil ID bisnis terikat
          role: true, // Ambil hak akses peran (role) staff tersebut
        },
      })

      // Jika ditemukan, kembalikan ID bisnis beserta perannya
      if (membership) {
        return writeCacheEntry(getBusinessAccessCache(), cacheKey, {
          businessId: membership.businessId,
          role: membership.role,
        })
      }
    } catch (err) { // Tangkap kesalahan transient database jika terjadi pool timeout
      // Jika kegagalan disebabkan oleh connection timeout, lempar agar dicoba ulang
      if (isPrismaConnectionTimeout(err)) {
        throw err
      }
      // Cetak log peringatan jika kegagalan disebabkan oleh masalah non-koneksi
      console.warn(`[resolveBusinessAccess] Membership query failed:`, err)
    }

    // Jika tidak memiliki akses apa pun setelah mencoba kueri dengan sukses, kembalikan null
    return writeCacheEntry(getBusinessAccessCache(), cacheKey, null)
  }, 3, 1000) // Lakukan maksimal 3 kali percobaan dengan jeda awal 1000ms (exponential backoff internal)
}

export const requireAuth = cache(async (): Promise<AuthResult> => {
  // Ambil cookies dan headers request
  const cookieStore = await cookies()
  const headerList = await headers()
  
  // 1. Coba verifikasi user ID lewat Custom JWT Token
  const customAuth = await resolveUserIdFromCustomJwt(cookieStore, headerList)

  let userId: number | undefined = customAuth?.userId
  let jwtBusinessId: number | undefined = customAuth?.businessId
  let jwtRole: UserRole | undefined = customAuth?.role

  // 2. Jika Custom JWT kosong, coba cari dari NextAuth Session/Token
  if (!userId) {
    const nextAuthPayload = await resolvePayloadFromNextAuth()
    if (nextAuthPayload) {
      userId = nextAuthPayload.userId
      if (!jwtBusinessId) jwtBusinessId = nextAuthPayload.businessId
      if (!jwtRole) jwtRole = nextAuthPayload.role
    }
  }

  // 3. Jika user ID tetap tidak ditemukan, lempar AuthError Unauthorized
  if (!userId) {
    const hasNextAuth =
      cookieStore.get("next-auth.session-token") ||
      cookieStore.get("__Secure-next-auth.session-token")
    const hasCustom = cookieStore.get("token")

    let reason = "Sesi tidak ditemukan."
    if (!hasNextAuth && !hasCustom) reason = "Anda belum login atau cookie diblokir browser."
    else if (hasNextAuth && !userId) reason = "Sesi auth lama ditemukan tapi gagal divalidasi (Secret mismatch?)."
    else if (hasCustom && !userId) reason = "Token login ditemukan tapi gagal divalidasi (JWT Secret mismatch?)."

    throw new AuthError(`Unauthorized: ${reason}`)
  }

  // 4. Dapatkan preferensi ID bisnis aktif dari cookies jika disimpan oleh pengguna
  const preferredId = cookieStore.get("active_business_id")?.value
  const normalizedPreferredId = normalizeNumericId(preferredId)

  // 5. Cek apakah status cooldown database sedang aktif
  if (isPrismaTimeoutCooldownActive()) {
    // Jika aktif dan cadangan context bisnis dari token lengkap, lakukan instant bypass
    if (jwtBusinessId && jwtRole) {
      return {
        userId: Number(userId),
        businessId: jwtBusinessId,
        role: jwtRole,
      }
    }

    // Jika tidak ada context cadangan, langsung lempar error database tidak tersedia
    throw new DatabaseTemporarilyUnavailableError()
  }

  let business = null

  // 6. Tentukan ID bisnis yang diminta (preferensi user atau bawaan JWT)
  const requestedBusinessId = normalizedPreferredId ?? jwtBusinessId

  if (requestedBusinessId) {
    try { // Blok try-catch pengaman kueri pencarian validasi hak akses
      const requestedAccess = await resolveBusinessAccess({
        userId: Number(userId),
        businessId: requestedBusinessId,
      })

      // Jika hak akses terkonfirmasi valid, kembalikan objek AuthResult
      if (requestedAccess) {
        return {
          userId: Number(userId),
          businessId: requestedAccess.businessId,
          role: requestedAccess.role,
        }
      }
    } catch (error) { // Tangkap transient DB error
      // Konversi error ke format string secara aman
      const errString = getErrorMessage(error)

      // Cek apakah terdeteksi masalah koneksi database
      const isConnectionIssue =
        isPrismaConnectionTimeout(error) ||
        errString.includes("connection") ||
        errString.includes("TLS") ||
        errString.includes("SSL") ||
        errString.includes("findFirst") ||
        errString.includes("Pool") ||
        errString.includes("exhausted") ||
        errString.includes("invocation");

      if (isConnectionIssue) {
        markPrismaTimeoutCooldown() // Tandai status cooldown agar tidak membombardir DB
      }
      
      // Jika terjadi masalah koneksi dan cadangan JWT terisi, lakukan fallback aman
      if (
        isConnectionIssue &&
        jwtBusinessId &&
        jwtRole
      ) {
        console.warn(
          "[Auth] Prisma connection issue while resolving active business. Falling back to JWT business context.",
        )
        return {
          userId: Number(userId),
          businessId: jwtBusinessId,
          role: jwtRole,
        }
      }
      throw error // Lemparkan error jika tidak bisa ditangani
    }
  }

  // 7. Jika belum berhasil di-resolve, cari bisnis pertama milik user
  if (!business) {
    try { // Mulai blok try-catch untuk mengamankan kueri pencarian bisnis owner
      const ownedBusiness = await resolveLatestOwnedBusiness(Number(userId))
      business = ownedBusiness ? { id: ownedBusiness.id } : null
    } catch (error) { // Tangkap potensi kesalahan koneksi atau transient TLS database error
      // Konversi error ke format string secara aman
      const errString = getErrorMessage(error)

      // Cek apakah terdeteksi masalah koneksi database
      const isConnectionIssue =
        isPrismaConnectionTimeout(error) ||
        errString.includes("connection") ||
        errString.includes("TLS") ||
        errString.includes("SSL") ||
        errString.includes("findFirst") ||
        errString.includes("Pool") ||
        errString.includes("exhausted") ||
        errString.includes("invocation");

      if (isConnectionIssue) {
        markPrismaTimeoutCooldown() // Tandai status cooldown
        if (jwtBusinessId && jwtRole) { // Jika cadangan context bisnis dari JWT terisi
          console.warn(
            "[Auth] Prisma connection issue while loading owner business. Falling back to JWT business context.",
          )
          return {
            userId: Number(userId),
            businessId: jwtBusinessId,
            role: jwtRole,
          }
        }
        throw new DatabaseTemporarilyUnavailableError()
      }
      throw error // Lemparkan kesalahan lain yang tidak terduga
    }
  }

  // 8. Jika bisnis owner tidak ditemukan, cari membership keanggotaan bisnis
  if (!business) {
    let membership = null
    try { // Mulai blok try-catch untuk kueri keanggotaan bisnis secara aman
      membership = await resolveLatestMembership(Number(userId))
    } catch (error) { // Tangkap potensi kesalahan koneksi atau transient TLS database error
      // Konversi error ke format string secara aman
      const errString = getErrorMessage(error)

      // Cek apakah terdeteksi masalah koneksi database
      const isConnectionIssue =
        isPrismaConnectionTimeout(error) ||
        errString.includes("connection") ||
        errString.includes("TLS") ||
        errString.includes("SSL") ||
        errString.includes("findFirst") ||
        errString.includes("Pool") ||
        errString.includes("exhausted") ||
        errString.includes("invocation");

      if (isConnectionIssue) {
        markPrismaTimeoutCooldown() // Tandai status cooldown
        if (jwtBusinessId && jwtRole) { // Jika cadangan context bisnis dari JWT terisi
          console.warn(
            "[Auth] Prisma connection issue while loading business membership. Falling back to JWT business context.",
          )
          return {
            userId: Number(userId),
            businessId: jwtBusinessId,
            role: jwtRole,
          }
        }
        throw new DatabaseTemporarilyUnavailableError()
      }
      throw error // Lemparkan kesalahan lain yang tidak terduga
    }

    // Jika keanggotaan ditemukan, kembalikan AuthResult
    if (membership) {
      return {
        userId: Number(userId),
        businessId: membership.businessId,
        role: membership.role,
      }
    }
  }

  // 9. Jika tetap tidak ditemukan bisnis sama sekali, lempar AuthError
  if (!business) {
    throw new AuthError(
      `Business not found for user ID: ${userId}. Pastikan Anda sudah membuat bisnis di halaman Onboarding.`,
    )
  }

  // 10. Jika ditemukan bisnis sebagai owner, kembalikan peran Owner
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
