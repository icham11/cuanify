import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  normalizeProductionStageProfiles,
  type ProductionStageCategoryProfile,
} from "@/lib/bookings/production-stages";
import {
  BAKERY_BLOCKED_DATES,
  BAKERY_DAILY_PRODUCTION_TOKEN_LIMIT,
  BAKERY_H_MINUS_1_CUTOFF_HOUR,
  BAKERY_STAFF_DAILY_TOKEN_LIMIT,
} from "@/lib/bookings/config";

const BAKERY_SETTINGS_SOURCE_TYPE = "bakery_settings";

const MIN_DAILY_TOKEN_LIMIT = 1;
const MAX_DAILY_TOKEN_LIMIT = 10_000;
const MIN_PERCENT = 0;
const MAX_PERCENT = 100;
const MIN_CUTOFF_HOUR = 0;
const MAX_CUTOFF_HOUR = 23;
const DEFAULT_ATTENDANCE_WINDOW_START = "06:00";
const DEFAULT_ATTENDANCE_WINDOW_END = "07:00";
// Tentukan global scope Map cache untuk menyimpan data pengaturan bisnis bakery beserta timestamp pengambilannya
const globalForBakerySettingsCache = globalThis as typeof globalThis & {
  __bakeryBusinessSettingsCache?: Map<
    number,
    { settings: BakeryBusinessSettings; fetchedAt: number }
  >;
};

// Ambil instansi cache Map global, buat baru jika belum terinisialisasi di memori server
function getBakeryBusinessSettingsCache() {
  if (!globalForBakerySettingsCache.__bakeryBusinessSettingsCache) {
    globalForBakerySettingsCache.__bakeryBusinessSettingsCache = new Map();
  }
  return globalForBakerySettingsCache.__bakeryBusinessSettingsCache;
}

export interface BakeryStaffSetting {
  userId: number;
  name: string;
  role: string;
  dailyTokenLimit: number;
  monthlySalary: number;
  mealAllowance: number;
  takeHomePay: number;
  isActive: boolean;
}

export interface BakeryOperationalExpenseSetting {
  id: string;
  monthKey: string;
  name: string;
  amount: number;
  category: "refund" | "ads" | "custom";
  note: string;
}

export interface BakeryHolidaySetting {
  date: string;
  label: string;
  tag: string;
}

export interface BakeryAttendanceReconciliation {
  id: string;  // ${monthKey}-${staffUserId}
  monthKey: string;  // YYYY-MM
  staffUserId: number;
  staffName: string;
  manualLateCount: number;  // Input manual dari owner
  note: string;  // Catatan/reason untuk perbedaan
}

export interface BakeryBusinessSettings {
  dailyProductionTokenLimit: number;
  staffDailyTokenLimit: number;
  cutoffHour: number;
  cutoffEnabled: boolean;
  attendanceWindowEnabled: boolean;
  attendanceWindowStart: string;
  attendanceWindowEnd: string;
  defaultDpPercentage: number;
  notifyProductionWhatsapp: boolean;
  blockedDates: string[];
  holidayEntries: BakeryHolidaySetting[];
  staffSettings: BakeryStaffSetting[];
  monthlyExpenses: BakeryOperationalExpenseSetting[];
  attendanceReconciliation: BakeryAttendanceReconciliation[];
  productionStageProfiles: ProductionStageCategoryProfile[];
}

function clampDailyTokenLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return BAKERY_DAILY_PRODUCTION_TOKEN_LIMIT;
  const rounded = Math.round(parsed);
  if (rounded < MIN_DAILY_TOKEN_LIMIT || rounded > MAX_DAILY_TOKEN_LIMIT) {
    return BAKERY_DAILY_PRODUCTION_TOKEN_LIMIT;
  }
  return rounded;
}

function clampStaffTokenLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return BAKERY_STAFF_DAILY_TOKEN_LIMIT;
  const rounded = Math.round(parsed);
  if (rounded < MIN_DAILY_TOKEN_LIMIT || rounded > MAX_DAILY_TOKEN_LIMIT) {
    return BAKERY_STAFF_DAILY_TOKEN_LIMIT;
  }
  return rounded;
}

function clampPercent(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(MIN_PERCENT, Math.min(MAX_PERCENT, Math.round(parsed)));
}

function clampCutoffHour(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return BAKERY_H_MINUS_1_CUTOFF_HOUR;
  const rounded = Math.round(parsed);
  return Math.max(MIN_CUTOFF_HOUR, Math.min(MAX_CUTOFF_HOUR, rounded));
}

function clampMoney(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed));
}

function normalizeAttendanceTime(
  value: unknown,
  fallback: string,
): string {
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

function normalizeMonthKey(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  return /^\d{4}-\d{2}$/.test(raw) ? raw : "";
}

function normalizeBlockedDates(value: unknown): string[] {
  if (!Array.isArray(value)) return [...BAKERY_BLOCKED_DATES];

  const parsed = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry));

  return Array.from(new Set(parsed)).sort();
}

function normalizeHolidayEntries(value: unknown): BakeryHolidaySetting[] {
  if (!Array.isArray(value)) {
    return normalizeBlockedDates(BAKERY_BLOCKED_DATES).map((date) => ({
      date,
      label: "",
      tag: "Libur",
    }));
  }

  const deduped = new Map<string, BakeryHolidaySetting>();

  value.forEach((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
    const record = entry as Record<string, unknown>;
    const date = typeof record.date === "string" ? record.date.trim() : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

    deduped.set(date, {
      date,
      label: typeof record.label === "string" ? record.label.trim() : "",
      tag:
        typeof record.tag === "string" && record.tag.trim().length > 0
          ? record.tag.trim()
          : "Libur",
    });
  });

  return Array.from(deduped.values()).sort((left, right) =>
    left.date.localeCompare(right.date),
  );
}

function normalizeStaffSettings(value: unknown): BakeryStaffSetting[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const record = entry as Record<string, unknown>;
      const userId = Number(record.userId);
      if (!Number.isInteger(userId) || userId <= 0) return null;

      return {
        userId,
        name: typeof record.name === "string" ? record.name.trim() : "",
        role: typeof record.role === "string" ? record.role.trim() : "",
        dailyTokenLimit: clampStaffTokenLimit(record.dailyTokenLimit),
        monthlySalary: clampMoney(record.monthlySalary),
        mealAllowance: clampMoney(record.mealAllowance),
        takeHomePay: clampMoney(record.takeHomePay),
        isActive: record.isActive !== false,
      };
    })
    .filter((entry): entry is BakeryStaffSetting => Boolean(entry))
    .sort((left, right) => left.name.localeCompare(right.name, "id"));
}

function normalizeMonthlyExpenses(
  value: unknown,
): BakeryOperationalExpenseSetting[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const record = entry as Record<string, unknown>;
      const monthKey = normalizeMonthKey(record.monthKey);
      if (!monthKey) return null;

      const category =
        record.category === "refund" || record.category === "ads" || record.category === "custom"
          ? record.category
          : "custom";
      const name =
        typeof record.name === "string" && record.name.trim().length > 0
          ? record.name.trim()
          : category === "refund"
            ? "Retur / Refund"
            : category === "ads"
              ? "Biaya Iklan"
              : "Biaya Custom";

      return {
        id:
          typeof record.id === "string" && record.id.trim().length > 0
            ? record.id.trim()
            : `${monthKey}-${category}-${index + 1}`,
        monthKey,
        name,
        amount: clampMoney(record.amount),
        category,
        note: typeof record.note === "string" ? record.note.trim() : "",
      };
    })
    .filter((entry): entry is BakeryOperationalExpenseSetting => Boolean(entry))
    .sort((left, right) => {
      const monthDiff = left.monthKey.localeCompare(right.monthKey);
      if (monthDiff !== 0) return monthDiff;
      return left.name.localeCompare(right.name, "id");
    });
}

