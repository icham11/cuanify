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
const PASSWORD = "QaStatusFilter123!";

type SeedContext = {
  businessId: number;
  userEmail: string;
  userId: number;
};

function formatIsoDate(daysFromToday: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

async function seedStatusFilterOrders(): Promise<SeedContext> {
  const runId = Date.now();
  const userEmail = `qa.booking-status.${runId}@crumbella.local`;
  const hashedPassword = await bcrypt.hash(PASSWORD, 10);

  const user = await prisma.user.create({
    data: {
      name: `QA Booking Status ${runId}`,
      email: userEmail,
      password: hashedPassword,
    },
  });

  const business = await prisma.business.create({
    data: {
      name: `QA Booking Status ${runId}`,
      location: "Jakarta",
      userId: user.id,
    },
  });

  const orders = [
    {
      external_id: `qa-inquiry-${runId}`,
      booking_code: `QA-INQ-${runId}`,
      customer_name: "QA Inquiry Null",
      delivery_date: formatIsoDate(3),
      order_status: null,
    },
    {
      external_id: `qa-production-${runId}`,
      booking_code: `QA-PROD-${runId}`,
      customer_name: "QA In Production",
      delivery_date: formatIsoDate(4),
      order_status: "In Production",
    },
    {
      external_id: `qa-ready-${runId}`,
      booking_code: `QA-READY-${runId}`,
      customer_name: "QA Ready",
      delivery_date: formatIsoDate(5),
      order_status: "Ready",
    },
    {
      external_id: `qa-delivery-${runId}`,
      booking_code: `QA-DEL-${runId}`,
      customer_name: "QA Delivery",
      delivery_date: formatIsoDate(6),
      order_status: "Delivery",
    },
    {
      external_id: `qa-delivered-${runId}`,
      booking_code: `QA-DELIV-${runId}`,
      customer_name: "QA Delivered",
      delivery_date: formatIsoDate(7),
      order_status: "Delivered",
    },
    {
      external_id: `qa-complete-${runId}`,
      booking_code: `QA-COMP-${runId}`,
      customer_name: "QA Complete Alias",
      delivery_date: formatIsoDate(8),
      order_status: "Complete",
    },
    {
      external_id: `qa-canceled-${runId}`,
      booking_code: `QA-CANC-${runId}`,
      customer_name: "QA Canceled Alias",
      delivery_date: formatIsoDate(9),
      order_status: "Canceled",
    },
  ];

  await prisma.bakery_orders.createMany({
    data: orders.map((order) => ({
      business_id: business.id,
      external_id: order.external_id,
      booking_code: order.booking_code,
      customer_name: order.customer_name,
      customer_phone: "081234567890",
      customer_address: "Jl. QA Testing No. 1",
      delivery_date: new Date(`${order.delivery_date}T00:00:00.000Z`),
      delivery_slot: "10:00",
      notes: "E2E booking status filter test",
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
      final_paid_amount: 0,
      total_paid_amount: 0,
      down_payment_amount: 0,
      remaining_balance: 100000,
      product: "1 item(s)",
      total_price: 100000,
      payment_status: "Pending",
      order_status: order.order_status,
      sales_channel: "direct",
      insurance_fee: 0,
      status_history: [],
      automation_logs: [],
      payment_transactions: [],
    })),
  });

  await prisma.bakery_order_items.createMany({
    data: orders.map((order, index) => ({
      business_id: business.id,
      order_external_id: order.external_id,
      item_index: index,
      payload: {
        id: `item-${order.external_id}`,
        category: "Cake",
        subcategory: "Custom",
        productName: "QA Test Cake",
        size: "D14",
        quantity: 1,
        basePrice: 100000,
        lineTotal: 100000,
        addOns: [],
        addOnTotal: 0,
      },
    })),
  });

  return {
    businessId: business.id,
    userEmail,
    userId: user.id,
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

  await page.goto("/api/auth/post-login", { waitUntil: "domcontentloaded" });
}

async function waitForBookingsApi(page: Page, expectedCustomerName: string) {
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

      if (orders.some((order) => order.customerName === expectedCustomerName)) {
        return;
      }
    }

    await page.waitForTimeout(1000);
  }

  throw new Error("Bookings API did not return the seeded orders in time.");
}

function getStatusSelect(page: Page) {
  return page.getByLabel("Filter status order");
}

async function applyStatusFilter(page: Page, status: string) {
  const waitForOrdersResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "GET" &&
      url.pathname.includes("/api/bookings/orders") &&
      url.searchParams.get("status") === status
    );
  });

  await getStatusSelect(page).selectOption(status);
  await waitForOrdersResponse;
}

test.describe.serial("Bookings status filter", () => {
  let seed: SeedContext | null = null;

  test.beforeAll(async () => {
    seed = await seedStatusFilterOrders();
  });

  test.afterAll(async () => {
    await cleanupSeededData(seed);
    await prisma.$disconnect();
  });

  test("filters each booking status correctly in the UI", async ({ page }) => {
    test.setTimeout(120_000);

    if (!seed) {
      throw new Error("Seed data was not created.");
    }

    await loginToDashboard(page, seed.userEmail);
    await waitForBookingsApi(page, "QA Inquiry Null");
    await page.goto("/bakery/bookings", { waitUntil: "domcontentloaded" });

    await expect(
      page.getByPlaceholder("Cari customer atau booking ID..."),
    ).toBeVisible({ timeout: 30000 });
    await expect(page.getByText("QA Inquiry Null")).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/^7 order$/)).toBeVisible({ timeout: 30000 });

    await expect(getStatusSelect(page).locator('option[value="Quoted"]')).toHaveCount(0);
    await expect(getStatusSelect(page).locator('option[value="DP Paid"]')).toHaveCount(1);
    await expect(getStatusSelect(page).locator('option[value="Confirmed"]')).toHaveCount(0);

    const cases = [
      {
        status: "In Production",
        visible: ["QA Inquiry Null", "QA In Production"],
        hidden: "QA Ready",
        count: 2,
      },
      {
        status: "Ready",
        visible: ["QA Ready"],
        hidden: "QA Delivery",
        count: 1,
      },
      {
        status: "Delivery",
        visible: ["QA Delivery"],
        hidden: "QA Delivered",
        count: 1,
      },
      {
        status: "Delivered",
        visible: ["QA Delivered"],
        hidden: "QA Delivery",
        count: 1,
      },
      {
        status: "Completed",
        visible: ["QA Complete Alias"],
        hidden: "QA Canceled Alias",
        count: 1,
      },
      {
        status: "Cancelled",
        visible: ["QA Canceled Alias"],
        hidden: "QA Complete Alias",
        count: 1,
      },
    ] as const;

    for (const filterCase of cases) {
      await applyStatusFilter(page, filterCase.status);
      for (const visibleOrder of filterCase.visible) {
        await expect(page.getByText(visibleOrder)).toBeVisible({
          timeout: 30000,
        });
      }
      await expect(page.getByText(filterCase.hidden)).toHaveCount(0);
      await expect(
        page.getByText(new RegExp(`^${filterCase.count} order$`)),
      ).toBeVisible();
    }
  });
});
