import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  isAuthError,
  isForbiddenError,
  requireAuth,
  requireRole,
} from "@/lib/auth/session";
import { buildStaffIdByUuid } from "@/lib/bookings/order-api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUSINESS_TIME_ZONE = "Asia/Jakarta";
// Order di status ini sudah lewat tahap produksi.
const FINISHED_ORDER_STATUSES = new Set([
  "Ready",
  "Delivery",
  "Delivered",
  "Completed",
]);

type TaskRow = {
  staff_id: string | null;
  stage: string;
  token_amount: unknown;
  completed_at: Date | null;
  order_status: string | null;
  external_id: string;
  booking_code: string | null;
  customer_name: string | null;
  delivery_date: string | null;
};

export type StaffTokenReportTask = {
  orderId: string;
  bookingCode: string;
  customerName: string;
  deliveryDate: string;
  stage: string;
  token: number;
  completedAt: string | null;
};

export type StaffTokenReportRow = {
  staffUserId: number;
  staffName: string;
  readyDateToken: number;
  readyDateTaskCount: number;
  readyMonthToken: number;
  pendingToken: number;
  pendingTaskCount: number;
  missedToken: number;
  missedTaskCount: number;
  readyDateTasks: StaffTokenReportTask[];
  missedTasks: StaffTokenReportTask[];
};

function getJakartaDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function toToken(value: unknown): number {
  const parsed = Math.round(Number(value ?? 0));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * GET /api/bakery/production/staff-token-report?date=YYYY-MM-DD
 *
 * Token "masuk" ke staff = tahap produksi (production_tasks) yang ditandai
 * Ready (completed_at terisi) oleh staff yang ditugaskan. Dihitung per tanggal
 * Ready (zona Asia/Jakarta), dari order yang tidak dibatalkan/dihapus.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    requireRole(auth, "Owner", "Admin");

    const requestedDate = request.nextUrl.searchParams.get("date") ?? "";
    const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
      ? requestedDate
      : getJakartaDateKey(new Date());
    const monthKey = dateKey.slice(0, 7);

    const staffMembers = await prisma.businessMember.findMany({
      where: { businessId: auth.businessId, role: "Staff" },
      select: { userId: true, user: { select: { name: true } } },
    });
    const staffNameByUserId = new Map(
      staffMembers.map((member) => [
        member.userId,
        member.user.name?.trim() || `Staff #${member.userId}`,
      ]),
    );
    const staffIdByUuid = buildStaffIdByUuid(
      staffMembers.map((member) => member.userId),
    );

    const rows = await prisma.$queryRaw<TaskRow[]>`
      SELECT
        pt.staff_id::text AS staff_id,
        pt.stage,
        pt.token_amount,
        pt.completed_at,
        bo.order_status,
        bo.external_id,
        bo.booking_code,
        bo.customer_name,
        bo.delivery_date::text AS delivery_date
      FROM production_tasks pt
      JOIN bakery_orders bo
        ON pt.order_id = COALESCE(
          bo.order_uuid,
          md5('order:' || bo.business_id || ':' || bo.external_id)::uuid
        )
      WHERE bo.business_id = ${auth.businessId}
        AND bo.deleted_at IS NULL
        AND COALESCE(bo.order_status, '') <> 'Cancelled'
        AND pt.staff_id IS NOT NULL
        AND (
          (
            pt.completed_at IS NULL
            AND (
              COALESCE(bo.order_status, '') NOT IN ('Ready', 'Delivery', 'Delivered', 'Completed')
              OR to_char(bo.delivery_date, 'YYYY-MM') = ${monthKey}
            )
          )
          OR to_char(pt.completed_at AT TIME ZONE 'UTC' AT TIME ZONE ${BUSINESS_TIME_ZONE}, 'YYYY-MM') = ${monthKey}
        )
    `;

    const reportByStaff = new Map<number, StaffTokenReportRow>();
    const ensureRow = (staffUserId: number): StaffTokenReportRow => {
      const existing = reportByStaff.get(staffUserId);
      if (existing) return existing;
      const created: StaffTokenReportRow = {
        staffUserId,
        staffName: staffNameByUserId.get(staffUserId) ?? `Staff #${staffUserId}`,
        readyDateToken: 0,
        readyDateTaskCount: 0,
        readyMonthToken: 0,
        pendingToken: 0,
        pendingTaskCount: 0,
        missedToken: 0,
        missedTaskCount: 0,
        readyDateTasks: [],
        missedTasks: [],
      };
      reportByStaff.set(staffUserId, created);
      return created;
    };
    staffMembers.forEach((member) => ensureRow(member.userId));

    for (const row of rows) {
      const staffUserId = row.staff_id ? staffIdByUuid.get(row.staff_id) : undefined;
      // Staff yang sudah dihapus dari tim tidak bisa dipetakan ke nama.
      if (!staffUserId) continue;

      const token = toToken(row.token_amount);
      const entry = ensureRow(staffUserId);

      const task: StaffTokenReportTask = {
        orderId: row.external_id,
        bookingCode: row.booking_code || row.external_id,
        customerName: row.customer_name || "Customer",
        deliveryDate: row.delivery_date || "",
        stage: row.stage,
        token,
        completedAt: row.completed_at ? row.completed_at.toISOString() : null,
      };

      if (!row.completed_at) {
        // Order sudah lewat produksi tapi tahap ini tidak pernah ditandai
        // Ready: tokennya tidak masuk ke staff.
        if (FINISHED_ORDER_STATUSES.has(row.order_status ?? "")) {
          entry.missedToken += token;
          entry.missedTaskCount += 1;
          entry.missedTasks.push(task);
        } else {
          entry.pendingToken += token;
          entry.pendingTaskCount += 1;
        }
        continue;
      }

      entry.readyMonthToken += token;
      if (getJakartaDateKey(row.completed_at) !== dateKey) continue;

      entry.readyDateToken += token;
      entry.readyDateTaskCount += 1;
      entry.readyDateTasks.push(task);
    }

    const staff = Array.from(reportByStaff.values())
      .map((entry) => ({
        ...entry,
        readyDateTasks: entry.readyDateTasks.sort((left, right) =>
          String(left.completedAt).localeCompare(String(right.completedAt)),
        ),
        missedTasks: entry.missedTasks.sort((left, right) =>
          left.deliveryDate.localeCompare(right.deliveryDate),
        ),
      }))
      .sort(
        (left, right) =>
          right.readyDateToken - left.readyDateToken ||
          right.readyMonthToken - left.readyMonthToken ||
          left.staffName.localeCompare(right.staffName),
      );

    return NextResponse.json({
      success: true,
      data: {
        date: dateKey,
        month: monthKey,
        staff,
      },
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (isForbiddenError(error)) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("GET /api/bakery/production/staff-token-report error:", error);
    return NextResponse.json(
      { error: "Gagal memuat laporan token staff" },
      { status: 500 },
    );
  }
}
