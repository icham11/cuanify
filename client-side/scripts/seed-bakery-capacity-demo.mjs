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

function makeOrder({
  id,
  bookingCode,
  customerName,
  category,
  subcategory,
  productName,
  size,
  qty,
  date,
  slot,
  totalPrice,
  status = "Inquiry",
}) {
  const basePrice = Math.max(25000, Math.round(totalPrice * 0.8));
  const addOnTotal = Math.max(0, totalPrice - basePrice);

  return {
    id,
    bookingCode,
    resi: bookingCode,
    customerName,
    customerPhone: "081234567890",
    customerAddress: "Jl. Demo Seed No. 1, Jakarta 14350",
    deliveryDate: date,
    deliverySlot: slot,
    notes: "SEED: capacity-visibility",
    basePrice,
    addOnTotal,
    deliveryFee: 15000,
    manualAdjustment: 0,
    dpPaidAmount: 0,
    finalPaidAmount: 0,
    totalPaidAmount: 0,
    downPaymentAmount: Math.round(totalPrice * 0.5),
    remainingBalance: totalPrice,
    product: `${category} ${productName}`,
    totalPrice,
    paymentStatus: "Pending",
    orderStatus: status,
    shippingQuote: null,
    shipment: null,
    simulations: {
      whatsappSent: false,
      productionWhatsappSent: false,
      customerWhatsappSent: false,
      calendarEventCreated: false,
      googleSheetsSynced: false,
    },
    whatsAppParsedData: null,
    statusHistory: [
      {
        id: `log-${id}-seed`,
        status,
        timestamp: new Date().toISOString(),
        note: "Seeded for capacity visibility",
        userId: null,
        actorName: "Seeder",
      },
    ],
    automationLogs: [],
    paymentTransactions: [],
    items: [
      {
        id: `item-${id}`,
        category,
        subcategory,
        productName,
        size,
        quantity: qty,
        basePrice,
        addOns: [],
        addOnTotal,
      },
    ],
    deliveryAddresses: [
      {
        id: `addr-${id}`,
        label: "Utama",
        area: "Jakarta Utara",
        addressLine: "Jl. Demo Seed No. 1, Jakarta 14350",
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
    const text = await response.text();
    throw new Error(`Login failed: ${response.status} ${text}`);
  }

  const cookie = response.headers.get("set-cookie") || "";
  if (!cookie) {
    throw new Error("Login succeeded but token cookie is missing.");
  }

  return cookie;
}

async function getOrders(cookie) {
  const response = await fetch(`${BASE_URL}/api/bookings/orders`, {
    headers: { cookie },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `GET /api/bookings/orders failed: ${response.status} ${text}`,
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
  if (!response.ok) {
    throw new Error(
      `POST /api/bookings/orders failed: ${response.status} ${text}`,
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function buildSeedOrders() {
  const d1 = isoDate(1);
  const d2 = isoDate(2);
  const d3 = isoDate(3);
  const d4 = isoDate(4);

  return {
    dates: [d1, d2, d3, d4],
    orders: [
      makeOrder({
        id: "seed-h1-custom-1",
        bookingCode: `SD001-${d1.replaceAll("-", "")}`,
        customerName: "Seed Custom 1",
        category: "Cookies",
        subcategory: "Custom Cookies",
        productName: "Character Cookie",
        size: "isi 6",
        qty: 2,
        date: d1,
        slot: "10:00",
        totalPrice: 175000,
      }),
      makeOrder({
        id: "seed-h1-custom-2",
        bookingCode: `SD002-${d1.replaceAll("-", "")}`,
        customerName: "Seed Custom 2",
        category: "Cookies",
        subcategory: "Custom Cookies",
        productName: "Character Cookie",
        size: "isi 6",
        qty: 2,
        date: d1,
        slot: "10:00",
        totalPrice: 175000,
      }),
      makeOrder({
        id: "seed-h1-custom-3",
        bookingCode: `SD003-${d1.replaceAll("-", "")}`,
        customerName: "Seed Custom 3",
        category: "Cookies",
        subcategory: "Custom Cookies",
        productName: "Character Cookie",
        size: "isi 6",
        qty: 2,
        date: d1,
        slot: "10:00",
        totalPrice: 175000,
      }),

      makeOrder({
        id: "seed-h2-seasonal-1",
        bookingCode: `SD004-${d2.replaceAll("-", "")}`,
        customerName: "Seed Seasonal 1",
        category: "Cookies",
        subcategory: "Seasonal",
        productName: "CNY Box",
        size: "isi 4",
        qty: 8,
        date: d2,
        slot: "11:00",
        totalPrice: 260000,
      }),
      makeOrder({
        id: "seed-h2-seasonal-2",
        bookingCode: `SD005-${d2.replaceAll("-", "")}`,
        customerName: "Seed Seasonal 2",
        category: "Cookies",
        subcategory: "Seasonal",
        productName: "CNY Box",
        size: "isi 4",
        qty: 8,
        date: d2,
        slot: "11:00",
        totalPrice: 260000,
      }),
      makeOrder({
        id: "seed-h2-seasonal-3",
        bookingCode: `SD006-${d2.replaceAll("-", "")}`,
        customerName: "Seed Seasonal 3",
        category: "Cookies",
        subcategory: "Seasonal",
        productName: "CNY Box",
        size: "isi 4",
        qty: 8,
        date: d2,
        slot: "11:00",
        totalPrice: 260000,
      }),
      makeOrder({
        id: "seed-h2-seasonal-4",
        bookingCode: `SD007-${d2.replaceAll("-", "")}`,
        customerName: "Seed Seasonal 4",
        category: "Cookies",
        subcategory: "Seasonal",
        productName: "CNY Box",
        size: "isi 4",
        qty: 8,
        date: d2,
        slot: "11:00",
        totalPrice: 260000,
      }),
      makeOrder({
        id: "seed-h2-seasonal-5",
        bookingCode: `SD008-${d2.replaceAll("-", "")}`,
        customerName: "Seed Seasonal 5",
        category: "Cookies",
        subcategory: "Seasonal",
        productName: "CNY Box",
        size: "isi 4",
        qty: 8,
        date: d2,
        slot: "11:00",
        totalPrice: 260000,
      }),
      makeOrder({
        id: "seed-h2-seasonal-6",
        bookingCode: `SD009-${d2.replaceAll("-", "")}`,
        customerName: "Seed Seasonal 6",
        category: "Cookies",
        subcategory: "Seasonal",
        productName: "CNY Box",
        size: "isi 4",
        qty: 8,
        date: d2,
        slot: "11:00",
        totalPrice: 260000,
      }),

      makeOrder({
        id: "seed-h3-bulk-1",
        bookingCode: `SD010-${d3.replaceAll("-", "")}`,
        customerName: "Seed Bulk 1",
        category: "Cookies",
        subcategory: "Seasonal",
        productName: "Corporate Pack",
        size: "isi 15",
        qty: 20,
        date: d3,
        slot: "13:00",
        totalPrice: 1800000,
      }),
      makeOrder({
        id: "seed-h3-bulk-2",
        bookingCode: `SD011-${d3.replaceAll("-", "")}`,
        customerName: "Seed Bulk 2",
        category: "Cookies",
        subcategory: "Custom Cookies",
        productName: "Individual Cookie",
        size: "isi 1",
        qty: 120,
        date: d3,
        slot: "15:00",
        totalPrice: 2400000,
      }),

      makeOrder({
        id: "seed-h4-cake-1",
        bookingCode: `SD012-${d4.replaceAll("-", "")}`,
        customerName: "Seed Cake 1",
        category: "Cake",
        subcategory: "Birthday Cake",
        productName: "Cake 20cm",
        size: "20x10",
        qty: 1,
        date: d4,
        slot: "12:00",
        totalPrice: 550000,
      }),
      makeOrder({
        id: "seed-h4-cupcake-1",
        bookingCode: `SD013-${d4.replaceAll("-", "")}`,
        customerName: "Seed Cupcake 1",
        category: "Cupcakes",
        subcategory: "Cupcake Dozen",
        productName: "Cupcake Pack",
        size: "Dozen",
        qty: 4,
        date: d4,
        slot: "14:00",
        totalPrice: 480000,
      }),
    ],
  };
}

function summarizeSeedByDateSlot(orders) {
  const map = new Map();
  for (const entry of orders) {
    const key = `${entry.deliveryDate} ${entry.deliverySlot}`;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

async function main() {
  const cookie = await login();
  const existingOrders = await getOrders(cookie);

  const { orders: seedOrders, dates } = buildSeedOrders();
  const existingWithoutSeed = existingOrders.filter(
    (entry) => !(typeof entry?.id === "string" && entry.id.startsWith("seed-")),
  );

  const mergedOrders = [...seedOrders, ...existingWithoutSeed];
  const result = await syncOrders(cookie, mergedOrders);

  console.log("Seed booking berhasil.");
  console.log(`Account  : ${EMAIL}`);
  console.log(`Base URL : ${BASE_URL}`);
  console.log(`Seed rows: ${seedOrders.length}`);
  console.log(`Total    : ${mergedOrders.length}`);
  console.log(`Mode     : ${result?.data?.mode || "unknown"}`);
  console.log(`Dates    : ${dates.join(", ")}`);
  console.log("Slots    :");

  for (const [key, count] of summarizeSeedByDateSlot(seedOrders)) {
    console.log(`- ${key} => ${count} order`);
  }
}

main().catch((error) => {
  console.error("Seed gagal:", error instanceof Error ? error.message : error);
  process.exit(1);
});
