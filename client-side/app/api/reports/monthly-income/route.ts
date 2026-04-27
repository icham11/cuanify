import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth/session";

type MonthlyIncomeRow = {
  month_key: string;
  product_id: string | null;
  product_name: string | null;
  quantity: unknown;
  revenue: unknown;
};

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { businessId } = await requireAuth();
    const url = new URL(request.url);
    const year = Number(url.searchParams.get("year"));

    // Ensure soft-delete filter column exists for legacy databases.
    await prisma.$executeRawUnsafe(`
      ALTER TABLE bakery_orders
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    `);

    const rows = await prisma.$queryRaw<MonthlyIncomeRow[]>`
      WITH latest_orders AS (
        SELECT *
        FROM (
          SELECT
            bo.*,
            ROW_NUMBER() OVER (
              PARTITION BY bo.business_id, bo.external_id
              ORDER BY bo.updated_at DESC, bo.id DESC
            ) AS rn
          FROM bakery_orders bo
          WHERE bo.business_id = ${businessId}
        ) ranked_orders
        WHERE ranked_orders.rn = 1
      ),
      latest_items AS (
        SELECT *
        FROM (
          SELECT
            item.business_id,
            item.order_external_id,
            item.item_index,
            item.payload,
            ROW_NUMBER() OVER (
              PARTITION BY item.business_id, item.order_external_id, item.item_index
              ORDER BY item.created_at DESC, item.id DESC
            ) AS rn
          FROM bakery_order_items item
          WHERE item.business_id = ${businessId}
        ) ranked_items
        WHERE ranked_items.rn = 1
      )
      SELECT
        TO_CHAR(COALESCE(NULLIF(bo.delivery_date, '')::date, bo.updated_at::date), 'YYYY-MM') AS month_key,
        COALESCE(NULLIF(item.payload->>'productId', ''), NULLIF(item.payload->>'product_id', ''), md5(COALESCE(item.payload->>'productName', bo.product, 'Produk'))) AS product_id,
        COALESCE(item.payload->>'productName', bo.product, 'Produk') AS product_name,
        COALESCE(SUM(NULLIF(item.payload->>'quantity', '')::numeric), 0)::numeric AS quantity,
        COALESCE(SUM(
          CASE
            WHEN NULLIF(item.payload->>'lineTotal', '') IS NOT NULL
              THEN NULLIF(item.payload->>'lineTotal', '')::numeric
            ELSE
              COALESCE(NULLIF(item.payload->>'basePrice', '')::numeric, 0)
              + COALESCE(NULLIF(item.payload->>'addOnTotal', '')::numeric, 0)
          END
        ), 0)::numeric AS revenue
      FROM latest_orders bo
      LEFT JOIN latest_items item
        ON item.business_id = bo.business_id
       AND item.order_external_id = bo.external_id
      WHERE COALESCE(bo.sales_channel, 'direct') IN ('tokopedia', 'shopee')
        AND LOWER(COALESCE(bo.order_status, '')) = 'completed'
        AND bo.deleted_at IS NULL
        AND (${Number.isInteger(year)} = false OR EXTRACT(YEAR FROM COALESCE(NULLIF(bo.delivery_date, '')::date, bo.updated_at::date)) = ${year})
      GROUP BY month_key, product_id, product_name
      ORDER BY month_key ASC, product_name ASC
    `;

    return NextResponse.json({
      success: true,
      data: rows.map((row) => ({
        month: row.month_key,
        productId: row.product_id,
        productName: row.product_name || "Produk",
        quantity: toNumber(row.quantity),
        revenue: toNumber(row.revenue),
      })),
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("GET /api/reports/monthly-income error:", error);
    return NextResponse.json(
      { error: "Failed to fetch monthly income report" },
      { status: 500 },
    );
  }
}
