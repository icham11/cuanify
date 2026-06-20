import { describe, expect, it } from "vitest";
import { BAKERY_BLOCKED_DATES } from "../config";

describe("bakery settings defaults", () => {
  it("does not ship legacy blocked dates in code defaults", () => {
    expect(BAKERY_BLOCKED_DATES.length).toBe(0);
  });
});
