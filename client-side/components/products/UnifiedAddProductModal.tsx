"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createProduct } from "@/lib/api/products";
import type { CatalogAdminState, CustomProductEntry } from "@/lib/bookings/catalog-admin";
import { BOOKING_PRODUCT_CATALOG } from "@/lib/bookings/pricelist";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(value);
}

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

function buildDashboardProductName(args: {
  productName: string;
  variantLabel: string;
  appendVariant: boolean;
}): string {
  const trimmedName = args.productName.trim();
  const trimmedVariant = args.variantLabel.trim();
  if (!trimmedName) return "";
  if (!args.appendVariant) return trimmedName;
  if (!trimmedVariant) return trimmedName;
  if (["standard", "start from"].includes(trimmedVariant.toLowerCase())) {
    return trimmedName;
  }
  return `${trimmedName} - ${trimmedVariant}`;
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
  const getPayload = (await getResponse.json().catch(() => ({}))) as {
    success?: boolean;
    data?: unknown;
  };

  const currentState = normalizeCatalogState(getPayload.data);
  const nextState = upsertCustomProduct(currentState, entry);

  const putResponse = await fetch("/api/bookings/catalog-config", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(nextState),
  });

  if (!putResponse.ok) {
    const payload = (await putResponse.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(payload.error || "Gagal sinkron produk ke catalog booking.");
  }
}

