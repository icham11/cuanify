"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Plus,
  Loader2,
  CheckCircle2,
  Sparkles,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { useBusiness } from "@/context/BusinessContext";
import PhotoUploadModal from "./components/PhotoUploadModal";
import ProductForm from "./components/ProductForm";
import ProductDraftCard from "./components/ProductDraftCard";
import { createBulkProducts, getIngredientOptions, deleteIngredient, patchIngredient } from "@/lib/api/products";
import type { IngredientOption } from "@/lib/api/products";
import type { ProductDraft, DraftRecipeRow } from "@/types/product";

type Mode = "idle" | "bulk-drafts" | "manual";

// ── Tracks a new ingredient in the local bulk-edit buffer ──────────────────
type LocalNewIng = DraftRecipeRow & {
  _originalName: string;
  /** Optional initial stock to set on the placeholder batch when confirmed */
  initialStock?: number;
  /** Optional ISO date string (YYYY-MM-DD) for the batch expiration */
  expirationDate?: string;
};

// ── Single row inside the bulk new-ingredients editor ─────────────────────
function NewIngredientEditRow({
  ingredient,
  touched,
  confirmed,
  onChange,
  onDelete,
}: {
  ingredient: LocalNewIng;
  touched: boolean;
  confirmed: boolean;
  onChange: (patch: Partial<LocalNewIng>) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const nameErr = touched && !ingredient.ingredientName.trim();
  const unitErr = touched && !ingredient.unit?.trim();
  const costErr = touched && ingredient.costPerUnit == null;
  const hasError = nameErr || unitErr || costErr;

  return (
    <div
      className={`rounded-xl border transition ${
        confirmed
          ? "bg-green-50 border-green-200"
          : hasError
            ? "bg-red-50/40 border-red-200"
            : "bg-white border-amber-100"
      }`}
    >
      {/* ── Main row: Name / Unit / Cost / status+toggle ── */}
      <div className="px-3 py-2.5 flex flex-col sm:grid sm:grid-cols-12 gap-2 sm:items-start">
        {/* Name + mobile actions (inline on mobile only) */}
        <div className="flex gap-2 items-start sm:contents">
          <div className="flex-1 min-w-0 sm:col-span-5">
            <input
              value={ingredient.ingredientName}
              onChange={(e) => onChange({ ingredientName: e.target.value })}
              placeholder="Nama bahan"
              className={`w-full border rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 focus:ring-2 outline-none bg-white ${
                nameErr ? "border-red-400 focus:ring-red-300" : "border-amber-200 focus:ring-amber-400"
              }`}
            />
            {nameErr && <p className="text-[10px] text-red-500 mt-0.5 pl-1">Wajib diisi</p>}
          </div>
          {/* Actions — mobile only (inline right of name) */}
          <div className="sm:hidden flex items-center gap-1 pt-1">
            {confirmed ? (
              <CheckCircle2 size={14} className="text-green-500 shrink-0" />
            ) : touched && hasError ? (
              <AlertTriangle size={14} className="text-red-400 shrink-0" />
            ) : null}
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? "Sembunyikan" : "Stok awal & kadaluarsa"}
              className="p-1 rounded text-amber-500 hover:text-amber-700 hover:bg-amber-50 transition"
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            <button
              type="button"
              onClick={onDelete}
              title="Hapus bahan ini"
              className="p-1 rounded text-red-300 hover:text-red-600 hover:bg-red-50 transition"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Unit + Cost — side by side on mobile via grid-cols-2 */}
        <div className="grid grid-cols-2 gap-2 sm:contents">
          <div className="sm:col-span-3">
            <input
              value={ingredient.unit ?? ""}
              onChange={(e) => onChange({ unit: e.target.value })}
              placeholder="e.g. kg"
              className={`w-full border rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:ring-2 outline-none bg-white ${
                unitErr ? "border-red-400 focus:ring-red-300" : "border-amber-200 focus:ring-amber-400"
              }`}
            />
            {unitErr && <p className="text-[10px] text-red-500 mt-0.5 pl-1">Wajib diisi</p>}
          </div>

          <div className="sm:col-span-3">
            <input
              type="number"
              min={0}
              value={ingredient.costPerUnit ?? ""}
              onChange={(e) => onChange({ costPerUnit: e.target.value === "" ? null : Number(e.target.value) })}
              placeholder="0"
              className={`w-full border rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:ring-2 outline-none bg-white ${
                costErr ? "border-red-400 focus:ring-red-300" : "border-amber-200 focus:ring-amber-400"
              }`}
            />
            {costErr && <p className="text-[10px] text-red-500 mt-0.5 pl-1">Wajib diisi</p>}
          </div>
        </div>

        {/* Status indicator + expand toggle + delete — desktop only */}
        <div className="hidden sm:flex sm:col-span-1 flex-col items-center justify-start pt-1 gap-1">
          {confirmed ? (
            <CheckCircle2 size={14} className="text-green-500 shrink-0" />
          ) : touched && hasError ? (
            <AlertTriangle size={14} className="text-red-400 shrink-0" />
          ) : null}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "Sembunyikan" : "Stok awal & kadaluarsa"}
            className="p-0.5 rounded text-amber-500 hover:text-amber-700 hover:bg-amber-50 transition"
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Hapus bahan ini"
            className="p-0.5 rounded text-red-300 hover:text-red-600 hover:bg-red-50 transition"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* ── Expandable: Initial stock & Expiry date ── */}
      {expanded && (
        <div className="grid grid-cols-2 gap-3 px-3 pb-3 pt-0">
          {/* Qty on-hand */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Stok Awal</label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                step="any"
                value={ingredient.initialStock ?? ""}
                onChange={(e) => onChange({ initialStock: e.target.value === "" ? undefined : Number(e.target.value) })}
                placeholder={`0${ingredient.unit ? ` ${ingredient.unit}` : ""}`}
                className="w-full border border-amber-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:ring-2 focus:ring-amber-400 outline-none bg-white"
              />
              {ingredient.unit && <span className="text-xs text-gray-400 shrink-0">{ingredient.unit}</span>}
            </div>
          </div>

          {/* Expiry date */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">
              Tgl Kadaluarsa
            </label>
            <input
              type="date"
              value={ingredient.expirationDate ?? ""}
              onChange={(e) => onChange({ expirationDate: e.target.value || undefined })}
              className="w-full border border-amber-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-amber-400 outline-none bg-white text-slate-700"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function CreateProductsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { business, loading: bizLoading } = useBusiness();
  const prefilledName = (searchParams.get("name") ?? "").trim();

  const [mode, setMode] = useState<Mode>("idle");
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [drafts, setDrafts] = useState<ProductDraft[]>([]);
  const [ingredientOptions, setIngredientOptions] = useState<IngredientOption[]>([]);

  useEffect(() => {
    getIngredientOptions()
      .then(setIngredientOptions)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!prefilledName) return;
    setMode("manual");
  }, [prefilledName]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // ── New-ingredient bulk-edit buffer ──────────────────────────────────
  const [localNewIngredients, setLocalNewIngredients] = useState<LocalNewIng[]>([]);
  const [newIngredientsConfirmed, setNewIngredientsConfirmed] = useState(false);
  const [newIngredientsTouched, setNewIngredientsTouched] = useState(false);
  const [confirmingIngredients, setConfirmingIngredients] = useState(false);

  // ── New-ingredient aggregation (isNew + AI-created rows across all drafts) ──────────
  const newIngredients = useMemo(() => {
    if (mode !== "bulk-drafts") return [];
    const seen = new Map<string, DraftRecipeRow>();
    drafts.forEach((draft) => {
      draft.recipe.forEach((row) => {
        // Only AI-created new ingredients have a positive ingredientId (saved in DB).
        // Manually-added rows use negative IDs and are handled per-row with the "Done" button.
        if (row.isNew && row.ingredientId > 0) {
          const key = row.ingredientName.trim().toLowerCase();
          if (!seen.has(key)) seen.set(key, { ...row });
        }
      });
    });
    return Array.from(seen.values());
  }, [drafts, mode]);

  // Sync newly detected isNew rows (from AI) into the local buffer without overwriting existing edits
  useEffect(() => {
    if (mode !== "bulk-drafts") {
      setLocalNewIngredients([]);
      setNewIngredientsConfirmed(false);
      setNewIngredientsTouched(false);
      return;
    }
    setLocalNewIngredients((prev) => {
      const prevKeys = new Set(prev.map((r) => r._originalName.trim().toLowerCase()));
      const toAdd: LocalNewIng[] = newIngredients
        .filter((ing) => !prevKeys.has(ing.ingredientName.trim().toLowerCase()))
        .map((ing) => ({ ...ing, _originalName: ing.ingredientName }));
      if (toAdd.length === 0) return prev;
      setNewIngredientsConfirmed(false); // new entries appeared → must re-confirm

      // Also inject AI-created ingredients into the dropdown so draft cards can select them
      setIngredientOptions((prevOpts) => {
        const existingIds = new Set(prevOpts.map((o) => o.id));
        const newOpts = toAdd
          .filter((ing) => ing.ingredientId > 0 && !existingIds.has(ing.ingredientId))
          .map((ing) => ({
            id: ing.ingredientId,
            name: ing.ingredientName,
            unit: ing.unit ?? "",
            costPerUnit: ing.costPerUnit ?? null,
            currentStock: -1,
          }));
        return newOpts.length > 0 ? [...prevOpts, ...newOpts] : prevOpts;
      });

      return [...prev, ...toAdd];
    });
  }, [newIngredients, mode]);

  // ── Bulk submit (from photo-generated drafts) ──────────────────────────
  const handleBulkConfirm = async () => {
    if (!drafts.length) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = drafts.map((d) => ({
        name: d.name,
        categoryName: d.categoryName,
        sellingPrice: d.sellingPrice,
        productType: d.productType ?? "PreOrder",
        recipe: d.recipe
          .filter((r) => r.ingredientId > 0)
          .map((r) => ({ ingredientId: r.ingredientId, quantity: r.quantity })),
      }));
      await createBulkProducts(payload);
      setSuccess(true);
      setTimeout(() => router.push("/dashboard/products"), 1400);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save products";
      setError(msg);
      // Tampilkan toast error berbeda jika ada kata 'duplicate' atau 'sebagian'
      if (msg.toLowerCase().includes("semua")) {
        toast.error(
          "Semua produk yang diupload sudah ada di database (duplikat semua). Tidak ada produk baru yang disimpan.",
        );
      } else if (msg.toLowerCase().includes("sebagian")) {
        toast.error("Beberapa produk sudah ada di database (duplikat sebagian). Produk lain tetap disimpan.");
      } else {
        toast.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ── Discard drafts + delete AI-created ingredients from DB ───────────
  const [discarding, setDiscarding] = useState(false);
  const discardDrafts = async () => {
    // Collect unique ingredient IDs that are isNew and already persisted (positive id)
    const idsToDelete = Array.from(
      new Set(
        drafts
          .flatMap((d) => d.recipe)
          .filter((r) => r.isNew && r.ingredientId > 0)
          .map((r) => r.ingredientId),
      ),
    );
    if (idsToDelete.length > 0) {
      setDiscarding(true);
      await Promise.allSettled(idsToDelete.map((id) => deleteIngredient(id)));
      setDiscarding(false);
    }
    setDrafts([]);
    setLocalNewIngredients([]);
    setNewIngredientsConfirmed(false);
    setNewIngredientsTouched(false);
    setMode("idle");
  };

  // Delete a single new ingredient: remove from local buffer, strip from all draft recipes, delete from DB
  const handleDeleteNewIngredient = async (idx: number) => {
    const ing = localNewIngredients[idx];
    if (!ing) return;

    // Delete from DB if it was already persisted by AI
    if (ing.ingredientId > 0) {
      try {
        await deleteIngredient(ing.ingredientId);
      } catch {
        // Non-critical: still remove from UI
      }
    }

    // Remove from all draft recipes
    const originalKey = ing._originalName.trim().toLowerCase();
    setDrafts((prev) =>
      prev.map((draft) => ({
        ...draft,
        recipe: draft.recipe.filter((row) => !(row.isNew && row.ingredientName.trim().toLowerCase() === originalKey)),
      })),
    );

    // Remove from local buffer
    setLocalNewIngredients((prev) => prev.filter((_, i) => i !== idx));
    setNewIngredientsConfirmed(false);
  };

  // Propagate confirmed local-buffer values back into every matching draft row
  const applyNewIngredientsToDrafts = (local: LocalNewIng[]) => {
    setDrafts((prev) =>
      prev.map((draft) => ({
        ...draft,
        recipe: draft.recipe.map((row) => {
          if (!row.isNew) return row;
          const match = local.find(
            (l) => l._originalName.trim().toLowerCase() === row.ingredientName.trim().toLowerCase(),
          );
          return match
            ? { ...row, ingredientName: match.ingredientName, unit: match.unit, costPerUnit: match.costPerUnit }
            : row;
        }),
      })),
    );
  };

  // Confirm bulk-edit: validate then propagate and persist to DB
  const handleConfirmNewIngredients = async () => {
    setNewIngredientsTouched(true);
    const invalid = localNewIngredients.some(
      (ing) => !ing.ingredientName.trim() || !ing.unit?.trim() || ing.costPerUnit == null,
    );
    if (invalid) return;

    setConfirmingIngredients(true);
    try {
      // Persist name, unit, costPerUnit, initialStock, expirationDate to DB
      await Promise.allSettled(
        localNewIngredients
          .filter((ing) => ing.ingredientId > 0)
          .map((ing) =>
            patchIngredient(ing.ingredientId, {
              name: ing.ingredientName.trim(),
              unit: ing.unit ?? "",
              costPerUnit: ing.costPerUnit ?? 0,
              ...(ing.initialStock !== undefined ? { initialStock: ing.initialStock } : {}),
              ...(ing.expirationDate ? { expirationDate: ing.expirationDate } : {}),
            }),
          ),
      );
    } finally {
      setConfirmingIngredients(false);
    }

    applyNewIngredientsToDrafts(localNewIngredients);

    // Sync confirmed name / unit / cost back into the ingredient options dropdown
    setIngredientOptions((prev) =>
      prev.map((opt) => {
        const match = localNewIngredients.find((l) => l.ingredientId === opt.id);
        if (!match) return opt;
        return {
          ...opt,
          name: match.ingredientName.trim(),
          unit: match.unit ?? opt.unit,
          costPerUnit: match.costPerUnit ?? opt.costPerUnit,
        };
      }),
    );

    setNewIngredientsConfirmed(true);
  };

  // ── Handle draft updates ────────────────────────────────────────────────
  const updateDraft = (index: number, updated: ProductDraft) =>
    setDrafts((prev) => prev.map((d, i) => (i === index ? updated : d)));

  const removeDraft = (index: number) => setDrafts((prev) => prev.filter((_, i) => i !== index));

  const addEmptyDraft = () =>
    setDrafts((prev) => [
      ...prev,
      {
        _clientId: `manual-${Date.now()}`,
        name: "",
        categoryName: "",
        sellingPrice: 0,
        recipe: [],
        aiGenerated: false,
      },
    ]);

  if (bizLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-indigo-500 animate-pulse">
        <Loader2 size={32} className="animate-spin" />
      </div>
    );
  }

  if (!business) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-gray-400 text-lg">Bisnis tidak ditemukan.</div>
    );
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-green-600">
        <CheckCircle2 size={60} />
        <p className="text-2xl font-extrabold">Produk berhasil disimpan!</p>
        <p className="text-sm text-gray-500">Mengalihkan ke daftar produk…</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Back + Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/dashboard/products")}
          className="p-2 rounded-full hover:bg-indigo-50 text-gray-500 hover:text-indigo-600 transition"
        >
          <ChevronLeft size={22} />
        </button>
        <div>
          <h1 className="text-2xl font-extrabold text-indigo-700">Tambah Produk</h1>
          <p className="text-sm text-gray-400 mt-0.5">Pilih cara menambahkan produk baru.</p>
        </div>
      </div>

      {/* ── IDLE: Mode selector ─────────────────────────────────────────── */}
      {mode === "idle" && (
        <div className="space-y-4">
          {/* Option 1: Generate from photo */}
          <button
            onClick={() => setPhotoModalOpen(true)}
            className="w-full flex items-center gap-3 sm:gap-5 p-4 sm:p-6 bg-linear-to-r from-indigo-50 via-white to-indigo-50 rounded-2xl border-2 border-indigo-200 hover:border-indigo-400 shadow hover:shadow-md transition text-left group"
          >
            <span className="flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-2xl bg-indigo-100 text-indigo-600 group-hover:bg-indigo-200 transition">
              <ImageIcon size={24} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-base sm:text-lg font-bold text-indigo-700">Generate Produk dari Foto</p>
              <p className="text-sm text-gray-500 mt-0.5">
                Upload menu atau daftar harga — AI akan mengekstrak semua produk sekaligus.
              </p>
            </div>
            <Sparkles size={20} className="ml-auto shrink-0 text-indigo-300 group-hover:text-indigo-500 transition" />
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 text-gray-300 text-sm font-medium">
            <span className="flex-1 border-t border-gray-200" />
            atau
            <span className="flex-1 border-t border-gray-200" />
          </div>

          {/* Option 2: Manual */}
          <button
            onClick={() => setMode("manual")}
            className="w-full flex items-center gap-3 sm:gap-5 p-4 sm:p-6 bg-white rounded-2xl border-2 border-gray-200 hover:border-indigo-300 shadow hover:shadow-md transition text-left group"
          >
            <span className="flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-2xl bg-gray-100 text-gray-600 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition">
              <Plus size={24} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-base sm:text-lg font-bold text-gray-700 group-hover:text-indigo-700 transition">
                Tambah Produk Satu per Satu
              </p>
              <p className="text-sm text-gray-400 mt-0.5">
                Isi formulir produk dengan bantuan AI untuk nama, harga, dan resep.
              </p>
            </div>
          </button>
        </div>
      )}

      {/* ── BULK DRAFTS: Photo-generated product list ───────────────────── */}
      {mode === "bulk-drafts" && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-slate-800">{drafts.length} produk berhasil digenerate</h2>
              <p className="text-sm text-gray-400">Periksa dan edit setiap produk sebelum menyimpan.</p>
            </div>
            <button
              onClick={discardDrafts}
              disabled={discarding}
              className="text-sm text-gray-400 hover:text-gray-600 underline disabled:opacity-50"
            >
              {discarding ? "Membersihkan…" : "Mulai ulang"}
            </button>
          </div>

          {/* ── NEW INGREDIENTS SECTION ──────────────────────────────── */}
          {localNewIngredients.length > 0 && (
            <div
              className={`border rounded-2xl p-5 space-y-4 transition ${
                newIngredientsConfirmed ? "bg-green-50 border-green-300" : "bg-amber-50 border-amber-200"
              }`}
            >
              {/* Header */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  {newIngredientsConfirmed ? (
                    <CheckCircle2 size={15} className="text-green-500" />
                  ) : (
                    <Sparkles size={15} className="text-amber-500" />
                  )}
                  <h3
                    className={`text-sm font-extrabold uppercase tracking-wide ${
                      newIngredientsConfirmed ? "text-green-800" : "text-amber-800"
                    }`}
                  >
                    Bahan Baru
                  </h3>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      newIngredientsConfirmed ? "bg-green-200 text-green-700" : "bg-amber-200 text-amber-700"
                    }`}
                  >
                    {localNewIngredients.length}
                  </span>
                  {newIngredientsConfirmed && (
                    <span className="text-xs font-semibold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
                      Dikonfirmasi
                    </span>
                  )}
                </div>
                <p className={`text-xs ${newIngredientsConfirmed ? "text-green-600" : "text-amber-600"}`}>
                  {newIngredientsConfirmed
                    ? "Semua bahan baru sudah diatur. Anda masih bisa mengedit dan konfirmasi ulang."
                    : "Isi satuan & biaya untuk setiap bahan baru, lalu konfirmasi sebelum menyimpan."}
                </p>
              </div>

              {/* Column headers - desktop only */}
              <div className="hidden sm:grid grid-cols-12 gap-2 px-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                <div className="col-span-5">Nama</div>
                <div className="col-span-3">Satuan</div>
                <div className="col-span-3">Biaya / Satuan (Rp)</div>
                <div className="col-span-1" />
              </div>

              <div className="space-y-2">
                {localNewIngredients.map((ing, idx) => (
                  <NewIngredientEditRow
                    key={ing._originalName}
                    ingredient={ing}
                    touched={newIngredientsTouched}
                    confirmed={newIngredientsConfirmed}
                    onChange={(patch) => {
                      setLocalNewIngredients((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
                      setNewIngredientsConfirmed(false); // any edit un-confirms
                    }}
                    onDelete={() => handleDeleteNewIngredient(idx)}
                  />
                ))}
              </div>

              {/* Inline validation summary when touched but invalid */}
              {newIngredientsTouched &&
                !newIngredientsConfirmed &&
                !confirmingIngredients &&
                localNewIngredients.some(
                  (ing) => !ing.ingredientName.trim() || !ing.unit?.trim() || ing.costPerUnit == null,
                ) && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                    <AlertTriangle size={14} className="text-red-500 shrink-0" />
                    <p className="text-xs font-semibold text-red-600">
                      Beberapa bahan masih belum lengkap. Perbaiki, lalu klik &ldquo;Konfirmasi Semua&rdquo;.
                    </p>
                  </div>
                )}

              {/* Confirm button */}
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleConfirmNewIngredients}
                  disabled={confirmingIngredients}
                  className={`flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold transition disabled:opacity-60 disabled:cursor-not-allowed ${
                    newIngredientsConfirmed
                      ? "bg-green-100 text-green-700 hover:bg-green-200 border border-green-300"
                      : "bg-amber-500 text-white hover:bg-amber-600 shadow"
                  }`}
                >
                  {confirmingIngredients ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      Menyimpan…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={15} />
                      {newIngredientsConfirmed ? "Konfirmasi Ulang" : "Konfirmasi Semua"}
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {drafts.map((draft, i) => (
              <ProductDraftCard
                key={draft._clientId}
                draft={draft}
                index={i}
                ingredientOptions={ingredientOptions}
                onChange={(updated) => updateDraft(i, updated)}
                onRemove={() => removeDraft(i)}
                onIngredientCreated={(newOpt) =>
                  setIngredientOptions((prev) => (prev.some((o) => o.id === newOpt.id) ? prev : [...prev, newOpt]))
                }
              />
            ))}
          </div>

          <button
            onClick={addEmptyDraft}
            className="flex items-center gap-2 text-sm text-indigo-600 font-semibold hover:text-indigo-800 transition"
          >
            <Plus size={16} />
            Tambah produk lain secara manual
          </button>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 text-red-600 rounded-xl p-4 text-sm">
              <span>{error}</span>
            </div>
          )}

          {/* Warn if new ingredients haven't been confirmed */}
          {localNewIngredients.length > 0 && !newIngredientsConfirmed && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3">
              <AlertTriangle size={15} className="text-amber-500 shrink-0" />
              <p className="text-xs font-semibold text-amber-700">
                Harap konfirmasi bahan baru di atas sebelum menyimpan produk.
              </p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:justify-end gap-2 sm:gap-3 pt-2">
            <button
              onClick={discardDrafts}
              disabled={discarding}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition disabled:opacity-50"
            >
              {discarding ? "Membersihkan…" : "Batal"}
            </button>
            <button
              onClick={handleBulkConfirm}
              disabled={
                submitting ||
                confirmingIngredients ||
                drafts.length === 0 ||
                (localNewIngredients.length > 0 && !newIngredientsConfirmed)
              }
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow"
            >
              {submitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Menyimpan…
                </>
              ) : (
                <>
                  <span className="hidden sm:inline">Konfirmasi &amp; Simpan {drafts.length} Produk</span>
                  <span className="sm:hidden">Simpan {drafts.length} Produk</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── MANUAL: Single product form ────────────────────────────────── */}
      {mode === "manual" && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setMode("idle")} className="text-sm text-indigo-600 font-semibold hover:underline">
              ← Kembali
            </button>
            <h2 className="text-lg font-bold text-slate-700">Produk Baru</h2>
          </div>
          <ProductForm
            initialDraft={
              prefilledName
                ? {
                    name: prefilledName,
                  }
                : undefined
            }
            onSuccess={() => {
              setSuccess(true);
              setTimeout(() => router.push("/dashboard/products"), 1400);
            }}
          />
        </div>
      )}

      {/* Photo upload modal (transitions to bulk-drafts mode on success) */}
      {photoModalOpen && (
        <PhotoUploadModal
          onClose={() => setPhotoModalOpen(false)}
          onSuccess={(generatedDrafts) => {
            setPhotoModalOpen(false);
            setDrafts(generatedDrafts);
            setMode("bulk-drafts");
          }}
        />
      )}
    </div>
  );
}
