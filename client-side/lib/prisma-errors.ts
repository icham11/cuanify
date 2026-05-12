import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

const DB_TIMEOUT_COOLDOWN_MS = 30_000;
const globalForDbHealth = globalThis as typeof globalThis & {
  __dbTimeoutCooldownUntil?: number;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export class DatabaseTemporarilyUnavailableError extends Error {
  constructor(
    message = "Koneksi database sedang tidak tersedia sementara. Coba lagi beberapa saat.",
  ) {
    super(message);
    this.name = "DatabaseTemporarilyUnavailableError";
  }
}

export function isPrismaConnectionTimeout(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();

  if (
    error instanceof Prisma.PrismaClientInitializationError &&
    error.errorCode === "P1001"
  ) {
    return true;
  }

  return (
    message.includes("timeout exceeded when trying to connect") ||
    message.includes("can't reach database server") ||
    message.includes("cant reach database server") ||
    message.includes("connection timeout") ||
    message.includes("connect timeout") ||
    message.includes("max clients reached in session mode") ||
    message.includes("emaxconnsession") ||
    message.includes("too many clients")
  );
}

export function markPrismaTimeoutCooldown() {
  globalForDbHealth.__dbTimeoutCooldownUntil =
    Date.now() + DB_TIMEOUT_COOLDOWN_MS;
}

export function isPrismaTimeoutCooldownActive(): boolean {
  const until = globalForDbHealth.__dbTimeoutCooldownUntil ?? 0;
  return until > Date.now();
}

export function throwIfPrismaTimeoutCooldownActive() {
  if (isPrismaTimeoutCooldownActive()) {
    throw new DatabaseTemporarilyUnavailableError();
  }
}

export function prismaConnectionErrorResponse(
  fallbackMessage = "Koneksi database sedang sibuk. Coba lagi beberapa saat.",
) {
  markPrismaTimeoutCooldown();
  return NextResponse.json({ error: fallbackMessage }, { status: 503 });
}
