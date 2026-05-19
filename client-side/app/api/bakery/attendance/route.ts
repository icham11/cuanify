import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  AuthError,
  ForbiddenError,
  requireAuth,
} from "@/lib/auth/session";
import {
  getBakeryBusinessSettings,
  upsertBakeryBusinessSettings,
} from "@/lib/bakery/settings";
import {
  calculateAttendanceMetrics,
  DEFAULT_ATTENDANCE_WINDOW_START,
  getEligibleAttendanceDates,
  getAttendanceWindowState,
  getDateDiffInDaysInclusive,
  getJakartaDateKey,
  getManualLateCountForMonth,
  getManualLateCountForRange,
  getMonthKeysInRange,
  isDateKey,
  isHolidayDate,
  normalizeAttendanceDateKey,
  isAttendanceRecordLate,
} from "@/lib/bakery/attendance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

type AttendancePatchBody = {
  action?: "upsert-record" | "set-manual-late-count" | "reset-late-for-user";
  userId?: unknown;
  date?: unknown;
  checkInTime?: unknown;
  monthKey?: unknown;
  manualLateCount?: unknown;
  from?: unknown;
  to?: unknown;
  notes?: unknown;
};

function parseMonthKey(value: string | null): {
  monthKey: string;
  start: string;
  end: string;
} {
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
      isExactMonthScope: false,
      monthKey: null,
      scopeLabel:
        start.slice(0, 7) === end.slice(0, 7) ? start.slice(0, 7) : `${start}:${end}`,
      start,
      end,
      totalDays: getDateDiffInDaysInclusive(start, end),
    };
  }

  const { monthKey, start, end } = parseMonthKey(searchParams.get("month"));
  return {
    isExactMonthScope: true,
    monthKey,
    scopeLabel: monthKey,
    start,
    end,
    totalDays: getDateDiffInDaysInclusive(start, end),
  };
}

function parseAttendanceRangeFromInput(input: {
  monthKey?: unknown;
  from?: unknown;
  to?: unknown;
}) {
  const fromParam =
    typeof input.from === "string" ? input.from.trim() : null;
  const toParam = typeof input.to === "string" ? input.to.trim() : null;

  if (isDateKey(fromParam) && isDateKey(toParam)) {
    const [start, end] =
      fromParam <= toParam ? [fromParam, toParam] : [toParam, fromParam];
    return {
      isExactMonthScope: false,
      monthKey: null,
      start,
      end,
    };
  }

  const monthInput =
    typeof input.monthKey === "string" ? input.monthKey.trim() : null;
  const { monthKey, start, end } = parseMonthKey(monthInput);
  return {
    isExactMonthScope: true,
    monthKey,
    start,
    end,
  };
}

function normalizeAttendanceTimeInput(
  value: unknown,
  fallback = DEFAULT_ATTENDANCE_WINDOW_START,
) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!/^\d{2}:\d{2}$/.test(raw)) return fallback;

  const [hour, minute] = raw.split(":").map(Number);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return fallback;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function buildAttendanceTimestamp(dateKey: string, timeValue: string) {
  return new Date(`${dateKey}T${timeValue}:00+07:00`);
}

