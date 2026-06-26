import { describe, expect, it } from "vitest";

import {
  clampExplicitDownPaymentAmount,
  resolveStoredDownPaymentAmount,
} from "../down-payment";

describe("down-payment helpers", () => {
  it("preserves the exact admin-entered DP nominal", () => {
    expect(clampExplicitDownPaymentAmount(470000, 556000)).toBe(470000);
  });

  it("clamps DP to total price when input exceeds total", () => {
    expect(clampExplicitDownPaymentAmount(600000, 556000)).toBe(556000);
  });

  it("prefers stored downPaymentAmount over any fallback amount", () => {
    expect(
      resolveStoredDownPaymentAmount({
        downPaymentAmount: 470000,
        dpPaidAmount: 475000,
        totalPrice: 556000,
      }),
    ).toBe(470000);
  });

  it("falls back to dpPaidAmount when downPaymentAmount is absent", () => {
    expect(
      resolveStoredDownPaymentAmount({
        dpPaidAmount: 470000,
        totalPrice: 556000,
      }),
    ).toBe(470000);
  });
});
