import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth/session";
import { createSaleSchema } from "@/lib/validations/sale";
import { createSnapTransaction } from "@/lib/midtrans/snap";
import { getReadyStockAvailable } from "@/lib/inventory/production-engine";

export const runtime = "nodejs";

const ONLINE_PAYMENT_METHODS = new Set(["QRIS", "Transfer", "Digital"] as const);

function getEnabledPayments(paymentMethod: string) {
  if (paymentMethod === "QRIS") {
    return ["gopay", "shopeepay", "other_qris"];
  }
  if (paymentMethod === "Transfer") {
    return ["bca_va", "bni_va", "bri_va", "permata_va"];
  }
  if (paymentMethod === "Digital") {
    return ["gopay", "shopeepay"];
  }
  return ["gopay", "shopeepay", "other_qris", "bca_va", "bni_va", "bri_va", "permata_va"];
}

async function validateInventoryAvailability(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  items: Array<{ productId: number; quantity: number }>,
  productInfoMap: Map<number, { name: string; productType: string }>,
) {
  for (const item of items) {
    const productInfo = productInfoMap.get(item.productId);
    if (!productInfo) {
      throw new Error(`Product with ID ${item.productId} not found`);
    }

    // ReadyStock: validate from production batches (not ingredient batches)
    if (productInfo.productType === "ReadyStock") {
      const available = await getReadyStockAvailable(tx, item.productId);
      if (available < item.quantity) {
        throw new Error(
          `Stok produk "${productInfo.name}" tidak cukup. Tersedia: ${available}, dibutuhkan: ${item.quantity}.`,
        );
      }
      continue;
    }

    // PreOrder: validate from ingredient inventory batches
    const recipes = await tx.recipe.findMany({
      where: { productId: item.productId },
      include: {
        ingredient: {
          select: {
            name: true,
            inventoryBatches: {
              where: { remainingQty: { gt: 0 } },
              select: { remainingQty: true },
            },
          },
        },
      },
    });

    for (const recipe of recipes) {
      const requiredQty = Number(recipe.quantity) * item.quantity;
      const availableQty = recipe.ingredient.inventoryBatches.reduce((sum, b) => sum + Number(b.remainingQty), 0);

      if (availableQty < requiredQty) {
        throw new Error(
          `Insufficient stock for ingredient: ${recipe.ingredient.name} (need ${requiredQty}, available ${availableQty})`,
        );
      }
    }
  }
}

/**
 * POST /api/sales/midtrans-token
 *
 * Create a sale with Pending status and get Midtrans Snap token for payment
 *
 * Input (JSON):
 *   {
 *     "items": [{ "productId": 1, "quantity": 2 }],
 *     "paymentMethod": "QRIS" | "Transfer" | "Digital",
 *     "customerName": "John Doe",
 *     "customerEmail": "john@example.com",
 *     "customerPhone": "08123456789" (optional)
 *   }
 *
 * Success (200):
 *   {
 *     "success": true,
 *     "data": {
 *       "snapToken": "xxx-xxx-xxx",
 *       "orderId": "TRX-1234567890-001",
 *       "saleId": 1
 *     }
 *   }
 *
 * Errors:
 *   400 — { "error": "Validation failed" }
 *   401 — { "error": "Unauthorized" }
 *   500 — { "error": "Failed to create transaction" }
 */
