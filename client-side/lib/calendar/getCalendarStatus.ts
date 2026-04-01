/**
 * Token-based Calendar Status Utility
 *
 * Determines the availability status of a calendar date based on
 * token capacity data. Token system is the ONLY source of truth.
 *
 * Priority order: PAST → FULL → CUTOFF → WARNING → AVAILABLE
 */

import { BAKERY_DAILY_PRODUCTION_TOKEN_LIMIT } from "@/lib/bookings/config";

export type CalendarStatus =
  | "PAST"
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

function parseLocalDateOnly(dateStr: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const parsed = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

/**
 * Returns true if dateStr is before today in local timezone.
 */
export function isPastDate(dateStr: string, now: Date = new Date()): boolean {
  const target = parseLocalDateOnly(dateStr);
  if (!target) return false;

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  return target.getTime() < today.getTime();
}

/**
 * Checks if a given date string (YYYY-MM-DD) is tomorrow relative to `now`,
 * AND the current time is >= 10:00 (H-1 cutoff rule).
 *
 * Uses local date comparison to avoid timezone shift issues.
 */
function isCutoff(dateStr: string, now: Date = new Date()): boolean {
  // Parse the date string as local date (no timezone shift)
  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return false;
  }

  // Create a proper tomorrow date to handle month/year rollover
  const tomorrowDate = new Date(now);
  tomorrowDate.setHours(0, 0, 0, 0);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);

  const isTomorrow =
    year === tomorrowDate.getFullYear() &&
    month === tomorrowDate.getMonth() + 1 &&
    day === tomorrowDate.getDate();

  if (!isTomorrow) return false;

  // Check if current time is >= 10:00
  return now.getHours() >= 10;
}

/**
 * Determines the calendar status for a given day based on token capacity.
 *
 * Rules (in priority order):
 * 1. PAST:      date is before today (local timezone)
 * 2. FULL:      usedToken >= maxToken
 * 3. CUTOFF:    date is tomorrow AND current time >= 10:00
 * 4. WARNING:   usedToken >= 0.8 * maxToken
 * 5. AVAILABLE: usedToken < 0.8 * maxToken
 *
 * @param day - The capacity data for the day
 * @param now - Optional current date/time for testing (defaults to new Date())
 * @returns CalendarStatus
 */
export function getCalendarStatus(
  day: CalendarDayInput,
  now: Date = new Date(),
): CalendarStatus {
  const { usedToken, maxToken, date } = day;

  // Priority 1: PAST — always takes highest priority
  if (isPastDate(date, now)) {
    return "PAST";
  }

  // Priority 2: FULL
  if (usedToken >= maxToken) {
    return "FULL";
  }

  // Priority 3: CUTOFF — H-1 rule (tomorrow after 10:00)
  if (isCutoff(date, now)) {
    return "CUTOFF";
  }

  // Priority 4: WARNING — 80% threshold
  if (usedToken >= 0.8 * maxToken) {
    return "WARNING";
  }

  // Priority 5: AVAILABLE
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
