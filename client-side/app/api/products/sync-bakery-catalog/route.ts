import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import {
  ForbiddenError,
  isAuthError,
  requireAuth,
  requireRole,
} from "@/lib/auth/session";
import { loadEffectiveBookingCatalog } from "@/lib/bookings/catalog-config-server";
import { syncBakeryCatalogToDashboardProducts } from "@/lib/bookings/product-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isExpiredTransactionError(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2028"
  ) {
    return true;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("expired transaction") ||
      message.includes("transaction api error")
    );
  }

  return false;
}

export async function POST() {
  try {
    const auth = await requireAuth();
    requireRole(auth, "Owner");

    const { productCatalog } = await loadEffectiveBookingCatalog(
      auth.businessId,
    );
    const result = await syncBakeryCatalogToDashboardProducts({
      businessId: auth.businessId,
      productCatalog,
    });

    return NextResponse.json({ success: true, data: result }, { status: 200 });
  } catch (error: unknown) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (isExpiredTransactionError(error)) {
      return NextResponse.json(
        {
          error:
            "Sinkronisasi catalog masih diproses dan database sedang sibuk. Coba lagi beberapa detik lagi.",
        },
        { status: 503 },
      );
    }

    console.error("POST /api/products/sync-bakery-catalog error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to sync bakery catalog products",
      },
      { status: 500 },
    );
  }
}
