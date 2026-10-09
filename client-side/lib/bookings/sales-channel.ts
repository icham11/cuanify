// Order dari menu E-commerce (Tokopedia/Shopee) dibayar lewat platform, bukan uang
// masuk langsung ke toko. Order ini tetap diakui di Total Revenue (tanggal kirim),
// tapi tidak dihitung di Omset Harian maupun laporan Cash Flow.
export function isMarketplaceSalesChannel(
  salesChannel: string | null | undefined,
): boolean {
  const normalized = String(salesChannel || "").trim().toLowerCase();
  return normalized === "tokopedia" || normalized === "shopee";
}
