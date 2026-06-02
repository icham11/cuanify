import { parseWhatsAppOrderText } from "./lib/bookings/whatsapp-parser";

const text = `
Nama penerima : ian
Order:
10x Hand Bouquet (7-10 pcs)
`;

const parsed = parseWhatsAppOrderText(text, { orderType: "unknown", sourceType: "CAPTION" });
console.log(JSON.stringify(parsed, null, 2));
