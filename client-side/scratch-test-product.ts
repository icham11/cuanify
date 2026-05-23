import { parseWhatsAppOrderText } from "./lib/bookings/whatsapp-parser";

const rawText = `[WA Parser] Data Cake
Tanggal Pengiriman: 12 Jan 2026
Order: Custom Cake
Jam Pengiriman: 10:00
Nama penerima: Budi
No. telp penerima: 08123456789
Alamat lengkap: Jl. ABC No 123

Nama di Cake: Happy Birthday
Umur di cake: 2
Ukuran cake: D15
Rasa cake: Vanilla
Design cake:
1. Lencana zootopia police
2. Shape kotak background ungu gambar judy
3. Background hijau gambar nick
4. Angka 2 dengan detail wortel dan paw , angka 2 warna pink
5. Shape seperti contoh yg warna pink , background ungu , dengan tulisan Jolene is two sweet warna pink

REKAP ORDER
1. Cake
Qty: 1
Size: D15
Design: Sesuai referensi
Harga Satuan: 200000
Subtotal: 200000`;

console.log("=== Testing parseWhatsAppOrderText ===");
const result = parseWhatsAppOrderText(rawText);

console.log("\nDetails (Cake):");
console.log("cakeDesign =>");
console.log(result.details.cakeDesign);

console.log("\nRecap Items:");
console.log(result.orderRecap?.items.map(i => `${i.quantity}x ${i.productName}`).join(", "));
