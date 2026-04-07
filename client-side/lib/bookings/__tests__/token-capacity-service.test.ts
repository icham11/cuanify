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
  calculateOrderTokenFromItems,
  checkTokenAvailability,
  consumeToken,
  releaseToken,
  getCapacityForDate,
  getCapacityForDateRange,
} from "../token-capacity-service";

// ─── Unit Tests (no DB required) ─────────────────────────────────────────────

describe("Token Capacity Service — Unit Tests", () => {
  describe("Constants", () => {
    it("DEFAULT_MAX_TOKEN should be 500", () => {
      expect(DEFAULT_MAX_TOKEN).toBe(500);
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

  describe("calculateOrderTokenFromItems", () => {
    it("should return 0 for empty items array", () => {
      expect(calculateOrderTokenFromItems([])).toBe(0);
    });

    it("should return 0 for null/undefined gracefully", () => {
      expect(calculateOrderTokenFromItems(null as unknown as [])).toBe(0);
    });

    // ── Cookies ──────────────────────────────────────────────────────────
    it("Cookies simple: 1 token × quantity", () => {
      expect(
        calculateOrderTokenFromItems([
          { category: "Cookies", difficulty: "simple", quantity: 3 },
        ]),
      ).toBe(3);
    });

    it("Cookies normal: 2 token × quantity", () => {
      expect(
        calculateOrderTokenFromItems([
          { category: "Cookies", difficulty: "normal", quantity: 5 },
        ]),
      ).toBe(10);
    });

    it("Cookies hard: 3 token × quantity", () => {
      expect(
        calculateOrderTokenFromItems([
          { category: "Cookies", difficulty: "hard", quantity: 4 },
        ]),
      ).toBe(12);
    });

    it("Cookies advanced: 4 token × quantity", () => {
      expect(
        calculateOrderTokenFromItems([
          { category: "Cookies", difficulty: "advanced", quantity: 2 },
        ]),
      ).toBe(8);
    });

    it("Cookies expert: 5 token × quantity", () => {
      expect(
        calculateOrderTokenFromItems([
          { category: "Cookies", difficulty: "expert", quantity: 1 },
        ]),
      ).toBe(5);
    });

    it("Cookies tokenDifficulty overrides difficulty", () => {
      expect(
        calculateOrderTokenFromItems([
          {
            category: "Cookies",
            tokenDifficulty: "expert",
            difficulty: "simple",
            quantity: 2,
          },
        ]),
      ).toBe(10);
    });

    // ── Bouquet ──────────────────────────────────────────────────────────
    it("Bouquet hand_bouquet: 20 tokens flat", () => {
      expect(
        calculateOrderTokenFromItems([
          { category: "Buket", subcategory: "Hand Bouquet" },
        ]),
      ).toBe(20);
    });

    it("Bouquet standing_bouquet: 50 tokens flat", () => {
      expect(
        calculateOrderTokenFromItems([
          { category: "Buket", subcategory: "Standing Bouquet" },
        ]),
      ).toBe(50);
    });

    it("Bouquet standing from productName even with generic subcategory", () => {
      expect(
        calculateOrderTokenFromItems([
          {
            category: "Buket",
            subcategory: "Bouquet",
            productName: "Standing Bouquet (12-20 pcs)",
          },
        ]),
      ).toBe(50);
    });

    it("Bouquet without subcategory defaults to hand_bouquet (20)", () => {
      expect(calculateOrderTokenFromItems([{ category: "Buket" }])).toBe(20);
    });

    // ── Cake ─────────────────────────────────────────────────────────────
    it("Cake: 100 tokens per quantity", () => {
      expect(
        calculateOrderTokenFromItems([{ category: "Cake", quantity: 1 }]),
      ).toBe(100);
    });

    it("Cake quantity multiplies token", () => {
      expect(
        calculateOrderTokenFromItems([{ category: "Cake", quantity: 3 }]),
      ).toBe(300);
    });

    // ── Cupcakes ─────────────────────────────────────────────────────────
    it("Cupcakes dozen: 2 tokens per cupcake piece", () => {
      expect(
        calculateOrderTokenFromItems([
          { category: "Cupcakes", productName: "Dozen Box", quantity: 1 },
        ]),
      ).toBe(24);
    });

    it("Cupcakes dozen quantity multiplies per cupcake piece token", () => {
      expect(
        calculateOrderTokenFromItems([
          { category: "Cupcakes", productName: "Dozen Box", quantity: 4 },
        ]),
      ).toBe(96);
    });

    it("Cupcakes individual: 5 tokens per cupcake piece", () => {
      expect(
        calculateOrderTokenFromItems([
          { category: "Cupcakes", productName: "Single Cupcake", quantity: 1 },
        ]),
      ).toBe(5);
    });

    it("Cupcakes individual quantity multiplies per cupcake piece token", () => {
      expect(
        calculateOrderTokenFromItems([
          { category: "Cupcakes", productName: "Single Cupcake", quantity: 10 },
        ]),
      ).toBe(50);
    });

    it("Cupcakes cookie add-on adds token per cupcake piece", () => {
      expect(
        calculateOrderTokenFromItems([
          {
            category: "Cupcakes",
            productName: "Single Cupcake",
            quantity: 10,
            addOns: ["cookie-simple"],
          },
        ]),
      ).toBe(60);
    });

    // ── Cookies Tower ────────────────────────────────────────────────────
    it("Cookies Tower: 100 tokens per quantity", () => {
      expect(
        calculateOrderTokenFromItems([{ category: "Cookies Tower" }]),
      ).toBe(100);
    });

    it("Cookies Tower quantity multiplies token", () => {
      expect(
        calculateOrderTokenFromItems([
          { category: "Cookies Tower", quantity: 2 },
        ]),
      ).toBe(200);
    });

    it("Bouquet qty in cookie range still counts as one bouquet", () => {
      expect(
        calculateOrderTokenFromItems([
          { category: "Buket", subcategory: "Hand Bouquet", quantity: 8 },
        ]),
      ).toBe(20);
      expect(
        calculateOrderTokenFromItems([
          { category: "Buket", subcategory: "Standing Bouquet", quantity: 15 },
        ]),
      ).toBe(50);
    });

    it("Bouquet token stays fixed even with expert difficulty", () => {
      expect(
        calculateOrderTokenFromItems([
          {
            category: "Buket",
            subcategory: "Hand Bouquet",
            quantity: 10,
            tokenDifficulty: "EXPERT",
          },
        ]),
      ).toBe(20);
      expect(
        calculateOrderTokenFromItems([
          {
            category: "Buket",
            subcategory: "Standing Bouquet",
            quantity: 15,
            tokenDifficulty: "EXPERT",
          },
        ]),
      ).toBe(50);
    });

    // ── Unknown type ─────────────────────────────────────────────────────
    it("Unknown category: 0 tokens (no crash)", () => {
      expect(
        calculateOrderTokenFromItems([{ category: "Gift", quantity: 5 }]),
      ).toBe(0);
      expect(calculateOrderTokenFromItems([{ category: "" }])).toBe(0);
    });

    // ── Mixed orders ─────────────────────────────────────────────────────
    it("Mixed order: sum of all item tokens", () => {
      const items = [
        { category: "Cookies", difficulty: "hard", quantity: 2 }, // 3 × 2 = 6
        { category: "Cake", quantity: 1 }, // 100
        { category: "Buket", subcategory: "Hand Bouquet" }, // 20
      ];
      expect(calculateOrderTokenFromItems(items)).toBe(126);
    });

    // ── Non-negative guarantee ────────────────────────────────────────────
    it("should never return negative values", () => {
      const result = calculateOrderTokenFromItems([
        { category: "Cookies", difficulty: "simple", quantity: 0 },
      ]);
      expect(result).toBe(0);
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
  describe("Case 1: usedToken=498, tokenNeeded=3 → REJECT", () => {
    it("should reject when usedToken + tokenNeeded > maxToken", async () => {
      // Setup: consume 498 tokens first
      const setupResult = await consumeToken(TEST_BUSINESS_ID, TEST_DATE, 498);
      expect(setupResult.success).toBe(true);
      expect(setupResult.usedToken).toBe(498);

      // Act: try to consume 3 more (498 + 3 = 501 > 500)
      const result = await consumeToken(TEST_BUSINESS_ID, TEST_DATE, 3);

      // Assert: should be rejected
      expect(result.success).toBe(false);
      expect(result.message).toBe("Production capacity full");
      expect(result.usedToken).toBe(498);
      expect(result.maxToken).toBe(500);
    });
  });

  // ── Test Case 2: Accept when capacity is exactly met ──
  describe("Case 2: usedToken=498, tokenNeeded=2 → SUCCESS", () => {
    it("should succeed when usedToken + tokenNeeded <= maxToken", async () => {
      // Setup: consume 498 tokens first
      const setupResult = await consumeToken(TEST_BUSINESS_ID, TEST_DATE, 498);
      expect(setupResult.success).toBe(true);

      // Act: try to consume 2 more (498 + 2 = 500 <= 500)
      const result = await consumeToken(TEST_BUSINESS_ID, TEST_DATE, 2);

      // Assert: should succeed
      expect(result.success).toBe(true);
      expect(result.usedToken).toBe(500);
      expect(result.maxToken).toBe(500);
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
      expect(result.maxToken).toBe(500);

      // Verify record was created
      const after = await getCapacityForDate(TEST_BUSINESS_ID, TEST_DATE);
      expect(after.usedToken).toBe(5);
    });
  });

  // ── Test Case 4: Concurrent requests (race condition) ──
  describe("Case 4: concurrent requests → no over-allocation", () => {
    it("should not allow over-allocation with concurrent requests", async () => {
      // Setup: consume 495 tokens
      await consumeToken(TEST_BUSINESS_ID, TEST_DATE, 495);

      // Act: fire 3 concurrent requests each trying to consume 3 tokens
      // Only 1 should succeed (495 + 3 = 498 <= 500)
      // The other 2 should fail (498 + 3 = 501 > 500)
      const results = await Promise.all([
        consumeToken(TEST_BUSINESS_ID, TEST_DATE, 3),
        consumeToken(TEST_BUSINESS_ID, TEST_DATE, 3),
        consumeToken(TEST_BUSINESS_ID, TEST_DATE, 3),
      ]);

      const successes = results.filter((r) => r.success);
      // At most 1 should succeed (495 + 3 = 498, then 498 + 3 = 501 > 500)
      expect(successes.length).toBeLessThanOrEqual(1);

      // Verify final state doesn't exceed max
      const finalCapacity = await getCapacityForDate(
        TEST_BUSINESS_ID,
        TEST_DATE,
      );
      expect(finalCapacity.usedToken).toBeLessThanOrEqual(
        finalCapacity.maxToken,
      );
    });
  });

  // ── Test: checkTokenAvailability ──
  describe("checkTokenAvailability", () => {
    it("should return true when capacity is available", async () => {
      const available = await checkTokenAvailability(
        TEST_BUSINESS_ID,
        TEST_DATE,
        100,
      );
      expect(available).toBe(true);
    });

    it("should return false when capacity is full", async () => {
      await consumeToken(TEST_BUSINESS_ID, TEST_DATE, 499);
      const available = await checkTokenAvailability(
        TEST_BUSINESS_ID,
        TEST_DATE,
        2,
      );
      expect(available).toBe(false);
    });

    it("should return true for zero tokens needed", async () => {
      const available = await checkTokenAvailability(
        TEST_BUSINESS_ID,
        TEST_DATE,
        0,
      );
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
      const result = await consumeToken(TEST_BUSINESS_ID, TEST_DATE, 500);
      expect(result.success).toBe(true);
      expect(result.usedToken).toBe(500);

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
