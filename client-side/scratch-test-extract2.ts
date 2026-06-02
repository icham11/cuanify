function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
}

function extractQuantityForKeywords(
  value: string,
  keywords: string[],
): number | null {
  const text = value.trim();
  if (!text || keywords.length === 0) return null;

  const keywordPattern = keywords
    .map((keyword) => escapeRegExp(keyword).replace(/\s+/g, "\\s+"))
    .join("|");

  const before = text.match(
    new RegExp(
      `(\\d{1,4})\\s*(?:x\\s*)?(?:pcs?|pc|box|pack|pkt|paket|dozen|lusin)?\\s*(?:${keywordPattern})\\b`,
      "i",
    ),
  );
  
  if (before?.[1]) {
    const parsed = Number(before[1]);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  const after = text.match(
    new RegExp(
      `(?:${keywordPattern})\\b\\s*(?:qty|jumlah|x)?\\s*[:=\\-]?\\s*(\\d{1,4})\\b`,
      "i",
    ),
  );
  if (after?.[1]) {
    const parsed = Number(after[1]);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

console.log("For 'Hand Bouquet (7-10 pcs)':", extractQuantityForKeywords("Hand Bouquet (7-10 pcs)", ["hbq","sbq","hand bouquet","standing bouquet","standing bucket","bucket","bouquet","buket"]));
const text = "Hand Bouquet (7-10 pcs)";
const keywordPattern = "hbq|sbq|hand\\s+bouquet|standing\\s+bouquet|standing\\s+bucket|bucket|bouquet|buket";
const after = text.match(
    new RegExp(
      `(?:${keywordPattern})\\b(?:[^0-9]*)(\\d{1,4})\\b`,
      "i",
    ),
  );
console.log("TEST:", after);
