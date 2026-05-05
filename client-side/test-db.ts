import { PrismaClient } from "@prisma/client"

async function main() {
  const dbUrl = process.env.DATABASE_URL?.replace("?sslmode=require", "")
  process.env.DATABASE_URL = dbUrl;
  const prisma = new PrismaClient({
    datasources: { db: { url: dbUrl } }
  })
  try {
    const users = await prisma.user.findMany({
      include: {
        memberships: {
          select: { role: true, businessId: true }
        }
      },
      take: 10
    })
    console.log("USERS:", JSON.stringify(users, null, 2))
  } catch(e) {
    console.error(e)
  }
}
main()
