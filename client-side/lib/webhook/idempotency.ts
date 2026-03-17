import prisma from "@/lib/prisma";
import { logWebhook } from "@/lib/logger";

const log = logWebhook.child({ module: "idempotency" });

/**
 * Webhook Idempotency Guard
 *
 * Prevents duplicate webhook processing — critical for payment webhooks
 * where Midtrans/Xendit may retry delivery multiple times.
 *
 * Flow:
 *   1. Generate a deterministic eventId from webhook data
 *   2. Try to INSERT the event (unique constraint = natural lock)
 *   3. If already exists → skip (return result of first processing)
 *   4. If new → run handler, then mark completed/failed
 *
 * This guarantees at-most-once processing even under concurrent retries.
 */

export interface IdempotencyResult<T = unknown> {
  /** Whether this call actually processed the webhook (false = duplicate) */
  processed: boolean;
  /** Whether the event was already completed before this call */
  duplicate: boolean;
  /** Result from handler (only when processed=true) */
  data?: T;
  /** Error message if processing failed */
  error?: string;
}

interface AcquireResult {
  acquired: boolean;
  existingStatus?: string;
  eventRecord?: { id: number; status: string };
}

/**
 * Build a deterministic event ID for Midtrans notifications.
 *
 * Format: `midtrans:{order_id}:{transaction_status}:{transaction_id}`
 * This ensures that the same logical event (e.g. settlement for order X)
 * is only processed once, even if Midtrans sends multiple retries.
 */
export function buildMidtransEventId(
  orderId: string,
  transactionStatus: string,
  transactionId?: string,
): string {
  const parts = ["midtrans", orderId, transactionStatus];
  if (transactionId) parts.push(transactionId);
  return parts.join(":");
}

/**
 * Build a deterministic event ID for Xendit callbacks.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function buildXenditEventId(
  externalId: string,
  status: string,
  invoiceId?: string,
): string {
  const parts = ["xendit", externalId, status];
  if (invoiceId) parts.push(invoiceId);
  return parts.join(":");
}

/**
 * Try to acquire the idempotency lock for an event.
 * Uses INSERT with unique constraint as a distributed lock.
 */
async function acquireEvent(
  eventId: string,
  source: string,
  payload?: unknown,
): Promise<AcquireResult> {
  try {
    const record = await prisma.webhookEvent.create({
      data: {
        eventId,
        source,
        status: "processing",
        payload: payload ? JSON.parse(JSON.stringify(payload)) : undefined,
      },
    });

    return { acquired: true, eventRecord: { id: record.id, status: record.status } };
  } catch (error: unknown) {
    // Unique constraint violation → event already exists
    const isUniqueViolation =
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: string }).code === "P2002";

    if (isUniqueViolation) {
      // Fetch existing record to check its status
      const existing = await prisma.webhookEvent.findUnique({
        where: { eventId },
        select: { id: true, status: true },
      });

      return {
        acquired: false,
        existingStatus: existing?.status,
        eventRecord: existing ? { id: existing.id, status: existing.status } : undefined,
      };
    }

    // Unexpected error → rethrow
    throw error;
  }
}

/**
 * Mark event as completed.
 */
async function markCompleted(eventId: string): Promise<void> {
  await prisma.webhookEvent.update({
    where: { eventId },
    data: {
      status: "completed",
      processedAt: new Date(),
    },
  });
}

/**
 * Mark event as failed with error message.
 */
async function markFailed(eventId: string, errorMessage: string): Promise<void> {
  await prisma.webhookEvent.update({
    where: { eventId },
    data: {
      status: "failed",
      errorMessage,
      processedAt: new Date(),
    },
  });
}

/**
 * Main idempotency guard.
 *
 * Usage:
 * ```ts
 * const result = await withIdempotency(
 *   buildMidtransEventId(order_id, transaction_status, transaction_id),
 *   "midtrans",
 *   notification,  // raw payload for audit
 *   async () => {
 *     // ... your webhook processing logic ...
 *     return { orderId: order_id, status: "processed" };
 *   }
 * );
 *
 * if (result.duplicate) {
 *   return NextResponse.json({ message: "Already processed" }, { status: 200 });
 * }
 * ```
 */
export async function withIdempotency<T>(
  eventId: string,
  source: string,
  payload: unknown,
  handler: () => Promise<T>,
): Promise<IdempotencyResult<T>> {
  // 1. Try to acquire the lock
  const { acquired, existingStatus } = await acquireEvent(eventId, source, payload);

  // 2. If event already exists, handle based on status
  if (!acquired) {
    if (existingStatus === "completed") {
      log.info("Skipping duplicate event (already completed)", { eventId });
      return { processed: false, duplicate: true };
    }

    if (existingStatus === "processing") {
      // Another instance is currently processing this event.
      // Return duplicate to avoid double processing — the other instance will finish.
      log.info("Event currently being processed by another instance", { eventId });
      return { processed: false, duplicate: true };
    }

    if (existingStatus === "failed") {
      // Previous attempt failed — allow retry by updating status back to processing
      log.info("Retrying previously failed event", { eventId });
      await prisma.webhookEvent.update({
        where: { eventId },
        data: { status: "processing", errorMessage: null, processedAt: null },
      });
      // Fall through to process
    }
  }

  // 3. Process the event
  try {
    log.debug("Processing event", { eventId });
    const data = await handler();
    await markCompleted(eventId);
    log.info("Event completed", { eventId });
    return { processed: true, duplicate: false, data };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error("Event failed", { eventId, error: errorMessage });
    await markFailed(eventId, errorMessage);
    return { processed: true, duplicate: false, error: errorMessage };
  }
}

/**
 * Cleanup old webhook events (housekeeping).
 * Call this periodically (e.g. daily cron) to prevent table bloat.
 *
 * @param olderThanDays - Delete events older than this many days (default: 30)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function cleanupOldWebhookEvents(olderThanDays = 30): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);

  const result = await prisma.webhookEvent.deleteMany({
    where: {
      createdAt: { lt: cutoff },
      status: { in: ["completed", "failed"] },
    },
  });

  log.info("Cleaned up old webhook events", { deleted: result.count, olderThanDays });
  return result.count;
}

