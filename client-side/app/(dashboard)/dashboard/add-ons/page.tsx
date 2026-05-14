"use client";

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Plus,
  Search,
  Trash2,
  Pencil,
  X,
  Loader2,
  ArrowUpDown,
} from "lucide-react";
import {
  makeAddOnKey,
  useCatalogAdminState,
} from "@/lib/bookings/catalog-admin";
import { useRole } from "@/context/RoleContext";

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

type GroupedAddOnRow = {
  key: string;
  id: string;
  label: string;
  price: number;
  cogs: number;
  margin: number;
  categories: string[];
};

type SortOption = {
  label: string;
  compare: (left: GroupedAddOnRow, right: GroupedAddOnRow) => number;
};

const SORT_OPTIONS: SortOption[] = [
  {
    label: "Nama A-Z",
    compare: (left, right) => left.label.localeCompare(right.label, "id"),
  },
  {
    label: "Nama Z-A",
    compare: (left, right) => right.label.localeCompare(left.label, "id"),
  },
  {
    label: "Harga Tertinggi",
    compare: (left, right) => right.price - left.price,
  },
  {
    label: "Harga Terendah",
    compare: (left, right) => left.price - right.price,
  },
];

function inferAddOnType(row: GroupedAddOnRow): string {
  const text = `${row.id} ${row.label}`.toLowerCase();
  return /(additional|extra|qty|flower|small|medium|large)/.test(text)
    ? "Per Qty"
    : "Per Item";
}

function formatPercent(value: number): string {
  const normalized = Number.isFinite(value) ? value : 0;
  return `${normalized.toFixed(normalized % 1 === 0 ? 0 : 1)}%`;
}

