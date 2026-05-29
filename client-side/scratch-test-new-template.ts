import { parseWhatsAppOrderText } from "./lib/bookings/whatsapp-parser";
import { buildCaptionItems } from "./lib/bookings/order-api-helpers";
import { buildOrderDeliveryDetailsWhatsAppText } from "./lib/bookings/whatsapp-message-template";

const rawText = `Tanggal Pengiriman 
2 agustus 2026

KODE BOOKING :

Order :
- 3 hbq isi 8

Design 1 : 
- pokemon mix
Design 2 :
1. miffy muka coklat
2. miffy pita biru kecil
3. miffy pita pink kecil
4. miffy blush on
5. miffy putih polos
6. miffy putih baju biru (half body)
7. miffy polos mulut x

Warna kertas bouquet : 
Design 1 (pokemon) : wrapping paper 1, ribbon 8
Design 2 (miffy) : wrapping paper 4, ribbon 1

Jumlah Bunga : 3
Warna Bunga : 
Design 1 (pokemon) : yellow white
Design 2 (miffy) : pink white

Kartu ucapan : 
Design 1 (pokemon) : keep going, big boy!
Design 2 (miffy) : happy graduation, big girl!

Jam Pengiriman : 
Metode Pengiriman pickup
Nama Penerima : Feli
No telp Penerima : 0818518354
Alamat Lengkap :
Wisata bukit mas D2 no 5
Cluster madrid Surabaya barat
Kode pos : 60213`;

const parsed = parseWhatsAppOrderText(rawText);

console.log("=== HASIL PARSING ===");
console.log(JSON.stringify(parsed, null, 2));

// Simulasi ke WA text
const order = {
  internalOrderId: "123",
  deliveryDate: "2026-08-02",
  bookingCode: "", // KODE BOOKING KOSONG
  deliveryTime: "",
  shippingMethod: "Pickup",
  recipientName: "Feli",
  recipientPhone: "0818518354",
  fullAddress: "Wisata bukit mas D2 no 5 | Cluster madrid Surabaya barat",
  postalCode: "60213",
  items: [
    {
      productName: "Hand Bouquet (7-10 pcs)",
      quantity: 3,
      productType: "BOUQUET",
      notes: `Design: ${parsed.details.bouquetDesign}\n` +
             `Warna kertas bouquet: ${parsed.details.bouquetPaperColor}\n` +
             `Jumlah Bunga: ${parsed.details.flowerCount}\n` +
             `Warna Bunga: ${parsed.details.flowerColor}\n` +
             `Kartu ucapan: ${parsed.details.greetingCard}`
    }
  ],
  whatsAppParsedData: {
    orderType: "bouquet"
  }
};

const captionItems = buildCaptionItems(order as any);

const waText = buildOrderDeliveryDetailsWhatsAppText({
  items: captionItems,
  deliveryDate: order.deliveryDate,
  bookingCode: order.bookingCode, // Ini akan kosong dan trigger fallback
  deliveryTime: order.deliveryTime,
  shippingMethod: order.shippingMethod || "-",
  recipientName: order.recipientName || "-",
  recipientPhone: order.recipientPhone || "-",
  fullAddress: order.fullAddress || "-",
  postalCode: order.postalCode,
});

console.log("\n=== FINAL WHATSAPP MESSAGE ===");
console.log(waText);
