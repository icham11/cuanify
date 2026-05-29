import { parseWhatsAppOrderText } from "./lib/bookings/whatsapp-parser";

const text = `Tanggal Pengiriman 
2 mei 2026

KODE BOOKING :

Order :
- 2 hbq isi 7
`;

const parsed = parseWhatsAppOrderText(text);
console.log("Order Type:", parsed.orderType);
