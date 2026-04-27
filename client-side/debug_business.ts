// Quick debug script to check business 11 data
// Run with: npx tsx debug_business.js
import prisma from './lib/prisma';

async function main() {
  // Business info
  const business = await prisma.business.findUnique({
    where: { id: 11 },
    select: { id: true, name: true }
  });
  console.log('Business:', business);

  // Sales count
  const salesCount = await prisma.sale.count({
    where: { businessId: 11 }
  });
  console.log('Total sales:', salesCount);

  // Sales in last 30 days
  const since = new Date();
  since.setDate(since.getDate() - 30);
  
  const recentSales = await prisma.sale.count({
    where: { businessId: 11, createdAt: { gte: since } }
  });
  console.log('Sales in last 30 days:', recentSales);

  // Products with sales data
  const productSales = await prisma.$queryRaw`
    SELECT 
      si."productId",
      p.name as product_name,
      COUNT(DISTINCT DATE(s."createdAt")) as days_with_sales,
      SUM(si.quantity)::int as total_qty
    FROM "SaleItem" si
    JOIN "Sale" s ON s.id = si."saleId"
    JOIN "Product" p ON p.id = si."productId"
    WHERE s."businessId" = 11
      AND s."createdAt" >= NOW() - INTERVAL '30 days'
    GROUP BY si."productId", p.name
    ORDER BY days_with_sales DESC
  `;
  console.log('Products with sales in last 30 days:');
  console.table(productSales);

  // Check product prices
  const products = await prisma.product.findMany({
    where: { businessId: 11, deletedAt: null, isActive: true },
    select: { id: true, name: true, sellingPrice: true, cogs: true }
  });
  console.log('Active products:');
  console.table(products.map(p => ({
    ...p,
    sellingPrice: Number(p.sellingPrice),
    cogs: Number(p.cogs)
  })));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