export default function UnifiedAddProductModal({ open, onClose, onSaved }: Props) {
  const defaultProductCategory = "";
  const defaultSubcategory = "";

  const [mounted, setMounted] = useState(false);
  const [productCategory, setProductCategory] = useState(defaultProductCategory);
  const [bookingSubcategory, setBookingSubcategory] = useState(defaultSubcategory);
  const [itemName, setItemName] = useState("");
  const [sellingPrice, setSellingPrice] = useState(0);
  const [directCogs, setDirectCogs] = useState(0);
  const [productionToken, setProductionToken] = useState(0);
  const [manualStock, setManualStock] = useState(0);
  const [bookingVariantLabel, setBookingVariantLabel] = useState("Standard");
  const [appendVariantToDashboardName, setAppendVariantToDashboardName] =
    useState(true);
  const [pendingCatalogSync, setPendingCatalogSync] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalogSyncWarning, setCatalogSyncWarning] = useState<string | null>(null);

  const margin = useMemo(() => {
    if (sellingPrice <= 0 || directCogs <= 0) return 0;
    return Math.round(((sellingPrice - directCogs) / sellingPrice) * 100);
  }, [sellingPrice, directCogs]);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const productCategoryOptions = useMemo(
    () => BOOKING_PRODUCT_CATALOG.map((entry) => entry.category),
    [],
  );

  const subcategoryOptions = useMemo(() => {
    const category = BOOKING_PRODUCT_CATALOG.find(
      (entry) => entry.category === productCategory,
    );
    return category?.subcategories.map((entry) => entry.name) ?? [];
  }, [productCategory]);

  useEffect(() => {
    if (!productCategory.trim()) return;
    if (subcategoryOptions.length === 0) return;
    if (subcategoryOptions.includes(bookingSubcategory)) return;
    setBookingSubcategory(subcategoryOptions[0]);
  }, [subcategoryOptions, bookingSubcategory]);

  const dashboardProductName = useMemo(
    () =>
      buildDashboardProductName({
        productName: itemName,
        variantLabel: bookingVariantLabel,
        appendVariant: appendVariantToDashboardName,
      }),
    [itemName, bookingVariantLabel, appendVariantToDashboardName],
  );

  const resetForm = () => {
    setProductCategory(defaultProductCategory);
    setBookingSubcategory(defaultSubcategory);
    setItemName("");
    setSellingPrice(0);
    setDirectCogs(0);
    setProductionToken(0);
    setManualStock(0);
    setBookingVariantLabel("Standard");
    setAppendVariantToDashboardName(true);
    setPendingCatalogSync(false);
    setError(null);
    setCatalogSyncWarning(null);
  };

  const closeModal = () => {
    if (submitting) return;
    onClose();
  };

  const validate = () => {
    if (!productCategory.trim()) return "Product wajib dipilih.";
    if (!bookingSubcategory.trim()) return "Sub category booking wajib diisi.";
    if (!itemName.trim()) return "Nama item wajib diisi.";
    if (!bookingVariantLabel.trim()) return "Variant/size booking wajib diisi.";
    if (sellingPrice <= 0) return "Harga jual harus lebih dari 0.";
    if (directCogs <= 0) return "COGS/HPP wajib diisi dan harus lebih dari 0.";
    if (!dashboardProductName.trim()) return "Nama produk dashboard belum valid.";
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError(null);
    setCatalogSyncWarning(null);
    try {
      if (!pendingCatalogSync) {
        await createProduct({
          name: dashboardProductName,
          categoryName: bookingSubcategory.trim(),
          sellingPrice,
          cogs: directCogs,
          productionToken,
          manualStock,
          recipe: [],
        });
      }

      try {
        await syncToBookingCatalog({
          category: productCategory.trim(),
          subcategory: bookingSubcategory.trim(),
          productName: itemName.trim(),
          variantLabel: bookingVariantLabel.trim(),
          price: sellingPrice,
        });
      } catch (syncError) {
        setPendingCatalogSync(true);
        const message =
          syncError instanceof Error
            ? syncError.message
            : "Produk tersimpan, tapi sinkron ke booking catalog gagal.";
        setCatalogSyncWarning(`${message} Klik Simpan lagi untuk retry sync catalog.`);
        toast.error("Sync ke booking catalog gagal. Silakan retry.");
        return;
      }

      toast.success("Produk berhasil ditambahkan.");
      onSaved?.();
      resetForm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan produk");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-indigo-100 bg-white shadow-2xl outline-none sm:max-w-3xl sm:rounded-3xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-indigo-100 bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">
                Add Product
              </p>
              <h2 className="text-lg font-extrabold text-slate-900">
                Tambah Product Baru
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Form gabungan Products + Booking Catalog untuk satu alur input.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            onClick={closeModal}
            aria-label="Tutup"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5 sm:px-6">
          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-600">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {catalogSyncWarning && (
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-700">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>{catalogSyncWarning}</span>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-semibold text-slate-700">Product</label>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <Input
                  value={productCategory}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setProductCategory(event.target.value)
                  }
                  placeholder="cth. Cake / Cookies / Minuman"
                />
                <select
                  className="h-10 rounded-xl border border-indigo-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-300"
                  value={productCategoryOptions.includes(productCategory) ? productCategory : ""}
                  onChange={(event) => setProductCategory(event.target.value)}
                >
                  <option value="">Pilih</option>
                  {productCategoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Sub Category</label>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <Input
                  value={bookingSubcategory}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setBookingSubcategory(event.target.value)
                  }
                  placeholder="cth. Event Cookies"
                />
                {subcategoryOptions.length > 0 ? (
                  <select
                    className="h-10 rounded-xl border border-indigo-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-300"
                    value={subcategoryOptions.includes(bookingSubcategory) ? bookingSubcategory : ""}
                    onChange={(event) => setBookingSubcategory(event.target.value)}
                  >
                    <option value="" disabled>
                      Pilih
                    </option>
                    {subcategoryOptions.map((subcategory) => (
                      <option key={subcategory} value={subcategory}>
                        {subcategory}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Harga Jual (Rp)</label>
              <Input
                type="number"
                min={0}
                value={sellingPrice}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setSellingPrice(Number(event.target.value || 0))
                }
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Nama Item</label>
              <Input
                value={itemName}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setItemName(event.target.value)
                }
                placeholder="cth. Lotus Box"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">COGS / HPP (Rp)</label>
              <Input
                type="number"
                min={1}
                value={directCogs}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setDirectCogs(Math.max(0, Number(event.target.value) || 0))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Token / Product</label>
              <Input
                type="number"
                min={0}
                value={productionToken}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setProductionToken(Math.max(0, Number(event.target.value) || 0))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Stock (Manual)</label>
              <Input
                type="number"
                min={0}
                value={manualStock}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setManualStock(Math.max(0, Number(event.target.value) || 0))
                }
              />
            </div>

            <div className="space-y-2 sm:col-span-2 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
              <p className="text-sm font-semibold text-indigo-800">Sinkron untuk Booking Catalog</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Variant / Size
                  </label>
                  <Input
                    value={bookingVariantLabel}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                      setBookingVariantLabel(event.target.value)
                    }
                    placeholder="cth. Standard"
                  />
                </div>
                <div className="space-y-1 rounded-lg border border-indigo-100 bg-white px-3 py-2 text-xs text-slate-600">
                  <p className="font-semibold uppercase tracking-wide text-slate-500">
                    Nama Produk (Dashboard)
                  </p>
                  <label className="mt-1 inline-flex items-center gap-2 text-[11px] font-medium text-slate-600">
                    <input
                      type="checkbox"
                      checked={appendVariantToDashboardName}
                      onChange={(event) =>
                        setAppendVariantToDashboardName(event.target.checked)
                      }
                    />
                    Tambahkan suffix variant di nama dashboard
                  </label>
                  <p className="mt-1 font-semibold text-slate-800">
                    {dashboardProductName || "-"}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Dibentuk otomatis dari Nama Item + Variant/Size.
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Mapping: Product {"->"} category, Sub Category {"->"} subcategory, Nama Item {"->"} productName, Variant/Size {"->"} variantLabel.
              </p>
            </div>
          </div>

          {sellingPrice > 0 && directCogs > 0 ? (
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${
                margin < 0
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              COGS/HPP: {formatCurrency(directCogs)}. Margin estimasi: <span className="font-bold">{margin}%</span>.
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={closeModal} disabled={submitting}>
              Batal
            </Button>
            <Button
              type="button"
              className="gap-2 bg-indigo-700 text-white hover:bg-indigo-800"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              {pendingCatalogSync ? "Retry Sync Catalog" : "Konfirmasi & Simpan"}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
