import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError, requireRole, ForbiddenError } from "@/lib/auth/session";
import {
  acquireProductWriteLock,
  normalizeProductNameKey,
} from "@/lib/products/uniqueness";
import { invalidateProductTokenMapCache } from "@/lib/products/product-token-map-cache";
import { invalidateOrderProductTokenLookupCache } from "@/app/api/bookings/orders/order-helpers";
import {
  isPrismaConnectionTimeout,
  prismaConnectionErrorResponse,
  throwIfPrismaTimeoutCooldownActive,
} from "@/lib/prisma-errors";

export const runtime = "nodejs";

/**
 * Products soft-deleted by the catalog sync bug (product-sync.ts pruning
 * against a shared, rotating base catalog) rather than a deliberate user
 * delete. For each duplicate name, only the copy that was live most recently
 * (latest deletedAt) is restorable — older superseded copies, and anything
 * that would collide with a currently active product name, are left alone.
 */
async function findRestorableProducts(businessId: number) {
  const [deleted, active] = await Promise.all([
    prisma.product.findMany({
      where: { businessId, deletedAt: { not: null } },
      select: { id: true, name: true, deletedAt: true },
    }),
    prisma.product.findMany({
      where: { businessId, deletedAt: null },
      select: { name: true },
    }),
  ]);

  const activeNames = new Set(active.map((p) => normalizeProductNameKey(p.name)));

  const groups = new Map<string, typeof deleted>();
  deleted.forEach((product) => {
    const key = normalizeProductNameKey(product.name);
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(product);
    } else {
      groups.set(key, [product]);
    }
  });

  const restorableIds: number[] = [];
  groups.forEach((rows, key) => {
    if (activeNames.has(key)) return;
    const mostRecentlyActive = rows.reduce((latest, row) =>
      row.deletedAt! > latest.deletedAt! ? row : latest,
    );
    restorableIds.push(mostRecentlyActive.id);
  });

  return restorableIds;
}

// ---------- GET: how many soft-deleted products can be restored ----------

export async function GET() {
  try {
    const auth = await requireAuth();
    requireRole(auth, "Owner");

    const restorableIds = await findRestorableProducts(auth.businessId);
    return NextResponse.json({ restorableCount: restorableIds.length });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("GET /api/products/restore-deleted error:", error);
    return NextResponse.json(
      { error: "Failed to check restorable products" },
      { status: 500 },
    );
  }
}

// ---------- POST: perform the restore ----------

export async function POST() {
  try {
    throwIfPrismaTimeoutCooldownActive();
    const auth = await requireAuth();
    requireRole(auth, "Owner");
    const { businessId } = auth;

    const restored = await prisma.$transaction(async (tx) => {
      await acquireProductWriteLock(tx, businessId);
      const restorableIds = await findRestorableProducts(businessId);
      if (restorableIds.length === 0) return 0;

      await tx.product.updateMany({
        where: { id: { in: restorableIds }, businessId },
        data: { deletedAt: null },
      });
      return restorableIds.length;
    });

    if (restored > 0) {
      invalidateProductTokenMapCache(businessId);
      invalidateOrderProductTokenLookupCache(businessId);
    }

    return NextResponse.json({ success: true, restored });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (isPrismaConnectionTimeout(error)) {
      return prismaConnectionErrorResponse(
        "Koneksi database sedang penuh saat memulihkan produk. Coba lagi beberapa saat.",
      );
    }
    console.error("POST /api/products/restore-deleted error:", error);
    return NextResponse.json(
      { error: "Failed to restore products" },
      { status: 500 },
    );
  }
}