function normalizeAttendanceReconciliation(
  value: unknown,
): BakeryAttendanceReconciliation[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const record = entry as Record<string, unknown>;
      const monthKey = normalizeMonthKey(record.monthKey);
      if (!monthKey) return null;

      const staffUserId = Number(record.staffUserId);
      if (!Number.isInteger(staffUserId) || staffUserId <= 0) return null;

      const id =
        typeof record.id === "string" && record.id.trim().length > 0
          ? record.id.trim()
          : `${monthKey}-${staffUserId}`;

      return {
        id,
        monthKey,
        staffUserId,
        staffName: typeof record.staffName === "string" ? record.staffName.trim() : "",
        manualLateCount: Math.max(0, Math.round(Number(record.manualLateCount || 0))),
        note: typeof record.note === "string" ? record.note.trim() : "",
      };
    })
    .filter((entry): entry is BakeryAttendanceReconciliation => Boolean(entry))
    .sort((left, right) => {
      const monthDiff = left.monthKey.localeCompare(right.monthKey);
      if (monthDiff !== 0) return monthDiff;
      return left.staffName.localeCompare(right.staffName, "id");
    });
}

export function getDefaultBakerySettings(): BakeryBusinessSettings {
  const holidayEntries = normalizeHolidayEntries(
    BAKERY_BLOCKED_DATES.map((date) => ({ date, label: "", tag: "Libur" })),
  );

  return {
    dailyProductionTokenLimit: BAKERY_DAILY_PRODUCTION_TOKEN_LIMIT,
    staffDailyTokenLimit: BAKERY_STAFF_DAILY_TOKEN_LIMIT,
    cutoffHour: BAKERY_H_MINUS_1_CUTOFF_HOUR,
    cutoffEnabled: true,
    attendanceWindowEnabled: true,
    attendanceWindowStart: DEFAULT_ATTENDANCE_WINDOW_START,
    attendanceWindowEnd: DEFAULT_ATTENDANCE_WINDOW_END,
    defaultDpPercentage: 50,
    notifyProductionWhatsapp: true,
    blockedDates: holidayEntries.map((entry) => entry.date),
    holidayEntries,
    staffSettings: [],
    monthlyExpenses: [],
    attendanceReconciliation: [],
    productionStageProfiles: [],
  };
}

// Tentukan durasi maksimal Time-To-Live (TTL) cache di memori server-side: 30 detik
const SERVER_SETTINGS_CACHE_TTL_MS = 30_000;

export function getCachedBakeryBusinessSettings(
  businessId: number,
): BakeryBusinessSettings | null {
  // Ambil record cache untuk bisnis id yang bersangkutan
  const cached = getBakeryBusinessSettingsCache().get(businessId);
  // Jika record cache tidak ditemukan di Map, kembalikan null
  if (!cached) return null;

  // Periksa apakah waktu penyimpanan data cache tersebut sudah melampaui batas TTL 30 detik
  const isExpired = Date.now() - cached.fetchedAt > SERVER_SETTINGS_CACHE_TTL_MS;
  // Jika sudah kedaluwarsa
  if (isExpired) {
    // Hapus data cache lama tersebut dari Map agar kueri berikutnya dipaksa membaca langsung dari database
    getBakeryBusinessSettingsCache().delete(businessId);
    // Kembalikan null
    return null;
  }

  // Jika cache masih fresh (kurang dari 30 detik), kembalikan data pengaturan bisnis bakery yang di-cache
  return cached.settings;
}

export function rememberBakeryBusinessSettings(
  businessId: number,
  settings: BakeryBusinessSettings,
) {
  // Simpan data pengaturan baru ke dalam Map cache server-side beserta timestamp saat ini (fetchedAt)
  getBakeryBusinessSettingsCache().set(businessId, {
    settings,
    fetchedAt: Date.now(), // Catat waktu pengambilan data/penyimpanan cache
  });
}

