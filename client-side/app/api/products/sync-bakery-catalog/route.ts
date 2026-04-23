import { NextResponse } from "next/server";
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
