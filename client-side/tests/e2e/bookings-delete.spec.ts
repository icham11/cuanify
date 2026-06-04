import path from "path";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import { expect, test, type Page } from "@playwright/test";
import ws from "ws";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

neonConfig.webSocketConstructor = ws;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: databaseUrl }),
});

const PASSWORD = "QaDeleteBooking123!";

type SeedContext = {
  businessId: number;
  userId: number;
  userEmail: string;
  orderId: string;
  customerName: string;
  snapshotId: number | null;
};

function isoDate(daysFromToday: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

async function seedDeleteOrder(): Promise<SeedContext> {
  const runId = Date.now();
  const userEmail = `qa.booking-delete.${runId}@crumbella.local`;
  const hashedPassword = await bcrypt.hash(PASSWORD, 10);
  const deliveryDate = isoDate(5);
  const orderId = `qa-delete-${runId}`;
  const customerName = `QA Delete Customer ${runId}`;

  const user = await prisma.user.create({
    data: {
      name: `QA Delete ${runId}`,
      email: userEmail,
      password: hashedPassword,
    },
  });

  const business = await prisma.business.create({
    data: {
      name: `QA Delete ${runId}`,
      location: "Jakarta",
      userId: user.id,
    },
  });

  await prisma.bakery_orders.create({
    data: {
      business_id: business.id,
      external_id: orderId,
      booking_code: `DEL-${runId}`,
      customer_name: customerName,
      customer_phone: "081234567890",
      customer_address: "Jl. Delete Test No. 1",
      delivery_date: new Date(`${deliveryDate}T00:00:00.000Z`),
      delivery_slot: "10:00",
      notes: "delete test",
      base_price: 100000,
      design_adjustment_total: 0,
      add_on_total: 0,
      product_adjustment: 0,
      non_product_adjustment: 0,
      product_subtotal: 100000,
      product_discount_amount: 0,
      service_charge: 0,
      delivery_fee: 0,
      manual_adjustment: 0,
      dp_paid_amount: 0,
      final_paid_amount: 100000,
      total_paid_amount: 100000,
      down_payment_amount: 0,
      remaining_balance: 0,
      product: "1 item(s)",
      total_price: 100000,
      payment_status: "Paid",
      order_status: "In Production",
      sales_channel: "direct",
      insurance_fee: 0,
      status_history: [],
      automation_logs: [],
      payment_transactions: [],
    },
  });

  await prisma.bakery_order_items.create({
    data: {
      business_id: business.id,
      order_external_id: orderId,
      item_index: 0,
      payload: {
        id: `item-${orderId}`,
        category: "Cake",
        subcategory: "Custom",
        productName: "QA Delete Cake",
        size: "D14",
        quantity: 1,
        basePrice: 100000,
        lineTotal: 100000,
        addOns: [],
        addOnTotal: 0,
      },
    },
  });

  await prisma.bakery_order_addresses.create({
    data: {
      business_id: business.id,
      order_external_id: orderId,
      address_index: 0,
      payload: {
        id: `addr-${orderId}`,
        label: "Primary",
        area: "Jakarta",
        addressLine: "Jl. Delete Test No. 1",
      },
    },
  });

  const snapshot = await prisma.businessDocument.create({
    data: {
      businessId: business.id,
      content: JSON.stringify([
        {
          id: orderId,
          bookingCode: `DEL-${runId}`,
          customerName,
          deliveryDate,
          deliverySlot: "10:00",
          orderStatus: "In Production",
          paymentStatus: "Paid",
        },
      ]),
      sourceType: "bakery_orders_snapshot",
      metadata: {
        itemCount: 1,
        updatedAt: new Date().toISOString(),
        source: "rows",
      },
    },
  });

  return {
    businessId: business.id,
    userId: user.id,
    userEmail,
    orderId,
    customerName,
    snapshotId: snapshot.id,
  };
}

async function cleanupSeededData(seed: SeedContext | null) {
  if (!seed) return;

  await prisma.bakery_order_addresses.deleteMany({
    where: { business_id: seed.businessId },
  });
  await prisma.bakery_order_items.deleteMany({
    where: { business_id: seed.businessId },
  });
  await prisma.bakery_orders.deleteMany({
    where: { business_id: seed.businessId },
  });
  await prisma.businessDocument.deleteMany({
    where: { businessId: seed.businessId, sourceType: "bakery_orders_snapshot" },
  });
  await prisma.businessMember.deleteMany({
    where: { businessId: seed.businessId },
  });
  await prisma.business.deleteMany({
    where: { id: seed.businessId },
  });
  await prisma.user.deleteMany({
    where: { id: seed.userId },
  });
}

async function loginToDashboard(page: Page, email: string) {
  const response = await page.context().request.post("/api/auth/login", {
    data: {
      email,
      password: PASSWORD,
    },
    failOnStatusCode: false,
  });

  if (!response.ok()) {
    throw new Error(`Login failed: ${response.status()} ${await response.text()}`);
  }
}

async function waitForDeleteOrderVisible(page: Page, customerName: string) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 120_000) {
    const response = await page.context().request.get(
      "/api/bookings/orders?page=1&limit=10&view=all",
      {
        failOnStatusCode: false,
        timeout: 60_000,
      },
    );

    if (response.ok()) {
      const payload = (await response.json().catch(() => null)) as
        | {
            data?: {
              orders?: Array<{ customerName?: string }>;
            };
          }
        | null;
      const orders = payload?.data?.orders ?? [];
      if (orders.some((order) => order.customerName === customerName)) {
        return;
      }
    }

    await page.waitForTimeout(1000);
  }

  throw new Error("Delete test order did not appear in time.");
}

