import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { EditProductModalProps } from "@/types/product";
import type { DraftRecipeRow } from "@/types/product";
import IngredientSelectorRow from "../products/create/components/IngredientSelectorRow";
import { getIngredientOptions, updateProduct } from "@/lib/api/products";
import type { IngredientOption } from "@/lib/api/products";
import {
  broadcastCatalogAdminState,
  makeVariantKey,
  type CatalogAdminState,
  type CustomProductEntry,
} from "@/lib/bookings/catalog-admin";
import { buildEffectiveProductCatalog as buildEffectiveCatalogFromState } from "@/lib/bookings/catalog-state";
import { BOOKING_PRODUCT_CATALOG } from "@/lib/bookings/pricelist";
import { Plus, X, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

// _clientId is present in ProductDraft, but we use it in DraftRecipeRow for UI keys
type DraftRecipeRowWithClientId = DraftRecipeRow & { _clientId: string };

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

function removeCustomProduct(
  state: CatalogAdminState,
  entry: CustomProductEntry,
): CatalogAdminState {
  const nextCustomProducts = state.customProducts.filter(
    (item) =>
      !(
        item.category.toLowerCase() === entry.category.trim().toLowerCase() &&
        item.subcategory.toLowerCase() === entry.subcategory.trim().toLowerCase() &&
        item.productName.toLowerCase() === entry.productName.trim().toLowerCase() &&
        item.variantLabel.toLowerCase() === entry.variantLabel.trim().toLowerCase()
      ),
  );
  if (nextCustomProducts.length === state.customProducts.length) return state;
  return { ...state, customProducts: nextCustomProducts };
}

function hasBaseCatalogVariant(entry: CustomProductEntry): boolean {
  const normalizedCategory = entry.category.trim().toLowerCase();
  const normalizedSubcategory = entry.subcategory.trim().toLowerCase();
  const normalizedProductName = entry.productName.trim().toLowerCase();
  const normalizedVariantLabel = entry.variantLabel.trim().toLowerCase();

  return BOOKING_PRODUCT_CATALOG.some(
    (category) =>
      category.category.trim().toLowerCase() === normalizedCategory &&
      category.subcategories.some(
        (subcategory) =>
          subcategory.name.trim().toLowerCase() === normalizedSubcategory &&
          subcategory.products.some(
            (product) =>
              product.name.trim().toLowerCase() === normalizedProductName &&
              product.variants.some(
                (variant) =>
                  variant.label.trim().toLowerCase() === normalizedVariantLabel,
              ),
          ),
      ),
  );
}

async function syncToBookingCatalogPrice(
  entry: CustomProductEntry,
  previousEntry?: CustomProductEntry,
): Promise<string | null> {
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

  let nextState = normalizeCatalogState(getPayload.data);
  const currentEntryIsBaseCatalog = hasBaseCatalogVariant(entry);

  const nextPrice = Math.max(0, Math.round(Number(entry.price || 0)));
  const nextVariantKey = makeVariantKey(
    entry.category.trim(),
    entry.subcategory.trim(),
    entry.productName.trim(),
    entry.variantLabel.trim(),
  );

  nextState = {
    ...nextState,
    productVariantPriceOverrides: {
      ...nextState.productVariantPriceOverrides,
      [nextVariantKey]: nextPrice,
    },
  };
  nextState = currentEntryIsBaseCatalog
    ? removeCustomProduct(nextState, entry)
    : upsertCustomProduct(nextState, entry);

  if (previousEntry) {
    const previousVariantKey = makeVariantKey(
      previousEntry.category.trim(),
      previousEntry.subcategory.trim(),
      previousEntry.productName.trim(),
      previousEntry.variantLabel.trim(),
    );
    if (previousVariantKey !== nextVariantKey) {
      const nextOverrides = { ...nextState.productVariantPriceOverrides };
      delete nextOverrides[previousVariantKey];
      nextState = {
        ...nextState,
        productVariantPriceOverrides: nextOverrides,
      };
    }
    if (
      previousEntry.category.trim().toLowerCase() !==
        entry.category.trim().toLowerCase() ||
      previousEntry.subcategory.trim().toLowerCase() !==
        entry.subcategory.trim().toLowerCase() ||
      previousEntry.productName.trim().toLowerCase() !==
        entry.productName.trim().toLowerCase() ||
      previousEntry.variantLabel.trim().toLowerCase() !==
        entry.variantLabel.trim().toLowerCase()
    ) {
      nextState = removeCustomProduct(nextState, previousEntry);
    }
  }

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
  return putPayload.productSyncError ?? null;
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

function resolveProductCategoryBySubcategory(subcategory: string): string {
  const normalized = subcategory.trim().toLowerCase();
  if (!normalized) return "";
  const match = BOOKING_PRODUCT_CATALOG.find((entry) =>
    entry.subcategories.some((sub) => sub.name.trim().toLowerCase() === normalized),
  );
  return match?.category ?? "";
}

function findProductMappingInCatalog(args: {
  dashboardName: string;
  subcategoryName: string;
  state: CatalogAdminState;
}):
  | {
      category: string;
      subcategory: string;
      itemName: string;
      variantLabel: string;
      appendVariantToDashboardName: boolean;
    }
  | null {
  const dashboardName = args.dashboardName.trim().toLowerCase();
  const subcategoryName = args.subcategoryName.trim().toLowerCase();
  if (!dashboardName) return null;

  const catalog = buildEffectiveCatalogFromState(args.state);

  for (const category of catalog) {
    for (const subcategory of category.subcategories) {
      if (
        subcategoryName &&
        subcategory.name.trim().toLowerCase() !== subcategoryName
      ) {
        continue;
      }

      for (const product of subcategory.products) {
        const variantCount = product.variants.length;
        for (const variant of product.variants) {
          const appendVariantToDashboardName = !(
            variantCount === 1 &&
            ["standard", "start from"].includes(
              variant.label.trim().toLowerCase(),
            )
          );
          const candidateName = buildDashboardProductName({
            productName: product.name,
            variantLabel: variant.label,
            appendVariant: appendVariantToDashboardName,
          });

          if (candidateName.trim().toLowerCase() !== dashboardName) continue;

          return {
            category: category.category,
            subcategory: subcategory.name,
            itemName: product.name,
            variantLabel: variant.label,
            appendVariantToDashboardName,
          };
        }
      }
    }
  }

  return null;
}

function inferBookingFieldsFromDashboardName(args: {
  dashboardName: string;
  subcategoryName: string;
}): {
  itemName: string;
  variantLabel: string;
  appendVariantToDashboardName: boolean;
} {
  const dashboardName = args.dashboardName.trim();
  const subcategoryName = args.subcategoryName.trim().toLowerCase();

  if (subcategoryName) {
    for (const category of BOOKING_PRODUCT_CATALOG) {
      const subcategory = category.subcategories.find(
        (entry) => entry.name.trim().toLowerCase() === subcategoryName,
      );
      if (!subcategory) continue;

      for (const product of subcategory.products) {
        const variantCount = product.variants.length;
        for (const variant of product.variants) {
          const candidate =
            variantCount === 1 && ["standard", "start from"].includes(variant.label.trim().toLowerCase())
              ? product.name
              : `${product.name} - ${variant.label}`;
          if (candidate.trim().toLowerCase() === dashboardName.toLowerCase()) {
            return {
              itemName: product.name,
              variantLabel: variant.label,
              appendVariantToDashboardName:
                !(variantCount === 1 && ["standard", "start from"].includes(variant.label.trim().toLowerCase())),
            };
          }
        }
      }
    }
  }

  const parts = dashboardName.split(" - ").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      itemName: parts.slice(0, -1).join(" - "),
      variantLabel: parts[parts.length - 1],
      appendVariantToDashboardName: true,
    };
  }

  return {
    itemName: dashboardName,
    variantLabel: "Standard",
    appendVariantToDashboardName: false,
  };
}

