import { describe, expect, it } from "vitest";
import { resolveBubblewrapUnitPrice } from "@/components/bakery/bookings/booking-form-helpers";
import {
  buildEffectiveAddOnCatalog,
  normalizeCatalogAdminState,
} from "@/lib/bookings/catalog-state";

const handBouquet = {
  category: "Buket",
  subcategory: "Hand Bouquet",
  productName: "Hand Bouquet",
  size: "7-10 pcs",
};

describe("add-on prices from the Add-ons menu", () => {
  it("marks add-ons whose price was changed in the Add-ons menu", () => {
    const catalog = buildEffectiveAddOnCatalog(
      normalizeCatalogAdminState({
        addOnPriceOverrides: { "Cookies||bubblewrap": 5000 },
      }),
    );

    expect(catalog.Cookies?.find((entry) => entry.id === "bubblewrap")).toMatchObject({
      price: 5000,
      priceOverridden: true,
    });
    expect(
      catalog.Cookies?.find((entry) => entry.id === "custom-card")?.priceOverridden,
    ).toBe(false);
  });

  it("keeps per-product bubblewrap tiers for the default price", () => {
    expect(
      resolveBubblewrapUnitPrice({
        category: "Buket",
        addonId: "bubblewrap",
        defaultPrice: 2000,
        itemSelection: handBouquet,
      }),
    ).toBe(20_000);
  });

  it("uses the Add-ons menu price instead of the per-product tier", () => {
    expect(
      resolveBubblewrapUnitPrice({
        category: "Buket",
        addonId: "bubblewrap",
        defaultPrice: 15_000,
        priceOverridden: true,
        itemSelection: handBouquet,
      }),
    ).toBe(15_000);
  });
});
