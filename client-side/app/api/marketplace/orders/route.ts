import { NextRequest, NextResponse } from "next/server";
import { PaymentMethod, PaymentStatus, SalesChannel } from "@prisma/client";
import { z } from "zod";
import prisma from "@/lib/prisma";
import {
  isAuthError,
  isForbiddenError,
  requireAuth,
  requireRole,
} from "@/lib/auth/session";
import {
  generateTransactionNumber,
  updateBusinessMetrics,
  updateProductMetrics,
} from "@/lib/services/saleHelpers";

export const runtime = "nodejs";

const marketplaceOrderSchema = z.object({
  platform: z.enum(["tokopedia", "shopee"]),
  orderReference: z.string().trim().min(1, "Nomor order wajib diisi."),
  customerName: z.string().trim().min(1, "Nama pembeli wajib diisi."),
  orderDate: z.string().trim().min(1, "Tanggal order wajib diisi."),
  shipDate: z.string().trim().min(1, "Estimasi tanggal kirim wajib diisi."),
  shippingMethod: z.string().trim().min(1, "Metode pengiriman wajib diisi."),
  customerNotes: z.string().trim().optional().default(""),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        category: z.string().trim().min(1),
        subcategory: z.string().trim().min(1),
        productName: z.string().trim().min(1),
        size: z.string().trim().min(1),
        quantity: z.number().int().positive(),
        unitPrice: z.number().nonnegative(),
        unitCost: z.number().nonnegative().optional().default(0),
        addOns: z
          .array(
            z.object({
              id: z.string().trim().min(1),
              label: z.string().trim().min(1),
              quantity: z.number().int().positive(),
              unitPrice: z.number().nonnegative(),
              unitCost: z.number().nonnegative().optional().default(0),
            }),
          )
          .optional()
          .default([]),
      }),
    )
    .min(1, "Minimal ada 1 item."),
});

