import { parseWhatsAppOrderText } from "./lib/bookings/whatsapp-parser";

const rawText = `Tanggal Pengiriman 
2 mei 2026

KODE BOOKING :

Order :
- 2 hbq isi 7`;

const parsed = parseWhatsAppOrderText(rawText);
console.log(JSON.stringify(parsed, null, 2));
