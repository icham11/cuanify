import { parseWhatsAppOrderText, buildBookingAutoFillFromParsed } from "./lib/bookings/whatsapp-parser";
import { BOOKING_PRODUCT_CATALOG } from "./lib/bookings/pricelist";

const text = `
REKAP ORDER
ITEM 1

Nama Produk: expert cookies
Harga Satuan: 35.000
Qty: 20
Add On:
3 design 30k
Subtotal: 730.000

ONGKIR:
ADJUSTMENT:
TOTAL: 730.000
DP:
SISA:

Tanggal Pengiriman : 4 juni 2026

KODE BOOKING :

Order: 
•  20pcs expert cookies

Design :
•  8 design digimon half and full body sesuai foto

Jam Pengiriman :
Metode Pengiriman :
Nama penerima : willy
No. telp penerima : +62 811-9187-177
Alamat lengkap :
Kode pos :
`;

const parsed = parseWhatsAppOrderText(text, { orderType: "cookies", sourceType: "CAPTION" });
const autofill = buildBookingAutoFillFromParsed(parsed, { productCatalog: BOOKING_PRODUCT_CATALOG });
console.log(JSON.stringify(autofill.items, null, 2));
