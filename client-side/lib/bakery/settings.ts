import prisma from "@/lib/prisma";
import {
  BAKERY_BLOCKED_DATES,
  BAKERY_DAILY_PRODUCTION_TOKEN_LIMIT,
  BAKERY_STAFF_DAILY_TOKEN_LIMIT,
} from "@/lib/bookings/config";

const BAKERY_SETTINGS_SOURCE_TYPE = "bakery_settings";

const MIN_DAILY_TOKEN_LIMIT = 1;
const MAX_DAILY_TOKEN_LIMIT = 10_000;

export interface BakeryBusinessSettings {
  dailyProductionTokenLimit: number;
  staffDailyTokenLimit: number;
  blockedDates: string[];
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

function normalizeBlockedDates(value: unknown): string[] {
  if (!Array.isArray(value)) return [...BAKERY_BLOCKED_DATES];

  const parsed = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry));

  return Array.from(new Set(parsed)).sort();
}

export function getDefaultBakerySettings(): BakeryBusinessSettings {
  return {
    dailyProductionTokenLimit: BAKERY_DAILY_PRODUCTION_TOKEN_LIMIT,
    staffDailyTokenLimit: BAKERY_STAFF_DAILY_TOKEN_LIMIT,
    blockedDates: [...BAKERY_BLOCKED_DATES],
  };
}

function parseMetadataToSettings(metadata: unknown): BakeryBusinessSettings {
  const defaults = getDefaultBakerySettings();

  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return defaults;
  }

  const record = metadata as Record<string, unknown>;

  return {
    dailyProductionTokenLimit: clampDailyTokenLimit(
      record.dailyProductionTokenLimit,
    ),
    staffDailyTokenLimit: clampDailyTokenLimit(record.staffDailyTokenLimit),
    blockedDates: normalizeBlockedDates(record.blockedDates),
  };
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

  return parseMetadataToSettings(doc?.metadata);
}

export async function upsertBakeryBusinessSettings(args: {
  businessId: number;
  userId: number;
  input: Partial<BakeryBusinessSettings>;
}): Promise<BakeryBusinessSettings> {
  const current = await getBakeryBusinessSettings(args.businessId);

  const nextSettings: BakeryBusinessSettings = {
    dailyProductionTokenLimit:
      args.input.dailyProductionTokenLimit !== undefined
        ? clampDailyTokenLimit(args.input.dailyProductionTokenLimit)
        : current.dailyProductionTokenLimit,
    staffDailyTokenLimit:
      args.input.staffDailyTokenLimit !== undefined
        ? clampDailyTokenLimit(args.input.staffDailyTokenLimit)
        : current.staffDailyTokenLimit,
    blockedDates:
      args.input.blockedDates !== undefined
        ? normalizeBlockedDates(args.input.blockedDates)
        : current.blockedDates,
  };

  const metadata = {
    ...nextSettings,
    updatedByUserId: args.userId,
    updatedAt: new Date().toISOString(),
  };

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

  return nextSettings;
}
