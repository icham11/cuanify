import { startOfDay } from "date-fns";
import { parseSafeDate } from "@/lib/helpers/date-normalization";

/**
 * Token-based Calendar Status Utility
 *
 * Determines the availability status of a calendar date based on
 * token capacity data. Token system is the ONLY source of truth.
 *
 * Priority order: PAST → FULL → CUTOFF → WARNING → AVAILABLE
 */

export type CalendarStatus = "PAST" | "AVAILABLE" | "WARNING" | "FULL" | "CUTOFF";

export const DEFAULT_MAX_TOKEN = 600;

export interface CalendarDayInput {
  usedToken: number;
  maxToken: number;
  /** Date string in YYYY-MM-DD format */
  date: string;
}

function parseLocalDateOnly(dateStr: string): Date | null {
  return parseSafeDate(dateStr);
}

/**
 * Returns true if dateStr is before today in local timezone.
 */
export function isPastDate(dateStr: string, now: Date = new Date()): boolean {
  const target = parseLocalDateOnly(dateStr);
  if (!target) return false;

  const today = startOfDay(now);

  return target.getTime() < today.getTime();
}

/**
 * Checks H-1 cutoff rule using local Date objects.
 *
 * Block only when current time has passed deliveryDate - 1 day at 10:00.
 *
 * Uses local date comparison to avoid timezone shift issues.
 */
function isCutoff(dateStr: string, now: Date = new Date()): boolean {
  if (!dateStr) return false;

  const targetDate = parseLocalDateOnly(dateStr);
  if (!targetDate) return false;

  const cutoffDate = new Date(targetDate);
  cutoffDate.setDate(cutoffDate.getDate() - 1);
  cutoffDate.setHours(10, 0, 0, 0);

  return now.getTime() > cutoffDate.getTime();
}

/**
 * Determines the calendar status for a given day based on token capacity.
 *
 * Rules (in priority order):
 * 1. PAST:      date is before today (local timezone)
 * 2. FULL:      usedToken >= maxToken
 * 3. CUTOFF:    now > (deliveryDate - 1 day at 10:00)
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

  // Priority 3: CUTOFF — H-1 rule
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
