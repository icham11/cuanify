import { format, isValid, parse, startOfDay } from "date-fns";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DMY_DATE_REGEX = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/;
const YMD_SLASH_REGEX = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/;
const DAY_MONTH_WORD_YEAR_REGEX =
  /^(\d{1,2})(?:[/-]|\s+)([a-zA-Z]+)(?:[/-]|\s+)(\d{2,4})$/i;
const MONTH_WORD_DAY_YEAR_REGEX =
  /^([a-zA-Z]+)\s+(\d{1,2})(?:,)?\s+(\d{2,4})$/i;
const BOOKING_REFERENCE_DATE_REGEX = /-(\d{2})(\d{2})(\d{2})-(\d{3})$/;

const MONTH_MAP: Record<string, number> = {
  jan: 1,
  januari: 1,
  feb: 2,
  februari: 2,
  mar: 3,
  maret: 3,
  apr: 4,
  april: 4,
  mei: 5,
  jun: 6,
  juni: 6,
  jul: 7,
  juli: 7,
  agu: 8,
  agustus: 8,
  agt: 8,
  aug: 8,
  august: 8,
  sep: 9,
  september: 9,
  oct: 10,
  okt: 10,
  oktober: 10,
  nov: 11,
  november: 11,
  dec: 12,
  des: 12,
  desember: 12,
};

function normalizeYear(year: number): number {
  if (!Number.isFinite(year)) return year;
  return year < 100 ? 2000 + year : year;
}

function normalizeMonthLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .trim();
}

function isStrictIsoDate(value: string): boolean {
  if (!ISO_DATE_REGEX.test(value)) return false;
  const parsed = parse(value, "yyyy-MM-dd", new Date());
  if (!isValid(parsed)) return false;
  return format(parsed, "yyyy-MM-dd") === value;
}

export function toIsoDateString(value: Date): string {
  return format(value, "yyyy-MM-dd");
}

export function normalizeDateInput(value: unknown): string | null {
  if (value instanceof Date) {
    if (!isValid(value)) return null;
    return format(value, "yyyy-MM-dd");
  }
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;

  if (isStrictIsoDate(raw)) {
    return raw;
  }

  if (raw.includes("T")) {
    const parsed = new Date(raw);
    if (isValid(parsed)) return format(parsed, "yyyy-MM-dd");
  }

  const ymdWithSlash = raw.match(YMD_SLASH_REGEX);
  if (ymdWithSlash?.[1] && ymdWithSlash[2] && ymdWithSlash[3]) {
    const year = Number(ymdWithSlash[1]);
    const month = Number(ymdWithSlash[2]);
    const day = Number(ymdWithSlash[3]);
    const candidate = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return isStrictIsoDate(candidate) ? candidate : null;
  }

  const dmy = raw.match(DMY_DATE_REGEX);
  if (dmy?.[1] && dmy[2] && dmy[3]) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = normalizeYear(Number(dmy[3]));
    const candidate = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return isStrictIsoDate(candidate) ? candidate : null;
  }

  const dayMonthWordYear = raw.match(DAY_MONTH_WORD_YEAR_REGEX);
  if (dayMonthWordYear?.[1] && dayMonthWordYear[2] && dayMonthWordYear[3]) {
    const day = Number(dayMonthWordYear[1]);
    const month = MONTH_MAP[normalizeMonthLabel(dayMonthWordYear[2])];
    const year = normalizeYear(Number(dayMonthWordYear[3]));
    if (month) {
      const candidate = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      return isStrictIsoDate(candidate) ? candidate : null;
    }
  }

  const monthWordDayYear = raw.match(MONTH_WORD_DAY_YEAR_REGEX);
  if (monthWordDayYear?.[1] && monthWordDayYear[2] && monthWordDayYear[3]) {
    const month = MONTH_MAP[normalizeMonthLabel(monthWordDayYear[1])];
    const day = Number(monthWordDayYear[2]);
    const year = normalizeYear(Number(monthWordDayYear[3]));
    if (month) {
      const candidate = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      return isStrictIsoDate(candidate) ? candidate : null;
    }
  }

  return null;
}

export function parseSafeDate(dateStr: string): Date | null {
  const normalized = normalizeDateInput(dateStr);
  if (!normalized) return null;

  const parsed = parse(normalized, "yyyy-MM-dd", new Date());
  if (!isValid(parsed)) return null;
  if (format(parsed, "yyyy-MM-dd") !== normalized) return null;

  return startOfDay(parsed);
}

export function getIsoMonthKey(value: unknown): string | null {
  const normalized = normalizeDateInput(value);
  if (!normalized) return null;

  const match = normalized.match(/^(\d{4})-(\d{2})-\d{2}$/);
  if (!match?.[1] || !match[2]) return null;
  return `${match[1]}-${match[2]}`;
}

export function isDateInPreviousMonth(
  value: unknown,
  referenceDate: Date = new Date(),
): boolean {
  const monthKey = getIsoMonthKey(value);
  if (!monthKey) return false;

  return monthKey < format(referenceDate, "yyyy-MM");
}

export function extractIsoDateFromBookingReference(value: unknown): string {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) return "";

  const match = normalized.match(BOOKING_REFERENCE_DATE_REGEX);
  if (!match?.[1] || !match[2] || !match[3]) {
    return "";
  }

  const [, day, month, year] = match;
  return normalizeDateInput(`20${year}-${month}-${day}`) ?? "";
}

export function normalizeDateOrThrow(
  dateStr: unknown,
  fieldLabel = "date",
): string {
  const normalized = normalizeDateInput(dateStr);
  if (!normalized) {
    throw new Error(
      `Invalid ${fieldLabel} format: ${String(dateStr)}. Expected YYYY-MM-DD.`,
    );
  }
  return normalized;
}
