"use client";

import { useCallback, useState } from "react";
import { ChefHat, Sparkles, Trash2, ChevronDown, ChevronUp, Edit3, Tag, Plus } from "lucide-react";
import type { ProductDraft, DraftRecipeRow } from "@/types/product";
import type { IngredientOption } from "@/lib/api/products";
import { deleteIngredient, createIngredient } from "@/lib/api/products";
import IngredientSelectorRow from "./IngredientSelectorRow";
import ConfirmDeleteModal from "./ConfirmDeleteModal";

interface Props {
  draft: ProductDraft;
  index: number;
  ingredientOptions: IngredientOption[];
  onChange: (updated: ProductDraft) => void;
  onRemove: () => void;
  /** Called whenever a manually-typed new ingredient is confirmed and saved to DB */
  onIngredientCreated?: (option: IngredientOption) => void;
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
  ingredientOptions,
  onChange,
  onRemove,
  onIngredientCreated,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);

  const recipeCost = draft.recipe.reduce((sum, r) => sum + r.quantity * (r.costPerUnit ?? 0), 0);

  const margin =
    draft.sellingPrice > 0 ? Math.round(((draft.sellingPrice - recipeCost) / draft.sellingPrice) * 100) : 0;

  const updateRow = (rowIndex: number, updated: DraftRecipeRow) =>
    onChange({ ...draft, recipe: draft.recipe.map((r, i) => (i === rowIndex ? updated : r)) });

  const removeRow = useCallback(
    async (rowIndex: number) => {
      const row = draft.recipe[rowIndex];
      // AI-created ingredient (isNew + positive DB id) 竊・delete from DB
      if (row?.isNew && row.ingredientId > 0) {
        try {
          await deleteIngredient(row.ingredientId);
        } catch {
          // non-critical 窶・still remove from recipe
        }
      }
      onChange({ ...draft, recipe: draft.recipe.filter((_, i) => i !== rowIndex) });
    },
    [draft, onChange],
  );

  const addRow = () => {
    const newRow: DraftRecipeRow = {
      ingredientId: -(draft.recipe.length + 1),
      ingredientName: "",
      unit: "",
      quantity: 1,
      costPerUnit: null,
      isNew: true,
    };
    onChange({ ...draft, recipe: [...draft.recipe, newRow] });
  };

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
        className={`bg-white rounded-2xl shadow border ${
          draft.aiGenerated ? "border-indigo-200" : "border-gray-200"
        } transition-all`}
      >
        {/* Card Header */}
        <div className="flex items-center gap-4 px-5 py-4 rounded-t-2xl">
          <div className="flex-1 min-w-0">
            {editing ? (
              <input
                autoFocus
                value={draft.name}
                onChange={(e) => onChange({ ...draft, name: e.target.value })}
                onBlur={() => setEditing(false)}
                className="w-full border border-indigo-300 rounded-lg px-3 py-1 text-lg font-bold text-slate-800 focus:ring-2 focus:ring-indigo-400 outline-none"
              />
            ) : (
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-800 truncate">{draft.name || `Product ${index + 1}`}</h3>
                {draft.aiGenerated && (
                  <span className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-600 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                    <Sparkles size={10} /> AI
                  </span>
                )}
              </div>
            )}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-700 text-xs font-medium px-2 py-0.5 rounded-full">
                <Tag size={10} />
                {draft.categoryName || "Uncategorised"}
              </span>
              {/* Product Type Badge (clickable to toggle) */}
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...draft,
                    productType: draft.productType === "ReadyStock" ? "PreOrder" : "ReadyStock",
                  })
                }
                className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full cursor-pointer transition-colors ${
                  draft.productType === "ReadyStock"
                    ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                    : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                }`}
                title="Klik untuk ganti tipe produk"
              >
                {draft.productType === "ReadyStock" ? "📦 Ready Stock" : "🍳 Made to Order"}
              </button>
              <span className="text-indigo-700 font-semibold text-sm">{formatCurrency(draft.sellingPrice)}</span>
              <span className="text-gray-400 text-xs">cost {recipeCost > 0 ? formatCurrency(recipeCost) : "—"}</span>
              {draft.sellingPrice > 0 && (
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-full ${
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

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setEditing(true)}
              className="p-2 rounded-full hover:bg-indigo-50 text-indigo-500 transition"
              title="Edit name"
            >
              <Edit3 size={16} />
            </button>
            <button
              onClick={() => setPendingDelete(true)}
              className="p-2 rounded-full hover:bg-red-50 text-red-500 transition"
              title="Hapus produk ini"
            >
              <Trash2 size={16} />
            </button>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition"
              title={expanded ? "Collapse" : "Expand recipe"}
            >
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>
        </div>

        {/* Expanded edit panel */}
        {expanded && (
          <div className="border-t border-gray-100 px-5 py-4 space-y-4 bg-indigo-50/30 rounded-b-2xl">
            {/* Category + Selling Price */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</label>
                <input
                  value={draft.categoryName}
                  onChange={(e) => onChange({ ...draft, categoryName: e.target.value })}
                  placeholder="e.g. Minuman"
                  className="mt-1 w-full border border-indigo-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:ring-2 focus:ring-indigo-400 outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Selling Price (Rp)
                </label>
                <input
                  type="number"
                  min={0}
                  value={draft.sellingPrice}
                  onChange={(e) => onChange({ ...draft, sellingPrice: Number(e.target.value) })}
                  className="mt-1 w-full border border-indigo-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:ring-2 focus:ring-indigo-400 outline-none"
                />
              </div>
            </div>

            {/* Product Type */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipe Produk</label>
              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => onChange({ ...draft, productType: "PreOrder" })}
                  className={`flex-1 py-2 px-3 rounded-lg border-2 text-xs font-semibold transition-all ${
                    draft.productType !== "ReadyStock"
                      ? "border-blue-400 bg-blue-50 text-blue-700"
                      : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                  }`}
                >
                  🍳 Made to Order
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ ...draft, productType: "ReadyStock" })}
                  className={`flex-1 py-2 px-3 rounded-lg border-2 text-xs font-semibold transition-all ${
                    draft.productType === "ReadyStock"
                      ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                      : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                  }`}
                >
                  📦 Ready Stock
                </button>
              </div>
            </div>

            {/* Recipe editor */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <ChefHat size={14} className="text-indigo-400" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Recipe ({draft.recipe.length} ingredient{draft.recipe.length !== 1 ? "s" : ""})
                </span>
              </div>

              {draft.recipe.length > 0 && (
                <div className="space-y-2 mb-3">
                  {/* Column headers */}
                  <div className="grid grid-cols-12 gap-2 px-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                    <div className="col-span-4">Ingredient</div>
                    <div className="col-span-2">Qty</div>
                    <div className="col-span-2">Unit</div>
                    <div className="col-span-2">Cost/unit</div>
                    <div className="col-span-2">Subtotal</div>
                  </div>
                  {draft.recipe.map((row, i) => (
                    <IngredientSelectorRow
                      key={`${draft._clientId}-${row.ingredientId}-${i}`}
                      row={row}
                      index={i}
                      ingredientOptions={ingredientOptions}
                      usedIngredientIds={
                        new Set(draft.recipe.filter((r, j) => j !== i && r.ingredientId > 0).map((r) => r.ingredientId))
                      }
                      onChange={(updated) => updateRow(i, updated)}
                      onRemove={() => removeRow(i)}
                      // Manually-typed new ingredient (negative id): save to DB on confirm
                      onConfirm={
                        row.isNew && row.ingredientId < 0
                          ? async (confirmedRow) => {
                              try {
                                const created = await createIngredient({
                                  name: confirmedRow.ingredientName,
                                  unit: confirmedRow.unit,
                                  costPerUnit: confirmedRow.costPerUnit ?? 0,
                                  ...(confirmedRow.initialStock !== undefined
                                    ? { initialStock: confirmedRow.initialStock }
                                    : {}),
                                  ...(confirmedRow.expirationDate
                                    ? { expirationDate: confirmedRow.expirationDate }
                                    : {}),
                                });
                                // Update row immediately with real DB id so it's included in the final save
                                updateRow(i, {
                                  ...confirmedRow,
                                  ingredientId: created.id,
                                  isNew: false,
                                });
                                // Add to the shared options pool so all other draft cards can pick it
                                onIngredientCreated?.({
                                  id: created.id,
                                  name: created.name,
                                  unit: created.unit,
                                  costPerUnit: confirmedRow.costPerUnit ?? null,
                                  currentStock: confirmedRow.initialStock ?? 0,
                                });
                              } catch {
                                // Non-critical: row stays locally confirmed; real id needed for save
                              }
                            }
                          : undefined
                      }
                      // AI-created new ingredients (positive ID) are managed in the central
                      // "New Ingredients" panel at the top of the page — disable per-row editing.
                      managedCentrally={row.isNew === true && row.ingredientId > 0}
                    />
                  ))}
                </div>
              )}

              {draft.recipe.length === 0 && <p className="text-xs text-gray-400 italic mb-3">No ingredients yet.</p>}

              <button
                type="button"
                onClick={addRow}
                className="flex items-center gap-1.5 text-xs text-indigo-600 font-semibold hover:text-indigo-800 transition"
              >
                <Plus size={13} />
                Add Ingredient
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
