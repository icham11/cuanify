import { parseWhatsAppOrderText, buildBookingAutoFillFromParsed } from "./lib/bookings/whatsapp-parser";
import { BOOKING_PRODUCT_CATALOG } from "./lib/bookings/pricelist";

const text1 = `
Format Order
Nama penerima : ian
No. telp penerima : 08123456789
Alamat lengkap : sunter
Tanggal Pengiriman : 4 juni 2026
Jam Pengiriman : 09:00
Order: Hand Bouquet (7-10 pcs)
`;

const text2 = `
Nama: ian
Order:
10x Hand Bouquet
`;

const text3 = `
Order:
1x Hand Bouquet (7-10 pcs)
`;

console.log("=== TEXT 1 ===");
let parsed1 = parseWhatsAppOrderText(text1, { orderType: "unknown", sourceType: "CAPTION" });
console.log(JSON.stringify(buildBookingAutoFillFromParsed(parsed1, { productCatalog: BOOKING_PRODUCT_CATALOG }).items, null, 2));

console.log("=== TEXT 2 ===");
let parsed2 = parseWhatsAppOrderText(text2, { orderType: "unknown", sourceType: "CAPTION" });
console.log(JSON.stringify(buildBookingAutoFillFromParsed(parsed2, { productCatalog: BOOKING_PRODUCT_CATALOG }).items, null, 2));

console.log("=== TEXT 3 ===");
let parsed3 = parseWhatsAppOrderText(text3, { orderType: "unknown", sourceType: "CAPTION" });
console.log(JSON.stringify(buildBookingAutoFillFromParsed(parsed3, { productCatalog: BOOKING_PRODUCT_CATALOG }).items, null, 2));

const text4 = `
Order:
10 Hand Bouquet (7-10 pcs)
`;
console.log("=== TEXT 4 ===");
let parsed4 = parseWhatsAppOrderText(text4, { orderType: "unknown", sourceType: "CAPTION" });
console.log(JSON.stringify(buildBookingAutoFillFromParsed(parsed4, { productCatalog: BOOKING_PRODUCT_CATALOG }).items, null, 2));
