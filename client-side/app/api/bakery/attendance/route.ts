import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  AuthError,
  ForbiddenError,
  requireAuth,
} from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BUSINESS_TIME_ZONE = "Asia/Jakarta";
const LATE_THRESHOLD_HOUR = 9;

type AttendanceStatus = "present";

type AttendanceRow = {
  id: number;
  business_id: number;
  user_id: number;
  attendance_date: string | Date;
  status: AttendanceStatus;
  check_in_at: Date;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
};

function isDateKey(value: string | null): value is string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "");
}

function getDateDiffInDaysInclusive(start: string, end: string) {
  const [startYear, startMonth, startDay] = start.split("-").map(Number);
  const [endYear, endMonth, endDay] = end.split("-").map(Number);
  const startUtc = Date.UTC(startYear, startMonth - 1, startDay);
  const endUtc = Date.UTC(endYear, endMonth - 1, endDay);
  return Math.max(1, Math.floor((endUtc - startUtc) / 86400000) + 1);
}

function parseMonthKey(value: string | null): { monthKey: string; start: string; end: string } {
  const today = getJakartaDateKey(new Date()).slice(0, 7);
  const monthKey = /^\d{4}-\d{2}$/.test(value || "") ? (value as string) : today;
  const [year, month] = monthKey.split("-").map(Number);
  const start = `${monthKey}-01`;
  const end = new Date(year, month, 0).toISOString().slice(0, 10);
  return { monthKey, start, end };
}

function parseAttendanceRange(searchParams: URLSearchParams) {
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  if (isDateKey(fromParam) && isDateKey(toParam)) {
    const [start, end] = fromParam <= toParam ? [fromParam, toParam] : [toParam, fromParam];
    return {
      scopeLabel:
        start.slice(0, 7) === end.slice(0, 7) ? start.slice(0, 7) : `${start}:${end}`,
      start,
      end,
      totalDays: getDateDiffInDaysInclusive(start, end),
    };
  }

  const { monthKey, start, end } = parseMonthKey(searchParams.get("month"));
  return {
    scopeLabel: monthKey,
    start,
    end,
    totalDays: getDateDiffInDaysInclusive(start, end),
  };
}

function getJakartaParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function getJakartaDateKey(date: Date) {
  const parts = getJakartaParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function normalizeAttendanceDateKey(value: string | Date) {
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
    return value;
  }

  return value.toISOString().slice(0, 10);
}

