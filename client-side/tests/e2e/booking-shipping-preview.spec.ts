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
const TEST_AREA = "Penjaringan / Jakarta Utara";
const TEST_POSTAL_CODE = "14470";
const TEST_ADDRESS =
  "Jalan Pluit Indah No 8, Penjaringan, Jakarta Utara 14470";
const TEST_CUSTOMER_NAME = "QA Preview Shipping";
const TEST_PHONE = "081234567890";

type MockQuoteDefinition = {
  provider: "GOJEK" | "GRAB" | "PAXEL" | "JNE" | "JNT";
  courierCode: string;
  courierServiceCode: string;
  courierServiceName: string;
  price: number;
  eta: string;
};

type ShippingMethodCase = {
  method: string;
  expectedQuote: MockQuoteDefinition;
  visibleQuoteLabel: RegExp;
};

const mockQuoteDefinitions: MockQuoteDefinition[] = [
  {
    provider: "GOJEK",
    courierCode: "gosend",
    courierServiceCode: "instant-bike",
    courierServiceName: "GoSend Instant",
    price: 27000,
    eta: "30-45 min",
  },
  {
    provider: "GOJEK",
    courierCode: "gocar",
    courierServiceCode: "car-suv",
    courierServiceName: "GoCar SUV",
    price: 35000,
    eta: "45-60 min",
  },
  {
    provider: "GRAB",
    courierCode: "grabcar",
    courierServiceCode: "car-express",
    courierServiceName: "GrabCar Express",
    price: 33000,
    eta: "35-50 min",
  },
  {
    provider: "PAXEL",
    courierCode: "paxel",
    courierServiceCode: "same-day",
    courierServiceName: "Paxel Sameday",
    price: 28000,
    eta: "8-10 jam",
  },
  {
    provider: "JNE",
    courierCode: "jne",
    courierServiceCode: "reg",
    courierServiceName: "Reguler",
    price: 20000,
    eta: "1-2 days",
  },
  {
    provider: "JNT",
    courierCode: "jnt",
    courierServiceCode: "ez",
    courierServiceName: "EZ",
    price: 20000,
    eta: "2-3 days",
  },
  {
    provider: "JNE",
    courierCode: "jne",
    courierServiceCode: "yes",
    courierServiceName: "Yakin Esok Sampai (YES)",
    price: 36000,
    eta: "1-1 days",
  },
];

const shippingMethodCases: ShippingMethodCase[] = [
  {
    method: "ASSISTED_GOSEND",
    expectedQuote: mockQuoteDefinitions[0],
    visibleQuoteLabel: /GOJEK - GoSend Instant/i,
  },
  {
    method: "ASSISTED_GOCAR",
    expectedQuote: mockQuoteDefinitions[1],
    visibleQuoteLabel: /GOJEK - GoCar SUV/i,
  },
  {
    method: "ASSISTED_GRAB",
    expectedQuote: mockQuoteDefinitions[2],
    visibleQuoteLabel: /GRAB - GrabCar Express/i,
  },
  {
    method: "ASSISTED_PAXEL",
    expectedQuote: mockQuoteDefinitions[3],
    visibleQuoteLabel: /PAXEL - Paxel Sameday/i,
  },
  {
    method: "ASSISTED_SAME_DAY",
    expectedQuote: mockQuoteDefinitions[3],
    visibleQuoteLabel: /PAXEL - Paxel Sameday/i,
  },
  {
    method: "REGULAR_JNE_JNT",
    expectedQuote: mockQuoteDefinitions[6],
    visibleQuoteLabel: /JNE - Yakin Esok Sampai \(YES\)/i,
  },
];

function formatCurrency(value: number): string {
  return `Rp ${value.toLocaleString("id-ID")}`;
}

function buildMockQuote(
  definition: MockQuoteDefinition,
  idPrefix: "input" | "preview",
) {
  return {
    id: `${idPrefix}-${definition.provider.toLowerCase()}-${definition.courierCode}-${definition.courierServiceCode}`,
    provider: definition.provider,
    courierCode: definition.courierCode,
    courierServiceCode: definition.courierServiceCode,
    courierServiceName: definition.courierServiceName,
    price: definition.price,
    priceWithoutInsurance: definition.price,
    eta: definition.eta,
    distanceKm: 3.92,
    source: "biteship" as const,
  };
}

