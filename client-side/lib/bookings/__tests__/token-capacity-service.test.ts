/**
 * Token Capacity Service — Test Cases
 *
 * These tests document the expected behavior of the token capacity system.
 * They can be run with a test runner like Jest or Vitest that supports
 * database integration tests.
 *
 * Prerequisites:
 *   - A running PostgreSQL database
 *   - DATABASE_URL environment variable set
 *   - The production_capacity table (auto-created by ensureCapacityTable)
 *
 * Run: npx jest --testPathPattern=token-capacity-service
 *   or: npx vitest run lib/bookings/__tests__/token-capacity-service.test.ts
 */

declare const describe: {
  (name: string, fn: () => void): void;
  skip: (name: string, fn: () => void) => void;
};
declare const it: (name: string, fn: () => void | Promise<void>) => void;
declare const beforeEach: (fn: () => void | Promise<void>) => void;
declare const afterAll: (fn: () => void | Promise<void>) => void;
declare const expect: (value: unknown) => {
  toBe: (expected: unknown) => void;
  toBeLessThanOrEqual: (expected: number) => void;
  rejects: {
    toThrow: (message?: string) => Promise<void>;
  };
};

import {
  DEFAULT_MAX_TOKEN,
  TOKEN_MAP,
  calculateOrderToken,
  checkTokenAvailability,
  consumeToken,
  releaseToken,
  getCapacityForDate,
  getCapacityForDateRange,
} from "../token-capacity-service";

// ─── Unit Tests (no DB required) ─────────────────────────────────────────────

describe("Token Capacity Service — Unit Tests", () => {
  describe("Constants", () => {
    it("DEFAULT_MAX_TOKEN should be 600", () => {
      expect(DEFAULT_MAX_TOKEN).toBe(600);
    });

    it("TOKEN_MAP should map difficulties correctly", () => {
      expect(TOKEN_MAP.simple).toBe(1);
      expect(TOKEN_MAP.medium).toBe(2);
      expect(TOKEN_MAP.difficult).toBe(3);
    });
  });

  describe("calculateOrderToken", () => {
    it("should return 1 for 'simple'", () => {
      expect(calculateOrderToken("simple")).toBe(1);
    });

    it("should return 2 for 'medium'", () => {
      expect(calculateOrderToken("medium")).toBe(2);
    });

    it("should return 3 for 'difficult'", () => {
      expect(calculateOrderToken("difficult")).toBe(3);
    });

    it("should be case-insensitive", () => {
      expect(calculateOrderToken("SIMPLE")).toBe(1);
      expect(calculateOrderToken("Medium")).toBe(2);
      expect(calculateOrderToken("DIFFICULT")).toBe(3);
    });

    it("should handle whitespace", () => {
      expect(calculateOrderToken("  simple  ")).toBe(1);
    });

    it("should fallback to 1 (simple) for unknown values", () => {
      expect(calculateOrderToken("unknown")).toBe(1);
      expect(calculateOrderToken("")).toBe(1);
      expect(calculateOrderToken("extreme")).toBe(1);
    });
  });
});

// ─── Integration Tests (require DB) ──────────────────────────────────────────
// These tests require a real database connection.
// They are wrapped in describe.skip by default to avoid CI failures
// without a database. Remove .skip to run them locally.

