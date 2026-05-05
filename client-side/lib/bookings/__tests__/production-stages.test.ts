declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: (value: unknown) => {
  toBe: (expected: unknown) => void;
};

import {
  distributeProductionTokens,
  normalizeProductionStageAssignments,
} from "../production-stages";

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
    const lining99 = split99.find((entry) => entry.stage === "lining")?.tokenAmount ?? -1;
    const filling99 = split99.find((entry) => entry.stage === "filling")?.tokenAmount ?? -1;
    const finishing99 = split99.find((entry) => entry.stage === "finishing")?.tokenAmount ?? -1;

    expect(lining99).toBe(25);
    expect(filling99).toBe(25);
    expect(finishing99).toBe(49);

    const split101 = distributeProductionTokens({ totalTokens: 101 });
    const lining101 = split101.find((entry) => entry.stage === "lining")?.tokenAmount ?? -1;
    const filling101 = split101.find((entry) => entry.stage === "filling")?.tokenAmount ?? -1;
    const finishing101 = split101.find((entry) => entry.stage === "finishing")?.tokenAmount ?? -1;

    expect(lining101).toBe(25);
    expect(filling101).toBe(25);
    expect(finishing101).toBe(51);
  });

  it("keeps 25/25/50 split and remembers staff per stage", () => {
    const split = distributeProductionTokens({
      totalTokens: 100,
      staffByStage: {
        lining: 11,
        filling: 22,
        finishing: 22,
      },
    });

    const lining = split.find((entry) => entry.stage === "lining");
    const filling = split.find((entry) => entry.stage === "filling");
    const finishing = split.find((entry) => entry.stage === "finishing");

    expect(lining?.tokenAmount).toBe(25);
    expect(lining?.staffId).toBe(11);
    expect(filling?.tokenAmount).toBe(25);
    expect(filling?.staffId).toBe(22);
    expect(finishing?.tokenAmount).toBe(50);
    expect(finishing?.staffId).toBe(22);
  });

  it("normalizes stale stored stages back to the current token total", () => {
    const normalized = normalizeProductionStageAssignments({
      totalTokens: 250,
      stages: [
        { stage: "lining", staffId: 1, tokenAmount: 8, percentage: 25 },
        { stage: "filling", staffId: 2, tokenAmount: 8, percentage: 25 },
        { stage: "finishing", staffId: 3, tokenAmount: 15, percentage: 50 },
      ],
    });

    const lining = normalized.find((entry) => entry.stage === "lining");
    const filling = normalized.find((entry) => entry.stage === "filling");
    const finishing = normalized.find((entry) => entry.stage === "finishing");

    expect(lining?.tokenAmount).toBe(63);
    expect(filling?.tokenAmount).toBe(63);
    expect(finishing?.tokenAmount).toBe(124);
    expect(lining?.staffId).toBe(1);
    expect(filling?.staffId).toBe(2);
    expect(finishing?.staffId).toBe(3);
  });
});
