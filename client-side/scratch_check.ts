import prisma from './lib/prisma';

async function main() {
  const businessId = 36;
  const deliveryDate = '2026-06-02';

  console.log(`Checking orders for business_id=${businessId} and delivery_date=${deliveryDate}...`);

  // Query raw to see everything for this date
  const orders = await prisma.$queryRaw`
    SELECT id, external_id, customer_name, delivery_date, order_status, deleted_at, sales_channel, token_used
    FROM bakery_orders
    WHERE business_id = ${businessId}
      AND deleted_at IS NULL
      AND (
        delivery_date::date = ${deliveryDate}::date
        OR
        delivery_date::text LIKE ${deliveryDate + '%'}
      )
  `;

  console.log('Orders found in DB (2026-06-02):', orders);

  // Also query to see if there are any orders with slightly different dates
  const nearbyOrders = await prisma.$queryRaw`
    SELECT id, external_id, customer_name, delivery_date, order_status, deleted_at, sales_channel
    FROM bakery_orders
    WHERE business_id = ${businessId}
      AND deleted_at IS NULL
      AND delivery_date >= '2026-06-01'::date
      AND delivery_date <= '2026-06-03'::date
      AND delivery_date::date != ${deliveryDate}::date
  `;
  console.log('Nearby Orders:', nearbyOrders);

  const countTokens = await prisma.$queryRaw`
    SELECT SUM(token_used) as total_tokens
    FROM bakery_orders
    WHERE business_id = ${businessId}
      AND deleted_at IS NULL
      AND delivery_date::date = ${deliveryDate}::date
  `;
  console.log('Total tokens for date:', countTokens);

  await prisma.$disconnect();
}

main().catch(console.error);
