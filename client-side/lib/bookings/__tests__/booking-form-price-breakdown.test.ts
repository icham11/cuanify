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
});
