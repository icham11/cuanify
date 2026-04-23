"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Plus,
  PackageOpen,
  X,
  Boxes,
  RefreshCw,
  AlertTriangle,
  Trash2,
  Loader2,
  Pencil,
  Flame,
  PackagePlus,
  ChevronUp,
  ChevronDown,
  Package,
  TrendingDown,
  Coins,
  Calendar,
} from "lucide-react";
import IngredientStatusBadge from "./components/IngredientStatusBadge";
import { getIngredients, deleteIngredient, bulkDeleteIngredients, type Ingredient } from "@/lib/api/ingredients";
import { INGREDIENT_UNITS } from "@/lib/validations/product";

import { useBusiness } from "@/context/BusinessContext";

export default function IngredientsPage() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Pagination
  const [page, setPage] = useState(1);
  const pageSize = 10;
  // Sort
  const [sortBy, setSortBy] = useState<"name" | "currentStock" | "minStock" | "costPerUnit">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  // Filter
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "habis" | "perlu-restock" | "bahaya" | "aman">("all");

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null);
  const [isRestockOpen, setIsRestockOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Delete / bulk-delete state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<Ingredient | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isInitialStockOpen, setIsInitialStockOpen] = useState(false);

  const { business, loading: businessLoading } = useBusiness();

  const fetchData = async () => {
    try {
      setLoading(true);
      const data = await getIngredients();
      setIngredients(data);
      setSelectedIds(new Set()); // clear selection on refresh
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteIngredient(deleteTarget.id);
      setIngredients((prev) => prev.filter((i) => i.id !== deleteTarget.id));
      setSelectedIds((prev) => {
        const n = new Set(prev);
        n.delete(deleteTarget.id as string);
        return n;
      });
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    setDeleteError(null);
    try {
      await bulkDeleteIngredients(Array.from(selectedIds));
      setIngredients((prev) => prev.filter((i) => !selectedIds.has(i.id as string)));
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setBulkDeleting(false);
    }
  };

  useEffect(() => {
    if (!business || businessLoading) return;
    fetchData();
  }, [business, businessLoading]);

  const formatCurrency = (value: number | null) => {
    if (!value) return "—";
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(value);
  };

  if (businessLoading || loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-indigo-500 animate-pulse">
        <PackageOpen size={48} />
        <span className="mt-4 text-lg font-semibold">Loading ingredients...</span>
      </div>
    );
  }

  if (!business) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-indigo-400">
        <PackageOpen size={48} />
        <span className="mt-4 text-lg font-semibold">Anda belum memiliki bisnis.</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-red-500">
        <AlertTriangle size={48} />
        <span className="mt-4 text-lg font-semibold">{error}</span>
      </div>
    );
  }

  // Filtering
  const filtered = ingredients.filter((ing) => {
    const matchesSearch = ing.name.toLowerCase().includes(search.toLowerCase());
    const s = ing.currentStock;
    const m = ing.minStock;
    let matchesStatus = true;
    if (statusFilter === "habis") {
      matchesStatus = s === 0;
    } else if (statusFilter === "perlu-restock") {
      matchesStatus = s > 0 && m >= 0 && s <= m;
    } else if (statusFilter === "bahaya") {
      matchesStatus = m >= 0 && s > m && s <= m * 2;
    } else if (statusFilter === "aman") {
      matchesStatus = s > 0 && (m < 0 || s > m * 2);
    }
    return matchesSearch && matchesStatus;
  });
  // Sorting
  // NOTE: Default urutan dari backend adalah latest created (createdAt desc)
  // Jika sortBy bukan 'name', tetap lakukan sorting sesuai pilihan user
  let sorted = [...filtered];
  if (sortBy !== "name") {
    sorted = sorted.sort((a, b) => {
      const cmp = (a[sortBy] ?? 0) - (b[sortBy] ?? 0);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }
  // Pagination
  const totalPages = Math.ceil(sorted.length / pageSize);
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize);

  // Selection helpers
  const allSelected = paged.length > 0 && paged.every((i) => selectedIds.has(i.id as string));
  const someSelected = paged.some((i) => selectedIds.has(i.id as string)) && !allSelected;
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleSelectAll = () => {
    if (allSelected)
      setSelectedIds((prev) => {
        const n = new Set(prev);
        paged.forEach((i) => n.delete(i.id as string));
        return n;
      });
    else
      setSelectedIds((prev) => {
        const n = new Set(prev);
        paged.forEach((i) => n.add(i.id as string));
        return n;
      });
  };

  return (
    <div className="space-y-10">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 bg-linear-to-r from-indigo-500 via-violet-500 to-indigo-400 rounded-2xl p-4 sm:p-6 shadow-lg">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-white flex items-center gap-2 sm:gap-3">
            <PackageOpen className="w-5 h-5 sm:w-7 sm:h-7 shrink-0" />
            Ingredients
          </h1>
          <p className="text-indigo-100 text-sm mt-1">Kelola stok bahan baku dengan visual & batch tracking.</p>
        </div>

        <button
          onClick={() => setIsAddOpen(true)}
          className="flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 bg-white text-indigo-700 font-semibold rounded-xl shadow text-sm sm:text-base"
        >
          <Plus size={20} />
          Tambah
        </button>
      </div>

      {/* FILTER, SORT, PAGINATION CONTROLS */}
      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/80 px-4 py-3 text-sm text-indigo-800">
        Stok ingredient di halaman ini akan ikut berkurang otomatis saat booking
        bakery yang sudah tersinkron ke product recipe masuk ke alur order aktif.
      </div>

      <div className="flex flex-wrap gap-2 items-center justify-between mb-2 px-1">
        <div className="flex gap-2 items-center">
          <input
            type="text"
            placeholder="Cari nama bahan..."
            className="px-3 py-2 rounded-xl border border-indigo-200 text-sm bg-white text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <select
            className="px-2 py-2 rounded-xl border border-indigo-200 text-sm bg-white text-slate-700 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as "all" | "habis" | "perlu-restock" | "bahaya" | "aman");
              setPage(1);
            }}
          >
            <option value="all">Semua Status</option>
            <option value="habis">Habis</option>
            <option value="perlu-restock">Perlu Restock</option>
            <option value="bahaya">Bahaya</option>
            <option value="aman">Aman</option>
          </select>
        </div>
        <div className="flex gap-2 items-center">
          <label className="text-xs text-gray-500">Sort:</label>
          <select
            className="px-2 py-2 rounded-xl border border-indigo-200 text-sm bg-white text-slate-700 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as "name" | "currentStock" | "minStock" | "costPerUnit");
              setPage(1);
            }}
          >
            <option value="name">Nama</option>
            <option value="currentStock">Stok</option>
            <option value="minStock">Min</option>
            <option value="costPerUnit">Harga</option>
          </select>
          <button
            className="px-2 py-2 rounded-xl border border-indigo-200 text-sm bg-white text-slate-700 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 flex items-center justify-center"
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            title="Urutan"
          >
            {sortDir === "asc" ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>
      {/* BULK ACTION BAR */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-2xl px-5 py-3">
          <span className="text-sm font-semibold text-indigo-700">
            {selectedIds.size} ingredient{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 hover:bg-white border border-gray-200 transition"
            >
              Deselect all
            </button>
            <button
              onClick={() => {
                setDeleteError(null);
                setBulkDeleteOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 transition"
            >
              <Trash2 size={13} />
              Delete selected
            </button>
          </div>
        </div>
      )}

      {/* ═══ MOBILE CARD VIEW ═══ */}
      <div className="md:hidden space-y-3">
        {paged.map((ingredient) => {
          return (
            <div key={ingredient.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-2.5">
              {/* Top row: name + status */}
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold text-slate-800 text-sm leading-tight min-w-0">{ingredient.name}</h3>
                <div className="shrink-0">
                  <IngredientStatusBadge stock={ingredient.currentStock} minStock={ingredient.minStock} />
                </div>
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-3 text-xs">
                <div className="flex-1">
                  <span className="text-gray-400 block">Stok</span>
                  {ingredient.currentStock === -1 ? (
                    <span className="text-gray-400 italic text-sm">Belum di-set</span>
                  ) : (
                    <span className="font-bold text-slate-700 text-sm">
                      {ingredient.currentStock} <span className="text-gray-400 font-normal">{ingredient.unit}</span>
                    </span>
                  )}
                </div>
                <div className="flex-1">
                  <span className="text-gray-400 block">Min</span>
                  {ingredient.minStock === -1 ? (
                    <span className="text-gray-400 italic text-sm">Belum di-set</span>
                  ) : (
                    <span className="font-semibold text-slate-600 text-sm">{ingredient.minStock}</span>
                  )}
                </div>
                <div className="flex-1">
                  <span className="text-gray-400 block">Harga/Unit</span>
                  <span className="font-bold text-indigo-700 text-sm">{formatCurrency(ingredient.costPerUnit)}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-gray-50">
                <button
                  onClick={() => {
                    setSelectedIngredient(ingredient);
                    setIsRestockOpen(true);
                  }}
                  className="flex items-center gap-1 text-indigo-600 hover:bg-indigo-50 px-2 py-1.5 rounded-lg text-xs font-semibold transition"
                >
                  <RefreshCw size={13} /> Restock
                </button>
                {ingredient.currentStock === -1 && (
                  <button
                    onClick={() => {
                      setSelectedIngredient(ingredient);
                      setIsInitialStockOpen(true);
                    }}
                    className="flex items-center gap-1 text-emerald-600 hover:bg-emerald-50 px-2 py-1.5 rounded-lg text-xs font-semibold transition"
                  >
                    <PackagePlus size={13} /> Stok Awal
                  </button>
                )}
                <button
                  onClick={() => {
                    setSelectedIngredient(ingredient);
                    setIsHistoryOpen(true);
                  }}
                  className="flex items-center gap-1 text-violet-600 hover:bg-violet-50 px-2 py-1.5 rounded-lg text-xs font-semibold transition"
                >
                  <Boxes size={13} /> Persediaan
                </button>
                <button
                  onClick={() => {
                    setSelectedIngredient(ingredient);
                    setIsEditOpen(true);
                  }}
                  className="flex items-center gap-1 text-blue-600 hover:bg-blue-50 px-2 py-1.5 rounded-lg text-xs font-semibold transition"
                >
                  <Pencil size={13} /> Edit
                </button>
                <button
                  onClick={() => {
                    setDeleteError(null);
                    setDeleteTarget(ingredient);
                  }}
                  className="flex items-center gap-1 text-red-400 hover:bg-red-50 px-2 py-1.5 rounded-lg text-xs font-semibold transition ml-auto"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ═══ DESKTOP TABLE ═══ */}
      <div className="hidden md:block bg-white rounded-3xl shadow-xl overflow-x-auto custom-scroll">
        <table className="w-full min-w-150 text-base">
          <thead className="bg-linear-to-r from-indigo-50 to-violet-50 text-indigo-800 text-xs uppercase tracking-wider">
            <tr>
              <th className="pl-5 pr-2 py-4 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
                />
              </th>
              <th className="px-6 py-4 text-left font-bold">Nama</th>
              <th className="px-6 py-4 text-left font-bold">Stok</th>
              <th className="px-6 py-4 text-left font-bold">Min</th>
              <th className="px-6 py-4 text-left font-bold">Harga / Unit</th>
              <th className="px-6 py-4 text-left font-bold">Status</th>
              <th className="px-6 py-4 text-left font-bold">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((ingredient) => {
              const isSelected = selectedIds.has(ingredient.id as string);
              return (
                <tr
                  key={ingredient.id}
                  className={`border-t transition-all ${isSelected ? "bg-indigo-50" : "bg-white hover:bg-indigo-50"}`}
                >
                  <td className="pl-5 pr-2 py-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(ingredient.id as string)}
                      className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3 font-bold text-slate-800 group-hover:text-indigo-700">{ingredient.name}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {ingredient.currentStock === -1 ? (
                      <span className="text-gray-400 italic">Belum di-set</span>
                    ) : (
                      <>
                        <span className="font-semibold">{ingredient.currentStock}</span>{" "}
                        <span className="text-xs text-slate-500">{ingredient.unit}</span>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {ingredient.minStock === -1 ? (
                      <span className="text-gray-400 italic">Belum di-set</span>
                    ) : (
                      <span className="font-semibold">{ingredient.minStock}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-indigo-700 font-bold">
                    <span className="font-semibold">{formatCurrency(ingredient.costPerUnit)}</span>{" "}
                    <span className="text-xs text-slate-500">/ {ingredient.unit}</span>
                  </td>
                  <td className="px-4 py-3">
                    <IngredientStatusBadge stock={ingredient.currentStock} minStock={ingredient.minStock} />
                  </td>
                  <td className="px-4 py-3 flex gap-1.5 flex-wrap">
                    <button
                      onClick={() => {
                        setSelectedIngredient(ingredient);
                        setIsRestockOpen(true);
                      }}
                      className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 p-1.5 rounded-lg transition"
                      title="Restock"
                    >
                      <RefreshCw size={16} />
                    </button>
                    {ingredient.currentStock === -1 && (
                      <button
                        onClick={() => {
                          setSelectedIngredient(ingredient);
                          setIsInitialStockOpen(true);
                        }}
                        className="text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 p-1.5 rounded-lg transition"
                        title="Set Stok Awal"
                      >
                        <PackagePlus size={16} />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setSelectedIngredient(ingredient);
                        setIsHistoryOpen(true);
                      }}
                      className="text-violet-600 hover:text-violet-900 hover:bg-violet-50 p-1.5 rounded-lg transition"
                      title="Persediaan"
                    >
                      <Boxes size={16} />
                    </button>
                    <button
                      onClick={() => {
                        setSelectedIngredient(ingredient);
                        setIsEditOpen(true);
                      }}
                      className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-1.5 rounded-lg transition"
                      title="Edit"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => {
                        setDeleteError(null);
                        setDeleteTarget(ingredient);
                      }}
                      className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Edit modal (must be outside hidden wrapper) */}
      {isEditOpen && selectedIngredient && (
        <EditIngredientModal
          ingredient={selectedIngredient}
          onClose={() => setIsEditOpen(false)}
          onSuccess={() => {
            setIsEditOpen(false);
            fetchData();
          }}
        />
      )}

      {/* PAGINATION BAR */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 sm:gap-6 px-2 py-4 sm:py-6">
          <button
            className="px-3 sm:px-6 py-2 rounded-full border border-indigo-200 bg-white text-indigo-600 font-bold shadow transition hover:bg-indigo-50 disabled:opacity-40 text-xs sm:text-base"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            ‹ Prev
          </button>
          <span className="text-xs sm:text-base font-semibold text-indigo-700 bg-indigo-50 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full shadow-sm whitespace-nowrap">
            {page} / {totalPages}
          </span>
          <button
            className="px-3 sm:px-6 py-2 rounded-full border border-indigo-200 bg-white text-indigo-600 font-bold shadow transition hover:bg-indigo-50 disabled:opacity-40 text-xs sm:text-base"
            disabled={page === totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next ›
          </button>
        </div>
      )}

      {isAddOpen && (
        <AddIngredientModal
          onClose={() => setIsAddOpen(false)}
          onSuccess={() => {
            setIsAddOpen(false);
            fetchData();
          }}
        />
      )}
      {isRestockOpen && selectedIngredient && (
        <RestockModal
          ingredient={selectedIngredient}
          onClose={() => setIsRestockOpen(false)}
          onSuccess={() => {
            setIsRestockOpen(false);
            fetchData();
          }}
        />
      )}
      {isInitialStockOpen && selectedIngredient && (
        <InitialStockModal
          ingredient={selectedIngredient}
          onClose={() => setIsInitialStockOpen(false)}
          onSuccess={() => {
            setIsInitialStockOpen(false);
            fetchData();
          }}
        />
      )}
      {isHistoryOpen && selectedIngredient && (
        <BatchHistoryModal
          ingredient={selectedIngredient}
          onClose={() => setIsHistoryOpen(false)}
          onSuccess={() => fetchData()}
        />
      )}

      {/* Single delete confirm */}
      {deleteTarget && (
        <ModalWrapper
          onClose={() => {
            if (!deleting) setDeleteTarget(null);
          }}
          title=""
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-red-100 text-red-600">
                <Trash2 size={18} />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-slate-800">Hapus Bahan Baku?</h2>
                <p className="text-sm text-gray-500 mt-1">
                  <span className="font-semibold text-slate-700">{deleteTarget.name}</span> dan semua batch persediaan
                  akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.
                </p>
              </div>
            </div>
            {deleteError && (
              <div className="flex items-start gap-2 bg-red-50 text-red-600 rounded-xl p-3 text-xs">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                {deleteError}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition disabled:opacity-50"
              >
                Batal
              </button>
              <button
                onClick={handleDeleteConfirmed}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white font-bold text-sm rounded-xl hover:bg-red-700 transition disabled:opacity-50"
              >
                {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                Hapus
              </button>
            </div>
          </div>
        </ModalWrapper>
      )}

      {/* Bulk delete confirm */}
      {bulkDeleteOpen && (
        <ModalWrapper
          onClose={() => {
            if (!bulkDeleting) setBulkDeleteOpen(false);
          }}
          title=""
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-red-100 text-red-600">
                <Trash2 size={18} />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-slate-800">Hapus {selectedIds.size} Bahan Baku?</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Semua bahan baku yang dipilih dan batch persediaannya akan dihapus permanen.
                </p>
              </div>
            </div>
            {deleteError && (
              <div className="flex items-start gap-2 bg-red-50 text-red-600 rounded-xl p-3 text-xs">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                {deleteError}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setBulkDeleteOpen(false)}
                disabled={bulkDeleting}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition disabled:opacity-50"
              >
                Batal
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white font-bold text-sm rounded-xl hover:bg-red-700 transition disabled:opacity-50"
              >
                {bulkDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                Hapus {selectedIds.size}
              </button>
            </div>
          </div>
        </ModalWrapper>
      )}
    </div>
  );
}

/* =======================
   RESTOCK MODAL
======================= */

interface RestockModalProps {
  ingredient: Ingredient;
  onClose: () => void;
  onSuccess: () => void;
}

function RestockModal({ ingredient, onClose, onSuccess }: RestockModalProps) {
  const [quantity, setQuantity] = useState(0);
  const [cost, setCost] = useState(0);
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRestock = async () => {
    setLoading(true);

    await fetch(`/api/ingredients/${ingredient.id}/restock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quantity,
        costPerUnit: cost,
        expirationDate: date ? new Date(date).toISOString() : undefined,
      }),
    });

    setLoading(false);
    onSuccess();
  };

  return (
    <ModalWrapper
      onClose={onClose}
      title={<span className="text-indigo-700 font-bold text-lg">Restock {ingredient.name}</span>}
    >
      <form
        className="space-y-5 px-1 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          handleRestock();
        }}
      >
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-indigo-700">Quantity</label>
          <input
            type="number"
            min={0}
            className="w-full border border-indigo-200 rounded-xl px-4 py-2 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-gray-400"
            placeholder="Jumlah restock"
            onChange={(e) => setQuantity(Number(e.target.value))}
            required
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-indigo-700">Cost per Unit</label>
          <input
            type="number"
            min={0}
            className="w-full border border-indigo-200 rounded-xl px-4 py-2 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-gray-400"
            placeholder="Harga per satuan"
            onChange={(e) => setCost(Number(e.target.value))}
            required
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-indigo-700">Tanggal Expired</label>
          <input
            type="date"
            className="w-full border border-indigo-200 rounded-xl px-4 py-2 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-gray-400"
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white font-bold text-sm rounded-xl hover:bg-indigo-700 transition disabled:opacity-60 shadow"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            {loading ? "Memproses..." : "Restock"}
          </button>
        </div>
      </form>
    </ModalWrapper>
  );
}

/* =======================
   INITIAL STOCK MODAL
======================= */

interface InitialStockModalProps {
  ingredient: Ingredient;
  onClose: () => void;
  onSuccess: () => void;
}

function InitialStockModal({ ingredient, onClose, onSuccess }: InitialStockModalProps) {
  const [quantity, setQuantity] = useState(0);
  const [cost, setCost] = useState(0);
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSetInitialStock = async () => {
    if (quantity <= 0) {
      setError("Jumlah harus lebih dari 0");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/ingredients/${ingredient.id}/restock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantity,
          costPerUnit: cost || 0,
          expirationDate: date ? new Date(date).toISOString() : undefined,
          notes: `Stok Awal: ${ingredient.name}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal set stok awal");
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalWrapper
      onClose={onClose}
      title={
        <span className="text-emerald-700 font-bold text-lg flex items-center gap-2">
          <PackagePlus size={20} /> Set Stok Awal
        </span>
      }
    >
      <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
        <p className="text-sm text-emerald-700">
          <span className="font-bold">{ingredient.name}</span> — Belum memiliki stok. Set stok awal untuk mulai
          tracking.
        </p>
        <p className="text-xs text-emerald-500 mt-1">
          Stok awal akan tercatat sebagai pembelian pertama dan masuk ke data forecast serta RAG.
        </p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          handleSetInitialStock();
        }}
      >
        {error && (
          <div className="flex items-start gap-2 bg-red-50 text-red-600 rounded-xl p-3 text-sm">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <div className="space-y-2">
          <label className="block text-sm font-semibold text-emerald-700">Jumlah Stok Awal ({ingredient.unit})</label>
          <input
            type="number"
            min={0}
            step="any"
            className="w-full border border-emerald-200 rounded-xl px-4 py-2 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 placeholder:text-gray-400"
            placeholder={`Jumlah (${ingredient.unit})`}
            onChange={(e) => setQuantity(Number(e.target.value))}
            required
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-emerald-700">Harga per {ingredient.unit}</label>
          <input
            type="number"
            min={0}
            step="any"
            className="w-full border border-emerald-200 rounded-xl px-4 py-2 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 placeholder:text-gray-400"
            placeholder="Harga per satuan"
            onChange={(e) => setCost(Number(e.target.value))}
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-emerald-700">Tanggal Expired (opsional)</label>
          <input
            type="date"
            className="w-full border border-emerald-200 rounded-xl px-4 py-2 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 placeholder:text-gray-400"
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-linear-to-r from-emerald-500 to-teal-500 text-white py-2.5 rounded-xl font-semibold shadow hover:from-emerald-600 hover:to-teal-600 transition disabled:opacity-60"
        >
          {loading ? "Memproses..." : "Set Stok Awal"}
        </button>
      </form>
    </ModalWrapper>
  );
}

/* =======================
   HELPERS
======================= */

/** Formats a day-count into natural Indonesian relative time. */
function formatDaysRelative(days: number): string {
  const abs = Math.abs(days);
  const suffix = days < 0 ? "lalu" : "lagi";
  if (abs < 7) return `${abs} hari ${suffix}`;
  if (abs < 30) return `${Math.round(abs / 7)} minggu ${suffix}`;
  if (abs < 365) return `${Math.round(abs / 30)} bulan ${suffix}`;
  return `${Math.round(abs / 365)} tahun ${suffix}`;
}

/* =======================
   BATCH HISTORY
======================= */

interface Batch {
  expirationDate: string | number | Date;
  receivedAt: string | number | Date;
  id: number;
  remainingQty: number;
  costPerUnit: number;
}

interface BatchHistoryModalProps {
  ingredient: Ingredient;
  onClose: () => void;
  onSuccess: () => void;
}

function BatchHistoryModal({ ingredient, onClose, onSuccess }: BatchHistoryModalProps) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchLoading, setBatchLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Per-batch buang state
  const [buangBatchId, setBuangBatchId] = useState<number | null>(null);
  const [buangQty, setBuangQty] = useState("");
  const [buangNotes, setBuangNotes] = useState("");
  const [buangLoading, setBuangLoading] = useState(false);
  const [buangError, setBuangError] = useState<string | null>(null);

  const openBuang = (batchId: number) => {
    setBuangBatchId(batchId);
    setBuangQty("");
    setBuangNotes("");
    setBuangError(null);
  };

  const handleBuang = async () => {
    const qty = Number(buangQty);
    if (!qty || qty <= 0) {
      setBuangError("Jumlah harus lebih dari 0");
      return;
    }
    setBuangLoading(true);
    setBuangError(null);
    try {
      const res = await fetch(`/api/ingredients/${ingredient.id}/consume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantity: qty,
          batchId: buangBatchId,
          notes: buangNotes || `Buang: ${ingredient.name}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mencatat pembuangan");
      setBuangBatchId(null);
      onSuccess();
      const res2 = await fetch(`/api/ingredients?withBatches=true`);
      const d2 = await res2.json();
      const item = d2.data.find((i: Ingredient) => i.id === ingredient.id);
      setBatches(item?.inventoryBatches || []);
    } catch (err) {
      setBuangError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setBuangLoading(false);
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentStock = ingredient.currentStock ?? ingredient.stock ?? 0;
  const stockStatus =
    currentStock <= 0
      ? { label: "Habis", color: "bg-red-100 text-red-700 border-red-200" }
      : currentStock <= ingredient.minStock
        ? { label: "Perlu Restock", color: "bg-orange-100 text-orange-700 border-orange-200" }
        : { label: "Aman", color: "bg-emerald-100 text-emerald-700 border-emerald-200" };

  useEffect(() => {
    const fetchHistory = async () => {
      setBatchLoading(true);
      try {
        const res = await fetch(`/api/ingredients?withBatches=true`);
        const data = await res.json();
        const item = data.data.find((i: Ingredient) => i.id === ingredient.id);
        setBatches(item?.inventoryBatches || []);
      } finally {
        setBatchLoading(false);
      }
    };
    fetchHistory();
  }, [ingredient.id]);

  const getBatchStatus = (batch: Batch) => {
    const today = new Date();
    const expDate = new Date(batch.expirationDate);
    if (expDate < today) return { label: "Expired", color: "bg-red-100 text-red-700 border-red-200" };
    if (batch.remainingQty < 50)
      return { label: "Hampir Habis", color: "bg-orange-100 text-orange-700 border-orange-200" };
    return { label: "Aktif", color: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  };

  return mounted
    ? createPortal(
        <div
          ref={overlayRef}
          className="fixed inset-0 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
          style={{ zIndex: 200 }}
          onMouseDown={(e) => e.target === overlayRef.current && onClose()}
        >
          <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-lg max-h-[88dvh] flex flex-col overflow-hidden">
            {/* Drag handle – mobile only */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-start justify-between px-5 pt-3 pb-4 border-b border-gray-100 bg-linear-to-r from-violet-50 to-indigo-50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-violet-100 flex items-center justify-center shrink-0">
                  <Boxes size={20} className="text-violet-600" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-slate-800 leading-tight">{ingredient.name}</h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-slate-500 font-medium">Satuan: {ingredient.unit}</span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${stockStatus.color}`}
                    >
                      {stockStatus.label}
                    </span>
                  </div>
                </div>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/70 text-gray-400 transition">
                <X size={18} />
              </button>
            </div>

            {/* Stats strip */}
            <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100 bg-white shrink-0">
              <div className="flex flex-col items-center py-3 px-2 gap-0.5">
                <Package size={13} className="text-indigo-400 mb-0.5" />
                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wide text-center">Stok Saat Ini</p>
                <p className="text-sm font-extrabold text-indigo-700">{currentStock}</p>
                <p className="text-[9px] text-gray-400">{ingredient.unit}</p>
              </div>
              <div className="flex flex-col items-center py-3 px-2 gap-0.5">
                <TrendingDown size={13} className="text-orange-400 mb-0.5" />
                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wide text-center">Min. Stok</p>
                <p className="text-sm font-extrabold text-orange-600">
                  {ingredient.minStock === -1 ? "Belum di-set" : ingredient.minStock}
                </p>
                {ingredient.minStock !== -1 && <p className="text-[9px] text-gray-400">{ingredient.unit}</p>}
              </div>
              <div className="flex flex-col items-center py-3 px-2 gap-0.5">
                <Coins size={13} className="text-emerald-400 mb-0.5" />
                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wide text-center">Harga / Unit</p>
                <p className="text-sm font-extrabold text-emerald-700 truncate max-w-full px-1">
                  {ingredient.costPerUnit > 0 ? `Rp ${ingredient.costPerUnit.toLocaleString("id-ID")}` : "—"}
                </p>
              </div>
            </div>

            {/* Batch list */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                Daftar Batch Persediaan
              </p>

              {batchLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 size={24} className="text-violet-400 animate-spin" />
                </div>
              ) : batches.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                  <div className="w-14 h-14 rounded-3xl bg-gray-100 flex items-center justify-center">
                    <Boxes size={28} className="text-gray-300" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-500">Belum ada batch</p>
                    <p className="text-xs text-gray-400 mt-0.5">Tambah stok untuk membuat batch pertama</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {batches.map((batch, idx) => {
                    const status = getBatchStatus(batch);
                    const daysLeft = batch.expirationDate
                      ? Math.ceil((new Date(batch.expirationDate).getTime() - Date.now()) / 86_400_000)
                      : null;
                    return (
                      <div key={batch.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4 shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="w-7 h-7 rounded-xl bg-violet-100 flex items-center justify-center text-violet-700 text-xs font-extrabold shrink-0">
                              {idx + 1}
                            </span>
                            <span className="text-xs font-bold text-slate-700">
                              Batch{" "}
                              {batch.receivedAt
                                ? new Date(batch.receivedAt).toLocaleDateString("id-ID", {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                    timeZone: "Asia/Jakarta",
                                  })
                                : `#${idx + 1}`}
                            </span>
                          </div>
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${status.color}`}
                          >
                            {status.label}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-white rounded-xl px-3 py-2 border border-gray-100">
                            <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wide">Sisa Qty</p>
                            <p className="text-sm font-extrabold text-indigo-700 mt-0.5">
                              {batch.remainingQty}{" "}
                              <span className="text-xs font-medium text-gray-400">{ingredient.unit}</span>
                            </p>
                          </div>
                          <div className="bg-white rounded-xl px-3 py-2 border border-gray-100">
                            <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wide">Harga / Unit</p>
                            <p className="text-sm font-extrabold text-emerald-700 mt-0.5">
                              Rp {batch.costPerUnit?.toLocaleString("id-ID") ?? "—"}
                            </p>
                          </div>
                          {batch.expirationDate && (
                            <div className="col-span-2 bg-white rounded-xl px-3 py-2 border border-gray-100">
                              <div className="flex items-center gap-1 mb-0.5">
                                <Calendar size={10} className="text-gray-400" />
                                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wide">Kadaluarsa</p>
                              </div>
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-extrabold text-slate-700">
                                  {new Date(batch.expirationDate).toLocaleDateString("id-ID", {
                                    day: "numeric",
                                    month: "long",
                                    year: "numeric",
                                    timeZone: "Asia/Jakarta",
                                  })}
                                </p>
                                {daysLeft !== null && (
                                  <span
                                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                      daysLeft < 0
                                        ? "bg-red-100 text-red-600"
                                        : daysLeft <= 7
                                          ? "bg-orange-100 text-orange-600"
                                          : "bg-slate-100 text-slate-500"
                                    }`}
                                  >
                                    {formatDaysRelative(daysLeft)}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Buang inline form */}
                        {buangBatchId === batch.id ? (
                          <div className="mt-3 rounded-xl bg-orange-50 border border-orange-200 p-3 space-y-2">
                            <p className="text-[10px] font-bold text-orange-700 uppercase tracking-wide flex items-center gap-1">
                              <Flame size={11} /> Buang dari batch ini
                            </p>
                            {buangError && (
                              <p className="text-xs text-red-600 flex items-center gap-1">
                                <AlertTriangle size={11} /> {buangError}
                              </p>
                            )}
                            <input
                              type="number"
                              min={0.001}
                              step="any"
                              autoFocus
                              placeholder={`Jumlah (${ingredient.unit})`}
                              value={buangQty}
                              onChange={(e) => {
                                setBuangQty(e.target.value);
                                setBuangError(null);
                              }}
                              className="w-full border border-orange-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                            />
                            <input
                              type="text"
                              placeholder="Alasan (opsional)"
                              value={buangNotes}
                              onChange={(e) => setBuangNotes(e.target.value)}
                              className="w-full border border-orange-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setBuangBatchId(null)}
                                className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-semibold hover:bg-gray-50 transition"
                              >
                                Batal
                              </button>
                              <button
                                type="button"
                                onClick={handleBuang}
                                disabled={buangLoading}
                                className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-orange-500 text-white text-xs font-bold rounded-lg hover:bg-orange-600 transition disabled:opacity-50"
                              >
                                {buangLoading ? <Loader2 size={12} className="animate-spin" /> : <Flame size={12} />}
                                Konfirmasi Buang
                              </button>
                            </div>
                          </div>
                        ) : (
                          batch.remainingQty > 0 && (
                            <button
                              type="button"
                              onClick={() => openBuang(batch.id)}
                              className="mt-3 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl border border-orange-200 text-orange-600 text-xs font-semibold hover:bg-orange-50 transition"
                            >
                              <Flame size={12} /> Buang
                            </button>
                          )
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {/* bottom safe-area spacer on mobile */}
              <div className="h-4 sm:h-0" />
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;
}

/* =======================
   ADD MODAL (SIMPLE)
======================= */

interface AddIngredientModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

function AddIngredientModal({ onClose, onSuccess }: AddIngredientModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "",
    unit: "",
    minStock: -1,
    quantity: -1,
    costPerUnit: 0,
    expirationDate: "",
  });

  const handleSubmit = async () => {
    if (!form.name || !form.unit) {
      setError("Nama dan satuan wajib diisi");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const expirationDateISO = form.expirationDate ? new Date(form.expirationDate).toISOString() : undefined;

      const res = await fetch("/api/ingredients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          unit: form.unit,
          minStock: form.minStock === -1 || form.minStock === undefined ? 0 : Number(form.minStock),
          initialBatch:
            form.quantity > 0
              ? {
                  quantity: Number(form.quantity),
                  costPerUnit: Number(form.costPerUnit),
                  expirationDate: expirationDateISO,
                }
              : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create ingredient");
      }

      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalWrapper onClose={onClose} title="Tambah Bahan Baku">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="space-y-4"
      >
        {error && <div className="text-red-600 text-sm">{error}</div>}

        <div>
          <label className="block text-sm font-semibold text-indigo-700 mb-1">Nama</label>
          <input
            className="w-full border border-indigo-200 rounded-xl px-4 py-2 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-gray-400"
            placeholder="Nama bahan baku"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-indigo-700 mb-1">Satuan</label>
          <select
            className="w-full border border-indigo-200 rounded-xl px-4 py-2 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
            required
          >
            <option value="" disabled>
              -- Pilih satuan --
            </option>
            {INGREDIENT_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-indigo-700 mb-1">Minimum Stock</label>
          <input
            type="number"
            min={0}
            className="w-full border border-indigo-200 rounded-xl px-4 py-2 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-gray-400"
            placeholder="Minimum stok sebelum warning"
            onChange={(e) => setForm({ ...form, minStock: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-indigo-700 mb-1">Initial Quantity</label>
          <input
            type="number"
            min={0}
            className="w-full border border-indigo-200 rounded-xl px-4 py-2 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-gray-400"
            placeholder="Jumlah awal (opsional)"
            onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-indigo-700 mb-1">Cost per Unit</label>
          <input
            type="number"
            min={0}
            className="w-full border border-indigo-200 rounded-xl px-4 py-2 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-gray-400"
            placeholder="Harga per satuan (opsional)"
            onChange={(e) => setForm({ ...form, costPerUnit: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-indigo-700 mb-1">Tanggal Expired</label>
          <input
            type="date"
            className="w-full border border-indigo-200 rounded-xl px-4 py-2 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-gray-400"
            onChange={(e) => setForm({ ...form, expirationDate: e.target.value })}
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white font-bold text-sm rounded-xl hover:bg-indigo-700 transition disabled:opacity-60 shadow"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            {loading ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </form>
    </ModalWrapper>
  );
}

interface EditIngredientModalProps {
  ingredient: Ingredient;
  onClose: () => void;
  onSuccess: () => void;
}

function EditIngredientModal({ ingredient, onClose, onSuccess }: EditIngredientModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: ingredient.name,
    unit: ingredient.unit,
    minStock: ingredient.minStock,
  });

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setError("");

      // Only send fields that are supported by PATCH endpoint
      const payload = {
        name: form.name,
        unit: form.unit,
        minStock: form.minStock,
      };

      const res = await fetch(`/api/ingredients/${ingredient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      // Try to parse JSON only if response has content
      let data = null;
      const text = await res.text();
      if (text) {
        data = JSON.parse(text);
      }

      if (!res.ok) {
        throw new Error((data && data.error) || "Failed to update ingredient");
      }

      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalWrapper
      onClose={onClose}
      title={
        <span className="flex items-center gap-2 text-indigo-700">
          <Pencil size={20} />
          <span className="font-bold">Edit Bahan Baku</span>
        </span>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="space-y-6"
      >
        {error && (
          <div className="text-red-600 text-sm font-semibold px-2 py-1 bg-red-50 rounded-lg border border-red-200">
            {error}
          </div>
        )}

        <div className="space-y-1">
          <label className="block text-sm font-semibold text-indigo-700 mb-0.5">Nama</label>
          <input
            className="w-full border-2 border-indigo-300 rounded-xl px-4 py-2 text-base text-black focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition placeholder:text-gray-400 bg-white shadow-sm"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            placeholder="Nama bahan baku"
            autoFocus
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-semibold text-indigo-700 mb-0.5">Satuan</label>
          <select
            className="w-full border-2 border-indigo-300 rounded-xl px-4 py-2 text-base text-black focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition bg-white shadow-sm"
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
            required
          >
            {INGREDIENT_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-semibold text-indigo-700 mb-0.5">Minimum Stock</label>
          <input
            type="number"
            min={0}
            className="w-full border-2 border-indigo-300 rounded-xl px-4 py-2 text-base text-black focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition placeholder:text-gray-400 bg-white shadow-sm"
            value={form.minStock}
            onChange={(e) => setForm({ ...form, minStock: Number(e.target.value) })}
            placeholder="Masukkan stok minimum"
          />
        </div>

        <div className="flex justify-end gap-3 pt-6">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold text-base hover:bg-gray-50 transition disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white font-bold text-base rounded-xl hover:bg-indigo-700 transition disabled:opacity-50 shadow"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Pencil size={18} />}
            {loading ? "Menyimpan..." : "Simpan Perubahan"}
          </button>
        </div>
      </form>
    </ModalWrapper>
  );
}

/* =======================
   MODAL WRAPPER
======================= */

interface ModalWrapperProps {
  children: React.ReactNode;
  onClose: () => void;
  title: React.ReactNode;
}

function ModalWrapper({ children, onClose, title }: ModalWrapperProps) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
      style={{ zIndex: 9999 }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-md max-h-[88dvh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle – mobile only */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        {/* Header (only shown when title is provided) */}
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-linear-to-r from-indigo-50 to-violet-50 shrink-0">
            <div className="font-bold text-base text-indigo-700">{title}</div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 transition shrink-0"
            >
              <X size={18} />
            </button>
          </div>
        )}
        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {/* Bottom safe-area spacer on mobile */}
        <div className="h-4 sm:h-0 shrink-0" />
      </div>
    </div>,
    document.body,
  );
}
