"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Plus,
  Search,
  Sparkles,
  Trash2,
  Edit3,
  X,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Package,
  TrendingUp,
  ChevronUp,
  ChevronDown,
  Tag,
  DownloadCloud,
} from "lucide-react";
import {
  makeAddOnKey,
  useCatalogAdminState,
} from "@/lib/bookings/catalog-admin";
import { toast } from "sonner";

function normalizeId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(value);

// --- Modals ---

interface AddOnRow {
  category: string;
  id: string;
  label: string;
  price: number;
}

function AddEditAddOnModal({
  open,
  editData,
  onClose,
  onSave,
}: {
  open: boolean;
  editData: AddOnRow | null;
  onClose: () => void;
  onSave: (data: AddOnRow) => void;
}) {
  const [category, setCategory] = useState("");
  const [label, setLabel] = useState("");
  const [id, setId] = useState("");
  const [price, setPrice] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editData) {
      setCategory(editData.category);
      setLabel(editData.label);
      setId(editData.id);
      setPrice(editData.price);
    } else {
      setCategory("");
      setLabel("");
      setId("");
      setPrice(0);
    }
    setError(null);
  }, [editData, open]);

  const handleSave = () => {
    if (!category.trim() || !label.trim()) {
      setError("Kategori dan Nama wajib diisi.");
      return;
    }
    const nextId = id.trim() || normalizeId(label);
    onSave({
      category: category.trim(),
      id: nextId,
      label: label.trim(),
      price: Math.max(0, Math.round(price)),
    });
    onClose();
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-h-[92dvh] overflow-y-auto rounded-t-3xl border border-orange-100 bg-white shadow-2xl outline-none sm:max-w-md sm:rounded-3xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-orange-100 bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
              {editData ? <Edit3 size={20} /> : <Plus size={20} />}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-orange-700">
                {editData ? "Edit Add-on" : "Tambah Add-on"}
              </p>
              <h2 className="text-lg font-extrabold text-slate-900">
                {editData ? "Ubah Detail Add-on" : "Add-on Baru"}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5 sm:px-6">
          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-600">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                Kategori
              </label>
              <input
                placeholder="cth. Cake / Cookies"
                className="mt-1.5 w-full border border-orange-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-orange-300 outline-none transition"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                Nama Add-on
              </label>
              <input
                placeholder="cth. Lilin Angka"
                className="mt-1.5 w-full border border-orange-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-orange-300 outline-none transition"
                value={label}
                onChange={(e) => {
                  setLabel(e.target.value);
                  if (!id && !editData) setId(normalizeId(e.target.value));
                }}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                ID (Slug)
              </label>
              <input
                placeholder="cth. lilin-angka"
                disabled={!!editData}
                className="mt-1.5 w-full border border-orange-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-orange-300 outline-none transition disabled:bg-gray-50 disabled:text-gray-400"
                value={id}
                onChange={(e) => setId(normalizeId(e.target.value))}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                Harga (Rp)
              </label>
              <input
                type="number"
                min={0}
                className="mt-1.5 w-full border border-orange-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-orange-300 outline-none transition"
                value={price}
                onChange={(e) => setPrice(Number(e.target.value) || 0)}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition"
            >
              Batal
            </button>
            <button
              onClick={handleSave}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-600 text-white font-bold text-sm rounded-xl hover:bg-orange-700 transition"
            >
              <CheckCircle2 size={16} />
              Simpan
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function DeleteConfirmModal({
  open,
  data,
  onClose,
  onConfirm,
}: {
  open: boolean;
  data: AddOnRow | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open || !data) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden border border-orange-100">
        <div className="px-6 py-8 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600">
            <Trash2 size={24} />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">
              Hapus Add-on?
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Add-on <span className="font-bold text-slate-800">{data.label}</span> akan disembunyikan dari sistem booking. Tindakan ini bisa dibatalkan nanti.
            </p>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition"
            >
              Batal
            </button>
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className="flex-1 px-4 py-2.5 bg-red-600 text-white font-bold text-sm rounded-xl hover:bg-red-700 transition"
            >
              Hapus
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// --- Main Component ---

export default function AddOnsPage() {
  const { addOnCatalog, setCatalogAdminState, syncStatus, retrySync } = useCatalogAdminState();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sortBy, setSortBy] = useState<"label" | "price" | "category">("label");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Modals state
  const [addEditModalOpen, setAddEditModalOpen] = useState(false);
  const [editData, setEditData] = useState<AddOnRow | null>(null);
  const [deleteData, setDeleteData] = useState<AddOnRow | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const rows = useMemo(() => {
    const list = Object.entries(addOnCatalog).flatMap(([group, items]) =>
      items.map((item) => ({
        category: group,
        id: item.id,
        label: item.label,
        price: Number(item.price || 0),
      })),
    );

    let filtered = list;

    // Search
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.label.toLowerCase().includes(q) ||
          item.id.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q),
      );
    }

    // Category filter
    if (categoryFilter) {
      filtered = filtered.filter((item) => item.category === categoryFilter);
    }

    // Sort
    return filtered.sort((a, b) => {
      let comparison = 0;
      if (sortBy === "price") {
        comparison = a.price - b.price;
      } else {
        comparison = a[sortBy].localeCompare(b[sortBy], "id");
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });
  }, [addOnCatalog, search, categoryFilter, sortBy, sortOrder]);

  const categories = useMemo(() => {
    return Array.from(new Set(Object.keys(addOnCatalog))).sort();
  }, [addOnCatalog]);

  const avgPrice = useMemo(() => {
    if (rows.length === 0) return 0;
    return rows.reduce((sum, r) => sum + r.price, 0) / rows.length;
  }, [rows]);

  const handleSaveAddOn = (data: AddOnRow) => {
    const nextCategory = data.category;
    const nextLabel = data.label;
    const nextId = data.id;

    setCatalogAdminState((prev) => {
      // Check if it's in customAddOns
      const exists = prev.customAddOns.some(
        (entry) =>
          entry.category.toLowerCase() === nextCategory.toLowerCase() &&
          entry.id.toLowerCase() === nextId.toLowerCase(),
      );

      const nextCustomAddOns = exists
        ? prev.customAddOns.map((entry) =>
            entry.category.toLowerCase() === nextCategory.toLowerCase() &&
            entry.id.toLowerCase() === nextId.toLowerCase()
              ? { ...entry, label: nextLabel, price: data.price }
              : entry,
          )
        : [
            ...prev.customAddOns,
            {
              category: nextCategory,
              id: nextId,
              label: nextLabel,
              price: data.price,
            },
          ];

      const key = makeAddOnKey(nextCategory, nextId);
      return {
        ...prev,
        customAddOns: nextCustomAddOns,
        addOnPriceOverrides: {
          ...prev.addOnPriceOverrides,
          [key]: data.price,
        },
        inactiveAddOns: prev.inactiveAddOns.filter((entry) => entry !== key),
      };
    });

    toast.success(editData ? "Add-on berhasil diperbarui" : "Add-on berhasil ditambahkan");
  };

  const handleDelete = (row: AddOnRow) => {
    const key = makeAddOnKey(row.category, row.id);
    setCatalogAdminState((prev) => ({
      ...prev,
      inactiveAddOns: prev.inactiveAddOns.includes(key)
        ? prev.inactiveAddOns
        : [...prev.inactiveAddOns, key],
    }));
    toast.success(`Add-on "${row.label}" berhasil disembunyikan`);
  };

  const handleSortClick = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
  };

  return (
    <div className="space-y-8">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 bg-linear-to-r from-orange-500 via-orange-500 to-amber-400 rounded-2xl p-5 sm:p-7 shadow-xl">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-3">
            <Sparkles className="w-6 h-6 sm:w-8 sm:h-8 shrink-0" />
            Add-ons
          </h1>
          <p className="text-orange-50 text-sm mt-1 font-medium">
            Kelola extra detail, flavor, dan dekorasi booking Anda.
          </p>
        </div>
        <div className="flex items-center gap-2">
           {syncStatus === "error" && (
            <button
              onClick={retrySync}
              className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 font-bold rounded-xl text-sm hover:bg-red-200 transition"
            >
              <AlertTriangle size={16} /> Retry Sync
            </button>
          )}
          <button
            onClick={() => {
              setEditData(null);
              setAddEditModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-white text-orange-700 font-bold rounded-xl shadow-lg hover:bg-orange-50 transition text-sm sm:text-base"
          >
            <Plus size={20} />
            Tambah Add-on
          </button>
        </div>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-orange-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
            <Package size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Add-on</p>
            <p className="text-xl font-extrabold text-slate-800">{rows.length}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-orange-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Tag size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Kategori</p>
            <p className="text-xl font-extrabold text-slate-800">{categories.length}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-orange-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <TrendingUp size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Avg. Harga</p>
            <p className="text-xl font-extrabold text-slate-800">{formatCurrency(avgPrice)}</p>
          </div>
        </div>
      </div>

      {/* FILTERS */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-orange-500 transition" size={18} />
          <input
            placeholder="Cari nama add-on, kategori, atau ID..."
            className="w-full h-12 pl-12 pr-4 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-orange-300 focus:border-orange-400 outline-none transition shadow-sm"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <select
            className="h-12 px-4 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-orange-300 outline-none transition shadow-sm font-semibold text-sm text-slate-700 min-w-[160px]"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">Semua Kategori</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-3xl border border-orange-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-orange-50 text-orange-800 border-b border-orange-100">
                <th
                  className="px-6 py-4 font-bold cursor-pointer hover:bg-orange-100/50 transition uppercase tracking-wider text-xs"
                  onClick={() => handleSortClick("label")}
                >
                  <div className="flex items-center gap-1">
                    Nama Add-on
                    {sortBy === "label" && (sortOrder === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                  </div>
                </th>
                <th
                  className="px-6 py-4 font-bold cursor-pointer hover:bg-orange-100/50 transition uppercase tracking-wider text-xs"
                  onClick={() => handleSortClick("category")}
                >
                  <div className="flex items-center gap-1">
                    Kategori
                    {sortBy === "category" && (sortOrder === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                  </div>
                </th>
                <th className="px-6 py-4 font-bold uppercase tracking-wider text-xs text-gray-400">ID</th>
                <th
                  className="px-6 py-4 font-bold text-right cursor-pointer hover:bg-orange-100/50 transition uppercase tracking-wider text-xs"
                  onClick={() => handleSortClick("price")}
                >
                  <div className="flex items-center justify-end gap-1">
                    Harga
                    {sortBy === "price" && (sortOrder === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                  </div>
                </th>
                <th className="px-6 py-4 font-bold text-center uppercase tracking-wider text-xs">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-400 italic">
                    {search ? "Tidak ada add-on yang cocok dengan pencarian Anda." : "Belum ada add-on yang terdaftar."}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={`${row.category}-${row.id}`} className="hover:bg-orange-50/30 transition group">
                    <td className="px-6 py-4 font-extrabold text-slate-800">{row.label}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700 border border-orange-200">
                        {row.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-gray-400">{row.id}</td>
                    <td className="px-6 py-4 text-right font-extrabold text-slate-900">
                      {formatCurrency(row.price)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => {
                            setEditData(row);
                            setAddEditModalOpen(true);
                          }}
                          className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-xl transition"
                          title="Edit"
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          onClick={() => setDeleteData(row)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition"
                          title="Hapus"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MOBILE LIST */}
      <div className="space-y-3 md:hidden">
         {rows.map((row) => (
           <div key={`${row.category}-${row.id}`} className="bg-white rounded-2xl border border-orange-100 p-4 shadow-sm space-y-3">
             <div className="flex justify-between items-start">
               <div>
                 <p className="font-extrabold text-slate-800">{row.label}</p>
                 <span className="text-[10px] font-bold uppercase text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">{row.category}</span>
               </div>
               <div className="flex gap-1">
                  <button
                    onClick={() => {
                      setEditData(row);
                      setAddEditModalOpen(true);
                    }}
                    className="p-2 text-indigo-600 bg-indigo-50 rounded-lg"
                  >
                    <Edit3 size={16} />
                  </button>
                  <button
                    onClick={() => setDeleteData(row)}
                    className="p-2 text-red-500 bg-red-50 rounded-lg"
                  >
                    <Trash2 size={16} />
                  </button>
               </div>
             </div>
             <div className="flex justify-between items-center pt-2 border-t border-gray-50">
                <span className="text-xs font-mono text-gray-400">#{row.id}</span>
                <span className="font-extrabold text-slate-900">{formatCurrency(row.price)}</span>
             </div>
           </div>
         ))}
      </div>

      {/* FOOTER HINT */}
      <div className="flex items-center justify-center gap-2 py-4 text-gray-400">
        <DownloadCloud size={16} />
        <p className="text-xs font-medium">Data disinkronkan secara real-time dengan Booking Catalog</p>
      </div>

      {/* MODALS */}
      <AddEditAddOnModal
        open={addEditModalOpen}
        editData={editData}
        onClose={() => setAddEditModalOpen(false)}
        onSave={handleSaveAddOn}
      />

      <DeleteConfirmModal
        open={!!deleteData}
        data={deleteData}
        onClose={() => setDeleteData(null)}
        onConfirm={() => deleteData && handleDelete(deleteData)}
      />
    </div>
  );
}