test.describe.serial("Bookings delete", () => {
  let seed: SeedContext | null = null;

  test.beforeAll(async () => {
    seed = await seedDeleteOrder();
  });

  test.afterAll(async () => {
    await cleanupSeededData(seed);
    await prisma.$disconnect();
  });

  test("deletes booking from UI and removes it from database and snapshot", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    if (!seed) {
      throw new Error("Seed data was not created.");
    }

    await loginToDashboard(page, seed.userEmail);
    await waitForDeleteOrderVisible(page, seed.customerName);
    await page.goto(`/bakery/bookings?query=${encodeURIComponent(seed.orderId)}`, {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByTestId(`delete-booking-${seed.orderId}`)).toBeVisible({
      timeout: 60000,
    });

    await page.getByTestId(`delete-booking-${seed.orderId}`).click();

    await expect(page.getByText("Hapus Booking?")).toBeVisible();
    await page.getByTestId("confirm-delete-booking").click();
    await expect(page.getByText("Hapus Booking?")).toHaveCount(0, {
      timeout: 30000,
    });

    await expect(page.getByTestId(`delete-booking-${seed.orderId}`)).toHaveCount(0, {
      timeout: 30000,
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId(`delete-booking-${seed.orderId}`)).toHaveCount(0, {
      timeout: 30000,
    });

    const [orderCount, itemCount, addressCount, snapshot] = await Promise.all([
      prisma.bakery_orders.count({
        where: { business_id: seed.businessId, external_id: seed.orderId },
      }),
      prisma.bakery_order_items.count({
        where: { business_id: seed.businessId, order_external_id: seed.orderId },
      }),
      prisma.bakery_order_addresses.count({
        where: { business_id: seed.businessId, order_external_id: seed.orderId },
      }),
      prisma.businessDocument.findUnique({
        where: { id: seed.snapshotId ?? -1 },
        select: { content: true },
      }),
    ]);

    expect(orderCount).toBe(0);
    expect(itemCount).toBe(0);
    expect(addressCount).toBe(0);
    expect(snapshot?.content ?? "").not.toContain(seed.orderId);
  });
});
