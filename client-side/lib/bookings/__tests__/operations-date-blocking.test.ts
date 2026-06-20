import { describe, expect, it } from "vitest";

import { isDateBlockedForOrdering } from "../operations";

describe("Booking operations date blocking", () => {
  it("does not block other dates when today is marked as a holiday", () => {
    const now = new Date("2026-06-21T09:00:00+07:00");

    expect(
      isDateBlockedForOrdering("2026-06-25", now, {
        blockedDates: ["2026-06-21"],
      }),
    ).toBe(false);
  });

  it("still blocks the selected holiday date itself", () => {
    const now = new Date("2026-06-21T09:00:00+07:00");

    expect(
      isDateBlockedForOrdering("2026-06-25", now, {
        blockedDates: ["2026-06-25"],
      }),
    ).toBe(true);
  });
});
