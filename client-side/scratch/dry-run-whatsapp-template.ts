import { parseWhatsAppOrderText, buildBookingAutoFillFromParsed } from '../lib/bookings/whatsapp-parser';

const text = `
REKAP ORDER
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
•  55pcs custom card (design c , EXO PLANET #6
EXhOrizon in JAKARTA)

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
Alamat lengkap : Dini Oktaviani
Jl. Kayu Manis VI No. 31 RT 03/05
Kel. Kayu Manis Kec. Matraman, Jakarta Timur
Kode pos : 13130
`;

const parsed = parseWhatsAppOrderText(text);
const autofill = buildBookingAutoFillFromParsed(parsed);
console.log(JSON.stringify(autofill.items, null, 2));

