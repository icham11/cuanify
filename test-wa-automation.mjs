#!/usr/bin/env node

/**
 * Test WhatsApp automation dengan 3 gambar dan payload dari template parse
 */

const API_BASE = "http://localhost:3000";

// Generate future delivery date (7 days from now)
function getFutureDate(daysFromNow = 7) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().split("T")[0];
}

// 3 contoh gambar (placeholder dengan ukuran berbeda untuk testing)
const TEST_IMAGES = [
  "https://via.placeholder.com/600x400?text=Cake+Design",
  "https://via.placeholder.com/600x400?text=Cookie+Detail",
  "https://via.placeholder.com/600x400?text=Packaging",
];

const ORDER_PAYLOAD = {
  id: "legacy-1", // Will be overridden with unique ID
  items: [
    {
      id: "item-1",
      category: "Cake",
      subcategory: "Custom",
      productName: "Cake d14t10",
      size: "d14t10",
      quantity: 1,
      basePrice: 400000,
      selectedPrice: 400000,
      addOns: [
        {
          id: "addon-1",
          name: "Large Cookies Full Body",
          quantity: 3,
          unitPrice: 70000,
        },
      ],
      addOnTotal: 210000,
      notes: "Nama di Cake: Happy Birth Day Ayangku🩷\nUmur: 26\nRasa: Double choco\nDesign: 3 large cookies full body",
      designNotes:
        "3 large cookies full body",
    },
  ],
  deliveryAddresses: [
    {
      id: "addr-1",
      label: "Rumah",
      area: "Pademangan",
      addressLine: "Jl. Pademangan 3 Gang 3 A No 45 Kec Pademangan 11470",
    },
  ],
  customerName: "Deni",
  customerPhone: "085776999088",
  deliveryDate: getFutureDate(),
  deliverySlot: "19:00",
  deliveryFee: 0,
  manualAdjustment: 0,
  totalPrice: 610000,
  downPaymentAmount: 0,
  paymentStatus: "Pending",
  bookingCode: "DE-88",
  orderStatus: "Inquiry",
  shippingMethod: "gosend",
  sales_channel: "direct",
  notes: "Test order dengan 3 gambar referensi",
  imageUrls: TEST_IMAGES,
  referenceImages: TEST_IMAGES.map((url, idx) => ({
    url,
    label: `Referensi ${idx + 1}`,
    orderIndex: idx,
  })),
};

async function testWhatsAppAutomation() {
  console.log("[TEST] Starting WhatsApp automation test...\n");

  // Generate unique order ID for this test run
  const uniqueOrderId = `DE-88-${Date.now()}`;

  try {
    // Step 1: Dev login untuk mendapatkan session
    console.log("[STEP 1] Dev login...");
    const loginRes = await fetch(`${API_BASE}/api/dev-login?role=Admin&userId=1&businessId=1`, {
      method: "GET",
      redirect: "manual", // Manual redirect handling to capture cookies
    });
    
    // Extract cookies from Set-Cookie header
    const setCookieHeaders = loginRes.headers.getSetCookie?.() || [];
    const loginCookie = setCookieHeaders
      .map((c) => c.split(";")[0]) // Get only cookie name=value, strip attributes
      .join("; ");
    
    if (!loginCookie) {
      throw new Error("No cookies received from dev-login");
    }
    
    console.log(`✓ Dev login successful`);
    console.log(`  Cookies found: ${setCookieHeaders.length}`);
    console.log(`  Cookie: ${loginCookie?.substring(0, 60)}...\n`);

    // Step 2: Create order dengan 3 referensi gambar
    console.log("[STEP 2] Creating order with 3 reference images...");
    console.log(`  Images: ${TEST_IMAGES.join(", ")}`);
    console.log(`  Booking Code: ${ORDER_PAYLOAD.bookingCode}`);
    console.log(`  Customer: ${ORDER_PAYLOAD.customerName} (${ORDER_PAYLOAD.customerPhone})\n`);

    // Create a unique order for this test
    const testOrderPayload = {
      ...ORDER_PAYLOAD,
      id: uniqueOrderId,
    };

    const createRes = await fetch(`${API_BASE}/api/bookings/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: loginCookie || "",
      },
      body: JSON.stringify({
        orders: [testOrderPayload],
        mode: "upsert",
      }),
    });

    const createData = await createRes.json();
    if (!createRes.ok) {
      console.error("✗ Order creation failed:");
      console.error(JSON.stringify(createData, null, 2));
      process.exit(1);
    }

    console.log("✓ Order created successfully");
    console.log(`  Full response:`, JSON.stringify(createData, null, 2));
    console.log(`  upsertedOrderCount: ${createData.data?.upsertedOrderCount}`);
    console.log(`  waNotificationQueued: ${createData.data?.waNotificationQueued}`);
    console.log(`  waNotificationResults: ${createData.data?.waNotificationResults?.length ?? 0}\n`);

    // Step 3: Simulate order confirmation (untuk test automasi order_confirmed juga)
    if (createData.data?.waNotificationResults?.length > 0) {
      console.log("[STEP 3] Testing order_confirmed automation...");
      console.log(`  WA notification already sent in Step 2`);
      console.log(`  Result: ${JSON.stringify(createData.data.waNotificationResults[0], null, 2)}`);
    }

    console.log("\n[TEST] Completed successfully!");
    console.log("Check Fonnte/WhatsApp production group for messages:");
    console.log("  - Should have 1 recap text message");
    console.log("  - Should have 3 image messages with clean captions");
    console.log("  - No hash-like IDs or malformed booking codes");
  } catch (error) {
    console.error("[ERROR]", error.message);
    process.exit(1);
  }
}

testWhatsAppAutomation();
