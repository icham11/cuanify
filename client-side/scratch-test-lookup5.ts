import { allFieldDefinitions, recapItemFieldDefinitions, normalizeLabel } from "./lib/bookings/whatsapp-parser";

const allAliases = new Set([
  ...allFieldDefinitions.flatMap(f => f.aliases.map(normalizeLabel)),
  ...recapItemFieldDefinitions.flatMap(f => f.aliases.map(normalizeLabel))
]);

console.log("Root aliases count:", allAliases.size);
console.log("Has 'jumlah bunga'?", allAliases.has("jumlah bunga"));
