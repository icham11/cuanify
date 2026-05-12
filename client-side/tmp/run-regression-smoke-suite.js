/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require("playwright");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

require("dotenv").config({ path: ".env" });

const BASE_URL = "http://127.0.0.1:3000";

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

function buildDashboardProductName(productName, variantLabel, variantCount = 1) {
  const normalizedVariant = String(variantLabel || "").trim().toLowerCase();
  if (variantCount === 1 && ["standard", "start from"].includes(normalizedVariant)) {
    return productName;
  }
  return `${productName} - ${variantLabel}`;
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function getJakartaMonthKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value || "1970";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  return `${year}-${month}`;
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

async function fetchJson(page, url, options = {}) {
  const response = await page.request.fetch(url, {
    failOnStatusCode: false,
    ...options,
  });

  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function fetchOrders(page) {
  const { response, payload } = await fetchJson(page, "/api/bookings/orders");
  if (!response.ok()) {
    throw new Error(`Failed fetching orders: HTTP ${response.status()}`);
  }
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

async function waitForOrderStatus(page, orderId, expectedStatus, timeoutMs = 20000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const orders = await fetchOrders(page);
    const found = orders.find((order) => order.id === orderId);
    if (found && found.orderStatus === expectedStatus) return found;
    await sleep(600);
  }
  return null;
}

async function ensureDeliverySlotSelected(page) {
  const slotSelect = page.locator('select[name="deliverySlot"]');
  await slotSelect.waitFor({ state: "visible", timeout: 20000 });

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

  const previewButton = page.getByRole("button", { name: /Preview Booking/i });
  await previewButton.waitFor({ state: "visible", timeout: 30000 });

  if (await previewButton.isDisabled()) {
    const hints = await page
      .locator(".text-rose-600, .text-rose-500, .text-amber-700")
      .allTextContents();
    const hintPreview = hints
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, 8)
      .join(" | ");

    throw new Error(
      `Preview Booking button is disabled before submit. ${hintPreview || "No inline validation hint captured."}`,
    );
  }

  await previewButton.click();

  const reviewStartAt = Date.now();
  while (Date.now() - reviewStartAt < 60000) {
    if (page.url().includes("/bakery/bookings/new/review")) {
      break;
    }

    const createVisible = await page
      .getByRole("button", { name: /Create Booking/i })
      .isVisible()
      .catch(() => false);
    if (createVisible) {
      break;
    }

    await sleep(400);
  }

  if (!page.url().includes("/bakery/bookings/new/review")) {
    const createVisible = await page
      .getByRole("button", { name: /Create Booking/i })
      .isVisible()
      .catch(() => false);
    if (!createVisible) {
      throw new Error("Booking form did not reach review step.");
    }
  }

  const createButton = page.getByRole("button", { name: /Create Booking/i });
  await createButton.waitFor({ state: "visible", timeout: 60000 });

  const successBanner = page.getByText("Booking berhasil disimpan ke server.", {
    exact: false,
  });
  const submitStartAt = Date.now();
  let submitCompleted = false;
  let createClickAttempted = false;

  while (Date.now() - submitStartAt < 90000) {
    if (!createClickAttempted) {
      await createButton.click();
      createClickAttempted = true;
      await sleep(350);
    }

    const createStillVisible = await createButton.isVisible().catch(() => false);
    if (createStillVisible) {
      await createButton.click().catch(() => undefined);
      await sleep(250);
    }

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

    const screenshotPath = `tmp/regression-create-fail-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });

    throw new Error(
      `Booking submit did not succeed. ${errorPreview || "No visible error message captured."} Screenshot: ${screenshotPath}`,
    );
  }

  return selectedDeliveryDate;
}

async function updateStatusFromDetail(page, orderId, nextStatus) {
  await page.goto(`/bakery/bookings/${orderId}`, {
    waitUntil: "domcontentloaded",
  });

  const statusSelect = page.locator("select").first();
  await statusSelect.waitFor({ state: "visible", timeout: 20000 });
  await statusSelect.selectOption(nextStatus);

  await page.getByRole("button", { name: /^Simpan$/i }).click();

  const updated = await waitForOrderStatus(page, orderId, nextStatus, 12000);
  if (updated) {
    return updated.orderStatus;
  }

  throw new Error(`Failed to update order status to ${nextStatus}.`);
}

async function verifyOrderDetailVisible(page, orderId, bookingCode) {
  await page.goto(`/bakery/bookings/${orderId}`, {
    waitUntil: "domcontentloaded",
  });

  await page.getByText(`#${bookingCode}`, { exact: false }).waitFor({
    state: "visible",
    timeout: 20000,
  });
}

