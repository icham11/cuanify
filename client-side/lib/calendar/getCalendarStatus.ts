import {
  BAKERY_BLOCKED_DATES,
  BAKERY_DAILY_PRODUCTION_TOKEN_LIMIT,
  BAKERY_H_MINUS_1_CUTOFF_HOUR,
} from "@/lib/bookings/config";

const BUSINESS_TIME_ZONE = "Asia/Jakarta";

/**
 * Token-based Calendar Status Utility
 *
 * Determines the availability status of a calendar date based on
 * token capacity data. Token system is the ONLY source of truth.
 *
 * Priority order: PAST → FULL → CUTOFF → WARNING → AVAILABLE
 */

export type CalendarStatus =
  | "PAST"
  | "BLOCKED"
  | "AVAILABLE"
  | "WARNING"
  | "FULL"
  | "CUTOFF";

export const DEFAULT_MAX_TOKEN = BAKERY_DAILY_PRODUCTION_TOKEN_LIMIT;

export interface CalendarDayInput {
  usedToken: number;
  maxToken: number;
  /** Date string in YYYY-MM-DD format */
  date: string;
}

interface CalendarStatusOptions {
  blockedDates?: readonly string[];
}

function getDatePartsInTimeZone(
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number; hour: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value || 0);
  const month = Number(parts.find((part) => part.type === "month")?.value || 0);
  const day = Number(parts.find((part) => part.type === "day")?.value || 0);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);

  return { year, month, day, hour };
}

function toDateKey(year: number, month: number, day: number): number {
  return year * 10000 + month * 100 + day;
}

function parseDatePartsFromYmd(
  dateStr: string,
): { year: number; month: number; day: number } | null {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

/**
 * Returns true if dateStr is before today in local timezone.
 */
export function isPastDate(dateStr: string, now: Date = new Date()): boolean {
  const targetParts = parseDatePartsFromYmd(dateStr);
  if (!targetParts) return false;

  const nowParts = getDatePartsInTimeZone(now, BUSINESS_TIME_ZONE);
  const todayKey = toDateKey(nowParts.year, nowParts.month, nowParts.day);
  const targetKey = toDateKey(
    targetParts.year,
    targetParts.month,
    targetParts.day,
  );

  return targetKey < todayKey;
}

/**
 * Checks H-1 cutoff rule using local Date objects.
 *
 * Block only when current time has passed deliveryDate - 1 day at 10:00.
 *
 * Uses local date comparison to avoid timezone shift issues.
 */
function isCutoff(dateStr: string, now: Date = new Date()): boolean {
  const targetParts = parseDatePartsFromYmd(dateStr);
  if (!targetParts) return false;

  const nowParts = getDatePartsInTimeZone(now, BUSINESS_TIME_ZONE);
  const todayUtc = new Date(
    Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day),
  );
  todayUtc.setUTCDate(todayUtc.getUTCDate() + 1);

  const isTomorrow =
    targetParts.year === todayUtc.getUTCFullYear() &&
    targetParts.month === todayUtc.getUTCMonth() + 1 &&
    targetParts.day === todayUtc.getUTCDate();

  if (!isTomorrow) return false;

  return nowParts.hour >= BAKERY_H_MINUS_1_CUTOFF_HOUR;
}

/**
 * Determines the calendar status for a given day based on token capacity.
 *
 * Rules (in priority order):
 * 1. PAST:      date is before today (local timezone)
 * 2. BLOCKED:   date is configured as admin holiday
 * 3. FULL:      usedToken >= maxToken
 * 4. CUTOFF:    now > (deliveryDate - 1 day at cutoff hour)
 * 5. WARNING:   usedToken >= 0.8 * maxToken
 * 6. AVAILABLE: usedToken < 0.8 * maxToken
 *
 * @param day - The capacity data for the day
 * @param now - Optional current date/time for testing (defaults to new Date())
 * @returns CalendarStatus
 */
export function getCalendarStatus(
  day: CalendarDayInput,
  now: Date = new Date(),
  options?: CalendarStatusOptions,
): CalendarStatus {
  const { usedToken, maxToken, date } = day;

  // Priority 1: PAST — always takes highest priority
  if (isPastDate(date, now)) {
    return "PAST";
  }

  // Priority 2: BLOCKED
  const blockedDates = options?.blockedDates ?? BAKERY_BLOCKED_DATES;

  if (blockedDates.includes(date)) {
    return "BLOCKED";
  }

  // Priority 3: FULL
  if (usedToken >= maxToken) {
    return "FULL";
  }

  // Priority 4: CUTOFF — H-1 rule
  if (isCutoff(date, now)) {
    return "CUTOFF";
  }

  // Priority 5: WARNING — 80% threshold
  if (usedToken >= 0.8 * maxToken) {
    return "WARNING";
  }

  // Priority 6: AVAILABLE
  return "AVAILABLE";
}

/**
 * Returns UI properties for a given calendar status.
 */
export function getCalendarStatusUI(status: CalendarStatus): {
  label: string;
  bgClass: string;
  textClass: string;
  disabled: boolean;
} {
  switch (status) {
    case "PAST":
      return {
        label: "Passed",
        bgClass: "bg-gray-200",
        textClass: "text-gray-600",
        disabled: true,
      };
    case "BLOCKED":
      return {
        label: "Libur",
        bgClass: "bg-rose-200",
        textClass: "text-rose-700",
        disabled: true,
      };
    case "FULL":
      return {
        label: "Full",
        bgClass: "bg-red-500",
        textClass: "text-white",
        disabled: true,
      };
    case "CUTOFF":
      return {
        label: "Closed (H-1)",
        bgClass: "bg-striped-cutoff",
        textClass: "text-rose-700",
        disabled: true,
      };
    case "WARNING":
      return {
        label: "Almost Full",
        bgClass: "bg-yellow-100",
        textClass: "text-amber-800",
        disabled: false,
      };
    case "AVAILABLE":
    default:
      return {
        label: "",
        bgClass: "",
        textClass: "text-gray-700",
        disabled: false,
      };
  }
}
