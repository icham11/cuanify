import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import dotenv from "dotenv";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
dotenv.config({ path: ".env", override: false });

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const biz = await prisma.business.findUnique({ where: { id: 11 } });
  console.log("Business:", JSON.stringify(biz, null, 2));

  const products = await prisma.product.findMany({ where: { businessId: 11 } });
  console.log("\nProducts:", JSON.stringify(products, null, 2));

  const ingredients = await prisma.ingredient.findMany({ where: { businessId: 11 } });
  console.log("\nIngredients:", JSON.stringify(ingredients, null, 2));

  const recipes = await prisma.recipe.findMany({
    where: { product: { businessId: 11 } },
    include: { ingredient: true, product: true },
  });
  console.log("\nRecipes:", JSON.stringify(recipes, null, 2));

  const batches = await prisma.inventoryBatch.findMany({
    where: { ingredient: { businessId: 11 } },
    include: { ingredient: true },
  });
  console.log("\nInventory Batches:", JSON.stringify(batches, null, 2));

  const existingSales = await prisma.sale.count({ where: { businessId: 11 } });
  console.log("\nExisting sales count:", existingSales);

  const saleItems = await prisma.saleItem.count({ where: { sale: { businessId: 11 } } });
  console.log("SaleItems count:", saleItems);

  const docs = await prisma.stockDocument.count({ where: { businessId: 11 } });
  const docsByType = await prisma.stockDocument.groupBy({ by: ["type"], where: { businessId: 11 }, _count: true });
  console.log("StockDocuments:", docs, "by type:", JSON.stringify(docsByType));

  const moves = await prisma.inventoryMovement.count({ where: { stockDocument: { businessId: 11 } } });
  console.log("InventoryMovements:", moves);

  const batchCount = await prisma.inventoryBatch.count({ where: { ingredient: { businessId: 11 } } });
  console.log("InventoryBatches:", batchCount);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
