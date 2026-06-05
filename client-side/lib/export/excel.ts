/**
 * Excel (XLSX) Export Utility
 * Uses the `xlsx` library (SheetJS) to generate proper .xlsx files.
 */

import * as XLSX from "xlsx";

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
 * const buffer = generateExcel([
 *   { name: "Penjualan", columns: [...], rows: sales },
 *   { name: "Inventori", columns: [...], rows: ingredients },
 * ]);
 * ```
 */
export function generateExcel(sheets: ExcelSheetDef[]): Blob {
  const wb = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const headers = sheet.columns.map((c) => c.header);

    const data = sheet.rows.map((row) =>
      sheet.columns.map((col) => {
        if (col.format) return col.format(row);
        const val = row[col.key];
        if (val === null || val === undefined) return "";
        return val;
      }),
    );

    const aoa: any[][] = [];
    if (sheet.title) aoa.push([sheet.title]);
    if (sheet.subtitle) aoa.push([sheet.subtitle]);
    aoa.push(headers);
    aoa.push(...data);

    if (sheet.summaryRow) {
      aoa.push(sheet.summaryRow);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    ws["!cols"] = sheet.columns.map((col) => ({
      wch: col.width ?? Math.max(col.header.length + 2, 14),
    }));

    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }

  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
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