async function fetchStaffSnapshot(page) {
  const { response, payload } = await fetchJson(page, "/api/staff");
  if (!response.ok()) {
    throw new Error(`Failed fetching staff: HTTP ${response.status()}`);
  }
  return payload?.data || {};
}

async function registerStaffViaDashboard(page, seeded) {
  const staffName = `QA Staff ${seeded.runId}`;
  const staffEmail = `qa.staff.${seeded.runId}@crumbella.local`;
  const staffPassword = "QaStaff!234";

  await page.goto("/dashboard/staff", { waitUntil: "domcontentloaded" });
  await page.getByText("Daftarkan Anggota Baru", { exact: false }).waitFor({
    state: "visible",
    timeout: 20000,
  });

  await page.getByPlaceholder("Contoh: Siti Aisyah").fill(staffName);
  await page.getByPlaceholder("Contoh: siti@gmail.com").fill(staffEmail);
  await page.getByPlaceholder("Minimal 6 karakter").fill(staffPassword);

  const roleSelect = page.locator("select").filter({ has: page.locator("option[value=\"Staff\"]") }).first();
  await roleSelect.selectOption("Staff");

  const registerPromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/staff/register") &&
      response.request().method() === "POST",
    { timeout: 30000 },
  );

  await page.getByRole("button", { name: /Daftarkan Staff/i }).click();
  const registerResponse = await registerPromise;
  if (registerResponse.status() !== 201) {
    const bodyText = await registerResponse.text();
    throw new Error(`Staff registration failed (${registerResponse.status()}): ${bodyText}`);
  }

  await page.getByText(staffEmail, { exact: false }).waitFor({
    state: "visible",
    timeout: 20000,
  });

  const snapshot = await fetchStaffSnapshot(page);
  const members = Array.isArray(snapshot.members) ? snapshot.members : [];
  const createdMember = members.find((member) => member.email === staffEmail);
  if (!createdMember || createdMember.role !== "Staff") {
    throw new Error("Registered staff member was not returned by /api/staff.");
  }

  return {
    name: staffName,
    email: staffEmail,
    password: staffPassword,
    memberId: createdMember.id,
    userId: createdMember.userId,
  };
}

async function fetchAttendanceSummary(page, month) {
  const { response, payload } = await fetchJson(
    page,
    `/api/bakery/attendance?month=${month}`,
  );
  if (!response.ok()) {
    throw new Error(`Failed fetching attendance: HTTP ${response.status()}`);
  }
  return payload?.data || {};
}

async function runAttendanceCheckInFlow(page, staffAccount) {
  const monthKey = getJakartaMonthKey();

  await page.goto("/bakery/attendance", { waitUntil: "domcontentloaded" });
  await page.getByText("Absensi Hari Ini", { exact: false }).waitFor({
    state: "visible",
    timeout: 20000,
  });

  const attendancePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/bakery/attendance") &&
      response.request().method() === "POST",
    { timeout: 30000 },
  );

  await page.getByRole("button", { name: /\+ Absen|Absen/i }).click();
  const attendanceResponse = await attendancePromise;
  if (attendanceResponse.status() !== 200) {
    const bodyText = await attendanceResponse.text();
    throw new Error(`Attendance check-in failed (${attendanceResponse.status()}): ${bodyText}`);
  }

  let selfSummary = null;
  const startedAt = Date.now();
  while (Date.now() - startedAt < 20000) {
    selfSummary = await fetchAttendanceSummary(page, monthKey).catch(() => null);
    if (selfSummary?.todayRecord) {
      break;
    }
    await sleep(600);
  }

  if (!selfSummary?.todayRecord) {
    throw new Error(`Attendance record for ${staffAccount.email} was not persisted.`);
  }

  await page.goto("/bakery/attendance", { waitUntil: "domcontentloaded" });
  await page.getByText("Riwayat Bulan Ini", { exact: false }).waitFor({
    state: "visible",
    timeout: 20000,
  });

  const alreadyCheckedInLabel = page.getByRole("button", { name: /Sudah Absen/i });
  if (await alreadyCheckedInLabel.isVisible().catch(() => false)) {
    return {
      monthKey,
      todayRecord: selfSummary.todayRecord,
    };
  }

  await page.getByText("Check-in", { exact: false }).waitFor({
    state: "visible",
    timeout: 10000,
  });

  if (!selfSummary.todayRecord) {
    throw new Error(`Attendance record for ${staffAccount.email} was not persisted.`);
  }

  return {
    monthKey,
    todayRecord: selfSummary.todayRecord,
  };
}

