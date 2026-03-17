"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, ChevronDown, ChevronUp, Lock, Check } from "lucide-react";
import type { DraftRecipeRow } from "@/types/product";
import type { IngredientOption } from "@/lib/api/products";
import ConfirmDeleteModal from "./ConfirmDeleteModal";

/**
 * Determines whether the row is "new" — either AI-generated (positive id, isNew true)
 * or typed-but-not-yet-saved (negative id).
 * New rows go through a two-phase flow:
 *   1. "naming"  — name input + dropdown visible; pick or type an ingredient name
 *   2. "editing" — name locked (no dropdown), unit + cost/unit editable, Confirm button visible
 * Confirming transitions to "confirmed" (visually identical to existing rows).
 */
function isNewRow(row: DraftRecipeRow) {
  return row.isNew === true || row.ingredientId < 0;
}

interface Props {
  row: DraftRecipeRow;
  index: number;
  ingredientOptions: IngredientOption[];
  /** IDs of ingredients already used in OTHER rows — excluded from dropdown. */
  usedIngredientIds?: Set<number>;
  onChange: (updated: DraftRecipeRow) => void;
  /** Called when user clicks delete.
   *  ProductForm decides whether to also call the DELETE API. */
  onRemove: () => void;
  /**
   * Called when the user confirms the unit / cost-per-unit values.
   * For AI-generated rows with a real DB id this is a good place to PATCH the ingredient.
   */
  onConfirm?: (confirmedRow: DraftRecipeRow) => void;
  /** Highlight the unit field as invalid (set by parent on submit). */
  unitError?: boolean;
  /** Highlight the cost/unit field as invalid (set by parent on submit). */
  costError?: boolean;
  /**
   * When true this is an AI-generated new ingredient that is managed in the
   * central "New Ingredients" panel.  The row renders read-only with a NEW badge
   * so the user edits it centrally rather than per-product.
   */
  managedCentrally?: boolean;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(value);

export default function IngredientSelectorRow({
  row,
  index,
  ingredientOptions,
  usedIngredientIds,
  onChange,
  onRemove,
  onConfirm,
  unitError,
  costError,
  managedCentrally,
}: Props) {
  const isNew = isNewRow(row);

  /**
   * Two local states for new rows:
   *  phase          — "naming" (dropdown visible) | "editing" (dropdown hidden, confirm shown)
   *  localConfirmed — true once the user clicks ✓; row becomes read-only like existing rows
   *
   * Rows that already have a name (e.g. AI-generated) skip straight to "editing".
   */
  const [phase, setPhase] = useState<"naming" | "editing">(() => {
    if (!isNew) return "naming"; // doesn't matter for existing rows
    return row.ingredientName?.trim() ? "editing" : "naming";
  });
  const [localConfirmed, setLocalConfirmed] = useState(false);
  // Tracks whether the user has clicked Done at least once (drives inline errors)
  const [rowTouched, setRowTouched] = useState(false);
  // Controls the optional initial-stock / expiry-date panel
  const [expanded, setExpanded] = useState(true);
  // Confirmation modal before deleting
  const [pendingDelete, setPendingDelete] = useState(false);

  // Name-search state — only used during "naming" phase
  const [query, setQuery] = useState(row.ingredientName ?? "");
  const [open, setOpen] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter by search query AND exclude ingredients already used in other rows
  const filtered = ingredientOptions.filter(
    (opt) => opt.name.toLowerCase().includes(query.toLowerCase()) && !usedIngredientIds?.has(opt.id),
  );

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (opt: IngredientOption) => {
    // Block if already used in another row
    if (usedIngredientIds?.has(opt.id)) {
      setDuplicateWarning(true);
      setTimeout(() => setDuplicateWarning(false), 2000);
      setOpen(false);
      return;
    }
    setDuplicateWarning(false);
    onChange({
      ...row,
      ingredientId: opt.id,
      ingredientName: opt.name,
      unit: opt.unit,
      costPerUnit: opt.costPerUnit,
      isNew: false,
    });
    setQuery(opt.name);
    setOpen(false);
    // Selecting from dropdown → move to editing phase so user can review unit/cost
    setPhase("editing");
  };

  const handleNameBlur = () => {
    if (!isNew || phase !== "naming") return;
    const match = ingredientOptions.find((o) => o.name.toLowerCase() === query.toLowerCase());
    if (match) {
      handleSelect(match);
    } else if (query.trim()) {
      onChange({
        ...row,
        ingredientId: -(index + 1),
        ingredientName: query.trim(),
        isNew: true,
      });
      setPhase("editing");
    }
    setOpen(false);
  };

  const handleConfirm = () => {
    setRowTouched(true);
    const unitMissing = !row.unit?.trim();
    const costMissing = row.costPerUnit == null;
    if (unitMissing || costMissing) return; // stay in editing phase
    setLocalConfirmed(true);
    onConfirm?.(row);
  };

  const subtotal = row.quantity * (row.costPerUnit ?? 0);
  const willDeleteFromDB = isNew && row.ingredientId > 0;

  // Centrally-managed rows (AI-new, positive ID) are always read-only inside the product card.
  // The user edits them exclusively in the top "New Ingredients" panel.
  const readOnly = !isNew || localConfirmed || managedCentrally === true;
  // Whether we're in the unit/cost-edit phase (new, named, but not yet confirmed, NOT centrally managed)
  const inEditPhase = isNew && !localConfirmed && phase === "editing" && !managedCentrally;

  return (
    <div
      className={`rounded-xl border transition ${
        managedCentrally
          ? "bg-indigo-50/40 border-indigo-200 hover:border-indigo-300"
          : inEditPhase || (isNew && !localConfirmed)
            ? "bg-amber-50/40 border-amber-200 hover:border-amber-300"
            : "bg-white border-gray-100 hover:border-indigo-200"
      }`}
    >
      <div className="flex flex-col sm:grid sm:grid-cols-12 gap-2 items-start py-3 px-3">
        {/* ── Name (full on mobile, col 4 on sm+) ───────────────────── */}
        <div className="w-full sm:col-span-4 relative" ref={containerRef}>
          {readOnly ? (
            /* Confirmed / existing ingredient — read-only name.
             Centrally-managed AI-new rows show an "AI NEW" badge instead of a lock. */
            <div className="flex items-center gap-1.5 py-1.5">
              {managedCentrally ? (
                <span className="inline-flex items-center text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-bold leading-none shrink-0">
                  AI NEW
                </span>
              ) : (
                <Lock size={11} className="text-gray-300 shrink-0" />
              )}
              <span className="text-sm font-semibold text-gray-900 truncate leading-tight">{row.ingredientName}</span>
            </div>
          ) : inEditPhase ? (
            /* Edit phase — plain text input (no dropdown), NEW badge below */
            <>
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  onChange({ ...row, ingredientName: e.target.value });
                }}
                placeholder="Nama bahan"
                className="w-full border border-amber-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 font-medium focus:ring-2 focus:ring-amber-400 outline-none bg-white"
              />
              <span className="inline-flex items-center mt-1 text-[10px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-bold leading-none">
                New
              </span>
            </>
          ) : (
            /* Naming phase — name input + dropdown */
            <>
              <div className="flex items-center gap-1">
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setOpen(true);
                    onChange({ ...row, ingredientName: e.target.value });
                  }}
                  onFocus={() => setOpen(true)}
                  onBlur={handleNameBlur}
                  placeholder="Nama bahan"
                  className="w-full border border-amber-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 font-medium focus:ring-2 focus:ring-amber-400 outline-none bg-white"
                />
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setOpen((v) => !v);
                  }}
                  className="p-1.5 text-gray-500 hover:text-amber-600 shrink-0"
                >
                  <ChevronDown size={13} />
                </button>
              </div>
              {duplicateWarning ? (
                <span className="inline-flex items-center mt-1 text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold leading-none">
                  Sudah ada dalam resep
                </span>
              ) : (
                <span className="inline-flex items-center mt-1 text-[10px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-bold leading-none">
                  New
                </span>
              )}

              {open && (
                <ul className="absolute z-30 top-full mt-1 w-full bg-white border border-amber-100 rounded-xl shadow-xl max-h-48 overflow-y-auto text-sm">
                  {filtered.length === 0 ? (
                    <li className="px-3 py-2 text-gray-400 italic">
                      &quot;{query}&quot; — akan dibuat sebagai bahan baru
                    </li>
                  ) : (
                    filtered.map((opt) => (
                      <li
                        key={opt.id}
                        onMouseDown={() => handleSelect(opt)}
                        className="flex justify-between items-center px-3 py-2 hover:bg-amber-50 cursor-pointer"
                      >
                        <span className="font-semibold text-gray-900">{opt.name}</span>
                        <span className="text-xs text-gray-500 font-medium">{opt.unit}</span>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </>
          )}
        </div>

        {/* ══ EDIT PHASE: stacked mobile layout ══ */}
        {inEditPhase ? (
          <div className="w-full sm:contents">
            {/* Qty + Unit side by side */}
            <div className="grid grid-cols-2 gap-2 sm:contents">
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1 sm:hidden">
                  Jumlah
                </label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={row.quantity}
                  onChange={(e) => onChange({ ...row, quantity: Number(e.target.value) })}
                  placeholder="Qty"
                  className="w-full border border-indigo-200 rounded-lg px-3 py-2 text-sm text-gray-900 font-medium bg-white focus:ring-2 focus:ring-indigo-400 outline-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1 sm:hidden">
                  Satuan
                </label>
                <input
                  value={row.unit}
                  onChange={(e) => onChange({ ...row, unit: e.target.value })}
                  placeholder="cth. kg, pcs"
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none bg-white ${
                    (rowTouched || unitError) && !row.unit?.trim()
                      ? "border-red-400 focus:ring-red-300"
                      : "border-amber-300 focus:ring-amber-400"
                  } text-gray-900 font-medium`}
                />
                {(rowTouched || unitError) && !row.unit?.trim() && (
                  <p className="text-[10px] text-red-500 font-semibold mt-0.5">Wajib diisi</p>
                )}
              </div>
            </div>

            {/* Cost — full width on mobile */}
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1 sm:hidden">
                Biaya / Satuan (Rp)
              </label>
              <input
                type="number"
                min={0}
                value={row.costPerUnit ?? ""}
                onChange={(e) =>
                  onChange({ ...row, costPerUnit: e.target.value === "" ? null : Number(e.target.value) })
                }
                placeholder="0"
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none bg-white ${
                  (rowTouched || costError) && row.costPerUnit == null
                    ? "border-red-400 focus:ring-red-300"
                    : "border-amber-300 focus:ring-amber-400"
                } text-gray-900 font-medium`}
              />
              {(rowTouched || costError) && row.costPerUnit == null && (
                <p className="text-[10px] text-red-500 font-semibold mt-0.5">Wajib diisi</p>
              )}
            </div>

            {/* Selesai + expand + delete */}
            <div className="sm:col-span-2 flex items-center gap-2">
              <button
                type="button"
                onClick={handleConfirm}
                title="Konfirmasi satuan & biaya"
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-lg transition"
              >
                <Check size={14} />
                Selesai
              </button>
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                title={expanded ? "Sembunyikan field opsional" : "Atur stok awal & kadaluarsa"}
                className="p-2 rounded-lg text-amber-500 hover:text-amber-700 hover:bg-amber-100 transition"
              >
                {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
              <button
                type="button"
                onClick={() => setPendingDelete(true)}
                title={willDeleteFromDB ? "Hapus bahan AI ini dari database" : "Hapus dari resep"}
                className="p-2 rounded-lg text-red-300 hover:text-red-600 hover:bg-red-50 transition"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ) : (
          /* ══ READ-ONLY / CONFIRMED phase ══ */
          <div className="flex sm:contents items-center gap-2 w-full">
            <div className="flex-1 sm:col-span-2">
              <input
                type="number"
                min={0}
                step="any"
                value={row.quantity}
                onChange={(e) => onChange({ ...row, quantity: Number(e.target.value) })}
                placeholder="Qty"
                className="w-full border border-indigo-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 font-medium bg-white focus:ring-2 focus:ring-indigo-400 outline-none"
              />
            </div>

            <div className="flex-1 sm:col-span-2">
              <div className="py-1.5">
                <span className="text-sm text-gray-800 font-semibold">{row.unit || "—"}</span>
              </div>
            </div>

            <div className="flex-1 sm:col-span-2">
              <div className="py-1.5">
                <span className="text-xs text-indigo-600 font-semibold">
                  {row.costPerUnit != null && row.costPerUnit > 0 ? formatCurrency(row.costPerUnit) : "—"}
                </span>
              </div>
            </div>

            <div className="flex-1 sm:col-span-2 flex items-center justify-between gap-1 py-1.5">
              <span className={`text-xs font-bold truncate ${subtotal > 0 ? "text-indigo-700" : "text-gray-300"}`}>
                {subtotal > 0 ? formatCurrency(subtotal) : "—"}
              </span>
              <button
                type="button"
                onClick={() => setPendingDelete(true)}
                title={willDeleteFromDB ? "Hapus bahan AI ini dari database" : "Hapus dari resep"}
                className={`p-1.5 rounded-full transition shrink-0 ${
                  willDeleteFromDB
                    ? "hover:bg-red-100 text-red-400 hover:text-red-600"
                    : "hover:bg-red-50 text-red-300 hover:text-red-500"
                }`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Expandable: Initial stock & Expiry date (only in edit phase) ── */}
      <ConfirmDeleteModal
        open={pendingDelete}
        title="Hapus bahan ini?"
        description={
          row.ingredientName
            ? `"${row.ingredientName}" akan dihapus dari resep${willDeleteFromDB ? " dan database bahan" : ""}.`
            : willDeleteFromDB
              ? "Bahan ini akan dihapus dari resep dan database."
              : "Bahan ini akan dihapus dari resep."
        }
        confirmLabel={willDeleteFromDB ? "Hapus dari Database" : "Hapus"}
        onConfirm={() => {
          setPendingDelete(false);
          onRemove();
        }}
        onCancel={() => setPendingDelete(false)}
      />

      {inEditPhase && expanded && (
        <div className="grid grid-cols-2 gap-3 px-3 pb-3 pt-0">
          {/* Qty on-hand */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Stok Awal</label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                step="any"
                value={row.initialStock ?? ""}
                onChange={(e) =>
                  onChange({
                    ...row,
                    initialStock: e.target.value === "" ? undefined : Number(e.target.value),
                  })
                }
                placeholder={`0${row.unit ? ` ${row.unit}` : ""}`}
                className="w-full border border-amber-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:ring-2 focus:ring-amber-400 outline-none bg-white"
              />
              {row.unit && <span className="text-xs text-gray-400 shrink-0">{row.unit}</span>}
            </div>
          </div>

          {/* Expiry date */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">
              Tgl Kadaluarsa
            </label>
            <input
              type="date"
              value={row.expirationDate ?? ""}
              onChange={(e) =>
                onChange({
                  ...row,
                  expirationDate: e.target.value || undefined,
                })
              }
              className="w-full border border-amber-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-amber-400 outline-none bg-white text-slate-700"
            />
          </div>
        </div>
      )}
    </div>
  );
}
