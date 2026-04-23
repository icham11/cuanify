import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth/session";
import {
  getBakeryCategoryAnalytics,
  getBakeryDailyAnalytics,
  getBakeryProductAnalytics,
  hasBakeryOrders,
} from "@/lib/bookings/bakery-analytics";

export async function GET(request: Request) {
  try {
    const { businessId } = await requireAuth();

    // Ambil parameter startDate & endDate dari query, default ke hari ini jika tidak ada
    const url = new URL(request.url);
    const startDateParam = url.searchParams.get("startDate");
    const endDateParam = url.searchParams.get("endDate");

    let startDate: Date;
    let endDate: Date;
    if (startDateParam && endDateParam) {
      startDate = new Date(startDateParam);
      endDate = new Date(endDateParam);
    } else {
      const today = new Date();
      startDate = new Date(today);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(today);
      endDate.setHours(23, 59, 59, 999);
    }

    const useBakery = await hasBakeryOrders(businessId);

    // =========================
    // LOW STOCK INGREDIENTS
    // =========================
    const ingredients = await prisma.ingredient.findMany({
      where: { businessId },
      include: {
        inventoryBatches: {
          where: { remainingQty: { gt: 0 } },
          select: { remainingQty: true },
        },
      },
    });

    const lowStockIngredients = ingredients
      .map((ingredient) => {
        const currentStock = ingredient.inventoryBatches.reduce((sum, batch) => sum + Number(batch.remainingQty), 0);

        return {
          id: ingredient.id,
          name: ingredient.name,
          currentStock,
          minStock: ingredient.minStock,
        };
      })
      .filter((item) => item.currentStock <= item.minStock);

    if (useBakery) {
      const paidOrderCountRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM bakery_orders
        WHERE business_id = ${businessId}
          AND payment_status = 'Paid'
          AND created_at BETWEEN ${startDate} AND ${endDate}
      `;
      const [daily, products, categories] = await Promise.all([
        getBakeryDailyAnalytics(businessId, startDate, endDate),
        getBakeryProductAnalytics(businessId, startDate, endDate),
        getBakeryCategoryAnalytics(businessId, startDate, endDate),
      ]);

      return NextResponse.json({
        success: true,
        data: {
          totalRevenue: daily.totals.revenue,
          totalProfit: daily.totals.profit,
          avgMargin:
            daily.totals.revenue > 0
              ? Math.round((daily.totals.profit / daily.totals.revenue) * 10000) / 100
              : 0,
          transactionCount: Number(paidOrderCountRows[0]?.count ?? 0),
          topProducts: products.slice(0, 5).map((product) => ({
            product: { id: product.productId, name: product.productName },
            quantitySold: product.quantitySold,
          })),
          topCategories: categories.categories.slice(0, 5),
          lowStockIngredients,
        },
        paymentBreakdown: [],
      });
    }

    const sales = await prisma.sale.findMany({
      where: {
        businessId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    const totalRevenue = sales.reduce((sum, s) => sum + Number(s.totalRevenue), 0);
    const totalCost = sales.reduce((sum, s) => sum + Number(s.totalCost), 0);
    const totalProfit = totalRevenue - totalCost;
    const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const transactionCount = sales.length;

    const topProductsRaw = await prisma.saleItem.groupBy({
      by: ["productId"],
      where: {
        sale: {
          businessId,
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
      },
      _sum: {
        quantity: true,
      },
      orderBy: {
        _sum: {
          quantity: "desc",
        },
      },
      take: 5,
    });

    const topProducts = await Promise.all(
      topProductsRaw.map(async (item) => {
        const product = await prisma.product.findUnique({
          where: { id: item.productId },
          select: { id: true, name: true },
        });

        return {
          product,
          quantitySold: item._sum.quantity ?? 0,
        };
      }),
    );

    const paymentGrouped = await prisma.sale.groupBy({
      by: ["paymentMethod"],
      where: {
        businessId,
        createdAt: { gte: startDate, lte: endDate },
      },
      _count: { id: true },
      _sum: { totalRevenue: true },
    });

    const paymentBreakdown = paymentGrouped.map((g) => ({
      method: g.paymentMethod,
      count: g._count.id,
      revenue: Number(g._sum.totalRevenue ?? 0),
    }));

    return NextResponse.json({
      success: true,
      data: {
        totalRevenue,
        totalProfit,
        avgMargin: Math.round(avgMargin * 100) / 100,
        transactionCount,
        topProducts,
        lowStockIngredients,
      },
      paymentBreakdown,
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Analytics dashboard error:", error);
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 });
  }
}
