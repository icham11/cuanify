import { describe, expect, it } from "vitest";
import {
  preservePersistedStageCompletion,
  type ProductionStageAssignment,
} from "@/lib/bookings/production-stages";

const READY_AT = "2026-10-15T03:00:00.000Z";

function stage(
  name: ProductionStageAssignment["stage"],
  staffId: number | null,
  completedAt: string | null = null,
): ProductionStageAssignment {
  return {
    stage: name,
    staffId,
    tokenAmount: 10,
    percentage: 0,
    completedAt,
    completedByUserId: completedAt ? staffId : null,
  };
}

describe("preservePersistedStageCompletion", () => {
  const persisted = [
    stage("lining", 1, READY_AT),
    stage("filling", 2),
    stage("finishing", 3),
  ];

  it("keeps staff A's Ready when staff B syncs a stale order", () => {
    const result = preservePersistedStageCompletion({
      persisted,
      // Payload staff B: belum melihat Ready milik A, tapi menandai Filling Ready.
      incoming: [
        stage("lining", 1),
        stage("filling", 2, "2026-10-15T04:00:00.000Z"),
        stage("finishing", 3),
      ],
      actorUserId: 2,
    });

    expect(result[0].completedAt).toBe(READY_AT);
    expect(result[1].completedAt).toBe("2026-10-15T04:00:00.000Z");
    expect(result[2].completedAt).toBeNull();
  });

  it("does not let an admin's stale payload clear Ready", () => {
    const result = preservePersistedStageCompletion({
      persisted,
      incoming: [stage("lining", 1), stage("filling", 2), stage("finishing", 3)],
      actorUserId: 99,
    });

    expect(result[0].completedAt).toBe(READY_AT);
  });

  it("lets the assigned staff cancel their own Ready", () => {
    const result = preservePersistedStageCompletion({
      persisted,
      incoming: [stage("lining", 1), stage("filling", 2), stage("finishing", 3)],
      actorUserId: 1,
    });

    expect(result[0].completedAt).toBeNull();
  });

  it("resets Ready only on the stage that is reassigned", () => {
    const result = preservePersistedStageCompletion({
      persisted: [stage("lining", 1, READY_AT), stage("filling", 2, READY_AT)],
      incoming: [stage("lining", 4), stage("filling", 2)],
      actorUserId: 99,
    });

    expect(result[0]).toMatchObject({ staffId: 4, completedAt: null });
    expect(result[1].completedAt).toBe(READY_AT);
  });
});
