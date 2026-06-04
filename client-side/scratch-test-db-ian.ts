import prisma from "./lib/prisma"

async function main() {
  const orders = await prisma.bakery_orders.findMany({
    where: {
      customer_name: {
        contains: 'ian',
        mode: 'insensitive'
      }
    },
    take: 5
  })
  
  orders.forEach(o => {
    console.log(`=== Order ID: ${o.id}, Customer: ${o.customer_name} ===`)
    const parsedData = o.whatsapp_parsed_data as any;
    if (parsedData && parsedData.rawText) {
      console.log("=== RAW TEXT ===");
      console.log(parsedData.rawText);
    } else {
      console.log("No rawText found in whatsapp_parsed_data");
    }
  });
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect()
  })
