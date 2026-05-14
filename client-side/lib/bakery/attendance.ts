import type { BakeryBusinessSettings } from "@/lib/bakery/settings";

export const BAKERY_ATTENDANCE_TIME_ZONE = "Asia/Jakarta";
export const DEFAULT_ATTENDANCE_WINDOW_START = "06:00";
export const DEFAULT_ATTENDANCE_WINDOW_END = "07:00";

type AttendanceLikeRow = {
  attendance_date: string | Date;
  check_in_at: string | Date;
};

function parseTimeToMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  const safeHour = Number.isInteger(hour) ? hour : 0;
  const safeMinute = Number.isInteger(minute) ? minute : 0;
  return safeHour * 60 + safeMinute;
}

function getAttendanceWindowRange(settings: BakeryBusinessSettings) {
  const startTime =
    settings.attendanceWindowStart || DEFAULT_ATTENDANCE_WINDOW_START;
  const endTime = settings.attendanceWindowEnd || DEFAULT_ATTENDANCE_WINDOW_END;
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);

  if (endMinutes <= startMinutes) {
    return {
      startTime: DEFAULT_ATTENDANCE_WINDOW_START,
      endTime: DEFAULT_ATTENDANCE_WINDOW_END,
      startMinutes: parseTimeToMinutes(DEFAULT_ATTENDANCE_WINDOW_START),
      endMinutes: parseTimeToMinutes(DEFAULT_ATTENDANCE_WINDOW_END),
    };
  }

  return {
    startTime,
    endTime,
    startMinutes,
    endMinutes,
  };
}

export function formatAttendanceTimeLabel(value: string) {
  return `${value.replace(":", ".")} WIB`;
}

export function getJakartaParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: BAKERY_ATTENDANCE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value || 0);

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

export function getJakartaDateKey(date: Date) {
  const parts = getJakartaParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function normalizeAttendanceDateKey(value: string | Date) {
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) {
      return getJakartaDateKey(parsed);
    }
    return value;
  }

  return getJakartaDateKey(value);
}

export function isDateKey(value: string | null): value is string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "");
}

export function getDateDiffInDaysInclusive(start: string, end: string) {
  const [startYear, startMonth, startDay] = start.split("-").map(Number);
  const [endYear, endMonth, endDay] = end.split("-").map(Number);
  const startUtc = Date.UTC(startYear, startMonth - 1, startDay);
  const endUtc = Date.UTC(endYear, endMonth - 1, endDay);
  return Math.max(1, Math.floor((endUtc - startUtc) / 86400000) + 1);
}

export function getDateKeysInRange(start: string, end: string) {
  const [startYear, startMonth, startDay] = start.split("-").map(Number);
  const [endYear, endMonth, endDay] = end.split("-").map(Number);
  const startUtc = Date.UTC(startYear, startMonth - 1, startDay);
  const endUtc = Date.UTC(endYear, endMonth - 1, endDay);
  const keys: string[] = [];

  for (let cursor = startUtc; cursor <= endUtc; cursor += 86400000) {
    keys.push(new Date(cursor).toISOString().slice(0, 10));
  }

  return keys;
}

export function getMonthKeysInRange(start: string, end: string) {
  const months = new Set<string>();
  getDateKeysInRange(start, end).forEach((dateKey) => {
    months.add(dateKey.slice(0, 7));
  });
  return Array.from(months.values()).sort();
}

export function isHolidayDate(
  dateKey: string,
  settings: Pick<BakeryBusinessSettings, "blockedDates" | "holidayEntries">,
) {
  return (
    settings.blockedDates.includes(dateKey) ||
    settings.holidayEntries.some((entry) => entry.date === dateKey)
  );
}

