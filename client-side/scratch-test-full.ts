import { parseWhatsAppOrderText, buildBookingAutoFillFromParsed } from "./lib/bookings/whatsapp-parser";

const text = `Tanggal Pengiriman 
2 mei 2026

KODE BOOKING :

Order :
- 2 hbq isi 7

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
Metode Pengiriman : paxel by crumbella + wrap
Nama Penerima : Feli
No telp Penerima : 0818518354
Alamat Lengkap :
Wisata bukit mas D2 no 5
Cluster madrid Surabaya barat
Kode pos :60213
`;

const parsed = parseWhatsAppOrderText(text);
const autofill = buildBookingAutoFillFromParsed(parsed);

console.log("=== MISSING FIELDS ===");
console.log(parsed.missingFields);

console.log("\n=== FORM AUTO FILL ITEMS ===");
console.log(JSON.stringify(autofill.items, null, 2));

console.log("\n=== DETAILS ===");
console.log(JSON.stringify(parsed.details, null, 2));