async function fetchBakerySettings(page) {
  const { response, payload } = await fetchJson(page, "/api/bakery/settings");
  if (!response.ok()) {
    throw new Error(`Failed fetching bakery settings: HTTP ${response.status()}`);
  }
  return payload?.data || {};
}

function nextFutureDate(days) {
  return formatIsoDate(addDays(days));
}

async function updateBakerySettingsViaDashboard(page, runId) {
  const before = await fetchBakerySettings(page);
  const nextDefaultDp = before.defaultDpPercentage >= 80 ? 45 : before.defaultDpPercentage + 5;
  const nextDailyToken = Math.max(10, Number(before.dailyProductionTokenLimit || 0) + 7);
  const nextStaffToken = Math.max(10, Number(before.staffDailyTokenLimit || 0) + 3);
  const holidayDate = nextFutureDate(45);
  const holidayLabel = `QA Holiday ${runId}`;

  await page.goto("/dashboard/business/bakery-settings", {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("heading", { name: /^Bakery Settings$/ }).waitFor({
    state: "visible",
    timeout: 30000,
  });

  await page.locator('label:has-text("Default DP") input').fill(String(nextDefaultDp));
  await page.locator('label:has-text("Token Harian Order") input').fill(String(nextDailyToken));
  await page.locator('label:has-text("Default Token Staff") input').fill(String(nextStaffToken));

  const holidaySection = page.locator("section").filter({ hasText: "Kalender Libur" });
  await holidaySection.locator('input[type="date"]').fill(holidayDate);
  await holidaySection
    .getByPlaceholder("Contoh: Lebaran, Nyepi, Libur keluarga")
    .fill(holidayLabel);
  await holidaySection.getByRole("button", { name: /^Tambah$/ }).click();

  await holidaySection.getByText(holidayLabel, { exact: false }).waitFor({
    state: "visible",
    timeout: 10000,
  });

  const savePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/bakery/settings") &&
      response.request().method() === "PATCH",
    { timeout: 30000 },
  );

  await page.getByRole("button", { name: /^Simpan Pengaturan$/ }).click();
  const saveResponse = await savePromise;
  if (saveResponse.status() !== 200) {
    const bodyText = await saveResponse.text();
    throw new Error(`Saving bakery settings failed (${saveResponse.status()}): ${bodyText}`);
  }

  const after = await fetchBakerySettings(page);
  const holidayEntries = Array.isArray(after.holidayEntries) ? after.holidayEntries : [];
  const savedHoliday = holidayEntries.find(
    (entry) => entry.date === holidayDate && entry.label === holidayLabel,
  );

  if (
    Number(after.defaultDpPercentage) !== nextDefaultDp ||
    Number(after.dailyProductionTokenLimit) !== nextDailyToken ||
    Number(after.staffDailyTokenLimit) !== nextStaffToken ||
    !savedHoliday
  ) {
    throw new Error("Bakery settings did not persist the expected values.");
  }

  return {
    defaultDpPercentage: nextDefaultDp,
    dailyProductionTokenLimit: nextDailyToken,
    staffDailyTokenLimit: nextStaffToken,
    holidayDate,
    holidayLabel,
  };
}

async function fetchProducts(page, search) {
  const query = search ? `?search=${encodeURIComponent(search)}&limit=50` : "?limit=50";
  const { response, payload } = await fetchJson(page, `/api/products${query}`);
  if (!response.ok()) {
    throw new Error(`Failed fetching products: HTTP ${response.status()}`);
  }
  return Array.isArray(payload?.data) ? payload.data : [];
}

async function fetchCatalogConfig(page) {
  const { response, payload } = await fetchJson(page, "/api/bookings/catalog-config");
  if (!response.ok()) {
    throw new Error(`Failed fetching booking catalog config: HTTP ${response.status()}`);
  }
  return payload?.data || {};
}

async function createProductViaDashboard(page, runId) {
  const productName = `QA Product ${runId}`;
  const categoryName = `QA Category ${runId}`;
  const subcategory = `QA Subcategory ${runId}`;
  const variantLabel = `QA Variant ${runId}`;
  const dashboardProductName = buildDashboardProductName(
    productName,
    variantLabel,
    1,
  );

  await page.goto("/dashboard/products/create", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: /^Tambah Produk$/ }).waitFor({
    state: "visible",
    timeout: 30000,
  });

  await page.getByText("Tambah Produk Satu per Satu", { exact: false }).click();

  await page.getByPlaceholder("cth. Es Kopi Susu").fill(productName);
  await page.getByPlaceholder("cth. Minuman").fill(categoryName);

  const productForm = page.locator("form").first();
  await productForm.locator('input[placeholder="0"]').nth(0).fill("150000");
  await productForm.locator('input[placeholder="0"]').nth(1).fill("90000");
  await page.getByRole("button", { name: /Ready Stock/i }).click();
  await page.getByPlaceholder("cth. Signature Drinks").fill(subcategory);
  await page.getByPlaceholder("cth. Standard").fill(variantLabel);

  const submitPromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/products") &&
      response.request().method() === "POST",
    { timeout: 30000 },
  );
  const catalogPutPromise = page
    .waitForResponse(
      (response) =>
        response.url().includes("/api/bookings/catalog-config") &&
        response.request().method() === "PUT",
      { timeout: 20000 },
    )
    .catch(() => null);

  await page.getByRole("button", { name: /Konfirmasi & Simpan/i }).click();
  const submitResponse = await submitPromise;
  if (submitResponse.status() !== 200 && submitResponse.status() !== 201) {
    const bodyText = await submitResponse.text();
    throw new Error(`Product creation failed (${submitResponse.status()}): ${bodyText}`);
  }

  const successBanner = page.getByText("Produk tersimpan!", { exact: false });
  const successVisible = await successBanner
    .waitFor({ state: "visible", timeout: 5000 })
    .then(() => true)
    .catch(() => false);

  if (!successVisible) {
    await page
      .waitForURL("**/dashboard/products", { timeout: 10000 })
      .catch(() => undefined);
    await sleep(500);
  }

  const catalogPutResponse = await catalogPutPromise;
  if (catalogPutResponse && !catalogPutResponse.ok()) {
    const bodyText = await catalogPutResponse.text();
    throw new Error(
      `Booking catalog sync failed (${catalogPutResponse.status()}): ${bodyText}`,
    );
  }

  const catalogSyncWarning = page
    .locator(".bg-amber-50")
    .filter({ hasText: /sinkron|catalog|retry/i })
    .first();
  if (await catalogSyncWarning.isVisible().catch(() => false)) {
    const warningText = (await catalogSyncWarning.textContent())?.trim() || "";
    throw new Error(`Booking catalog sync warning: ${warningText}`);
  }

  const products = await fetchProducts(page, productName);
  const savedProduct = products.find(
    (entry) =>
      entry.name === dashboardProductName ||
      entry.name === productName,
  );
  if (!savedProduct) {
    throw new Error("Created product was not returned by /api/products.");
  }

  const catalogConfig = await fetchCatalogConfig(page);
  const customProducts = Array.isArray(catalogConfig.customProducts)
    ? catalogConfig.customProducts
    : [];
  const catalogEntry = customProducts.find(
    (entry) =>
      entry.category === categoryName &&
      entry.subcategory === subcategory &&
      entry.productName === productName &&
      entry.variantLabel === variantLabel,
  );
  if (!catalogEntry) {
    throw new Error("Created product was not synced into booking catalog config.");
  }

  return {
    productId: savedProduct.id,
    productName,
    dashboardProductName,
    categoryName,
    subcategory,
    variantLabel,
  };
}

