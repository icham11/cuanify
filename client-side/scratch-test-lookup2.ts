function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
}

function buildKeyValueLookup(lines: string[]): Map<string, string> {
  const lookup = new Map<string, string>();
  let currentParentKey = "";

  lines.forEach((line, index) => {
    const match = line.match(/^(.{2,80}?)\s*[:=-]\s*(.*)$/);
    if (!match) return;

    const rawKey = match[1] ?? "";
    const rawValue = match[2] ?? "";
    const key = normalizeLabel(rawKey);
    if (!key) return;

    let value = rawValue.trim();

    if (!value && !rawValue) {
       currentParentKey = key + " ";
    }

    if (!lookup.has(key) || value) {
      lookup.set(key, value);
    }
    
    if (currentParentKey && currentParentKey !== key + " ") {
      lookup.set(currentParentKey + key, value);
    }
  });

  return lookup;
}

const lines = `
Design 1 : 
- pokemon mix
Design 2 :
1. miffy muka coklat

Warna kertas bouquet : 
Design 1 (pokemon) : wrapping paper 1, ribbon 8
Design 2 (miffy) : wrapping paper 4, ribbon 1

Kartu ucapan : 
Design 1 (pokemon) : keep going, big boy!
Design 2 (miffy) : happy graduation, big girl!
`.split("\n");

const lookup = buildKeyValueLookup(lines);

console.log("LOOKUP:");
for (const [k, v] of lookup.entries()) {
    console.log(`"${k}" -> "${v}"`);
}

function getMatches(alias: string) {
    const matchedValues = [];
    for (const [key, value] of lookup.entries()) {
      const isDesign = alias === "design" || alias === "desain";
      const aliasPatternStr = escapeRegExp(alias).replace(/\s+/g, "\\s+");
      const isMatch = isDesign 
         ? (key === alias || new RegExp(`^${aliasPatternStr}\\s+\\d+$`).test(key))
         : (key === alias || key.startsWith(alias + " "));
      
      if (isMatch) {
        const prefix = key === alias ? "" : key.substring(alias.length).trim() + " : ";
        matchedValues.push(prefix ? `${prefix}\n${value}` : value);
      }
    }
    return matchedValues.join(" | ");
}

console.log("\nMATCHES:");
console.log("design:", getMatches("design"));
console.log("warna kertas bouquet:", getMatches("warna kertas bouquet"));
console.log("kartu ucapan:", getMatches("kartu ucapan"));
