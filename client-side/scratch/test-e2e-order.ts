import { POST } from "../app/api/bookings/orders/route";
import { NextRequest } from "next/server";
import * as SessionAuth from "../lib/auth/session";

jest = require("jest-mock");

// Mock Auth
jest.spyOn(SessionAuth, "requireAuth").mockResolvedValue({
  businessId: 1,
  userId: 1,
  role: "admin",
});

const exampleOrder = {
  id: "test-order-12345",
  bookingCode: "TEST-E2E-001",
  resi: "",
  customerName: "Customer E2E Test",
  customerPhone: "081234567890",
  customerAddress: "Jl. Test No 123",
  deliveryDate: "2026-05-30",
  deliverySlot: "10:00",
  notes: "Test e2e notes",
  basePrice: 500000,
  addOnTotal: 0,
  deliveryFee: 15000,
  manualAdjustment: 0,
  dpPaidAmount: 515000,
  finalPaidAmount: 515000,
  totalPaidAmount: 515000,
  downPaymentAmount: 515000,
  remainingBalance: 0,
  product: "Test Cake E2E",
  totalPrice: 515000,
  sales_channel: "direct",
  paymentStatus: "Paid",
  orderStatus: "Completed",
  assignedStaffUserId: null,
  assignedStaffName: "",
  productionAssignedAt: null,
  shippingQuote: null,
  shipment: null,
  simulations: null,
  whatsAppParsedData: null,
  imageUrl: "",
  imageUrls: [
    "https://res.cloudinary.com/demo/image/upload/sample.jpg"
  ],
  referenceImages: [
    {
      url: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
      label: "Custom Design E2E",
    },
  ],
  statusHistory: [],
  automationLogs: [],
  paymentTransactions: [],
  productionStages: [],
  items: [
    {
      productName: "Test Cake E2E",
      unitPrice: 500000,
      quantity: 1,
      subtotal: 500000,
      orderLabel: "Test Cake E2E",
      detailLines: [
        { label: "Nama di Cake", value: "E2E Testing" },
        { label: "Ukuran cake", value: "D16-T10" }
      ],
    }
  ],
  deliveryAddresses: [],
};

async function runE2E() {
  console.log("=== Memulai E2E Test POST /api/bookings/orders ===");
  const req = new NextRequest("http://localhost:3000/api/bookings/orders", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      orders: [exampleOrder],
      skipWhatsAppNotification: false
    })
  });
  
  const response = await POST(req);
  console.log("Status:", response.status);
  const data = await response.json();
  console.log("Response Body:", JSON.stringify(data, null, 2));
}

runE2E();
