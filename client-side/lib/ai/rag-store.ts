/**
 * RAG Vector Store — Incremental Indexing & Semantic Search
 *
 * Responsibilities:
 * 1. Build text chunks from business data (products, ingredients, sales, etc.)
 * 2. Generate embeddings via Gemini and store in PostgreSQL/pgvector
 * 3. Semantic similarity search using cosine distance
 *
 * Incremental Sync Strategy:
 * - Each chunk is identified by (businessId, sourceType, sourceId, chunkIndex)
 * - Content is SHA-256 hashed; only chunks whose hash changed get re-embedded
 * - Stale chunks (no longer produced by buildBusinessChunks) are deleted
 * - This avoids redundant Gemini API calls and saves quota
 */

import prisma from "@/lib/prisma";
import { createHash } from "crypto";
import {
  parseLocalBakeryOrders,
  summarizeLocalBakeryOrders,
  type LocalBakeryOrder,
} from "@/lib/bookings/local-orders";
import {
  generateQueryEmbedding,
  generateEmbeddingsBatch,
} from "./embedding";

// ==================== TYPES ====================

interface DocumentChunk {
  content: string;
  sourceType: string;
  sourceId: number | null;
  metadata: Record<string, unknown>;
  chunkIndex: number;
}

/** Composite key that uniquely identifies a chunk in the vector store */
interface ChunkKey {
  sourceType: string;
  sourceId: number | null;
  chunkIndex: number;
}

export interface SearchResult {
  id: number;
  content: string;
  sourceType: string;
  sourceId: number | null;
  metadata: Record<string, unknown>;
  similarity: number;
}

export interface IndexStatus {
  indexed: boolean;
  documentCount: number;
  lastUpdated: Date | null;
}

export interface IncrementalIndexResult {
  total: number;
  added: number;
  updated: number;
  deleted: number;
  unchanged: number;
  elapsed: number;
}

// ==================== HASHING ====================

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function chunkKeyStr(c: ChunkKey): string {
  return `${c.sourceType}::${c.sourceId ?? "null"}::${c.chunkIndex}`;
}

function formatIdr(value: number): string {
  return `Rp ${Math.round(Number(value || 0)).toLocaleString("id-ID")}`;
}

function formatRagDate(value: Date | string | null | undefined): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getBakeryOrderStatusKey(order: LocalBakeryOrder): string {
  return (order.orderStatus || "").trim().toLowerCase();
}

async function loadBakeryOrdersSnapshot(businessId: number): Promise<{
  orders: LocalBakeryOrder[];
  updatedAt: Date | null;
}> {
  const snapshot = await prisma.businessDocument.findFirst({
    where: {
      businessId,
      sourceType: "bakery_orders_snapshot",
    },
    orderBy: { updatedAt: "desc" },
    select: {
      content: true,
      updatedAt: true,
    },
  });

  if (!snapshot?.content) {
    return { orders: [], updatedAt: snapshot?.updatedAt ?? null };
  }

  return {
    orders: parseLocalBakeryOrders(snapshot.content),
    updatedAt: snapshot.updatedAt,
  };
}

function buildBakeryOrderChunks(
  businessId: number,
  orders: LocalBakeryOrder[],
  updatedAt: Date | null,
): DocumentChunk[] {
  if (orders.length === 0) return [];

  const summary = summarizeLocalBakeryOrders(orders);
  const activeOrders = orders
    .filter((order) => {
      const status = getBakeryOrderStatusKey(order);
      return !["completed", "delivery", "delivered", "cancelled"].includes(
        status,
      );
    })
    .slice()
    .sort((left, right) => {
      const leftKey = `${left.deliveryDate || ""} ${left.deliverySlot || ""} ${left.customerName || ""}`;
      const rightKey = `${right.deliveryDate || ""} ${right.deliverySlot || ""} ${right.customerName || ""}`;
      return leftKey.localeCompare(rightKey);
    });

  const activeLines = activeOrders.slice(0, 20).map((order) => {
    const status = order.orderStatus || "Inquiry";
    const productSummary = (order.items ?? [])
      .map((item) => `${item.quantity || 0}x ${item.productName || "-"}`)
      .join(", ");
    const shippingLabel = order.shippingQuote?.provider
      ? `${order.shippingQuote.provider}${order.shippingQuote.courierServiceName ? `/${order.shippingQuote.courierServiceName}` : ""}`
      : "No shipping quote";
    const automationFlags = order.simulations
      ? [
          order.simulations.productionWhatsappSent ? "prod WA" : "prod WA pending",
          order.simulations.customerWhatsappSent ? "cust WA" : "cust WA pending",
          order.simulations.calendarEventCreated ? "calendar" : "calendar pending",
          order.simulations.googleSheetsSynced ? "sheets" : "sheets pending",
        ].join(" | ")
      : "automation pending";

    return [
      `${order.deliveryDate || "-"} ${order.deliverySlot ? `| ${order.deliverySlot}` : ""}`.trim(),
      `Customer: ${order.customerName || "-"}`,
      `Status: ${status}`,
      `Item: ${productSummary || "-"}`,
      `Resi: ${order.resi || "-"}`,
      `Shipping: ${shippingLabel}`,
      `Automasi: ${automationFlags}`,
    ].join("\n");
  });

  return [
    {
      content: [
        `[Bakery Orders Snapshot]`,
        `Terakhir sinkron: ${formatRagDate(updatedAt)}`,
        `Total order: ${summary.totalOrders}`,
        `Inquiry: ${summary.inquiry}`,
        `Confirmed: ${summary.confirmed}`,
        `In production: ${summary.inProduction}`,
        `Completed: ${summary.completed}`,
        `Cancelled: ${summary.cancelled}`,
        `Order dengan resi: ${summary.withResi}`,
        `Order tanpa resi: ${summary.withoutResi}`,
        `Order dengan shipping quote: ${summary.withShippingQuote}`,
        `Pending automasi: ${summary.pendingAutomation}`,
        `Delivery hari ini: ${summary.deliveryToday}`,
        `Delivery besok: ${summary.deliveryTomorrow}`,
        `Open order terlambat: ${summary.lateOpenOrders}`,
        `Total revenue order: ${formatIdr(summary.totalRevenue)}`,
      ].join("\n"),
      sourceType: "bakery_order",
      sourceId: businessId,
      metadata: {
        businessId,
        updatedAt: updatedAt?.toISOString() || null,
        totalOrders: summary.totalOrders,
        pendingAutomation: summary.pendingAutomation,
        lateOpenOrders: summary.lateOpenOrders,
      },
      chunkIndex: 0,
    },
    {
      content: [
        `[Bakery Orders Aktif]`,
        ...activeLines,
      ].join("\n\n"),
      sourceType: "bakery_order",
      sourceId: businessId,
      metadata: {
        businessId,
        updatedAt: updatedAt?.toISOString() || null,
        activeOrderCount: activeOrders.length,
        sampleCount: Math.min(activeOrders.length, 20),
      },
      chunkIndex: 1,
    },
  ];
}

