"use client";

import { useState } from "react";

interface InvoiceViewerProps {
  saleId: number;
  transactionNumber: string;
}

export function InvoiceViewer({ saleId, transactionNumber }: InvoiceViewerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePrint = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/sales/${saleId}/invoice?format=html`);
      if (!response.ok) {
        setError("Failed to load invoice");
        return;
      }

      const html = await response.text();
      const printWindow = window.open("", "", "width=900,height=600");
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to print invoice");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/sales/${saleId}/invoice?format=html&download=true`);
      if (!response.ok) {
        setError("Failed to download invoice");
        return;
      }

      const html = await response.text();
      const blob = new Blob([html], { type: "text/html" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${transactionNumber}.html`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download invoice");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-2">
      <button
        onClick={handlePrint}
        disabled={loading}
        className="px-3 py-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded text-sm transition"
        title="Print invoice"
      >
        {loading ? "⏳" : "🖨️"}
      </button>
      <button
        onClick={handleDownload}
        disabled={loading}
        className="px-3 py-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white rounded text-sm transition"
        title="Download invoice"
      >
        {loading ? "⏳" : "📥"}
      </button>
      {error && <span className="text-red-500 text-sm">{error}</span>}
    </div>
  );
}