export default function EditProductModal({ product, categories, onClose, onSaved }: EditProductModalProps) {
  const initialSubcategory = product.category?.name ?? "";
  const initialProductCategory = resolveProductCategoryBySubcategory(initialSubcategory);
  const initialBookingFields = inferBookingFieldsFromDashboardName({
    dashboardName: product.name,
    subcategoryName: initialSubcategory,
  });

  // Default to current product mapping so quick edits (e.g. margin only) don't require re-filling fields.
  const [productCategory, setProductCategory] = useState<string>(initialProductCategory);
  const [bookingSubcategory, setBookingSubcategory] = useState<string>(initialSubcategory);
  const [itemName, setItemName] = useState<string>(initialBookingFields.itemName);
  const [bookingVariantLabel, setBookingVariantLabel] = useState<string>(initialBookingFields.variantLabel);
  const [appendVariantToDashboardName, setAppendVariantToDashboardName] = useState<boolean>(
    initialBookingFields.appendVariantToDashboardName,
  );

  const [sellingPrice, setSellingPrice] = useState<number>(Number(product.sellingPrice));
  const [directCogs, setDirectCogs] = useState<number>(Number(product.cogs || 0));
  const [productionToken, setProductionToken] = useState<number>(
    Math.max(0, Number(product.productionToken || 0)),
  );
  const [manualStock, setManualStock] = useState<number>(
    Math.max(0, Number(product.availableStock ?? product.manualStock ?? 0)),
  );
  const [productType] = useState<"ReadyStock" | "PreOrder">(product.productType ?? "PreOrder");
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
  const [catalogSyncWarning, setCatalogSyncWarning] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const bookingFieldsEditedRef = useRef(false);

  const productCategoryOptions = useMemo(
    () => BOOKING_PRODUCT_CATALOG.map((entry) => entry.category),
    [],
  );

  const subcategoryOptions = useMemo(() => {
    const category = BOOKING_PRODUCT_CATALOG.find(
      (entry) => entry.category === productCategory,
    );
    const fromCatalog = category?.subcategories.map((entry) => entry.name) ?? [];
    const fromDashboard = categories.map((entry) => entry.name);
    return productCategory
      ? fromCatalog
      : Array.from(new Set([...fromCatalog, ...fromDashboard]));
  }, [productCategory, categories]);

  useEffect(() => {
    getIngredientOptions()
      .then((opts) => setIngredientOptions(opts))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const response = await fetch("/api/bookings/catalog-config", {
        method: "GET",
        cache: "no-store",
      }).catch(() => null);
      if (!response || !response.ok) return;

      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        data?: unknown;
      };
      if (!payload.success) return;

      const mapping = findProductMappingInCatalog({
        dashboardName: product.name,
        subcategoryName: initialSubcategory,
        state: normalizeCatalogState(payload.data),
      });

      if (!mapping || cancelled || bookingFieldsEditedRef.current) return;

      setProductCategory(mapping.category);
      setBookingSubcategory(mapping.subcategory);
      setItemName(mapping.itemName);
      setBookingVariantLabel(mapping.variantLabel);
      setAppendVariantToDashboardName(mapping.appendVariantToDashboardName);
    })();

    return () => {
      cancelled = true;
    };
  }, [initialSubcategory, product.name]);

  useEffect(() => {
    if (!productCategory.trim()) return;
    if (subcategoryOptions.length === 0) return;
    if (subcategoryOptions.includes(bookingSubcategory)) return;
    setBookingSubcategory(subcategoryOptions[0]);
  }, [subcategoryOptions, bookingSubcategory, productCategory]);

  const dashboardProductName = useMemo(
    () =>
      buildDashboardProductName({
        productName: itemName,
        variantLabel: bookingVariantLabel,
        appendVariant: appendVariantToDashboardName,
      }),
    [itemName, bookingVariantLabel, appendVariantToDashboardName],
  );

  const margin = sellingPrice > 0 ? Math.round(((sellingPrice - directCogs) / sellingPrice) * 100) : 0;

  const validate = () => {
    if (!productCategory.trim()) return "Product wajib dipilih.";
    if (!bookingSubcategory.trim()) return "Sub category booking wajib diisi.";
    if (!itemName.trim()) return "Nama item wajib diisi.";
    if (!bookingVariantLabel.trim()) return "Variant/size booking wajib diisi.";
    if (!dashboardProductName.trim()) return "Nama produk dashboard belum valid.";
    if (!sellingPrice || sellingPrice <= 0) return "Harga jual harus lebih dari 0.";
    if (!directCogs || directCogs <= 0) return "COGS/HPP wajib diisi dan harus lebih dari 0.";
    const filledRecipe = recipe.filter((r) => r.ingredientName.trim() || r.ingredientId > 0);
    const hasInvalid = filledRecipe.some((r) => !r.ingredientName.trim() || r.quantity <= 0);
    if (filledRecipe.length > 0 && hasInvalid) return "Setiap bahan membutuhkan nama dan jumlah yang valid.";
    return null;
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

  const handleSave = async () => {
    setSubmitted(true);
    setCatalogSyncWarning(null);

    const err = validate();
    if (err) {
      setError(err);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const recipePayload = recipe
        .filter((r) => r.ingredientId > 0 && r.ingredientName.trim())
        .map((r) => ({
          ingredientId: Number(r.ingredientId),
          quantity: Number(r.quantity),
        }));

      const updatedProduct = await updateProduct(product.id, {
        name: dashboardProductName,
        categoryName: bookingSubcategory.trim(),
        sellingPrice: Number(sellingPrice),
        cogs: Number(directCogs),
        productionToken: Number(productionToken),
        manualStock: Number(manualStock),
        productType,
        recipe: recipePayload,
      });

      try {
        const productSyncError = await syncToBookingCatalogPrice(
          {
            category: productCategory.trim(),
            subcategory: bookingSubcategory.trim(),
            productName: itemName.trim(),
            variantLabel: bookingVariantLabel.trim(),
            price: Number(sellingPrice),
          },
          {
            category: initialProductCategory.trim(),
            subcategory: initialSubcategory.trim(),
            productName: initialBookingFields.itemName.trim(),
            variantLabel: initialBookingFields.variantLabel.trim(),
            price: Number(product.sellingPrice || 0),
          },
        );
        setCatalogSyncWarning(
          productSyncError
            ? `Perubahan catalog booking berhasil disimpan, tetapi sinkron dashboard product belum sempurna: ${productSyncError}`
            : null,
        );
      } catch (syncError) {
        setCatalogSyncWarning(
          `Produk dashboard tersimpan, tetapi sinkron booking catalog gagal: ${
            syncError instanceof Error
              ? syncError.message
              : "Terjadi error sinkronisasi."
          }`,
        );
      }

      onSaved(updatedProduct);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Gagal update produk");
    } finally {
      setSaving(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
      style={{ zIndex: 200 }}
    >
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-3xl max-h-[90dvh] flex flex-col overflow-hidden">
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
          className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
        >
          {error && (
            <div className="flex items-start gap-2 bg-red-50 text-red-600 rounded-xl p-3 text-xs">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {catalogSyncWarning && (
            <div className="flex items-start gap-2 bg-amber-50 text-amber-700 rounded-xl p-3 text-xs">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{catalogSyncWarning}</span>
            </div>
          )}

          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Product</label>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    type="text"
                    value={productCategory}
                    onChange={(e) => {
                      bookingFieldsEditedRef.current = true;
                      setProductCategory(e.target.value);
                    }}
                    placeholder="cth. Cookies"
                    className="w-full border border-indigo-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-700 bg-white focus:ring-2 focus:ring-indigo-400 outline-none"
                  />
                  <select
                    className="h-[42px] rounded-xl border border-indigo-200 bg-white px-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-400"
                    value={productCategoryOptions.includes(productCategory) ? productCategory : ""}
                    onChange={(e) => {
                      bookingFieldsEditedRef.current = true;
                      setProductCategory(e.target.value);
                    }}
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

              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Sub Category</label>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    type="text"
                    value={bookingSubcategory}
                    onChange={(e) => {
                      bookingFieldsEditedRef.current = true;
                      setBookingSubcategory(e.target.value);
                    }}
                    placeholder="cth. Event Cookies"
                    className="w-full border border-indigo-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-700 bg-white focus:ring-2 focus:ring-indigo-400 outline-none"
                  />
                  {subcategoryOptions.length > 0 ? (
                    <select
                      className="h-[42px] rounded-xl border border-indigo-200 bg-white px-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-400"
                      value={subcategoryOptions.includes(bookingSubcategory) ? bookingSubcategory : ""}
                      onChange={(e) => {
                        bookingFieldsEditedRef.current = true;
                        setBookingSubcategory(e.target.value);
                      }}
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

              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Nama Item</label>
                <input
                  type="text"
                  value={itemName}
                  onChange={(e) => {
                    bookingFieldsEditedRef.current = true;
                    setItemName(e.target.value);
                  }}
                  placeholder="cth. Lotus Box"
                  className="w-full border border-indigo-200 rounded-xl px-4 py-2.5 text-base font-semibold text-slate-700 bg-white focus:ring-2 focus:ring-indigo-400 outline-none"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-gray-600 uppercase">Variant / Size</label>
                  <button
                    type="button"
                    onClick={() => {
                      bookingFieldsEditedRef.current = true;
                      setBookingVariantLabel("Standard");
                    }}
                    className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
                  >
                    Set Standard
                  </button>
                </div>
                <input
                  type="text"
                  value={bookingVariantLabel}
                  onChange={(e) => {
                    bookingFieldsEditedRef.current = true;
                    setBookingVariantLabel(e.target.value);
                  }}
                  placeholder="cth. Standard"
                  className="w-full border border-indigo-200 rounded-xl px-4 py-2.5 text-base font-semibold text-slate-700 bg-white focus:ring-2 focus:ring-indigo-400 outline-none"
                  required
                />
              </div>
            </div>

            <div className="rounded-xl border border-indigo-100 bg-white p-3">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={appendVariantToDashboardName}
                  onChange={(e) => {
                    bookingFieldsEditedRef.current = true;
                    setAppendVariantToDashboardName(e.target.checked);
                  }}
                />
                Tambahkan suffix variant di nama dashboard
              </label>
              <p className="mt-2 text-[11px] text-slate-500 uppercase tracking-wide">Nama produk dashboard</p>
              <p className="text-sm font-bold text-slate-800 break-words">{dashboardProductName || "-"}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                COGS/HPP: {" "}
                {directCogs > 0
                  ? new Intl.NumberFormat("id-ID", {
                      style: "currency",
                      currency: "IDR",
                      minimumFractionDigits: 0,
                    }).format(directCogs)
                  : "-"}
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
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Token / Product</label>
              <input
                type="number"
                min={0}
                value={productionToken}
                onChange={(e) => setProductionToken(Math.max(0, Number(e.target.value) || 0))}
                className="w-full border border-indigo-200 rounded-xl px-4 py-2.5 text-base font-semibold text-slate-700 bg-white focus:ring-2 focus:ring-indigo-400 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Stock (Manual)</label>
              <input
                type="number"
                min={0}
                value={manualStock}
                onChange={(e) => setManualStock(Math.max(0, Number(e.target.value) || 0))}
                className="w-full border border-indigo-200 rounded-xl px-4 py-2.5 text-base font-semibold text-slate-700 bg-white focus:ring-2 focus:ring-indigo-400 outline-none"
              />
            </div>
          </div>

          <div>
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
            disabled={saving}
            onClick={() => void handleSave()}
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
