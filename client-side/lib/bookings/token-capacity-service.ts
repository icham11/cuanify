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
import { getBakeryBusinessSettings } from "@/lib/bakery/settings";
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

const CAPACITY_INACTIVE_ORDER_STATUSES = [
  "Cancelled",
  "Completed",
  "Delivery",
  "Delivered",
] as const;

// ─── Table Setup ─────────────────────────────────────────────────────────────

let _tableEnsured = false;
let _tableEnsuredPromise: Promise<void> | null = null;

/**
 * Creates the production_capacity table if it does not exist.
 * Uses the same raw SQL pattern as bakery_orders.
 */
export async function ensureCapacityTable(): Promise<void> {
  if (_tableEnsured) return;
  if (_tableEnsuredPromise) {
    await _tableEnsuredPromise;
    return;
  }

  _tableEnsuredPromise = (async () => {
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
  })();

  try {
    await _tableEnsuredPromise;
  } catch (error) {
    _tableEnsuredPromise = null;
    throw error;
  }
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

async function getBusinessDefaultMaxToken(businessId: number): Promise<number> {
  const settings = await getBakeryBusinessSettings(businessId);
  return settings.dailyProductionTokenLimit;
}

export async function syncCapacityMaxTokenForBusiness(
  businessId: number,
  nextMaxToken: number,
  dbClient?: SqlExecutor,
): Promise<void> {
  const normalizedMaxToken = Math.max(
    1,
    Math.round(Number(nextMaxToken) || DEFAULT_MAX_TOKEN),
  );

  await ensureCapacityTable();

  const db = dbClient ?? prisma;
  await db.$executeRaw`
    UPDATE production_capacity
    SET
      max_token = ${normalizedMaxToken},
      updated_at = NOW()
    WHERE business_id = ${businessId}
      AND max_token <> ${normalizedMaxToken}
  `;
}

async function reconcileCapacityLedgerForRange(
  businessId: number, // ID bisnis bakery yang bersangkutan
  startDate: string, // Tanggal mulai range rekonsiliasi (YYYY-MM-DD)
  endDate: string, // Tanggal akhir range rekonsiliasi (YYYY-MM-DD)
  defaultMaxToken: number, // Default jumlah kapasitas token harian
  dbClient?: SqlExecutor, // Klien database opsional (untuk transaksi)
): Promise<void> { // Fungsi tidak mengembalikan nilai
  // Pastikan tabel production_capacity sudah terbuat sebelum kueri dijalankan
  await ensureCapacityTable();

  // Gunakan dbClient jika disediakan, jika tidak gunakan objek prisma bawaan
  const db = dbClient ?? prisma;

  try { // Tambahkan blok try-catch sebagai bagian dari error handling yang krusial
    // Sinkronisasi max token bawaan untuk bisnis ini agar data kapasitas terbarui
    await syncCapacityMaxTokenForBusiness(businessId, defaultMaxToken, db);

    // Jalankan kueri raw SQL untuk menghitung penggunaan token pesanan dan memasukkannya ke tabel kapasitas
    await db.$executeRaw`
      WITH active_tokens AS (
        SELECT
          -- delivery_date sudah bertipe DATE; agregasikan langsung per hari kirim
          delivery_date,
          -- Ambil nilai terbesar antara 0 dengan jumlah token_used, casting sebagai integer
          GREATEST(0, COALESCE(SUM(token_used), 0))::integer AS used_token
        FROM bakery_orders
        WHERE business_id = ${businessId}
          -- Filter hanya pesanan yang memiliki delivery_date
          AND delivery_date IS NOT NULL
          -- Hanya hitung pesanan yang belum dihapus secara soft-delete
          AND deleted_at IS NULL
          -- Bandingkan nilai DATE secara langsung di dalam range yang diminta
          AND delivery_date >= ${startDate}::date
          -- Batasi pencarian hingga tanggal akhir
          AND delivery_date <= ${endDate}::date
          -- Kecualikan status pesanan yang tidak memakan kapasitas token produksi
          AND order_status NOT IN (
            ${CAPACITY_INACTIVE_ORDER_STATUSES[0]},
            ${CAPACITY_INACTIVE_ORDER_STATUSES[1]},
            ${CAPACITY_INACTIVE_ORDER_STATUSES[2]},
            ${CAPACITY_INACTIVE_ORDER_STATUSES[3]}
          )
        -- Kelompokkan berdasarkan tanggal pengiriman
        GROUP BY delivery_date
      )
      -- Masukkan atau perbarui record kapasitas produksi harian
      INSERT INTO production_capacity (
        business_id,
        "businessId",
        date,
        max_token,
        used_token,
        created_at,
        updated_at
      )
      SELECT
        ${businessId},
        ${businessId},
        active_tokens.delivery_date,
        ${defaultMaxToken},
        -- Batasi nilai used_token agar tidak melebihi defaultMaxToken
        LEAST(${defaultMaxToken}, active_tokens.used_token),
        NOW(),
        NOW()
      FROM active_tokens
      -- Jika terjadi konflik pada kombinasi unik (business_id, date), lakukan pembaruan
      ON CONFLICT (business_id, date)
      DO UPDATE SET
        "businessId" = EXCLUDED."businessId",
        -- Set used_token dengan nilai baru terbatas max_token dan minimal 0
        used_token = LEAST(
          production_capacity.max_token,
          GREATEST(0, EXCLUDED.used_token)
        ),
        -- Perbarui timestamp modifikasi data kapasitas
        updated_at = NOW()
    `;

    // Jalankan kueri raw SQL kedua untuk mereset used_token menjadi 0 pada tanggal tanpa pesanan aktif
    await db.$executeRaw`
      UPDATE production_capacity pc
      SET used_token = 0, -- Reset used_token menjadi 0
          updated_at = NOW() -- Set timestamp pembaruan terbaru
      WHERE pc.business_id = ${businessId}
        -- Bandingkan pc.date yang bertipe DATE secara langsung dengan filter range
        AND pc.date >= ${startDate}::date
        AND pc.date <= ${endDate}::date
        -- Cek apakah tidak ada pesanan aktif tersisa yang menggunakan token di hari itu
        AND NOT EXISTS (
          SELECT 1
          FROM bakery_orders bo
          WHERE bo.business_id = pc.business_id
            -- Filter hanya pesanan dengan delivery_date valid
            AND bo.delivery_date IS NOT NULL
            -- Pastikan pesanan belum dihapus
            AND bo.deleted_at IS NULL
            -- Bandingkan dengan pc.date
            AND bo.delivery_date = pc.date
            -- Pastikan status pesanannya aktif (bukan cancelled/completed)
            AND bo.order_status NOT IN (
              ${CAPACITY_INACTIVE_ORDER_STATUSES[0]},
              ${CAPACITY_INACTIVE_ORDER_STATUSES[1]},
              ${CAPACITY_INACTIVE_ORDER_STATUSES[2]},
              ${CAPACITY_INACTIVE_ORDER_STATUSES[3]}
            )
            -- Hanya jika pesanan tersebut memang memakan kapasitas token > 0
            AND bo.token_used > 0
        )
    `;
  } catch (error) { // Tangkap kesalahan jika kueri database gagal
    // Cetak log kesalahan agar mudah dilacak di server-side log
    console.error(`[reconcileCapacityLedgerForRange] Error reconciling capacity ledger:`, error);
    // Lemparkan kembali kesalahan agar pemanggil fungsi mengetahui adanya kegagalan transaksi/proses
    throw error;
  }
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
  const defaultMaxToken = await getBusinessDefaultMaxToken(businessId);

  await ensureCapacityTable();

  const db = dbClient ?? prisma;
  await reconcileCapacityLedgerForRange(
    businessId,
    normalizedDate,
    normalizedDate,
    defaultMaxToken,
    db,
  );

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
      maxToken: defaultMaxToken,
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
  const defaultMaxToken = await getBusinessDefaultMaxToken(businessId);

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
  await syncCapacityMaxTokenForBusiness(businessId, defaultMaxToken, db);

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
      INSERT INTO production_capacity (business_id, "businessId", date, max_token, used_token, created_at, updated_at)
      VALUES (${businessId}, ${businessId}, ${normalizedDate}::date, ${defaultMaxToken}, 0, NOW(), NOW())
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
    maxToken: finalRow ? Number(finalRow.max_token) : defaultMaxToken,
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
  const defaultMaxToken = await getBusinessDefaultMaxToken(businessId);

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
  await syncCapacityMaxTokenForBusiness(businessId, defaultMaxToken, db);

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
    maxToken: defaultMaxToken,
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
  const defaultMaxToken = await getBusinessDefaultMaxToken(businessId);

  await ensureCapacityTable();

  const db = dbClient ?? prisma;
  await reconcileCapacityLedgerForRange(
    businessId,
    normalizedStartDate,
    normalizedEndDate,
    defaultMaxToken,
    db,
  );

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
