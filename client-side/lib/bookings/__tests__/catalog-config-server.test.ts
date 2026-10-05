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

vi.mock("@/lib/bookings/catalog-state", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/bookings/catalog-state")>();
  return {
    buildEffectiveAddOnCatalog: mocks.buildEffectiveAddOnCatalog,
    buildEffectiveProductCatalog: mocks.buildEffectiveProductCatalog,
    normalizeCatalogAdminState: mocks.normalizeCatalogAdminState,
    makeVariantKey: actual.makeVariantKey,
    removeCatalogVariants: actual.removeCatalogVariants,
  };
});

vi.mock("@/lib/products/uniqueness", () => ({
  normalizeProductNameKey: mocks.normalizeProductNameKey,
}));

import {
  collectRemovedCatalogVariantKeys,
  invalidateEffectiveBookingCatalogCache,
  loadEffectiveBookingCatalog,
} from "../catalog-config-server";
import type { PricelistCategory } from "@/lib/bookings/pricelist";

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

const diyCatalog: PricelistCategory[] = [
  {
    category: "Cookies",
    keywords: ["cookies"],
    subcategories: [
      {
        name: "Seasonal",
        keywords: [],
        products: [
          {
            name: "Mini DIY",
            keywords: [],
            defaultVariant: "Mini DIY (isi 3)",
            variants: [{ label: "Mini DIY (isi 3)", price: 110000 }],
          },
          {
            name: "Lotus Box",
            keywords: [],
            defaultVariant: "Standard",
            variants: [{ label: "Standard", price: 90000 }],
          },
        ],
      },
    ],
  },
];

describe("collectRemovedCatalogVariantKeys", () => {
  it("flags catalog variants whose dashboard product was deleted", () => {
    expect(
      collectRemovedCatalogVariantKeys(diyCatalog, [
        {
          name: "Mini DIY - Mini DIY (isi 3)",
          isActive: true,
          deletedAt: new Date("2026-09-01"),
        },
        { name: "Lotus Box", isActive: true, deletedAt: null },
      ]),
    ).toEqual(["Cookies||Seasonal||Mini DIY||Mini DIY (isi 3)"]);
  });

  it("flags inactive products but keeps them when an active duplicate exists", () => {
    expect(
      collectRemovedCatalogVariantKeys(diyCatalog, [
        { name: "Lotus Box", isActive: false, deletedAt: null },
      ]),
    ).toEqual(["Cookies||Seasonal||Lotus Box||Standard"]);
    expect(
      collectRemovedCatalogVariantKeys(diyCatalog, [
        { name: "Lotus Box", isActive: false, deletedAt: null },
        { name: "Lotus Box", isActive: true, deletedAt: null },
      ]),
    ).toEqual([]);
  });

  it("matches single-variant products saved under their base name", () => {
    expect(
      collectRemovedCatalogVariantKeys(diyCatalog, [
        { name: "Mini DIY", isActive: true, deletedAt: new Date("2026-09-01") },
      ]),
    ).toEqual(["Cookies||Seasonal||Mini DIY||Mini DIY (isi 3)"]);
  });

  it("keeps catalog products that were never synced to the products menu", () => {
    expect(collectRemovedCatalogVariantKeys(diyCatalog, [])).toEqual([]);
  });
});

describe("loadEffectiveBookingCatalog with removed products", () => {
  beforeEach(() => {
    invalidateEffectiveBookingCatalogCache();
    mocks.prisma.$queryRaw.mockReset();
    mocks.prisma.product.findMany.mockReset();
    mocks.buildEffectiveProductCatalog.mockReturnValue(diyCatalog);
  });

  it("drops deleted products from the booking catalog", async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([{ metadata: {} }]);
    mocks.prisma.product.findMany.mockResolvedValue([
      {
        name: "Mini DIY - Mini DIY (isi 3)",
        sellingPrice: 110000,
        isActive: true,
        deletedAt: new Date("2026-09-01"),
        category: { name: "Seasonal" },
      },
    ]);

    const { productCatalog } = await loadEffectiveBookingCatalog(11);
    const productNames = productCatalog.flatMap((category) =>
      category.subcategories.flatMap((subcategory) =>
        subcategory.products.map((product) => product.name),
      ),
    );

    expect(productNames).toContain("Lotus Box");
    expect(productNames).not.toContain("Mini DIY");
  });
});
