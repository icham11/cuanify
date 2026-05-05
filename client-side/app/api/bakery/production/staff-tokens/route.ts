import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  AuthError,
  ForbiddenError,
  requireAuth,
} from "@/lib/auth/session";
import { staffUuid } from "@/lib/bookings/order-api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TokenResetRow {
  staff_user_id: number;
  month_key: string;
  baseline_token: number;
  reset_at: Date;
  updated_by_user_id: number;
}

interface CountRow {
  count: bigint | number;
}

function toMonthKey(value: string | null): string {
  if (!value) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }
  const trimmed = value.trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(trimmed)) {
    throw new Error("Format month harus YYYY-MM");
  }
  return trimmed;
}

async function ensureStaffTokenResetTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS bakery_staff_monthly_token_resets (
      id BIGSERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      staff_user_id INTEGER NOT NULL,
      month_key TEXT NOT NULL,
      baseline_token INTEGER NOT NULL DEFAULT 0,
      reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by_user_id INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (business_id, staff_user_id, month_key)
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_bakery_staff_monthly_token_resets_lookup
    ON bakery_staff_monthly_token_resets (business_id, month_key, staff_user_id);
  `);
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.role === "Cashier") {
      throw new ForbiddenError("Akses ditolak.");
    }

    await ensureStaffTokenResetTable();

    const url = new URL(request.url);
    const monthKey = toMonthKey(url.searchParams.get("month"));

    const rows = await prisma.$queryRaw<TokenResetRow[]>`
      SELECT
        staff_user_id,
        month_key,
        baseline_token,
        reset_at,
        updated_by_user_id
      FROM bakery_staff_monthly_token_resets
      WHERE business_id = ${auth.businessId}
        AND month_key = ${monthKey}
      ORDER BY staff_user_id ASC
    `;

    return NextResponse.json({
      success: true,
      data: rows.map((row) => ({
        staffUserId: row.staff_user_id,
        monthKey: row.month_key,
        baselineToken: Number(row.baseline_token || 0),
        resetAt: row.reset_at.toISOString(),
        updatedByUserId: row.updated_by_user_id,
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : "Failed to fetch token resets";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    const roleName = String(auth.role);
    if (roleName !== "Owner" && roleName !== "Admin") {
      throw new ForbiddenError("Akses ditolak.");
    }

    const body = (await request.json().catch(() => ({}))) as {
      staffUserId?: unknown;
      monthKey?: unknown;
      baselineToken?: unknown;
    };

    const staffUserId = Number(body.staffUserId);
    if (!Number.isInteger(staffUserId) || staffUserId <= 0) {
      return NextResponse.json({ error: "staffUserId tidak valid" }, { status: 400 });
    }

    await ensureStaffTokenResetTable();

    const monthKey = toMonthKey(
      typeof body.monthKey === "string" ? body.monthKey : null,
    );
    const baselineToken = Math.max(
      0,
      Math.round(Number(body.baselineToken ?? 0)),
    );
    const targetStaffUuid = staffUuid(staffUserId);

    const affectedOrderRows = await prisma.$queryRaw<Array<{ external_id: string }>>`
      SELECT DISTINCT bo.external_id
      FROM bakery_orders bo
      LEFT JOIN production_tasks pt
        ON pt.order_id = bo.order_uuid
      WHERE bo.business_id = ${auth.businessId}
        AND COALESCE(bo.order_status, '') NOT IN ('Cancelled', 'Completed', 'Delivery', 'Delivered')
        AND (
          bo.assigned_staff_user_id = ${staffUserId}
          OR pt.staff_id = ${targetStaffUuid}::uuid
        )
    `;

    const affectedOrderIds = affectedOrderRows
      .map((row) => row.external_id)
      .filter((id) => typeof id === "string" && id.trim().length > 0);
    const affectedOrderCount = affectedOrderIds.length;

    let clearedStageCount = 0;
    if (targetStaffUuid) {
      const clearedStageRows = await prisma.$queryRaw<CountRow[]>`
        WITH cleared AS (
          UPDATE production_tasks pt
          SET staff_id = NULL
          FROM bakery_orders bo
          WHERE bo.business_id = ${auth.businessId}
            AND bo.order_uuid = pt.order_id
            AND COALESCE(bo.order_status, '') NOT IN ('Cancelled', 'Completed', 'Delivery', 'Delivered')
            AND pt.staff_id = ${targetStaffUuid}::uuid
          RETURNING 1
        )
        SELECT COUNT(*)::bigint AS count FROM cleared
      `;
      clearedStageCount = Number(clearedStageRows[0]?.count ?? 0);
    }

    if (affectedOrderIds.length > 0) {
      await prisma.$executeRaw`
        UPDATE bakery_orders bo
        SET assigned_staff_user_id = CASE
              WHEN bo.assigned_staff_user_id = ${staffUserId} THEN NULL
              ELSE bo.assigned_staff_user_id
            END,
            assigned_staff_name = CASE
              WHEN bo.assigned_staff_user_id = ${staffUserId} THEN NULL
              ELSE bo.assigned_staff_name
            END,
            production_assigned_at = CASE
              WHEN bo.assigned_staff_user_id = ${staffUserId}
                OR NOT EXISTS (
                  SELECT 1
                  FROM production_tasks remaining
                  WHERE remaining.order_id = bo.order_uuid
                    AND remaining.staff_id IS NOT NULL
                )
              THEN NULL
              ELSE bo.production_assigned_at
            END,
            updated_at = NOW()
        WHERE bo.business_id = ${auth.businessId}
          AND bo.external_id IN (${Prisma.join(affectedOrderIds)})
      `;
    }

    await prisma.$executeRaw`
      INSERT INTO bakery_staff_monthly_token_resets (
        business_id,
        staff_user_id,
        month_key,
        baseline_token,
        reset_at,
        updated_by_user_id,
        updated_at
      ) VALUES (
        ${auth.businessId},
        ${staffUserId},
        ${monthKey},
        ${baselineToken},
        NOW(),
        ${auth.userId},
        NOW()
      )
      ON CONFLICT (business_id, staff_user_id, month_key)
      DO UPDATE SET
        baseline_token = EXCLUDED.baseline_token,
        reset_at = NOW(),
        updated_by_user_id = EXCLUDED.updated_by_user_id,
        updated_at = NOW()
    `;

    return NextResponse.json({
      success: true,
      data: {
        staffUserId,
        monthKey,
        baselineToken,
        affectedOrderCount,
        clearedStageCount,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : "Failed to reset tokens";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
