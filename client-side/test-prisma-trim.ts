import { PrismaClient, Prisma } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  try {
    const businessId = 13;
    const safeOrderIds = ["test1", "test2"];
    const result = await prisma.$queryRaw`
      SELECT external_id
      FROM bakery_orders
      WHERE business_id = ${businessId}
        AND external_id IN (${Prisma.join(safeOrderIds)})
    `;
    console.log("Success:", result);
  } catch (e: any) {
    console.log("Error:", e.name, e.message);
  } finally {
    await prisma.$disconnect();
  }
}
main();
