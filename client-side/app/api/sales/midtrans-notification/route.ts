import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifySignature, mapTransactionStatus } from "@/lib/midtrans/notification";
import type { MidtransNotification } from "@/lib/midtrans/types";
import { createXenditInvoice } from "@/lib/xendit/invoices";
import {
  calculateProductCost,
  deductInventory,
  updateBusinessMetrics,
  updateProductMetrics,
} from "@/lib/services/saleHelpers";
import { deductProductionBatch } from "@/lib/inventory/production-engine";
import {
  withIdempotency,
  buildMidtransEventId,
} from "@/lib/webhook/idempotency";
import { logWebhook } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * POST /api/sales/midtrans-notification
 *
 * Webhook endpoint for Midtrans payment notifications.
 * Protected by idempotency guard — safe against duplicate/retry deliveries.
 *
 * When payment is confirmed ("Paid"), this handler:
 *   1. Calculates direct product COGS per item
 *   2. Creates StockDocument audit trail
 *   3. Updates BusinessMetrics + ProductMetrics (margin_avg)
 *   4. Recomputes cogs on sold products
 */
export async function POST(request: NextRequest) {
  try {
    const log = logWebhook.child({ source: "midtrans" });

    const notification: MidtransNotification = await request.json();

    log.info("Notification received", { orderId: notification.order_id, status: notification.transaction_status });

    // 1. Verify signature
    if (!verifySignature(notification)) {
      log.warn("Invalid signature", { orderId: notification.order_id });
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const { order_id, transaction_status, fraud_status, transaction_id } = notification;

    // 2a. Handle Midtrans test notifications (from Dashboard "Test notification URL")
    if (order_id.startsWith("payment_notif_test_")) {
      log.info("Test notification received — responding OK", { orderId: order_id });
      return NextResponse.json({
        success: true,
        message: "Test notification acknowledged",
        test: true,
      });
    }

    // 3. Build idempotency key and guard against duplicate processing
    const eventId = buildMidtransEventId(order_id, transaction_status, transaction_id);

    const result = await withIdempotency(
      eventId,
      "midtrans",
      notification,
      async () => {
        // ── Begin actual webhook processing (runs at-most-once) ──

        // 3. Find sale by transaction number
        const sale = await prisma.sale.findUnique({
          where: { transactionNumber: order_id },
          include: {
            saleItems: {
              include: {
                product: true,
              },
            },
          },
        });

        if (!sale) {
          throw new Error(`Sale not found for order_id: ${order_id}`);
        }

        // 4. Map transaction status
        const paymentStatus = mapTransactionStatus(transaction_status, fraud_status);

        // 5. Update sale and process inventory if paid
        await prisma.$transaction(async (tx) => {
          // Re-fetch sale inside transaction to prevent double-processing
          // (the client /confirm endpoint may have already set it to "Paid")
          const freshSale = await tx.sale.findUniqueOrThrow({
            where: { id: sale.id },
            select: { paymentStatus: true },
          });

          if (paymentStatus === "Paid" && freshSale.paymentStatus !== "Paid") {
            // ── Payment successful ──

            // 5a. Create StockDocument for audit trail
            const stockDocument = await tx.stockDocument.create({
              data: {
                businessId: sale.businessId,
                type: "Sale",
                notes: `Midtrans payment confirmed: ${order_id}`,
              },
            });

            let totalCost = 0;
            const saleItemDetails: Array<{
              productId: number;
              quantity: number;
              priceAtSale: number;
              costAtSale: number;
            }> = [];

            // 5b. Calculate cost + deduct inventory for each item
            for (const item of sale.saleItems) {
              // Check product type
              const product = await tx.product.findUnique({
                where: { id: item.productId },
                select: { productType: true, cogs: true },
              });

              let cost: number;

              if (product?.productType === "ReadyStock") {
                // ReadyStock: manual product stock is source of truth
                await tx.product.update({
                  where: { id: item.productId },
                  data: { manualStock: { decrement: item.quantity } },
                });
                cost = Number(product.cogs || 0) * item.quantity;
                try {
                  await deductProductionBatch(tx, item.productId, item.quantity);
                } catch {
                  // keep backward compatibility with legacy batches; ignore when not available
                }
              } else {
                // PreOrder: deduct from ingredient inventory
                cost = await calculateProductCost(tx, item.productId, item.quantity);
                await deductInventory(tx, item.productId, item.quantity, stockDocument.id);
              }

              totalCost += cost;

              const unitCost = item.quantity > 0 ? cost / item.quantity : 0;

              await tx.saleItem.update({
                where: { id: item.id },
                data: { costAtSale: unitCost },
              });


              saleItemDetails.push({
                productId: item.productId,
                quantity: item.quantity,
                priceAtSale: Number(item.priceAtSale),
                costAtSale: unitCost,
              });
            }

            // 5c. Update sale with cost, status, and link to stock document
            await tx.sale.update({
              where: { id: sale.id },
              data: {
                totalCost,
                paymentStatus: "Paid",
                stockDocumentId: stockDocument.id,
              },
            });

            // 5d. Update BusinessMetrics (margin_avg)
            const totalRevenue = Number(sale.totalRevenue);
            await updateBusinessMetrics(tx, sale.businessId, totalRevenue, totalCost);

            // 5e. Update ProductMetrics per item
            for (const detail of saleItemDetails) {
              await updateProductMetrics(
                tx,
                detail.productId,
                detail.quantity,
                detail.priceAtSale * detail.quantity,
                detail.costAtSale * detail.quantity,
              );
            }

            log.info("Payment successful — inventory deducted, metrics updated", { orderId: order_id });
          } else if (freshSale.paymentStatus === "Paid") {
            // Already confirmed by client /confirm endpoint — skip
            log.info("Payment already confirmed by client", { orderId: order_id });
          } else {
            // Just update status for other cases (pending, etc.)
            await tx.sale.update({
              where: { id: sale.id },
              data: { paymentStatus },
            });

            log.info("Payment status updated", { orderId: order_id, paymentStatus });
          }
        }, { timeout: 30000 });

        // 6. Create Xendit invoice (non-critical, outside transaction)
        if (paymentStatus === "Paid" && !sale.invoiceId) {
          try {
            if (sale.customerEmail) {
              const invoice = await createXenditInvoice({
                externalId: sale.transactionNumber,
                amount: Number(sale.totalRevenue),
                payerEmail: sale.customerEmail,
                description: `Invoice for ${sale.transactionNumber}`,
                customer: {
                  givenNames: sale.customerName || undefined,
                  email: sale.customerEmail || undefined,
                  mobileNumber: sale.customerPhone || undefined,
                },
              });

              if (invoice) {
                await prisma.sale.update({
                  where: { id: sale.id },
                  data: {
                    invoiceId: invoice.id,
                    invoiceUrl: invoice.invoiceUrl,
                    invoiceStatus: invoice.status,
                  },
                });
              }
            }
          } catch (invoiceError) {
            log.warn("Xendit invoice creation failed (non-critical)", { error: invoiceError });
            // Non-critical — don't fail the webhook
          }
        }

        return { orderId: order_id, paymentStatus };
      },
    );

    // Handle idempotency result
    if (result.duplicate) {
      log.info("Duplicate webhook ignored", { eventId });
      return NextResponse.json({
        success: true,
        message: "Duplicate notification — already processed",
        duplicate: true,
      });
    }

    if (result.error) {
      log.error("Webhook processing failed", { error: result.error });
      return NextResponse.json(
        { error: result.error },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Payment notification processed",
      data: result.data,
    });
  } catch (error: unknown) {
    logWebhook.error("POST /api/sales/midtrans-notification unhandled error", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process payment" },
      { status: 500 },
    );
  }
}