export function getAttendanceWindowState(
  settings: BakeryBusinessSettings,
  now: Date = new Date(),
) {
  const todayKey = getJakartaDateKey(now);
  const { startTime, endTime, startMinutes, endMinutes } =
    getAttendanceWindowRange(settings);
  const nowParts = getJakartaParts(now);
  const currentMinutes = nowParts.hour * 60 + nowParts.minute;
  const isHolidayToday = isHolidayDate(todayKey, settings);
  const enabled = settings.attendanceWindowEnabled !== false;
  const hasWindowStarted = enabled ? currentMinutes >= startMinutes : true;
  const hasWindowEnded = enabled ? currentMinutes > endMinutes : false;
  const canCheckInNow =
    enabled && !isHolidayToday && currentMinutes >= startMinutes && currentMinutes <= endMinutes;

  let message = "Absensi dibuka hari ini.";
  if (isHolidayToday) {
    message = "Hari ini ditandai sebagai libur, absensi tidak diperlukan.";
  } else if (!enabled) {
    message = "Batas jam absensi dimatikan owner. Absensi bisa dicatat manual.";
  } else if (!hasWindowStarted) {
    message = `Absensi dibuka mulai jam ${formatAttendanceTimeLabel(startTime)}.`;
  } else if (canCheckInNow) {
    message = `Absensi dibuka sampai jam ${formatAttendanceTimeLabel(endTime)}.`;
  } else {
    message = `Jam absensi hari ini sudah tutup pada ${formatAttendanceTimeLabel(endTime)}.`;
  }

  return {
    enabled,
    startTime,
    endTime,
    label: `${formatAttendanceTimeLabel(startTime)} - ${formatAttendanceTimeLabel(endTime)}`,
    todayKey,
    isHolidayToday,
    hasWindowStarted,
    hasWindowEnded,
    canCheckInNow,
    message,
  };
}

export function isAttendanceRecordLate(
  row: AttendanceLikeRow,
  settings: BakeryBusinessSettings,
) {
  if (settings.attendanceWindowEnabled === false) return false;

  const { endMinutes } = getAttendanceWindowRange(settings);
  const parts = getJakartaParts(new Date(row.check_in_at));
  const checkInMinutes = parts.hour * 60 + parts.minute;
  return checkInMinutes > endMinutes;
}

export function getManualLateCountForRange(
  settings: BakeryBusinessSettings,
  userId: number,
  rangeStart: string,
  rangeEnd: string,
) {
  const monthKeys = new Set(getMonthKeysInRange(rangeStart, rangeEnd));
  const matches = settings.attendanceReconciliation.filter(
    (entry) =>
      entry.staffUserId === userId && monthKeys.has(entry.monthKey),
  );

  if (matches.length === 0) return null;

  return matches.reduce(
    (sum, entry) => sum + Math.max(0, Number(entry.manualLateCount || 0)),
    0,
  );
}

export function getManualLateCountForMonth(
  settings: BakeryBusinessSettings,
  userId: number,
  monthKey: string,
) {
  const matches = settings.attendanceReconciliation.filter(
    (entry) => entry.staffUserId === userId && entry.monthKey === monthKey,
  );

  if (matches.length === 0) return null;

  return matches.reduce(
    (sum, entry) => sum + Math.max(0, Number(entry.manualLateCount || 0)),
    0,
  );
}

export function calculateAttendanceMetrics(args: {
  rows: AttendanceLikeRow[];
  rangeStart: string;
  rangeEnd: string;
  settings: BakeryBusinessSettings;
  memberSinceDate?: string | null;
  now?: Date;
  manualLateCount?: number;
}) {
  const now = args.now ?? new Date();
  const todayKey = getJakartaDateKey(now);
  const { enabled, hasWindowEnded } = getAttendanceWindowState(args.settings, now);
  const rowsByDate = new Map<string, AttendanceLikeRow>();

  args.rows.forEach((row) => {
    rowsByDate.set(normalizeAttendanceDateKey(row.attendance_date), row);
  });

  const eligibleDates = getDateKeysInRange(args.rangeStart, args.rangeEnd).filter(
    (dateKey) => {
      if (!enabled) return false;
      if (args.memberSinceDate && dateKey < args.memberSinceDate) return false;
      if (isHolidayDate(dateKey, args.settings)) return false;
      if (dateKey > todayKey) return false;
      if (dateKey === todayKey) {
        return hasWindowEnded;
      }
      return true;
    },
  );

  const missingDates = eligibleDates.filter((dateKey) => !rowsByDate.has(dateKey));
  const lateCheckIns = Array.from(rowsByDate.values()).filter((row) =>
    isAttendanceRecordLate(row, args.settings),
  ).length;
  const systemLateCount = missingDates.length + lateCheckIns;
  const hasManualOverride =
    typeof args.manualLateCount === "number" && Number.isFinite(args.manualLateCount);
  const manualLateCount = hasManualOverride
    ? Math.max(0, Math.round(Number(args.manualLateCount)))
    : 0;

  return {
    attendanceCount: rowsByDate.size,
    expectedAttendanceDays: eligibleDates.length,
    missingDates,
    systemLateCount,
    manualLateCount,
    lateCount: hasManualOverride ? manualLateCount : systemLateCount,
    isManualOverride: hasManualOverride,
  };
}
