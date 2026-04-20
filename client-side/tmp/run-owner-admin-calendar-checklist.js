/* eslint-disable no-console */
const { chromium } = require("playwright");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

require("dotenv").config({ path: ".env" });

const BASE_URL = "http://localhost:3000";

function createPrismaClient() {
  const rawUrl = process.env.DATABASE_URL || "";
  const cleanUrl = rawUrl.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");

  if (!cleanUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const pool = new Pool({
    connectionString: cleanUrl,
    ssl: { rejectUnauthorized: false },
  });

  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

function formatIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function seedTestAccounts() {
  const prisma = createPrismaClient();
  const runId = Date.now();
  const password = "QaTest!234";

  const ownerEmail = `qa.owner.${runId}@crumbella.local`;
  const adminEmail = `qa.admin.${runId}@crumbella.local`;
  const ownerName = `QA Owner ${runId}`;
  const adminName = `QA Admin ${runId}`;
  const businessName = `QA Bakery ${runId}`;

  const hashed = await bcrypt.hash(password, 10);

  try {
    const owner = await prisma.user.create({
      data: {
        name: ownerName,
        email: ownerEmail,
        password: hashed,
      },
    });

    const business = await prisma.business.create({
      data: {
        name: businessName,
        location: "Jakarta",
        userId: owner.id,
      },
    });

    const admin = await prisma.user.create({
      data: {
        name: adminName,
        email: adminEmail,
        password: hashed,
      },
    });

    await prisma.businessMember.create({
      data: {
        businessId: business.id,
        userId: admin.id,
        role: "Admin",
      },
    });

    return {
      runId,
      ownerEmail,
      adminEmail,
      password,
      businessId: business.id,
      ownerUserId: owner.id,
      adminUserId: admin.id,
      businessName,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function login(page, email, password, expectedRole) {
  const loginRes = await page.request.post("/api/auth/login", {
    data: { email, password },
    failOnStatusCode: false,
  });

  if (!loginRes.ok()) {
    const bodyText = await loginRes.text();
    throw new Error(`Login failed (${loginRes.status()}): ${bodyText}`);
  }

  await page.goto("/api/auth/post-login", { waitUntil: "domcontentloaded" });

  const startedAt = Date.now();
  while (Date.now() - startedAt < 30000) {
    const res = await page.request.get("/api/auth/me", {
      failOnStatusCode: false,
    });
    if (res.ok()) {
      const payload = await res.json();
      const actualRole = payload?.data?.role;
      if (!expectedRole || actualRole === expectedRole) {
        return payload?.data;
      }
    }
    await sleep(500);
  }

  throw new Error(`Failed to log in as ${expectedRole || email}.`);
}

async function logout(page) {
  await page.request.post("/api/auth/logout", { failOnStatusCode: false });
  await page.goto("/login", { waitUntil: "domcontentloaded" });
}

async function fetchOrders(page) {
  const res = await page.request.get("/api/bookings/orders", {
    failOnStatusCode: false,
  });
  if (!res.ok()) {
    throw new Error(`Failed fetching orders: HTTP ${res.status()}`);
  }
  const payload = await res.json();
  return Array.isArray(payload?.data?.orders) ? payload.data.orders : [];
}

async function waitForOrderByCustomer(page, customerName, timeoutMs = 45000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const orders = await fetchOrders(page);
    const found = orders.find((order) => order.customerName === customerName);
    if (found) return found;
    await sleep(800);
  }
  throw new Error(`Order for customer ${customerName} was not found.`);
}

async function waitForOrderDate(page, orderId, expectedDate, timeoutMs = 20000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const orders = await fetchOrders(page);
    const found = orders.find((order) => order.id === orderId);
    if (found && found.deliveryDate === expectedDate) return found;
    await sleep(600);
  }
  return null;
}

async function ensureDeliverySlotSelected(page) {
  const slotSelect = page.locator('select[name="deliverySlot"]');
  await slotSelect.waitFor({ state: "visible", timeout: 20000 });

  // Wait until options are populated.
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    const options = await slotSelect
      .locator("option")
      .evaluateAll((nodes) => nodes.map((node) => node.value).filter(Boolean));
    if (options.length > 0) {
      const currentValue = await slotSelect.inputValue();
      if (!currentValue) {
        await slotSelect.selectOption(options[0]);
      }
      return;
    }
    await sleep(250);
  }

  throw new Error("Delivery slot options are empty.");
}

async function pickAvailableDeliveryDateAndSlot(page, preferredDateIso) {
  const candidates = [];
  if (preferredDateIso) {
    candidates.push(preferredDateIso);
  }

  for (let offset = 2; offset <= 30; offset += 1) {
    const candidate = formatIsoDate(addDays(offset));
    if (!candidates.includes(candidate)) {
      candidates.push(candidate);
    }
  }

  const dateInput = page.locator('input[name="deliveryDate"]');
  const slotSelect = page.locator('select[name="deliverySlot"]');

  for (const candidate of candidates) {
    await dateInput.fill(candidate);
    await sleep(500);

    const options = await slotSelect
      .locator("option")
      .evaluateAll((nodes) => nodes.map((node) => node.value).filter(Boolean));

    if (options.length > 0) {
      await slotSelect.selectOption(options[0]);
      return candidate;
    }
  }

  throw new Error("No available delivery date/slot found in the next 30 days.");
}

async function verifyCalendarContainsOrder(page, dateIso, customerName) {
  await page.goto("/bakery/calendar", { waitUntil: "domcontentloaded" });

  const internalButton = page.getByRole("button", { name: "Internal Orders" });
  if (await internalButton.isVisible().catch(() => false)) {
    await internalButton.click();
  }

  const dayNumber = String(Number(dateIso.slice(8, 10)));
  const dayButton = page
    .locator(".rbc-month-view button")
    .filter({ hasText: new RegExp(`^${dayNumber}$`) })
    .first();

  await dayButton.waitFor({ state: "visible", timeout: 20000 });
  await dayButton.click();

  const dialog = page.getByRole("dialog", { name: /Orders on/i });
  await dialog.waitFor({ state: "visible", timeout: 10000 });
  await dialog.getByText(customerName, { exact: false }).waitFor({
    state: "visible",
    timeout: 10000,
  });
}

async function createBookingFromNewPage(page, customerName, deliveryDateIso) {
  await page.goto("/bakery/bookings/new", { waitUntil: "domcontentloaded" });

  await page.locator('input[name="customerName"]').fill(customerName);
  await page.locator('input[name="phoneNumber"]').fill("081234567890");
  await page.locator('select[name="deliveryMethod"]').selectOption("PICKUP");

  // Ensure first item has concrete selection values in case defaults are empty.
  for (const fieldName of [
    "items.0.category",
    "items.0.subcategory",
    "items.0.productName",
    "items.0.size",
  ]) {
    const select = page.locator(`select[name="${fieldName}"]`);
    if (await select.count()) {
      const options = await select
        .locator("option")
        .evaluateAll((nodes) => nodes.map((node) => node.value).filter(Boolean));
      if (options.length > 0) {
        await select.selectOption(options[0]);
      }
    }
  }

  const quantityInput = page.locator('input[name="items.0.quantity"]');
  if (await quantityInput.count()) {
    await quantityInput.fill("1");
  }

  const selectedDeliveryDate = await pickAvailableDeliveryDateAndSlot(
    page,
    deliveryDateIso,
  );
  await ensureDeliverySlotSelected(page);

  await page.locator('input[name="deliveryAddresses.0.label"]').fill("Primary");
  await page
    .locator('input[name="deliveryAddresses.0.area"]')
    .fill("Menteng / Jakarta");
  await page
    .locator('textarea[name="deliveryAddresses.0.addressLine"]')
    .fill("Jalan QA Otomasi No 123, Menteng, Jakarta");

  await page.locator('input[name="manualAdjustment"]').fill("200000");

  const submitButton = page.locator('button[type="submit"]').first();
  const disabled = await submitButton.isDisabled();
  if (disabled) {
    const hints = await page
      .locator(".text-rose-600, .text-rose-500, .text-amber-700")
      .allTextContents();
    const hintPreview = hints
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, 8)
      .join(" | ");

    throw new Error(
      `Create Booking button is disabled before submit. ${hintPreview || "No inline validation hint captured."}`,
    );
  }

  await submitButton.click();

  const successBanner = page.getByText("Booking berhasil disimpan ke server.", {
    exact: false,
  });
  const submitStartAt = Date.now();
  let submitCompleted = false;

  while (Date.now() - submitStartAt < 90000) {
    const confirmButton = page
      .locator("button")
      .filter({ hasText: /Ya,?\s*Sudah\s*Dicek/i })
      .first();
    if (await confirmButton.isVisible().catch(() => false)) {
      console.log("[booking-submit] clicking confirmation button");
      await confirmButton.click({ force: true });
      await sleep(350);
    }

    const duplicateContinueButton = page
      .locator("button")
      .filter({ hasText: /Lanjutkan Pesan Dengan Template Sama/i })
      .first();
    if (await duplicateContinueButton.isVisible().catch(() => false)) {
      console.log("[booking-submit] clicking duplicate warning continue button");
      await duplicateContinueButton.click({ force: true });
      await sleep(350);
    }

    if (await successBanner.isVisible().catch(() => false)) {
      submitCompleted = true;
      break;
    }

    const maybeCreated = await fetchOrders(page).catch(() => []);
    if (maybeCreated.some((order) => order.customerName === customerName)) {
      submitCompleted = true;
      break;
    }

    await sleep(900);
  }

  if (!submitCompleted) {
    const inlineErrors = await page
      .locator(".text-rose-600, .text-rose-500")
      .allTextContents();
    const errorPreview = inlineErrors
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, 5)
      .join(" | ");

    const screenshotPath = `tmp/checklist-create-fail-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });

    throw new Error(
      `Booking submit did not succeed. ${errorPreview || "No visible error message captured."} Screenshot: ${screenshotPath}`,
    );
  }

  return selectedDeliveryDate;
}

async function rescheduleFromDetailAsAdmin(page, orderId, currentDeliveryDate) {
  await page.goto(`/bakery/bookings/${orderId}#edit-delivery`, {
    waitUntil: "domcontentloaded",
  });

  const section = page.locator("#edit-delivery");
  await section.waitFor({ state: "visible", timeout: 20000 });

  for (let offset = 4; offset <= 20; offset += 1) {
    const nextDate = formatIsoDate(addDays(offset));
    if (nextDate === currentDeliveryDate) {
      continue;
    }

    await section.locator('input[type="date"]').fill(nextDate);
    await sleep(300);

    const slotSelect = section.locator("select").first();
    const slots = await slotSelect
      .locator("option")
      .evaluateAll((nodes) => nodes.map((node) => node.value).filter(Boolean));

    if (slots.length === 0) {
      continue;
    }

    await slotSelect.selectOption(slots[0]);
    await section.getByRole("button", { name: "Save Reschedule" }).click();

    const updated = await waitForOrderDate(page, orderId, nextDate, 12000);
    if (updated) {
      return nextDate;
    }
  }

  throw new Error("Failed to reschedule order to an available date.");
}