function parseDateInput(value: string): Date | null {
  const matched = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return null;

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  // Store as mid-day Asia/Jakarta to keep the same business date when rendered back.
  const date = new Date(Date.UTC(year, month - 1, day, 5, 0, 0, 0));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatMarketplaceLabel(platform: "tokopedia" | "shopee"): string {
  return platform === "tokopedia" ? "Tokopedia" : "Shopee";
}

function getJakartaDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    requireRole(auth, "Owner", "Admin", "Cashier");

    const body = await request.json();
    const parsed = marketplaceOrderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const input = parsed.data;
    const financialDate =
      parseDateInput(input.shipDate) ??
      parseDateInput(input.orderDate) ??
      new Date();
    const todayJakartaKey = getJakartaDateKey(new Date());
    const financialDateKey = getJakartaDateKey(financialDate);

    let activeShift: { id: number } | null = null;
    if (financialDateKey === todayJakartaKey) {
      try {
        activeShift = await prisma.cashierShift.findFirst({
          where: {
            businessId: auth.businessId,
            status: "Open",
          },
          select: { id: true },
        });
      } catch {
        activeShift = null;
      }
    }

    const productIds = [...new Set(input.items.map((item) => item.productId))];
    const products = await prisma.product.findMany({
      where: {
        businessId: auth.businessId,
        id: { in: productIds },
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (products.length !== productIds.length) {
      const foundIds = new Set(products.map((product) => product.id));
      const missingId = productIds.find((id) => !foundIds.has(id));
      return NextResponse.json(
        {
          error: `Produk dengan ID ${missingId} tidak ditemukan. Sync catalog marketplace dulu lalu coba lagi.`,
        },
        { status: 400 },
      );
    }

    const productNameById = new Map(products.map((product) => [product.id, product.name]));
    const paymentLabel = formatMarketplaceLabel(input.platform);

    const result = await prisma.$transaction(async (tx) => {
      let totalRevenue = 0;
      let totalCost = 0;

      const sale = await tx.sale.create({
        data: {
          businessId: auth.businessId,
          transactionNumber: generateTransactionNumber(),
          totalRevenue: 0,
          totalCost: 0,
          paymentMethod: PaymentMethod.Marketplace,
          paymentStatus: PaymentStatus.Paid,
          sales_channel:
            input.platform === "tokopedia"
              ? SalesChannel.tokopedia
              : SalesChannel.shopee,
          cashierShiftId: activeShift?.id ?? null,
          customerName: input.customerName,
          customerPhone: null,
          customerEmail: null,
          createdAt: financialDate,
        },
      });

      for (const item of input.items) {
        const addOnRevenue = (item.addOns ?? []).reduce(
          (sum, addOn) => sum + addOn.quantity * addOn.unitPrice,
          0,
        );
        const addOnCost = (item.addOns ?? []).reduce(
          (sum, addOn) => sum + addOn.quantity * (addOn.unitCost ?? 0),
          0,
        );

        const lineRevenue = item.quantity * item.unitPrice + addOnRevenue;
        const lineCost = item.quantity * (item.unitCost ?? 0) + addOnCost;
        const effectiveUnitPrice = lineRevenue / item.quantity;
        const effectiveUnitCost = lineCost / item.quantity;

        totalRevenue += lineRevenue;
        totalCost += lineCost;

        await tx.saleItem.create({
          data: {
            saleId: sale.id,
            productId: item.productId,
            quantity: item.quantity,
            priceAtSale: effectiveUnitPrice,
            costAtSale: effectiveUnitCost,
            createdAt: financialDate,
          },
        });
      }

      await tx.sale.update({
        where: { id: sale.id },
        data: {
          totalRevenue,
          totalCost,
          customerEmail: null,
        },
      });

      await updateBusinessMetrics(
        tx,
        auth.businessId,
        totalRevenue,
        totalCost,
        financialDate,
      );

      for (const item of input.items) {
        const addOnRevenue = (item.addOns ?? []).reduce(
          (sum, addOn) => sum + addOn.quantity * addOn.unitPrice,
          0,
        );
        const addOnCost = (item.addOns ?? []).reduce(
          (sum, addOn) => sum + addOn.quantity * (addOn.unitCost ?? 0),
          0,
        );

        await updateProductMetrics(
          tx,
          item.productId,
          item.quantity,
          item.quantity * item.unitPrice + addOnRevenue,
          item.quantity * (item.unitCost ?? 0) + addOnCost,
          financialDate,
        );
      }

      try {
        await tx.marketplaceSale.create({
          data: {
            businessId: auth.businessId,
            marketplace: paymentLabel,
            orderId: input.orderReference,
            totalAmount: totalRevenue,
            itemName: input.items
              .map((item) => {
                const dbName =
                  productNameById.get(item.productId) ||
                  `${item.productName} - ${item.size}`;
                return `${dbName} x${item.quantity}`;
              })
              .join(", ")
              .slice(0, 255),
            saleDate: financialDate,
            createdAt: financialDate,
            updatedAt: financialDate,
          },
        });
      } catch (marketplaceShadowError) {
        console.warn("[marketplace/orders] marketplace shadow row skipped", {
          businessId: auth.businessId,
          message:
            marketplaceShadowError instanceof Error
              ? marketplaceShadowError.message
              : String(marketplaceShadowError),
        });
      }

      return tx.sale.findUnique({
        where: { id: sale.id },
        include: {
          saleItems: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  categoryId: true,
                },
              },
            },
          },
        },
      });
    });

    return NextResponse.json(
      {
        success: true,
        data: result,
        message:
          "Order e-commerce tersimpan ke catatan keuangan marketplace tanpa membuat booking order.",
      },
      { status: 201 },
    );
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (isForbiddenError(error)) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("POST /api/marketplace/orders error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save marketplace order",
      },
      { status: 500 },
    );
  }
}
