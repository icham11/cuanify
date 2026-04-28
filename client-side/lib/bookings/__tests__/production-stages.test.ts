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

  it("keeps 25/25/50 split and remembers staff per stage", () => {
    const split = distributeProductionTokens({
      totalTokens: 100,
      staffByStage: {
        listing: 11,
        filling: 22,
        finishing: 22,
      },
    });

    const listing = split.find((entry) => entry.stage === "listing");
    const filling = split.find((entry) => entry.stage === "filling");
    const finishing = split.find((entry) => entry.stage === "finishing");

    expect(listing?.tokenAmount).toBe(25);
    expect(listing?.staffId).toBe(11);
    expect(filling?.tokenAmount).toBe(25);
    expect(filling?.staffId).toBe(22);
    expect(finishing?.tokenAmount).toBe(50);
    expect(finishing?.staffId).toBe(22);
  });
});
