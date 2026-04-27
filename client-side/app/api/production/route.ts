import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth/session";
import { z } from "zod";
import { deductInventory, calculateProductCost } from "@/lib/services/saleHelpers";

export const runtime = "nodejs";

// ── Schemas ──

const produceSchema = z.object({
  productId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().positive().max(9999),
});

// ── GET /api/production — list production batches ──

export async function GET(request: NextRequest) {
  try {
    const { businessId } = await requireAuth();
    const url = new URL(request.url);

    const productId = url.searchParams.get("productId");
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "20")));

    const where: Record<string, unknown> = { businessId };
    if (productId) where.productId = Number(productId);

    const [batches, total] = await Promise.all([
      prisma.productionBatch.findMany({
        where,
        orderBy: { producedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          product: { select: { id: true, name: true, sellingPrice: true } },
        },
      }),
      prisma.productionBatch.count({ where }),
    ]);

    // Also get summary: available stock per product
    const readyStockProducts = await prisma.product.findMany({
      where: { businessId, productType: "ReadyStock", deletedAt: null },
      select: {
        id: true,
        name: true,
        sellingPrice: true,
        cogs: true,
        productionBatches: {
          where: { remainingQty: { gt: 0 } },
          select: { remainingQty: true },
        },
      },
    });

    const summary = readyStockProducts.map((p) => ({
      productId: p.id,
      productName: p.name,
      sellingPrice: p.sellingPrice,
      cogs: p.cogs,
      availableStock: p.productionBatches.reduce((s, b) => s + b.remainingQty, 0),
    }));

    return NextResponse.json({
      success: true,
      data: batches,
      summary,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 },
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/production error:", error);
    return NextResponse.json({ error: "Failed to fetch production data" }, { status: 500 });
  }
}

// ── POST /api/production — produce ready-stock items ──

export async function POST(request: NextRequest) {
  try {
    const { businessId } = await requireAuth();
    const body = await request.json();

    const parsed = produceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { productId, quantity } = parsed.data;

    // Validate product
    const product = await prisma.product.findFirst({
      where: { id: productId, businessId, deletedAt: null },
      select: { id: true, name: true, productType: true },
    });

    if (!product) {
      return NextResponse.json({ error: "Produk tidak ditemukan" }, { status: 404 });
    }

    if (product.productType !== "ReadyStock") {
      return NextResponse.json(
        { error: `"${product.name}" bukan produk Ready Stock. Ubah tipe produk terlebih dahulu.` },
        { status: 400 },
      );
    }

    // Execute production in a transaction
    const result = await prisma.$transaction(
      async (tx) => {
        // 1. Calculate ingredient cost using FIFO
        const totalCost = await calculateProductCost(tx, productId, quantity);
        const costPerUnit = quantity > 0 ? totalCost / quantity : 0;

        // 2. Create stock document for audit trail
        const stockDocument = await tx.stockDocument.create({
          data: {
            businessId,
            type: "Production",
            notes: `Produksi ${quantity}x ${product.name}`,
          },
        });

        // 3. Deduct ingredients via FIFO (same as sale deduction)
        await deductInventory(tx, productId, quantity, stockDocument.id);

        // 4. Create production batch
        const batch = await tx.productionBatch.create({
          data: {
            productId,
            businessId,
            quantity,
            remainingQty: quantity,
            costPerUnit: Math.round(costPerUnit * 100) / 100,
            stockDocumentId: stockDocument.id,
          },
        });

        return { batch, totalCost, costPerUnit };
      },
      { timeout: 15000 },
    );

    return NextResponse.json({
      success: true,
      data: {
        batchId: result.batch.id,
        productId,
        productName: product.name,
        quantity,
        costPerUnit: result.costPerUnit,
        totalCost: result.totalCost,
        producedAt: result.batch.producedAt,
      },
    }, { status: 201 });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message.includes("Insufficient stock")) {
      return NextResponse.json(
        { error: "Bahan baku tidak cukup untuk produksi. Cek stok ingredient." },
        { status: 400 },
      );
    }

    console.error("POST /api/production error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal memproses produksi" },
      { status: 500 },
    );
  }
}

