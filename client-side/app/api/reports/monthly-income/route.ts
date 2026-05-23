import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus, SalesChannel } from "@prisma/client";
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

/**
 * GET /api/reports/monthly-income
 *
 * Optimasi dari versi sebelumnya:
 * - Hapus ROW_NUMBER() CTE yang berat (full table partition scan).
 *   Diganti dengan DISTINCT ON (PostgreSQL) yang jauh lebih efisien
 *   karena bisa memanfaatkan indeks ORDER BY secara langsung.
 * - Kedua query (bakery_orders + sale) dijalankan secara concurrent
 *   via Promise.all untuk mengurangi total waktu tunggu (latency).
 * - Filter tahun diterapkan di SQL langsung (bukan post-filter di JS)
 *   untuk mengurangi jumlah row yang ditransfer dari DB ke server.
 */
export async function GET(request: NextRequest) {
  try {
    const { businessId } = await requireAuth();
    const url = new URL(request.url);
    const year = Number(url.searchParams.get("year"));
    const hasYearFilter = Number.isInteger(year) && year > 2000;

    // Ensure soft-delete filter column exists for legacy databases.
    await prisma.$executeRawUnsafe(`
      ALTER TABLE bakery_orders
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    `);

    // Bangun filter tahun secara opsional untuk disisipkan ke query SQL.
    // Kita gunakan string SQL mentah karena Prisma template literal tidak
    // mendukung conditional clause dengan baik di queryRaw.
    const yearFilterSql = hasYearFilter
      ? `AND EXTRACT(YEAR FROM COALESCE(NULLIF(delivery_date, '')::date, updated_at::date)) = ${year}`
      : "";

    // Fix: Jalankan kedua query secara CONCURRENT (Promise.all) bukan sequential.
    // Query pertama dioptimasi: ROW_NUMBER() → DISTINCT ON (lebih efisien di PostgreSQL).
    const [rows, sales] = await Promise.all([
      // Query 1: Ambil data dari bakery_orders (marketplace channel)
      // Menggunakan DISTINCT ON sebagai pengganti ROW_NUMBER() OVER PARTITION BY.
      // DISTINCT ON di PostgreSQL memanfaatkan index ORDER BY, jauh lebih cepat
      // untuk use-case "ambil 1 baris terbaru per group".
      prisma.$queryRawUnsafe<MonthlyIncomeRow[]>(`
        WITH
        latest_orders AS (
          SELECT DISTINCT ON (business_id, external_id) *
          FROM bakery_orders
          WHERE business_id = $1
            AND deleted_at IS NULL
            ${yearFilterSql}
          ORDER BY business_id, external_id, updated_at DESC, id DESC
        ),
        latest_items AS (
          SELECT DISTINCT ON (business_id, order_external_id, item_index) *
          FROM bakery_order_items
          WHERE business_id = $1
          ORDER BY business_id, order_external_id, item_index, created_at DESC, id DESC
        )
        SELECT
          TO_CHAR(COALESCE(NULLIF(bo.delivery_date, '')::date, bo.updated_at::date), 'YYYY-MM') AS month_key,
          COALESCE(
            NULLIF(item.payload->>'productId', ''),
            NULLIF(item.payload->>'product_id', ''),
            md5(COALESCE(item.payload->>'productName', bo.product, 'Produk'))
          ) AS product_id,
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
        GROUP BY month_key, product_id, product_name
        ORDER BY month_key ASC, product_name ASC
      `, businessId),

      // Query 2: Data transaksi penjualan dari tabel Sale (concurrent)
      prisma.sale.findMany({
        where: {
          businessId,
          paymentStatus: PaymentStatus.Paid,
          sales_channel: {
            in: [SalesChannel.tokopedia, SalesChannel.shopee],
          },
          ...(hasYearFilter
            ? {
                createdAt: {
                  gte: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
                  lt: new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0)),
                },
              }
            : {}),
        },
        select: {
          createdAt: true,
          saleItems: {
            select: {
              productId: true,
              quantity: true,
              priceAtSale: true,
              product: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      }),
    ]);

    // Merge hasil kedua query ke dalam satu Map untuk deduplikasi
    const merged = new Map<
      string,
      {
        month: string;
        productId: string | null;
        productName: string;
        quantity: number;
        revenue: number;
      }
    >();

    rows.forEach((row) => {
      const entry = {
        month: row.month_key,
        productId: row.product_id,
        productName: row.product_name || "Produk",
        quantity: toNumber(row.quantity),
        revenue: toNumber(row.revenue),
      };
      merged.set(`${entry.month}||${entry.productId}||${entry.productName}`, entry);
    });

    sales.forEach((sale) => {
      const month = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
      }).format(sale.createdAt);

      sale.saleItems.forEach((item) => {
        const productId = String(item.productId);
        const productName = item.product.name || "Produk";
        const key = `${month}||${productId}||${productName}`;
        const current = merged.get(key) ?? {
          month,
          productId,
          productName,
          quantity: 0,
          revenue: 0,
        };

        current.quantity += toNumber(item.quantity);
        current.revenue += toNumber(item.quantity) * toNumber(item.priceAtSale);
        merged.set(key, current);
      });
    });

    return NextResponse.json({
      success: true,
      data: Array.from(merged.values()).sort((left, right) => {
        if (left.month !== right.month) return left.month.localeCompare(right.month);
        return left.productName.localeCompare(right.productName);
      }),
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