function parseMetadataToSettings(metadata: unknown): BakeryBusinessSettings {
  const defaults = getDefaultBakerySettings();

  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return defaults;
  }

  const record = metadata as Record<string, unknown>;
  const holidayEntries = normalizeHolidayEntries(
    record.holidayEntries ?? record.blockedDates,
  );

  return {
    dailyProductionTokenLimit: clampDailyTokenLimit(
      record.dailyProductionTokenLimit,
    ),
    staffDailyTokenLimit: clampStaffTokenLimit(record.staffDailyTokenLimit),
    cutoffHour: clampCutoffHour(record.cutoffHour),
    cutoffEnabled: record.cutoffEnabled !== false,
    attendanceWindowEnabled: record.attendanceWindowEnabled !== false,
    attendanceWindowStart: normalizeAttendanceTime(
      record.attendanceWindowStart,
      DEFAULT_ATTENDANCE_WINDOW_START,
    ),
    attendanceWindowEnd: normalizeAttendanceTime(
      record.attendanceWindowEnd,
      DEFAULT_ATTENDANCE_WINDOW_END,
    ),
    defaultDpPercentage: clampPercent(record.defaultDpPercentage, 50),
    notifyProductionWhatsapp: record.notifyProductionWhatsapp !== false,
    blockedDates: holidayEntries.map((entry) => entry.date),
    holidayEntries,
    staffSettings: normalizeStaffSettings(record.staffSettings),
    monthlyExpenses: normalizeMonthlyExpenses(record.monthlyExpenses),
    attendanceReconciliation: normalizeAttendanceReconciliation(
      record.attendanceReconciliation,
    ),
    productionStageProfiles: normalizeProductionStageProfiles(
      record.productionStageProfiles,
    ),
  };
}

export function getStaffTokenLimitForUser(args: {
  settings: BakeryBusinessSettings;
  userId: number | null | undefined;
}): number {
  if (!args.userId) return args.settings.staffDailyTokenLimit;
  return (
    args.settings.staffSettings.find((entry) => entry.userId === args.userId)
      ?.dailyTokenLimit ?? args.settings.staffDailyTokenLimit
  );
}

export async function getBakeryBusinessSettings(
  businessId: number,
): Promise<BakeryBusinessSettings> {
  const doc = await prisma.businessDocument.findFirst({
    where: {
      businessId,
      sourceType: BAKERY_SETTINGS_SOURCE_TYPE,
    },
    orderBy: { updatedAt: "desc" },
    select: { metadata: true },
  });

  const settings = parseMetadataToSettings(doc?.metadata);
  rememberBakeryBusinessSettings(businessId, settings);
  return settings;
}

