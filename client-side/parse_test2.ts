import { BOOKING_ADD_ON_CATALOG } from "./lib/bookings/pricelist";
import { parseWhatsAppOrderText, buildRecapAutoFillItems } from "./lib/bookings/whatsapp-parser";

const text = `REKAP ORDER
ITEM 1

Nama Produk: hard cookies
Harga Satuan: 25.000
Qty: 55pcs
Add On: 55pcs custom card
Subtotal: 1.485.000

ONGKIR:
ADJUSTMENT:
TOTAL: 1.485.000
DP: 
SISA: 

Tanggal Pengiriman : 5 juni 2026

KODE BOOKING : DI-32

Order: 
•  55pcs hard cookies

Design :
•  kelinci
•  penguin
•  beruang
•  anjing
•  ayam
(All design face only)

Jam Pengiriman : 15.00
Metode Pengiriman : Gojek/Grab
Nama penerima : Dini Oktaviani
No. telp penerima : 082125161232
Alamat lengkap : Din`;

const res = parseWhatsAppOrderText(text, { addOnCatalog: BOOKING_ADD_ON_CATALOG });
const items = buildRecapAutoFillItems({
  orderType: res.orderType,
  details: res.details,
  detailsByOrderType: res.detailsByOrderType,
  orderRecapItems: res.orderRecap?.items || [],
});
console.log(JSON.stringify(items[0], null, 2));
