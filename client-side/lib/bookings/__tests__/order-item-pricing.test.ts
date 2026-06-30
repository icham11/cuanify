import { describe, expect, it } from "vitest";
import {
  resolveOrderItemAddOnAmount,
  resolveOrderItemBaseAmount,
  resolveOrderItemLineTotal,
  splitRecapPriceComponents,
} from "../order-item-pricing";

describe("order item pricing", () => {
  it("keeps catalog base separate from line subtotal", () => {
    const item = {
      basePrice: 400000,
      addOnTotal: 200000,
      lineTotal: 600000,
      quantity: 1,
    };

    expect(resolveOrderItemBaseAmount(item)).toBe(400000);
    expect(resolveOrderItemLineTotal(item)).toBe(600000);
  });

  it("splits recap subtotal into base and derived add-on amount", () => {
    const split = splitRecapPriceComponents({
      parsedSubtotal: 600000,
      parsedUnitPrice: 400000,
      quantity: 1,
      catalogBaseAmount: 400000,
      computedAddOnAmount: 0,
    });

    expect(split.baseAmount).toBe(400000);
    expect(split.addOnAmount).toBe(200000);
    expect(split.totalAmount).toBe(600000);
  });

  it("repairs collapsed legacy item pricing from recap notes", () => {
    const item = {
      basePrice: 600000,
      addOnTotal: 0,
      lineTotal: 600000,
      quantity: 1,
      notes:
        "5 medium cookies baby shark\nHarga recap: Rp 400.000 / unit\nSubtotal recap: Rp 600.000",
    };

    expect(resolveOrderItemBaseAmount(item)).toBe(400000);
    expect(resolveOrderItemAddOnAmount(item)).toBe(200000);
    expect(resolveOrderItemLineTotal(item)).toBe(600000);
  });

  it("uses recap subtotal difference over catalog add-on when both exist", () => {
    const split = splitRecapPriceComponents({
      parsedSubtotal: 600000,
      parsedUnitPrice: 400000,
      quantity: 1,
      catalogBaseAmount: 400000,
      computedAddOnAmount: 250000,
    });

    expect(split.baseAmount).toBe(400000);
    expect(split.addOnAmount).toBe(200000);
    expect(split.totalAmount).toBe(600000);
  });
});
