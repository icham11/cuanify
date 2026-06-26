import { describe, expect, it, vi } from "vitest";
import {
  DatabaseTemporarilyUnavailableError,
  isPrismaConnectionTimeout,
  withPrismaRetry,
} from "../prisma-errors";

describe("prisma connection error detection", () => {
  it("treats neon data transfer quota failures as transient auth-blocking DB errors", () => {
    const error = new Error(
      "Your project has exceeded the data transfer quota. Upgrade your plan to increase limits.",
    );

    expect(isPrismaConnectionTimeout(error)).toBe(true);
  });

  it("does not retry when cooldown is already active", async () => {
    const fn = vi.fn(async () => {
      throw new DatabaseTemporarilyUnavailableError();
    });

    await expect(withPrismaRetry(fn, 3, 1)).rejects.toBeInstanceOf(
      DatabaseTemporarilyUnavailableError,
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not retry quota exhaustion errors", async () => {
    const fn = vi.fn(async () => {
      throw new Error(
        "Your project has exceeded the data transfer quota. Upgrade your plan to increase limits.",
      );
    });

    await expect(withPrismaRetry(fn, 3, 1)).rejects.toThrow(
      "data transfer quota",
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
