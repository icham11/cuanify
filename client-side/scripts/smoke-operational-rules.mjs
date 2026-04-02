#!/usr/bin/env node

const BASE_URL = process.env.BASE_URL || "https://crumbella-demo.vercel.app";
const EMAIL = process.env.SEED_EMAIL || "kambiyang@mail.co";
const PASSWORD = process.env.SEED_PASSWORD || "kambing123";

function isoDate(offsetDays) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function makeProbeOrder({ id, date, slot, customTokenPerUnit = 1 }) {
  return {
    id,
    bookingCode: `SMK-${id}`,
    resi: `SMK-${id}`,
    customerName: "Smoke Test",
    customerPhone: "081234567890",
    customerAddress: "Jl. Smoke Test No. 1",
    deliveryDate: date,
    deliverySlot: slot,
    notes: "SMOKE TEST",
    basePrice: 100000,
    addOnTotal: 0,
    deliveryFee: 0,
    manualAdjustment: 0,
    dpPaidAmount: 0,
    finalPaidAmount: 0,
    totalPaidAmount: 0,
    downPaymentAmount: 50000,
    remainingBalance: 100000,
    product: "Smoke Test Product",
    totalPrice: 100000,
    paymentStatus: "Pending",
    orderStatus: "Inquiry",
    shippingQuote: null,
    shipment: null,
    simulations: null,
    whatsAppParsedData: null,
    statusHistory: [],
    automationLogs: [],
    paymentTransactions: [],
    items: [
      {
        id: `item-${id}`,
        category: "Cookies",
        subcategory: "Custom Cookies",
        productName: "Smoke Cookie",
        size: "isi 1",
        quantity: 1,
        tokenDifficulty: "SIMPLE",
        customTokenPerUnit,
        basePrice: 100000,
        addOns: [],
        addOnTotal: 0,
      },
    ],
    deliveryAddresses: [
      {
        id: `addr-${id}`,
        label: "Utama",
        area: "Jakarta",
        addressLine: "Jl. Smoke Test No. 1",
      },
    ],
  };
}

async function login() {
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  if (!response.ok) {
    throw new Error(
      `Login failed: ${response.status} ${await response.text()}`,
    );
  }

  const cookie = response.headers.get("set-cookie") || "";
  if (!cookie) {
    throw new Error("Missing auth cookie after login");
  }
  return cookie;
}

async function fetchOrders(cookie) {
  const response = await fetch(`${BASE_URL}/api/bookings/orders`, {
    headers: { cookie },
  });
  if (!response.ok) {
    throw new Error(
      `GET orders failed: ${response.status} ${await response.text()}`,
    );
  }
  const payload = await response.json();
  return Array.isArray(payload?.data?.orders) ? payload.data.orders : [];
}

async function syncOrders(cookie, orders) {
  const response = await fetch(`${BASE_URL}/api/bookings/orders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie,
    },
    body: JSON.stringify({ orders }),
  });

  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }

  return { status: response.status, ok: response.ok, body: parsed };
}

async function runScenario(cookie, originalOrders, name, probeOrder) {
  const merged = [...originalOrders, probeOrder];
  const result = await syncOrders(cookie, merged);
  const errorMsg =
    (typeof result.body?.error === "string" && result.body.error) ||
    (typeof result.body?.details === "string" && result.body.details) ||
    "(no error msg)";

  console.log(
    `- ${name}: status=${result.status} ok=${result.ok} msg=${errorMsg}`,
  );
  return result;
}

async function main() {
  const cookie = await login();
  const originalOrders = await fetchOrders(cookie);
  const now = new Date();

  const blockedDate = "2026-04-14";
  const cutoffDate = isoDate(1);
  const fullDate = "2026-04-04";
  const pastDate = isoDate(-1);

  console.log(`Smoke target account: ${EMAIL}`);
  console.log(`Original orders: ${originalOrders.length}`);
  console.log(`Now: ${now.toISOString()} (hour=${now.getHours()})`);
  console.log("Running scenarios...");

  await runScenario(
    cookie,
    originalOrders,
    "Past date",
    makeProbeOrder({
      id: "smoke-past",
      date: pastDate,
      slot: "11:00",
      customTokenPerUnit: 1,
    }),
  );

  await runScenario(
    cookie,
    originalOrders,
    "Blocked date",
    makeProbeOrder({
      id: "smoke-blocked",
      date: blockedDate,
      slot: "11:00",
      customTokenPerUnit: 1,
    }),
  );

  await runScenario(
    cookie,
    originalOrders,
    "H-1 cutoff",
    makeProbeOrder({
      id: "smoke-cutoff",
      date: cutoffDate,
      slot: "11:00",
      customTokenPerUnit: 1,
    }),
  );

  await runScenario(
    cookie,
    originalOrders,
    "Token full",
    makeProbeOrder({
      id: "smoke-full",
      date: fullDate,
      slot: "11:00",
      customTokenPerUnit: 1000,
    }),
  );

  const restore = await syncOrders(cookie, originalOrders);
  console.log(
    `Restore original orders: status=${restore.status} ok=${restore.ok}`,
  );
}

main().catch((error) => {
  console.error(
    "Smoke failed:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
