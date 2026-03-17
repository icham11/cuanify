import { snap, MIDTRANS_CONFIG, assertMidtransConfig } from "./config";
import type { MidtransParameter, MidtransSnapResponse } from "./types";
import { logPayment } from "@/lib/logger";

function extractMidtransErrorDetails(error: unknown): string[] {
  return (
    (error as Record<string, unknown> & { ApiResponse?: { error_messages?: string[] } })?.ApiResponse
      ?.error_messages || []
  );
}

function isUnauthorizedTransaction(error: unknown, details: string[]): boolean {
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    msg.includes("http status code: 401") ||
    msg.includes("unauthorized transaction") ||
    details.some((d) => d.toLowerCase().includes("unauthorized transaction"))
  );
}

/**
 * Create Midtrans Snap transaction token
 */
export async function createSnapTransaction(
  parameter: MidtransParameter,
): Promise<MidtransSnapResponse> {
  try {
    assertMidtransConfig();

    if (MIDTRANS_CONFIG.warnings.length > 0) {
      logPayment.warn("Midtrans config warnings", {
        environment: MIDTRANS_CONFIG.environment,
        warnings: MIDTRANS_CONFIG.warnings,
      });
    }

    const transaction = await snap.createTransaction(parameter);
    return {
      token: transaction.token,
      redirect_url: transaction.redirect_url,
    };
  } catch (error: unknown) {
    const errorDetails = extractMidtransErrorDetails(error);

    // Some production merchants don't have all requested channels activated.
    // Retry once without `enabled_payments` so Midtrans can choose allowed channels.
    if (parameter.enabled_payments?.length && isUnauthorizedTransaction(error, errorDetails)) {
      try {
        logPayment.warn("Midtrans unauthorized with enabled_payments, retrying without restrictions", {
          environment: MIDTRANS_CONFIG.environment,
          requestedPayments: parameter.enabled_payments,
        });

        const fallbackParam: MidtransParameter = { ...parameter };
        delete fallbackParam.enabled_payments;
        const fallbackTx = await snap.createTransaction(fallbackParam);
        return {
          token: fallbackTx.token,
          redirect_url: fallbackTx.redirect_url,
        };
      } catch (retryError: unknown) {
        const retryDetails = extractMidtransErrorDetails(retryError);
        const retryMsg = retryError instanceof Error ? retryError.message : String(retryError);
        logPayment.error("Midtrans retry without enabled_payments failed", {
          error: retryMsg,
          details: retryDetails,
          environment: MIDTRANS_CONFIG.environment,
        });
        // Continue to unified error handling below using retry error context
        error = retryError;
      }
    }

    const errorMsg = error instanceof Error ? error.message : String(error);
    logPayment.error("Midtrans Snap error", {
      error: errorMsg,
      environment: MIDTRANS_CONFIG.environment,
      serverKeyPrefix: MIDTRANS_CONFIG.serverKey.slice(0, 10),
      clientKeyPrefix: MIDTRANS_CONFIG.clientKey.slice(0, 10),
    });

    // Extract error details if available
    const details = extractMidtransErrorDetails(error);
    if (details.length > 0) {
      logPayment.error("Midtrans validation details", { details });
      throw new Error(`Midtrans validation failed: ${details.join(", ")}`);
    }

    throw new Error(`Failed to create Midtrans transaction: ${errorMsg}`);
  }
}

/**
 * Get transaction status from Midtrans
 * @internal Used by middleware and webhooks
 */
export async function getTransactionStatus(orderId: string) {
  try {
    return await snap.transaction.status(orderId);
  } catch (error) {
    logPayment.error("Midtrans status check error", { orderId, error });
    throw new Error("Failed to check transaction status");
  }
}