async function waitForSelectOptionValue(selectLocator, expectedText, timeoutMs = 20000) {
  const startedAt = Date.now();
  const normalizedExpected = expectedText.trim().toLowerCase();

  while (Date.now() - startedAt < timeoutMs) {
    const options = await selectLocator.locator("option").evaluateAll((nodes) =>
      nodes.map((node) => ({
        value: node.value,
        text: (node.textContent || "").trim(),
      })),
    );

    const match = options.find((option) => {
      const optionText = option.text.toLowerCase();
      return option.value && (optionText === normalizedExpected || optionText.includes(normalizedExpected));
    });

    if (match) {
      return match.value;
    }

    await sleep(500);
  }

  throw new Error(`Option "${expectedText}" was not found in select.`);
}

async function verifyBookingFormContainsProduct(page, product) {
  await page.goto("/bakery/bookings/new", { waitUntil: "domcontentloaded" });

  const categorySelect = page.locator('select[name="items.0.category"]');
  const subcategorySelect = page.locator('select[name="items.0.subcategory"]');
  const productSelect = page.locator('select[name="items.0.productName"]');
  const sizeSelect = page.locator('select[name="items.0.size"]');

  await categorySelect.waitFor({ state: "visible", timeout: 30000 });

  const categoryValue = await waitForSelectOptionValue(
    categorySelect,
    product.categoryName,
    30000,
  );
  await categorySelect.selectOption(categoryValue);

  if (await subcategorySelect.count()) {
    const subcategoryValue = await waitForSelectOptionValue(
      subcategorySelect,
      product.subcategory,
      20000,
    );
    await subcategorySelect.selectOption(subcategoryValue);
  } else {
    await page
      .locator('label:has-text("Subcategory")')
      .getByText(product.subcategory, { exact: true })
      .waitFor({
      state: "visible",
      timeout: 20000,
    });
  }

  if (await productSelect.count()) {
    const productValue = await waitForSelectOptionValue(
      productSelect,
      product.productName,
      20000,
    );
    await productSelect.selectOption(productValue);
    const selectedProductText = await productSelect
      .locator("option:checked")
      .textContent();
    if (!selectedProductText?.includes(product.productName)) {
      throw new Error("New product could not be selected from booking form.");
    }
  } else {
    await page
      .locator('label:has-text("Product")')
      .getByText(product.productName, { exact: true })
      .waitFor({
      state: "visible",
      timeout: 20000,
    });
  }

  if (await sizeSelect.count()) {
    const sizeValue = await waitForSelectOptionValue(
      sizeSelect,
      product.variantLabel,
      20000,
    );
    await sizeSelect.selectOption(sizeValue);
    const selectedSizeText = await sizeSelect.locator("option:checked").textContent();
    if (!selectedSizeText?.includes(product.variantLabel)) {
      throw new Error("New product variant could not be selected from booking form.");
    }
  } else {
    await page
      .locator('label:has-text("Size")')
      .getByText(product.variantLabel, { exact: true })
      .waitFor({
      state: "visible",
      timeout: 20000,
    });
  }
}

