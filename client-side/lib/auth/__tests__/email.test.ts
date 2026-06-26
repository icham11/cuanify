import { describe, expect, it } from "vitest";
import { isValidEmail, normalizeEmail } from "../email";

describe("auth email helpers", () => {
  it("normalizes email by trimming and lowercasing", () => {
    expect(normalizeEmail("  Admin.User@Example.COM  ")).toBe(
      "admin.user@example.com",
    );
  });

  it("rejects malformed email after normalization", () => {
    expect(isValidEmail("  not-an-email  ")).toBe(false);
    expect(isValidEmail(" Admin.User@Example.COM ")).toBe(true);
  });
});