async function ensureAttendanceTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS bakery_attendance (
      id BIGSERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      attendance_date DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'present',
      check_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      notes TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (business_id, user_id, attendance_date)
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_bakery_attendance_business_month
    ON bakery_attendance (business_id, attendance_date);
  `);
}

async function getOwnerAttendanceSummary(
  businessId: number,
  monthStart: string,
  monthEnd: string,
) {
  const members = await prisma.businessMember.findMany({
    where: {
      businessId,
      role: { in: ["Admin", "Staff"] },
    },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
    orderBy: [{ role: "asc" }, { user: { name: "asc" } }],
  });

  const rows = await prisma.$queryRaw<AttendanceRow[]>`
    SELECT *
    FROM bakery_attendance
    WHERE business_id = ${businessId}
      AND attendance_date >= ${monthStart}::date
      AND attendance_date <= ${monthEnd}::date
    ORDER BY attendance_date ASC, check_in_at ASC
  `;

  const rowsByUser = new Map<number, AttendanceRow[]>();
  rows.forEach((row) => {
    const bucket = rowsByUser.get(row.user_id) ?? [];
    bucket.push(row);
    rowsByUser.set(row.user_id, bucket);
  });

  return members.map((member) => {
    const userRows = rowsByUser.get(member.userId) ?? [];
    const daily = userRows.map((row) => {
      const localParts = getJakartaParts(new Date(row.check_in_at));
      return {
        date: normalizeAttendanceDateKey(row.attendance_date),
        status: row.status,
        checkInAt: row.check_in_at,
        isLate: localParts.hour >= LATE_THRESHOLD_HOUR,
      };
    });

    return {
      memberId: member.id,
      userId: member.userId,
      name: member.user.name || "Team Member",
      email: member.user.email || "",
      role: member.role,
      attendanceCount: daily.length,
      lateCount: daily.filter((entry) => entry.isLate).length,
      daily,
    };
  });
}

async function getSelfAttendanceSummary(
  businessId: number,
  userId: number,
  monthStart: string,
  monthEnd: string,
) {
  const rows = await prisma.$queryRaw<AttendanceRow[]>`
    SELECT *
    FROM bakery_attendance
    WHERE business_id = ${businessId}
      AND user_id = ${userId}
      AND attendance_date >= ${monthStart}::date
      AND attendance_date <= ${monthEnd}::date
    ORDER BY attendance_date ASC, check_in_at ASC
  `;

  const todayKey = getJakartaDateKey(new Date());
  const todayRecord =
    rows.find(
      (row) => normalizeAttendanceDateKey(row.attendance_date) === todayKey,
    ) ?? null;

  return {
    attendanceCount: rows.length,
    lateCount: rows.filter((row) => {
      const localParts = getJakartaParts(new Date(row.check_in_at));
      return localParts.hour >= LATE_THRESHOLD_HOUR;
    }).length,
    records: rows.map((row) => ({
      date: normalizeAttendanceDateKey(row.attendance_date),
      status: row.status,
      checkInAt: row.check_in_at,
      isLate: getJakartaParts(new Date(row.check_in_at)).hour >= LATE_THRESHOLD_HOUR,
      notes: row.notes,
    })),
    todayRecord: todayRecord
      ? {
          date: normalizeAttendanceDateKey(todayRecord.attendance_date),
          status: todayRecord.status,
          checkInAt: todayRecord.check_in_at,
          isLate:
            getJakartaParts(new Date(todayRecord.check_in_at)).hour >=
            LATE_THRESHOLD_HOUR,
          notes: todayRecord.notes,
        }
      : null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    await ensureAttendanceTable();

    const url = new URL(request.url);
    const { scopeLabel, start, end, totalDays } = parseAttendanceRange(
      url.searchParams,
    );

    if (auth.role === "Owner") {
      const team = await getOwnerAttendanceSummary(auth.businessId, start, end);
      return NextResponse.json({
        success: true,
        data: {
          mode: "owner",
          month: scopeLabel,
          rangeStart: start,
          rangeEnd: end,
          totalDays,
          team,
        },
      });
    }

    if (auth.role !== "Admin" && auth.role !== "Staff") {
      throw new ForbiddenError("Akses absensi ditolak.");
    }

    const self = await getSelfAttendanceSummary(
      auth.businessId,
      auth.userId,
      start,
      end,
    );

    return NextResponse.json({
      success: true,
      data: {
        mode: "self",
        month: scopeLabel,
        rangeStart: start,
        rangeEnd: end,
        totalDays,
        ...self,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("GET /api/bakery/attendance error:", error);
    return NextResponse.json(
      { error: "Gagal memuat data absensi" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    await ensureAttendanceTable();

    if (auth.role !== "Admin" && auth.role !== "Staff") {
      throw new ForbiddenError("Hanya admin/staff yang bisa melakukan absensi.");
    }

    const body = (await request.json().catch(() => ({}))) as { notes?: string };
    const todayKey = getJakartaDateKey(new Date());
    const now = new Date();
    const note = typeof body.notes === "string" ? body.notes.trim().slice(0, 200) : null;

    await prisma.$executeRaw`
      INSERT INTO bakery_attendance (
        business_id,
        user_id,
        attendance_date,
        status,
        check_in_at,
        notes,
        created_at,
        updated_at
      )
      VALUES (
        ${auth.businessId},
        ${auth.userId},
        ${todayKey}::date,
        'present',
        ${now},
        ${note},
        NOW(),
        NOW()
      )
      ON CONFLICT (business_id, user_id, attendance_date)
      DO NOTHING
    `;

    const rows = await prisma.$queryRaw<AttendanceRow[]>`
      SELECT *
      FROM bakery_attendance
      WHERE business_id = ${auth.businessId}
        AND user_id = ${auth.userId}
        AND attendance_date = ${todayKey}::date
      LIMIT 1
    `;

    const record = rows[0];
    const localParts = getJakartaParts(new Date(record.check_in_at));

    return NextResponse.json({
      success: true,
      data: {
        date: normalizeAttendanceDateKey(record.attendance_date),
        status: record.status,
        checkInAt: record.check_in_at,
        isLate: localParts.hour >= LATE_THRESHOLD_HOUR,
        notes: record.notes,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("POST /api/bakery/attendance error:", error);
    return NextResponse.json(
      { error: "Gagal menyimpan absensi" },
      { status: 500 },
    );
  }
}
