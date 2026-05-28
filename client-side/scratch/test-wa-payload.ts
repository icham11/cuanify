import { sendOrderToWhatsApp } from "../lib/whatsapp/sendOrderToWhatsApp";
import * as SendWA from "../lib/whatsapp/sendWhatsApp";
import dotenv from "dotenv";

dotenv.config();

// Override fungsi secara manual (tanpa jest)
const originalSend = SendWA.sendOutboundWhatsAppSequence;
(SendWA as any).sendOutboundWhatsAppSequence = async (messages: any) => {
  console.log("\n[MOCK] sendOutboundWhatsAppSequence dipanggil dengan pesan:");
  console.log(JSON.stringify(messages, null, 2));
};

const examplePayload = {
  customerName: "Deni",
  phone: "085776999088",
  deliveryDate: "2026-05-09",
  deliveryTime: "20.00",
  item: "1x Real Cake (D14-T10)",
  notes: "",
  address: "Jl. Pademangan 3 Gang 3 A No 45",
  bookingCode: "DE088-090526-001",
  recipientName: "Deni",
  recipientPhone: "085776999088",
  shippingMethod: "gosend",
  fullAddress: "Jl. Pademangan 3 Gang 3 A No 45",
  captionItems: [
    {
      productName: "Real Cake (D14-T10)",
      unitPrice: 610000,
      quantity: 1,
      subtotal: 610000,
      orderLabel: "Real Cake (D14-T10)",
      detailLines: [
        { label: "Nama di Cake", value: "Happy Birth Day Ayangku🩷" },
        { label: "Umur di cake", value: "26" },
        { label: "Ukuran cake", value: "D14-T10" },
        { label: "Rasa cake", value: "Double choco" },
      ],
    },
  ],
  imageUrl: "",
  imageUrls: [
    "https://res.cloudinary.com/demo/image/upload/sample.jpg" // Gambar dummy
  ],
  referenceImages: [
    {
      url: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
      label: "Design Custom",
    },
  ],
};

async function test() {
  console.log("=== Menguji pembuatan payload WA ===");
  const result = await sendOrderToWhatsApp(examplePayload as any);
  console.log("Hasil:", result);
}

test();