export async function POST(request: NextRequest) {
  try {
    const { businessId } = await requireAuth();
    const body = await request.json();

    const parsed = createSaleSchema.safeParse({
      items: body.items,
      paymentMethod: body.paymentMethod,
      paymentStatus: "Pending", // Always Pending for Midtrans
      sales_channel: body.sales_channel,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { items, paymentMethod, sales_channel } = parsed.data;
    const { customerName, customerEmail, customerPhone } = body;

    if (!ONLINE_PAYMENT_METHODS.has(paymentMethod as "QRIS" | "Transfer" | "Digital")) {
      return NextResponse.json({ error: "Online payment requires non-cash method" }, { status: 400 });
    }

    if (!customerName) {
      return NextResponse.json({ error: "Customer name is required" }, { status: 400 });
    }

    // Email validation for Midtrans
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValidEmail = customerEmail && EMAIL_REGEX.test(customerEmail);

    if (!isValidEmail) {
      return NextResponse.json(
        { error: "Valid customer email is required (format: email@example.com)" },
        { status: 400 },
      );
    }

    // Look up active cashier shift
    let activeShift: { id: number } | null = null;
    try {
      activeShift = await prisma.cashierShift.findFirst({
        where: { businessId, status: "Open" },
        select: { id: true },
      });
    } catch {
      // CashierShift table may not exist yet — silently ignore
    }

    const result = await prisma.$transaction(
      async (tx) => {
        // 1. Validate products
        const productIds = [...new Set(items.map((i) => i.productId))];
        const products = await tx.product.findMany({
          where: { id: { in: productIds }, businessId, deletedAt: null },
          select: { id: true, name: true, sellingPrice: true, productType: true },
        });

        if (products.length !== productIds.length) {
          const foundIds = new Set(products.map((p) => p.id));
          const missing = productIds.filter((id) => !foundIds.has(id));
          throw new Error(`Product with ID ${missing[0]} not found`);
        }

        const productInfoMap = new Map(
          products.map((p) => [p.id, { name: p.name, productType: p.productType }]),
        );

        await validateInventoryAvailability(tx, items, productInfoMap);

        const productMap = new Map(products.map((p) => [p.id, { name: p.name, price: Number(p.sellingPrice) }]));

        // 2. Calculate total
        let totalRevenue = 0;
        const itemDetails = [];

        for (const item of items) {
          const product = productMap.get(item.productId)!;
          const subtotal = product.price * item.quantity;
          totalRevenue += subtotal;

          itemDetails.push({
            id: `PROD-${item.productId}`,
            name: product.name,
            price: product.price,
            quantity: item.quantity,
          });
        }

        // 3. Generate transaction number
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 1000)
          .toString()
          .padStart(3, "0");
        const transactionNumber = `TRX-${timestamp}-${random}`;

        // 4. Create stock document
        const stockDocument = await tx.stockDocument.create({
          data: {
            businessId,
            type: "Sale",
            notes: `Pending sale - Midtrans payment`,
          },
        });

        // 5. Create sale with Pending status
        const sale = await tx.sale.create({
          data: {
            businessId,
            stockDocumentId: stockDocument.id,
            cashierShiftId: activeShift?.id || null,
            transactionNumber,
            totalRevenue,
            totalCost: 0, // Will calculate after payment success
            paymentMethod,
            paymentStatus: "Pending",
            sales_channel,
            customerName,
            customerEmail,
            customerPhone,
          },
        });

        // 6. Create sale items (without deducting inventory yet)
        await tx.saleItem.createMany({
          data: items.map((item) => ({
            saleId: sale.id,
            productId: item.productId,
            quantity: item.quantity,
            priceAtSale: productMap.get(item.productId)!.price,
            costAtSale: 0, // Will calculate after payment success
          })),
        });

        return {
          saleId: sale.id,
          transactionNumber,
          totalRevenue,
          itemDetails,
        };
      },
      { timeout: 15000 },
    );

    const origin = request.nextUrl?.origin ?? new URL(request.url).origin;

    // 7. Create Midtrans Snap transaction
    const snapResponse = await createSnapTransaction({
      transaction_details: {
        order_id: result.transactionNumber,
        gross_amount: result.totalRevenue,
      },
      item_details: result.itemDetails,
      customer_details: {
        first_name: customerName || "Customer",
        email: customerEmail, // Already validated above
        phone: customerPhone || "", // Optional, but provide empty string if not provided
      },
      enabled_payments: getEnabledPayments(paymentMethod),
      callbacks: {
        finish: `${origin}/pos/payment-success?saleId=${result.saleId}&orderId=${result.transactionNumber}&source=midtrans&status=success`,
        error: `${origin}/pos?payment=error&orderId=${result.transactionNumber}`,
        pending: `${origin}/pos/payment-success?saleId=${result.saleId}&orderId=${result.transactionNumber}&source=midtrans&pending=true`,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        snapToken: snapResponse.token,
        orderId: result.transactionNumber,
        saleId: result.saleId,
      },
    });
  } catch (error: unknown) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (
      error instanceof Error &&
      (
        error.message.includes("not found") ||
        error.message.includes("Insufficient stock") ||
        error.message.includes("Stok produk")
      )
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (
      error instanceof Error &&
      (
        error.message.includes("Midtrans validation failed") ||
        error.message.includes("Failed to create Midtrans transaction")
      )
    ) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    console.error("POST /api/sales/midtrans-token error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create transaction" },
      { status: 500 },
    );
  }
}
