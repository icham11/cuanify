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
  console.dir(orders, { depth: null })
  
  if (orders.length > 0) {
    const orderItems = await prisma.bakery_order_items.findMany({
      where: {
        order_external_id: { in: orders.map(o => o.external_id) }
      }
    })
    console.dir(orderItems, { depth: null })
  }
}

main()
