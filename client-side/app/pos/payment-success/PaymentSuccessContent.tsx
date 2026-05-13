"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client";
import {
  invalidateSalesCaches,
  invalidateDebtsCaches,
  invalidateProductionDependencyCaches,
  invalidateAiInsightsCaches,
} from "@/lib/api/cache-keys";

interface SaleItem {
  id: number;
  quantity: number;
  priceAtSale: number;
  product: { name: string };
}

interface SaleData {
  id: number;
  transactionNumber: string;
  totalRevenue: number;
  totalCost: number;
  paymentStatus: string;
  paymentMethod: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  createdAt: string;
  saleItems: SaleItem[];
}

const formatRupiah = (val: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(val);

export default function PaymentSuccessContent() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [saleData, setSaleData] = useState<SaleData | null>(null);
  const confirmedRef = useRef(false);

  const saleId = searchParams.get("saleId");
  const orderId = searchParams.get("orderId");
  const source = searchParams.get("source");
  const isPendingParam = searchParams.get("pending") === "true";
  const isKasbon = searchParams.get("kasbon") === "true";
  const isMidtrans = source === "midtrans";
  // Midtrans success: onSuccess fired → payment is done
  const midtransSuccess = isMidtrans && !isPendingParam;

  const fetchSaleData = useCallback(async (): Promise<SaleData | null> => {
    if (!saleId) return null;
    try {
      const salesJson = (await apiFetch(
        `/api/sales?startDate=${new Date(Date.now() - 86400000 * 7).toISOString()}`,
      )) as {
        success?: boolean;
        data?: { sales?: SaleData[] };
      };
      if (salesJson.success && salesJson.data?.sales) {
        const found = salesJson.data.sales.find(
          (s: SaleData) => s.id === Number(saleId) || s.transactionNumber === orderId,
        );
        if (found) {
          setSaleData(found);
          return found;
        }
      }
    } catch (err) {
      console.warn("Fetch sale data failed:", err);
    }
    return null;
  }, [saleId, orderId]);

  // Confirm Midtrans payment immediately via our API (no polling needed)
  const confirmMidtransPayment = useCallback(async () => {
    if (!saleId || confirmedRef.current) return;
    confirmedRef.current = true;
    try {
      const res = await fetch(`/api/sales/${saleId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (json.success) {
        invalidateSalesCaches();
        invalidateDebtsCaches();
        invalidateProductionDependencyCaches();
        invalidateAiInsightsCaches();
        console.log("✅ Midtrans payment confirmed via client:", json.message);
      } else {
        console.warn("⚠️ Confirm API returned:", json.error);
      }
    } catch (err) {
      console.warn("⚠️ Confirm call failed (webhook will handle):", err);
    }
  }, [saleId]);

  useEffect(() => {
    if (!saleId && !orderId) {
      setError("No sale information provided");
      setLoading(false);
      return;
    }

    const init = async () => {
      // If Midtrans onSuccess fired → confirm payment immediately, then fetch data
      if (midtransSuccess) {
        await confirmMidtransPayment();
      }

      await fetchSaleData();
      setLoading(false);

      // Auto-download invoice for completed payments
      if (midtransSuccess || isKasbon || !isMidtrans) {
        autoDownloadInvoice();
      }
    };

    init();
  }, [saleId, orderId, fetchSaleData, isMidtrans, midtransSuccess, isKasbon, confirmMidtransPayment]); // eslint-disable-line react-hooks/exhaustive-deps

  const autoDownloadInvoice = async () => {
    if (!saleId) return;
    try {
      const res = await fetch(`/api/sales/${saleId}/invoice?format=html`);
      if (res.ok) {
        const html = await res.text();
        const blob = new Blob([html], { type: "text/html" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `invoice-${orderId || saleId}.html`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        console.log("✅ Invoice downloaded automatically");
      }
    } catch (err) {
      console.warn("Auto-download failed:", err);
    }
  };

  const handlePrintInvoice = async () => {
    if (!saleId) return;
    setInvoiceLoading(true);
    try {
      const response = await fetch(`/api/sales/${saleId}/invoice?format=html`);
      if (!response.ok) {
        setError("Failed to load invoice");
        return;
      }
      const html = await response.text();
      const printWindow = window.open("", "", "width=800,height=600");
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to print invoice");
    } finally {
      setInvoiceLoading(false);
    }
  };

  const handleDownloadInvoice = async () => {
    if (!saleId) return;
    setInvoiceLoading(true);
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
      a.download = `invoice-${orderId || saleId}.html`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download invoice");
    } finally {
      setInvoiceLoading(false);
    }
  };

  // ── Loading state ──
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4" />
          <p className="text-lg font-semibold text-gray-900 mb-2">Memproses Transaksi...</p>
          <p className="text-gray-600">⏳ Mohon tunggu sebentar</p>
        </div>
      </div>
    );
  }

  // ── Determine display status ──
  const actualStatus = midtransSuccess
    ? "Paid"
    : saleData?.paymentStatus || (isKasbon ? "Kasbon" : isPendingParam ? "Pending" : "Paid");
  const isPaid = actualStatus === "Paid";
  const isPending = actualStatus === "Pending";

  const paymentMethodLabel: Record<string, string> = {
    Cash: "💵 Cash",
    QRIS: "📱 QRIS",
    Transfer: "🏦 Transfer Bank",
    Digital: "💳 Digital Wallet",
    Kasbon: "📒 Kasbon",
  };

  return (
    <div
      className={`min-h-screen ${
        isPaid
          ? "bg-gradient-to-b from-green-50 to-white"
          : isPending
            ? "bg-gradient-to-b from-yellow-50 to-white"
            : isKasbon
              ? "bg-gradient-to-b from-amber-50 to-white"
              : "bg-gradient-to-b from-green-50 to-white"
      }`}
    >
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-8">
          {isPaid ? (
            <>
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Pembayaran Berhasil! ✅</h1>
              <p className="text-gray-600">Terima kasih telah melakukan transaksi</p>
            </>
          ) : isPending ? (
            <>
              <div className="inline-flex items-center justify-center w-16 h-16 bg-yellow-100 rounded-full mb-4">
                <span className="text-3xl">⏳</span>
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Menunggu Pembayaran</h1>
              <p className="text-gray-600">Transaksi dibuat — menunggu konfirmasi pembayaran dari Midtrans</p>
              <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-left">
                <p className="text-sm text-yellow-800 font-medium">⚠️ Pembayaran belum dikonfirmasi</p>
                <p className="text-xs text-yellow-700 mt-1">
                  Stok bahan baku belum dipotong. Halaman ini akan otomatis terupdate saat pembayaran berhasil. Anda
                  juga bisa cek status di halaman Sales History.
                </p>
              </div>
            </>
          ) : isKasbon ? (
            <>
              <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-100 rounded-full mb-4">
                <span className="text-3xl">📒</span>
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Kasbon Tercatat!</h1>
              <p className="text-gray-600">Transaksi dicatat sebagai piutang pelanggan</p>
            </>
          ) : (
            <>
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Transaksi Berhasil!</h1>
              <p className="text-gray-600">Terima kasih telah melakukan transaksi</p>
            </>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-700">
            <p>{error}</p>
          </div>
        )}

        {/* Invoice Details Card */}
        <div className="bg-white rounded-xl shadow-md overflow-hidden mb-8">
          <div className="bg-indigo-600 px-6 py-4">
            <h2 className="text-lg font-semibold text-white">Rincian Transaksi</h2>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">No Transaksi</p>
                <p className="text-sm font-bold text-gray-900 font-mono">
                  {saleData?.transactionNumber || orderId || saleId}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Metode Pembayaran</p>
                <p className="text-sm font-semibold text-gray-900">
                  {saleData ? paymentMethodLabel[saleData.paymentMethod] || saleData.paymentMethod : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Status</p>
                {isPaid ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full">
                    ✓ Lunas
                  </span>
                ) : isPending ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-yellow-100 text-yellow-700 text-xs font-bold rounded-full">
                    ⏳ Menunggu Bayar
                  </span>
                ) : isKasbon ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-full">
                    📒 Kasbon
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full">
                    ✓ Lunas
                  </span>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Waktu</p>
                <p className="text-sm font-semibold text-gray-900">
                  {saleData
                    ? new Date(saleData.createdAt).toLocaleString("id-ID", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "Asia/Jakarta",
                      })
                    : "—"}
                </p>
              </div>
            </div>

            {/* Items list */}
            {saleData?.saleItems && saleData.saleItems.length > 0 && (
              <div className="border-t border-gray-100 pt-4 mb-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Item Dibeli</p>
                <div className="space-y-2">
                  {saleData.saleItems.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span className="text-gray-700">
                        {item.product.name} <span className="text-gray-400">x{item.quantity}</span>
                      </span>
                      <span className="font-semibold text-gray-900">
                        {formatRupiah(Number(item.priceAtSale) * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Total */}
            <div className="border-t border-gray-200 pt-4">
              <div className="flex justify-between items-center">
                <span className="text-lg font-bold text-gray-900">Total</span>
                <span className="text-2xl font-extrabold text-indigo-600">
                  {saleData ? formatRupiah(Number(saleData.totalRevenue)) : "—"}
                </span>
              </div>
            </div>

            {/* Customer info */}
            {saleData?.customerName && (
              <div className="border-t border-gray-100 pt-4 mt-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Customer</p>
                <p className="text-sm text-gray-900 font-medium">{saleData.customerName}</p>
                {saleData.customerEmail && <p className="text-xs text-gray-500">{saleData.customerEmail}</p>}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3 mb-8">
          {(isPaid || isKasbon || !isMidtrans) && (
            <div className="flex gap-3">
              <button
                onClick={handlePrintInvoice}
                disabled={invoiceLoading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
              >
                {invoiceLoading ? "Loading..." : "🖨️ Cetak Invoice"}
              </button>
              <button
                onClick={handleDownloadInvoice}
                disabled={invoiceLoading}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
              >
                {invoiceLoading ? "Loading..." : "📥 Download Invoice"}
              </button>
            </div>
          )}

          {isPaid && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
              <p className="text-green-700 font-semibold">✅ Pembayaran Terkonfirmasi</p>
              <p className="text-green-600 text-sm">Stok bahan baku sudah terpotong otomatis</p>
            </div>
          )}

          {isPending && isMidtrans && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
              <p className="text-yellow-700 font-semibold">⏳ Menunggu Konfirmasi Midtrans</p>
              <p className="text-yellow-600 text-sm">
                Invoice akan tersedia setelah pembayaran dikonfirmasi. Cek status di Sales History.
              </p>
            </div>
          )}

          <Link
            href="/pos"
            className="block text-center bg-gray-200 hover:bg-gray-300 text-gray-900 font-semibold py-3 rounded-xl transition"
          >
            ← Kembali ke POS
          </Link>
        </div>

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-sm text-blue-900">
            💡 <strong>Tips:</strong> Anda dapat mencetak atau mengunduh invoice kapan saja dari halaman riwayat
            penjualan.
          </p>
        </div>
      </div>
    </div>
  );
}