const DOMAIN_CHECKLISTS = {
  bookings: [
    "ownerCreateBookingFromNewPage",
    "ownerCalendarContainsBooking",
    "adminCanAccessDetailPage",
    "ownerUpdateStatusFromDetailPage",
    "ownerRecheckAfterCrossAccountSync",
  ],
  "team-settings": [
    "ownerRegistersStaffViaDashboard",
    "staffCanCheckInAttendance",
    "ownerSeesStaffAttendance",
    "ownerCanSaveBakerySettings",
  ],
  "products-catalog": [
    "ownerCanCreateProductViaDashboard",
    "newProductVisibleInBookingForm",
  ],
};

function normalizeDomains(inputDomains) {
  const allDomains = Object.keys(DOMAIN_CHECKLISTS);
  if (!Array.isArray(inputDomains) || inputDomains.length === 0) {
    return allDomains;
  }

  const requested = inputDomains
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  const unique = [...new Set(requested)];
  const invalid = unique.filter((value) => !allDomains.includes(value));
  if (invalid.length > 0) {
    throw new Error(
      `Unknown smoke domains: ${invalid.join(", ")}. Expected one of: ${allDomains.join(", ")}.`,
    );
  }

  return unique;
}

function createChecklist() {
  return {
    ownerCreateBookingFromNewPage: false,
    ownerCalendarContainsBooking: false,
    adminCanAccessDetailPage: false,
    ownerUpdateStatusFromDetailPage: false,
    ownerRecheckAfterCrossAccountSync: false,
    ownerRegistersStaffViaDashboard: false,
    staffCanCheckInAttendance: false,
    ownerSeesStaffAttendance: false,
    ownerCanSaveBakerySettings: false,
    ownerCanCreateProductViaDashboard: false,
    newProductVisibleInBookingForm: false,
  };
}

