-- Check business 11 info
SELECT b.id, b.name FROM "Business" b WHERE b.id = 11;

-- Check sales count and date range
SELECT 
  COUNT(*) as total_sales,
  MIN("createdAt") as first_sale,
  MAX("createdAt") as last_sale
FROM "Sale" WHERE "businessId" = 11;

-- Check products with sales in last 30 days
SELECT 
  si."productId",
  p.name as product_name,
  COUNT(DISTINCT DATE(s."createdAt")) as days_with_sales,
  SUM(si.quantity) as total_qty
FROM "SaleItem" si
JOIN "Sale" s ON s.id = si."saleId"
JOIN "Product" p ON p.id = si."productId"
WHERE s."businessId" = 11
  AND s."createdAt" >= NOW() - INTERVAL '30 days'
GROUP BY si."productId", p.name
ORDER BY days_with_sales DESC;
