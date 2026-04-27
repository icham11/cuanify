declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: (value: unknown) => {
  toBe: (expected: unknown) => void;
};

import { distributeProductionTokens } from "../production-stages";

describe("distributeProductionTokens", () => {
  it("always preserves total token sum", () => {
    for (let total = 0; total <= 201; total += 1) {
      const split = distributeProductionTokens({ totalTokens: total });
      const sum = split.reduce((acc, entry) => acc + entry.tokenAmount, 0);
      expect(sum).toBe(total);
    }
  });

  it("uses safe 25/25/residual split for odd totals", () => {
    const split99 = distributeProductionTokens({ totalTokens: 99 });
    const listing99 = split99.find((entry) => entry.stage === "listing")?.tokenAmount ?? -1;
    const filling99 = split99.find((entry) => entry.stage === "filling")?.tokenAmount ?? -1;
    const finishing99 = split99.find((entry) => entry.stage === "finishing")?.tokenAmount ?? -1;

    expect(listing99).toBe(25);
    expect(filling99).toBe(25);
    expect(finishing99).toBe(49);

    const split101 = distributeProductionTokens({ totalTokens: 101 });
    const listing101 = split101.find((entry) => entry.stage === "listing")?.tokenAmount ?? -1;
    const filling101 = split101.find((entry) => entry.stage === "filling")?.tokenAmount ?? -1;
    const finishing101 = split101.find((entry) => entry.stage === "finishing")?.tokenAmount ?? -1;

    expect(listing101).toBe(25);
    expect(filling101).toBe(25);
    expect(finishing101).toBe(51);
  });
});