describe.skip("Token Capacity Service — Integration Tests", () => {
  const TEST_BUSINESS_ID = 99999; // Use a high ID to avoid conflicts
  const TEST_DATE = "2099-01-15"; // Far future date to avoid conflicts
  const TEST_DATE_2 = "2099-01-16";

  // Clean up test data before/after
  beforeEach(async () => {
    const prisma = (await import("@/lib/prisma")).default;
    await prisma.$executeRawUnsafe(`
      DELETE FROM production_capacity
      WHERE business_id = ${TEST_BUSINESS_ID}
    `);
  });

  afterAll(async () => {
    const prisma = (await import("@/lib/prisma")).default;
    await prisma.$executeRawUnsafe(`
      DELETE FROM production_capacity
      WHERE business_id = ${TEST_BUSINESS_ID}
    `);
  });

  // ── Test Case 1: Reject when capacity would be exceeded ──
  describe("Case 1: usedToken=598, tokenNeeded=3 → REJECT", () => {
    it("should reject when usedToken + tokenNeeded > maxToken", async () => {
      // Setup: consume 598 tokens first
      const setupResult = await consumeToken(TEST_BUSINESS_ID, TEST_DATE, 598);
      expect(setupResult.success).toBe(true);
      expect(setupResult.usedToken).toBe(598);

      // Act: try to consume 3 more (598 + 3 = 601 > 600)
      const result = await consumeToken(TEST_BUSINESS_ID, TEST_DATE, 3);

      // Assert: should be rejected
      expect(result.success).toBe(false);
      expect(result.message).toBe("Production capacity full");
      expect(result.usedToken).toBe(598);
      expect(result.maxToken).toBe(600);
    });
  });

  // ── Test Case 2: Accept when capacity is exactly met ──
  describe("Case 2: usedToken=598, tokenNeeded=2 → SUCCESS", () => {
    it("should succeed when usedToken + tokenNeeded <= maxToken", async () => {
      // Setup: consume 598 tokens first
      const setupResult = await consumeToken(TEST_BUSINESS_ID, TEST_DATE, 598);
      expect(setupResult.success).toBe(true);

      // Act: try to consume 2 more (598 + 2 = 600 <= 600)
      const result = await consumeToken(TEST_BUSINESS_ID, TEST_DATE, 2);

      // Assert: should succeed
      expect(result.success).toBe(true);
      expect(result.usedToken).toBe(600);
      expect(result.maxToken).toBe(600);
    });
  });

  // ── Test Case 3: Auto-create record when none exists ──
  describe("Case 3: no record yet → auto create", () => {
    it("should auto-create capacity record on first consume", async () => {
      // Verify no record exists
      const before = await getCapacityForDate(TEST_BUSINESS_ID, TEST_DATE);
      expect(before.usedToken).toBe(0);
      expect(before.maxToken).toBe(DEFAULT_MAX_TOKEN);

      // Act: consume tokens (should auto-create the record)
      const result = await consumeToken(TEST_BUSINESS_ID, TEST_DATE, 5);

      // Assert
      expect(result.success).toBe(true);
      expect(result.usedToken).toBe(5);
      expect(result.maxToken).toBe(600);

      // Verify record was created
      const after = await getCapacityForDate(TEST_BUSINESS_ID, TEST_DATE);
      expect(after.usedToken).toBe(5);
    });
  });

  // ── Test Case 4: Concurrent requests (race condition) ──
  describe("Case 4: concurrent requests → no over-allocation", () => {
    it("should not allow over-allocation with concurrent requests", async () => {
      // Setup: consume 595 tokens
      await consumeToken(TEST_BUSINESS_ID, TEST_DATE, 595);

      // Act: fire 3 concurrent requests each trying to consume 3 tokens
      // Only 1 should succeed (595 + 3 = 598 <= 600)
      // The other 2 should fail (598 + 3 = 601 > 600)
      const results = await Promise.all([
        consumeToken(TEST_BUSINESS_ID, TEST_DATE, 3),
        consumeToken(TEST_BUSINESS_ID, TEST_DATE, 3),
        consumeToken(TEST_BUSINESS_ID, TEST_DATE, 3),
      ]);

      const successes = results.filter((r) => r.success);
      // At most 1 should succeed (595 + 3 = 598, then 598 + 3 = 601 > 600)
      expect(successes.length).toBeLessThanOrEqual(1);

      // Verify final state doesn't exceed max
      const finalCapacity = await getCapacityForDate(TEST_BUSINESS_ID, TEST_DATE);
      expect(finalCapacity.usedToken).toBeLessThanOrEqual(finalCapacity.maxToken);
    });
  });

  // ── Test: checkTokenAvailability ──
  describe("checkTokenAvailability", () => {
    it("should return true when capacity is available", async () => {
      const available = await checkTokenAvailability(TEST_BUSINESS_ID, TEST_DATE, 100);
      expect(available).toBe(true);
    });

    it("should return false when capacity is full", async () => {
      await consumeToken(TEST_BUSINESS_ID, TEST_DATE, 599);
      const available = await checkTokenAvailability(TEST_BUSINESS_ID, TEST_DATE, 2);
      expect(available).toBe(false);
    });

    it("should return true for zero tokens needed", async () => {
      const available = await checkTokenAvailability(TEST_BUSINESS_ID, TEST_DATE, 0);
      expect(available).toBe(true);
    });
  });

  // ── Test: releaseToken ──
  describe("releaseToken", () => {
    it("should decrease usedToken", async () => {
      await consumeToken(TEST_BUSINESS_ID, TEST_DATE, 100);
      const result = await releaseToken(TEST_BUSINESS_ID, TEST_DATE, 30);

      expect(result.success).toBe(true);
      expect(result.usedToken).toBe(70);
    });

    it("should floor at 0 (never go negative)", async () => {
      await consumeToken(TEST_BUSINESS_ID, TEST_DATE, 10);
      const result = await releaseToken(TEST_BUSINESS_ID, TEST_DATE, 50);

      expect(result.success).toBe(true);
      expect(result.usedToken).toBe(0);
    });

    it("should succeed even if no record exists", async () => {
      const result = await releaseToken(TEST_BUSINESS_ID, TEST_DATE, 10);
      expect(result.success).toBe(true);
      expect(result.usedToken).toBe(0);
    });
  });

  // ── Test: getCapacityForDateRange ──
  describe("getCapacityForDateRange", () => {
    it("should return records for dates with usage", async () => {
      await consumeToken(TEST_BUSINESS_ID, TEST_DATE, 50);
      await consumeToken(TEST_BUSINESS_ID, TEST_DATE_2, 100);

      const records = await getCapacityForDateRange(
        TEST_BUSINESS_ID,
        TEST_DATE,
        TEST_DATE_2,
      );

      expect(records.length).toBe(2);
      expect(records[0].date).toBe(TEST_DATE);
      expect(records[0].usedToken).toBe(50);
      expect(records[1].date).toBe(TEST_DATE_2);
      expect(records[1].usedToken).toBe(100);
    });
  });

  // ── Test: Edge cases ──
  describe("Edge cases", () => {
    it("should reject invalid date format", async () => {
      await expect(
        consumeToken(TEST_BUSINESS_ID, "2024/01/15", 1),
      ).rejects.toThrow("Invalid date format");
    });

    it("should handle consuming exactly maxToken", async () => {
      const result = await consumeToken(TEST_BUSINESS_ID, TEST_DATE, 600);
      expect(result.success).toBe(true);
      expect(result.usedToken).toBe(600);

      // Now try to consume 1 more
      const result2 = await consumeToken(TEST_BUSINESS_ID, TEST_DATE, 1);
      expect(result2.success).toBe(false);
    });

    it("should handle consuming 0 tokens", async () => {
      const result = await consumeToken(TEST_BUSINESS_ID, TEST_DATE, 0);
      expect(result.success).toBe(true);
    });
  });
});
