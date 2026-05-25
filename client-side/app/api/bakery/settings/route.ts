import { NextRequest, NextResponse } from "next/server";
import {
  AuthError,
  ForbiddenError,
  requireAuth,
  requireRole,
} from "@/lib/auth/session";
import {
  getDefaultBakerySettings,
  getBakeryBusinessSettings,
  getCachedBakeryBusinessSettings,
  rememberBakeryBusinessSettings,
  upsertBakeryBusinessSettings,
  type BakeryHolidaySetting,
  type BakeryOperationalExpenseSetting,
  type BakeryStaffSetting,
  type BakeryAttendanceReconciliation,
} from "@/lib/bakery/settings";
import { syncCapacityMaxTokenForBusiness } from "@/lib/bookings/token-capacity-service";
import {
  normalizeProductionStageProfiles,
  type ProductionStageCategoryProfile,
} from "@/lib/bookings/production-stages";
import {
  DatabaseTemporarilyUnavailableError,
  isPrismaConnectionTimeout,
  prismaConnectionErrorResponse,
} from "@/lib/prisma-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeHolidayEntriesInput(value: unknown): BakeryHolidaySetting[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const record = entry as Record<string, unknown>;
      return {
        date: typeof record.date === "string" ? record.date.trim() : "",
        label: typeof record.label === "string" ? record.label.trim() : "",
        tag: typeof record.tag === "string" ? record.tag.trim() : "",
      };
    })
    .filter((entry): entry is BakeryHolidaySetting => Boolean(entry));
}

function normalizeStaffSettingsInput(value: unknown): BakeryStaffSetting[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const record = entry as Record<string, unknown>;
      return {
        userId: Number(record.userId),
        name: typeof record.name === "string" ? record.name : "",
        role: typeof record.role === "string" ? record.role : "",
        dailyTokenLimit: Number(record.dailyTokenLimit),
        monthlySalary: Number(record.monthlySalary),
        mealAllowance: Number(record.mealAllowance),
        takeHomePay: Number(record.takeHomePay),
        isActive: record.isActive !== false,
      };
    })
    .filter((entry): entry is BakeryStaffSetting => Boolean(entry));
}

function normalizeMonthlyExpensesInput(
  value: unknown,
): BakeryOperationalExpenseSetting[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const record = entry as Record<string, unknown>;
      return {
        id: typeof record.id === "string" ? record.id : "",
        monthKey: typeof record.monthKey === "string" ? record.monthKey : "",
        name: typeof record.name === "string" ? record.name : "",
        amount: Number(record.amount),
        category:
          record.category === "ads" ||
          record.category === "custom"
            ? record.category
            : "custom",
        note: typeof record.note === "string" ? record.note : "",
      };
    })
    .filter((entry): entry is BakeryOperationalExpenseSetting => Boolean(entry));
}

function normalizeProductionStageProfilesInput(
  value: unknown,
): ProductionStageCategoryProfile[] {
  return normalizeProductionStageProfiles(value);
}

function normalizeAttendanceReconciliationInput(
  value: unknown,
): BakeryAttendanceReconciliation[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const record = entry as Record<string, unknown>;
      return {
        id: typeof record.id === "string" ? record.id : "",
        monthKey: typeof record.monthKey === "string" ? record.monthKey : "",
        staffUserId: Number(record.staffUserId),
        staffName: typeof record.staffName === "string" ? record.staffName : "",
        manualLateCount: Math.max(0, Number(record.manualLateCount) || 0),
        note: typeof record.note === "string" ? record.note : "",
      };
    })
    .filter((entry): entry is BakeryAttendanceReconciliation => Boolean(entry));
}

