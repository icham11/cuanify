"use client";
import { useState, useEffect, useCallback } from "react";
import { Clock, CheckCircle, AlertTriangle, XCircle, Banknote, ChevronLeft, ChevronRight } from "lucide-react";

interface S {
  id: number;
  status: string;
  openedBy: string;
  closedBy: string | null;
  openingCash: number;
  expectedCash: number | null;
  actualCash: number | null;
  discrepancy: number | null;
  cashSalesTotal: number;
  qrisSalesTotal: number;
  transferSalesTotal: number;
  digitalSalesTotal: number;
  kasbonTotal: number;
  marketplaceSalesTotal: number;
  totalRevenue: number;
  transactionCount: number;
  notes: string | null;
  openedAt: string;
  closedAt: string | null;
}
const fRp = (n: number) => `Rp${n.toLocaleString("id-ID")}`;
const fD = (d: string) =>
  new Date(d).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
const fT = (d: string) =>
  new Date(d).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

export default function ShiftHistoryPage() {
  const [shifts, setShifts] = useState<S[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [tp, setTp] = useState(1);
  const [sel, setSel] = useState<S | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/cashier-shift?page=${page}&limit=10`);
      const j = await r.json();
      if (j.success) {
        setShifts(j.data);
        setTp(j.pagination.totalPages);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [page]);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-10">
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Clock className="w-6 h-6 text-indigo-600" />
          Closing
        </h1>
        <p className="text-sm text-gray-500 mt-1">Rekap seluruh shift kasir</p>
      </div>
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : shifts.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Belum ada riwayat shift</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shifts.map((s) => (
            <div
              key={s.id}
              onClick={() => setSel(s)}
              className="bg-white rounded-xl border p-4 hover:shadow-md transition cursor-pointer"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-3 h-3 rounded-full ${s.status === "Open" ? "bg-green-500 animate-pulse" : "bg-gray-300"}`}
                  />
                  <div>
                    <div className="font-semibold text-sm">
                      {fD(s.openedAt)} · {fT(s.openedAt)}
                      {s.closedAt && ` — ${fT(s.closedAt)}`}
                    </div>
                    <div className="text-xs text-gray-500">
                      Dibuka: {s.openedBy}
                      {s.closedBy && ` · Ditutup: ${s.closedBy}`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {s.status === "Closed" ? (
                    <>
                      <div className="text-right text-sm hidden sm:block">
                        <div className="text-xs text-gray-400">Trx</div>
                        <div className="font-bold">{s.transactionCount}</div>
                      </div>
                      <div className="text-right text-sm">
                        <div className="text-xs text-gray-400">Revenue</div>
                        <div className="font-bold text-indigo-600 text-xs sm:text-sm truncate max-w-[120px] sm:max-w-none">
                          {fRp(s.totalRevenue)}
                        </div>
                      </div>
                      <div
                        className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${!s.discrepancy ? "text-green-600 bg-green-50" : Math.abs(s.discrepancy / (s.expectedCash || 1)) * 100 <= 5 ? "text-orange-600 bg-orange-50" : "text-red-600 bg-red-50"}`}
                      >
                        {!s.discrepancy ? (
                          <CheckCircle className="w-3.5 h-3.5" />
                        ) : Math.abs(s.discrepancy / (s.expectedCash || 1)) * 100 <= 5 ? (
                          <AlertTriangle className="w-3.5 h-3.5" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5" />
                        )}
                        {s.discrepancy === 0 || !s.discrepancy
                          ? "Cocok"
                          : `${s.discrepancy > 0 ? "+" : ""}${fRp(s.discrepancy)}`}
                      </div>
                    </>
                  ) : (
                    <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 animate-pulse">
                      Buka
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {tp > 1 && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 rounded-lg border disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-600">
            {page}/{tp}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(tp, p + 1))}
            disabled={page === tp}
            className="p-2 rounded-lg border disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
      {sel && sel.status === "Closed" && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setSel(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between">
              <h2 className="text-lg font-bold">📋 Settlement</h2>
              <button onClick={() => setSel(null)} className="text-gray-400 text-xl">
                ×
              </button>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Dibuka</span>
                <span>
                  {fD(sel.openedAt)} {fT(sel.openedAt)} — {sel.openedBy}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Ditutup</span>
                <span>
                  {sel.closedAt && `${fD(sel.closedAt)} ${fT(sel.closedAt)}`} — {sel.closedBy}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Transaksi</span>
                <span className="font-bold">{sel.transactionCount}</span>
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold flex items-center gap-2">
                <Banknote className="w-4 h-4" />
                Rekonsiliasi Cash
              </h3>
              <div className="bg-blue-50 rounded-xl p-4 text-sm space-y-2">
                <div className="flex justify-between">
                  <span>Modal Awal</span>
                  <span className="font-semibold">{fRp(sel.openingCash)}</span>
                </div>
                <div className="flex justify-between">
                  <span>+ Cash Sales</span>
                  <span className="font-semibold text-green-600">+{fRp(sel.cashSalesTotal)}</span>
                </div>
                <hr className="border-blue-200" />
                <div className="flex justify-between font-bold">
                  <span>Seharusnya</span>
                  <span>{fRp(sel.expectedCash || 0)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Aktual</span>
                  <span>{fRp(sel.actualCash || 0)}</span>
                </div>
                <hr className="border-blue-200" />
                <div
                  className={`flex justify-between font-bold ${(sel.discrepancy || 0) === 0 ? "text-green-600" : (sel.discrepancy || 0) > 0 ? "text-blue-600" : "text-red-600"}`}
                >
                  <span>Selisih</span>
                  <span>
                    {(sel.discrepancy || 0) === 0
                      ? "✅ Cocok"
                      : `${(sel.discrepancy || 0) > 0 ? "+" : ""}${fRp(sel.discrepancy || 0)}`}
                  </span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-green-50 rounded-lg p-3">
                <div className="text-xs text-gray-500">💵 Cash</div>
                <div className="font-bold text-green-700">{fRp(sel.cashSalesTotal)}</div>
              </div>
              <div className="bg-purple-50 rounded-lg p-3">
                <div className="text-xs text-gray-500">📱 QRIS</div>
                <div className="font-bold text-purple-700">{fRp(sel.qrisSalesTotal)}</div>
              </div>
              <div className="bg-blue-50 rounded-lg p-3">
                <div className="text-xs text-gray-500">🏦 Transfer</div>
                <div className="font-bold text-blue-700">{fRp(sel.transferSalesTotal)}</div>
              </div>
              <div className="bg-indigo-50 rounded-lg p-3">
                <div className="text-xs text-gray-500">💳 Digital</div>
                <div className="font-bold text-indigo-700">{fRp(sel.digitalSalesTotal)}</div>
              </div>
              <div className="bg-amber-50 rounded-lg p-3">
                <div className="text-xs text-gray-500">📝 Kasbon</div>
                <div className="font-bold text-amber-700">{fRp(sel.kasbonTotal)}</div>
              </div>
              <div className="bg-orange-50 rounded-lg p-3 border border-orange-200 col-span-2">
                <div className="text-xs text-gray-500">🛒 Marketplace (Tokped/Shopee)</div>
                <div className="font-bold text-orange-700">{fRp(sel.marketplaceSalesTotal)}</div>
                <div className="text-[10px] text-orange-500 mt-0.5">⚠️ Uang belum cair — masih di saldo e-commerce</div>
              </div>
            </div>
            <div className="bg-indigo-600 text-white rounded-xl p-4 flex justify-between items-center">
              <span className="font-semibold text-sm sm:text-base">Total Revenue</span>
              <span className="text-base sm:text-xl font-bold truncate ml-2">{fRp(sel.totalRevenue)}</span>
            </div>
            {sel.notes && (
              <div className="bg-gray-50 rounded-xl p-3 text-sm">
                <b>Catatan:</b> {sel.notes}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
