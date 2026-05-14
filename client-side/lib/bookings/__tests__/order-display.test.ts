declare const describe: {
  (name: string, fn: () => void): void;
};
declare const it: (name: string, fn: () => void | Promise<void>) => void;
declare const expect: (value: unknown) => {
  toBe: (expected: unknown) => void;
};

import { getOrderItemsSummary } from "../order-display";

describe("order display helpers", () => {
  it("keeps separate line items instead of merging all quantities into the first product", () => {
    const summary = getOrderItemsSummary([
      { productName: "Custom Cookies", quantity: 30 },
      { productName: "Individual Cupcakes", quantity: 20 },
    ]);

    expect(summary).toBe("30x Custom Cookies + 20x Individual Cupcakes");
  });

  it("falls back to the order label when there are no valid item names", () => {
    const summary = getOrderItemsSummary(
      [{ productName: "   ", quantity: 50 }],
      "Custom Order",
    );

    expect(summary).toBe("Custom Order");
  });
});
