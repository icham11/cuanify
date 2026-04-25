"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  ShoppingBag,
  AlertTriangle,
  Tag,
  ChefHat,
  Eye,
  Pencil,
  Trash2,
  X,
  Loader2,
  CheckCircle2,
  ChevronUp,
  ChevronDown,
  TrendingUp,
} from "lucide-react";
import {
  getProducts,
  getCategoryOptions,
  updateProductPrice,
  deleteProduct,
  syncBakeryCatalogProducts,
} from "@/lib/api/products";
import type { Product, ProductCategory } from "@/types/product";
import EditProductModal from "./EditProductModal";
import { BOOKING_PRODUCT_CATALOG } from "@/lib/bookings/pricelist";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(value);

const SUBCATEGORY_PRODUCT_MAP = new Map(
  BOOKING_PRODUCT_CATALOG.flatMap((category) =>
    category.subcategories.map(
      (subcategory) => [subcategory.name, category.category] as const,
    ),
  ),
);
const REMOVED_BAKERY_SUBCATEGORIES = new Set([
  ["Best", "Seller", "Kids", "Edition"].join(" "),
  ["Best", "Seller", "Signature"].join(" "),
]);

function getProductGroupName(product: Product): string {
  const subcategory = product.category?.name ?? "";
  return getProductGroupFromSubcategoryName(subcategory);
}

function getProductGroupFromSubcategoryName(subcategory: string): string {
  return SUBCATEGORY_PRODUCT_MAP.get(subcategory) ?? "Custom";
}

/**
 * Renders a margin value with color + contextual badge.
 * < -100%  → red + "Cek Data" badge (likely a unit/cost entry mistake)
 * < 0%     → red + "Rugi" badge
 * < 20%    → red
 * < 50%    → yellow
 * ≥ 50%    → green
 */
function MarginBadge({ margin }: { margin: number }) {
  if (margin < -100) {
    return (
      <span className="text-red-700 font-semibold">
        {margin}%{" "}
        <span className="inline-flex items-center gap-0.5 bg-red-100 text-red-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
          <AlertTriangle size={9} /> Cek Data
        </span>
      </span>
    );
  }
  if (margin < 0) {
    return (
      <span className="text-red-600 font-semibold">
        {margin}%{" "}
        <span className="inline-flex items-center gap-0.5 bg-red-50 text-red-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
          Rugi
        </span>
      </span>
    );
  }
  const color =
    margin >= 50
      ? "text-green-600"
      : margin >= 20
        ? "text-yellow-600"
        : "text-red-600";
  return <span className={`${color} font-semibold`}>{margin}%</span>;
}

// Recipe modal

