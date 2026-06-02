import prisma from './lib/prisma';

async function main() {
  const businessId = 36;
  const deliveryDate = '2026-06-02';

  const cap = await prisma.$queryRaw`
    SELECT *
    FROM production_capacity
    WHERE business_id = ${businessId}
      AND date = ${deliveryDate}::date
  `;
  console.log('Production Capacity:', cap);

  await prisma.$disconnect();
}

main().catch(console.error);
