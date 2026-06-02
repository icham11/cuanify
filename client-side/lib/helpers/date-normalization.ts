import { format, isValid, parse, startOfDay } from "date-fns";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DMY_DATE_REGEX = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/;
const YMD_SLASH_REGEX = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/;

function normalizeYear(year: number): number {
  if (!Number.isFinite(year)) return year;
  return year < 100 ? 2000 + year : year;
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