export async function GET() {
  try {
    const auth = await requireAuth();

    const settings = await getBakeryBusinessSettings(auth.businessId);
    rememberBakeryBusinessSettings(auth.businessId, settings);

    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (
      error instanceof DatabaseTemporarilyUnavailableError ||
      isPrismaConnectionTimeout(error)
    ) {
      const auth = await requireAuth().catch(() => null);
      const cachedSettings = auth
        ? getCachedBakeryBusinessSettings(auth.businessId)
        : null;

      if (cachedSettings) {
        return NextResponse.json({
          success: true,
          data: cachedSettings,
          stale: true,
          source: "memory-cache-fallback",
        });
      }

      if (auth) {
        return NextResponse.json({
          success: true,
          data: getDefaultBakerySettings(),
          stale: true,
          source: "default-fallback",
        });
      }

      return prismaConnectionErrorResponse(
        "Koneksi database timeout saat memuat bakery settings.",
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to load bakery settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth();
    requireRole(auth, "Owner");

    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    const nextSettings = await upsertBakeryBusinessSettings({
      businessId: auth.businessId,
      userId: auth.userId,
      input: {
        dailyProductionTokenLimit:
          body.dailyProductionTokenLimit !== undefined
            ? Number(body.dailyProductionTokenLimit)
            : undefined,
        staffDailyTokenLimit:
          body.staffDailyTokenLimit !== undefined
            ? Number(body.staffDailyTokenLimit)
            : undefined,
        cutoffHour:
          body.cutoffHour !== undefined ? Number(body.cutoffHour) : undefined,
        cutoffEnabled:
          body.cutoffEnabled !== undefined
            ? Boolean(body.cutoffEnabled)
            : undefined,
        attendanceWindowEnabled:
          body.attendanceWindowEnabled !== undefined
            ? Boolean(body.attendanceWindowEnabled)
            : undefined,
        attendanceWindowStart:
          body.attendanceWindowStart !== undefined
            ? String(body.attendanceWindowStart)
            : undefined,
        attendanceWindowEnd:
          body.attendanceWindowEnd !== undefined
            ? String(body.attendanceWindowEnd)
            : undefined,
        defaultDpPercentage:
          body.defaultDpPercentage !== undefined
            ? Number(body.defaultDpPercentage)
            : undefined,
        notifyProductionWhatsapp:
          body.notifyProductionWhatsapp !== undefined
            ? Boolean(body.notifyProductionWhatsapp)
            : undefined,
        holidayEntries:
          body.holidayEntries !== undefined
            ? normalizeHolidayEntriesInput(body.holidayEntries)
            : undefined,
        blockedDates:
          body.blockedDates !== undefined && Array.isArray(body.blockedDates)
            ? body.blockedDates
            : undefined,
        staffSettings:
          body.staffSettings !== undefined
            ? normalizeStaffSettingsInput(body.staffSettings)
            : undefined,
        monthlyExpenses:
          body.monthlyExpenses !== undefined
            ? normalizeMonthlyExpensesInput(body.monthlyExpenses)
            : undefined,
        productionStageProfiles:
          body.productionStageProfiles !== undefined
            ? normalizeProductionStageProfilesInput(body.productionStageProfiles)
            : undefined,
        attendanceReconciliation:
          body.attendanceReconciliation !== undefined
            ? normalizeAttendanceReconciliationInput(body.attendanceReconciliation)
            : undefined,
      },
    });

    if (body.dailyProductionTokenLimit !== undefined) {
      await syncCapacityMaxTokenForBusiness(
        auth.businessId,
        nextSettings.dailyProductionTokenLimit,
      );
    }

    rememberBakeryBusinessSettings(auth.businessId, nextSettings);

    return NextResponse.json({ success: true, data: nextSettings });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (
      error instanceof DatabaseTemporarilyUnavailableError ||
      isPrismaConnectionTimeout(error)
    ) {
      return prismaConnectionErrorResponse(
        "Koneksi database timeout saat mengubah bakery settings.",
      );
    }

    const message =
      error instanceof Error
        ? error.message
        : "Failed to update bakery settings";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