async function runRegressionSmokeSuite(options = {}) {
  const domains = normalizeDomains(options.domains);
  const enabledChecklistKeys = domains.flatMap((domain) => DOMAIN_CHECKLISTS[domain]);
  const summary = {
    domains,
    checklist: createChecklist(),
    runId: null,
    testAccounts: null,
    order: null,
    attendance: null,
    settings: null,
    product: null,
    errors: [],
  };

  const hasDomain = (domain) => domains.includes(domain);
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
      const method = response.request().method();
      if (
        url.includes("/api/bookings/orders") ||
        url.includes("/api/staff/register") ||
        url.includes("/api/bakery/attendance") ||
        url.includes("/api/bakery/settings") ||
        url.includes("/api/bookings/catalog-config") ||
        url.includes("/api/products")
      ) {
        console.log(`[http] ${method} ${response.status()} ${url}`);
      }
    });

    const ownerMe = await login(page, seeded.ownerEmail, seeded.password, "Owner");
    summary.testAccounts.ownerRole = ownerMe?.role;

    if (hasDomain("bookings")) {
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

      await logout(page);
      await login(page, seeded.adminEmail, seeded.password, "Admin");

      await verifyOrderDetailVisible(page, createdOrder.id, createdOrder.bookingCode);
      summary.checklist.adminCanAccessDetailPage = true;

      await logout(page);
      await login(page, seeded.ownerEmail, seeded.password, "Owner");

      const updatedStatus = await updateStatusFromDetail(page, createdOrder.id, "Ready");
      summary.checklist.ownerUpdateStatusFromDetailPage = true;
      summary.order.updatedStatus = updatedStatus;

      const ownerOrders = await fetchOrders(page);
      const ownerOrder = ownerOrders.find((entry) => entry.id === createdOrder.id);
      if (!ownerOrder || ownerOrder.orderStatus !== "Ready") {
        throw new Error("Owner re-check after status sync returned unexpected order state.");
      }

      await verifyCalendarContainsOrder(page, createdOrder.deliveryDate, customerName);
      summary.checklist.ownerRecheckAfterCrossAccountSync = true;
    }

    if (hasDomain("team-settings")) {
      const staffAccount = await registerStaffViaDashboard(page, seeded);
      summary.checklist.ownerRegistersStaffViaDashboard = true;
      summary.testAccounts.staffEmail = staffAccount.email;

      await logout(page);
      await login(page, staffAccount.email, staffAccount.password, "Staff");

      const attendance = await runAttendanceCheckInFlow(page, staffAccount);
      summary.checklist.staffCanCheckInAttendance = true;
      summary.attendance = attendance;

      await logout(page);
      await login(page, seeded.ownerEmail, seeded.password, "Owner");

      await page.goto("/bakery/attendance", { waitUntil: "domcontentloaded" });
      await page.getByText(staffAccount.name, { exact: false }).waitFor({
        state: "visible",
        timeout: 20000,
      });

      const ownerAttendance = await fetchAttendanceSummary(page, attendance.monthKey);
      const teamEntries = Array.isArray(ownerAttendance.team) ? ownerAttendance.team : [];
      const staffAttendance = teamEntries.find((entry) => entry.email === staffAccount.email);
      if (!staffAttendance || Number(staffAttendance.attendanceCount || 0) < 1) {
        throw new Error("Owner attendance view did not include the staff check-in.");
      }
      summary.checklist.ownerSeesStaffAttendance = true;

      const savedSettings = await updateBakerySettingsViaDashboard(page, seeded.runId);
      summary.checklist.ownerCanSaveBakerySettings = true;
      summary.settings = savedSettings;
    }

    if (hasDomain("products-catalog")) {
      const product = await createProductViaDashboard(page, seeded.runId);
      summary.checklist.ownerCanCreateProductViaDashboard = true;
      summary.product = product;

      await verifyBookingFormContainsProduct(page, product);
      summary.checklist.newProductVisibleInBookingForm = true;
    }
  } catch (error) {
    summary.errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  const pass =
    enabledChecklistKeys.every((key) => summary.checklist[key]) &&
    summary.errors.length === 0;
  return { pass, summary };
}

module.exports = {
  runRegressionSmokeSuite,
};

if (require.main === module) {
  runRegressionSmokeSuite()
    .then(({ pass, summary }) => {
      console.log(JSON.stringify({ pass, summary }, null, 2));
      if (!pass) {
        process.exitCode = 1;
      }
    })
    .catch((error) => {
      console.log(
        JSON.stringify(
          {
            pass: false,
            summary: {
              domains: Object.keys(DOMAIN_CHECKLISTS),
              checklist: createChecklist(),
              runId: null,
              testAccounts: null,
              order: null,
              attendance: null,
              settings: null,
              product: null,
              errors: [error instanceof Error ? error.message : String(error)],
            },
          },
          null,
          2,
        ),
      );
      process.exitCode = 1;
    });
}
