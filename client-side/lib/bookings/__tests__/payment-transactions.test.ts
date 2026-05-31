import { describe, expect, it } from "vitest";
import { reconcileEditedPaymentTransactions } from "../payment-transactions";

describe("reconcileEditedPaymentTransactions", () => {
  const actorIdentity = {
    userId: 22,
    name: "Tester",
  };

  it("rewrites full-payment history into DP-only history when edited from paid to DP", () => {
    const result = reconcileEditedPaymentTransactions({
      orderId: "SI-58",
      existingTransactions: [
        {
          id: "tx-final",
          timestamp: "2026-05-31T10:00:00.000Z",
          amount: 684000,
          type: "Final",
        },
      ],
      previousDpPaid: 0,
      previousFinalPaid: 684000,
      nextDpPaid: 342000,
      nextFinalPaid: 0,
      eventTimestamp: "2026-05-31T12:00:00.000Z",
      actorIdentity,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      timestamp: "2026-05-31T10:00:00.000Z",
      amount: 342000,
      type: "DP",
      note: "Edit order - set DP",
    });
  });

  it("rewrites DP history into final-only history when edited from DP to paid", () => {
    const result = reconcileEditedPaymentTransactions({
      orderId: "SI-58",
      existingTransactions: [
        {
          id: "tx-dp",
          timestamp: "2026-05-31T10:00:00.000Z",
          amount: 342000,
          type: "DP",
        },
      ],
      previousDpPaid: 342000,
      previousFinalPaid: 0,
      nextDpPaid: 0,
      nextFinalPaid: 684000,
      eventTimestamp: "2026-05-31T12:00:00.000Z",
      actorIdentity,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      timestamp: "2026-05-31T10:00:00.000Z",
      amount: 684000,
      type: "Final",
      note: "Edit order - set pelunasan",
    });
  });

  it("keeps additive history for real pelunasan after existing DP", () => {
    const result = reconcileEditedPaymentTransactions({
      orderId: "SI-58",
      existingTransactions: [
        {
          id: "tx-dp",
          timestamp: "2026-05-31T10:00:00.000Z",
          amount: 342000,
          type: "DP",
        },
      ],
      previousDpPaid: 342000,
      previousFinalPaid: 0,
      nextDpPaid: 342000,
      nextFinalPaid: 342000,
      eventTimestamp: "2026-06-01T03:00:00.000Z",
      actorIdentity,
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      amount: 342000,
      type: "DP",
    });
    expect(result[1]).toMatchObject({
      timestamp: "2026-06-01T03:00:00.000Z",
      amount: 342000,
      type: "Final",
      note: "Edit order - penyesuaian pelunasan",
    });
  });
});
