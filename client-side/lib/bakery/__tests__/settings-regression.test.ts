import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  businessDocument: {
    findFirst: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  default: prismaMock,
}));

import { getAttendanceWindowState, isHolidayDate } from "../attendance";
import {
  calculateOperationalCostForDateRange,
} from "../financial-summary";
import {
  getDefaultBakerySettings,
  upsertBakeryBusinessSettings,
} from "../settings";
import { getStaffTokenLimitForUser } from "../token-limits";
import { isDateBlockedForOrdering } from "@/lib/bookings/operations";
import { resolveProductionStageTemplatesForCategory } from "@/lib/bookings/production-stages";

type SettingsInput = Parameters<typeof upsertBakeryBusinessSettings>[0]["input"];

function makeCurrentSettings(overrides: Partial<ReturnType<typeof getDefaultBakerySettings>> = {}) {
  return {
    ...getDefaultBakerySettings(),
    ...overrides,
  };
}

async function persistSettings(
  input: SettingsInput,
  currentOverrides: Partial<ReturnType<typeof getDefaultBakerySettings>> = {},
) {
  prismaMock.businessDocument.findFirst
    .mockResolvedValueOnce({
      metadata: makeCurrentSettings(currentOverrides),
    })
    .mockResolvedValueOnce({ id: 99 });
  prismaMock.businessDocument.update.mockResolvedValue({ id: 99 });

  return upsertBakeryBusinessSettings({
    businessId: 12,
    userId: 88,
    input,
  });
}

describe("bakery settings regression coverage", () => {
  beforeEach(() => {
    prismaMock.businessDocument.findFirst.mockReset();
    prismaMock.businessDocument.update.mockReset();
    prismaMock.businessDocument.create.mockReset();
  });

  it("propagates staff and daily token limits to downstream consumers", async () => {
    const saved = await persistSettings(
      {
        dailyProductionTokenLimit: 700,
        staffDailyTokenLimit: 111,
        staffSettings: [
          {
            userId: 44,
            name: "Dina",
            role: "Staff",
            dailyTokenLimit: 222,
            monthlySalary: 2_000_000,
            mealAllowance: 200_000,
            takeHomePay: 2_200_000,
            isActive: true,
          },
        ],
      },
      {
        staffDailyTokenLimit: 111,
      },
    );

    expect(saved.dailyProductionTokenLimit).toBe(700);
    expect(saved.staffDailyTokenLimit).toBe(111);
    expect(
      getStaffTokenLimitForUser({
        settings: saved,
        userId: 44,
      }),
    ).toBe(222);
    expect(
      getStaffTokenLimitForUser({
        settings: saved,
        userId: 999,
      }),
    ).toBe(111);

    const updatedMetadata =
      prismaMock.businessDocument.update.mock.calls[0]?.[0]?.data?.metadata;
    expect(updatedMetadata.dailyProductionTokenLimit).toBe(700);
    expect(updatedMetadata.staffSettings[0].dailyTokenLimit).toBe(222);
  });

  it("propagates operational settings to attendance and cutoff consumers", async () => {
    const saved = await persistSettings({
      cutoffHour: 15,
      cutoffEnabled: true,
      attendanceWindowEnabled: true,
      attendanceWindowStart: "08:00",
      attendanceWindowEnd: "09:30",
      defaultDpPercentage: 35,
      notifyProductionWhatsapp: false,
    });

    expect(saved.defaultDpPercentage).toBe(35);
    expect(saved.notifyProductionWhatsapp).toBe(false);

    const attendanceWindow = getAttendanceWindowState(
      saved,
      new Date("2026-07-02T08:45:00+07:00"),
    );
    expect(attendanceWindow.enabled).toBe(true);
    expect(attendanceWindow.canCheckInNow).toBe(true);
    expect(attendanceWindow.label).toContain("08.00 WIB");

    expect(
      isDateBlockedForOrdering(
        "2026-07-03",
        new Date("2026-07-02T16:00:00+07:00"),
        {
          blockedDates: saved.blockedDates,
          cutoffHour: saved.cutoffHour,
        },
      ),
    ).toBe(true);
  });

  it("propagates production stage profiles to production consumers", async () => {
    const saved = await persistSettings({
      productionStageProfiles: [
        {
          category: "Cookies",
          stages: [
            { stage: "lining", label: "Prep Adonan", percentage: 20 },
            { stage: "filling", label: "Isi Detail", percentage: 30 },
            { stage: "finishing", label: "Finishing Premium", percentage: 50 },
          ],
        },
      ],
    });

    const templates = resolveProductionStageTemplatesForCategory({
      category: "Cookies",
      profiles: saved.productionStageProfiles,
    });

    expect(templates).toEqual([
      { stage: "lining", label: "Prep Adonan", percentage: 20 },
      { stage: "filling", label: "Isi Detail", percentage: 30 },
      { stage: "finishing", label: "Finishing Premium", percentage: 50 },
    ]);
  });

  it("propagates monthly operational expenses to business and report calculations", async () => {
    const saved = await persistSettings({
      staffSettings: [
        {
          userId: 44,
          name: "Dina",
          role: "Staff",
          dailyTokenLimit: 200,
          monthlySalary: 2_000_000,
          mealAllowance: 250_000,
          takeHomePay: 2_250_000,
          isActive: true,
        },
      ],
      monthlyExpenses: [
        {
          id: "2026-07-ads",
          monthKey: "2026-07",
          name: "Biaya Iklan",
          amount: 500_000,
          category: "ads",
          note: "Meta Ads",
        },
        {
          id: "2026-07-packaging",
          monthKey: "2026-07",
          name: "Packaging Tambahan",
          amount: 300_000,
          category: "custom",
          note: "Ribbon dan box",
        },
        {
          id: "2026-08-ads",
          monthKey: "2026-08",
          name: "Biaya Iklan",
          amount: 999_000,
          category: "ads",
          note: "Bulan lain",
        },
      ],
    });

    const breakdown = calculateOperationalCostForDateRange({
      settings: saved,
      fromDate: "2026-07-01",
      toDate: "2026-07-31",
    });

    expect(breakdown.months).toEqual(["2026-07"]);
    expect(breakdown.staffCost).toBe(2_250_000);
    expect(breakdown.adsCost).toBe(500_000);
    expect(breakdown.customExpenseTotal).toBe(300_000);
    expect(breakdown.totalOperationalCost).toBe(3_050_000);
    expect(breakdown.expenseRows).toHaveLength(2);
  });

  it("propagates holiday calendar entries to ordering and attendance consumers", async () => {
    const saved = await persistSettings({
      attendanceWindowEnabled: true,
      attendanceWindowStart: "06:00",
      attendanceWindowEnd: "07:00",
      holidayEntries: [
        {
          date: "2026-07-17",
          label: "Libur Nasional",
          tag: "Libur",
        },
      ],
    });

    expect(saved.blockedDates).toContain("2026-07-17");
    expect(isHolidayDate("2026-07-17", saved)).toBe(true);
    expect(
      isDateBlockedForOrdering(
        "2026-07-17",
        new Date("2026-07-16T09:00:00+07:00"),
        {
          blockedDates: saved.blockedDates,
          cutoffHour: saved.cutoffHour,
        },
      ),
    ).toBe(true);

    const attendanceWindow = getAttendanceWindowState(
      saved,
      new Date("2026-07-17T06:30:00+07:00"),
    );
    expect(attendanceWindow.isHolidayToday).toBe(true);
    expect(attendanceWindow.canCheckInNow).toBe(false);
  });
});
