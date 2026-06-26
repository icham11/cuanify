import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    $queryRaw: vi.fn(),
    product: {
      findMany: vi.fn(),
    },
  },
  buildEffectiveAddOnCatalog: vi.fn(() => ({ extras: [] })),
  buildEffectiveProductCatalog: vi.fn(() => [
    {
      category: "Cake",
      keywords: ["cake"],
      subcategories: [],
    },
  ]),
  normalizeCatalogAdminState: vi.fn((value) => value),
  normalizeProductNameKey: vi.fn((value: string) =>
    value.toLowerCase().trim(),
  ),
}));

vi.mock("@/lib/prisma", () => ({
  default: mocks.prisma,
}));

vi.mock("@/lib/bookings/catalog-state", () => ({
  buildEffectiveAddOnCatalog: mocks.buildEffectiveAddOnCatalog,
  buildEffectiveProductCatalog: mocks.buildEffectiveProductCatalog,
  normalizeCatalogAdminState: mocks.normalizeCatalogAdminState,
}));

vi.mock("@/lib/products/uniqueness", () => ({
  normalizeProductNameKey: mocks.normalizeProductNameKey,
}));

import {
  invalidateEffectiveBookingCatalogCache,
  loadEffectiveBookingCatalog,
} from "../catalog-config-server";

describe("loadEffectiveBookingCatalog", () => {
  beforeEach(() => {
    invalidateEffectiveBookingCatalogCache();
    mocks.prisma.$queryRaw.mockReset();
    mocks.prisma.product.findMany.mockReset();
    mocks.buildEffectiveAddOnCatalog.mockClear();
    mocks.buildEffectiveProductCatalog.mockClear();
    mocks.normalizeCatalogAdminState.mockClear();
    mocks.normalizeProductNameKey.mockClear();
  });

  it("reuses the cached catalog for repeated reads on the same business", async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([{ metadata: null }]);
    mocks.prisma.product.findMany.mockResolvedValue([]);

    await loadEffectiveBookingCatalog(9);
    await loadEffectiveBookingCatalog(9);

    expect(mocks.prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.product.findMany).toHaveBeenCalledTimes(1);
  });
});
