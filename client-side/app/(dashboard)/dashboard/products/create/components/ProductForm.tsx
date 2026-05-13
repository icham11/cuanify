"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Sparkles,
} from "lucide-react";
import {
  createProduct,
  generateProductByName,
  getCategoryOptions,
  recommendPrice,
} from "@/lib/api/products";
import type { DraftRecipeRow } from "@/types/product";
import {
  broadcastCatalogAdminState,
  type CatalogAdminState,
  type CustomProductEntry,
} from "@/lib/bookings/catalog-admin";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(value);

interface Props {
  initialDraft?: {
    name?: string;
    categoryName?: string;
    sellingPrice?: number;
    cogs?: number;
    recipe?: DraftRecipeRow[];
  };
  onSuccess?: () => void;
}

const EMPTY_CATALOG_STATE: CatalogAdminState = {
  productVariantPriceOverrides: {},
  addOnPriceOverrides: {},
  addOnCogsOverrides: {},
  inactiveProducts: [],
  inactiveAddOns: [],
  customProducts: [],
  customAddOns: [],
};

function normalizeCatalogState(input: unknown): CatalogAdminState {
  if (!input || typeof input !== "object") return EMPTY_CATALOG_STATE;
  const record = input as Partial<CatalogAdminState>;

  const customProducts = Array.isArray(record.customProducts)
    ? record.customProducts
        .filter(
          (entry): entry is CustomProductEntry =>
            Boolean(entry) &&
            typeof entry === "object" &&
            typeof (entry as CustomProductEntry).category === "string" &&
            typeof (entry as CustomProductEntry).subcategory === "string" &&
            typeof (entry as CustomProductEntry).productName === "string" &&
            typeof (entry as CustomProductEntry).variantLabel === "string",
        )
        .map((entry) => ({
          category: entry.category,
          subcategory: entry.subcategory,
          productName: entry.productName,
          variantLabel: entry.variantLabel,
          price: Math.max(0, Math.round(Number(entry.price || 0))),
        }))
    : [];

  const customAddOns = Array.isArray(record.customAddOns)
    ? record.customAddOns.filter(
        (entry): entry is CatalogAdminState["customAddOns"][number] =>
          Boolean(entry) &&
          typeof entry === "object" &&
          typeof entry.category === "string" &&
          typeof entry.id === "string" &&
          typeof entry.label === "string",
      )
    : [];

  return {
    productVariantPriceOverrides: record.productVariantPriceOverrides ?? {},
    addOnPriceOverrides: record.addOnPriceOverrides ?? {},
    addOnCogsOverrides: record.addOnCogsOverrides ?? {},
    inactiveProducts: Array.isArray(record.inactiveProducts)
      ? record.inactiveProducts
      : [],
    inactiveAddOns: Array.isArray(record.inactiveAddOns)
      ? record.inactiveAddOns
      : [],
    customProducts,
    customAddOns,
  };
}

function upsertCustomProduct(
  state: CatalogAdminState,
  entry: CustomProductEntry,
): CatalogAdminState {
  const normalized = {
    category: entry.category.trim(),
    subcategory: entry.subcategory.trim(),
    productName: entry.productName.trim(),
    variantLabel: entry.variantLabel.trim(),
    price: Math.max(0, Math.round(Number(entry.price || 0))),
  };

  if (
    !normalized.category ||
    !normalized.subcategory ||
    !normalized.productName ||
    !normalized.variantLabel
  ) {
    return state;
  }

  const existingIndex = state.customProducts.findIndex(
    (item) =>
      item.category.toLowerCase() === normalized.category.toLowerCase() &&
      item.subcategory.toLowerCase() === normalized.subcategory.toLowerCase() &&
      item.productName.toLowerCase() === normalized.productName.toLowerCase() &&
      item.variantLabel.toLowerCase() === normalized.variantLabel.toLowerCase(),
  );

  if (existingIndex < 0) {
    return {
      ...state,
      customProducts: [...state.customProducts, normalized],
    };
  }

  const nextCustomProducts = [...state.customProducts];
  nextCustomProducts[existingIndex] = normalized;
  return {
    ...state,
    customProducts: nextCustomProducts,
  };
}

