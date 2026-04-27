"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Edit3,
  Sparkles,
  Tag,
  Trash2,
} from "lucide-react";
import type { ProductDraft } from "@/types/product";
import ConfirmDeleteModal from "./ConfirmDeleteModal";

interface Props {
  draft: ProductDraft;
  index: number;
  onChange: (updated: ProductDraft) => void;
  onRemove: () => void;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(value);

export default function ProductDraftCard({
  draft,
  index,
  onChange,
  onRemove,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);

  const cogs = Number(draft.cogs || 0);
  const margin =
    draft.sellingPrice > 0
      ? Math.round(((draft.sellingPrice - cogs) / draft.sellingPrice) * 100)
      : 0;

  return (
    <>
      <ConfirmDeleteModal
        open={pendingDelete}
        title="Hapus produk ini?"
        description={`"${draft.name || `Produk ${index + 1}`}" akan dihapus dari daftar.`}
        onConfirm={() => {
          setPendingDelete(false);
          onRemove();
        }}
        onCancel={() => setPendingDelete(false)}
      />

      <div
        className={`rounded-2xl border bg-white shadow transition-all ${
          draft.aiGenerated ? "border-indigo-200" : "border-gray-200"
        }`}
      >
        <div className="flex items-center gap-4 rounded-t-2xl px-5 py-4">
          <div className="min-w-0 flex-1">
            {editing ? (
              <input
                autoFocus
                value={draft.name}
                onChange={(event) =>
                  onChange({ ...draft, name: event.target.value })
                }
                onBlur={() => setEditing(false)}
                className="w-full rounded-lg border border-indigo-300 px-3 py-1 text-lg font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-400"
              />
            ) : (
              <div className="flex items-center gap-2">
                <h3 className="truncate text-lg font-bold text-slate-800">
                  {draft.name || `Produk ${index + 1}`}
                </h3>
                {draft.aiGenerated && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-600">
                    <Sparkles size={10} /> AI
                  </span>
                )}
              </div>
            )}

            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                <Tag size={10} />
                {draft.categoryName || "Uncategorised"}
              </span>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...draft,
                    productType:
                      draft.productType === "ReadyStock"
                        ? "PreOrder"
                        : "ReadyStock",
                  })
                }
                className={`inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors ${
                  draft.productType === "ReadyStock"
                    ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                    : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                }`}
                title="Klik untuk ganti tipe produk"
              >
                {draft.productType === "ReadyStock"
                  ? "Ready Stock"
                  : "Made to Order"}
              </button>
              <span className="text-sm font-semibold text-indigo-700">
                {formatCurrency(draft.sellingPrice)}
              </span>
              <span className="text-xs text-gray-400">
                COGS {cogs > 0 ? formatCurrency(cogs) : "-"}
              </span>
              {draft.sellingPrice > 0 && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                    margin >= 50
                      ? "bg-green-100 text-green-700"
                      : margin >= 20
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-red-100 text-red-600"
                  }`}
                >
                  {margin}% margin
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-full p-2 text-indigo-500 transition hover:bg-indigo-50"
              title="Edit nama"
            >
              <Edit3 size={16} />
            </button>
            <button
              type="button"
              onClick={() => setPendingDelete(true)}
              className="rounded-full p-2 text-red-500 transition hover:bg-red-50"
              title="Hapus produk ini"
            >
              <Trash2 size={16} />
            </button>
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100"
              title={expanded ? "Sembunyikan detail" : "Edit detail"}
            >
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>
        </div>

        {expanded && (
          <div className="space-y-4 rounded-b-2xl border-t border-gray-100 bg-indigo-50/30 px-5 py-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Kategori
                </label>
                <input
                  value={draft.categoryName}
                  onChange={(event) =>
                    onChange({ ...draft, categoryName: event.target.value })
                  }
                  placeholder="cth. Minuman"
                  className="mt-1 w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Harga Jual (Rp)
                </label>
                <input
                  type="number"
                  min={0}
                  value={draft.sellingPrice}
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      sellingPrice: Number(event.target.value),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  COGS / HPP (Rp)
                </label>
                <input
                  type="number"
                  min={1}
                  value={draft.cogs ?? 0}
                  onChange={(event) =>
                    onChange({ ...draft, cogs: Number(event.target.value) })
                  }
                  className="mt-1 w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Tipe Produk
              </label>
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  onClick={() => onChange({ ...draft, productType: "PreOrder" })}
                  className={`flex-1 rounded-lg border-2 px-3 py-2 text-xs font-semibold transition-all ${
                    draft.productType !== "ReadyStock"
                      ? "border-blue-400 bg-blue-50 text-blue-700"
                      : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                  }`}
                >
                  Made to Order
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChange({ ...draft, productType: "ReadyStock" })
                  }
                  className={`flex-1 rounded-lg border-2 px-3 py-2 text-xs font-semibold transition-all ${
                    draft.productType === "ReadyStock"
                      ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                      : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                  }`}
                >
                  Ready Stock
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
