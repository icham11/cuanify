import { parseWhatsAppOrderText, buildBookingAutoFillFromParsed } from "./lib/bookings/whatsapp-parser";
import { BOOKING_PRODUCT_CATALOG } from "./lib/bookings/pricelist";

const text = `
Nama penerima : ian
No. telp penerima : 08123456789
Tanggal Pengiriman : 4 juni 2026
Jam Pengiriman : 09:00
Order:
Hand Bouquet (7-10 pcs)
`;

const parsed = parseWhatsAppOrderText(text, { orderType: "unknown", sourceType: "CAPTION" });
const autofill = buildBookingAutoFillFromParsed(parsed, { productCatalog: BOOKING_PRODUCT_CATALOG });
console.log(JSON.stringify(autofill.items, null, 2));