async function syncToBookingCatalog(entry: CustomProductEntry): Promise<void> {
  const getResponse = await fetch("/api/bookings/catalog-config", {
    method: "GET",
    cache: "no-store",
  });
  if (!getResponse.ok) {
    const payload = (await getResponse.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(payload.error || "Gagal memuat catalog booking terbaru.");
  }
  const getPayload = (await getResponse.json().catch(() => ({}))) as {
    success?: boolean;
    data?: unknown;
  };
  if (!getPayload.success) {
    throw new Error("Catalog booking tidak bisa dibaca saat proses sinkron.");
  }

  const currentState = normalizeCatalogState(getPayload.data);
  const nextState = upsertCustomProduct(currentState, entry);

  const putResponse = await fetch("/api/bookings/catalog-config", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(nextState),
  });
  const putPayload = (await putResponse.json().catch(() => ({}))) as {
    error?: string;
    productSyncError?: string | null;
  };

  if (!putResponse.ok) {
    throw new Error(
      putPayload.error || "Gagal sinkron produk ke catalog booking.",
    );
  }

  broadcastCatalogAdminState(nextState);

  if (putPayload.productSyncError) {
    throw new Error(
      `Catalog booking tersimpan, tetapi sinkron dashboard product bermasalah: ${putPayload.productSyncError}`,
    );
  }
}

