/**
 * Order lama (backfill): order yang diinput admin dengan tanggal kirim lebih dari
 * 1 bulan sebelum tanggal input. Order seperti ini hanya pencatatan historis —
 * langsung berstatus Completed dan tidak dihitung di cashflow / omzet harian,
 * agar tidak tercampur dengan uang masuk yang sebenarnya.
 */
export const LEGACY_BACKFILL_MIN_AGE_MONTHS = 1;

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function toJakartaDateKeyFromTimestamp(
  value: string | Date | null | undefined,
): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : "";
}

function toDateKey(value: string | Date | null | undefined): string {
  if (value instanceof Date) return toJakartaDateKeyFromTimestamp(value);
  const raw = String(value || "").trim();
  const prefix = raw.slice(0, 10);
  if (raw.length === 10 && DATE_KEY_PATTERN.test(prefix)) return prefix;
  return toJakartaDateKeyFromTimestamp(raw);
}

/**
 * Batas tanggal kirim: mundur N bulan kalender dari tanggal input.
 * Tanggal di-clamp ke akhir bulan (mis. 31 Mar → 28/29 Feb).
 */
export function getLegacyBackfillCutoffDateKey(inputDateKey: string): string {
  const match = DATE_KEY_PATTERN.exec(inputDateKey);
  if (!match) return "";

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1 - LEGACY_BACKFILL_MIN_AGE_MONTHS;
  const day = Number(match[3]);
  const lastDayOfTargetMonth = new Date(
    Date.UTC(year, monthIndex + 1, 0),
  ).getUTCDate();
  const cutoff = new Date(
    Date.UTC(year, monthIndex, Math.min(day, lastDayOfTargetMonth)),
  );
  return cutoff.toISOString().slice(0, 10);
}

/**
 * @param deliveryDate tanggal kirim order (YYYY-MM-DD)
 * @param inputAt waktu order diinput (createdAt). Kosong → dianggap bukan order lama.
 */
export function isLegacyBackfillOrder(
  deliveryDate: string | Date | null | undefined,
  inputAt: string | Date | null | undefined,
): boolean {
  const deliveryDateKey = toDateKey(deliveryDate);
  const inputDateKey = toDateKey(inputAt);
  if (!deliveryDateKey || !inputDateKey) return false;

  const cutoffDateKey = getLegacyBackfillCutoffDateKey(inputDateKey);
  return Boolean(cutoffDateKey) && deliveryDateKey < cutoffDateKey;
}
