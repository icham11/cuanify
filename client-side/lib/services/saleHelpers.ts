import prisma from "@/lib/prisma";

export type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export function generateTransactionNumber(): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `TRX-${timestamp}-${random}`;
}

export async function calculateProductCost(
  tx: TxClient,
  productId: number,
  quantity: number,
): Promise<number> {
  const product = await tx.product.findUnique({
    where: { id: productId },
    select: { cogs: true },
  });
  return Number(product?.cogs ?? 0) * quantity;
}

export async function deductInventory(
  _tx: TxClient,
  _productId: number,
  _quantity: number,
  _stockDocumentId: number,
): Promise<void> {
  void _tx;
  void _productId;
  void _quantity;
  void _stockDocumentId;
  return;
}

export async function updateBusinessMetrics(
  tx: TxClient,
  businessId: number,
  revenue: number,
  cost: number,
) {
  const today = new Date();
  const dateOnly = new Date(today.toISOString().split("T")[0]);

  const existing = await tx.businessMetrics.findUnique({
    where: {
      businessId_date: { businessId, date: dateOnly },
    },
  });

  if (existing) {
    const newRevenue = Number(existing.totalRevenue) + revenue;
    const newCost = Number(existing.totalCost) + cost;
    const newProfit = newRevenue - newCost;
    const newMargin = newRevenue > 0 ? (newProfit / newRevenue) * 100 : 0;

    await tx.businessMetrics.update({
      where: { businessId_date: { businessId, date: dateOnly } },
      data: {
        totalRevenue: newRevenue,
        totalCost: newCost,
        totalProfit: newProfit,
        marginAvg: newMargin,
      },
    });
  } else {
    const profit = revenue - cost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

    await tx.businessMetrics.create({
      data: {
        businessId,
        date: dateOnly,
        totalRevenue: revenue,
        totalCost: cost,
        totalProfit: profit,
        marginAvg: margin,
        growthRate: 0,
      },
    });
  }
}

export async function updateProductMetrics(
  tx: TxClient,
  productId: number,
  quantity: number,
  revenue: number,
  cost: number,
) {
  const today = new Date();
  const dateOnly = new Date(today.toISOString().split("T")[0]);

  const existing = await tx.productMetrics.findUnique({
    where: {
      productId_date: { productId, date: dateOnly },
    },
  });

  if (existing) {
    const newQty = existing.quantitySold + quantity;
    const newRevenue = Number(existing.revenue) + revenue;
    const newCost = Number(existing.cost) + cost;
    const newProfit = newRevenue - newCost;

    await tx.productMetrics.update({
      where: { productId_date: { productId, date: dateOnly } },
      data: {
        quantitySold: newQty,
        revenue: newRevenue,
        cost: newCost,
        profit: newProfit,
      },
    });
  } else {
    await tx.productMetrics.create({
      data: {
        productId,
        date: dateOnly,
        quantitySold: quantity,
        revenue,
        cost,
        profit: revenue - cost,
      },
    });
  }
}