function RecipeModal({
  product,
  onClose,
}: {
  product: Product;
  onClose: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const recipeCost = Number(product.recipeCost);
  const sellingPrice = Number(product.sellingPrice);
  const margin =
    sellingPrice > 0 && recipeCost > 0
      ? Math.round(((sellingPrice - recipeCost) / sellingPrice) * 100)
      : null;

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
      style={{ zIndex: 200 }}
      onMouseDown={(e) => e.target === overlayRef.current && onClose()}
    >
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-lg max-h-[85dvh] flex flex-col overflow-hidden">
        {/* Drag handle (mobile only) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 sm:py-5 border-b border-gray-100 bg-linear-to-r from-indigo-50 to-indigo-50">
          <div>
            <div className="flex items-center gap-2">
              <ChefHat size={18} className="text-indigo-500" />
              <h2 className="text-lg font-extrabold text-indigo-700">
                {product.name}
              </h2>
            </div>
            {product.category && (
              <span className="inline-flex items-center gap-1 mt-1 bg-indigo-100 text-indigo-700 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                <Tag size={10} />
                Sub Category: {product.category.name}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Pricing summary */}
        <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100 text-center shrink-0">
          <div className="px-2 py-2.5 sm:px-4 sm:py-3">
            <p className="text-[9px] sm:text-[10px] text-gray-400 font-bold uppercase tracking-wide">
              Harga Jual
            </p>
            <p className="text-xs sm:text-sm font-extrabold text-indigo-700 mt-0.5">
              {formatCurrency(sellingPrice)}
            </p>
          </div>
          <div className="px-2 py-2.5 sm:px-4 sm:py-3">
            <p className="text-[9px] sm:text-[10px] text-gray-400 font-bold uppercase tracking-wide">
              Biaya Resep
            </p>
            <p className="text-xs sm:text-sm font-extrabold text-slate-700 mt-0.5">
              {recipeCost > 0 ? formatCurrency(recipeCost) : "—"}
            </p>
          </div>
          <div className="px-2 py-2.5 sm:px-4 sm:py-3">
            <p className="text-[9px] sm:text-[10px] text-gray-400 font-bold uppercase tracking-wide">
              Margin
            </p>
            <p className="text-xs sm:text-sm font-extrabold mt-0.5">
              {margin !== null ? <MarginBadge margin={margin} /> : "—"}
            </p>
          </div>
        </div>

        {/* Recipe list */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 pb-safe">
          {product.recipes.length === 0 ? (
            <p className="text-center text-gray-400 italic py-8">
              Tidak ada bahan dalam resep ini.
            </p>
          ) : (
            <div className="space-y-2">
              {/* Column headers */}
              <div className="grid grid-cols-12 gap-2 px-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                <div className="col-span-5">Bahan</div>
                <div className="col-span-2 text-right">Jml</div>
                <div className="col-span-2">Satuan</div>
                <div className="col-span-3 text-right">Biaya</div>
              </div>
              {product.recipes.map((r) => {
                const costPerUnit = Number(r.ingredient.costPerUnit ?? 0);
                const rowCost = Number(r.quantity) * costPerUnit;
                return (
                  <div
                    key={r.id}
                    className="grid grid-cols-12 gap-2 items-center bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100"
                  >
                    <div className="col-span-5 font-medium text-slate-700 text-sm truncate">
                      {r.ingredient.name}
                    </div>
                    <div className="col-span-2 text-right text-sm text-gray-600">
                      {Number(r.quantity)}
                    </div>
                    <div className="col-span-2 text-sm text-gray-500">
                      {r.ingredient.unit}
                    </div>
                    <div className="col-span-3 text-right text-xs font-bold text-indigo-600">
                      {rowCost > 0 ? formatCurrency(rowCost) : "—"}
                    </div>
                  </div>
                );
              })}

              {/* Total */}
              {recipeCost > 0 && (
                <div className="flex justify-between items-center pt-2 pb-4 sm:pb-2 border-t border-gray-100 px-3">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                    Total Biaya Resep
                  </span>
                  <span className="text-sm font-extrabold text-indigo-700">
                    {formatCurrency(recipeCost)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Edit price modal

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function EditPriceModal({
  product,
  onClose,
  onSaved,
}: {
  product: Product;
  onClose: () => void;
  onSaved: (updated: Product) => void;
}) {
  const [price, setPrice] = useState(Number(product.sellingPrice));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const recipeCost = Number(product.recipeCost);
  const margin =
    price > 0 && recipeCost > 0
      ? Math.round(((price - recipeCost) / price) * 100)
      : null;

  const handleSave = async () => {
    if (!price || price <= 0) {
      setError("Harga jual harus lebih dari 0.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateProductPrice(product.id, price);
      onSaved({ ...product, sellingPrice: Number(updated.sellingPrice) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memperbarui harga");
    } finally {
      setSaving(false);
    }
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
      style={{ zIndex: 200 }}
      onMouseDown={(e) => e.target === overlayRef.current && onClose()}
    >
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-sm overflow-hidden">
        {/* Drag handle (mobile only) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 sm:py-5 border-b border-gray-100 bg-linear-to-r from-indigo-50 to-indigo-50">
          <div>
            <h2 className="text-base font-extrabold text-indigo-700">
              Edit Harga Jual
            </h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-55">
              {product.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 transition"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 bg-red-50 text-red-600 rounded-xl p-3 text-xs">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wide">
              Harga Jual (Rp)
            </label>
            <input
              type="number"
              min={1}
              autoFocus
              value={price}
              onChange={(e) => {
                setPrice(Number(e.target.value));
                setError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              className="mt-1.5 w-full border border-indigo-200 rounded-xl px-4 py-2.5 text-base font-semibold text-slate-700 bg-white focus:ring-2 focus:ring-indigo-400 outline-none"
            />
            {recipeCost > 0 && (
              <p className="text-xs text-gray-400 mt-1.5">
                Biaya resep: {formatCurrency(recipeCost)}
                {margin !== null && (
                  <>
                    {" — "}
                    <MarginBadge margin={margin} />
                  </>
                )}
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-1 pb-8 sm:pb-0">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition"
            >
              Batal
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white font-bold text-sm rounded-xl hover:bg-indigo-700 transition disabled:opacity-50"
            >
              {saving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <CheckCircle2 size={16} />
              )}
              Simpan
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Delete confirmation modal

function DeleteConfirmModal({
  product,
  onClose,
  onDeleted,
}: {
  product: Product;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteProduct(product.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus produk");
      setDeleting(false);
    }
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
      style={{ zIndex: 200 }}
      onMouseDown={(e) => e.target === overlayRef.current && onClose()}
    >
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-sm overflow-hidden">
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        <div className="px-6 py-5 sm:py-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-red-100 text-red-600">
              <Trash2 size={18} />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-800">
                Hapus Produk?
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                <span className="font-semibold text-slate-700">
                  {product.name}
                </span>{" "}
                dan seluruh resepnya akan dihapus permanen. Tindakan ini tidak
                dapat dibatalkan.
              </p>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 text-red-600 rounded-xl p-3 text-xs">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition"
            >
              Batal
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white font-bold text-sm rounded-xl hover:bg-red-700 transition disabled:opacity-50"
            >
              {deleting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Trash2 size={16} />
              )}
              Hapus
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Bulk delete confirmation modal

function BulkDeleteConfirmModal({
  count,
  deleting,
  error,
  onClose,
  onConfirm,
}: {
  count: number;
  deleting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
      style={{ zIndex: 200 }}
      onMouseDown={(e) => e.target === overlayRef.current && onClose()}
    >
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-sm overflow-hidden">
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        <div className="px-6 py-5 sm:py-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-red-100 text-red-600">
              <Trash2 size={18} />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-800">
                Hapus {count} Produk?
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Semua produk yang dipilih dan resepnya akan dihapus permanen.
                Tindakan ini tidak dapat dibatalkan.
              </p>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 text-red-600 rounded-xl p-3 text-xs">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition"
            >
              Batal
            </button>
            <button
              onClick={onConfirm}
              disabled={deleting}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white font-bold text-sm rounded-xl hover:bg-red-700 transition disabled:opacity-50"
            >
              {deleting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Trash2 size={16} />
              )}
              Hapus {count}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

type SortByField =
  | "name"
  | "sellingPrice"
  | "createdAt";
type SortOrderType = "asc" | "desc";

export default function ProductsPage() {
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  // Fetch categories from backend
  useEffect(() => {
    fetch("/api/categories")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) {
          setCategories(data.data);
        }
      })
      .catch(() => {});
  }, []);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [productGroupFilter, setProductGroupFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<SortByField>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrderType>("desc");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [avgSellingPrice, setAvgSellingPrice] = useState(0);
  const [avgMargin, setAvgMargin] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting] = useState(false);
  const [bulkDeleteError] = useState<string | null>(null);
  const [syncingCatalog, setSyncingCatalog] = useState(false);
  const [syncCatalogMessage, setSyncCatalogMessage] = useState<string | null>(
    null,
  );
  const [editModal, setEditModal] = useState<Product | null>(null);
  const [deleteModal, setDeleteModal] = useState<Product | null>(null);
  const [recipeModal, setRecipeModal] = useState<Product | null>(null);
  const visibleCategories = useMemo(
    () =>
      categories.filter(
        (category) => !REMOVED_BAKERY_SUBCATEGORIES.has(category.name),
      ),
    [categories],
  );
  const productGroupOptions = useMemo(() => {
    const groups = new Set(
      visibleCategories.map((category) =>
        getProductGroupFromSubcategoryName(category.name),
      ),
    );
    return Array.from(groups).sort((a, b) => a.localeCompare(b));
  }, [visibleCategories]);
  const filteredSubcategoryOptions = useMemo(() => {
    if (!productGroupFilter) return visibleCategories;
    return visibleCategories.filter(
      (category) =>
        getProductGroupFromSubcategoryName(category.name) === productGroupFilter,
    );
  }, [productGroupFilter, visibleCategories]);
  const selectedProductGroupCategoryIds = useMemo(
    () => filteredSubcategoryOptions.map((category) => category.id),
    [filteredSubcategoryOptions],
  );
  const selectedProductGroupCategoryKey = selectedProductGroupCategoryIds.join(",");

  useEffect(() => {
    const searchFromUrl = searchParams.get("search") ?? "";
    if (!searchFromUrl) return;

    setSearchInput(searchFromUrl);
    setSearch(searchFromUrl);
    setPage(1);
  }, [searchParams]);
  const latestRequestRef = useRef(0);
  const router = useRouter();

  const fetchProducts = async (
    pageOverride?: number,
    categoryOverride?: number | null,
  ) => {
    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;
    setLoading(true);
    setError(null);
    try {
      const { data, meta } = await getProducts({
        search,
        categoryId:
          categoryOverride === undefined
            ? (categoryFilter ?? undefined)
            : (categoryOverride ?? undefined),
        categoryIds:
          categoryOverride === undefined && !categoryFilter && productGroupFilter
            ? selectedProductGroupCategoryIds
            : undefined,
        excludeCategoryNames: Array.from(REMOVED_BAKERY_SUBCATEGORIES),
        sortBy,
        sortOrder,
        page: pageOverride ?? page,
      });
      if (requestId !== latestRequestRef.current) return;
      setProducts(data);
      setTotalPages(Math.max(1, meta.totalPages));
      setTotalCount(meta.total);
      setAvgSellingPrice(meta.avgSellingPrice);
      setAvgMargin(meta.avgMargin);
      setPage(Math.min(Math.max(1, meta.page), Math.max(1, meta.totalPages)));
    } catch (err) {
      if (requestId !== latestRequestRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to fetch products");
    } finally {
      if (requestId === latestRequestRef.current) {
        setLoading(false);
      }
    }
  };

  const refreshCategories = async () => {
    try {
      const data = await getCategoryOptions();
      setCategories(data);
    } catch {
      // Category filter is optional; product fetch remains the main path.
    }
  };

  const handleSyncBakeryCatalog = async () => {
    setSyncingCatalog(true);
    setError(null);
    setSyncCatalogMessage(null);
    try {
      const result = await syncBakeryCatalogProducts();
      setProductGroupFilter("");
      setCategoryFilter(null);
      setPage(1);
      await refreshCategories();
      await fetchProducts(1, null);
      setSyncCatalogMessage(
        `Synced ${result.createdCount} product dari bakery catalog.`,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Gagal sync product dari bakery catalog",
      );
    } finally {
      setSyncingCatalog(false);
    }
  };

  useEffect(() => {
    fetchProducts(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, categoryFilter, productGroupFilter, selectedProductGroupCategoryKey, sortBy, sortOrder]);

  useEffect(() => {
    if (!categoryFilter) return;
    if (filteredSubcategoryOptions.some((category) => category.id === categoryFilter)) {
      return;
    }
    setCategoryFilter(null);
    setPage(1);
  }, [categoryFilter, filteredSubcategoryOptions]);

  useEffect(() => {
    if (searchInput === search) return;

    const timeoutId = window.setTimeout(() => {
      setPage(1);
      setSearch(searchInput);
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [searchInput, search]);

  const handleSortClick = (col: SortByField) => {
    if (sortBy === col) {
      setSortOrder(
        (o: SortOrderType): SortOrderType => (o === "asc" ? "desc" : "asc"),
      );
      return;
    }

    setSortBy(col);
    setSortOrder("asc");
  };

  const SortIcon = ({ col }: { col: SortByField }) =>
    sortBy !== col ? (
      <ChevronUp size={12} className="ml-1 text-gray-300" />
    ) : sortOrder === "asc" ? (
      <ChevronUp size={12} className="ml-1 text-indigo-500" />
    ) : (
      <ChevronDown size={12} className="ml-1 text-indigo-500" />
    );

  const handlePageChange = (nextPage: number) => {
    const boundedPage = Math.min(Math.max(1, nextPage), totalPages);
    if (boundedPage === page || loading) return;
    fetchProducts(boundedPage);
  };

  const handleBulkDelete = () => {
    setBulkDeleteOpen(false);
  };

  // ...continue with correct component logic here (conditional rendering, table, modals, etc.)

  return (
    <>
      <div className="space-y-8">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 bg-linear-to-r from-indigo-500 via-indigo-500 to-indigo-400 rounded-2xl p-4 sm:p-6 shadow-lg">
          <div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-white flex items-center gap-2 sm:gap-3">
              <ShoppingBag className="w-5 h-5 sm:w-7 sm:h-7 shrink-0" />
              Products
            </h1>
            <p className="text-indigo-100 text-sm mt-1">
              Kelola produk dan resep bisnis Anda.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleSyncBakeryCatalog}
              disabled={syncingCatalog}
              className="flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 bg-white text-indigo-700 font-semibold rounded-xl shadow hover:bg-indigo-50 transition text-sm sm:text-base disabled:opacity-60"
            >
              {syncingCatalog ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <ShoppingBag size={18} />
              )}
              Sync Bakery Catalog
            </button>
            <button
              onClick={() => router.push("/bakery/catalog")}
              className="flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 bg-indigo-950/20 text-white font-semibold rounded-xl shadow hover:bg-indigo-950/30 transition text-sm sm:text-base"
            >
              <Plus size={20} />
              Add Product
            </button>
          </div>
        </div>

        {syncCatalogMessage ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
            {syncCatalogMessage}
          </div>
        ) : null}

        {/* STATS ROW */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          {/* Rata-rata Harga — top row on mobile (full width), middle on desktop */}
          <div className="col-span-2 sm:col-span-1 sm:order-2 bg-white/80 backdrop-blur border border-indigo-100 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-sm hover:shadow-md hover:border-indigo-200 transition">
            <div className="flex items-center gap-1.5 mb-1">
              <Tag size={14} className="text-indigo-400 shrink-0" />
              <p className="text-xs sm:text-sm text-gray-500">
                Rata-rata Harga
              </p>
            </div>
            <h2 className="text-lg sm:text-2xl font-bold text-gray-900 mt-1 sm:mt-2 truncate">
              {totalCount > 0 ? formatCurrency(avgSellingPrice) : "—"}
            </h2>
          </div>
          {/* Total Produk — bottom-left on mobile, first on desktop */}
          <div className="sm:order-1 bg-white/80 backdrop-blur border border-indigo-100 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-sm hover:shadow-md hover:border-indigo-200 transition">
            <div className="flex items-center gap-1.5 mb-1">
              <ShoppingBag size={14} className="text-indigo-400 shrink-0" />
              <p className="text-xs sm:text-sm text-gray-500">Total Produk</p>
            </div>
            <h2 className="text-lg sm:text-2xl font-bold text-gray-900 mt-1 sm:mt-2 truncate">
              {totalCount}
            </h2>
          </div>
          {/* Rata-rata Margin — bottom-right on mobile, last on desktop */}
          <div className="sm:order-3 bg-white/80 backdrop-blur border border-indigo-100 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-sm hover:shadow-md hover:border-indigo-200 transition">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp size={14} className="text-green-400 shrink-0" />
              <p className="text-xs sm:text-sm text-gray-500">
                Rata-rata Margin
              </p>
            </div>
            <h2
              className={`text-lg sm:text-2xl font-bold mt-1 sm:mt-2 truncate ${
                avgMargin < 0
                  ? "text-red-600"
                  : avgMargin < 20
                    ? "text-yellow-600"
                    : "text-green-700"
              }`}
            >
              {totalCount > 0 ? `${avgMargin}%` : "—"}
            </h2>
          </div>
        </div>

        <div className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[minmax(180px,1fr)_200px_220px] md:items-center">
            <input
              type="text"
              placeholder="Cari nama item..."
              className="h-10 rounded-xl border border-indigo-200 bg-white px-3 text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-300"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
              }}
            />
            {productGroupOptions.length > 0 && (
              <select
                className="h-10 rounded-xl border border-indigo-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-300"
                value={productGroupFilter}
                onChange={(e) => {
                  setProductGroupFilter(e.target.value);
                  setCategoryFilter(null);
                  setPage(1);
                }}
              >
                <option value="">Semua Product</option>
                {productGroupOptions.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
            )}
            {filteredSubcategoryOptions.length > 0 && (
              <select
                className="h-10 rounded-xl border border-indigo-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-300"
                value={categoryFilter ?? ""}
                onChange={(e) => {
                  setCategoryFilter(
                    e.target.value === "" ? null : Number(e.target.value),
                  );
                  setPage(1);
                }}
              >
                <option value="">Semua Sub Category</option>
                {filteredSubcategoryOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* TABLE */}
        {loading && products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 bg-white rounded-3xl shadow">
            <Loader2 size={40} className="animate-spin text-indigo-400" />
            <p className="mt-4 text-sm font-semibold text-gray-400">
              Memuat produk...
            </p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-24 bg-white rounded-3xl shadow text-red-500">
            <AlertTriangle size={40} />
            <p className="mt-4 text-sm font-semibold">{error}</p>
            <button
              onClick={() => fetchProducts()}
              className="mt-4 px-4 py-2 bg-red-100 text-red-700 rounded-lg font-medium hover:bg-red-200 transition"
            >
              Coba lagi
            </button>
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400 bg-white rounded-3xl shadow">
            <ChefHat size={56} className="mb-4 text-indigo-200" />
            {search || productGroupFilter || categoryFilter ? (
              <>
                <p className="text-lg font-semibold">Produk tidak ditemukan.</p>
                <p className="text-sm mt-1">
                  Coba ubah kata pencarian atau pilihan filter.
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold">Belum ada produk.</p>
                <p className="text-sm mt-1">
                  Klik{" "}
                  <button
                    onClick={() => router.push("/dashboard/products/create")}
                    className="text-indigo-600 font-semibold hover:underline"
                  >
                    Tambah Produk
                  </button>{" "}
                  untuk mulai.
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            {/* ═══ MOBILE CARD VIEW ═══ */}
            <div className="md:hidden space-y-3">
              {products.map((product) => {
                const sp = Number(product.sellingPrice);
                const productGroup = getProductGroupName(product);
                return (
                  <div
                    key={product.id}
                    className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3"
                  >
                    {/* Top row: name + subcategory */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-500">
                          {productGroup}
                        </p>
                        <h3 className="font-bold text-slate-800 text-sm leading-tight">
                          {product.name}
                        </h3>
                        {product.category && (
                          <span className="inline-flex items-center gap-1 mt-1 bg-indigo-100 text-indigo-700 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                            <Tag size={10} />
                            Sub Category: {product.category.name}
                          </span>
                        )}
                      </div>
                      {/* Actions */}
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={() => setRecipeModal(product)}
                          className="p-1.5 rounded-full hover:bg-indigo-50 text-indigo-400 hover:text-indigo-600 transition"
                          title="Lihat resep"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => setEditModal(product)}
                          className="p-1.5 rounded-full hover:bg-green-50 text-green-500 hover:text-green-700 transition"
                          title="Edit"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => setDeleteModal(product)}
                          className="p-1.5 rounded-full hover:bg-red-50 text-red-300 hover:text-red-500 transition"
                          title="Hapus"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="text-xs">
                      <span className="text-gray-400 block">Harga</span>
                      <span className="font-bold text-indigo-700 text-sm">
                        {formatCurrency(sp)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ═══ DESKTOP TABLE ═══ */}
            <div className="hidden md:block bg-white rounded-3xl shadow-xl overflow-x-auto">
              <table className="w-full min-w-160 text-base">
                <thead className="bg-linear-to-r from-indigo-50 to-indigo-50 text-indigo-800 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="pl-5 pr-2 py-4 w-10">Product</th>
                    <th className="px-4 py-4 text-left font-bold cursor-pointer select-none">
                      <span className="inline-flex items-center">
                        Sub Category
                      </span>
                    </th>
                    <th className="px-6 py-4 text-left font-bold">Nama Item</th>
                    <th
                      className="px-6 py-4 text-right font-bold cursor-pointer select-none"
                      onClick={() => handleSortClick("sellingPrice")}
                    >
                      <span className="inline-flex items-center justify-end w-full">
                        Harga <SortIcon col="sellingPrice" />
                      </span>
                    </th>
                    <th className="px-6 py-4 text-center font-bold">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => {
                    const sp = Number(product.sellingPrice);
                    const productGroup = getProductGroupName(product);
                    return (
                      <tr
                        key={product.id}
                        className="border-t bg-white transition-all hover:bg-indigo-50/40"
                      >
                        <td className="pl-5 pr-2 py-4 font-semibold text-slate-700">
                          {productGroup}
                        </td>
                        <td className="px-4 py-4 align-middle">
                          <div className="font-bold text-slate-800">
                            {product.category?.name ?? "—"}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-semibold text-slate-800">
                            {product.name}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => setEditModal(product)}
                            title="Edit harga jual"
                            className="group inline-flex items-center justify-end gap-1.5 font-bold text-indigo-700 hover:text-indigo-900 transition"
                          >
                            <span>{formatCurrency(sp)}</span>
                            <Pencil
                              size={12}
                              className="opacity-0 group-hover:opacity-80 transition text-green-600 group-hover:text-green-900 shrink-0"
                            />
                          </button>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => setEditModal(product)}
                              title="Edit produk"
                              className="p-2 rounded-full hover:bg-green-50 text-green-600 hover:text-green-900 transition"
                            >
                              <Pencil
                                size={16}
                                className="text-green-600 hover:text-green-900"
                              />
                            </button>
                            <button
                              onClick={() => setDeleteModal(product)}
                              title="Hapus produk"
                              className="p-2 rounded-full hover:bg-red-50 text-red-300 hover:text-red-600 transition"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* PAGINATION BAR */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 sm:gap-6 px-2 py-4 sm:py-6">
                <button
                  className="px-3 sm:px-6 py-2 rounded-full border border-indigo-200 bg-white text-indigo-600 font-bold shadow transition hover:bg-indigo-50 disabled:opacity-40 text-xs sm:text-base"
                  disabled={page === 1 || loading}
                  onClick={() => handlePageChange(page - 1)}
                >
                  ‹ Prev
                </button>
                <span className="text-xs sm:text-base font-semibold text-indigo-700 bg-indigo-50 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full shadow-sm whitespace-nowrap">
                  {page} / {totalPages}
                </span>
                <button
                  className="px-3 sm:px-6 py-2 rounded-full border border-indigo-200 bg-white text-indigo-600 font-bold shadow transition hover:bg-indigo-50 disabled:opacity-40 text-xs sm:text-base"
                  disabled={page === totalPages || loading}
                  onClick={() => handlePageChange(page + 1)}
                >
                  Next ›
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {recipeModal && (
        <RecipeModal
          product={recipeModal}
          onClose={() => setRecipeModal(null)}
        />
      )}

      {/* Modal edit produk lengkap */}
      {editModal && (
        <EditProductModal
          product={editModal}
          categories={visibleCategories}
          onClose={() => setEditModal(null)}
          onSaved={(updated) => {
            setProducts((prev) =>
              prev.map((p) => (p.id === updated.id ? updated : p)),
            );
            refreshCategories();
            fetchProducts(page);
            setEditModal(null);
          }}
        />
      )}

      {deleteModal && (
        <DeleteConfirmModal
          product={deleteModal}
          onClose={() => setDeleteModal(null)}
          onDeleted={() => {
            setDeleteModal(null);
            fetchProducts(page);
          }}
        />
      )}

      {bulkDeleteOpen && (
        <BulkDeleteConfirmModal
          count={selectedIds.size}
          deleting={bulkDeleting}
          error={bulkDeleteError}
          onClose={() => setBulkDeleteOpen(false)}
          onConfirm={handleBulkDelete}
        />
      )}
    </>
  );
}
