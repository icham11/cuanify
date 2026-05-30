import { describe, expect, it } from "vitest";
import {
  BOOKING_ADD_ON_CATALOG,
  BOOKING_PRODUCT_CATALOG,
} from "@/lib/bookings/pricelist";
import { getDraftItemPriceBreakdown } from "@/components/bakery/bookings/booking-form-helpers";

describe("booking form price breakdown", () => {
  it("keeps recap-priced cookies as a flat total without negative adjustments", () => {
    const breakdown = getDraftItemPriceBreakdown({
      catalog: BOOKING_PRODUCT_CATALOG,
      addOnCatalog: BOOKING_ADD_ON_CATALOG,
      item: {
        category: "Cookies",
        subcategory: "Custom Cookies",
        productName: "Custom Cookies",
        size: "Hard",
        quantity: 10,
        tokenDifficulty: "HARD",
        addOns: ["bubblewrap", "cookie-additional-design"],
        addOnQuantities: {},
        addOnPriceOverrides: {},
        customAddOns: [],
        notes: "",
        parsedUnitPrice: 20000,
        parsedSubtotal: 200000,
        pricingSource: "RECAP",
      } as never,
    });

    expect(breakdown.baseAmount).toBe(200000);
    expect(breakdown.designAdjustmentAmount).toBe(0);
    expect(breakdown.addOnAmount).toBe(0);
    expect(breakdown.totalAmount).toBe(200000);
    expect(breakdown.addOnDetails.length).toBe(0);
  });

  it("does not multiply additional design add-on by cookie quantity", () => {
    const breakdown = getDraftItemPriceBreakdown({
      catalog: BOOKING_PRODUCT_CATALOG,
      addOnCatalog: {
        ...BOOKING_ADD_ON_CATALOG,
        Cookies: [
          ...BOOKING_ADD_ON_CATALOG.Cookies,
          {
            id: "cookie-additional-design",
            label: "Additional Design",
            price: 10000,
          },
        ],
      },
      item: {
        category: "Cookies",
        subcategory: "Custom Cookies",
        productName: "Custom Cookies",
        size: "Hard",
        quantity: 60,
        tokenDifficulty: "HARD",
        addOns: ["cookie-additional-design"],
        addOnQuantities: {
          "cookie-additional-design": 1,
        },
        addOnPriceOverrides: {},
        customAddOns: [],
        notes: "",
      } as never,
    });

    expect(breakdown.baseAmount).toBe(1500000);
    expect(breakdown.addOnAmount).toBe(10000);
    expect(breakdown.designAdjustmentAmount).toBe(0);
    expect(breakdown.totalAmount).toBe(1510000);
  });

  it("uses parsed custom card quantity from recap instead of defaulting to one", () => {
    const breakdown = getDraftItemPriceBreakdown({
      catalog: BOOKING_PRODUCT_CATALOG,
      addOnCatalog: BOOKING_ADD_ON_CATALOG,
      item: {
        category: "Cookies",
        subcategory: "Custom Cookies",
        productName: "Custom Cookies",
        size: "Hard",
        quantity: 55,
        tokenDifficulty: "HARD",
        addOns: ["custom-card"],
        addOnQuantities: {
          "custom-card": 55,
        },
        addOnPriceOverrides: {},
        customAddOns: [],
        notes: "",
      } as never,
    });

    expect(breakdown.baseAmount).toBe(1375000);
    expect(breakdown.addOnAmount).toBe(110000);
    expect(breakdown.designAdjustmentAmount).toBe(0);
    expect(breakdown.totalAmount).toBe(1485000);
  });

  it("uses bouquet unit quantity for bubblewrap instead of cookie fill quantity", () => {
    const breakdown = getDraftItemPriceBreakdown({
      catalog: BOOKING_PRODUCT_CATALOG,
      addOnCatalog: {
        ...BOOKING_ADD_ON_CATALOG,
        Buket: [
          ...BOOKING_ADD_ON_CATALOG.Buket,
          {
            id: "bubblewrap",
            label: "Extra Bubblewrap Bouquet",
            price: 20000,
            pricingStrategy: "PER_ORDER",
          },
        ],
      },
      item: {
        category: "Buket",
        subcategory: "Bouquet",
        productName: "Hand Bouquet (7-10 pcs)",
        size: "Start From",
        quantity: 7,
        tokenDifficulty: "SIMPLE",
        addOns: ["bubblewrap"],
        addOnQuantities: {
          bubblewrap: 1,
        },
        addOnPriceOverrides: {},
        customAddOns: [],
        notes: "",
      } as never,
    });

    expect(breakdown.baseAmount).toBe(200000);
    expect(breakdown.addOnAmount).toBe(20000);
    expect(breakdown.totalAmount).toBe(220000);
  });

  it("uses bouquet unit quantity for custom add-ons instead of cookie fill quantity", () => {
    const breakdown = getDraftItemPriceBreakdown({
      catalog: BOOKING_PRODUCT_CATALOG,
      addOnCatalog: BOOKING_ADD_ON_CATALOG,
      item: {
        category: "Buket",
        subcategory: "Bouquet",
        productName: "Hand Bouquet (7-10 pcs)",
        size: "Start From",
        quantity: 7,
        tokenDifficulty: "SIMPLE",
        addOns: [],
        addOnQuantities: {},
        addOnPriceOverrides: {},
        customAddOns: [{ label: "Premium Wrap", price: 15000 }],
        notes: "",
      } as never,
    });

    expect(breakdown.baseAmount).toBe(200000);
    expect(breakdown.addOnAmount).toBe(15000);
    expect(breakdown.totalAmount).toBe(215000);
  });
});
