import crypto from "crypto";
import { MIDTRANS_CONFIG } from "./config";
import type { MidtransNotification } from "./types";

/**
 * Verify Midtrans notification signature
 */
export function verifySignature(notification: MidtransNotification): boolean {
  const { order_id, status_code, gross_amount, signature_key } = notification as any;
  const serverKey = MIDTRANS_CONFIG.serverKey;

  const hash = crypto
    .createHash("sha512")
    .update(`${order_id}${status_code}${gross_amount}${serverKey}`)
    .digest("hex");

  return hash === signature_key;
}

/**
 * Map Midtrans transaction status to our PaymentStatus
 */
export function mapTransactionStatus(
  transactionStatus: string,
  fraudStatus?: string,
): "Paid" | "Pending" {
  // https://docs.midtrans.com/en/after-payment/http-notification

  if (transactionStatus === "capture") {
    // For credit card
    if (fraudStatus === "accept") {
      return "Paid";
    }
    return "Pending";
  }

  if (
    transactionStatus === "settlement" ||
    transactionStatus === "success"
  ) {
    return "Paid";
  }

  // pending, deny, expire, cancel, refund, partial_refund, chargeback, partial_chargeback
  return "Pending";
}
