import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    product: {
      findMany: vi.fn(),
    },
  },
  loadEffectiveBookingCatalog: vi.fn(),
  flattenCatalogProductsForDashboard: vi.fn(() => []),
}));

vi.mock("@/lib/prisma", () => ({
  default: mocks.prisma,
}));

vi.mock("@/lib/bookings/catalog-config-server", () => ({
  loadEffectiveBookingCatalog: mocks.loadEffectiveBookingCatalog,
}));

vi.mock("@/lib/bookings/product-sync", () => ({
  flattenCatalogProductsForDashboard: mocks.flattenCatalogProductsForDashboard,
}));

import {
  invalidateOrderProductTokenLookupCache,
  loadOrderProductTokenLookup,
} from "../order-helpers";

describe("loadOrderProductTokenLookup", () => {
  beforeEach(() => {
    invalidateOrderProductTokenLookupCache();
    mocks.prisma.product.findMany.mockReset();
    mocks.loadEffectiveBookingCatalog.mockReset();
    mocks.flattenCatalogProductsForDashboard.mockReset();
    mocks.flattenCatalogProductsForDashboard.mockReturnValue([]);
  });

  it("reuses the cached token lookup for repeated reads on the same business", async () => {
    mocks.prisma.product.findMany.mockResolvedValue([
      { name: "Brownies", productionToken: 5 },
    ]);
    mocks.loadEffectiveBookingCatalog.mockResolvedValue({
      productCatalog: [],
      addOnCatalog: {},
    });

    const first = await loadOrderProductTokenLookup(11);
    const second = await loadOrderProductTokenLookup(11);

    expect(first.get("brownies")).toBe(5);
    expect(second.get("brownies")).toBe(5);
    expect(mocks.prisma.product.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.loadEffectiveBookingCatalog).toHaveBeenCalledTimes(1);
  });
});
