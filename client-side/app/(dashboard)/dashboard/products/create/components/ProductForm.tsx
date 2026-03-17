"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Camera, Plus, Loader2, ChevronDown, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  generateProductByName,
  recommendPrice,
  getIngredientOptions,
  getCategoryOptions,
  createProduct,
  deleteIngredient,
  patchIngredient,
  type IngredientOption,
} from "@/lib/api/products";
import type { DraftRecipeRow } from "@/types/product";
import IngredientSelectorRow from "./IngredientSelectorRow";
import RecipePhotoModal from "./RecipePhotoModal";

const emptyRow = (index: number): DraftRecipeRow => ({
  ingredientId: -(index + 1),
  ingredientName: "",
  unit: "",
  quantity: 1,
  costPerUnit: null,
  isNew: true, // blank rows are "new" — give full edit access
});

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(v);

interface Props {
  /** Pre-populated data from "Generate from name" on the drafts list */
  initialDraft?: {
    name?: string;
    categoryName?: string;
    sellingPrice?: number;
    recipe?: DraftRecipeRow[];
  };
  onSuccess?: () => void;
}

export default function ProductForm({ initialDraft, onSuccess }: Props) {
  const router = useRouter();

  // ── form state ─────────────────────────────────────────────────────────
  const [name, setName] = useState(initialDraft?.name ?? "");
  const [categoryName, setCategoryName] = useState(initialDraft?.categoryName ?? "");
  const [sellingPrice, setSellingPrice] = useState<number>(initialDraft?.sellingPrice ?? 0);
  const [productType, setProductType] = useState<"ReadyStock" | "PreOrder">("PreOrder");
  const [recipe, setRecipe] = useState<DraftRecipeRow[]>(
    initialDraft?.recipe?.length ? initialDraft.recipe : [emptyRow(0)],
  );

  // ── option lists ────────────────────────────────────────────────────────
  const [ingredientOptions, setIngredientOptions] = useState<IngredientOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<{ id: number; name: string }[]>([]);
  const [categoryOpen, setCategoryOpen] = useState(false);

  useEffect(() => {
    getIngredientOptions()
      .then(setIngredientOptions)
      .catch(() => {});
    getCategoryOptions()
      .then(setCategoryOptions)
      .catch(() => {});
  }, []);

  // ── loading / feedback states ───────────────────────────────────────────
  const [aiNameLoading, setAiNameLoading] = useState(false);
  const [aiPriceLoading, setAiPriceLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [recipePhotoOpen, setRecipePhotoOpen] = useState(false);
  const [priceHint, setPriceHint] = useState<string | null>(null);

  // ── computed: recipe cost ───────────────────────────────────────────────
  const recipeCost = useMemo(() => recipe.reduce((s, r) => s + r.quantity * (r.costPerUnit ?? 0), 0), [recipe]);

  const margin = sellingPrice > 0 ? Math.round(((sellingPrice - recipeCost) / sellingPrice) * 100) : 0;

  // ── AI: generate from name ──────────────────────────────────────────────
  const handleGenerateFromName = async () => {
    if (!name.trim()) return;
    setAiNameLoading(true);
    setError(null);
    try {
      const result = await generateProductByName(name.trim());
      if (result.data) {
        const d = result.data;
        if (d.categoryName) setCategoryName(d.categoryName);
        if (d.sellingPrice) setSellingPrice(d.sellingPrice);
        if (d.productType) setProductType(d.productType === "ReadyStock" ? "ReadyStock" : "PreOrder");
        if (d.recipe?.length) {
          setRecipe(
            d.recipe.map(
              (r: {
                ingredientId: number;
                ingredientName: string;
                unit: string;
                quantity: number;
                costPerUnit: number | null;
                isNew?: boolean;
                expirationDate?: string;
              }) => ({
                ingredientId: r.ingredientId,
                ingredientName: r.ingredientName,
                unit: r.unit,
                quantity: r.quantity,
                costPerUnit: r.costPerUnit,
                isNew: r.isNew ?? false,
                ...(r.expirationDate ? { expirationDate: r.expirationDate } : {}),
              }),
            ),
          );
        }
        // Refresh ingredient options (new ones may have been created)
        getIngredientOptions()
          .then(setIngredientOptions)
          .catch(() => {});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal generate produk dengan AI");
    } finally {
      setAiNameLoading(false);
    }
  };

  // ── AI: recommend price ─────────────────────────────────────────────────
  const handleRecommendPrice = async () => {
    setAiPriceLoading(true);
    setError(null);
    setPriceHint(null);
    try {
      const result = await recommendPrice({
        recipeCost,
        categoryName: categoryName || undefined,
        productName: name || undefined,
      });
      setSellingPrice(result.recommendedPrice);
      setPriceHint(`${result.reasoning} (margin ~${result.margin.toFixed(0)}%)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mendapatkan rekomendasi harga");
    } finally {
      setAiPriceLoading(false);
    }
  };

  // ── Recipe helpers ──────────────────────────────────────────────────────
  const updateRow = useCallback(
    (index: number, updated: DraftRecipeRow) => setRecipe((prev) => prev.map((r, i) => (i === index ? updated : r))),
    [],
  );

  const removeRow = useCallback(
    async (index: number) => {
      const row = recipe[index];
      // If the row was AI-created (isNew + positive DB id), delete from DB
      if (row?.isNew && row.ingredientId > 0) {
        try {
          await deleteIngredient(row.ingredientId);
          // Refresh options since ingredient was deleted
          getIngredientOptions()
            .then(setIngredientOptions)
            .catch(() => {});
        } catch {
          // Non-critical — still remove from form even if API delete fails
        }
      }
      setRecipe((prev) => prev.filter((_, i) => i !== index));
    },
    [recipe],
  );

  const addRow = () => setRecipe((prev) => [...prev, emptyRow(prev.length)]);

  const handleRecipeFromPhoto = (rows: DraftRecipeRow[]) => {
    setRecipe(rows);
    setRecipePhotoOpen(false);
    // Re-fetch ingredients in case new ones were created
    getIngredientOptions()
      .then(setIngredientOptions)
      .catch(() => {});
  };

  // ── Validation ──────────────────────────────────────────────────────────
  const [submitted, setSubmitted] = useState(false);

  /** Returns true if the row is a new ingredient that still needs unit/cost filled in. */
  const rowNeedsUnit = (r: DraftRecipeRow) =>
    (r.isNew === true || r.ingredientId < 0) && !!r.ingredientName?.trim() && !r.unit?.trim();
  const rowNeedsCost = (r: DraftRecipeRow) =>
    (r.isNew === true || r.ingredientId < 0) && !!r.ingredientName?.trim() && r.costPerUnit == null;

  const validate = () => {
    if (!name.trim()) return "Nama produk wajib diisi.";
    if (!categoryName.trim()) return "Kategori wajib diisi.";
    if (!sellingPrice || sellingPrice <= 0) return "Harga jual harus lebih dari 0.";
    const hasInvalid = recipe.some((r) => !r.ingredientName.trim() || r.quantity <= 0);
    if (recipe.length > 0 && hasInvalid) return "Setiap bahan membutuhkan nama dan jumlah yang valid.";
    if (recipe.some(rowNeedsUnit)) return "Beberapa bahan baru belum memiliki satuan.";
    if (recipe.some(rowNeedsCost)) return "Beberapa bahan baru belum memiliki biaya per satuan.";
    return null;
  };

  // ── Submit ──────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // PATCH any AI-created new ingredients that have optional stock/expiry set
      const newWithExtras = recipe.filter(
        (r) => r.isNew && r.ingredientId > 0 && (r.initialStock !== undefined || r.expirationDate),
      );
      if (newWithExtras.length > 0) {
        await Promise.allSettled(
          newWithExtras.map((r) =>
            patchIngredient(r.ingredientId, {
              ...(r.initialStock !== undefined ? { initialStock: r.initialStock } : {}),
              ...(r.expirationDate ? { expirationDate: r.expirationDate } : {}),
            }),
          ),
        );
      }

      // Build recipe payload — skip rows with empty or negative (new-but-unresolved) ids
      const recipePayload = recipe
        .filter((r) => r.ingredientId > 0 && r.ingredientName.trim())
        .map((r) => ({ ingredientId: r.ingredientId, quantity: r.quantity }));

      await createProduct({
        name: name.trim(),
        categoryName: categoryName.trim(),
        sellingPrice,
        productType,
        recipe: recipePayload,
      });

      setSuccess(true);
      if (onSuccess) {
        onSuccess();
      } else {
        setTimeout(() => router.push("/dashboard/products"), 1200);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat produk");
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-green-600">
        <CheckCircle2 size={56} />
        <p className="text-xl font-bold">Produk tersimpan!</p>
        <p className="text-sm text-gray-500">Mengalihkan ke daftar produk…</p>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 text-red-600 rounded-xl p-4 text-sm">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Product name ─ */}
      <div className="bg-white rounded-2xl shadow border border-gray-100 p-6 space-y-2">
        <label className="text-sm font-bold text-gray-700">Nama Produk</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="cth. Es Kopi Susu"
            className="flex-1 border border-indigo-200 rounded-xl px-4 py-2.5 text-base text-slate-700 bg-white focus:ring-2 focus:ring-indigo-400 outline-none"
          />
          <button
            type="button"
            onClick={handleGenerateFromName}
            disabled={!name.trim() || aiNameLoading}
            title="Isi otomatis kategori, harga & resep berdasarkan nama produk"
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {aiNameLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            <span className="hidden sm:inline">Isi Otomatis</span>
          </button>
        </div>
        <p className="text-xs text-gray-400">
          Klik &quot;Isi Otomatis&quot; untuk mengisi kategori, harga, dan resep secara otomatis.
        </p>
      </div>

      {/* ── Category + Selling Price ─ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Category */}
        <div className="bg-white rounded-2xl shadow border border-gray-100 p-5 space-y-2 relative">
          <label className="text-sm font-bold text-gray-700">Kategori</label>
          <div className="flex gap-2">
            <input
              value={categoryName}
              onChange={(e) => {
                setCategoryName(e.target.value);
                setCategoryOpen(true);
              }}
              onFocus={() => setCategoryOpen(true)}
              onBlur={() => setTimeout(() => setCategoryOpen(false), 150)}
              placeholder="cth. Minuman"
              className="flex-1 border border-indigo-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 font-medium focus:ring-2 focus:ring-indigo-400 outline-none"
            />
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setCategoryOpen((v) => !v);
              }}
              className="px-3 text-gray-500 hover:text-indigo-600"
            >
              <ChevronDown size={16} />
            </button>
          </div>
          {categoryOpen && categoryOptions.length > 0 && (
            <ul className="absolute z-30 mt-1 bg-white border border-indigo-100 rounded-xl shadow-xl max-h-36 overflow-y-auto text-sm w-[calc(100%-2rem)]">
              {categoryOptions
                .filter((c) => c.name.toLowerCase().includes(categoryName.toLowerCase()))
                .map((c) => (
                  <li
                    key={c.id}
                    onMouseDown={() => {
                      setCategoryName(c.name);
                      setCategoryOpen(false);
                    }}
                    className="px-4 py-2 text-gray-800 font-medium hover:bg-indigo-50 cursor-pointer"
                  >
                    {c.name}
                  </li>
                ))}
            </ul>
          )}
        </div>

        {/* Selling price */}
        <div className="bg-white rounded-2xl shadow border border-gray-100 p-5 space-y-2">
          <label className="text-sm font-bold text-gray-700">Harga Jual (Rp)</label>
          <div className="flex flex-wrap gap-2">
            <input
              type="number"
              min={0}
              value={sellingPrice}
              onChange={(e) => {
                setSellingPrice(Number(e.target.value));
                setPriceHint(null);
              }}
              placeholder="0"
              className="flex-1 min-w-0 border border-indigo-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 bg-white focus:ring-2 focus:ring-indigo-400 outline-none"
            />
            <button
              type="button"
              onClick={handleRecommendPrice}
              disabled={aiPriceLoading || recipeCost === 0}
              title={
                recipeCost === 0
                  ? "Tambahkan bahan ke resep terlebih dahulu"
                  : "Sarankan harga jual berdasarkan total biaya resep"
              }
              className="flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-2.5 bg-violet-600 text-white text-xs font-semibold rounded-xl hover:bg-violet-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {aiPriceLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Sarankan Harga
            </button>
          </div>
          {priceHint && <p className="text-xs text-violet-600 mt-1">{priceHint}</p>}
          {sellingPrice > 0 && recipeCost > 0 && (
            <>
              <p className="text-xs text-gray-400">
                Biaya: {formatCurrency(recipeCost)} — Margin:{" "}
                <span
                  className={
                    margin < 0
                      ? "text-red-700 font-semibold"
                      : margin >= 50
                        ? "text-green-600 font-semibold"
                        : margin >= 20
                          ? "text-yellow-600 font-semibold"
                          : "text-red-600 font-semibold"
                  }
                >
                  {margin}%
                </span>
              </p>
              {margin < -100 && (
                <div className="flex items-start gap-1.5 bg-orange-50 text-orange-700 rounded-lg px-3 py-2 mt-1 text-xs font-semibold">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  Margin sangat negatif (&lt;−100%). Cek ulang satuan atau biaya bahan — kemungkinan ada kesalahan
                  input.
                </div>
              )}
              {margin >= -100 && margin < 0 && (
                <div className="flex items-start gap-1.5 bg-red-50 text-red-700 rounded-lg px-3 py-2 mt-1 text-xs font-semibold">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  Biaya resep melebihi harga jual — produk ini akan dijual rugi.
                </div>
              )}
            </>
          )}
        </div>

        {/* Product Type selector */}
        <div className="bg-white rounded-2xl shadow border border-gray-100 p-5 space-y-3">
          <label className="text-sm font-bold text-gray-700">Tipe Produk</label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setProductType("PreOrder")}
              className={`flex-1 py-3 px-4 rounded-xl border-2 text-sm font-semibold transition-all ${
                productType === "PreOrder"
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                  : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
              }`}
            >
              <div className="text-lg mb-1">🍳</div>
              <div>Made to Order</div>
              <div className="text-[10px] font-normal mt-1 text-gray-400">Bahan dikurangi saat dijual</div>
            </button>
            <button
              type="button"
              onClick={() => setProductType("ReadyStock")}
              className={`flex-1 py-3 px-4 rounded-xl border-2 text-sm font-semibold transition-all ${
                productType === "ReadyStock"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
              }`}
            >
              <div className="text-lg mb-1">📦</div>
              <div>Ready Stock</div>
              <div className="text-[10px] font-normal mt-1 text-gray-400">Bahan dikurangi saat produksi</div>
            </button>
          </div>
          {productType === "ReadyStock" && (
            <p className="text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">
              💡 Produk Ready Stock membutuhkan proses produksi terlebih dahulu di menu <strong>Produksi</strong>{" "}
              sebelum bisa dijual di POS.
            </p>
          )}
        </div>
      </div>

      {/* ── Recipe section ─ */}
      <div className="bg-white rounded-2xl shadow border border-gray-100">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-linear-to-r from-indigo-50 to-violet-50 rounded-t-2xl">
          <div>
            <h3 className="font-bold text-indigo-700">Resep / Bahan</h3>
            {recipeCost > 0 && (
              <p className="text-xs text-gray-500 mt-0.5">Total biaya: {formatCurrency(recipeCost)}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setRecipePhotoOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 border border-indigo-300 text-indigo-600 text-xs font-semibold rounded-xl hover:bg-indigo-50 transition"
          >
            <Camera size={14} />
            Dari Foto
          </button>
        </div>

        {/* Hint */}
        <p className="px-4 py-2.5 bg-indigo-50/60 border-b border-indigo-100/60 text-xs text-indigo-600">
          Pilih dari daftar atau ketik nama baru untuk membuat bahan sekaligus.
        </p>

        {/* Column headers */}
        <div className="hidden sm:grid grid-cols-12 gap-2 px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wide bg-gray-50/60 border-b border-gray-100">
          <div className="col-span-4">Bahan</div>
          <div className="col-span-2">Qty</div>
          <div className="col-span-2">Satuan</div>
          <div className="col-span-2">Biaya / satuan</div>
        </div>

        <div className="divide-y divide-gray-50 px-3 py-2 space-y-1">
          {recipe.map((row, i) => (
            <IngredientSelectorRow
              key={`${row.ingredientId}-${i}`}
              row={row}
              index={i}
              ingredientOptions={ingredientOptions}
              usedIngredientIds={
                new Set(recipe.filter((r, j) => j !== i && r.ingredientId > 0).map((r) => r.ingredientId))
              }
              unitError={submitted && rowNeedsUnit(row)}
              costError={submitted && rowNeedsCost(row)}
              onChange={(updated) => updateRow(i, updated)}
              onRemove={() => removeRow(i)}
            />
          ))}
        </div>

        <div className="px-6 pb-5 pt-3">
          <button
            type="button"
            onClick={addRow}
            className="flex items-center gap-2 text-indigo-600 text-sm font-semibold hover:text-indigo-800 transition"
          >
            <Plus size={16} />
            Tambah Bahan
          </button>
        </div>
      </div>

      {/* ── Submit ─ */}
      <div className="flex justify-stretch sm:justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-3 bg-indigo-600 text-white font-bold text-base rounded-xl hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
        >
          {submitting ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Menyimpan…
            </>
          ) : (
            "Konfirmasi & Simpan"
          )}
        </button>
      </div>

      {recipePhotoOpen && (
        <RecipePhotoModal
          productName={name || undefined}
          onClose={() => setRecipePhotoOpen(false)}
          onSuccess={handleRecipeFromPhoto}
        />
      )}
    </form>
  );
}
