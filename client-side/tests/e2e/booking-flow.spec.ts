import path from "path";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const TEST_EMAIL =
  process.env.BOOKING_E2E_EMAIL || "qa-booking-preview@crumbella.local";
const TEST_PASSWORD =
  process.env.BOOKING_E2E_PASSWORD || "QaBooking123!";
const TEST_NAME = "QA Booking Preview";
const TEST_DELIVERY_DATE = "2099-12-31";
const TEST_CUSTOMER_NAME = "Budi Tester";
const TEST_PHONE = "081234567890";

const mockCatalogResponse = {
  success: true,
  data: {
    productVariantPriceOverrides: {},
    addOnPriceOverrides: {},
    addOnCogsOverrides: {},
    inactiveProducts: [],
    inactiveAddOns: [],
    customProducts: [
      {
        category: "Cake",
        subcategory: "One Tier Cake",
        productName: "Real Cake",
        variantLabel: "Diameter 16 cm x Tinggi 10 cm",
        price: 450000,
      },
    ],
    customAddOns: [],
  },
};

async function ensureBookingTestUser() {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL atau DIRECT_URL belum tersedia.");
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    const businessResult = await client.query<{ id: number }>(`
      SELECT b."id"
      FROM "Business" b
      JOIN "Product" p ON p."businessId" = b."id" AND p."deletedAt" IS NULL
      GROUP BY b."id"
      ORDER BY COUNT(p."id") DESC, b."id" DESC
      LIMIT 1
    `);

    const businessId = businessResult.rows[0]?.id;
    if (!businessId) {
      throw new Error("Tidak ada business dengan product aktif untuk test.");
    }

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    const userResult = await client.query<{ id: number }>(
      `
        INSERT INTO "User" ("name", "email", "password", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, NOW(), NOW())
        ON CONFLICT ("email")
        DO UPDATE SET
          "name" = EXCLUDED."name",
          "password" = EXCLUDED."password",
          "updatedAt" = NOW()
        RETURNING "id"
      `,
      [TEST_NAME, TEST_EMAIL, passwordHash],
    );

    const userId = userResult.rows[0]?.id;
    if (!userId) {
      throw new Error("Gagal membuat user E2E booking.");
    }

    await client.query(
      `
        INSERT INTO "BusinessMember" ("businessId", "userId", "role", "createdAt", "updatedAt")
        VALUES ($1, $2, 'Admin', NOW(), NOW())
        ON CONFLICT ("businessId", "userId")
        DO UPDATE SET
          "role" = 'Admin',
          "updatedAt" = NOW()
      `,
      [businessId, userId],
    );
  } finally {
    await client.end();
  }
}

async function loginToDashboard(page: Page) {
  let response;

  for (let i = 0; i < 3; i += 1) {
    response = await page.context().request.post("/api/auth/login", {
      data: {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      },
    });
    if (response.ok()) break;
    await page.waitForTimeout(2000);
  }

  if (response && !response.ok()) {
    throw new Error(`Login failed: ${response.status()} ${await response.text()}`);
  }
}

async function fillBaseBookingForm(page: Page) {
  await page.goto("/bakery/bookings/new", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/bakery\/bookings\/new$/);

  await page.locator('input[name="customerName"]').fill(TEST_CUSTOMER_NAME);
  await page.locator('input[name="phoneNumber"]').fill(TEST_PHONE);
  await page.locator('input[name="deliveryDate"]').fill(TEST_DELIVERY_DATE);
  await page.locator('select[name="sales_channel"]').selectOption("direct");
  await page.locator('select[name="deliveryMethod"]').selectOption("PICKUP");

  const deliverySlotSelect = page.locator('select[name="deliverySlot"]');
  await expect(deliverySlotSelect.locator("option")).toHaveCount(25);
  await deliverySlotSelect.selectOption({ label: "10:00 - AVAILABLE" });
  await page.locator('input[name="manualDpAmount"]').fill("50000");
}

test.describe("New Booking Flow - Comprehensive E2E", () => {
  test.setTimeout(90_000);

  test.beforeAll(async () => {
    await ensureBookingTestUser();
  });

  test.beforeEach(async ({ page }) => {
    await page.route("**/api/bookings/catalog-config", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockCatalogResponse),
      });
    });
  });

  test("berhasil membuat booking baru dan mengirim payload create", async ({
    page,
  }) => {
    let createPayload: { orders?: Array<Record<string, unknown>> } | null = null;

    await page.route("**/api/bookings/orders", async (route) => {
      const method = route.request().method();

      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: {
              orders: [],
              source: "snapshot-fallback",
            },
          }),
        });
        return;
      }

      if (method === "POST") {
        createPayload = route.request().postDataJSON() as {
          orders?: Array<Record<string, unknown>>;
        };
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: {
              mode: "test",
              itemCount: createPayload?.orders?.length ?? 0,
              waNotificationMode: "skipped",
              warnings: [],
            },
          }),
        });
        return;
      }

      await route.continue();
    });

    await loginToDashboard(page);
    await fillBaseBookingForm(page);

    await page.getByRole("button", { name: "Preview Booking" }).click();

    const createButton = page.getByRole("button", { name: /Create Booking/i });
    await createButton.waitFor({ state: "visible", timeout: 30_000 });
    await createButton.scrollIntoViewIfNeeded();
    await createButton.click({ force: true });
    const submitConfirmationDialog = page.getByRole("dialog", {
      name: "Konfirmasi submit booking",
    });
    const confirmationVisible = await submitConfirmationDialog
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);

    if (confirmationVisible) {
      await submitConfirmationDialog
        .getByRole("button", { name: "Ya, Sudah Dicek" })
        .click({ force: true });
      await submitConfirmationDialog.waitFor({ state: "hidden" });
    }

    const payloadDelivered = await expect
      .poll(() => createPayload, {
        timeout: 15_000,
      })
      .not.toBeNull()
      .then(() => true)
      .catch(() => false);

    if (!payloadDelivered) {
      const visibleFeedback = await page
        .locator('text=/Booking belum bisa dilanjutkan|Masih ada field wajib|Gagal menyimpan|Submit booking sebelumnya|Perubahan referensi|Template parse/i')
        .allTextContents();
      throw new Error(
        `Payload booking belum terkirim ke endpoint orders. Feedback: ${visibleFeedback.join(" | ") || "tidak ada feedback terlihat"}`,
      );
    }

    const submittedOrder = createPayload?.orders?.[0] ?? null;
    expect(submittedOrder).toBeTruthy();
    expect(submittedOrder?.customerName).toBe(TEST_CUSTOMER_NAME);
    expect(submittedOrder?.customerPhone).toBe(TEST_PHONE);
    expect(submittedOrder?.deliveryDate).toBe(TEST_DELIVERY_DATE);
    expect(submittedOrder?.deliverySlot).toBe("10:00");
  });
});
