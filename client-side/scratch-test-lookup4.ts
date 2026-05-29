import { parseWhatsAppOrderText } from "./lib/bookings/whatsapp-parser";

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
`;

const lines = text.split("\n");

// Recreate buildKeyValueLookup logic here to debug
function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

let currentParentKey = "";
lines.forEach((line, index) => {
    if (!line.trim()) {
        console.log(`[EMPTY LINE] Resetting parent key`);
        currentParentKey = "";
        return;
    }
    const match = line.match(/^(.{2,80}?)\s*[:=-]\s*(.*)$/);
    if (!match) return;

    const rawKey = match[1] ?? "";
    const rawValue = match[2] ?? "";
    const key = normalizeLabel(rawKey);
    console.log(`[KEY] ${key} | [VALUE] ${rawValue} | [CURRENT PARENT] ${currentParentKey}`);
    
    if (!rawValue.trim()) {
       currentParentKey = key + " ";
    }
});