async function buildProductionBatchChunks(
  businessId: number,
): Promise<DocumentChunk[]> {
  const batches = await prisma.productionBatch.findMany({
    where: { businessId },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          sellingPrice: true,
          productType: true,
        },
      },
    },
    orderBy: { producedAt: "desc" },
    take: 200,
  });

  if (batches.length === 0) return [];

  const byProduct = new Map<
    number,
    {
      name: string;
      productType: string;
      produced: number;
      remaining: number;
      cost: number;
      batches: number;
      latestProducedAt: Date;
    }
  >();

  for (const batch of batches) {
    const product = batch.product;
    const current = byProduct.get(product.id) || {
      name: product.name,
      productType: product.productType,
      produced: 0,
      remaining: 0,
      cost: 0,
      batches: 0,
      latestProducedAt: batch.producedAt,
    };

    current.produced += Number(batch.quantity);
    current.remaining += Number(batch.remainingQty);
    current.cost += Number(batch.quantity) * Number(batch.costPerUnit);
    current.batches += 1;
    if (batch.producedAt > current.latestProducedAt) {
      current.latestProducedAt = batch.producedAt;
    }
    byProduct.set(product.id, current);
  }

  const totalProduced = batches.reduce(
    (sum, batch) => sum + Number(batch.quantity),
    0,
  );
  const totalRemaining = batches.reduce(
    (sum, batch) => sum + Number(batch.remainingQty),
    0,
  );
  const totalCost = batches.reduce(
    (sum, batch) => sum + Number(batch.quantity) * Number(batch.costPerUnit),
    0,
  );
  const activeBatches = batches.filter((batch) => Number(batch.remainingQty) > 0);

  const topProduct = Array.from(byProduct.values()).sort(
    (left, right) => right.remaining - left.remaining,
  )[0];

  const summaryLines = Array.from(byProduct.values())
    .sort((left, right) => right.remaining - left.remaining)
    .slice(0, 15)
    .map(
      (entry) =>
        `  ${entry.name}: ${entry.produced} diproduksi, ${entry.remaining} sisa, ${entry.batches} batch, cost total ${formatIdr(entry.cost)}`,
    );

  const recentBatchLines = batches.slice(0, 20).map((batch) => {
    const productCost = Number(batch.quantity) * Number(batch.costPerUnit);
    return [
      `${formatRagDate(batch.producedAt)} | ${batch.product.name}`,
      `Qty: ${batch.quantity} | Sisa: ${batch.remainingQty}`,
      `Cost/unit: ${formatIdr(Number(batch.costPerUnit))} | Total cost: ${formatIdr(productCost)}`,
    ].join("\n");
  });

  return [
    {
      content: [
        `[Produksi Ready Stock]`,
        `Total batch produksi: ${batches.length}`,
        `Produk berbeda: ${byProduct.size}`,
        `Batch aktif: ${activeBatches.length}`,
        `Total unit diproduksi: ${totalProduced}`,
        `Total sisa stok ready stock: ${totalRemaining}`,
        `Total nilai produksi: ${formatIdr(totalCost)}`,
        topProduct
          ? `Stok sisa terbesar: ${topProduct.name} (${topProduct.remaining} unit)`
          : "",
        ``,
        `Top produk:`,
        ...summaryLines,
      ]
        .filter(Boolean)
        .join("\n"),
      sourceType: "production_batch",
      sourceId: businessId,
      metadata: {
        businessId,
        batchCount: batches.length,
        productCount: byProduct.size,
        activeBatchCount: activeBatches.length,
        totalProduced,
        totalRemaining,
        totalCost,
        topProduct: topProduct?.name || null,
      },
      chunkIndex: 0,
    },
    {
      content: [
        `[Riwayat Produksi Terbaru]`,
        `Batch terbaru (maks. 20):`,
        ...recentBatchLines,
      ].join("\n\n"),
      sourceType: "production_batch",
      sourceId: businessId,
      metadata: {
        businessId,
        recentBatchCount: Math.min(batches.length, 20),
        activeBatchCount: activeBatches.length,
      },
      chunkIndex: 1,
    },
  ];
}

// ==================== BUILD DOCUMENT CHUNKS ====================

/**
 * Extracts all business data and splits into semantic chunks for embedding
 */
