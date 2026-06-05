/**
 * Excel (XLSX) Export Utility
 * Uses the `exceljs` library to generate fully styled .xlsx files.
 */

import * as ExcelJS from "exceljs";

type Row = Record<string, unknown>;

export interface ExcelColumn<T = Row> {
  key: string;
  header: string;
  width?: number;
  format?: (row: T) => string | number;
}

export interface ExcelSheetDef<T = Row> {
  name: string;
  columns: ExcelColumn<T>[];
  rows: T[];
  title?: string;
  subtitle?: string;
  summaryRow?: any[];
}

/**
 * Generate an Excel workbook buffer from one or more sheets.
 *
 * Usage:
 * ```ts
 * const buffer = await generateExcel([
 *   { name: "Penjualan", columns: [...], rows: sales },
 *   { name: "Inventori", columns: [...], rows: ingredients },
 * ]);
 * ```
 */
export async function generateExcel(sheets: ExcelSheetDef[]): Promise<Blob> {
  const wb = new ExcelJS.Workbook();

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31));

    // Title
    if (sheet.title) {
      const row = ws.addRow([sheet.title]);
      row.font = { bold: true, color: { argb: "FFCC5A27" }, size: 14 };
      ws.mergeCells(row.number, 1, row.number, Math.max(1, sheet.columns.length));
    }

    // Subtitle
    if (sheet.subtitle) {
      const row = ws.addRow([sheet.subtitle]);
      row.font = { color: { argb: "FF666666" }, size: 11 };
      ws.mergeCells(row.number, 1, row.number, Math.max(1, sheet.columns.length));
    }

    // Headers
    const headerRow = ws.addRow(sheet.columns.map((c) => c.header));
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFCC5A27" },
    };

    // Data
    for (const row of sheet.rows) {
      ws.addRow(
        sheet.columns.map((col) => {
          if (col.format) return col.format(row);
          const val = row[col.key];
          return val === null || val === undefined ? "" : val;
        }),
      );
    }

    // Summary
    if (sheet.summaryRow) {
      const sumRow = ws.addRow(sheet.summaryRow);
      sumRow.font = { bold: true };
      sumRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFAE6D3" },
      };
    }

    // Columns width
    sheet.columns.forEach((col, i) => {
      ws.getColumn(i + 1).width = col.width ?? Math.max(col.header.length + 2, 14);
    });

    // Style all cells
    ws.eachRow((row, rowNumber) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFEAD6C8" } },
          left: { style: "thin", color: { argb: "FFEAD6C8" } },
          bottom: { style: "thin", color: { argb: "FFEAD6C8" } },
          right: { style: "thin", color: { argb: "FFEAD6C8" } },
        };
        const numHeaderRows = (sheet.title ? 1 : 0) + (sheet.subtitle ? 1 : 0);
        if (rowNumber <= numHeaderRows) {
          cell.alignment = { vertical: "middle", horizontal: "left" };
        } else {
          cell.alignment = { vertical: "middle", horizontal: "center" };
        }
      });
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Trigger download in browser from an ArrayBuffer */
export function downloadExcel(data: ArrayBuffer, filename: string): void {
  const blob = new Blob([new Uint8Array(data)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}



