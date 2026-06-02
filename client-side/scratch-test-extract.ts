function extractOrderQuantity(value: string): number | null {
  const text = value.trim();
  if (!text) return null;

  const parseMatchedQuantity = (matched: RegExpMatchArray | null) => {
    const rawQuantity = matched?.[1];
    if (!rawQuantity) return null;

    const quantity = Number(rawQuantity);
    if (Number.isInteger(quantity) && quantity > 0) {
      return quantity;
    }

    return null;
  };

  const bouquetContextual = parseMatchedQuantity(
    text.match(
      /(?:hbq|sbq|hand\s*bouquet|standing\s*bouquet|standing\s*bucket|bucket|bouquet|buket)\b(?:\s+(?:qty|jumlah|x))\s*[:=\-]?\s*(\d{1,4})\b/i,
    ),
  );
  if (bouquetContextual) return bouquetContextual;

  const explicitContextual = parseMatchedQuantity(
    text.match(
      /(?:qty|quantity|jumlah|order|pesan|x)\s*(?:cookies?|cookie|bunga|bouquet|buket|hbq|sbq|pcs?|pc|box|pack|pkt|paket|dozen|lusin)?\s*[:=\-]?\s*(\d{1,4})\b/i,
    ),
  );
  if (explicitContextual) return explicitContextual;

  const explicit = text.match(
    /(?:qty|jumlah|order|pesan|x)\s*[:=\-]?\s*(\d{1,4})\b/i,
  );
  const explicitQuantity = parseMatchedQuantity(explicit);
  if (explicitQuantity) return explicitQuantity;

  const withUnit = text.match(
    /(?<![-\d~]\s*)\b(\d{1,4})\s*(box|pack|pkt|paket|pcs|pc|dozen|lusin)\b/i,
  );
  const unitQuantity = parseMatchedQuantity(withUnit);
  if (unitQuantity) return unitQuantity;

  const startQty = text.match(/^(\d{1,4})\s+[a-z]/i);
  const startQuantity = parseMatchedQuantity(startQty);
  if (startQuantity) return startQuantity;

  return null;
}
console.log("For 'Hand Bouquet (7-10 pcs)':", extractOrderQuantity("Hand Bouquet (7-10 pcs)"));
console.log("For '10x Hand Bouquet (7-10 pcs)':", extractOrderQuantity("10x Hand Bouquet (7-10 pcs)"));
