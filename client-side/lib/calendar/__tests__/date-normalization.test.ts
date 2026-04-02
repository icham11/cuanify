declare const describe: {
  (name: string, fn: () => void): void;
  skip: (name: string, fn: () => void) => void;
};
declare const it: (name: string, fn: () => void | Promise<void>) => void;
declare const expect: (value: unknown) => {
  toBe: (expected: unknown) => void;
};

import { isPastDate } from "@/lib/calendar/getCalendarStatus";
import {
  normalizeDateInput,
  parseSafeDate,
  toIsoDateString,
} from "@/lib/helpers/date-normalization";

describe("Date normalization and past-date detection", () => {
  it("Case 1: 2026-04-04 should not be marked as past", () => {
    const now = new Date(2026, 3, 1, 9, 0, 0);
    expect(isPastDate("2026-04-04", now)).toBe(false);
  });

  it("Case 2: 2020-01-01 should be marked as past", () => {
    const now = new Date(2026, 3, 1, 9, 0, 0);
    expect(isPastDate("2020-01-01", now)).toBe(true);
  });

  it("Case 3: DD/MM/YYYY input should be converted safely", () => {
    const normalized = normalizeDateInput("04/04/2026");
    expect(normalized).toBe("2026-04-04");

    const now = new Date(2026, 3, 1, 9, 0, 0);
    expect(isPastDate(normalized ?? "", now)).toBe(false);
  });

  it("Case 4: timezone-safe day-only formatting should not shift date", () => {
    const lateNightLocal = new Date(2026, 3, 4, 23, 30, 0);
    expect(toIsoDateString(lateNightLocal)).toBe("2026-04-04");

    const parsed = parseSafeDate("2026-04-04");
    expect(toIsoDateString(parsed ?? new Date(0))).toBe("2026-04-04");
  });
});