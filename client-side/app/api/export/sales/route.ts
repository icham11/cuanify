import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { generateCSV } from "@/lib/export/csv";
import { generateExcel, type ExcelColumn } from "@/lib/export/excel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SaleRow = Record<string, unknown>;

const SALE_COLUMNS: ExcelColumn<SaleRow>[] = [
  { key: "transactionNumber", header: "No. Transaksi", width: 24 },
  { key: "createdAt", header: "Tanggal", width: 20, format: (r) => formatDate(r.createdAt as string) },
  { key: "products", header: "Produk", width: 36 },
  { key: "quantities", header: "Qty", width: 10 },
  { key: "totalRevenue", header: "Pendapatan (Rp)", width: 18, format: (r) => Number(r.totalRevenue) },
  { key: "totalCost", header: "HPP (Rp)", width: 18, format: (r) => Number(r.totalCost) },
  { key: "profit", header: "Profit (Rp)", width: 18, format: (r) => Number(r.totalRevenue) - Number(r.totalCost) },
  { key: "margin", header: "Margin (%)", width: 12, format: (r) => {
    const rev = Number(r.totalRevenue);
    const cost = Number(r.totalCost);
    return rev > 0 ? Math.round(((rev - cost) / rev) * 10000) / 100 : 0;
  }},
  { key: "paymentMethod", header: "Metode Bayar", width: 14 },
  { key: "paymentStatus", header: "Status", width: 12 },
  { key: "customerName", header: "Nama Pelanggan", width: 22, format: (r) => (r.customerName as string) || "-" },
];

function formatDate(d: string | Date) {
  return new Date(d).toLocaleString("id-ID", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/**
 * GET /api/export/sales?format=csv|xlsx&startDate=...&endDate=...
 */
export async function GET(request: NextRequest) {
  try {
    const { businessId } = await requireAuth();

    const url = new URL(request.url);
    const format = url.searchParams.get("format") || "csv";
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");

    const sales = await prisma.sale.findMany({
      where: {
        businessId,
        ...(startDate || endDate
          ? {
              createdAt: {
                ...(startDate ? { gte: new Date(startDate) } : {}),
                ...(endDate ? { lte: new Date(new Date(endDate).getTime() + 86400000) } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        saleItems: {
          include: { product: { select: { name: true } } },
        },
      },
    });

    // Flatten for export
    const rows: SaleRow[] = sales.map((s) => ({
      transactionNumber: s.transactionNumber,
      createdAt: s.createdAt.toISOString(),
      products: s.saleItems.map((si) => si.product.name).join(", "),
      quantities: s.saleItems.map((si) => `${si.product.name} x${si.quantity}`).join(", "),
      totalRevenue: Number(s.totalRevenue),
      totalCost: Number(s.totalCost),
      profit: Number(s.totalRevenue) - Number(s.totalCost),
      margin: Number(s.totalRevenue) > 0
        ? Math.round(((Number(s.totalRevenue) - Number(s.totalCost)) / Number(s.totalRevenue)) * 10000) / 100
        : 0,
      paymentMethod: s.paymentMethod,
      paymentStatus: s.paymentStatus,
      customerName: s.customerName || "-",
    }));

    // Summary row
    const totalRevenue = rows.reduce((s, r) => s + (r.totalRevenue as number), 0);
    const totalCost = rows.reduce((s, r) => s + (r.totalCost as number), 0);
    const summaryRow: SaleRow = {
      transactionNumber: `TOTAL (${rows.length} transaksi)`,
      createdAt: "",
      products: "",
      quantities: "",
      totalRevenue,
      totalCost,
      profit: totalRevenue - totalCost,
      margin: totalRevenue > 0 ? Math.round(((totalRevenue - totalCost) / totalRevenue) * 10000) / 100 : 0,
      paymentMethod: "",
      paymentStatus: "",
      customerName: "",
    };
    const allRows = [...rows, summaryRow];

    const dateLabel = startDate && endDate
      ? `${startDate}_${endDate}`
      : new Date().toISOString().split("T")[0];

    if (format === "xlsx") {
      const xlsxBlob = generateExcel([
        { name: "Penjualan", columns: SALE_COLUMNS, rows: allRows },
      ]);

      return new Response(xlsxBlob, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="penjualan_${dateLabel}.xlsx"`,
        },
      });
    }

    // Default: CSV
    const csv = generateCSV(allRows, SALE_COLUMNS);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="penjualan_${dateLabel}.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("Export sales error:", error);
    return NextResponse.json({ error: "Gagal export data penjualan" }, { status: 500 });
  }
}

