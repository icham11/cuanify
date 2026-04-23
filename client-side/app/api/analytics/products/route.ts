import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth/session";
import { getBakeryProductAnalytics, hasBakeryOrders } from "@/lib/bookings/bakery-analytics";

export async function GET(req: NextRequest) {
  try {
    const { businessId } = await requireAuth();

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!to) {
      return NextResponse.json({ error: "to date required" }, { status: 400 });
    }

    // If 'from' is not provided, use a very old date to fetch all data
    const fromDate = from ? new Date(from) : new Date("2000-01-01");
    const toDate = new Date(to);

    const useBakery = await hasBakeryOrders(businessId);

    if (useBakery) {
      const products = await getBakeryProductAnalytics(businessId, fromDate, toDate);
      const summary = products.reduce(
        (acc, p) => {
          acc.totalRevenue += p.revenue;
          acc.totalCost += p.cost;
          acc.totalProfit += p.profit;
          acc.totalQuantity += p.quantitySold;
          return acc;
        },
        {
          totalRevenue: 0,
          totalCost: 0,
          totalProfit: 0,
          totalQuantity: 0,
        },
      );

      return NextResponse.json({
        meta: { from, to },
        summary,
        products,
        top: {
          byRevenue: [...products].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
          byQuantity: [...products].sort((a, b) => b.quantitySold - a.quantitySold).slice(0, 5),
        },
      });
    }

    type ProductAnalyticsRow = {
      productId: string;
      productName: string;
      quantitySold: number | string | null;
      revenue: number | string | null;
      cost: number | string | null;
    };

    const result = await prisma.$queryRaw<ProductAnalyticsRow[]>`
      SELECT
        p.id AS "productId",
        p.name AS "productName",
        SUM(si.quantity) AS "quantitySold",
        SUM(si."priceAtSale" * si.quantity) AS "revenue",
        SUM(si."costAtSale" * si.quantity) AS "cost"
      FROM "SaleItem" si
      JOIN "Sale" s ON s.id = si."saleId"
      JOIN "Product" p ON p.id = si."productId"
      WHERE s."businessId" = ${businessId}
        AND s."paymentStatus" = 'Paid'
        AND s."createdAt" BETWEEN ${fromDate} AND ${toDate}
      GROUP BY p.id, p.name
      ORDER BY "revenue" DESC
    `;

    const products = result.map((row: ProductAnalyticsRow) => {
      const revenue = Number(row.revenue || 0);
      const cost = Number(row.cost || 0);
      const profit = revenue - cost;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

      return {
        productId: row.productId,
        productName: row.productName,
        quantitySold: Number(row.quantitySold || 0),
        revenue,
        cost,
        profit,
        profitMargin: Number(margin.toFixed(2)),
      };
    });

    const summary = products.reduce(
      (acc, p) => {
        acc.totalRevenue += p.revenue;
        acc.totalCost += p.cost;
        acc.totalProfit += p.profit;
        acc.totalQuantity += p.quantitySold;
        return acc;
      },
      {
        totalRevenue: 0,
        totalCost: 0,
        totalProfit: 0,
        totalQuantity: 0,
      },
    );

    return NextResponse.json({
      meta: { from, to },
      summary,
      products,
      top: {
        byRevenue: [...products].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
        byQuantity: [...products].sort((a, b) => b.quantitySold - a.quantitySold).slice(0, 5),
      },
    });
  } catch (error: unknown) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("GET /analytics/products error:", error);
    return NextResponse.json({ error: "Failed to fetch product analytics" }, { status: 500 });
  }
}
