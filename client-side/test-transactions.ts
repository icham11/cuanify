import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const orders = await prisma.$queryRaw`
    SELECT external_id, payment_transactions 
    FROM bakery_orders 
    WHERE payment_transactions::text LIKE '%2026-06-01%' OR payment_transactions::text LIKE '%2026-05-31%';
  `;
  console.log(JSON.stringify(orders, null, 2));
}

run().catch(console.error).finally(() => prisma.$disconnect());