(async () => {
  const summary = {
    checklist: {
      ownerCreateBookingFromNewPage: false,
      ownerCalendarContainsBooking: false,
      adminRescheduleFromDetailPage: false,
      adminCalendarShowsMovedDate: false,
      ownerRecheckAfterCrossAccountSync: false,
    },
    runId: null,
    testAccounts: null,
    order: null,
    errors: [],
  };

  let browser;

  try {
    const seeded = await seedTestAccounts();
    summary.runId = seeded.runId;
    summary.testAccounts = {
      ownerEmail: seeded.ownerEmail,
      adminEmail: seeded.adminEmail,
      businessId: seeded.businessId,
      businessName: seeded.businessName,
    };

    const customerName = `QA Calendar ${seeded.runId}`;
    const initialDate = formatIsoDate(addDays(3));

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();

    page.on("pageerror", (error) => {
      console.log(`[pageerror] ${error.message}`);
    });
    page.on("response", (response) => {
      const url = response.url();
      if (!url.includes("/api/bookings/orders")) return;
      const method = response.request().method();
      if (method !== "POST") return;
      console.log(`[orders-sync] POST ${response.status()} ${url}`);
    });

    // 1) Owner create booking on New Booking page
    const ownerMe = await login(page, seeded.ownerEmail, seeded.password, "Owner");
    const selectedCreateDate = await createBookingFromNewPage(
      page,
      customerName,
      initialDate,
    );
    summary.checklist.ownerCreateBookingFromNewPage = true;

    const createdOrder = await waitForOrderByCustomer(page, customerName);
    summary.order = {
      id: createdOrder.id,
      customerName,
      submittedDeliveryDate: selectedCreateDate,
      initialDeliveryDate: createdOrder.deliveryDate,
      bookingCode: createdOrder.bookingCode,
    };

    await verifyCalendarContainsOrder(page, createdOrder.deliveryDate, customerName);
    summary.checklist.ownerCalendarContainsBooking = true;

    // 2) Admin edit/reschedule from detail page and verify moved date in calendar
    await logout(page);
    await login(page, seeded.adminEmail, seeded.password, "Admin");

    const movedDate = await rescheduleFromDetailAsAdmin(
      page,
      createdOrder.id,
      createdOrder.deliveryDate,
    );
    summary.checklist.adminRescheduleFromDetailPage = true;
    summary.order.movedDeliveryDate = movedDate;

    if (movedDate === createdOrder.deliveryDate) {
      throw new Error(
        `Reschedule did not change date. Still ${movedDate}.`,
      );
    }

    await verifyCalendarContainsOrder(page, movedDate, customerName);
    summary.checklist.adminCalendarShowsMovedDate = true;

    // 3) Cross-account recheck: back to owner ensure order not lost after sync
    await logout(page);
    await login(page, seeded.ownerEmail, seeded.password, "Owner");

    const ownerOrders = await fetchOrders(page);
    const ownerOrder = ownerOrders.find((entry) => entry.id === createdOrder.id);
    if (!ownerOrder) {
      throw new Error("Order missing when re-checking from owner account.");
    }
    if (ownerOrder.deliveryDate !== movedDate) {
      throw new Error(
        `Owner sees unexpected delivery date. Expected ${movedDate}, got ${ownerOrder.deliveryDate}.`,
      );
    }

    await verifyCalendarContainsOrder(page, movedDate, customerName);
    summary.checklist.ownerRecheckAfterCrossAccountSync = true;

    // Keep role sanity info
    summary.testAccounts.ownerRole = ownerMe?.role;
  } catch (error) {
    summary.errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  const pass = Object.values(summary.checklist).every(Boolean) && summary.errors.length === 0;
  console.log(JSON.stringify({ pass, summary }, null, 2));

  if (!pass) {
    process.exitCode = 1;
  }
})();
