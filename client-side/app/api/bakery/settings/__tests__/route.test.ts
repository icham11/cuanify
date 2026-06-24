import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  class AuthError extends Error {}
  class ForbiddenError extends Error {}
  class DatabaseTemporarilyUnavailableError extends Error {}

  return {
    AuthError,
    ForbiddenError,
    DatabaseTemporarilyUnavailableError,
    requireAuth: vi.fn(),
    requireRole: vi.fn(),
    getDefaultBakerySettings: vi.fn(),
    getBakeryBusinessSettings: vi.fn(),
    getCachedBakeryBusinessSettings: vi.fn(),
    rememberBakeryBusinessSettings: vi.fn(),
    upsertBakeryBusinessSettings: vi.fn(),
    syncCapacityMaxTokenForBusiness: vi.fn(),
    isPrismaConnectionTimeout: vi.fn(() => false),
    prismaConnectionErrorResponse: vi.fn(
      (message: string) => new Response(message, { status: 503 }),
    ),
  };
});

vi.mock("@/lib/auth/session", () => ({
  AuthError: mocks.AuthError,
  ForbiddenError: mocks.ForbiddenError,
  requireAuth: mocks.requireAuth,
  requireRole: mocks.requireRole,
}));

vi.mock("@/lib/bakery/settings", () => ({
  getDefaultBakerySettings: mocks.getDefaultBakerySettings,
  getBakeryBusinessSettings: mocks.getBakeryBusinessSettings,
  getCachedBakeryBusinessSettings: mocks.getCachedBakeryBusinessSettings,
  rememberBakeryBusinessSettings: mocks.rememberBakeryBusinessSettings,
  upsertBakeryBusinessSettings: mocks.upsertBakeryBusinessSettings,
}));

vi.mock("@/lib/bookings/token-capacity-service", () => ({
  syncCapacityMaxTokenForBusiness: mocks.syncCapacityMaxTokenForBusiness,
}));

vi.mock("@/lib/prisma-errors", () => ({
  DatabaseTemporarilyUnavailableError:
    mocks.DatabaseTemporarilyUnavailableError,
  isPrismaConnectionTimeout: mocks.isPrismaConnectionTimeout,
  prismaConnectionErrorResponse: mocks.prismaConnectionErrorResponse,
}));

import { PATCH } from "../route";

describe("PATCH /api/bakery/settings", () => {
  beforeEach(() => {
    mocks.requireAuth.mockReset();
    mocks.requireRole.mockReset();
    mocks.getDefaultBakerySettings.mockReset();
    mocks.getBakeryBusinessSettings.mockReset();
    mocks.getCachedBakeryBusinessSettings.mockReset();
    mocks.rememberBakeryBusinessSettings.mockReset();
    mocks.upsertBakeryBusinessSettings.mockReset();
    mocks.syncCapacityMaxTokenForBusiness.mockReset();
    mocks.isPrismaConnectionTimeout.mockReset();
    mocks.isPrismaConnectionTimeout.mockReturnValue(false);
  });

  it("locks settings updates to owner role only", async () => {
    mocks.requireAuth.mockResolvedValue({
      userId: 7,
      businessId: 12,
      role: "Staff",
    });
    mocks.requireRole.mockImplementation(() => {
      throw new mocks.ForbiddenError("Owner only");
    });

    const response = await PATCH(
      new NextRequest("http://localhost/api/bakery/settings", {
        method: "PATCH",
        body: JSON.stringify({ dailyProductionTokenLimit: 700 }),
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Owner only" });
    expect(mocks.upsertBakeryBusinessSettings).not.toHaveBeenCalled();
    expect(mocks.syncCapacityMaxTokenForBusiness).not.toHaveBeenCalled();
  });

  it("accepts and forwards all five settings groups, then syncs daily capacity", async () => {
    mocks.requireAuth.mockResolvedValue({
      userId: 7,
      businessId: 12,
      role: "Owner",
    });
    mocks.requireRole.mockReturnValue(undefined);

    const savedSettings = {
      dailyProductionTokenLimit: 700,
      staffDailyTokenLimit: 111,
      cutoffHour: 15,
      cutoffEnabled: true,
      attendanceWindowEnabled: true,
      attendanceWindowStart: "08:00",
      attendanceWindowEnd: "09:30",
      defaultDpPercentage: 35,
      notifyProductionWhatsapp: false,
      blockedDates: ["2026-07-17"],
      holidayEntries: [
        { date: "2026-07-17", label: "Libur Nasional", tag: "Libur" },
      ],
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
      monthlyExpenses: [
        {
          id: "2026-07-ads",
          monthKey: "2026-07",
          name: "Biaya Iklan",
          amount: 500_000,
          category: "ads",
          note: "Meta Ads",
        },
      ],
      attendanceReconciliation: [
        {
          id: "2026-07-44",
          monthKey: "2026-07",
          staffUserId: 44,
          staffName: "Dina",
          manualLateCount: 2,
          note: "Owner review",
        },
      ],
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
    };

    mocks.upsertBakeryBusinessSettings.mockResolvedValue(savedSettings);
    mocks.syncCapacityMaxTokenForBusiness.mockResolvedValue(undefined);

    const response = await PATCH(
      new NextRequest("http://localhost/api/bakery/settings", {
        method: "PATCH",
        body: JSON.stringify(savedSettings),
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.upsertBakeryBusinessSettings).toHaveBeenCalledTimes(1);
    expect(mocks.upsertBakeryBusinessSettings).toHaveBeenCalledWith({
      businessId: 12,
      userId: 7,
      input: {
        dailyProductionTokenLimit: 700,
        staffDailyTokenLimit: 111,
        cutoffHour: 15,
        cutoffEnabled: true,
        attendanceWindowEnabled: true,
        attendanceWindowStart: "08:00",
        attendanceWindowEnd: "09:30",
        defaultDpPercentage: 35,
        notifyProductionWhatsapp: false,
        blockedDates: ["2026-07-17"],
        holidayEntries: savedSettings.holidayEntries,
        staffSettings: savedSettings.staffSettings,
        monthlyExpenses: savedSettings.monthlyExpenses,
        attendanceReconciliation: savedSettings.attendanceReconciliation,
        productionStageProfiles: savedSettings.productionStageProfiles,
      },
    });
    expect(mocks.syncCapacityMaxTokenForBusiness).toHaveBeenCalledWith(
      12,
      700,
    );
    expect(mocks.rememberBakeryBusinessSettings).toHaveBeenCalledWith(
      12,
      savedSettings,
    );
    expect(await response.json()).toEqual({
      success: true,
      data: savedSettings,
    });
  });
});
