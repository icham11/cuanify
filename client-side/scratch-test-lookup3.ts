import { allFieldDefinitions, normalizeLabel, escapeRegExp } from "./lib/bookings/whatsapp-parser";

const allAliases = new Set(allFieldDefinitions.flatMap(f => f.aliases.map(normalizeLabel)));

function isKnownRootKey(key: string) {
    return allAliases.has(key);
}

console.log(isKnownRootKey("jumlah bunga")); // Should be true
