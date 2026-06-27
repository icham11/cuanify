import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth/session";
import {
  calculateProductCost,
  deductInventory,
  updateBusinessMetrics,
  updateProductMetrics,
} from "@/lib/services/saleHelpers";

export const runtime = "nodejs";

/**
 * POST /api/sales/[saleId]/confirm
 *
 * Client-side confirmation endpoint for Midtrans payments.
 * Called when Midtrans Snap onSuccess callback fires, so the user
 * doesn't have to wait for the async webhook to arrive.
 *
 * Idempotent: if already "Paid", returns immediately.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ saleId: string }> },
) {
  try {
    const { businessId } = await requireAuth();
    const { saleId: saleIdStr } = await params;
    const saleId = parseInt(saleIdStr, 10);

    if (isNaN(saleId)) {
      return NextResponse.json({ error: "Invalid sale ID" }, { status: 400 });
    }

    // Fetch sale
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: {
        id: true,
        businessId: true,
        paymentStatus: true,
        transactionNumber: true,
        totalRevenue: true,
        saleItems: {
          select: {
            id: true,
            productId: true,
            quantity: true,
            priceAtSale: true,
            product: {
              select: {
                productType: true,
                cogs: true,
              },
            },
          },
        },
      },
    });

    if (!sale || sale.businessId !== businessId) {
      return NextResponse.json({ error: "Sale not found" }, { status: 404 });
    }

    // Already paid — idempotent
    if (sale.paymentStatus === "Paid") {
      return NextResponse.json({
        success: true,
        message: "Already confirmed",
        data: { saleId: sale.id, paymentStatus: "Paid" },
      });
    }

    // Only confirm Pending sales (Midtrans flow)
    if (sale.paymentStatus !== "Pending") {
      return NextResponse.json(
        { error: `Cannot confirm sale with status: ${sale.paymentStatus}` },
        { status: 400 },
      );
    }

    // Process payment confirmation in a transaction
    await prisma.$transaction(
      async (tx) => {
        // 1. Create StockDocument for audit trail
        const stockDocument = await tx.stockDocument.create({
          data: {
            businessId: sale.businessId,
            type: "Sale",
            notes: `Client-confirmed Midtrans payment: ${sale.transactionNumber}`,
          },
        });

        let totalCost = 0;
        const saleItemDetails: Array<{
          productId: number;
          quantity: number;
          priceAtSale: number;
          costAtSale: number;
        }> = [];

        // 2. Calculate cost + deduct inventory for each item
        for (const item of sale.saleItems) {
          const isReadyStock = item.product.productType === "ReadyStock";
          const cost = isReadyStock
            ? Number(item.product.cogs || 0) * item.quantity
            : await calculateProductCost(tx, item.productId, item.quantity);
          totalCost += cost;

          const unitCost = item.quantity > 0 ? cost / item.quantity : 0;

          await tx.saleItem.update({
            where: { id: item.id },
            data: { costAtSale: unitCost },
          });

          if (isReadyStock) {
            await tx.product.update({
              where: { id: item.productId },
              data: { manualStock: { decrement: item.quantity } },
            });
          } else {
            await deductInventory(tx, item.productId, item.quantity, stockDocument.id);
          }

          saleItemDetails.push({
            productId: item.productId,
            quantity: item.quantity,
            priceAtSale: Number(item.priceAtSale),
            costAtSale: unitCost,
          });
        }

        // 3. Update sale with cost + status + stock document
        await tx.sale.update({
          where: { id: sale.id },
          data: {
            totalCost,
            paymentStatus: "Paid",
            stockDocumentId: stockDocument.id,
          },
        });

        // 4. Update BusinessMetrics (margin_avg)
        const totalRevenue = Number(sale.totalRevenue);
        await updateBusinessMetrics(tx, sale.businessId, totalRevenue, totalCost);

        // 5. Update ProductMetrics per item
        for (const detail of saleItemDetails) {
          await updateProductMetrics(
            tx,
            detail.productId,
            detail.quantity,
            detail.priceAtSale * detail.quantity,
            detail.costAtSale * detail.quantity,
          );
        }

      },
      { timeout: 30000 },
    );

    return NextResponse.json({
      success: true,
      message: "Payment confirmed — inventory deducted",
      data: { saleId: sale.id, paymentStatus: "Paid" },
    });
  } catch (error: unknown) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST /api/sales/confirm error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to confirm payment" },
      { status: 500 },
    );
  }
}

