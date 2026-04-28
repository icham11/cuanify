"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { makeAddOnKey, useCatalogAdminState } from "@/lib/bookings/catalog-admin";

function normalizeId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(value);

export default function AddOnsPage() {
  const { addOnCatalog, setCatalogAdminState } = useCatalogAdminState();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [label, setLabel] = useState("");
  const [id, setId] = useState("");
  const [price, setPrice] = useState(0);

  const rows = useMemo(() => {
    const list = Object.entries(addOnCatalog).flatMap(([group, items]) =>
      items.map((item) => ({ category: group, id: item.id, label: item.label, price: Number(item.price || 0) })),
    );
    const q = search.trim().toLowerCase();
    const filtered = q
      ? list.filter((item) => item.label.toLowerCase().includes(q) || item.id.toLowerCase().includes(q) || item.category.toLowerCase().includes(q))
      : list;
    return filtered.sort((a, b) => a.label.localeCompare(b.label, "id"));
  }, [addOnCatalog, search]);

  const handleAdd = () => {
    const nextCategory = category.trim();
    const nextLabel = label.trim();
    const nextId = normalizeId(id || label);
    if (!nextCategory || !nextLabel || !nextId) return;

    setCatalogAdminState((prev) => {
      const exists = prev.customAddOns.some((entry) => entry.category.toLowerCase() === nextCategory.toLowerCase() && entry.id.toLowerCase() === nextId.toLowerCase());
      const nextCustomAddOns = exists
        ? prev.customAddOns.map((entry) =>
            entry.category.toLowerCase() === nextCategory.toLowerCase() && entry.id.toLowerCase() === nextId.toLowerCase()
              ? { ...entry, label: nextLabel, price: Math.max(0, Math.round(Number(price || 0))) }
              : entry,
          )
        : [...prev.customAddOns, { category: nextCategory, id: nextId, label: nextLabel, price: Math.max(0, Math.round(Number(price || 0))) }];

      const key = makeAddOnKey(nextCategory, nextId);
      return {
        ...prev,
        customAddOns: nextCustomAddOns,
        addOnPriceOverrides: { ...prev.addOnPriceOverrides, [key]: Math.max(0, Math.round(Number(price || 0))) },
        inactiveAddOns: prev.inactiveAddOns.filter((entry) => entry !== key),
      };
    });

    setCategory("");
    setLabel("");
    setId("");
    setPrice(0);
  };

  const handlePriceUpdate = (rowCategory: string, rowId: string, value: number) => {
    const key = makeAddOnKey(rowCategory, rowId);
    setCatalogAdminState((prev) => ({
      ...prev,
      addOnPriceOverrides: { ...prev.addOnPriceOverrides, [key]: Math.max(0, Math.round(Number(value || 0))) },
    }));
  };

  const handleDelete = (rowCategory: string, rowId: string) => {
    const key = makeAddOnKey(rowCategory, rowId);
    setCatalogAdminState((prev) => ({
      ...prev,
      inactiveAddOns: prev.inactiveAddOns.includes(key) ? prev.inactiveAddOns : [...prev.inactiveAddOns, key],
    }));
  };

  return (
    <div className="space-y-6 p-2 sm:p-4">
      <div className="rounded-2xl border border-orange-100 bg-gradient-to-r from-orange-50 to-amber-50 p-4 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">Add on</h1>
            <p className="text-sm text-slate-600">Kelola semua add-on inventory, harga, dan status aktif.</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-orange-700">
            <Sparkles size={14} /> {rows.length} add-on
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-5">
          <input placeholder="Kategori" className="h-10 rounded-xl border border-orange-200 px-3 text-sm" value={category} onChange={(e) => setCategory(e.target.value)} />
          <input placeholder="Nama Add on" className="h-10 rounded-xl border border-orange-200 px-3 text-sm" value={label} onChange={(e) => { setLabel(e.target.value); if (!id) setId(normalizeId(e.target.value)); }} />
          <input placeholder="ID" className="h-10 rounded-xl border border-orange-200 px-3 text-sm" value={id} onChange={(e) => setId(e.target.value)} />
          <input type="number" min={0} placeholder="Harga" className="h-10 rounded-xl border border-orange-200 px-3 text-sm" value={price} onChange={(e) => setPrice(Math.max(0, Number(e.target.value) || 0))} />
          <button onClick={handleAdd} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 text-sm font-bold text-white hover:bg-orange-600">
            <Plus size={16} /> Add on
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-orange-200 px-3">
          <Search size={16} className="text-orange-500" />
          <input placeholder="Cari add-on..." className="h-10 w-full bg-transparent text-sm outline-none" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="bg-orange-50 text-left text-xs uppercase tracking-wide text-orange-700">
                <th className="px-4 py-3">Nama</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3 text-right">Harga</th>
                <th className="px-4 py-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.category}-${row.id}`} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold text-slate-800">{row.label}</td>
                  <td className="px-4 py-3 text-slate-600">{row.category}</td>
                  <td className="px-4 py-3 text-slate-500">{row.id}</td>
                  <td className="px-4 py-3 text-right">
                    <input type="number" min={0} defaultValue={row.price} onBlur={(e) => handlePriceUpdate(row.category, row.id, Number(e.target.value || 0))} className="h-9 w-32 rounded-lg border border-orange-200 px-2 text-right text-sm" />
                    <div className="mt-1 text-xs text-slate-500">{formatCurrency(row.price)}</div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => handleDelete(row.category, row.id)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-red-600 hover:bg-red-50">
                      <Trash2 size={14} /> Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-2 md:hidden">
          {rows.map((row) => (
            <div key={`${row.category}-${row.id}`} className="rounded-xl border border-slate-100 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-slate-800">{row.label}</p>
                  <p className="text-xs text-slate-500">{row.category} � {row.id}</p>
                </div>
                <button onClick={() => handleDelete(row.category, row.id)} className="rounded-lg p-2 text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <input type="number" min={0} defaultValue={row.price} onBlur={(e) => handlePriceUpdate(row.category, row.id, Number(e.target.value || 0))} className="h-9 w-32 rounded-lg border border-orange-200 px-2 text-right text-sm" />
                <span className="text-xs font-semibold text-orange-700">{formatCurrency(row.price)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
