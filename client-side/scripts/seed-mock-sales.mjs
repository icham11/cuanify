import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: false });
dotenv.config({ path: ".env", override: false });


const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DIRECT_URL or DATABASE_URL must be set to seed mock sales");
}

const sslOptions = {
  rejectUnauthorized: false,
};

const pool = new Pool({
  connectionString,
  ssl: sslOptions,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const MOCK_EMAIL = "kuciyang@mail.co";
const MOCK_PASSWORD = "kucing123";
const MOCK_BUSINESS_NAME = "Kucing Coffee";
const TRANSACTION_PREFIX = "MOCK";

const PRODUCT_DEFS = [
  { name: "Es Kopi Susu", price: 18000, costPct: 0.4 },
  { name: "Americano", price: 15000, costPct: 0.35 },
  { name: "Matcha Latte", price: 22000, costPct: 0.45 },
  { name: "Roti Bakar", price: 12000, costPct: 0.3 },
  { name: "Croissant", price: 16000, costPct: 0.4 },
];

const PAYMENT_METHODS = ["Cash", "QRIS", "Transfer", "Digital"];

function deterministicNumber(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function randomBetween(seed, min, max) {
  const range = max - min + 1;
  const value = deterministicNumber(seed) % range;
  return min + value;
}

function formatDateId(date, index) {
  const day = date.toISOString().slice(0, 10).replace(/-/g, "");
  return `${TRANSACTION_PREFIX}-${day}-${String(index).padStart(3, "0")}`;
}

async function upsertUser() {
  const existing = await prisma.user.findUnique({
    where: { email: MOCK_EMAIL },
  });

  if (existing) {
    return existing;
  }

  const hashedPassword = await bcrypt.hash(MOCK_PASSWORD, 10);
  return prisma.user.create({
    data: {
      name: "Kucing",
      email: MOCK_EMAIL,
      password: hashedPassword,
    },
  });
}

async function upsertBusiness(userId) {
  const existing = await prisma.business.findFirst({
    where: { userId },
  });

  if (existing) {
    return existing;
  }

  return prisma.business.create({
    data: {
      name: MOCK_BUSINESS_NAME,
      location: "Jakarta",
      userId,
    },
  });
}

async function upsertProducts(businessId) {
  let category = await prisma.category.findFirst({
    where: {
      businessId,
      name: "Minuman",
    },
  });

  if (!category) {
    category = await prisma.category.create({
      data: {
        businessId,
        name: "Minuman",
      },
    });
  }

  const products = [];
  for (const def of PRODUCT_DEFS) {
    let product = await prisma.product.findFirst({
      where: {
        businessId,
        name: def.name,
      },
    });

    if (!product) {
      product = await prisma.product.create({
        data: {
          businessId,
          categoryId: category.id,
          name: def.name,
          sellingPrice: def.price,
          isActive: true,
        },
      });
    } else {
      product = await prisma.product.update({
        where: { id: product.id },
        data: {
          sellingPrice: def.price,
          categoryId: category.id,
          isActive: true,
        },
      });
    }

    products.push({
      ...def,
      id: product.id,
    });
  }

  return products;
}

async function clearMockSales(businessId, startDate) {
  await prisma.sale.deleteMany({
    where: {
      businessId,
      transactionNumber: { startsWith: TRANSACTION_PREFIX },
      createdAt: { gte: startDate },
    },
  });
}

async function createSales(business, products) {
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(now.getDate() - 29);
  startDate.setHours(0, 0, 0, 0);

  await clearMockSales(business.id, startDate);

  for (let dayOffset = 0; dayOffset < 30; dayOffset += 1) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + dayOffset);

    const dailySalesCount = randomBetween(`${date.toISOString()}-count`, 1, 3);

    for (let i = 0; i < dailySalesCount; i += 1) {
      const itemCount = randomBetween(`${date.toISOString()}-items-${i}`, 1, 3);
      const saleItems = [];

      for (let j = 0; j < itemCount; j += 1) {
        const productIndex = randomBetween(`${date.toISOString()}-product-${i}-${j}`, 0, products.length - 1);
        const product = products[productIndex];
        const quantity = randomBetween(`${date.toISOString()}-qty-${i}-${j}`, 1, 4);
        const costPerUnit = Math.round(product.price * product.costPct);

        saleItems.push({
          productId: product.id,
          quantity,
          priceAtSale: product.price,
          costAtSale: costPerUnit,
        });
      }

      const totalRevenue = saleItems.reduce(
        (sum, item) => sum + item.priceAtSale * item.quantity,
        0,
      );
      const totalCost = saleItems.reduce(
        (sum, item) => sum + item.costAtSale * item.quantity,
        0,
      );

      const transactionNumber = formatDateId(date, i + 1);
      const paymentMethod = PAYMENT_METHODS[i % PAYMENT_METHODS.length];

      const sale = await prisma.sale.create({
        data: {
          businessId: business.id,
          transactionNumber,
          totalRevenue,
          totalCost,
          paymentMethod,
          paymentStatus: "Paid",
          createdAt: date,
          updatedAt: date,
          saleItems: {
            create: saleItems,
          },
        },
      });

      await prisma.sale.update({
        where: { id: sale.id },
        data: { updatedAt: date },
      });
    }
  }
}

async function main() {
  const user = await upsertUser();
  const business = await upsertBusiness(user.id);
  const products = await upsertProducts(business.id);

  await createSales(business, products);

  console.log("Mock sales data created for", MOCK_EMAIL);
  console.log("Login credentials:", {
    email: MOCK_EMAIL,
    password: MOCK_PASSWORD,
  });
}

main()
  .catch((error) => {
    console.error("Seed error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });