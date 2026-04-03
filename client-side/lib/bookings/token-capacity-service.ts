/**
 * Token Capacity Service
 *
 * Database-backed production capacity system using tokens.
 * Each day has a maxToken (default 500). Each order consumes tokens
 * based on difficulty: simple=1, medium=2, difficult=3.
 *
 * Uses atomic SQL operations to prevent race conditions / double booking.
 *
 * Table: production_capacity
 *   - id BIGSERIAL PRIMARY KEY
 *   - business_id INTEGER NOT NULL
 *   - date DATE NOT NULL
 *   - max_token INTEGER NOT NULL DEFAULT 500
 *   - used_token INTEGER NOT NULL DEFAULT 0
 *   - created_at TIMESTAMPTZ
 *   - updated_at TIMESTAMPTZ
 *   - UNIQUE (business_id, date)
 */

import prisma from "@/lib/prisma";
import { normalizeDateOrThrow } from "@/lib/helpers/date-normalization";
import { BAKERY_DAILY_PRODUCTION_TOKEN_LIMIT } from "@/lib/bookings/config";
import {
  calculateOrderTokenFromItems,
  type OrderItemForTokenCalc,
} from "@/lib/bookings/order-token-calculator";

interface SqlExecutor {
  $queryRaw<T = unknown>(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T>;
  $executeRaw(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<number>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const DEFAULT_MAX_TOKEN = BAKERY_DAILY_PRODUCTION_TOKEN_LIMIT;

export type Difficulty = "simple" | "medium" | "difficult";

export const TOKEN_MAP: Record<Difficulty, number> = {
  simple: 1,
  medium: 2,
  difficult: 3,
};

export { calculateOrderTokenFromItems, type OrderItemForTokenCalc };

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CapacityRecord {
  date: string;
  maxToken: number;
  usedToken: number;
}

export interface ConsumeResult {
  success: boolean;
  usedToken: number;
  maxToken: number;
  message?: string;
}

export interface ReleaseResult {
  success: boolean;
  usedToken: number;
  maxToken: number;
}

// ─── Raw DB row type ─────────────────────────────────────────────────────────

interface CapacityRow {
  date: string;
  max_token: number;
  used_token: number;
}

// ─── Table Setup ─────────────────────────────────────────────────────────────

let _tableEnsured = false;

/**
 * Creates the production_capacity table if it does not exist.
 * Uses the same raw SQL pattern as bakery_orders.
 */
export async function ensureCapacityTable(): Promise<void> {
  if (_tableEnsured) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS production_capacity (
      id BIGSERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      date DATE NOT NULL,
      max_token INTEGER NOT NULL DEFAULT ${DEFAULT_MAX_TOKEN},
      used_token INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (business_id, date)
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_production_capacity_biz_date
    ON production_capacity (business_id, date);
  `);

  _tableEnsured = true;
}

// ─── Helper ──────────────────────────────────────────────────────────────────

/**
 * Maps a difficulty string to its token cost.
 * Falls back to 1 (simple) for unknown values.
 */
export function calculateOrderToken(difficulty: string): number {
  const key = difficulty.toLowerCase().trim() as Difficulty;
  return TOKEN_MAP[key] ?? TOKEN_MAP.simple;
}

function normalizeCapacityDateOrThrow(date: string): string {
  return normalizeDateOrThrow(date, "date");
}

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Get the current capacity record for a specific business + date.
 * Returns null if no record exists yet (meaning 0 tokens used).
 */
export async function getCapacityForDate(
  businessId: number,
  date: string,
  dbClient?: SqlExecutor,
): Promise<CapacityRecord> {
  const normalizedDate = normalizeCapacityDateOrThrow(date);

  await ensureCapacityTable();

  const db = dbClient ?? prisma;

  const rows = await db.$queryRaw<CapacityRow[]>`
    SELECT date::text AS date, max_token, used_token
    FROM production_capacity
    WHERE business_id = ${businessId}
      AND date = ${normalizedDate}::date
    LIMIT 1
  `;

  if (rows.length === 0) {
    return {
      date: normalizedDate,
      maxToken: DEFAULT_MAX_TOKEN,
      usedToken: 0,
    };
  }

  const row = rows[0];
  return {
    date: normalizedDate,
    maxToken: Number(row.max_token),
    usedToken: Number(row.used_token),
  };
}

/**
 * Check if there is enough token capacity for a given date.
 *
 * @returns true if usedToken + tokenNeeded <= maxToken
 */
export async function checkTokenAvailability(
  businessId: number,
  date: string,
  tokenNeeded: number,
  dbClient?: SqlExecutor,
): Promise<boolean> {
  if (tokenNeeded <= 0) return true;

  const normalizedDate = normalizeCapacityDateOrThrow(date);
  const capacity = await getCapacityForDate(
    businessId,
    normalizedDate,
    dbClient,
  );
  return capacity.usedToken + tokenNeeded <= capacity.maxToken;
}

/**
 * Atomically consume tokens for a given date.
 *
 * Strategy (per user feedback):
 *   1. Attempt UPDATE with WHERE condition (used_token + tokenUsed <= max_token)
 *      and RETURNING clause.
 *   2. If no rows affected (row doesn't exist), INSERT a new row.
 *   3. Retry UPDATE after INSERT.
 *
 * This prevents race conditions — two concurrent requests cannot both succeed
 * if their combined tokens would exceed maxToken.
 *
 * @returns ConsumeResult with success=true if tokens were consumed,
 *          success=false if capacity is full.
 */
export async function consumeToken(
  businessId: number,
  date: string,
  tokenUsed: number,
  dbClient?: SqlExecutor,
): Promise<ConsumeResult> {
  const normalizedDate = normalizeCapacityDateOrThrow(date);

  if (tokenUsed <= 0) {
    const capacity = await getCapacityForDate(
      businessId,
      normalizedDate,
      dbClient,
    );
    return {
      success: true,
      usedToken: capacity.usedToken,
      maxToken: capacity.maxToken,
    };
  }

  await ensureCapacityTable();
  const db = dbClient ?? prisma;

  // Step 1: Attempt atomic UPDATE with WHERE guard
  const updated = await db.$queryRaw<CapacityRow[]>`
    UPDATE production_capacity
    SET
      used_token = used_token + ${tokenUsed},
      updated_at = NOW()
    WHERE business_id = ${businessId}
      AND date = ${normalizedDate}::date
      AND used_token + ${tokenUsed} <= max_token
    RETURNING date::text AS date, max_token, used_token
  `;

  if (updated.length > 0) {
    const row = updated[0];
    return {
      success: true,
      usedToken: Number(row.used_token),
      maxToken: Number(row.max_token),
    };
  }

  // Step 2: Check if row exists but capacity is full, or row doesn't exist
  const existing = await db.$queryRaw<CapacityRow[]>`
    SELECT date::text AS date, max_token, used_token
    FROM production_capacity
    WHERE business_id = ${businessId}
      AND date = ${normalizedDate}::date
    LIMIT 1
  `;

  if (existing.length > 0) {
    // Row exists but capacity is full
    const row = existing[0];
    return {
      success: false,
      usedToken: Number(row.used_token),
      maxToken: Number(row.max_token),
      message: "Production capacity full",
    };
  }

  // Step 3: No row exists — INSERT new record with the consumed tokens
  // Use INSERT ... ON CONFLICT to handle concurrent inserts safely
  try {
    await db.$executeRaw`
      INSERT INTO production_capacity (business_id, date, max_token, used_token, created_at, updated_at)
      VALUES (${businessId}, ${normalizedDate}::date, ${DEFAULT_MAX_TOKEN}, 0, NOW(), NOW())
      ON CONFLICT (business_id, date) DO NOTHING
    `;
  } catch {
    // Another concurrent request may have inserted — that's fine
  }

  // Step 4: Retry atomic UPDATE after INSERT
  const retryUpdated = await db.$queryRaw<CapacityRow[]>`
    UPDATE production_capacity
    SET
      used_token = used_token + ${tokenUsed},
      updated_at = NOW()
    WHERE business_id = ${businessId}
      AND date = ${normalizedDate}::date
      AND used_token + ${tokenUsed} <= max_token
    RETURNING date::text AS date, max_token, used_token
  `;

  if (retryUpdated.length > 0) {
    const row = retryUpdated[0];
    return {
      success: true,
      usedToken: Number(row.used_token),
      maxToken: Number(row.max_token),
    };
  }

  // Capacity full even after insert (edge case: concurrent requests filled it)
  const finalState = await db.$queryRaw<CapacityRow[]>`
    SELECT date::text AS date, max_token, used_token
    FROM production_capacity
    WHERE business_id = ${businessId}
      AND date = ${normalizedDate}::date
    LIMIT 1
  `;

  const finalRow = finalState[0];
  return {
    success: false,
    usedToken: finalRow ? Number(finalRow.used_token) : 0,
    maxToken: finalRow ? Number(finalRow.max_token) : DEFAULT_MAX_TOKEN,
    message: "Production capacity full",
  };
}

/**
 * Atomically release tokens for a given date (e.g., on order cancellation).
 *
 * Decreases usedToken, floored at 0 to prevent negative values.
 *
 * @returns ReleaseResult with the new capacity state.
 */
export async function releaseToken(
  businessId: number,
  date: string,
  tokenToRelease: number,
  dbClient?: SqlExecutor,
): Promise<ReleaseResult> {
  const normalizedDate = normalizeCapacityDateOrThrow(date);

  if (tokenToRelease <= 0) {
    const capacity = await getCapacityForDate(
      businessId,
      normalizedDate,
      dbClient,
    );
    return {
      success: true,
      usedToken: capacity.usedToken,
      maxToken: capacity.maxToken,
    };
  }

  await ensureCapacityTable();
  const db = dbClient ?? prisma;

  // Atomic update: decrease used_token, floor at 0
  const updated = await db.$queryRaw<CapacityRow[]>`
    UPDATE production_capacity
    SET
      used_token = GREATEST(0, used_token - ${tokenToRelease}),
      updated_at = NOW()
    WHERE business_id = ${businessId}
      AND date = ${normalizedDate}::date
    RETURNING date::text AS date, max_token, used_token
  `;

  if (updated.length > 0) {
    const row = updated[0];
    return {
      success: true,
      usedToken: Number(row.used_token),
      maxToken: Number(row.max_token),
    };
  }

  // No row exists — nothing to release, return default
  return {
    success: true,
    usedToken: 0,
    maxToken: DEFAULT_MAX_TOKEN,
  };
}

/**
 * Get capacity records for a date range (useful for calendar views).
 * Returns records for dates that have any usage.
 */
export async function getCapacityForDateRange(
  businessId: number,
  startDate: string,
  endDate: string,
  dbClient?: SqlExecutor,
): Promise<CapacityRecord[]> {
  const normalizedStartDate = normalizeCapacityDateOrThrow(startDate);
  const normalizedEndDate = normalizeCapacityDateOrThrow(endDate);

  await ensureCapacityTable();

  const db = dbClient ?? prisma;

  const rows = await db.$queryRaw<CapacityRow[]>`
    SELECT date::text AS date, max_token, used_token
    FROM production_capacity
    WHERE business_id = ${businessId}
      AND date >= ${normalizedStartDate}::date
      AND date <= ${normalizedEndDate}::date
    ORDER BY date ASC
  `;

  return rows.map((row): CapacityRecord => {
    return {
      date: row.date,
      maxToken: Number(row.max_token),
      usedToken: Number(row.used_token),
    };
  });
}