async function buildBusinessChunks(businessId: number): Promise<DocumentChunk[]> {
  const chunks: DocumentChunk[] = [];

  // ─── 1. Products ───
  const products = await prisma.product.findMany({
    where: { businessId },
    select: {
      id: true,
      categoryId: true,
      name: true,
      sellingPrice: true,
      isActive: true,
      category: { select: { name: true } },
      recipes: {
        select: {
          quantity: true,
          ingredient: { select: { name: true, unit: true } },
        },
      },
    },
  });

  for (const product of products) {
    const recipeLines = product.recipes.map(
      (r) => `  - ${r.ingredient.name}: ${Number(r.quantity)} ${r.ingredient.unit}`
    );

    chunks.push({
      content: [
        `[Produk] ${product.name}`,
        `Kategori: ${product.category?.name || "Tanpa kategori"}`,
        `Harga jual: Rp${Number(product.sellingPrice).toLocaleString("id-ID")}`,
        `Status: ${product.isActive ? "Aktif dijual" : "Nonaktif"}`,
        recipeLines.length > 0
          ? `Komposisi resep:\n${recipeLines.join("\n")}`
          : "Belum memiliki resep",
      ].join("\n"),
      sourceType: "product",
      sourceId: product.id,
      metadata: {
        name: product.name,
        price: Number(product.sellingPrice),
        category: product.category?.name,
        active: product.isActive,
      },
      chunkIndex: 0,
    });
  }

  // ─── 2. Ingredients + stock ───
  const ingredients = await prisma.ingredient.findMany({
    where: { businessId },
    select: {
      id: true,
      name: true,
      unit: true,
      minStock: true,
      inventoryBatches: {
        where: { remainingQty: { gt: 0 } },
        orderBy: { receivedAt: "desc" },
        select: {
          remainingQty: true,
          costPerUnit: true,
          expirationDate: true,
        },
      },
    },
  });

  for (const ing of ingredients) {
    const totalStock = ing.inventoryBatches.reduce(
      (sum, b) => sum + Number(b.remainingQty),
      0
    );
    const avgCost =
      ing.inventoryBatches.length > 0
        ? ing.inventoryBatches.reduce((s, b) => s + Number(b.costPerUnit), 0) /
          ing.inventoryBatches.length
        : 0;
    const nearestExpiry = ing.inventoryBatches
      .filter((b) => b.expirationDate)
      .sort(
        (a, b) =>
          new Date(a.expirationDate!).getTime() -
          new Date(b.expirationDate!).getTime()
      )[0]?.expirationDate;

    const status =
      totalStock <= 0
        ? "HABIS"
        : totalStock <= ing.minStock
          ? "KRITIS — di bawah minimum"
          : "Stok cukup";

    chunks.push({
      content: [
        `[Bahan Baku] ${ing.name}`,
        `Satuan: ${ing.unit}`,
        `Stok saat ini: ${totalStock} ${ing.unit} (min: ${ing.minStock})`,
        `Status stok: ${status}`,
        `Harga beli rata-rata: Rp${avgCost.toLocaleString("id-ID")} per ${ing.unit}`,
        `Batch tersedia: ${ing.inventoryBatches.length}`,
        nearestExpiry
          ? `Kedaluwarsa terdekat: ${new Date(nearestExpiry).toLocaleDateString("id-ID")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
      sourceType: "ingredient",
      sourceId: ing.id,
      metadata: {
        name: ing.name,
        unit: ing.unit,
        totalStock,
        minStock: ing.minStock,
        status,
        avgCost,
      },
      chunkIndex: 0,
    });
  }

  // ─── 3. Sales (weekly buckets — last 90 days) ───
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const sales = await prisma.sale.findMany({
    where: { businessId, createdAt: { gte: ninetyDaysAgo } },
    select: {
      createdAt: true,
      transactionNumber: true,
      customerName: true,
      totalRevenue: true,
      totalCost: true,
      paymentMethod: true,
      paymentStatus: true,
      saleItems: {
        select: {
          quantity: true,
          priceAtSale: true,
          product: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Bucket by week
  const weeks: Record<
    string,
    { revenue: number; cost: number; count: number; items: Record<string, { qty: number; rev: number }>; paymentMethods: Record<string, number> }
  > = {};

  for (const sale of sales) {
    const wk = weekKey(sale.createdAt);
    if (!weeks[wk]) weeks[wk] = { revenue: 0, cost: 0, count: 0, items: {}, paymentMethods: {} };
    weeks[wk].revenue += Number(sale.totalRevenue);
    weeks[wk].cost += Number(sale.totalCost);
    weeks[wk].count++;
    weeks[wk].paymentMethods[sale.paymentMethod] = (weeks[wk].paymentMethods[sale.paymentMethod] || 0) + 1;

    for (const item of sale.saleItems) {
      const n = item.product.name;
      if (!weeks[wk].items[n]) weeks[wk].items[n] = { qty: 0, rev: 0 };
      weeks[wk].items[n].qty += item.quantity;
      weeks[wk].items[n].rev += Number(item.priceAtSale) * item.quantity;
    }
  }

  let ci = 0;
  for (const [wk, data] of Object.entries(weeks)) {
    const topItems = Object.entries(data.items)
      .sort(([, a], [, b]) => b.qty - a.qty)
      .slice(0, 10)
      .map(([n, i]) => `${n} (${i.qty} pcs, Rp${i.rev.toLocaleString("id-ID")})`)
      .join(", ");
    const profit = data.revenue - data.cost;
    const margin = data.revenue > 0 ? ((profit / data.revenue) * 100).toFixed(1) : "0";
    const pmBreakdown = Object.entries(data.paymentMethods)
      .map(([m, c]) => `${m}: ${c}`)
      .join(", ");

    chunks.push({
      content: [
        `[Penjualan Minggu ${wk}]`,
        `Jumlah transaksi: ${data.count}`,
        `Pendapatan: Rp${data.revenue.toLocaleString("id-ID")}`,
        `Biaya bahan: Rp${data.cost.toLocaleString("id-ID")}`,
        `Profit: Rp${profit.toLocaleString("id-ID")} (margin ${margin}%)`,
        `Metode pembayaran: ${pmBreakdown}`,
        `Produk terlaris: ${topItems || "—"}`,
      ].join("\n"),
      sourceType: "sale",
      sourceId: null,
      metadata: { weekStart: wk, revenue: data.revenue, cost: data.cost, profit, count: data.count, paymentMethods: data.paymentMethods },
      chunkIndex: ci++,
    });
  }

  // ─── 3a-bis. Product breakdown by payment method (all 90 days) ───
  const productsByPayment: Record<string, Record<string, { qty: number; rev: number }>> = {};
  for (const sale of sales) {
    const pm = sale.paymentMethod;
    if (!productsByPayment[pm]) productsByPayment[pm] = {};
    for (const si of sale.saleItems) {
      const pName = si.product.name;
      if (!productsByPayment[pm][pName]) productsByPayment[pm][pName] = { qty: 0, rev: 0 };
      productsByPayment[pm][pName].qty += si.quantity;
      productsByPayment[pm][pName].rev += Number(si.priceAtSale) * si.quantity;
    }
  }

  const pmNames = Object.keys(productsByPayment);
  if (pmNames.length > 1) {
    const pmLines: string[] = [];
    for (const pm of pmNames) {
      const sorted = Object.entries(productsByPayment[pm])
        .sort(([, a], [, b]) => b.qty - a.qty)
        .slice(0, 8);
      if (sorted.length > 0) {
        pmLines.push(`Metode ${pm}:`);
        for (const [name, data] of sorted) {
          pmLines.push(`  ${name}: ${data.qty} pcs (Rp${data.rev.toLocaleString("id-ID")})`);
        }
      }
    }

    chunks.push({
      content: [
        `[Produk Terlaris per Metode Pembayaran — 90 Hari]`,
        ...pmLines,
      ].join("\n"),
      sourceType: "sale",
      sourceId: null,
      metadata: { paymentMethods: pmNames },
      chunkIndex: ci++,
    });
  }

  // ─── 3b. Recent individual transactions (last 7 days for detailed context) ───
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recentSales = sales.filter((s) => new Date(s.createdAt) >= sevenDaysAgo);

  // Chunk every 5 transactions together
  for (let i = 0; i < recentSales.length; i += 5) {
    const batch = recentSales.slice(i, i + 5);
    const lines = batch.map((s) => {
      const items = s.saleItems.map((si) => `${si.product.name} x${si.quantity}`).join(", ");
      return [
        `  ${s.transactionNumber} — ${new Date(s.createdAt).toLocaleString("id-ID")}`,
        `  Item: ${items}`,
        `  Total: Rp${Number(s.totalRevenue).toLocaleString("id-ID")} | Metode: ${s.paymentMethod} | Status: ${s.paymentStatus}`,
        s.customerName ? `  Pelanggan: ${s.customerName}` : "",
      ].filter(Boolean).join("\n");
    });

    chunks.push({
      content: [
        `[Transaksi Terbaru — ${new Date(batch[0].createdAt).toLocaleDateString("id-ID")}]`,
        ...lines,
      ].join("\n"),
      sourceType: "sale_detail",
      sourceId: null,
      metadata: {
        count: batch.length,
        dateRange: `${new Date(batch[batch.length - 1].createdAt).toLocaleDateString("id-ID")} - ${new Date(batch[0].createdAt).toLocaleDateString("id-ID")}`,
      },
      chunkIndex: ci++,
    });
  }

  // ─── 3c. Bakery order snapshot + production queue ───
  const bakerySnapshot = await loadBakeryOrdersSnapshot(businessId);
  chunks.push(
    ...buildBakeryOrderChunks(
      businessId,
      bakerySnapshot.orders,
      bakerySnapshot.updatedAt,
    ),
  );

  chunks.push(...(await buildProductionBatchChunks(businessId)));

  // ─── 3d. Kasbon / Piutang (Debts) ───
  const debts = await prisma.debt.findMany({
    where: { businessId },
    select: {
      customerName: true,
      customerPhone: true,
      totalAmount: true,
      paidAmount: true,
      status: true,
      dueDate: true,
      notes: true,
      sale: {
        select: {
          transactionNumber: true,
          createdAt: true,
          saleItems: {
            select: {
              quantity: true,
              priceAtSale: true,
              product: { select: { name: true } },
            },
          },
        },
      },
      payments: {
        orderBy: { createdAt: "desc" },
        select: {
          amount: true,
          createdAt: true,
          notes: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (debts.length > 0) {
    // Summary chunk
    const totalDebt = debts.reduce((s, d) => s + Number(d.totalAmount), 0);
    const totalPaid = debts.reduce((s, d) => s + Number(d.paidAmount), 0);
    const totalRemaining = totalDebt - totalPaid;
    const unpaidCount = debts.filter((d) => d.status !== "Paid").length;
    const overdueCount = debts.filter(
      (d) => d.status !== "Paid" && d.dueDate && new Date(d.dueDate) < new Date()
    ).length;

    // Group by customer
    const byCustomer: Record<string, { total: number; remaining: number; count: number }> = {};
    for (const d of debts) {
      const k = d.customerName;
      if (!byCustomer[k]) byCustomer[k] = { total: 0, remaining: 0, count: 0 };
      byCustomer[k].total += Number(d.totalAmount);
      byCustomer[k].remaining += Number(d.totalAmount) - Number(d.paidAmount);
      byCustomer[k].count++;
    }
    const topDebtors = Object.entries(byCustomer)
      .sort(([, a], [, b]) => b.remaining - a.remaining)
      .slice(0, 10)
      .map(([name, d]) => `${name}: Rp${d.remaining.toLocaleString("id-ID")} (${d.count} kasbon)`)
      .join(", ");

    chunks.push({
      content: [
        `[Kasbon / Piutang — Ringkasan]`,
        `Total kasbon: ${debts.length} transaksi`,
        `Total nilai kasbon: Rp${totalDebt.toLocaleString("id-ID")}`,
        `Sudah dibayar: Rp${totalPaid.toLocaleString("id-ID")}`,
        `Sisa piutang: Rp${totalRemaining.toLocaleString("id-ID")}`,
        `Belum lunas: ${unpaidCount} kasbon`,
        `Jatuh tempo: ${overdueCount} kasbon`,
        `Debitur terbesar: ${topDebtors || "—"}`,
      ].join("\n"),
      sourceType: "debt",
      sourceId: null,
      metadata: { totalDebt, totalPaid, totalRemaining, unpaidCount, overdueCount },
      chunkIndex: 0,
    });

    // ── Produk paling sering dikasbon ──
    const kasbonProducts: Record<string, { qty: number; revenue: number; txCount: number }> = {};
    const kasbonByCustomerProduct: Record<string, Record<string, number>> = {};

    for (const d of debts) {
      for (const si of d.sale.saleItems) {
        const pName = si.product.name;
        if (!kasbonProducts[pName]) kasbonProducts[pName] = { qty: 0, revenue: 0, txCount: 0 };
        kasbonProducts[pName].qty += si.quantity;
        kasbonProducts[pName].revenue += Number(si.priceAtSale) * si.quantity;
        kasbonProducts[pName].txCount++;

        // Track per customer too
        const custKey = d.customerName;
        if (!kasbonByCustomerProduct[custKey]) kasbonByCustomerProduct[custKey] = {};
        kasbonByCustomerProduct[custKey][pName] = (kasbonByCustomerProduct[custKey][pName] || 0) + si.quantity;
      }
    }

    const sortedKasbonProducts = Object.entries(kasbonProducts)
      .sort(([, a], [, b]) => b.qty - a.qty);

    if (sortedKasbonProducts.length > 0) {
      const productLines = sortedKasbonProducts
        .slice(0, 15)
        .map(([name, data], i) =>
          `  ${i + 1}. ${name}: ${data.qty} pcs (${data.txCount} transaksi kasbon, total Rp${data.revenue.toLocaleString("id-ID")})`
        );

      // Customer favorites
      const customerFavLines = Object.entries(kasbonByCustomerProduct)
        .slice(0, 10)
        .map(([cust, prods]) => {
          const topProd = Object.entries(prods).sort(([, a], [, b]) => b - a)[0];
          return topProd ? `  ${cust} → sering kasbon: ${topProd[0]} (${topProd[1]} pcs)` : null;
        })
        .filter(Boolean);

      chunks.push({
        content: [
          `[Produk Paling Sering Dikasbon]`,
          `Daftar produk yang paling banyak dibeli dengan kasbon:`,
          ...productLines,
          ``,
          `Preferensi kasbon per pelanggan:`,
          ...customerFavLines,
        ].join("\n"),
        sourceType: "debt",
        sourceId: null,
        metadata: {
          topProduct: sortedKasbonProducts[0]?.[0],
          topProductQty: sortedKasbonProducts[0]?.[1]?.qty,
          uniqueProducts: sortedKasbonProducts.length,
        },
        chunkIndex: 1,
      });
    }

    // Individual overdue debts (with items)
    const overdueDebts = debts.filter(
      (d) => d.status !== "Paid" && d.dueDate && new Date(d.dueDate) < new Date()
    );
    if (overdueDebts.length > 0) {
      const lines = overdueDebts.slice(0, 15).map((d) => {
        const daysLate = Math.floor(
          (new Date().getTime() - new Date(d.dueDate!).getTime()) / (1000 * 60 * 60 * 24)
        );
        const items = d.sale.saleItems.map((si) => `${si.product.name} x${si.quantity}`).join(", ");
        return `  ${d.customerName}: Rp${(Number(d.totalAmount) - Number(d.paidAmount)).toLocaleString("id-ID")} sisa — lewat ${daysLate} hari — item: ${items} (${d.sale.transactionNumber})`;
      });

      chunks.push({
        content: [
          `[Kasbon Jatuh Tempo]`,
          `Ada ${overdueDebts.length} kasbon yang sudah melewati jatuh tempo:`,
          ...lines,
        ].join("\n"),
        sourceType: "debt",
        sourceId: null,
        metadata: { overdueCount: overdueDebts.length },
        chunkIndex: 2,
      });
    }

    // Active unpaid debts detail (with items)
    const activeDebts = debts.filter((d) => d.status !== "Paid").slice(0, 20);
    if (activeDebts.length > 0) {
      const lines = activeDebts.map((d) => {
        const remaining = Number(d.totalAmount) - Number(d.paidAmount);
        const dueDateStr = d.dueDate
          ? new Date(d.dueDate).toLocaleDateString("id-ID")
          : "tidak ditentukan";
        const items = d.sale.saleItems.map((si) => `${si.product.name} x${si.quantity}`).join(", ");
        return `  ${d.customerName} (${d.customerPhone || "no HP"}) — sisa Rp${remaining.toLocaleString("id-ID")} — jatuh tempo: ${dueDateStr} — item: ${items} — status: ${d.status}`;
      });

      chunks.push({
        content: [
          `[Kasbon Aktif — Belum Lunas]`,
          ...lines,
        ].join("\n"),
        sourceType: "debt",
        sourceId: null,
        metadata: { activeCount: activeDebts.length },
        chunkIndex: 3,
      });
    }
  }

  // ─── 4. Business metrics (last 30 days summary) ───
  const thirtyAgo = new Date();
  thirtyAgo.setDate(thirtyAgo.getDate() - 30);

  const metrics = await prisma.businessMetrics.findMany({
    where: { businessId, date: { gte: thirtyAgo } },
    orderBy: { date: "desc" },
  });

  if (metrics.length > 0) {
    const totRev = metrics.reduce((s, m) => s + Number(m.totalRevenue), 0);
    const totProfit = metrics.reduce((s, m) => s + Number(m.totalProfit), 0);
    const avgMargin = metrics.reduce((s, m) => s + m.marginAvg, 0) / metrics.length;
    const avgGrowth = metrics.reduce((s, m) => s + m.growthRate, 0) / metrics.length;

    chunks.push({
      content: [
        `[Metrik Bisnis — 30 Hari Terakhir]`,
        `Total pendapatan: Rp${totRev.toLocaleString("id-ID")}`,
        `Total profit: Rp${totProfit.toLocaleString("id-ID")}`,
        `Rata-rata margin: ${avgMargin.toFixed(1)}%`,
        `Rata-rata growth rate: ${avgGrowth.toFixed(1)}%`,
        `Hari yang tercatat: ${metrics.length}`,
        `Pendapatan tertinggi: Rp${Math.max(...metrics.map((m) => Number(m.totalRevenue))).toLocaleString("id-ID")}`,
        `Pendapatan terendah: Rp${Math.min(...metrics.map((m) => Number(m.totalRevenue))).toLocaleString("id-ID")}`,
      ].join("\n"),
      sourceType: "metric",
      sourceId: null,
      metadata: { totRev, totProfit, avgMargin, avgGrowth, days: metrics.length },
      chunkIndex: 0,
    });
  }

  // ─── 5. Health scores ───
  const healthScores = await prisma.businessHealthScores.findMany({
    where: { businessId },
    orderBy: { date: "desc" },
    take: 7,
  });

  if (healthScores.length > 0) {
    const latest = healthScores[0];
    chunks.push({
      content: [
        `[Skor Kesehatan Bisnis — ${new Date(latest.date).toLocaleDateString("id-ID")}]`,
        `Revenue Score: ${latest.revenueScore.toFixed(1)}/100`,
        `Profit Score: ${latest.profitScore.toFixed(1)}/100`,
        `Waste Score: ${latest.wasteScore.toFixed(1)}/100`,
        `Stability Score: ${latest.stabilityScore.toFixed(1)}/100`,
        `Overall Score: ${latest.overallScore.toFixed(1)}/100`,
        `Klasifikasi: ${latest.classification || "—"}`,
        `Tren 7 hari: ${healthScores.map((h) => h.overallScore.toFixed(0)).join(" → ")}`,
      ].join("\n"),
      sourceType: "health",
      sourceId: null,
      metadata: {
        overall: latest.overallScore,
        classification: latest.classification,
      },
      chunkIndex: 0,
    });
  }

  // ─── 6. Cross-reference recipes ───
  const recipes = await prisma.recipe.findMany({
    where: { product: { businessId } },
    select: {
      productId: true,
      quantity: true,
      product: { select: { name: true } },
      ingredient: { select: { name: true, unit: true } },
    },
  });

  const byProduct: Record<string, { id: number; items: string[] }> = {};
  for (const r of recipes) {
    const k = r.product.name;
    if (!byProduct[k]) byProduct[k] = { id: r.productId, items: [] };
    byProduct[k].items.push(
      `${r.ingredient.name} (${Number(r.quantity)} ${r.ingredient.unit})`
    );
  }

  for (const [pName, data] of Object.entries(byProduct)) {
    chunks.push({
      content: [
        `[Resep] ${pName}`,
        `Bahan-bahan: ${data.items.join(", ")}`,
        `Total jenis bahan: ${data.items.length}`,
      ].join("\n"),
      sourceType: "recipe",
      sourceId: data.id,
      metadata: { productName: pName, ingredientCount: data.items.length },
      chunkIndex: 0,
    });
  }

  // ─── 7. Inventory Batches (FIFO detail per ingredient) ───
  const allBatches = await prisma.inventoryBatch.findMany({
    where: { ingredient: { businessId } },
    select: {
      ingredientId: true,
      receivedAt: true,
      remainingQty: true,
      costPerUnit: true,
      expirationDate: true,
      ingredient: { select: { id: true, name: true, unit: true } },
    },
    orderBy: { receivedAt: "desc" },
  });

  // Group batches by ingredient
  const batchesByIng: Record<number, typeof allBatches> = {};
  for (const b of allBatches) {
    if (!batchesByIng[b.ingredientId]) batchesByIng[b.ingredientId] = [];
    batchesByIng[b.ingredientId].push(b);
  }

  let batchChunkIdx = 0;
  for (const [ingIdStr, batches] of Object.entries(batchesByIng)) {
    const ing = batches[0].ingredient;
    const activeBatches = batches.filter((b) => Number(b.remainingQty) > 0);
    const depletedBatches = batches.filter((b) => Number(b.remainingQty) <= 0);
    const totalRemaining = activeBatches.reduce((s, b) => s + Number(b.remainingQty), 0);
    const totalValue = activeBatches.reduce(
      (s, b) => s + Number(b.remainingQty) * Number(b.costPerUnit),
      0
    );
    const expiringBatches = activeBatches
      .filter((b) => b.expirationDate && new Date(b.expirationDate) < new Date(Date.now() + 7 * 86400000))
      .sort((a, b) => new Date(a.expirationDate!).getTime() - new Date(b.expirationDate!).getTime());

    const batchLines = activeBatches.slice(0, 8).map((b) => {
      const expStr = b.expirationDate
        ? `, exp: ${new Date(b.expirationDate).toLocaleDateString("id-ID")}`
        : "";
      return `  Batch ${new Date(b.receivedAt).toLocaleDateString("id-ID")}: ${Number(b.remainingQty)} ${ing.unit} @ Rp${Number(b.costPerUnit).toLocaleString("id-ID")}${expStr}`;
    });

    const lines = [
      `[Inventory Batch] ${ing.name}`,
      `Batch aktif: ${activeBatches.length} | Habis: ${depletedBatches.length}`,
      `Total sisa: ${totalRemaining} ${ing.unit}`,
      `Total nilai stok: Rp${totalValue.toLocaleString("id-ID")}`,
    ];

    if (expiringBatches.length > 0) {
      lines.push(`⚠️ ${expiringBatches.length} batch akan kedaluwarsa dalam 7 hari`);
    }

    if (batchLines.length > 0) {
      lines.push(`Detail batch (FIFO):`, ...batchLines);
    }

    chunks.push({
      content: lines.join("\n"),
      sourceType: "inventory_batch",
      sourceId: Number(ingIdStr),
      metadata: {
        ingredientName: ing.name,
        activeBatches: activeBatches.length,
        totalRemaining,
        totalValue,
        expiringCount: expiringBatches.length,
      },
      chunkIndex: batchChunkIdx++,
    });
  }

  // ─── 8. Inventory Movements (purchase, sale, waste — last 60 days) ───
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const movements = await prisma.inventoryMovement.findMany({
    where: {
      stockDocument: { businessId },
      createdAt: { gte: sixtyDaysAgo },
    },
    select: {
      quantity: true,
      costPerUnit: true,
      type: true,
      ingredient: { select: { name: true, unit: true } },
      stockDocument: { select: { type: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Summarize movements by ingredient
  const movementsByIng: Record<
    string,
    { name: string; unit: string; totalIn: number; totalOut: number; totalWaste: number; costIn: number; costOut: number; movements: number }
  > = {};

  for (const mv of movements) {
    const name = mv.ingredient?.name || "Unknown";
    const unit = mv.ingredient?.unit || "";
    const key = name;
    if (!movementsByIng[key]) {
      movementsByIng[key] = { name, unit, totalIn: 0, totalOut: 0, totalWaste: 0, costIn: 0, costOut: 0, movements: 0 };
    }

    const qty = Number(mv.quantity);
    const cost = qty * Number(mv.costPerUnit);
    movementsByIng[key].movements++;

    if (mv.type === "In") {
      movementsByIng[key].totalIn += qty;
      movementsByIng[key].costIn += cost;
    } else {
      // Out
      if (mv.stockDocument.type === "Waste") {
        movementsByIng[key].totalWaste += qty;
      } else {
        movementsByIng[key].totalOut += qty;
      }
      movementsByIng[key].costOut += cost;
    }
  }

  const mvEntries = Object.values(movementsByIng).sort((a, b) => b.movements - a.movements);
  if (mvEntries.length > 0) {
    // Summary chunk
    const totalPurchaseCost = mvEntries.reduce((s, m) => s + m.costIn, 0);
    const totalSalesCost = mvEntries.reduce((s, m) => s + m.costOut, 0);
    const totalWasteQty = mvEntries.reduce((s, m) => s + m.totalWaste, 0);

    const summaryLines = mvEntries.slice(0, 20).map(
      (m) =>
        `  ${m.name}: masuk ${m.totalIn} ${m.unit}, keluar ${m.totalOut} ${m.unit}, waste ${m.totalWaste} ${m.unit} (${m.movements} pergerakan)`
    );

    chunks.push({
      content: [
        `[Pergerakan Inventori — 60 Hari Terakhir]`,
        `Total bahan dengan pergerakan: ${mvEntries.length}`,
        `Total biaya pembelian: Rp${totalPurchaseCost.toLocaleString("id-ID")}`,
        `Total biaya penjualan (COGS): Rp${totalSalesCost.toLocaleString("id-ID")}`,
        `Total waste: ${totalWasteQty} unit`,
        ``,
        `Detail per bahan:`,
        ...summaryLines,
      ].join("\n"),
      sourceType: "inventory_movement",
      sourceId: null,
      metadata: { totalPurchaseCost, totalSalesCost, totalWasteQty, ingredientCount: mvEntries.length },
      chunkIndex: 0,
    });

    // Waste detail chunk (if significant)
    const wasteItems = mvEntries.filter((m) => m.totalWaste > 0).sort((a, b) => b.totalWaste - a.totalWaste);
    if (wasteItems.length > 0) {
      const wasteLines = wasteItems.slice(0, 15).map(
        (m) => `  ${m.name}: ${m.totalWaste} ${m.unit} terbuang`
      );

      chunks.push({
        content: [
          `[Waste / Pemborosan Bahan — 60 Hari]`,
          `Jumlah bahan yang terbuang: ${wasteItems.length} jenis`,
          ...wasteLines,
        ].join("\n"),
        sourceType: "inventory_movement",
        sourceId: null,
        metadata: { wasteItemCount: wasteItems.length },
        chunkIndex: 1,
      });
    }
  }

  // ─── 9. Stock Documents (purchase / waste records — last 60 days) ───
  const stockDocs = await prisma.stockDocument.findMany({
    where: { businessId, createdAt: { gte: sixtyDaysAgo } },
    select: {
      type: true,
      notes: true,
      createdAt: true,
      inventoryMovements: {
        select: {
          quantity: true,
          costPerUnit: true,
          ingredient: { select: { name: true, unit: true } },
        },
        take: 10,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const purchaseDocs = stockDocs.filter((d) => d.type === "Purchase");
  const wasteDocs = stockDocs.filter((d) => d.type === "Waste");

  if (purchaseDocs.length > 0) {
    const recentPurchases = purchaseDocs.slice(0, 15);
    const purchaseLines = recentPurchases.map((doc) => {
      const items = doc.inventoryMovements
        .slice(0, 5)
        .map((m) => {
          const iName = m.ingredient?.name || "?";
          return `${iName} ${Number(m.quantity)} @ Rp${Number(m.costPerUnit).toLocaleString("id-ID")}`;
        })
        .join(", ");
      return `  ${new Date(doc.createdAt).toLocaleDateString("id-ID")}: ${items}${doc.notes ? ` (${doc.notes})` : ""}`;
    });

    chunks.push({
      content: [
        `[Riwayat Pembelian Bahan — 60 Hari]`,
        `Total dokumen pembelian: ${purchaseDocs.length}`,
        ...purchaseLines,
      ].join("\n"),
      sourceType: "stock_document",
      sourceId: null,
      metadata: { type: "Purchase", count: purchaseDocs.length },
      chunkIndex: 0,
    });
  }

  if (wasteDocs.length > 0) {
    const wasteLines = wasteDocs.slice(0, 15).map((doc) => {
      const items = doc.inventoryMovements
        .slice(0, 5)
        .map((m) => {
          const iName = m.ingredient?.name || "?";
          return `${iName} ${Number(m.quantity)}`;
        })
        .join(", ");
      return `  ${new Date(doc.createdAt).toLocaleDateString("id-ID")}: ${items}${doc.notes ? ` (${doc.notes})` : ""}`;
    });

    chunks.push({
      content: [
        `[Riwayat Waste / Buang Bahan — 60 Hari]`,
        `Total dokumen waste: ${wasteDocs.length}`,
        ...wasteLines,
      ].join("\n"),
      sourceType: "stock_document",
      sourceId: null,
      metadata: { type: "Waste", count: wasteDocs.length },
      chunkIndex: 1,
    });
  }

  // ─── 10. Product Metrics (per-product performance — last 30 days) ───
  const productMetrics = await prisma.productMetrics.findMany({
    where: {
      product: { businessId },
      date: { gte: thirtyAgo },
    },
    select: {
      productId: true,
      date: true,
      quantitySold: true,
      revenue: true,
      cost: true,
      profit: true,
      product: { select: { name: true } },
    },
    orderBy: { date: "desc" },
  });

  // Aggregate by product
  const pmByProduct: Record<
    string,
    { id: number; name: string; totalQty: number; totalRev: number; totalCost: number; totalProfit: number; days: number }
  > = {};

  for (const pm of productMetrics) {
    const k = pm.product.name;
    if (!pmByProduct[k]) {
      pmByProduct[k] = { id: pm.productId, name: pm.product.name, totalQty: 0, totalRev: 0, totalCost: 0, totalProfit: 0, days: 0 };
    }
    pmByProduct[k].totalQty += pm.quantitySold;
    pmByProduct[k].totalRev += Number(pm.revenue);
    pmByProduct[k].totalCost += Number(pm.cost);
    pmByProduct[k].totalProfit += Number(pm.profit);
    pmByProduct[k].days++;
  }

  const sortedPM = Object.values(pmByProduct).sort((a, b) => b.totalRev - a.totalRev);
  if (sortedPM.length > 0) {
    const pmLines = sortedPM.slice(0, 20).map((p, i) => {
      const margin = p.totalRev > 0 ? ((p.totalProfit / p.totalRev) * 100).toFixed(1) : "0";
      const avgPerDay = p.days > 0 ? (p.totalQty / p.days).toFixed(1) : "0";
      return `  ${i + 1}. ${p.name}: ${p.totalQty} terjual (${avgPerDay}/hari), Revenue Rp${p.totalRev.toLocaleString("id-ID")}, Profit Rp${p.totalProfit.toLocaleString("id-ID")} (margin ${margin}%)`;
    });

    // Find declining & growing products (compare first half vs second half)
    const halfDate = new Date();
    halfDate.setDate(halfDate.getDate() - 15);
    const firstHalf: Record<string, number> = {};
    const secondHalf: Record<string, number> = {};
    for (const pm of productMetrics) {
      const k = pm.product.name;
      if (new Date(pm.date) >= halfDate) {
        secondHalf[k] = (secondHalf[k] || 0) + pm.quantitySold;
      } else {
        firstHalf[k] = (firstHalf[k] || 0) + pm.quantitySold;
      }
    }

    const trendLines: string[] = [];
    for (const k of Object.keys({ ...firstHalf, ...secondHalf })) {
      const prev = firstHalf[k] || 0;
      const curr = secondHalf[k] || 0;
      if (prev > 0 && curr > prev * 1.3) {
        trendLines.push(`  📈 ${k}: naik dari ${prev} → ${curr} (+${(((curr - prev) / prev) * 100).toFixed(0)}%)`);
      } else if (prev > 0 && curr < prev * 0.7) {
        trendLines.push(`  📉 ${k}: turun dari ${prev} → ${curr} (${(((curr - prev) / prev) * 100).toFixed(0)}%)`);
      }
    }

    chunks.push({
      content: [
        `[Performa Produk — 30 Hari Terakhir]`,
        `Produk yang punya data: ${sortedPM.length}`,
        `Total revenue semua produk: Rp${sortedPM.reduce((s, p) => s + p.totalRev, 0).toLocaleString("id-ID")}`,
        `Total profit semua produk: Rp${sortedPM.reduce((s, p) => s + p.totalProfit, 0).toLocaleString("id-ID")}`,
        ``,
        `Ranking produk:`,
        ...pmLines,
        ...(trendLines.length > 0 ? [``, `Tren 15 hari terakhir vs sebelumnya:`, ...trendLines] : []),
      ].join("\n"),
      sourceType: "product_metrics",
      sourceId: null,
      metadata: {
        productCount: sortedPM.length,
        topProduct: sortedPM[0]?.name,
        topRevenue: sortedPM[0]?.totalRev,
      },
      chunkIndex: 0,
    });

    // Per-product daily breakdown for top 5 products
    const top5 = sortedPM.slice(0, 5);
    let pmDetailIdx = 1;
    for (const tp of top5) {
      const dailyData = productMetrics
        .filter((pm) => pm.productId === tp.id)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      if (dailyData.length > 0) {
        const dailyLines = dailyData.slice(-14).map((d) =>
          `  ${new Date(d.date).toLocaleDateString("id-ID")}: ${d.quantitySold} pcs, Rp${Number(d.revenue).toLocaleString("id-ID")}`
        );

        chunks.push({
          content: [
            `[Detail Harian — ${tp.name}]`,
            `Penjualan harian (14 hari terakhir):`,
            ...dailyLines,
          ].join("\n"),
          sourceType: "product_metrics",
          sourceId: tp.id,
          metadata: { productName: tp.name, dataPoints: dailyData.length },
          chunkIndex: pmDetailIdx++,
        });
      }
    }
  }

  // ─── 11. Product Forecasts ───
  const forecasts = await prisma.productForecast.findMany({
    where: {
      product: { businessId },
      date: { gte: new Date() },
    },
    select: {
      date: true,
      predictedQty: true,
      confidenceScore: true,
      recommendedProduction: true,
      product: { select: { name: true } },
    },
    orderBy: { date: "asc" },
  });

  if (forecasts.length > 0) {
    const forecastLines = forecasts.slice(0, 30).map(
      (f) =>
        `  ${f.product.name} — ${new Date(f.date).toLocaleDateString("id-ID")}: prediksi ${f.predictedQty} pcs (confidence ${Number(f.confidenceScore).toFixed(0)}%)${f.recommendedProduction ? `, rekomendasi: ${f.recommendedProduction}` : ""}`
    );

    chunks.push({
      content: [
        `[Prediksi Penjualan Produk]`,
        `Jumlah prediksi tersedia: ${forecasts.length}`,
        ...forecastLines,
      ].join("\n"),
      sourceType: "forecast",
      sourceId: null,
      metadata: { forecastCount: forecasts.length },
      chunkIndex: 0,
    });
  }

  // ─── 12. Categories summary ───
  const categories = await prisma.category.findMany({
    where: { businessId },
    select: {
      id: true,
      name: true,
      _count: { select: { products: true } },
    },
  });

  if (categories.length > 0) {
    // Build category product counts from already-fetched products
    const productsByCategory: Record<number, { total: number; active: number; avgPrice: number }> = {};
    for (const p of products) {
      const catId = p.categoryId || 0;
      if (!productsByCategory[catId]) productsByCategory[catId] = { total: 0, active: 0, avgPrice: 0 };
      productsByCategory[catId].total++;
      if (p.isActive) productsByCategory[catId].active++;
      productsByCategory[catId].avgPrice += Number(p.sellingPrice);
    }
    for (const k of Object.keys(productsByCategory)) {
      const d = productsByCategory[Number(k)];
      if (d.total > 0) d.avgPrice = d.avgPrice / d.total;
    }

    const catLines = categories.map((c) => {
      const data = productsByCategory[c.id] || { total: 0, active: 0, avgPrice: 0 };
      return `  ${c.name}: ${data.total} produk (${data.active} aktif), harga rata-rata Rp${data.avgPrice.toLocaleString("id-ID")}`;
    });

    chunks.push({
      content: [
        `[Kategori Produk]`,
        `Total kategori: ${categories.length}`,
        ...catLines,
      ].join("\n"),
      sourceType: "category",
      sourceId: null,
      metadata: { categoryCount: categories.length },
      chunkIndex: 0,
    });
  }

  // ─── 13. Business Info + Staff ───
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      name: true,
      location: true,
      createdAt: true,
      user: { select: { name: true, email: true } },
      members: {
        select: {
          role: true,
          user: { select: { name: true, email: true } },
        },
      },
    },
  });

  if (business) {
    const ownerMembers = business.members.filter((m) => m.role === "Owner");
    const cashierMembers = business.members.filter((m) => m.role === "Cashier");
    const productionStaffMembers = business.members.filter((m) => m.role === "Staff");

    const staffLines = [
      `Owner: ${business.user.name} (${business.user.email})`,
    ];
    if (ownerMembers.length > 0) {
      staffLines.push(`Co-owner: ${ownerMembers.map((m) => `${m.user.name} (${m.user.email})`).join(", ")}`);
    }
    if (cashierMembers.length > 0) {
      staffLines.push(`Kasir: ${cashierMembers.map((m) => `${m.user.name} (${m.user.email})`).join(", ")}`);
    }
    if (productionStaffMembers.length > 0) {
      staffLines.push(`Staff Produksi: ${productionStaffMembers.map((m) => `${m.user.name} (${m.user.email})`).join(", ")}`);
    }

    chunks.push({
      content: [
        `[Info Bisnis]`,
        `Nama bisnis: ${business.name}`,
        `Lokasi: ${business.location || "Belum diatur"}`,
        `Dibuat: ${new Date(business.createdAt).toLocaleDateString("id-ID")}`,
        `Total anggota: ${business.members.length + 1}`,
        ...staffLines,
        `Jumlah produk: ${products.length}`,
        `Jumlah bahan baku: ${ingredients.length}`,
        `Jumlah kategori: ${categories.length}`,
      ].join("\n"),
      sourceType: "business",
      sourceId: businessId,
      metadata: {
        name: business.name,
        location: business.location,
        memberCount: business.members.length + 1,
        productCount: products.length,
        ingredientCount: ingredients.length,
      },
      chunkIndex: 0,
    });
  }

  // ─── 14. Debt Payments (riwayat cicilan kasbon) ───
  const debtPayments = await prisma.debtPayment.findMany({
    where: { debt: { businessId } },
    select: {
      amount: true,
      createdAt: true,
      debt: { select: { customerName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  if (debtPayments.length > 0) {
    // Group by customer
    const paymentsByCustomer: Record<string, { total: number; count: number; lastDate: Date }> = {};
    for (const dp of debtPayments) {
      const k = dp.debt.customerName;
      if (!paymentsByCustomer[k]) {
        paymentsByCustomer[k] = { total: 0, count: 0, lastDate: dp.createdAt };
      }
      paymentsByCustomer[k].total += Number(dp.amount);
      paymentsByCustomer[k].count++;
      if (dp.createdAt > paymentsByCustomer[k].lastDate) {
        paymentsByCustomer[k].lastDate = dp.createdAt;
      }
    }

    const paymentLines = Object.entries(paymentsByCustomer)
      .sort(([, a], [, b]) => b.total - a.total)
      .slice(0, 15)
      .map(([name, data]) =>
        `  ${name}: ${data.count} kali bayar, total Rp${data.total.toLocaleString("id-ID")} (terakhir: ${new Date(data.lastDate).toLocaleDateString("id-ID")})`
      );

    chunks.push({
      content: [
        `[Riwayat Pembayaran Kasbon]`,
        `Total cicilan tercatat: ${debtPayments.length}`,
        `Pelanggan yang mencicil:`,
        ...paymentLines,
      ].join("\n"),
      sourceType: "debt_payment",
      sourceId: null,
      metadata: { totalPayments: debtPayments.length, customerCount: Object.keys(paymentsByCustomer).length },
      chunkIndex: 0,
    });
  }

  return chunks;
}

// ==================== INDEXING (INCREMENTAL) ====================

/**
 * Fetch existing document hashes from the vector store for a business.
 * Returns a Map: chunkKeyStr → { id, contentHash }
 */
async function fetchExistingHashes(
  businessId: number
): Promise<Map<string, { id: number; contentHash: string | null }>> {
  const rows = await prisma.$queryRawUnsafe<
    { id: number; sourceType: string; sourceId: number | null; chunkIndex: number; contentHash: string | null }[]
  >(
    `SELECT id, "sourceType", "sourceId", "chunkIndex", "contentHash"
     FROM "BusinessDocument"
     WHERE "businessId" = $1 AND "sourceType" NOT IN ('pdf_document', 'bakery_orders_snapshot')
     ORDER BY id`,
    businessId
  );

  const map = new Map<string, { id: number; contentHash: string | null }>();
  for (const row of rows) {
    const key = chunkKeyStr({ sourceType: row.sourceType, sourceId: row.sourceId, chunkIndex: row.chunkIndex });
    // If duplicate keys exist (shouldn't happen, but defensive), keep the latest ID
    const existing = map.get(key);
    if (existing) {
      // Mark the older duplicate for cleanup
      console.warn(`[RAG] Duplicate chunk key detected: ${key} (ids: ${existing.id}, ${row.id}). Keeping latest.`);
    }
    map.set(key, { id: row.id, contentHash: row.contentHash });
  }
  return map;
}

/**
 * Index business data into the vector store — **incrementally**.
 *
 * 1. Builds all chunks from current business data
 * 2. Hashes each chunk's content (SHA-256)
 * 3. Compares with existing hashes in DB
 * 4. Only generates embeddings for NEW or CHANGED chunks
 * 5. Deletes STALE chunks that no longer exist in current data
 *
 * This reduces Gemini embedding API calls dramatically on subsequent syncs.
 */
export async function indexBusinessDocuments(
  businessId: number
): Promise<IncrementalIndexResult> {
  const t0 = Date.now();
  console.log(`[RAG] Starting incremental sync for business ${businessId}...`);

  try {
    // 1. Build fresh chunks from current data
    const chunks = await buildBusinessChunks(businessId);
    if (chunks.length === 0) {
      // No business data → wipe stale docs (but preserve uploaded PDFs and raw bakery snapshots)
      const deleted = await prisma.$executeRawUnsafe(
        `DELETE FROM "BusinessDocument" WHERE "businessId" = $1 AND "sourceType" NOT IN ('pdf_document', 'bakery_orders_snapshot')`,
        businessId
      );
      console.log(`[RAG] No data to index. Deleted ${deleted} stale docs.`);
      return { total: 0, added: 0, updated: 0, deleted: Number(deleted), unchanged: 0, elapsed: Date.now() - t0 };
    }

    // 2. Hash each chunk
    const chunksWithHash = chunks.map((c) => ({
      ...c,
      contentHash: hashContent(c.content),
      key: chunkKeyStr(c),
    }));

    // 3. Fetch existing hashes from DB
    const existingMap = await fetchExistingHashes(businessId);
    console.log(`[RAG] Existing documents: ${existingMap.size}, New chunks: ${chunksWithHash.length}`);

    // 4. Classify chunks: new, changed, or unchanged
    const toEmbed: (typeof chunksWithHash)[number][] = [];   // need new embedding
    const toSkip: (typeof chunksWithHash)[number][] = [];     // hash match → skip
    const newChunkKeys = new Set<string>();

    for (const chunk of chunksWithHash) {
      newChunkKeys.add(chunk.key);
      const existing = existingMap.get(chunk.key);

      if (!existing) {
        toEmbed.push(chunk);
      } else if (existing.contentHash !== chunk.contentHash) {
        toEmbed.push(chunk);
      } else {
        toSkip.push(chunk);
      }
    }

    // 5. Find stale docs to delete (exist in DB but not in current chunks)
    const staleIds: number[] = [];
    for (const [key, existing] of existingMap.entries()) {
      if (!newChunkKeys.has(key)) {
        staleIds.push(existing.id);
      }
    }

    console.log(`[RAG] Sync plan: ${toEmbed.length} to embed, ${toSkip.length} unchanged, ${staleIds.length} stale`);

    // 6. Delete stale documents
    if (staleIds.length > 0) {
      const BATCH = 100;
      for (let i = 0; i < staleIds.length; i += BATCH) {
        const batch = staleIds.slice(i, i + BATCH);
        await prisma.$executeRawUnsafe(
          `DELETE FROM "BusinessDocument" WHERE id = ANY($1::int[])`,
          batch
        );
      }
      console.log(`[RAG] 🗑️  Deleted ${staleIds.length} stale documents`);
    }

    // 7. Generate embeddings ONLY for new/changed chunks
    if (toEmbed.length > 0) {
      const texts = toEmbed.map((c) => c.content);
      console.log(`[RAG] Generating ${texts.length} embeddings via Gemini (skipping ${toSkip.length} unchanged)...`);
      const embeddings = await generateEmbeddingsBatch(texts);

      // 8. Upsert new/changed documents
      for (let i = 0; i < toEmbed.length; i++) {
        const chunk = toEmbed[i];
        const vecStr = `[${embeddings[i].join(",")}]`;
        const existing = existingMap.get(chunk.key);

        if (existing) {
          await prisma.$executeRawUnsafe(
            `UPDATE "BusinessDocument"
             SET "content" = $1, "contentHash" = $2, "embedding" = $3::vector,
                 "metadata" = $4::jsonb, "updatedAt" = NOW()
             WHERE id = $5`,
            chunk.content,
            chunk.contentHash,
            vecStr,
            JSON.stringify(chunk.metadata),
            existing.id
          );
        } else {
          await prisma.$executeRawUnsafe(
            `INSERT INTO "BusinessDocument"
               ("businessId", "content", "contentHash", "embedding", "sourceType", "sourceId", "metadata", "chunkIndex", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4::vector, $5, $6, $7::jsonb, $8, NOW(), NOW())`,
            businessId,
            chunk.content,
            chunk.contentHash,
            vecStr,
            chunk.sourceType,
            chunk.sourceId,
            JSON.stringify(chunk.metadata),
            chunk.chunkIndex
          );
        }
      }

      console.log(`[RAG] ✅ Upserted ${toEmbed.length} documents`);
    }

    const added = toEmbed.filter((c) => !existingMap.has(c.key)).length;
    const updated = toEmbed.length - added;
    const elapsed = Date.now() - t0;

    console.log(
      `[RAG] ✅ Incremental sync complete in ${elapsed}ms — ` +
      `added: ${added}, updated: ${updated}, unchanged: ${toSkip.length}, deleted: ${staleIds.length}`
    );

    return {
      total: chunks.length,
      added,
      updated,
      deleted: staleIds.length,
      unchanged: toSkip.length,
      elapsed,
    };
  } catch (err) {
    const elapsed = Date.now() - t0;
    console.error(`[RAG] ❌ Incremental sync failed after ${elapsed}ms:`, err);
    throw err;
  }
}

// ==================== SEMANTIC SEARCH ====================

/**
 * Semantic search — find the most relevant documents for a query
 */
export async function searchDocuments(
  businessId: number,
  query: string,
  options: { topK?: number; sourceTypes?: string[]; minSimilarity?: number } = {}
): Promise<SearchResult[]> {
  const { topK = 8, sourceTypes, minSimilarity = 0.25 } = options;

  // 1. Embed the query (uses RETRIEVAL_QUERY task type)
  let queryVec: number[];
  try {
    queryVec = await generateQueryEmbedding(query);
  } catch (err) {
    console.error("[RAG Search] Failed to embed query:", err);
    return []; // graceful fallback — no crash, just no results
  }

  // Validate embedding dimension
  if (queryVec.length !== 768) {
    console.error(`[RAG Search] Invalid embedding dimension: ${queryVec.length}, expected 768`);
    return [];
  }

  // Validate all values are finite numbers
  if (!queryVec.every((v) => Number.isFinite(v))) {
    console.error("[RAG Search] Embedding contains non-finite values");
    return [];
  }

  const vecStr = `[${queryVec.join(",")}]`;

  // 2. Build SQL — parameterized to avoid injection
  // Use <=> for cosine distance (pgvector) and convert to similarity (1 - distance)
  let sql: string;
  const params: unknown[] = [vecStr, businessId, minSimilarity];

  if (sourceTypes && sourceTypes.length > 0) {
    sql = `
      SELECT
        id,
        content,
        "sourceType",
        "sourceId",
        COALESCE(metadata, '{}'::jsonb) AS metadata,
        1 - (embedding <=> $1::vector) AS similarity
      FROM "BusinessDocument"
      WHERE "businessId" = $2
        AND embedding IS NOT NULL
        AND 1 - (embedding <=> $1::vector) >= $3
        AND "sourceType" = ANY($4::text[])
      ORDER BY similarity DESC
      LIMIT $5
    `;
    params.push(sourceTypes, topK);
  } else {
    sql = `
      SELECT
        id,
        content,
        "sourceType",
        "sourceId",
        COALESCE(metadata, '{}'::jsonb) AS metadata,
        1 - (embedding <=> $1::vector) AS similarity
      FROM "BusinessDocument"
      WHERE "businessId" = $2
        AND embedding IS NOT NULL
        AND 1 - (embedding <=> $1::vector) >= $3
      ORDER BY similarity DESC
      LIMIT $4
    `;
    params.push(topK);
  }

  // 3. Execute
  try {
    const rows: SearchResult[] = await prisma.$queryRawUnsafe(sql, ...params);

    return rows.map((r) => ({
      ...r,
      similarity: Number(r.similarity),
      metadata: (typeof r.metadata === "object" && r.metadata !== null ? r.metadata : {}) as Record<string, unknown>,
    }));
  } catch (err) {
    console.error("[RAG Search] Query failed:", err);
    return []; // graceful — don't crash the chat
  }
}

/**
 * Search and format results as context string for the LLM
 */
export async function getRelevantContext(
  businessId: number,
  query: string,
  options?: { topK?: number; sourceTypes?: string[]; minSimilarity?: number }
): Promise<{ context: string; sources: SearchResult[] }> {
  const results = await searchDocuments(businessId, query, options);

  if (results.length === 0) {
    return { context: "Tidak ada data bisnis relevan yang ditemukan di vector store.", sources: [] };
  }

  const labels: Record<string, string> = {
    product: "📦 Produk",
    ingredient: "🧂 Bahan Baku",
    sale: "💰 Penjualan",
    sale_detail: "🧾 Transaksi Detail",
    bakery_order: "🧁 Bakery Order",
    production_batch: "🏭 Produksi Ready Stock",
    recipe: "📋 Resep",
    metric: "📊 Metrik",
    health: "🏥 Kesehatan Bisnis",
    debt: "📒 Kasbon/Piutang",
    debt_payment: "💳 Pembayaran Kasbon",
    inventory_batch: "📦 Batch Inventori",
    inventory_movement: "🔄 Pergerakan Stok",
    stock_document: "📄 Dokumen Stok",
    product_metrics: "📈 Performa Produk",
    forecast: "🔮 Prediksi",
    category: "🏷️ Kategori",
    business: "🏪 Info Bisnis",
    pdf_document: "📄 Dokumen PDF",
  };

  const parts = results.map((r, i) => {
    const label = labels[r.sourceType] || r.sourceType;
    return `--- ${label} #${i + 1} (relevansi ${(r.similarity * 100).toFixed(0)}%) ---\n${r.content}`;
  });

  return { context: parts.join("\n\n"), sources: results };
}

// ==================== STATUS ====================

export async function getIndexStatus(businessId: number): Promise<IndexStatus> {
  try {
    const rows = await prisma.$queryRawUnsafe<{ count: bigint; last_updated: Date | null }[]>(
      `SELECT COUNT(*) as count, MAX("updatedAt") as last_updated FROM "BusinessDocument" WHERE "businessId" = $1 AND "embedding" IS NOT NULL AND "sourceType" != 'bakery_orders_snapshot'`,
      businessId
    );
    const count = Number(rows[0]?.count || 0);
    return {
      indexed: count > 0,
      documentCount: count,
      lastUpdated: rows[0]?.last_updated || null,
    };
  } catch (err) {
    // If the table doesn't exist yet, return unindexed status instead of crashing
    console.warn("[RAG] getIndexStatus failed (table may not exist):", err instanceof Error ? err.message : err);
    return { indexed: false, documentCount: 0, lastUpdated: null };
  }
}

// ==================== HELPERS ====================

function weekKey(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1)); // Monday
  return d.toISOString().split("T")[0];
}
