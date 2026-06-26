import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn(),
    businessDocument: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  };

  return {
    prisma: {
      user: {
        findUnique: vi.fn(),
      },
      $queryRaw: vi.fn(),
      $transaction: vi.fn(async (callback: (db: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    },
    tx,
    requireAuth: vi.fn(),
    isPrismaConnectionTimeout: vi.fn(() => false),
    prismaConnectionErrorResponse: vi.fn((message: string) =>
      Response.json({ error: message }, { status: 503 }),
    ),
    buildBookingAuditDocument: vi.fn(() => ({
      businessId: 13,
      sourceType: "bakery_booking_audit_log_v1",
      content: "{}",
      metadata: {},
    })),
    buildBookingAuditOrderSummary: vi.fn(() => "20x Custom Cookies"),
  };
});

vi.mock("@/lib/prisma", () => ({
  default: mocks.prisma,
}));

vi.mock("@/lib/auth/session", () => {
  class AuthError extends Error {}
  class ForbiddenError extends Error {}

  return {
    AuthError,
    ForbiddenError,
    requireAuth: mocks.requireAuth,
  };
});

vi.mock("@/lib/prisma-errors", () => ({
  isPrismaConnectionTimeout: mocks.isPrismaConnectionTimeout,
  prismaConnectionErrorResponse: mocks.prismaConnectionErrorResponse,
}));

vi.mock("../order-helpers", () => ({
  asRecord: (value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null,
  asNumber: (value: unknown) => Number(value ?? 0),
  asPositiveIntOrNull: (value: unknown) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  },
  asString: (value: unknown) => (typeof value === "string" ? value : ""),
  asArrayOfRecords: (value: unknown) => (Array.isArray(value) ? value : []),
  parseJsonField: (value: unknown) => value,
  normalizeSalesChannel: (value: unknown) => value ?? "direct",
  buildStaffIdByUuid: () => new Map(),
  orderTaskUuid: () => "00000000-0000-0000-0000-000000000000",
  hydrateOrderItemsWithProductTokens: (value: unknown) => value,
  loadOrderProductTokenLookup: vi.fn(),
  resolvePersistedImageFields: () => ({}),
  toIsoOrNull: (value: unknown) => (typeof value === "string" ? value : null),
}));

vi.mock("@/lib/bookings/order-api-helpers", () => ({
  staffUuid: vi.fn(() => "00000000-0000-0000-0000-000000000007"),
}));

vi.mock("@/lib/bookings/booking-audit", () => ({
  buildBookingAuditDocument: mocks.buildBookingAuditDocument,
  buildBookingAuditOrderSummary: mocks.buildBookingAuditOrderSummary,
}));

import { PATCH } from "../route";

describe("PATCH /api/bookings/orders/[id]", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-26T08:00:00+07:00"));

    mocks.requireAuth.mockReset();
    mocks.requireAuth.mockResolvedValue({
      businessId: 13,
      userId: 7,
      role: "Owner",
    });
    mocks.prisma.user.findUnique.mockReset();
    mocks.prisma.user.findUnique.mockResolvedValue({
      name: "Owner QA",
      email: "owner@example.com",
    });
    mocks.prisma.$queryRaw.mockReset();
    mocks.prisma.$transaction.mockClear();
    mocks.tx.$executeRaw.mockReset();
    mocks.tx.businessDocument.findFirst.mockReset();
    mocks.tx.businessDocument.findFirst.mockResolvedValue(null);
    mocks.tx.businessDocument.update.mockReset();
    mocks.tx.businessDocument.create.mockReset();
    mocks.tx.businessDocument.create.mockResolvedValue(null);
    mocks.isPrismaConnectionTimeout.mockReset();
    mocks.isPrismaConnectionTimeout.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(["Ready", "Delivery", "Completed", "Cancelled"])(
    "allows historical status update to %s",
    async (nextStatus) => {
      mocks.prisma.$queryRaw
        .mockResolvedValueOnce([
          {
            external_id: "HA444-280526-001",
            order_uuid: "00000000-0000-0000-0000-000000000123",
            booking_code: "HA444-280526-001",
            customer_name: "hadistia",
            order_status: "In Production",
            delivery_date: "2026-05-28",
            status_history: [],
            assigned_staff_user_id: 7,
          },
        ])
        .mockResolvedValueOnce([]);

      const response = await PATCH(
        new Request("http://localhost/api/bookings/orders/HA444-280526-001", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            orderStatus: nextStatus,
            actorName: "Owner QA",
          }),
        }),
        {
          params: Promise.resolve({ id: "HA444-280526-001" }),
        },
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        success: true,
        data: {
          orderStatus: nextStatus,
        },
      });
      expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mocks.tx.$executeRaw).toHaveBeenCalled();
    },
  );
});
