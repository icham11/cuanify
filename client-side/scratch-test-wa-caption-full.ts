import { buildCaptionItems } from "./lib/bookings/order-api-helpers";
import { buildOrderDeliveryDetailsWhatsAppText } from "./lib/bookings/whatsapp-message-template";

const order: any = {
  internalOrderId: "123",
  deliveryDate: "2026-05-02",
  bookingCode: "", // KODE BOOKING KOSONG
  deliveryTime: "10.00",
  shippingMethod: "Paxel (dibantu admin)",
  recipientName: "Feli",
  recipientPhone: "0818518354",
  fullAddress: "Wisata bukit mas D2 no 5 | Cluster madrid Surabaya barat",
  postalCode: "60213",
  items: [
    {
      productName: "Hand Bouquet (7-10 pcs)",
      quantity: 2,
      productType: "BOUQUET",
      notes: "Design: 1 : pokemon mix\n2 : 1. miffy muka coklat\nWarna kertas bouquet: design 1 pokemon : wrapping paper 1, ribbon 8 | design 2 miffy : wrapping paper 4, ribbon 1\nJumlah Bunga: 3\nKartu ucapan: design 1 pokemon : keep going, big boy! | design 2 miffy : happy graduation, big girl!"
    }
  ],
  whatsAppParsedData: {
    orderType: "bouquet"
  }
};

const captionItems = buildCaptionItems(order);

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

console.log("=== FINAL WHATSAPP MESSAGE ===");
console.log(waText);
