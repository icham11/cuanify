/**
 * CSV Export Utility
 * Generates CSV strings from structured data with proper escaping.
 */

type Row = Record<string, unknown>;

/** Escape a CSV cell value — handles commas, quotes, newlines. */
function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export interface CSVColumn<T = Row> {
  key: string;
  header: string;
  /** Optional formatter — receives the row, returns display value */
  format?: (row: T) => string | number;
}

/**
 * Generate a CSV string from rows + column definitions.
 *
 * Usage:
 * ```ts
 * const csv = generateCSV(sales, [
 *   { key: "transactionNumber", header: "No. Transaksi" },
 *   { key: "totalRevenue", header: "Pendapatan", format: (r) => Number(r.totalRevenue) },
 * ]);
 * ```
 */
export function generateCSV<T extends Row>(rows: T[], columns: CSVColumn<T>[]): string {
  const header = columns.map((c) => escapeCSV(c.header)).join(",");

  const body = rows.map((row) =>
    columns
      .map((col) => {
        const value = col.format ? col.format(row) : row[col.key];
        return escapeCSV(value);
      })
      .join(","),
  );

  // BOM for Excel to detect UTF-8
  return "\uFEFF" + [header, ...body].join("\r\n");
}

/** Convert CSV string to a downloadable Blob */
export function csvToBlob(csv: string): Blob {
  return new Blob([csv], { type: "text/csv;charset=utf-8;" });
}

/** Trigger a download in the browser */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