function AddOnModal({
  mode,
  open,
  loading,
  error,
  title,
  children,
  onClose,
  onSubmit,
}: {
  mode: "add" | "edit";
  open: boolean;
  loading?: boolean;
  error?: string | null;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/35 p-0 sm:items-center sm:p-4"
      onMouseDown={(event) =>
        event.target === overlayRef.current ? onClose() : undefined
      }
    >
      <div className="w-full overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-md sm:rounded-3xl">
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-gray-200" />
        </div>
        <div className="flex items-start justify-between border-b border-[#ead8cb] bg-[#fff8f3] px-5 py-4">
          <div>
            <h2 className="text-base font-extrabold text-[#7c3410]">{title}</h2>
            <p className="mt-1 text-xs text-[#b89080]">
              {mode === "add"
                ? "Tambah add-on baru ke katalog aktif."
                : "Ubah harga add-on tanpa mengubah backend utama."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {children}
          {error ? (
            <div className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </div>
          ) : null}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-[#e0d0c4] px-4 py-2.5 text-sm font-semibold text-[#6b4a38]"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={loading}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#c86030] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {mode === "add" ? "Tambah" : "Simpan"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function AddOnsPage() {
  const { isOwner, isAdmin, loading: roleLoading } = useRole();
  const canManageAddOns = isOwner;
  const { addOnCatalog, syncStatus, setCatalogAdminState } =
    useCatalogAdminState();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [sortIndex, setSortIndex] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [editRow, setEditRow] = useState<GroupedAddOnRow | null>(null);
  const [formCategory, setFormCategory] = useState("");
  const [formLabel, setFormLabel] = useState("");
  const [formId, setFormId] = useState("");
  const [formPrice, setFormPrice] = useState(0);
  const [formCogs, setFormCogs] = useState(0);
  const [modalError, setModalError] = useState<string | null>(null);

  const categoryOptions = useMemo(
    () => Object.keys(addOnCatalog).sort((a, b) => a.localeCompare(b, "id")),
    [addOnCatalog],
  );

  const groupedRows = useMemo(() => {
    const grouped = new Map<string, GroupedAddOnRow>();

    Object.entries(addOnCatalog).forEach(([category, items]) => {
      items.forEach((item) => {
        const price = Number(item.price || 0);
        const cogs = Number(item.cogs || 0);
        const key = `${item.id.toLowerCase()}||${item.label.toLowerCase()}||${price}||${cogs}`;
        const current = grouped.get(key);
        if (!current) {
          grouped.set(key, {
            key,
            id: item.id,
            label: item.label,
            price,
            cogs,
            margin: price > 0 ? ((price - cogs) / price) * 100 : 0,
            categories: [category],
          });
          return;
        }

        if (!current.categories.includes(category)) {
          current.categories.push(category);
          current.categories.sort((left, right) =>
            left.localeCompare(right, "id"),
          );
        }
      });
    });

    const q = search.trim().toLowerCase();
    const filtered = Array.from(grouped.values()).filter((row) => {
      if (
        selectedCategory &&
        !row.categories.some(
          (category) =>
            category.toLowerCase() === selectedCategory.toLowerCase(),
        )
      ) {
        return false;
      }
      if (!q) return true;
      return (
        row.label.toLowerCase().includes(q) ||
        row.id.toLowerCase().includes(q) ||
        row.categories.some((category) => category.toLowerCase().includes(q))
      );
    });

    return filtered.sort(
      SORT_OPTIONS[sortIndex]?.compare ?? SORT_OPTIONS[0].compare,
    );
  }, [addOnCatalog, search, selectedCategory, sortIndex]);

  const cycleSort = () => {
    setSortIndex((current) => (current + 1) % SORT_OPTIONS.length);
  };

  const resetAddForm = () => {
    setFormCategory(categoryOptions[0] ?? "");
    setFormLabel("");
    setFormId("");
    setFormPrice(0);
    setFormCogs(0);
    setModalError(null);
  };

  const openAddModal = () => {
    if (!canManageAddOns) return;
    resetAddForm();
    setEditRow(null);
    setAddOpen(true);
  };

  const openEditModal = (row: GroupedAddOnRow) => {
    if (!canManageAddOns) return;
    setEditRow(row);
    setFormPrice(row.price);
    setFormCogs(row.cogs);
    setModalError(null);
  };

  const handleAdd = () => {
    if (!canManageAddOns) return;
    const nextCategory = formCategory.trim();
    const nextLabel = formLabel.trim();
    const nextId = normalizeId(formId || formLabel);

    if (!nextCategory || !nextLabel || !nextId) {
      setModalError("Kategori, nama add-on, dan ID wajib diisi.");
      return;
    }

    setCatalogAdminState((prev) => {
      const exists = prev.customAddOns.some(
        (entry) =>
          entry.category.toLowerCase() === nextCategory.toLowerCase() &&
          entry.id.toLowerCase() === nextId.toLowerCase(),
      );

      const nextCustomAddOns = exists
        ? prev.customAddOns.map((entry) =>
            entry.category.toLowerCase() === nextCategory.toLowerCase() &&
            entry.id.toLowerCase() === nextId.toLowerCase()
              ? {
                  ...entry,
                  label: nextLabel,
                  price: Math.max(0, Math.round(Number(formPrice || 0))),
                  cogs: Math.max(0, Math.round(Number(formCogs || 0))),
                }
              : entry,
          )
        : [
            ...prev.customAddOns,
            {
              category: nextCategory,
              id: nextId,
              label: nextLabel,
              price: Math.max(0, Math.round(Number(formPrice || 0))),
              cogs: Math.max(0, Math.round(Number(formCogs || 0))),
            },
          ];

      const key = makeAddOnKey(nextCategory, nextId);

      return {
        ...prev,
        customAddOns: nextCustomAddOns,
        addOnPriceOverrides: {
          ...prev.addOnPriceOverrides,
          [key]: Math.max(0, Math.round(Number(formPrice || 0))),
        },
        addOnCogsOverrides: {
          ...prev.addOnCogsOverrides,
          [key]: Math.max(0, Math.round(Number(formCogs || 0))),
        },
        inactiveAddOns: prev.inactiveAddOns.filter((entry) => entry !== key),
      };
    });

    setAddOpen(false);
    resetAddForm();
  };

  const handlePriceUpdate = () => {
    if (!canManageAddOns) return;
    if (!editRow) return;
    setCatalogAdminState((prev) => {
      const nextOverrides = { ...prev.addOnPriceOverrides };
      const nextCogsOverrides = { ...prev.addOnCogsOverrides };
      editRow.categories.forEach((category) => {
        nextOverrides[makeAddOnKey(category, editRow.id)] = Math.max(
          0,
          Math.round(Number(formPrice || 0)),
        );
        nextCogsOverrides[makeAddOnKey(category, editRow.id)] = Math.max(
          0,
          Math.round(Number(formCogs || 0)),
        );
      });
      return {
        ...prev,
        addOnPriceOverrides: nextOverrides,
        addOnCogsOverrides: nextCogsOverrides,
      };
    });
    setEditRow(null);
  };

  const handleDelete = (row: GroupedAddOnRow) => {
    if (!canManageAddOns) return;
    setCatalogAdminState((prev) => ({
      ...prev,
      inactiveAddOns: Array.from(
        new Set([
          ...prev.inactiveAddOns,
          ...row.categories.map((category) => makeAddOnKey(category, row.id)),
        ]),
      ),
    }));
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-10 text-[#1e120a]">
      <section className="space-y-5">
        <div className="flex items-center justify-between gap-3 border-b border-[#e0d0c4] px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-[#1e120a] sm:text-xl">
              Add On
            </h1>
            <p className="mt-0.5 text-xs text-[#b89080]">
              {groupedRows.length} add-on · semua produk
            </p>
          </div>
          {canManageAddOns ? (
            <button
              onClick={openAddModal}
              className="inline-flex items-center gap-1 rounded-full bg-[#c86030] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#a84820]"
            >
              <Plus size={16} />
              Tambah
            </button>
          ) : null}
        </div>

        <div className="space-y-4 px-4 py-4 sm:px-5">
          <div className="flex items-center gap-3 rounded-[18px] border border-[#e0d0c4] bg-[#fdfaf7] px-4 py-3 shadow-[0_1px_4px_rgba(30,18,10,0.06)]">
            <Search size={18} className="shrink-0 text-[#c86030]" />
            <input
              placeholder="Cari nama add-on..."
              className="h-6 w-full bg-transparent text-sm text-[#1e120a] outline-none placeholder:text-[#b89080]"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="-mx-1 overflow-x-auto">
            <div className="flex min-w-max gap-2 px-1">
              <button
                type="button"
                onClick={() => setSelectedCategory("")}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  !selectedCategory
                    ? "border-[#c86030] bg-[#c86030] text-white"
                    : "border-[#e0d0c4] bg-[#fdfaf7] text-[#6b4a38]"
                }`}
              >
                Semua
              </button>
              {categoryOptions.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setSelectedCategory(category)}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    selectedCategory === category
                      ? "border-[#c86030] bg-[#c86030] text-white"
                      : "border-[#e0d0c4] bg-[#fdfaf7] text-[#6b4a38]"
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          {!roleLoading && isAdmin ? (
            <div className="rounded-2xl border border-[#eadccf] bg-[#fff8f2] px-4 py-3 text-sm font-medium text-[#8c6248]">
              Role Admin hanya bisa melihat data add-on. Tambah, edit, dan hapus
              hanya untuk Owner.
            </div>
          ) : null}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3 px-1">
          <div>
            <h2 className="text-[1.55rem] font-bold text-[#1e120a]">
              {groupedRows.length} add-on
            </h2>
            <p className="text-xs text-[#8d6a55]">
              Status sinkron: {syncStatus}
            </p>
          </div>
          <button
            type="button"
            onClick={cycleSort}
            className="inline-flex items-center gap-1 text-sm font-semibold text-[#7c3410] transition hover:text-[#a84820]"
          >
            <ArrowUpDown size={14} />
            Sort
          </button>
        </div>

        <p className="px-1 text-xs text-[#b89080]">
          Urutan aktif: {SORT_OPTIONS[sortIndex]?.label}
        </p>

        {groupedRows.length === 0 ? (
          <div className="rounded-[24px] border border-[#e0d0c4] bg-[#fdfaf7] px-6 py-14 text-center text-[#8d6a55]">
            <p className="text-base font-bold text-[#1e120a]">
              Add-on tidak ditemukan
            </p>
            <p className="mt-1 text-sm">
              Coba ubah pencarian atau tambahkan add-on baru.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {groupedRows.map((row) => (
              <article
                key={row.key}
                className="overflow-hidden rounded-[20px] border border-[#e0d0c4] bg-[#fdfaf7] shadow-[0_1px_4px_rgba(30,18,10,0.06)]"
              >
                <div className="flex items-start justify-between gap-3 border-b border-[#e0d0c4] px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="line-clamp-2 text-[1rem] font-bold text-[#1e120a]">
                      {row.label}
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {row.categories.map((category) => (
                        <span
                          key={`${row.key}-${category}`}
                          className="rounded-full bg-[#f5e0d0] px-2.5 py-1 text-[10px] font-bold text-[#a84820]"
                        >
                          {category}
                        </span>
                      ))}
                    </div>
                  </div>
                  {canManageAddOns ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEditModal(row)}
                        className="rounded-full p-1.5 text-[#f06b2b] transition hover:bg-[#fff0e7]"
                        title="Edit add-on"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => handleDelete(row)}
                        className="rounded-full p-1.5 text-[#6f6f8f] transition hover:bg-[#f5f2ef]"
                        title="Hapus add-on"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="grid grid-cols-3 border-b border-[#e0d0c4] px-3 py-3">
                  <div className="border-r border-[#e0d0c4] px-1 text-center">
                    <p className="text-[10px] text-[#b89080]">Harga</p>
                    <p className="mt-1 text-sm font-bold text-[#c86030]">
                      {formatCurrency(row.price)}
                    </p>
                  </div>
                  <div className="border-r border-[#e0d0c4] px-1 text-center">
                    <p className="text-[10px] text-[#b89080]">COGS / HPP</p>
                    <p className="mt-1 text-sm font-semibold text-[#1e120a]">
                      {formatCurrency(row.cogs)}
                    </p>
                  </div>
                  <div className="px-1 text-center">
                    <p className="text-[10px] text-[#b89080]">Margin</p>
                    <p className="mt-1 text-sm font-bold text-[#2a5c3f]">
                      {formatPercent(row.margin)}
                    </p>
                  </div>
                </div>

                <div className="px-4 py-2.5">
                  <p className="text-[10px] text-[#b89080]">
                    Berlaku untuk: {row.categories.join(", ")} · Tipe:{" "}
                    {inferAddOnType(row)}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <AddOnModal
        mode="add"
        open={addOpen}
        title="Tambah Add-On"
        error={modalError}
        onClose={() => {
          setAddOpen(false);
          setModalError(null);
        }}
        onSubmit={handleAdd}
      >
        <div className="space-y-3">
          <label className="block text-xs font-bold uppercase tracking-wide text-[#8d6a55]">
            Kategori Produk
          </label>
          <select
            className="h-11 w-full rounded-xl border border-[#e0d0c4] px-3 text-sm outline-none"
            value={formCategory}
            onChange={(event) => setFormCategory(event.target.value)}
          >
            <option value="">Pilih kategori</option>
            {categoryOptions.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-3">
          <label className="block text-xs font-bold uppercase tracking-wide text-[#8d6a55]">
            Nama Add-On
          </label>
          <input
            className="h-11 w-full rounded-xl border border-[#e0d0c4] px-3 text-sm outline-none"
            value={formLabel}
            onChange={(event) => {
              setFormLabel(event.target.value);
              if (!formId) {
                setFormId(normalizeId(event.target.value));
              }
            }}
            placeholder="Contoh: Dark Color"
          />
        </div>

        <div className="space-y-3">
          <label className="block text-xs font-bold uppercase tracking-wide text-[#8d6a55]">
            ID
          </label>
          <input
            className="h-11 w-full rounded-xl border border-[#e0d0c4] px-3 text-sm outline-none"
            value={formId}
            onChange={(event) => setFormId(event.target.value)}
            placeholder="dark-color"
          />
        </div>

        <div className="space-y-3">
          <label className="block text-xs font-bold uppercase tracking-wide text-[#8d6a55]">
            Harga
          </label>
          <input
            type="number"
            min={0}
            className="h-11 w-full rounded-xl border border-[#e0d0c4] px-3 text-sm outline-none"
            value={formPrice}
            onChange={(event) =>
              setFormPrice(Math.max(0, Number(event.target.value) || 0))
            }
          />
        </div>
        <div className="space-y-3">
          <label className="block text-xs font-bold uppercase tracking-wide text-[#8d6a55]">
            COGS / HPP
          </label>
          <input
            type="number"
            min={0}
            className="h-11 w-full rounded-xl border border-[#e0d0c4] px-3 text-sm outline-none"
            value={formCogs}
            onChange={(event) =>
              setFormCogs(Math.max(0, Number(event.target.value) || 0))
            }
          />
        </div>
      </AddOnModal>

      <AddOnModal
        mode="edit"
        open={Boolean(editRow)}
        title={editRow ? `Edit ${editRow.label}` : "Edit Add-On"}
        error={modalError}
        onClose={() => {
          setEditRow(null);
          setModalError(null);
        }}
        onSubmit={handlePriceUpdate}
      >
        <div className="rounded-2xl border border-[#ead8cb] bg-[#fff8f3] px-4 py-3">
          <p className="text-sm font-bold text-[#1e120a]">
            {editRow?.categories.join(", ")}
          </p>
          <p className="mt-1 text-xs text-[#b89080]">
            ID: {editRow?.id} · Tipe: {editRow ? inferAddOnType(editRow) : "-"}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-3">
            <label className="block text-xs font-bold uppercase tracking-wide text-[#8d6a55]">
              Harga Baru
            </label>
            <input
              type="number"
              min={0}
              className="h-11 w-full rounded-xl border border-[#e0d0c4] px-3 text-sm outline-none"
              value={formPrice}
              onChange={(event) =>
                setFormPrice(Math.max(0, Number(event.target.value) || 0))
              }
            />
          </div>
          <div className="space-y-3">
            <label className="block text-xs font-bold uppercase tracking-wide text-[#8d6a55]">
              COGS / HPP
            </label>
            <input
              type="number"
              min={0}
              className="h-11 w-full rounded-xl border border-[#e0d0c4] px-3 text-sm outline-none"
              value={formCogs}
              onChange={(event) =>
                setFormCogs(Math.max(0, Number(event.target.value) || 0))
              }
            />
          </div>
        </div>
      </AddOnModal>
    </div>
  );
}