export default function ProductForm({ initialDraft, onSuccess }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialDraft?.name ?? "");
  const [categoryName, setCategoryName] = useState(
    initialDraft?.categoryName ?? "",
  );
  const [sellingPrice, setSellingPrice] = useState<number>(
    initialDraft?.sellingPrice ?? 0,
  );
  const [directCogs, setDirectCogs] = useState<number>(
    initialDraft?.cogs ?? 0,
  );
  const [productType, setProductType] = useState<"ReadyStock" | "PreOrder">(
    "PreOrder",
  );
  const [categoryOptions, setCategoryOptions] = useState<
    { id: number; name: string }[]
  >([]);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [aiNameLoading, setAiNameLoading] = useState(false);
  const [aiPriceLoading, setAiPriceLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [priceHint, setPriceHint] = useState<string | null>(null);
  const [bookingSubcategory, setBookingSubcategory] = useState("General");
  const [bookingVariantLabel, setBookingVariantLabel] = useState("Standard");
  const [catalogSyncWarning, setCatalogSyncWarning] = useState<string | null>(
    null,
  );

  const margin = useMemo(() => {
    if (sellingPrice <= 0 || directCogs <= 0) return 0;
    return Math.round(((sellingPrice - directCogs) / sellingPrice) * 100);
  }, [sellingPrice, directCogs]);

  useEffect(() => {
    getCategoryOptions()
      .then(setCategoryOptions)
      .catch(() => {});
  }, []);

  const validate = () => {
    if (!name.trim()) return "Nama produk wajib diisi.";
    if (!categoryName.trim()) return "Kategori wajib diisi.";
    if (!bookingSubcategory.trim()) return "Sub category booking wajib diisi.";
    if (!bookingVariantLabel.trim()) return "Variant/size booking wajib diisi.";
    if (sellingPrice <= 0) return "Harga jual harus lebih dari 0.";
    if (directCogs <= 0) return "COGS/HPP wajib diisi dan harus lebih dari 0.";
    return null;
  };

  const handleGenerateFromName = async () => {
    if (!name.trim()) return;
    setAiNameLoading(true);
    setError(null);
    try {
      const result = await generateProductByName(name.trim());
      const data = result.data;
      if (!data) return;
      if (data.categoryName) setCategoryName(data.categoryName);
      if (data.sellingPrice) setSellingPrice(Number(data.sellingPrice));
      if (typeof data.cogs === "number") setDirectCogs(data.cogs);
      if (data.productType) {
        setProductType(data.productType === "ReadyStock" ? "ReadyStock" : "PreOrder");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Gagal generate produk dengan AI",
      );
    } finally {
      setAiNameLoading(false);
    }
  };

  const handleRecommendPrice = async () => {
    setAiPriceLoading(true);
    setError(null);
    setPriceHint(null);
    try {
      const result = await recommendPrice({
        cogs: directCogs,
        categoryName: categoryName || undefined,
        productName: name || undefined,
      });
      setSellingPrice(result.recommendedPrice);
      setPriceHint(`${result.reasoning} (margin ~${result.margin.toFixed(0)}%)`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Gagal mendapatkan rekomendasi harga",
      );
    } finally {
      setAiPriceLoading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError(null);
    setCatalogSyncWarning(null);
    try {
      await createProduct({
        name: name.trim(),
        categoryName: categoryName.trim(),
        sellingPrice,
        cogs: directCogs,
        productType,
        recipe: [],
      });

      try {
        await syncToBookingCatalog({
          category: categoryName.trim(),
          subcategory: bookingSubcategory.trim(),
          productName: name.trim(),
          variantLabel: bookingVariantLabel.trim(),
          price: sellingPrice,
        });
      } catch (syncError) {
        setCatalogSyncWarning(
          syncError instanceof Error
            ? syncError.message
            : "Produk tersimpan, tapi sinkron ke booking catalog gagal.",
        );
      }

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
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-green-600">
        <CheckCircle2 size={56} />
        <p className="text-xl font-bold">Produk tersimpan!</p>
        <p className="text-sm text-gray-500">Mengalihkan ke daftar produk...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-600">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {catalogSyncWarning && (
        <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-4 text-sm text-amber-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{catalogSyncWarning}</span>
        </div>
      )}

      <div className="space-y-2 rounded-2xl border border-gray-100 bg-white p-6 shadow">
        <label className="text-sm font-bold text-gray-700">Nama Produk</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="cth. Es Kopi Susu"
            className="flex-1 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-base text-slate-700 outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button
            type="button"
            onClick={handleGenerateFromName}
            disabled={!name.trim() || aiNameLoading}
            title="Isi otomatis kategori, harga, dan COGS berdasarkan nama produk"
            className="flex items-center gap-2 whitespace-nowrap rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {aiNameLoading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Sparkles size={16} />
            )}
            <span className="hidden sm:inline">Isi Otomatis</span>
          </button>
        </div>
        <p className="text-xs text-gray-400">
          COGS/HPP diisi langsung sebagai nominal produk. Tidak perlu membuat
          data bahan untuk menghitung modal.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="relative space-y-2 rounded-2xl border border-gray-100 bg-white p-5 shadow">
          <label className="text-sm font-bold text-gray-700">Kategori</label>
          <div className="flex gap-2">
            <input
              value={categoryName}
              onChange={(event) => {
                setCategoryName(event.target.value);
                setCategoryOpen(true);
              }}
              onFocus={() => setCategoryOpen(true)}
              onBlur={() => setTimeout(() => setCategoryOpen(false), 150)}
              placeholder="cth. Minuman"
              className="flex-1 rounded-xl border border-indigo-200 px-4 py-2.5 text-sm font-medium text-gray-900 outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <button
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                setCategoryOpen((value) => !value);
              }}
              className="px-3 text-gray-500 hover:text-indigo-600"
            >
              <ChevronDown size={16} />
            </button>
          </div>
          {categoryOpen && categoryOptions.length > 0 && (
            <ul className="absolute z-30 mt-1 max-h-36 w-[calc(100%-2rem)] overflow-y-auto rounded-xl border border-indigo-100 bg-white text-sm shadow-xl">
              {categoryOptions
                .filter((category) =>
                  category.name
                    .toLowerCase()
                    .includes(categoryName.toLowerCase()),
                )
                .map((category) => (
                  <li
                    key={category.id}
                    onMouseDown={() => {
                      setCategoryName(category.name);
                      setCategoryOpen(false);
                    }}
                    className="cursor-pointer px-4 py-2 font-medium text-gray-800 hover:bg-indigo-50"
                  >
                    {category.name}
                  </li>
                ))}
            </ul>
          )}
        </div>

        <div className="space-y-2 rounded-2xl border border-gray-100 bg-white p-5 shadow">
          <label className="text-sm font-bold text-gray-700">
            Harga Jual (Rp)
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              type="number"
              min={0}
              value={sellingPrice}
              onChange={(event) => {
                setSellingPrice(Number(event.target.value));
                setPriceHint(null);
              }}
              placeholder="0"
              className="min-w-0 flex-1 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <button
              type="button"
              onClick={handleRecommendPrice}
              disabled={aiPriceLoading || directCogs <= 0}
              title={
                directCogs <= 0
                  ? "Isi COGS/HPP terlebih dahulu"
                  : "Sarankan harga jual berdasarkan COGS/HPP"
              }
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {aiPriceLoading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              Sarankan Harga
            </button>
          </div>
          {priceHint && <p className="mt-1 text-xs text-indigo-600">{priceHint}</p>}
        </div>

        <div className="space-y-2 rounded-2xl border border-gray-100 bg-white p-5 shadow">
          <label className="text-sm font-bold text-gray-700">
            COGS / HPP Produk (Rp)
          </label>
          <input
            type="number"
            min={1}
            value={directCogs}
            onChange={(event) =>
              setDirectCogs(Math.max(0, Number(event.target.value) || 0))
            }
            placeholder="0"
            className="w-full rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <p className="text-xs text-gray-400">
            Masukkan nominal modal langsung per produk, sesuai database atau
            perhitungan internal Anda.
          </p>
        </div>

        <div className="space-y-3 rounded-2xl border border-gray-100 bg-white p-5 shadow">
          <label className="text-sm font-bold text-gray-700">Tipe Produk</label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setProductType("PreOrder")}
              className={`flex-1 rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-all ${
                productType === "PreOrder"
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                  : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
              }`}
            >
              <div>Made to Order</div>
              <div className="mt-1 text-[10px] font-normal text-gray-400">
                Dibuat saat order masuk
              </div>
            </button>
            <button
              type="button"
              onClick={() => setProductType("ReadyStock")}
              className={`flex-1 rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-all ${
                productType === "ReadyStock"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
              }`}
            >
              <div>Ready Stock</div>
              <div className="mt-1 text-[10px] font-normal text-gray-400">
                Stok dibuat lewat produksi
              </div>
            </button>
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border border-gray-100 bg-white p-5 shadow sm:col-span-2">
          <label className="text-sm font-bold text-gray-700">
            Sinkron untuk Booking Catalog
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Sub Category
              </label>
              <input
                type="text"
                value={bookingSubcategory}
                onChange={(event) => setBookingSubcategory(event.target.value)}
                placeholder="cth. Signature Drinks"
                className="w-full rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Variant / Size
              </label>
              <input
                type="text"
                value={bookingVariantLabel}
                onChange={(event) => setBookingVariantLabel(event.target.value)}
                placeholder="cth. Standard"
                className="w-full rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500">
            Setelah simpan produk, item juga otomatis ditambahkan ke Booking
            Catalog dengan mapping:
            {" "}
            <span className="font-semibold">Kategori</span> = nilai field Kategori,
            {" "}
            <span className="font-semibold">Sub Category</span> = field ini,
            {" "}
            <span className="font-semibold">Nama Produk</span> = field Nama Produk,
            {" "}
            <span className="font-semibold">Variant/Size</span> = field ini.
          </p>
        </div>
      </div>

      {sellingPrice > 0 && directCogs > 0 && (
        <div
          className={`rounded-2xl border px-5 py-4 text-sm ${
            margin < 0
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          COGS/HPP: {formatCurrency(directCogs)}. Margin estimasi:{" "}
          <span className="font-bold">{margin}%</span>
          {margin < 0 ? ". COGS lebih besar dari harga jual." : "."}
        </div>
      )}

      <div className="flex justify-stretch sm:justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-8 py-3 text-base font-bold text-white shadow-lg transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {submitting ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Menyimpan...
            </>
          ) : (
            "Konfirmasi & Simpan"
          )}
        </button>
      </div>
    </form>
  );
}
