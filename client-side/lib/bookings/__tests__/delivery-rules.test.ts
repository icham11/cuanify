declare const describe: {
  (name: string, fn: () => void): void;
  skip: (name: string, fn: () => void) => void;
};
declare const it: (name: string, fn: () => void | Promise<void>) => void;
declare const expect: (value: unknown) => {
  toBe: (expected: unknown) => void;
};

import {
  estimateOperationalWeightGram,
  isBouquetItem,
  resolveShippingParcelCount,
} from "../delivery-rules";

describe("Delivery rules shipping units", () => {
  it("collapses bouquet fill counts into one shipping parcel", () => {
    expect(
      resolveShippingParcelCount({
        category: "Buket",
        subcategory: "Bouquet",
        productName: "Hand Bouquet (7-10 pcs)",
        size: "Start From",
        quantity: 8,
      }),
    ).toBe(1);
  });

  it("keeps multiple bouquets as multiple parcels", () => {
    expect(
      resolveShippingParcelCount({
        category: "Buket",
        subcategory: "Bouquet",
        productName: "Hand Bouquet (7-10 pcs)",
        size: "Start From",
        quantity: 2,
      }),
    ).toBe(2);
  });

  it("detects hbq aliases for bouquet weight calculations", () => {
    const bouquetLikeItem = {
      category: "Buket",
      subcategory: "Bouquet",
      productName: "hbq",
      size: "Start From",
      quantity: 8,
    };

    expect(isBouquetItem(bouquetLikeItem)).toBe(true);
    expect(estimateOperationalWeightGram(bouquetLikeItem)).toBe(3000);
  });
});