export async function upsertBakeryBusinessSettings(args: {
  businessId: number;
  userId: number;
  input: Partial<BakeryBusinessSettings>;
}): Promise<BakeryBusinessSettings> {
  const current = await getBakeryBusinessSettings(args.businessId);
  const holidayEntries =
    args.input.holidayEntries !== undefined
      ? normalizeHolidayEntries(args.input.holidayEntries)
      : current.holidayEntries;
  const nextStaffDailyTokenLimit =
    args.input.staffDailyTokenLimit !== undefined
      ? clampStaffTokenLimit(args.input.staffDailyTokenLimit)
      : current.staffDailyTokenLimit;
  const nextStaffSettingsSource =
    args.input.staffSettings !== undefined
      ? normalizeStaffSettings(args.input.staffSettings)
      : current.staffSettings;
  // Logika Sinkronisasi Batas Token Pegawai:
  // Lakukan sinkronisasi otomatis ke seluruh staff kustom HANYA jika batas default token staff umum
  // benar-benar diubah oleh user (nilainya berbeda dengan data yang saat ini tersimpan di database).
  // Ini menghindari overwrite kustom token individu staff saat form utama disimpan ulang.
  const shouldSyncInheritedStaffTokenLimits =
    args.input.staffDailyTokenLimit !== undefined &&
    nextStaffDailyTokenLimit !== current.staffDailyTokenLimit;

  const nextStaffSettings = shouldSyncInheritedStaffTokenLimits
    ? nextStaffSettingsSource.map((entry) => ({
        ...entry,
        dailyTokenLimit: nextStaffDailyTokenLimit, // Timpa dengan default baru jika owner sengaja mengubah default umum
      }))
    : nextStaffSettingsSource; // Gunakan set kustom staff yang dikirim dari form tanpa overwrite jika tidak ada perubahan default umum

  const nextSettings: BakeryBusinessSettings = {
    dailyProductionTokenLimit:
      args.input.dailyProductionTokenLimit !== undefined
        ? clampDailyTokenLimit(args.input.dailyProductionTokenLimit)
        : current.dailyProductionTokenLimit,
    staffDailyTokenLimit: nextStaffDailyTokenLimit,
    cutoffHour:
      args.input.cutoffHour !== undefined
        ? clampCutoffHour(args.input.cutoffHour)
        : current.cutoffHour,
    cutoffEnabled:
      args.input.cutoffEnabled !== undefined
        ? Boolean(args.input.cutoffEnabled)
        : current.cutoffEnabled,
    attendanceWindowEnabled:
      args.input.attendanceWindowEnabled !== undefined
        ? Boolean(args.input.attendanceWindowEnabled)
        : current.attendanceWindowEnabled,
    attendanceWindowStart:
      args.input.attendanceWindowStart !== undefined
        ? normalizeAttendanceTime(
            args.input.attendanceWindowStart,
            current.attendanceWindowStart,
          )
        : current.attendanceWindowStart,
    attendanceWindowEnd:
      args.input.attendanceWindowEnd !== undefined
        ? normalizeAttendanceTime(
            args.input.attendanceWindowEnd,
            current.attendanceWindowEnd,
          )
        : current.attendanceWindowEnd,
    defaultDpPercentage:
      args.input.defaultDpPercentage !== undefined
        ? clampPercent(args.input.defaultDpPercentage, current.defaultDpPercentage)
        : current.defaultDpPercentage,
    notifyProductionWhatsapp:
      args.input.notifyProductionWhatsapp !== undefined
        ? Boolean(args.input.notifyProductionWhatsapp)
        : current.notifyProductionWhatsapp,
    blockedDates: holidayEntries.map((entry) => entry.date),
    holidayEntries,
    staffSettings: nextStaffSettings,
    monthlyExpenses:
      args.input.monthlyExpenses !== undefined
        ? normalizeMonthlyExpenses(args.input.monthlyExpenses)
        : current.monthlyExpenses,
    productionStageProfiles:
      args.input.productionStageProfiles !== undefined
        ? normalizeProductionStageProfiles(args.input.productionStageProfiles)
        : current.productionStageProfiles,
    attendanceReconciliation:
      args.input.attendanceReconciliation !== undefined
        ? normalizeAttendanceReconciliation(args.input.attendanceReconciliation)
        : current.attendanceReconciliation,
  };

  const metadata = JSON.parse(
    JSON.stringify({
      ...nextSettings,
      updatedByUserId: args.userId,
      updatedAt: new Date().toISOString(),
    }),
  ) as Prisma.InputJsonValue;

  const existing = await prisma.businessDocument.findFirst({
    where: {
      businessId: args.businessId,
      sourceType: BAKERY_SETTINGS_SOURCE_TYPE,
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });

  if (existing) {
    await prisma.businessDocument.update({
      where: { id: existing.id },
      data: {
        content: "Bakery settings",
        metadata,
      },
    });
  } else {
    await prisma.businessDocument.create({
      data: {
        businessId: args.businessId,
        sourceType: BAKERY_SETTINGS_SOURCE_TYPE,
        content: "Bakery settings",
        metadata,
      },
    });
  }

  rememberBakeryBusinessSettings(args.businessId, nextSettings);
  return nextSettings;
}
