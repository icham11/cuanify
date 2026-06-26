import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    business: {
      findFirst: vi.fn(),
    },
    businessMember: {
      findFirst: vi.fn(),
    },
  },
  compare: vi.fn(),
  signToken: vi.fn(() => "signed-token"),
  isPrismaConnectionTimeout: vi.fn(() => false),
  prismaConnectionErrorResponse: vi.fn((message: string) =>
    Response.json({ error: message }, { status: 503 }),
  ),
  withPrismaRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

vi.mock("@/lib/prisma", () => ({
  default: mocks.prisma,
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: mocks.compare,
  },
}));

vi.mock("@/lib/auth/jwt", () => ({
  signToken: mocks.signToken,
}));

vi.mock("@/lib/prisma-errors", () => ({
  isPrismaConnectionTimeout: mocks.isPrismaConnectionTimeout,
  prismaConnectionErrorResponse: mocks.prismaConnectionErrorResponse,
  withPrismaRetry: mocks.withPrismaRetry,
}));

import { POST } from "../route";

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    mocks.prisma.user.findFirst.mockReset();
    mocks.prisma.user.update.mockReset();
    mocks.prisma.business.findFirst.mockReset();
    mocks.prisma.businessMember.findFirst.mockReset();
    mocks.compare.mockReset();
    mocks.signToken.mockClear();
    mocks.isPrismaConnectionTimeout.mockReset();
    mocks.isPrismaConnectionTimeout.mockReturnValue(false);
    mocks.prismaConnectionErrorResponse.mockClear();
    mocks.withPrismaRetry.mockClear();
    mocks.withPrismaRetry.mockImplementation(async (fn: () => Promise<unknown>) => fn());
  });

  it("uses normalized case-insensitive email lookup and signs normalized email into the token", async () => {
    mocks.prisma.user.findFirst.mockResolvedValue({
      id: 7,
      name: "Admin QA",
      email: "Admin.User@Example.COM",
      password: "hashed-password",
    });
    mocks.compare.mockResolvedValue(true);
    mocks.prisma.business.findFirst.mockResolvedValue(null);
    mocks.prisma.businessMember.findFirst.mockResolvedValue({
      businessId: 15,
      role: "Admin",
    });
    mocks.prisma.user.update.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: "  Admin.User@Example.COM  ",
          password: "secret123",
        }),
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        email: {
          equals: "admin.user@example.com",
          mode: "insensitive",
        },
      },
    });
    expect(mocks.signToken).toHaveBeenCalledWith({
      userId: 7,
      name: "Admin QA",
      email: "admin.user@example.com",
      role: "Admin",
      businessId: 15,
    });
  });

  it("returns a 503 response when the DB layer reports a quota outage", async () => {
    const quotaError = new Error(
      "Your project has exceeded the data transfer quota. Upgrade your plan to increase limits.",
    );

    mocks.withPrismaRetry.mockRejectedValueOnce(quotaError);
    mocks.isPrismaConnectionTimeout.mockReturnValue(true);

    const response = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: "admin@example.com",
          password: "secret123",
        }),
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(503);
    expect(mocks.prismaConnectionErrorResponse).toHaveBeenCalledWith(
      "Koneksi database sedang sibuk. Coba login lagi beberapa saat.",
    );
    expect(await response.json()).toEqual({
      error: "Koneksi database sedang sibuk. Coba login lagi beberapa saat.",
    });
  });
});
