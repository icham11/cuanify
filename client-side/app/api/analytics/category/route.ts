import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth/session";
import { getBakeryCategoryAnalytics, hasBakeryOrders } from "@/lib/bookings/bakery-analytics";

/**
 * GET /api/analytics/category?from=ISO&to=ISO
 * Returns revenue/profit/qty breakdown by product category.
 */
export async function GET(request: NextRequest) {
  try {
    const { businessId } = await requireAuth();

    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    const now = new Date();
    const fromDate = fromParam
      ? new Date(fromParam)
      : (() => {
          const d = new Date(now);
          d.setDate(d.getDate() - 29);
          d.setHours(0, 0, 0, 0);
          return d;
        })();
    const toDate = toParam ? new Date(toParam) : now;

    const useBakery = await hasBakeryOrders(businessId);

    if (useBakery) {
      const result = await getBakeryCategoryAnalytics(businessId, fromDate, toDate);
      return NextResponse.json({
        success: true,
        categories: result.categories,
        summary: result.summary,
      });
    }

    type CategoryRow = {
      categoryId: number | null;
      categoryName: string | null;
      quantitySold: string;
      revenue: string;
      cost: string;
    };

    const rows = await prisma.$queryRaw<CategoryRow[]>`
      SELECT
        c.id AS "categoryId",
        c.name AS "categoryName",
        SUM(si.quantity)::text AS "quantitySold",
        SUM(si."priceAtSale" * si.quantity)::text AS "revenue",
        SUM(si."costAtSale" * si.quantity)::text AS "cost"
      FROM "SaleItem" si
      JOIN "Sale" s ON s.id = si."saleId"
      JOIN "Product" p ON p.id = si."productId"
      LEFT JOIN "Category" c ON c.id = p."categoryId"
      WHERE s."businessId" = ${businessId}
        AND s."paymentStatus" = 'Paid'
        AND s."createdAt" BETWEEN ${fromDate} AND ${toDate}
      GROUP BY c.id, c.name
      ORDER BY SUM(si."priceAtSale" * si.quantity) DESC
    `;

    const categories = rows.map((r) => {
      const revenue = Number(r.revenue ?? 0);
      const cost = Number(r.cost ?? 0);
      const profit = revenue - cost;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
      return {
        categoryId: r.categoryId,
        categoryName: r.categoryName ?? "Uncategorized",
        quantitySold: Number(r.quantitySold ?? 0),
        revenue,
        cost,
        profit,
        margin: Number(margin.toFixed(1)),
      };
    });

    const totalRevenue = categories.reduce((s, c) => s + c.revenue, 0);

    return NextResponse.json({
      success: true,
      categories: categories.map((c) => ({
        ...c,
        contribution: totalRevenue > 0 ? Number(((c.revenue / totalRevenue) * 100).toFixed(1)) : 0,
      })),
      summary: {
        totalRevenue,
        totalProfit: categories.reduce((s, c) => s + c.profit, 0),
        totalQty: categories.reduce((s, c) => s + c.quantitySold, 0),
      },
    });
  } catch (error) {
    if (isAuthError(error)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("GET /api/analytics/category error:", error);
    return NextResponse.json({ error: "Failed to fetch category analytics" }, { status: 500 });
  }
}
