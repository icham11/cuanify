"use client";

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Factory,
  Package,
  Plus,
  Minus,
  Loader2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  X,
  ChefHat,
  Boxes,
  Coins,
  AlertTriangle,
} from "lucide-react";
import { useApiQuery } from "@/hooks/useApiQuery";
import {
  productionListUrl,
  productRecipeUrl,
  invalidateProductionDependencyCaches,
  API_CACHE_TTL_5_MIN_MS,
} from "@/lib/api/cache-keys";

interface ReadyStockProduct {
  productId: number;
  productName: string;
  sellingPrice: string | number;
  cogs: string | number;
  availableStock: number;
}

interface ProductionBatch {
  id: number;
  productId: number;
  quantity: number;
  remainingQty: number;
  costPerUnit: string | number;
  producedAt: string;
  product: { id: number; name: string; sellingPrice: string | number };
}

interface RecipeItem {
  id: number;
  quantity: number | string;
  ingredient: {
    id: number;
    name: string;
    unit: string;
    currentStock: number;
  };
}

interface ProductionResponse {
  success?: boolean;
  summary?: ReadyStockProduct[];
  data?: ProductionBatch[];
}

interface RecipeResponse {
  success?: boolean;
  data?: RecipeItem[];
}

const formatRupiah = (val: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(val);

export default function ProductionPage() {
  const [producing, setProducing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Produce modal state
  const [showModal, setShowModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ReadyStockProduct | null>(null);
  const [produceQty, setProduceQty] = useState(1);
  const productionQuery = useApiQuery<ProductionResponse>(productionListUrl(50), {
    ttlMs: API_CACHE_TTL_5_MIN_MS,
  });
  const recipeQuery = useApiQuery<RecipeResponse>(
    showModal && selectedProduct ? productRecipeUrl(selectedProduct.productId) : null,
    { ttlMs: API_CACHE_TTL_5_MIN_MS },
  );
  const summary = useMemo(
    () => productionQuery.data?.summary ?? [],
    [productionQuery.data],
  );
  const batches = useMemo(
    () => productionQuery.data?.data ?? [],
    [productionQuery.data],
  );
  const loading = summary.length === 0 && batches.length === 0 && productionQuery.isLoading;
  const recipeItems = recipeQuery.data?.data ?? [];
  const recipeLoading = recipeQuery.isLoading;

  const fetchData = async (options?: { force?: boolean }) => {
    await productionQuery.refresh(options);
  };

  const handleProduce = async () => {
    if (!selectedProduct || produceQty <= 0) return;
    setProducing(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          productId: selectedProduct.productId,
          quantity: produceQty,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal produksi");
      setSuccess(
        `Berhasil produksi ${produceQty}x ${selectedProduct.productName}. Biaya: ${formatRupiah(data.data.totalCost)}`,
      );
      setShowModal(false);
      setProduceQty(1);
      invalidateProductionDependencyCaches();
      await fetchData({ force: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memproses produksi");
    } finally {
      setProducing(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-10">
    <div className="space-y-6">
      {/* Header — matches indigo/purple theme */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 bg-linear-to-r from-indigo-500 via-violet-500 to-indigo-400 rounded-2xl p-4 sm:p-6 shadow-lg">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-white flex items-center gap-2 sm:gap-3">
            <Factory className="w-5 h-5 sm:w-7 sm:h-7 shrink-0" />
            Production
          </h1>
          <p className="text-indigo-100 text-sm mt-1">
            Kelola produksi produk Ready Stock. Bahan baku dikurangi saat diproduksi.
          </p>
        </div>
        <button
          onClick={() => {
            void fetchData({ force: true });
          }}
          disabled={loading}
          className="flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 bg-white/20 hover:bg-white/30 border border-white/20 backdrop-blur-sm rounded-xl text-sm font-semibold text-white transition shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Alerts */}
      {(error || (productionQuery.errorMessage && summary.length === 0 && batches.length === 0)) && (
        <div className="flex items-center gap-2 bg-red-50 text-red-600 rounded-xl p-4 text-sm border border-red-100">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error || productionQuery.errorMessage}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 bg-indigo-50 text-indigo-700 rounded-xl p-4 text-sm border border-indigo-100">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {success}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Ready Stock Products Summary */}
          <div>
            <h2 className="text-lg font-bold text-gray-800 mb-4">Produk Ready Stock</h2>
            {summary.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center text-gray-400 border border-indigo-100">
                <Package className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm font-medium">Belum ada produk Ready Stock.</p>
                <p className="text-xs mt-1">Ubah tipe produk ke &quot;Ready Stock&quot; di halaman Products.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {summary.map((p) => (
                  <div
                    key={p.productId}
                    className="bg-white rounded-2xl border border-indigo-100 p-4 sm:p-5 shadow-sm hover:shadow-md hover:border-indigo-200 transition"
                  >
                    <div className="flex items-start justify-between mb-2 sm:mb-3 gap-2">
                      <div className="min-w-0">
                        <h3 className="font-bold text-gray-900 text-sm sm:text-base leading-tight">{p.productName}</h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Harga jual: {formatRupiah(Number(p.sellingPrice))}
                        </p>
                      </div>
                      <span
                        className={`text-sm font-bold px-2.5 py-0.5 rounded-full shrink-0 ${
                          p.availableStock <= 0
                            ? "bg-red-100 text-red-600"
                            : p.availableStock <= 5
                              ? "bg-amber-100 text-amber-700"
                              : "bg-indigo-100 text-indigo-700"
                        }`}
                      >
                        {p.availableStock}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-400 truncate">
                        COGS/HPP: {formatRupiah(Number(p.cogs))}
                      </span>
                      <button
                        onClick={() => {
                          setSelectedProduct(p);
                          setProduceQty(1);
                          setShowModal(true);
                          setError(null);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 transition shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Produksi
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Production History */}
          <div>
            <h2 className="text-lg font-bold text-gray-800 mb-4">Riwayat Produksi</h2>
            {batches.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center text-gray-400 border border-indigo-100">
                <p className="text-sm">Belum ada riwayat produksi.</p>
              </div>
            ) : (
              <>
                {/* ═══ MOBILE CARD VIEW ═══ */}
                <div className="md:hidden space-y-3">
                  {batches.map((b) => (
                    <div key={b.id} className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-4 space-y-2.5">
                      {/* Product name + date */}
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-gray-900 text-sm leading-tight">{b.product.name}</h3>
                        <span className="text-[11px] text-gray-400 whitespace-nowrap shrink-0">
                          {new Date(b.producedAt).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </div>

                      {/* Stats row */}
                      <div className="flex items-center gap-3 text-xs">
                        <div className="flex-1">
                          <span className="text-gray-400 block">Qty</span>
                          <span className="font-bold text-gray-700 text-sm">{b.quantity}</span>
                        </div>
                        <div className="flex-1">
                          <span className="text-gray-400 block">Sisa</span>
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                              b.remainingQty <= 0 ? "bg-gray-100 text-gray-400" : "bg-indigo-100 text-indigo-700"
                            }`}
                          >
                            {b.remainingQty}
                          </span>
                        </div>
                        <div className="flex-1">
                          <span className="text-gray-400 block">Biaya/unit</span>
                          <span className="font-bold text-indigo-700 text-sm">
                            {formatRupiah(Number(b.costPerUnit))}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* ═══ DESKTOP TABLE ═══ */}
                <div className="hidden md:block bg-white rounded-2xl border border-indigo-100 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-indigo-50/50 text-xs font-bold text-indigo-400 uppercase">
                        <th className="px-5 py-3 text-left">Produk</th>
                        <th className="px-5 py-3 text-center">Qty Produksi</th>
                        <th className="px-5 py-3 text-center">Sisa</th>
                        <th className="px-5 py-3 text-right">Biaya/unit</th>
                        <th className="px-5 py-3 text-right">Tanggal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-indigo-50">
                      {batches.map((b) => (
                        <tr key={b.id} className="hover:bg-indigo-50/30 transition">
                          <td className="px-5 py-3 font-medium text-gray-900">{b.product.name}</td>
                          <td className="px-5 py-3 text-center">{b.quantity}</td>
                          <td className="px-5 py-3 text-center">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                                b.remainingQty <= 0 ? "bg-gray-100 text-gray-400" : "bg-indigo-100 text-indigo-700"
                              }`}
                            >
                              {b.remainingQty}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right text-gray-600">{formatRupiah(Number(b.costPerUnit))}</td>
                          <td className="px-5 py-3 text-right text-gray-500">
                            {new Date(b.producedAt).toLocaleDateString("id-ID", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* Produce Modal */}
      {showModal && selectedProduct && (
        <ProduceModal
          product={selectedProduct}
          qty={produceQty}
          setQty={setProduceQty}
          recipeItems={recipeItems}
          recipeLoading={recipeLoading}
          producing={producing}
          error={error}
          onClose={() => {
            setShowModal(false);
            setError(null);
          }}
          onProduce={handleProduce}
        />
      )}
    </div>
    </div>
  );
}

/* =======================
   PRODUCE MODAL
======================= */

interface ProduceModalProps {
  product: ReadyStockProduct;
  qty: number;
  setQty: (v: number) => void;
  recipeItems: RecipeItem[];
  recipeLoading: boolean;
  producing: boolean;
  error: string | null;
  onClose: () => void;
  onProduce: () => void;
}

function ProduceModal({
  product,
  qty,
  setQty,
  recipeItems,
  recipeLoading,
  producing,
  error,
  onClose,
  onProduce,
}: ProduceModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  if (typeof document === "undefined") return null;

  const stockBadge =
    product.availableStock <= 0
      ? "bg-red-100 text-red-700 border-red-200"
      : product.availableStock <= 5
        ? "bg-amber-100 text-amber-700 border-amber-200"
        : "bg-indigo-100 text-indigo-700 border-indigo-200";

  const stockLabel = product.availableStock <= 0 ? "Habis" : product.availableStock <= 5 ? "Stok Rendah" : "Tersedia";

  const canProduce = recipeItems.every((r) => (r.ingredient.currentStock ?? 0) >= Number(r.quantity) * qty);

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
      style={{ zIndex: 9999 }}
      onMouseDown={(e) => e.target === overlayRef.current && onClose()}
    >
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-lg max-h-[92dvh] flex flex-col overflow-hidden">
        {/* Drag handle – mobile only */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-3 pb-4 border-b border-gray-100 bg-linear-to-r from-indigo-50 to-violet-50 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-indigo-100 flex items-center justify-center shrink-0">
              <Factory size={20} className="text-indigo-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-extrabold text-slate-800 leading-tight truncate">{product.productName}</h2>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-xs text-slate-500 font-medium">
                  Harga: {formatRupiah(Number(product.sellingPrice))}
                </span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${stockBadge}`}
                >
                  {stockLabel}
                </span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/70 text-gray-400 transition shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100 bg-white shrink-0">
          <div className="flex flex-col items-center py-3 px-2 gap-0.5">
            <Package size={13} className="text-indigo-400 mb-0.5" />
            <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wide text-center">Stok Tersedia</p>
            <p className="text-sm font-extrabold text-indigo-700">{product.availableStock}</p>
            <p className="text-[9px] text-gray-400">unit</p>
          </div>
          <div className="flex flex-col items-center py-3 px-2 gap-0.5">
            <Coins size={13} className="text-emerald-400 mb-0.5" />
            <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wide text-center">COGS/HPP</p>
            <p className="text-sm font-extrabold text-emerald-700 truncate max-w-full px-1 text-center">
              {formatRupiah(Number(product.cogs))}
            </p>
          </div>
          <div className="flex flex-col items-center py-3 px-2 gap-0.5">
            <Coins size={13} className="text-violet-400 mb-0.5" />
            <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wide text-center">Est. Biaya</p>
            <p className="text-sm font-extrabold text-violet-700 truncate max-w-full px-1 text-center">
              {formatRupiah(Number(product.cogs) * qty)}
            </p>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-5">
          {/* Quantity control */}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Jumlah Produksi</p>
            <div className="flex items-center justify-between gap-3 bg-indigo-50 rounded-2xl p-3">
              <button
                type="button"
                onClick={() => setQty(Math.max(1, qty - 1))}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-indigo-200 text-indigo-600 hover:bg-indigo-100 transition shadow-sm active:scale-95"
                disabled={qty <= 1}
              >
                <Minus size={16} />
              </button>
              <div className="flex-1 text-center">
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, Math.min(999, Number(e.target.value) || 1)))}
                  className="w-full text-center text-2xl font-extrabold text-indigo-700 bg-transparent border-none outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <p className="text-[10px] text-indigo-400 font-semibold -mt-1">unit produksi</p>
              </div>
              <button
                type="button"
                onClick={() => setQty(Math.min(999, qty + 1))}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-indigo-200 text-indigo-600 hover:bg-indigo-100 transition shadow-sm active:scale-95"
                disabled={qty >= 999}
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          {/* Recipe ingredients */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <ChefHat size={13} className="text-gray-400" />
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Bahan Baku Resep</p>
            </div>

            {recipeLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 size={22} className="text-indigo-400 animate-spin" />
              </div>
            ) : recipeItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-center bg-gray-50 rounded-2xl">
                <Boxes size={28} className="text-gray-300" />
                <p className="text-sm font-semibold text-gray-400">Belum ada resep</p>
                <p className="text-xs text-gray-400">Tambahkan resep di halaman Products</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {recipeItems.map((item) => {
                  const required = Number(item.quantity) * qty;
                  const available = item.ingredient.currentStock ?? 0;
                  const enough = available >= required;
                  return (
                    <div
                      key={item.id}
                      className={`rounded-2xl border p-3.5 ${
                        enough ? "bg-gray-50 border-gray-100" : "bg-red-50 border-red-200"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-800 truncate">{item.ingredient.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Dibutuhkan:{" "}
                            <span className="font-bold text-indigo-600">
                              {required} {item.ingredient.unit}
                            </span>
                            <span className="text-gray-400">
                              {" "}
                              ({Number(item.quantity)} {item.ingredient.unit}/unit)
                            </span>
                          </p>
                        </div>
                        {!enough && <AlertTriangle size={15} className="text-red-500 shrink-0 mt-0.5" />}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 bg-white rounded-xl px-3 py-1.5 border border-gray-100">
                          <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wide">Stok Tersedia</p>
                          <p
                            className={`text-sm font-extrabold mt-0.5 ${enough ? "text-emerald-600" : "text-red-600"}`}
                          >
                            {available}{" "}
                            <span className="text-xs font-medium text-gray-400">{item.ingredient.unit}</span>
                          </p>
                        </div>
                        <div className="flex-1 bg-white rounded-xl px-3 py-1.5 border border-gray-100">
                          <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wide">Sisa Setelah</p>
                          <p
                            className={`text-sm font-extrabold mt-0.5 ${
                              available - required >= 0 ? "text-slate-700" : "text-red-600"
                            }`}
                          >
                            {available - required}{" "}
                            <span className="text-xs font-medium text-gray-400">{item.ingredient.unit}</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 bg-red-50 text-red-600 rounded-xl p-3 text-xs border border-red-200">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {/* Ingredient shortage warning */}
          {!recipeLoading && recipeItems.length > 0 && !canProduce && (
            <div className="flex items-start gap-2 bg-amber-50 text-amber-700 rounded-xl p-3 text-xs border border-amber-200">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              Bahan baku tidak mencukupi untuk jumlah produksi ini. Kurangi jumlah atau lakukan restock terlebih dahulu.
            </div>
          )}

          {/* Bottom safe area */}
          <div className="h-2 sm:h-0" />
        </div>

        {/* Footer actions */}
        <div className="px-4 sm:px-5 py-4 border-t border-gray-100 bg-white shrink-0 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-3 rounded-2xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onProduce}
            disabled={producing || qty <= 0}
            className="flex-2 flex items-center justify-center gap-2 px-6 py-3 bg-linear-to-r from-indigo-600 to-violet-600 text-white font-bold text-sm rounded-2xl hover:from-indigo-700 hover:to-violet-700 transition disabled:opacity-50 shadow-md shadow-indigo-200 min-w-0"
            style={{ flex: 2 }}
          >
            {producing ? <Loader2 size={16} className="animate-spin" /> : <Factory size={16} />}
            Produksi {qty}x
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
