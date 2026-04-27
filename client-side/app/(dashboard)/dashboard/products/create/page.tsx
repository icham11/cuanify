"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Image as ImageIcon,
  Loader2,
  Plus,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useBusiness } from "@/context/BusinessContext";
import { createBulkProducts } from "@/lib/api/products";
import type { ProductDraft } from "@/types/product";
import PhotoUploadModal from "./components/PhotoUploadModal";
import ProductDraftCard from "./components/ProductDraftCard";
import ProductForm from "./components/ProductForm";

type Mode = "idle" | "bulk-drafts" | "manual";

export default function CreateProductsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { business, loading: businessLoading } = useBusiness();
  const prefilledName = (searchParams.get("name") ?? "").trim();

  const [mode, setMode] = useState<Mode>("idle");
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [drafts, setDrafts] = useState<ProductDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (prefilledName) setMode("manual");
  }, [prefilledName]);

  const resetDrafts = () => {
    setDrafts([]);
    setError(null);
    setMode("idle");
  };

  const updateDraft = (index: number, updated: ProductDraft) => {
    setDrafts((current) =>
      current.map((draft, draftIndex) =>
        draftIndex === index ? updated : draft,
      ),
    );
  };

  const removeDraft = (index: number) => {
    setDrafts((current) =>
      current.filter((_, draftIndex) => draftIndex !== index),
    );
  };

  const addEmptyDraft = () => {
    setDrafts((current) => [
      ...current,
      {
        _clientId: `manual-${Date.now()}`,
        name: "",
        categoryName: "",
        sellingPrice: 0,
        cogs: 0,
        productType: "PreOrder",
        recipe: [],
        aiGenerated: false,
      },
    ]);
  };

  const handleBulkConfirm = async () => {
    if (drafts.length === 0) return;

    const invalidDraft = drafts.find(
      (draft) =>
        !draft.name.trim() ||
        !draft.categoryName.trim() ||
        Number(draft.sellingPrice) <= 0 ||
        Number(draft.cogs) <= 0,
    );

    if (invalidDraft) {
      setError(
        "Semua produk wajib punya nama, kategori, harga jual, dan COGS/HPP lebih dari 0.",
      );
      toast.error("Lengkapi data produk sebelum menyimpan.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await createBulkProducts(
        drafts.map((draft) => ({
          name: draft.name.trim(),
          categoryName: draft.categoryName.trim(),
          sellingPrice: Number(draft.sellingPrice),
          cogs: Number(draft.cogs),
          productType: draft.productType ?? "PreOrder",
          recipe: [],
        })),
      );

      setSuccess(true);
      setTimeout(() => router.push("/dashboard/products"), 1400);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Gagal menyimpan produk";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (businessLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-indigo-500">
        <Loader2 size={32} className="animate-spin" />
      </div>
    );
  }

  if (!business) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-lg text-gray-400">
        Bisnis tidak ditemukan.
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-green-600">
        <CheckCircle2 size={60} />
        <p className="text-2xl font-extrabold">Produk berhasil disimpan!</p>
        <p className="text-sm text-gray-500">Mengalihkan ke daftar produk...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push("/dashboard/products")}
          className="rounded-full p-2 text-gray-500 transition hover:bg-indigo-50 hover:text-indigo-600"
        >
          <ChevronLeft size={22} />
        </button>
        <div>
          <h1 className="text-2xl font-extrabold text-indigo-700">
            Tambah Produk
          </h1>
          <p className="mt-0.5 text-sm text-gray-400">
            COGS/HPP diisi langsung sebagai nominal produk.
          </p>
        </div>
      </div>

      {mode === "idle" && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setPhotoModalOpen(true)}
            className="group flex w-full items-center gap-3 rounded-2xl border-2 border-indigo-200 bg-white p-4 text-left shadow transition hover:border-indigo-400 hover:shadow-md sm:gap-5 sm:p-6"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 transition group-hover:bg-indigo-200 sm:h-14 sm:w-14">
              <ImageIcon size={24} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold text-indigo-700 sm:text-lg">
                Generate Produk dari Foto
              </p>
              <p className="mt-0.5 text-sm text-gray-500">
                Upload menu atau daftar harga. AI akan membuat draft produk,
                lalu Anda isi/cek COGS nominalnya.
              </p>
            </div>
            <Sparkles
              size={20}
              className="ml-auto shrink-0 text-indigo-300 transition group-hover:text-indigo-500"
            />
          </button>

          <div className="flex items-center gap-3 text-sm font-medium text-gray-300">
            <span className="flex-1 border-t border-gray-200" />
            atau
            <span className="flex-1 border-t border-gray-200" />
          </div>

          <button
            type="button"
            onClick={() => setMode("manual")}
            className="group flex w-full items-center gap-3 rounded-2xl border-2 border-gray-200 bg-white p-4 text-left shadow transition hover:border-indigo-300 hover:shadow-md sm:gap-5 sm:p-6"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gray-100 text-gray-600 transition group-hover:bg-indigo-50 group-hover:text-indigo-600 sm:h-14 sm:w-14">
              <Plus size={24} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold text-gray-700 transition group-hover:text-indigo-700 sm:text-lg">
                Tambah Produk Satu per Satu
              </p>
              <p className="mt-0.5 text-sm text-gray-400">
                Isi nama, kategori, harga jual, COGS/HPP, dan tipe produk.
              </p>
            </div>
          </button>
        </div>
      )}

      {mode === "bulk-drafts" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-800">
                {drafts.length} produk berhasil digenerate
              </h2>
              <p className="text-sm text-gray-400">
                Periksa harga dan COGS/HPP sebelum menyimpan.
              </p>
            </div>
            <button
              type="button"
              onClick={resetDrafts}
              className="text-sm text-gray-400 underline hover:text-gray-600"
            >
              Mulai ulang
            </button>
          </div>

          <div className="space-y-3">
            {drafts.map((draft, index) => (
              <ProductDraftCard
                key={draft._clientId}
                draft={draft}
                index={index}
                onChange={(updated) => updateDraft(index, updated)}
                onRemove={() => removeDraft(index)}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={addEmptyDraft}
            className="flex items-center gap-2 text-sm font-semibold text-indigo-600 transition hover:text-indigo-800"
          >
            <Plus size={16} />
            Tambah produk lain secara manual
          </button>

          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-600">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end sm:gap-3">
            <button
              type="button"
              onClick={resetDrafts}
              className="w-full rounded-xl border border-gray-200 px-5 py-2.5 font-semibold text-gray-600 transition hover:bg-gray-50 sm:w-auto"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleBulkConfirm}
              disabled={submitting || drafts.length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 font-bold text-white shadow transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {submitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Menyimpan...
                </>
              ) : (
                `Simpan ${drafts.length} Produk`
              )}
            </button>
          </div>
        </div>
      )}

      {mode === "manual" && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMode("idle")}
              className="text-sm font-semibold text-indigo-600 hover:underline"
            >
              Kembali
            </button>
            <h2 className="text-lg font-bold text-slate-700">Produk Baru</h2>
          </div>
          <ProductForm
            initialDraft={prefilledName ? { name: prefilledName } : undefined}
            onSuccess={() => {
              setSuccess(true);
              setTimeout(() => router.push("/dashboard/products"), 1400);
            }}
          />
        </div>
      )}

      {photoModalOpen && (
        <PhotoUploadModal
          onClose={() => setPhotoModalOpen(false)}
          onSuccess={(generatedDrafts) => {
            setPhotoModalOpen(false);
            setDrafts(
              generatedDrafts.map((draft) => ({
                ...draft,
                recipe: [],
              })),
            );
            setMode("bulk-drafts");
          }}
        />
      )}
    </div>
  );
}
