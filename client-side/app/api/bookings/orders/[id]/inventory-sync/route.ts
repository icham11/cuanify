import { NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth/session";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCE_TYPE = "bakery_order_inventory_sync";

type InventorySyncMetadata = {
  orderId: string;
  orderStatus?: string;
  deductions?: Array<{
    ingredientId: number;
    ingredientName: string;
    ingredientUnit: string;
    quantity: number;
  }>;
  unresolvedProducts?: string[];
  updatedAt?: string;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { businessId } = await requireAuth();
    const { id } = await context.params;

    const rows = await prisma.$queryRaw<Array<{ metadata: unknown }>>`
      SELECT metadata
      FROM "BusinessDocument"
      WHERE "businessId" = ${businessId}
        AND "sourceType" = ${SOURCE_TYPE}
        AND content = ${`bakery-order:${id}`}
      ORDER BY "updatedAt" DESC
      LIMIT 1
    `;

    const metadata =
      rows[0]?.metadata && typeof rows[0].metadata === "object"
        ? (rows[0].metadata as InventorySyncMetadata)
        : null;

    return NextResponse.json({
      success: true,
      data: metadata
        ? {
            orderId: metadata.orderId,
            orderStatus: metadata.orderStatus ?? "",
            deductions: Array.isArray(metadata.deductions)
              ? metadata.deductions.map((entry) => ({
                  ingredientId: Number(entry.ingredientId || 0),
                  ingredientName: String(entry.ingredientName || ""),
                  ingredientUnit: String(entry.ingredientUnit || ""),
                  quantity: Number(entry.quantity || 0),
                }))
              : [],
            unresolvedProducts: Array.isArray(metadata.unresolvedProducts)
              ? metadata.unresolvedProducts.map((entry) => String(entry))
              : [],
            updatedAt:
              typeof metadata.updatedAt === "string" ? metadata.updatedAt : "",
          }
        : null,
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error("GET /api/bookings/orders/[id]/inventory-sync error:", error);
    return NextResponse.json(
      { error: "Failed to load booking inventory sync" },
      { status: 500 },
    );
  }
}
