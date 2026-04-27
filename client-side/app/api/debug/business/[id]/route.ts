import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * GET /api/debug/business/[id]
 * Debug endpoint to check business data
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const businessId = parseInt(id, 10);

  try {
    // Business info
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, name: true },
    });

    // Sales count
    const totalSales = await prisma.sale.count({
      where: { businessId },
    });

    // Sales in last 30 days
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const recentSales = await prisma.sale.count({
      where: { businessId, createdAt: { gte: since } },
    });

    // Products with sales data in last 30 days
    type ProductSalesRow = {
      productId: number;
      product_name: string;
      days_with_sales: bigint;
      total_qty: number;
    };

    const productSales = await prisma.$queryRaw<ProductSalesRow[]>`
      SELECT 
        si."productId"::int as "productId",
        p.name as product_name,
        COUNT(DISTINCT DATE(s."createdAt"))::int as days_with_sales,
        SUM(si.quantity)::int as total_qty
      FROM "SaleItem" si
      JOIN "Sale" s ON s.id = si."saleId"
      JOIN "Product" p ON p.id = si."productId"
      WHERE s."businessId" = ${businessId}
        AND s."createdAt" >= ${since}
      GROUP BY si."productId", p.name
      ORDER BY days_with_sales DESC
    `;

    // Active products with prices
    const products = await prisma.product.findMany({
      where: { businessId, deletedAt: null, isActive: true },
      select: { id: true, name: true, sellingPrice: true, cogs: true },
    });

    return NextResponse.json({
      business,
      totalSales,
      recentSales,
      productSales: productSales.map((p) => ({
        ...p,
        days_with_sales: Number(p.days_with_sales),
      })),
      activeProducts: products.map((p) => ({
        ...p,
        sellingPrice: Number(p.sellingPrice),
        cogs: Number(p.cogs),
      })),
    });
  } catch (error) {
    console.error("Debug error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
