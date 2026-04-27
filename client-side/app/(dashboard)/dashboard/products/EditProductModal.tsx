import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { EditProductModalProps } from "@/types/product";
import type { DraftRecipeRow } from "@/types/product";
// _clientId is present in ProductDraft, but we use it in DraftRecipeRow for UI keys
type DraftRecipeRowWithClientId = DraftRecipeRow & { _clientId: string };
import IngredientSelectorRow from "../products/create/components/IngredientSelectorRow";
import { getIngredientOptions } from "@/lib/api/products";
import type { IngredientOption } from "@/lib/api/products";
import { Plus, X, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

export default function EditProductModal({ product, categories, onClose, onSaved }: EditProductModalProps) {
  const [name, setName] = useState<string>(product.name);
  const [categoryId, setCategoryId] = useState<number>(product.categoryId ?? categories[0]?.id ?? 0);
  const [sellingPrice, setSellingPrice] = useState<number>(Number(product.sellingPrice));
  const [directCogs, setDirectCogs] = useState<number>(Number(product.cogs || 0));
  const [productType, setProductType] = useState<"ReadyStock" | "PreOrder">(product.productType ?? "PreOrder");
  const [recipe, setRecipe] = useState<DraftRecipeRowWithClientId[]>(() =>
    product.recipes.map((r, idx) => ({
      ingredientId: r.ingredient.id,
      ingredientName: r.ingredient.name,
      unit: r.ingredient.unit,
      quantity: r.quantity,
      costPerUnit: r.ingredient.costPerUnit,
      isNew: false,
      _clientId: `edit-${r.ingredient.id}-${idx}`,
    })),
  );
  const [ingredientOptions, setIngredientOptions] = useState<IngredientOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    getIngredientOptions()
      .then((opts) => setIngredientOptions(opts))
      .catch(() => {});
  }, []);

  const margin = sellingPrice > 0 ? Math.round(((sellingPrice - directCogs) / sellingPrice) * 100) : 0;

  const validate = () => {
    if (!name.trim()) return "Nama produk wajib diisi.";
    if (!categoryId) return "Kategori wajib diisi.";
    if (!sellingPrice || sellingPrice <= 0) return "Harga jual harus lebih dari 0.";
    if (!directCogs || directCogs <= 0) return "COGS/HPP wajib diisi dan harus lebih dari 0.";
    const filledRecipe = recipe.filter((r) => r.ingredientName.trim() || r.ingredientId > 0);
    const hasInvalid = filledRecipe.some((r) => !r.ingredientName.trim() || r.quantity <= 0);
    if (filledRecipe.length > 0 && hasInvalid) return "Setiap bahan membutuhkan nama dan jumlah yang valid.";
    return null;
  };

  const handleSave = async () => {
    setSubmitted(true);
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // PATCH any new ingredients with extra info (optional, for AI/expansion)
      // (removed: initialStock, expirationDate, as not present in DraftRecipeRow)
      // Build recipe payload
      const recipePayload = recipe
        .filter((r) => r.ingredientId > 0 && r.ingredientName.trim())
        .map((r) => ({
          ingredientId: Number(r.ingredientId),
          quantity: Number(r.quantity),
        }));

      const res = await fetch(`/api/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          categoryId: Number(categoryId),
          sellingPrice: Number(sellingPrice),
          cogs: Number(directCogs),
          productType,
          recipe: recipePayload,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Show field-level details if available
        const details = data.details;
        if (details && typeof details === "object") {
          const msgs = Object.entries(details)
            .map(([field, errs]) => `${field}: ${(errs as string[]).join(", ")}`)
            .join("; ");
          throw new Error(msgs || data.error || "Gagal update produk");
        }
        throw new Error(data.error ?? "Gagal update produk");
      }
      onSaved(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal update produk");
    } finally {
      setSaving(false);
    }
  };

  const updateRow = (index: number, updated: DraftRecipeRowWithClientId) =>
    setRecipe((prev) => prev.map((r, i) => (i === index ? updated : r)));
  const removeRow = (index: number) => setRecipe((prev) => prev.filter((_, i) => i !== index));
  const addRow = () =>
    setRecipe((prev) => [
      ...prev,
      {
        ingredientId: -(prev.length + 1),
        ingredientName: "",
        unit: "",
        quantity: 1,
        costPerUnit: null,
        isNew: true,
        _clientId: `edit-new-${prev.length}`,
      },
    ]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
      style={{ zIndex: 200 }}
    >
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-2xl max-h-[85dvh] flex flex-col overflow-hidden">
        {/* Drag handle (mobile only) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-5 border-b border-gray-100 bg-linear-to-r from-yellow-50 to-indigo-50 shrink-0">
          <h2 className="text-base sm:text-lg font-extrabold text-yellow-700">Edit Produk</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 transition">
            <X size={18} />
          </button>
        </div>
        <form
          className="flex-1 overflow-y-auto px-4 sm:px-6 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
        >
          {error && (
            <div className="mb-4 flex items-center gap-2 bg-red-50 text-red-600 rounded-xl p-3 text-xs">
              <AlertTriangle size={14} className="shrink-0" />
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Nama Produk</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-indigo-200 rounded-xl px-4 py-2.5 text-base font-semibold text-slate-700 bg-white focus:ring-2 focus:ring-indigo-400 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Kategori</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(Number(e.target.value))}
                className="w-full border border-indigo-200 rounded-xl px-4 py-2.5 text-base font-semibold text-slate-700 bg-white focus:ring-2 focus:ring-indigo-400 outline-none"
                required
              >
                <option value="">Pilih kategori</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Harga Jual (Rp)</label>
              <input
                type="number"
                min={1}
                value={sellingPrice}
                onChange={(e) => setSellingPrice(Number(e.target.value))}
                className="w-full border border-indigo-200 rounded-xl px-4 py-2.5 text-base font-semibold text-slate-700 bg-white focus:ring-2 focus:ring-indigo-400 outline-none"
                required
              />
              <div className="text-xs text-gray-400 mt-1">
                COGS/HPP:{" "}
                {directCogs > 0
                  ? new Intl.NumberFormat("id-ID", {
                      style: "currency",
                      currency: "IDR",
                      minimumFractionDigits: 0,
                    }).format(directCogs)
                  : "—"}
                {margin !== null && (
                  <>
                    {" — "}
                    <span
                      className={
                        margin >= 50
                          ? "text-green-600 font-semibold"
                          : margin >= 20
                            ? "text-yellow-600 font-semibold"
                            : "text-red-600 font-semibold"
                      }
                    >
                      {margin}% margin
                    </span>
                  </>
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase mb-1">COGS / HPP (Rp)</label>
              <input
                type="number"
                min={1}
                value={directCogs}
                onChange={(e) => setDirectCogs(Math.max(0, Number(e.target.value) || 0))}
                className="w-full border border-indigo-200 rounded-xl px-4 py-2.5 text-base font-semibold text-slate-700 bg-white focus:ring-2 focus:ring-indigo-400 outline-none"
              />
            </div>
          </div>

          {/* Product Type */}
          {false && <div className="mb-4">
            <label className="block text-xs font-bold text-gray-600 uppercase mb-2">Tipe Produk</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setProductType("PreOrder")}
                className={`flex-1 py-2.5 px-3 rounded-xl border-2 text-xs font-semibold transition-all ${
                  productType === "PreOrder"
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                }`}
              >
                🍳 Made to Order
                <div className="text-[9px] font-normal mt-0.5 text-gray-400">Bahan dikurangi saat dijual</div>
              </button>
              <button
                type="button"
                onClick={() => setProductType("ReadyStock")}
                className={`flex-1 py-2.5 px-3 rounded-xl border-2 text-xs font-semibold transition-all ${
                  productType === "ReadyStock"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                }`}
              >
                📦 Ready Stock
                <div className="text-[9px] font-normal mt-0.5 text-gray-400">Bahan dikurangi saat produksi</div>
              </button>
            </div>
          </div>}

          <div className="mb-4">
            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Resep Produk Opsional</label>
            <div className="space-y-2">
              {recipe.map((row, idx) => (
                <IngredientSelectorRow
                  key={row._clientId || row.ingredientId || idx}
                  row={row}
                  index={idx}
                  ingredientOptions={ingredientOptions}
                  usedIngredientIds={new Set(recipe.filter((_, i) => i !== idx).map((r) => r.ingredientId))}
                  onChange={(updated) => updateRow(idx, updated as DraftRecipeRowWithClientId)}
                  onRemove={() => removeRow(idx)}
                  unitError={submitted && (!row.unit || !row.unit.trim())}
                  costError={submitted && row.costPerUnit == null}
                />
              ))}
              <button
                type="button"
                onClick={addRow}
                className="mt-2 px-4 py-2 rounded-xl bg-indigo-50 text-indigo-700 font-semibold text-sm hover:bg-indigo-100 transition"
              >
                <Plus size={16} className="inline mr-1" /> Tambah Bahan
              </button>
            </div>
          </div>
        </form>
        <div className="flex gap-3 px-4 sm:px-6 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition"
            type="button"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-yellow-500 text-white font-bold text-sm rounded-xl hover:bg-yellow-600 transition disabled:opacity-50"
            type="submit"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            Simpan
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

