const text = "Hand Bouquet (7-10 pcs)";
const keywordPattern = "hbq|sbq|hand\\s+bouquet|standing\\s+bouquet|standing\\s+bucket|bucket|bouquet|buket";
const after = text.match(
    new RegExp(
      `(?:${keywordPattern})\\b\\s*(?:qty|jumlah|x)?\\s*[:=\\-]?\\s*(\\d{1,4})\\b`,
      "i",
    ),
  );
console.log("AFTER:", after);
