import "dotenv/config"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

async function main() {
  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) {
    throw new Error("DATABASE_URL is not configured.")
  }
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  })
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })
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
  } finally {
    await prisma.$disconnect()
    await pool.end()
  }
}
main()
