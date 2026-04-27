declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: (value: unknown) => {
  toBe: (expected: unknown) => void;
};

import { createProductSchema } from "../product";

describe("createProductSchema cogs hardening", () => {
  const baseInput = {
    name: "Test Product",
    categoryName: "Cookies",
    sellingPrice: 25000,
    recipe: [],
  };

  it("rejects product when cogs is missing", () => {
    const parsed = createProductSchema.safeParse(baseInput);
    expect(parsed.success).toBe(false);
  });

  it("rejects product when cogs is <= 0", () => {
    const parsedZero = createProductSchema.safeParse({
      ...baseInput,
      cogs: 0,
    });
    const parsedNegative = createProductSchema.safeParse({
      ...baseInput,
      cogs: -100,
    });

    expect(parsedZero.success).toBe(false);
    expect(parsedNegative.success).toBe(false);
  });

  it("accepts product when cogs is > 0", () => {
    const parsed = createProductSchema.safeParse({
      ...baseInput,
      cogs: 12000,
    });
    expect(parsed.success).toBe(true);
  });
});