function mergeAttendanceNotes(
  currentNote: string | null,
  nextNote: string | null,
) {
  const current = currentNote?.trim() ?? "";
  const next = nextNote?.trim() ?? "";
  if (!current) return next || null;
  if (!next) return current;
  if (current === next) return current;
  return `${current}\n${next}`;
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

async function getAttendanceRows(
  businessId: number,
  start: string,
  end: string,
  userId?: number,
) {
  if (userId) {
    return prisma.$queryRaw<AttendanceRow[]>`
      SELECT *
      FROM bakery_attendance
      WHERE business_id = ${businessId}
        AND user_id = ${userId}
        AND attendance_date >= ${start}::date
        AND attendance_date <= ${end}::date
      ORDER BY attendance_date ASC, check_in_at ASC
    `;
  }

  return prisma.$queryRaw<AttendanceRow[]>`
    SELECT *
    FROM bakery_attendance
    WHERE business_id = ${businessId}
      AND attendance_date >= ${start}::date
      AND attendance_date <= ${end}::date
    ORDER BY attendance_date ASC, check_in_at ASC
  `;
}

async function getOwnerAttendanceSummary(
  businessId: number,
  rangeStart: string,
  rangeEnd: string,
  monthKey: string | null,
) {
  const settings = await getBakeryBusinessSettings(businessId);
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

  const rows = await getAttendanceRows(businessId, rangeStart, rangeEnd);
  const rowsByUser = new Map<number, AttendanceRow[]>();

  rows.forEach((row) => {
    const bucket = rowsByUser.get(row.user_id) ?? [];
    bucket.push(row);
    rowsByUser.set(row.user_id, bucket);
  });

  return {
    settings,
    team: members.map((member) => {
      const userRows = rowsByUser.get(member.userId) ?? [];
      const manualLateCount = getManualLateCountForRange(
        settings,
        member.userId,
        rangeStart,
        rangeEnd,
      );
      const scopedManualLateCount = monthKey
        ? getManualLateCountForMonth(settings, member.userId, monthKey)
        : manualLateCount;
      const metrics = calculateAttendanceMetrics({
        rows: userRows,
        rangeStart,
        rangeEnd,
        settings,
        memberSinceDate: normalizeAttendanceDateKey(member.createdAt),
        manualLateCount: scopedManualLateCount ?? undefined,
      });

      return {
        memberId: member.id,
        userId: member.userId,
        name: member.user.name || "Team Member",
        email: member.user.email || "",
        role: member.role,
        attendanceCount: metrics.attendanceCount,
        expectedAttendanceDays: metrics.expectedAttendanceDays,
        lateCount: metrics.lateCount,
        systemLateCount: metrics.systemLateCount,
        manualLateCount: metrics.manualLateCount,
        isManualOverride: metrics.isManualOverride,
        missingDates: metrics.missingDates,
        daily: userRows.map((row) => ({
          date: normalizeAttendanceDateKey(row.attendance_date),
          status: row.status,
          checkInAt: row.check_in_at,
          isLate: isAttendanceRecordLate(row, settings),
          notes: row.notes,
        })),
      };
    }),
  };
}

async function getSelfAttendanceSummary(
  businessId: number,
  userId: number,
  rangeStart: string,
  rangeEnd: string,
  monthKey: string | null,
) {
  const settings = await getBakeryBusinessSettings(businessId);
  const rows = await getAttendanceRows(businessId, rangeStart, rangeEnd, userId);
  const todayKey = getJakartaDateKey(new Date());
  const todayRecord =
    rows.find(
      (row) => normalizeAttendanceDateKey(row.attendance_date) === todayKey,
    ) ?? null;
  const membership = await prisma.businessMember.findFirst({
    where: {
      businessId,
      userId,
    },
    select: {
      createdAt: true,
      role: true,
    },
  });
  const manualLateCount = getManualLateCountForRange(
    settings,
    userId,
    rangeStart,
    rangeEnd,
  );
  const scopedManualLateCount = monthKey
    ? getManualLateCountForMonth(settings, userId, monthKey)
    : manualLateCount;
  const metrics = calculateAttendanceMetrics({
    rows,
    rangeStart,
    rangeEnd,
    settings,
    memberSinceDate: membership?.createdAt
      ? normalizeAttendanceDateKey(membership.createdAt)
      : null,
    manualLateCount: scopedManualLateCount ?? undefined,
  });

  return {
    settings,
    attendanceCount: metrics.attendanceCount,
    expectedAttendanceDays: metrics.expectedAttendanceDays,
    lateCount: metrics.lateCount,
    systemLateCount: metrics.systemLateCount,
    manualLateCount: metrics.manualLateCount,
    isManualOverride: metrics.isManualOverride,
    missingDates: metrics.missingDates,
    records: rows.map((row) => ({
      date: normalizeAttendanceDateKey(row.attendance_date),
      status: row.status,
      checkInAt: row.check_in_at,
      isLate: isAttendanceRecordLate(row, settings),
      notes: row.notes,
    })),
    todayRecord: todayRecord
      ? {
          date: normalizeAttendanceDateKey(todayRecord.attendance_date),
          status: todayRecord.status,
          checkInAt: todayRecord.check_in_at,
          isLate: isAttendanceRecordLate(todayRecord, settings),
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
    const { scopeLabel, start, end, totalDays, monthKey } = parseAttendanceRange(
      url.searchParams,
    );

    if (auth.role === "Owner") {
      const summary = await getOwnerAttendanceSummary(
        auth.businessId,
        start,
        end,
        monthKey,
      );
      return NextResponse.json({
        success: true,
        data: {
          mode: "owner",
          month: scopeLabel,
          rangeStart: start,
          rangeEnd: end,
          totalDays,
          attendanceWindow: getAttendanceWindowState(summary.settings),
          team: summary.team,
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
      monthKey,
    );
    const { settings, ...selfData } = self;

    return NextResponse.json({
      success: true,
      data: {
        mode: "self",
        month: scopeLabel,
        rangeStart: start,
        rangeEnd: end,
        totalDays,
        attendanceWindow: getAttendanceWindowState(settings),
        attendanceWindowEnabled: settings.attendanceWindowEnabled,
        attendanceWindowStart: settings.attendanceWindowStart,
        attendanceWindowEnd: settings.attendanceWindowEnd,
        ...selfData,
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

    const settings = await getBakeryBusinessSettings(auth.businessId);
    const windowState = getAttendanceWindowState(settings);
    const todayKey = windowState.todayKey;

    if (isHolidayDate(todayKey, settings)) {
      return NextResponse.json(
        { error: "Hari ini ditandai libur. Absensi tidak dibutuhkan." },
        { status: 400 },
      );
    }

    if (settings.attendanceWindowEnabled !== false) {
      if (!windowState.hasWindowStarted) {
        return NextResponse.json(
          { error: `Absensi dibuka mulai jam ${windowState.startTime} WIB.` },
          { status: 400 },
        );
      }
      if (!windowState.canCheckInNow) {
        return NextResponse.json(
          { error: `Jam absensi hari ini sudah tutup pada ${windowState.endTime} WIB.` },
          { status: 400 },
        );
      }
    }

    const body = (await request.json().catch(() => ({}))) as { notes?: string };
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
    return NextResponse.json({
      success: true,
      data: {
        date: normalizeAttendanceDateKey(record.attendance_date),
        status: record.status,
        checkInAt: record.check_in_at,
        isLate: isAttendanceRecordLate(record, settings),
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

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth();
    await ensureAttendanceTable();

    if (auth.role !== "Owner") {
      throw new ForbiddenError("Hanya owner yang bisa mengubah absensi staff.");
    }

    const body = (await request.json().catch(() => ({}))) as AttendancePatchBody;
    const action = body.action ?? "upsert-record";
    const userId = Number(body.userId);

    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json(
        { error: "Staff yang dipilih tidak valid." },
        { status: 400 },
      );
    }

    const membership = await prisma.businessMember.findFirst({
      where: {
        businessId: auth.businessId,
        userId,
        role: { in: ["Admin", "Staff"] },
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "Admin/staff untuk aksi absensi tidak ditemukan." },
        { status: 404 },
      );
    }

    if (action === "upsert-record") {
      const date =
        typeof body.date === "string" ? body.date.trim() : "";
      if (!isDateKey(date)) {
        return NextResponse.json(
          { error: "Tanggal absensi tidak valid. Gunakan format YYYY-MM-DD." },
          { status: 400 },
        );
      }

      const settings = await getBakeryBusinessSettings(auth.businessId);
      const checkInTime = normalizeAttendanceTimeInput(
        body.checkInTime,
        settings.attendanceWindowStart || DEFAULT_ATTENDANCE_WINDOW_START,
      );
      const note =
        typeof body.notes === "string" && body.notes.trim().length > 0
          ? body.notes.trim().slice(0, 200)
          : null;
      const checkInAt = buildAttendanceTimestamp(date, checkInTime);

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
          ${userId},
          ${date}::date,
          'present',
          ${checkInAt},
          ${note},
          NOW(),
          NOW()
        )
        ON CONFLICT (business_id, user_id, attendance_date)
        DO UPDATE SET
          status = EXCLUDED.status,
          check_in_at = EXCLUDED.check_in_at,
          notes = EXCLUDED.notes,
          updated_at = NOW()
      `;

      return NextResponse.json({
        success: true,
        data: {
          action,
          userId,
          date,
          checkInTime,
          message: `Absensi ${membership.user.name || membership.user.email || `User #${userId}`} diperbarui.`,
        },
      });
    }

    if (action === "set-manual-late-count") {
      const settings = await getBakeryBusinessSettings(auth.businessId);
      const monthKey =
        typeof body.monthKey === "string" && /^\d{4}-\d{2}$/.test(body.monthKey.trim())
          ? body.monthKey.trim()
          : getJakartaDateKey(new Date()).slice(0, 7);
      const manualLateCount = Math.max(
        0,
        Math.round(Number(body.manualLateCount) || 0),
      );
      const note =
        typeof body.notes === "string" ? body.notes.trim().slice(0, 200) : "";

      const filtered = settings.attendanceReconciliation.filter(
        (entry) =>
          !(
            entry.staffUserId === userId &&
            entry.monthKey === monthKey
          ),
      );

      if (manualLateCount > 0 || note.length > 0) {
        filtered.push({
          id: `${monthKey}-${userId}`,
          monthKey,
          staffUserId: userId,
          staffName:
            membership.user.name?.trim() ||
            membership.user.email?.trim() ||
            `User #${userId}`,
          manualLateCount,
          note,
        });
      }

      await upsertBakeryBusinessSettings({
        businessId: auth.businessId,
        userId: auth.userId,
        input: {
          attendanceReconciliation: filtered,
        },
      });

      return NextResponse.json({
        success: true,
        data: {
          action,
          userId,
          monthKey,
          manualLateCount,
          message: `Override telat untuk ${membership.user.name || membership.user.email || `User #${userId}`} disimpan.`,
        },
      });
    }

    if (action === "reset-late-for-user") {
      const settings = await getBakeryBusinessSettings(auth.businessId);
      const range = parseAttendanceRangeFromInput({
        monthKey: body.monthKey,
        from: body.from,
        to: body.to,
      });
      const rows = await getAttendanceRows(
        auth.businessId,
        range.start,
        range.end,
        userId,
      );
      const rowsByDate = new Map(
        rows.map((row) => [normalizeAttendanceDateKey(row.attendance_date), row]),
      );
      const memberSinceDate = normalizeAttendanceDateKey(membership.createdAt);
      const eligibleDates = getEligibleAttendanceDates({
        rangeStart: range.start,
        rangeEnd: range.end,
        settings,
        memberSinceDate,
      });
      const lateRows = rows.filter((row) => isAttendanceRecordLate(row, settings));
      const missingDates = eligibleDates.filter((dateKey) => !rowsByDate.has(dateKey));
      const resetTime = normalizeAttendanceTimeInput(
        settings.attendanceWindowStart,
        DEFAULT_ATTENDANCE_WINDOW_START,
      );
      const actionNoteBase =
        typeof body.notes === "string" && body.notes.trim().length > 0
          ? body.notes.trim().slice(0, 200)
          : "Reset telat oleh owner";

      await prisma.$transaction(async (tx) => {
        for (const row of lateRows) {
          const attendanceDate = normalizeAttendanceDateKey(row.attendance_date);
          await tx.$executeRaw`
            UPDATE bakery_attendance
            SET
              check_in_at = ${buildAttendanceTimestamp(attendanceDate, resetTime)},
              notes = ${mergeAttendanceNotes(row.notes, actionNoteBase)},
              updated_at = NOW()
            WHERE business_id = ${auth.businessId}
              AND user_id = ${userId}
              AND attendance_date = ${attendanceDate}::date
          `;
        }

        for (const dateKey of missingDates) {
          await tx.$executeRaw`
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
              ${userId},
              ${dateKey}::date,
              'present',
              ${buildAttendanceTimestamp(dateKey, resetTime)},
              ${actionNoteBase},
              NOW(),
              NOW()
            )
            ON CONFLICT (business_id, user_id, attendance_date)
            DO UPDATE SET
              status = EXCLUDED.status,
              check_in_at = EXCLUDED.check_in_at,
              notes = EXCLUDED.notes,
              updated_at = NOW()
          `;
        }
      });

      const monthKeys = getMonthKeysInRange(range.start, range.end);
      const nextReconciliation = settings.attendanceReconciliation.filter(
        (entry) =>
          !(
            entry.staffUserId === userId &&
            monthKeys.includes(entry.monthKey)
          ),
      );

      await upsertBakeryBusinessSettings({
        businessId: auth.businessId,
        userId: auth.userId,
        input: {
          attendanceReconciliation: nextReconciliation,
        },
      });

      return NextResponse.json({
        success: true,
        data: {
          action,
          userId,
          rangeStart: range.start,
          rangeEnd: range.end,
          updatedLateRecords: lateRows.length,
          insertedMissingRecords: missingDates.length,
          clearedManualMonths: monthKeys.length,
          message: `Reset telat untuk ${membership.user.name || membership.user.email || `User #${userId}`} selesai.`,
        },
      });
    }

    return NextResponse.json(
      { error: "Aksi absensi tidak dikenali." },
      { status: 400 },
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("PATCH /api/bakery/attendance error:", error);
    return NextResponse.json(
      { error: "Gagal mengubah data absensi staff" },
      { status: 500 },
    );
  }
}
