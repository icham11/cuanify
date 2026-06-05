import { buildProductionCaption } from "../lib/whatsapp/sendOrderToWhatsApp";
import { toWhatsAppPayload } from "../lib/bookings/order-api-helpers";

const order = {
  id: "test-123",
  bookingCode: "TEST-001",
  customerName: "Budi",
  customerPhone: "081234567890",
  deliveryDate: "2026-06-10",
  deliverySlot: "12:00",
  orderStatus: "In Production",
  product: "Custom Cake",
  notes: "Kue tema superhero",
  items: [
    {
      productName: "Custom Cake 20cm",
      quantity: 1,
      selectedPrice: 500000,
    }
  ],
  deliveryAddresses: [
    { addressLine: "Jl. Merdeka No 1" }
  ],
  referenceImages: [
    { url: "http://example.com/img1.jpg", label: "Gambar 1: Spiderman untuk bagian atas kue" },
    { url: "http://example.com/img2.jpg", label: "Gambar 2: Contoh tulisan ucapan Happy Birthday" },
    { url: "http://example.com/img3.jpg", label: "Gambar 3: Warnanya dominan merah biru" }
  ]
};

const payload = toWhatsAppPayload(order as any);
console.log("=== PAYLOAD DESIGN NOTES ===");
console.log(payload.designNotes);
console.log("\n=== FULL WHATSAPP CAPTION ===");
const caption = buildProductionCaption(payload);
console.log(caption);
