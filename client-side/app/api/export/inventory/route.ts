import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { generateCSV } from "@/lib/export/csv";
import { generateExcel, type ExcelColumn } from "@/lib/export/excel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IngredientRow = Record<string, unknown>;

const INGREDIENT_COLUMNS: ExcelColumn<IngredientRow>[] = [
  { key: "name", header: "Nama Bahan", width: 26 },
  { key: "unit", header: "Satuan", width: 10 },
  { key: "currentStock", header: "Stok Saat Ini", width: 16, format: (r) => Number(r.currentStock) },
  { key: "minStock", header: "Stok Minimum", width: 16, format: (r) => Number(r.minStock) },
  { key: "status", header: "Status", width: 14 },
  { key: "costPerUnit", header: "Harga/Unit (Rp)", width: 18, format: (r) => Number(r.costPerUnit) },
  { key: "totalValue", header: "Total Nilai (Rp)", width: 20, format: (r) => Number(r.totalValue) },
  { key: "batchCount", header: "Jumlah Batch", width: 14, format: (r) => Number(r.batchCount) },
  { key: "updatedAt", header: "Terakhir Update", width: 20 },
];

const MOVEMENT_COLUMNS: ExcelColumn<IngredientRow>[] = [
  { key: "ingredientName", header: "Nama Bahan", width: 24 },
  { key: "type", header: "Tipe", width: 10 },
  { key: "quantity", header: "Jumlah", width: 12, format: (r) => Number(r.quantity) },
  { key: "unit", header: "Satuan", width: 10 },
  { key: "costPerUnit", header: "Harga/Unit (Rp)", width: 18, format: (r) => Number(r.costPerUnit) },
  { key: "totalCost", header: "Total (Rp)", width: 18, format: (r) => Number(r.totalCost) },
  { key: "docType", header: "Tipe Dokumen", width: 14 },
  { key: "createdAt", header: "Tanggal", width: 20 },
];

function formatDate(d: Date) {
  return d.toLocaleString("id-ID", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/**
 * GET /api/export/inventory?format=csv|xlsx&type=stock|movements|all
 */
export async function GET(request: NextRequest) {
  try {
    const { businessId } = await requireAuth();

    const url = new URL(request.url);
    const format = url.searchParams.get("format") || "csv";
    const type = url.searchParams.get("type") || "stock";

    const dateLabel = new Date().toISOString().split("T")[0];

    // ─── Stock Data ─────────────────────────────────────
    const ingredients = await prisma.ingredient.findMany({
      where: { businessId },
      include: {
        inventoryBatches: {
          where: { remainingQty: { gt: 0 } },
          orderBy: { receivedAt: "asc" },
        },
      },
      orderBy: { name: "asc" },
    });

    const stockRows: IngredientRow[] = ingredients.map((ing) => {
      const currentStock = ing.inventoryBatches.reduce((s, b) => s + Number(b.remainingQty), 0);
      const avgCost = ing.inventoryBatches.length > 0
        ? ing.inventoryBatches.reduce((s, b) => s + Number(b.costPerUnit), 0) / ing.inventoryBatches.length
        : 0;
      const isLow = currentStock <= ing.minStock;

      return {
        name: ing.name,
        unit: ing.unit,
        currentStock: Math.round(currentStock * 100) / 100,
        minStock: ing.minStock,
        status: isLow ? "⚠️ Rendah" : "✅ Aman",
        costPerUnit: Math.round(avgCost),
        totalValue: Math.round(currentStock * avgCost),
        batchCount: ing.inventoryBatches.length,
        updatedAt: formatDate(ing.updatedAt),
      };
    });

    // Summary
    const totalValue = stockRows.reduce((s, r) => s + (r.totalValue as number), 0);
    const lowCount = stockRows.filter((r) => (r.status as string).includes("Rendah")).length;
    stockRows.push({
      name: `TOTAL (${stockRows.length} bahan, ${lowCount} stok rendah)`,
      unit: "",
      currentStock: "",
      minStock: "",
      status: "",
      costPerUnit: "",
      totalValue,
      batchCount: "",
      updatedAt: "",
    });

    if (type === "stock" || type === "all") {
      if (format === "xlsx" && type === "stock") {
        const buffer = generateExcel([
          { name: "Stok Inventori", columns: INGREDIENT_COLUMNS, rows: stockRows },
        ]);
        return new Response(buffer, {
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="inventori_stok_${dateLabel}.xlsx"`,
          },
        });
      }

      if (format === "csv" && type === "stock") {
        const csv = generateCSV(stockRows, INGREDIENT_COLUMNS);
        return new Response(csv, {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="inventori_stok_${dateLabel}.csv"`,
          },
        });
      }
    }

    // ─── Movement Data ──────────────────────────────────
    const movements = await prisma.inventoryMovement.findMany({
      where: {
        ingredient: { businessId },
      },
      include: {
        ingredient: { select: { name: true, unit: true } },
        stockDocument: { select: { type: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 1000,
    });

    const movementRows: IngredientRow[] = movements.map((m) => ({
      ingredientName: m.ingredient?.name ?? "Unknown",
      type: m.type === "In" ? "Masuk" : "Keluar",
      quantity: Math.round(Number(m.quantity) * 100) / 100,
      unit: m.ingredient?.unit ?? "-",
      costPerUnit: Math.round(Number(m.costPerUnit)),
      totalCost: Math.round(Number(m.quantity) * Number(m.costPerUnit)),
      docType: m.stockDocument.type,
      createdAt: formatDate(m.createdAt),
    }));

    if (type === "movements") {
      if (format === "xlsx") {
        const buffer = generateExcel([
          { name: "Pergerakan Stok", columns: MOVEMENT_COLUMNS, rows: movementRows },
        ]);
        return new Response(buffer, {
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="inventori_pergerakan_${dateLabel}.xlsx"`,
          },
        });
      }

      const csv = generateCSV(movementRows, MOVEMENT_COLUMNS);
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="inventori_pergerakan_${dateLabel}.csv"`,
        },
      });
    }

    // ─── All (multi-sheet Excel) ────────────────────────
    if (type === "all") {
      if (format === "xlsx") {
        const buffer = generateExcel([
          { name: "Stok Inventori", columns: INGREDIENT_COLUMNS, rows: stockRows },
          { name: "Pergerakan Stok", columns: MOVEMENT_COLUMNS, rows: movementRows },
        ]);
        return new Response(buffer, {
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="inventori_lengkap_${dateLabel}.xlsx"`,
          },
        });
      }

      // CSV fallback — only stock for CSV
      const csv = generateCSV(stockRows, INGREDIENT_COLUMNS);
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="inventori_stok_${dateLabel}.csv"`,
        },
      });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("Export inventory error:", error);
    return NextResponse.json({ error: "Gagal export data inventori" }, { status: 500 });
  }
}
