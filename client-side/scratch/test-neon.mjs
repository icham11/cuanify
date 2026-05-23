import 'dotenv/config';
import { prisma } from '../lib/prisma.ts';

async function test() {
  try {
    console.log("Testing connection with Prisma...");
    const result = await prisma.$queryRaw`SELECT 1 as ok`;
    console.log("Success! Database returned:", result);
  } catch (error) {
    console.error("Database connection failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
