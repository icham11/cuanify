import { parseWhatsAppOrderText } from "./lib/bookings/whatsapp-parser";
import { chooseCatalogSelection } from "./lib/bookings/whatsapp-parser";
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
console.log(chooseCatalogSelection(parsed, { productCatalog: BOOKING_PRODUCT_CATALOG }));