function expectedPreviewQuoteId(definition: MockQuoteDefinition): string {
  return `preview-${definition.provider.toLowerCase()}-${definition.courierCode}-${definition.courierServiceCode}`;
}

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
    const businessResult = await client.query<{
      id: number;
    }>(`
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
    const userResult = await client.query<{
      id: number;
    }>(
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
      throw new Error("Gagal membuat user E2E booking preview.");
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
  const response = await page.context().request.post("/api/auth/login", {
    data: {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    },
  });

  if (!response.ok()) {
    throw new Error(await response.text());
  }
}

async function fillBaseBookingForm(page: Page) {
  await page.goto("/bakery/bookings/new", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/bakery\/bookings\/new$/);

  await page.locator('input[name="customerName"]').fill(TEST_CUSTOMER_NAME);
  await page.locator('input[name="phoneNumber"]').fill(TEST_PHONE);
  await page.locator('input[name="deliveryDate"]').fill(TEST_DELIVERY_DATE);
  await page.locator('select[name="sales_channel"]').selectOption("direct");
  await page
    .locator('input[name="deliveryAddresses.0.area"]')
    .fill(TEST_AREA);
  await page
    .locator('input[name="deliveryAddresses.0.postalCode"]')
    .fill(TEST_POSTAL_CODE);
  await page
    .locator('textarea[name="deliveryAddresses.0.addressLine"]')
    .fill(TEST_ADDRESS);

  const deliverySlotSelect = page.locator('select[name="deliverySlot"]');
  await expect(deliverySlotSelect.locator("option")).toHaveCount(25);
  await deliverySlotSelect.selectOption({ label: "10:00 - AVAILABLE" });
  await page.locator('input[name="manualDpAmount"]').fill("50000");
}

async function setupNetworkMocks(
  page: Page,
  expectedQuote: MockQuoteDefinition,
) {
  let shippingQuoteRequestCount = 0;
  let capturedOrderPayload:
    | Array<{
        deliveryMethod?: string;
        deliveryFee?: number;
        shippingQuote?: {
          id?: string;
          provider?: string;
          courierCode?: string;
          courierServiceCode?: string;
          courierServiceName?: string;
          price?: number;
        } | null;
      }>
    | null = null;

  await page.route("**/api/bookings/shipping/quote", async (route) => {
    shippingQuoteRequestCount += 1;
    const idPrefix = shippingQuoteRequestCount === 1 ? "input" : "preview";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        quotes: mockQuoteDefinitions.map((definition) =>
          buildMockQuote(definition, idPrefix),
        ),
        distanceKm: 3.92,
        distanceSource: "input_coordinate",
        destinationPostalCode: TEST_POSTAL_CODE,
      }),
    });
  });

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
      const body = route.request().postDataJSON() as {
        orders?: Array<{
          deliveryMethod?: string;
          deliveryFee?: number;
          shippingQuote?: {
            id?: string;
            provider?: string;
            courierCode?: string;
            courierServiceCode?: string;
            courierServiceName?: string;
            price?: number;
          } | null;
        }>;
      };
      capturedOrderPayload = Array.isArray(body.orders) ? body.orders : [];

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            mode: "test",
            itemCount: capturedOrderPayload.length,
            waNotificationMode: "skipped",
            warnings: [],
          },
        }),
      });
      return;
    }

    await route.continue();
  });

  return {
    getShippingQuoteRequestCount: () => shippingQuoteRequestCount,
    getCapturedOrderPayload: () => capturedOrderPayload,
    expectedPreviewQuoteId: expectedPreviewQuoteId(expectedQuote),
  };
}

test.describe("Booking shipping preview persistence", () => {
  test.setTimeout(90_000);

  test.beforeAll(async () => {
    await ensureBookingTestUser();
  });

  for (const scenario of shippingMethodCases) {
    test(`keeps selected live shipping on preview for ${scenario.method}`, async ({
      page,
    }) => {
      const network = await setupNetworkMocks(page, scenario.expectedQuote);

      await loginToDashboard(page);
      await fillBaseBookingForm(page);

      await page
        .locator('select[name="deliveryMethod"]')
        .selectOption(scenario.method);
      await page.getByRole("button", { name: "Cek Ongkir" }).click();

      const quoteButton = page.getByRole("button", {
        name: scenario.visibleQuoteLabel,
      });
      await expect(quoteButton).toBeVisible();
      await quoteButton.click();

      await page.getByRole("button", { name: "Preview Booking" }).click();
      await expect(page.getByText("Preview Booking")).toBeVisible({
        timeout: 30_000,
      });

      await expect(page.getByText(formatCurrency(scenario.expectedQuote.price))).toBeVisible();
      await expect
        .poll(() => network.getShippingQuoteRequestCount(), {
          timeout: 10_000,
          message: "Preview page harus memicu fetch ongkir kedua.",
        })
        .toBeGreaterThanOrEqual(2);

      await page.getByRole("button", { name: /Create Booking/i }).click();
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

      await expect
        .poll(() => network.getCapturedOrderPayload(), {
          timeout: 15_000,
          message: "Payload booking belum terkirim ke endpoint orders.",
        })
        .not.toBeNull();

      const submittedOrder = network.getCapturedOrderPayload()?.[0];
      expect(submittedOrder).toBeTruthy();
      expect(submittedOrder?.deliveryMethod).toBe(scenario.method);
      expect(Number(submittedOrder?.deliveryFee || 0)).toBe(
        scenario.expectedQuote.price,
      );
      expect(submittedOrder?.shippingQuote?.provider).toBe(
        scenario.expectedQuote.provider,
      );
      expect(submittedOrder?.shippingQuote?.courierCode).toBe(
        scenario.expectedQuote.courierCode,
      );
      expect(submittedOrder?.shippingQuote?.courierServiceCode).toBe(
        scenario.expectedQuote.courierServiceCode,
      );
      expect(submittedOrder?.shippingQuote?.courierServiceName).toBe(
        scenario.expectedQuote.courierServiceName,
      );
      expect(Number(submittedOrder?.shippingQuote?.price || 0)).toBe(
        scenario.expectedQuote.price,
      );
      expect(submittedOrder?.shippingQuote?.id).toBe(
        network.expectedPreviewQuoteId,
      );
    });
  }
});
