"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  AlertTriangle,
  ChefHat,
  Eye,
  Pencil,
  Trash2,
  X,
  Loader2,
  Search,
  ArrowUpDown,
} from "lucide-react";
import {
  getProducts,
  getCategoryOptionsCached,
  deleteProduct,
  peekCachedCategoryOptions,
  peekCachedProducts,
  syncBakeryCatalogProducts,
} from "@/lib/api/products";
import type { Product, ProductCategory } from "@/types/product";
import EditProductModal from "./EditProductModal";
import UnifiedAddProductModal from "@/components/products/UnifiedAddProductModal";
import { useRole } from "@/context/RoleContext";
import {
  REMOVED_BAKERY_SUBCATEGORIES,
  resolveMainProductCategory,
} from "@/lib/products/main-category";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(value);

type SortByField = "name" | "sellingPrice" | "createdAt";
type SortOrderType = "asc" | "desc";

const PRODUCT_SORT_OPTIONS: Array<{
  label: string;
  sortBy: SortByField;
  sortOrder: SortOrderType;
}> = [
  { label: "Nama A-Z", sortBy: "name", sortOrder: "asc" },
  { label: "Nama Z-A", sortBy: "name", sortOrder: "desc" },
  { label: "Harga Tertinggi", sortBy: "sellingPrice", sortOrder: "desc" },
  { label: "Harga Terendah", sortBy: "sellingPrice", sortOrder: "asc" },
  { label: "Terbaru", sortBy: "createdAt", sortOrder: "desc" },
];

const REMOVED_SUBCATEGORY_NAMES = Array.from(REMOVED_BAKERY_SUBCATEGORIES);
const PRODUCT_PAGE_SIZE = 10;
const ALL_PRODUCTS_QUERY = {
  excludeCategoryNames: REMOVED_SUBCATEGORY_NAMES,
  sortBy: "createdAt" as const,
  sortOrder: "desc" as const,
  page: 1,
  limit: 999,
};

function getProductGroupName(product: Product): string {
  const subcategory = product.category?.name ?? "";
  return resolveMainProductCategory(subcategory);
}

function formatCompactCurrency(value: number): string {
  const amount = Math.max(0, Number(value || 0));
  if (amount >= 1_000_000) {
    const compact = amount / 1_000_000;
    return `${Number.isInteger(compact) ? compact : compact.toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    const compact = amount / 1_000;
    return `${Number.isInteger(compact) ? compact : compact.toFixed(1)}K`;
  }
  return String(amount);
}

function formatProductTimestamp(product: Product): string {
  const source = product.updatedAt || product.createdAt;
  if (!source) return "Baru dibuat";

  const date = new Date(source);
  if (Number.isNaN(date.getTime())) return "Baru dibuat";

  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getProductStatus(product: Product) {
  return product.isActive === false
    ? {
        label: "Nonaktif",
        badgeClassName: "bg-[#fdeaea] text-[#a83030]",
        cardClassName: "opacity-65",
      }
    : {
        label: "Aktif",
        badgeClassName: "bg-[#e0f0e8] text-[#2a5c3f]",
        cardClassName: "",
      };
}

function MarginBadge({ margin }: { margin: number }) {
  if (margin < -100) {
    return (
      <span className="font-semibold text-red-700">
        {margin}%{" "}
        <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
          Cek
        </span>
      </span>
    );
  }
  if (margin < 0) {
    return (
      <span className="font-semibold text-red-600">
        {margin}%{" "}
        <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-600">
          Rugi
        </span>
      </span>
    );
  }

  const color =
    margin >= 50
      ? "text-[#2a5c3f]"
      : margin >= 20
        ? "text-[#9a6b10]"
        : "text-[#a83030]";

  return <span className={`font-semibold ${color}`}>{margin}%</span>;
}

function RecipeModal({
  product,
  onClose,
}: {
  product: Product;
  onClose: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const cogs = Number(product.cogs);
  const sellingPrice = Number(product.sellingPrice);
  const margin =
    sellingPrice > 0 && cogs > 0
      ? Math.round(((sellingPrice - cogs) / sellingPrice) * 100)
      : null;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      style={{ zIndex: 200 }}
      onMouseDown={(event) =>
        event.target === overlayRef.current ? onClose() : undefined
      }
    >
      <div className="max-h-[85dvh] w-full overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-lg sm:rounded-3xl">
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-gray-200" />
        </div>
        <div className="flex items-start justify-between border-b border-gray-100 bg-[#fff7f1] px-6 py-4">
          <div>
            <h2 className="text-lg font-extrabold text-[#7c3410]">
              {product.name}
            </h2>
            {product.category ? (
              <span className="mt-1 inline-flex rounded-full bg-[#f5e0d0] px-2.5 py-0.5 text-xs font-semibold text-[#a84820]">
                Sub Category: {product.category.name}
              </span>
            ) : null}
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100 text-center">
          <div className="px-3 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
              Harga Jual
            </p>
            <p className="mt-1 text-sm font-extrabold text-[#c86030]">
              {formatCurrency(sellingPrice)}
            </p>
          </div>
          <div className="px-3 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
              COGS / HPP
            </p>
            <p className="mt-1 text-sm font-extrabold text-slate-700">
              {cogs > 0 ? formatCurrency(cogs) : "—"}
            </p>
          </div>
          <div className="px-3 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
              Margin
            </p>
            <p className="mt-1 text-sm font-extrabold">
              {margin !== null ? <MarginBadge margin={margin} /> : "—"}
            </p>
          </div>
        </div>

        <div className="max-h-[55dvh] overflow-y-auto px-4 py-4 sm:px-6">
          {product.recipes.length === 0 ? (
            <p className="py-8 text-center text-sm italic text-gray-400">
              Tidak ada bahan dalam resep ini.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 px-3 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                <div className="col-span-5">Bahan</div>
                <div className="col-span-2 text-right">Jml</div>
                <div className="col-span-2">Satuan</div>
                <div className="col-span-3 text-right">Biaya</div>
              </div>
              {product.recipes.map((recipe) => {
                const costPerUnit = Number(recipe.ingredient.costPerUnit ?? 0);
                const rowCost = Number(recipe.quantity) * costPerUnit;

                return (
                  <div
                    key={recipe.id}
                    className="grid grid-cols-12 items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5"
                  >
                    <div className="col-span-5 truncate text-sm font-medium text-slate-700">
                      {recipe.ingredient.name}
                    </div>
                    <div className="col-span-2 text-right text-sm text-gray-600">
                      {Number(recipe.quantity)}
                    </div>
                    <div className="col-span-2 text-sm text-gray-500">
                      {recipe.ingredient.unit}
                    </div>
                    <div className="col-span-3 text-right text-xs font-bold text-[#7c3410]">
                      {rowCost > 0 ? formatCurrency(rowCost) : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function DeleteConfirmModal({
  product,
  onClose,
  onDeleted,
}: {
  product: Product;
  onClose: () => void;
  onDeleted: () => void | Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteProduct(product.id);
      await onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus produk");
      setDeleting(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      style={{ zIndex: 200 }}
      onMouseDown={(event) =>
        event.target === overlayRef.current ? onClose() : undefined
      }
    >
      <div className="w-full overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-sm sm:rounded-3xl">
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-gray-200" />
        </div>
        <div className="space-y-4 px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
              <Trash2 size={18} />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-800">
                Hapus Produk?
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                <span className="font-semibold text-slate-700">
                  {product.name}
                </span>{" "}
                dan seluruh resepnya akan dihapus permanen.
              </p>
            </div>
          </div>

          {error ? (
            <div className="rounded-xl bg-red-50 p-3 text-xs text-red-600">
              {error}
            </div>
          ) : null}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600"
            >
              Batal
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
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

export default function ProductsPage() {
  const { isOwner, isAdmin, loading: roleLoading } = useRole();
  const canManageProducts = isOwner;
  const searchParams = useSearchParams();
  const router = useRouter();
  const latestRequestRef = useRef(0);
  const initialSearch = searchParams.get("search") ?? "";
  const initialProductsSnapshot =
    typeof window !== "undefined"
      ? peekCachedProducts(ALL_PRODUCTS_QUERY)
      : null;

  const [allProducts, setAllProducts] = useState<Product[]>(
    () => initialProductsSnapshot?.data ?? [],
  );
  const [categories, setCategories] = useState<ProductCategory[]>(
    () => peekCachedCategoryOptions(),
  );
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [productGroupFilter, setProductGroupFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<SortByField>("name");
  const [sortOrder, setSortOrder] = useState<SortOrderType>("asc");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(() => !initialProductsSnapshot);
  const [error, setError] = useState<string | null>(null);
  const [syncingCatalog, setSyncingCatalog] = useState(false);
  const [syncCatalogMessage, setSyncCatalogMessage] = useState<string | null>(
    null,
  );
  const [editModal, setEditModal] = useState<Product | null>(null);
  const [deleteModal, setDeleteModal] = useState<Product | null>(null);
  const [recipeModal, setRecipeModal] = useState<Product | null>(null);
  const [addProductModalOpen, setAddProductModalOpen] = useState(false);
  const activeFetchControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void getCategoryOptionsCached()
      .then((data) => {
        setCategories(data);
      })
      .catch(() => {});
  }, []);

  const visibleCategories = useMemo(
    () =>
      categories.filter(
        (category) => !REMOVED_BAKERY_SUBCATEGORIES.has(category.name),
      ),
    [categories],
  );

  const productGroupOptions = useMemo(() => {
    const groups = new Set(
      visibleCategories.map(
        (category) => resolveMainProductCategory(category.name),
      ),
    );
    return Array.from(groups).sort((a, b) => a.localeCompare(b));
  }, [visibleCategories]);

  const filteredSubcategoryOptions = useMemo(() => {
    if (!productGroupFilter) return visibleCategories;
    return visibleCategories.filter(
      (category) =>
        resolveMainProductCategory(category.name) === productGroupFilter,
    );
  }, [productGroupFilter, visibleCategories]);

  const normalizedSearch = searchInput.trim().toLowerCase();

  const filteredProducts = useMemo(() => {
    const matchesSearch = (product: Product) => {
      if (!normalizedSearch) return true;
      const haystacks = [
        product.name,
        product.category?.name ?? "",
        getProductGroupName(product),
      ];
      return haystacks.some((value) =>
        value.toLowerCase().includes(normalizedSearch),
      );
    };

    return allProducts.filter((product) => {
      if (!matchesSearch(product)) return false;
      if (normalizedSearch) return true;
      if (categoryFilter !== null) {
        return product.category?.id === categoryFilter;
      }
      if (productGroupFilter) {
        return getProductGroupName(product) === productGroupFilter;
      }
      return true;
    });
  }, [allProducts, categoryFilter, normalizedSearch, productGroupFilter]);

  const sortedProducts = useMemo(() => {
    const next = [...filteredProducts];
    next.sort((left, right) => {
      if (sortBy === "name") {
        const comparison = left.name.localeCompare(right.name, "id");
        return sortOrder === "asc" ? comparison : -comparison;
      }
      if (sortBy === "sellingPrice") {
        const comparison =
          Number(left.sellingPrice || 0) - Number(right.sellingPrice || 0);
        return sortOrder === "asc" ? comparison : -comparison;
      }

      const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
      const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
      const comparison = leftTime - rightTime;
      return sortOrder === "asc" ? comparison : -comparison;
    });
    return next;
  }, [filteredProducts, sortBy, sortOrder]);

  const totalCount = sortedProducts.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PRODUCT_PAGE_SIZE));
  const avgSellingPrice =
    totalCount > 0
      ? Math.round(
          sortedProducts.reduce(
            (sum, product) => sum + Number(product.sellingPrice || 0),
            0,
          ) / totalCount,
        )
      : 0;
  const marginValues = sortedProducts
    .map((product) => {
      const sellingPrice = Number(product.sellingPrice || 0);
      const cogs = Number(product.cogs || 0);
      if (sellingPrice <= 0 || cogs <= 0) return null;
      return Math.max(-200, Math.min(100, ((sellingPrice - cogs) / sellingPrice) * 100));
    })
    .filter((value): value is number => value !== null);
  const avgMargin =
    marginValues.length > 0
      ? Math.round(
          marginValues.reduce((sum, value) => sum + value, 0) /
            marginValues.length,
        )
      : 0;
  const pageProducts = useMemo(() => {
    const startIndex = (page - 1) * PRODUCT_PAGE_SIZE;
    return sortedProducts.slice(startIndex, startIndex + PRODUCT_PAGE_SIZE);
  }, [page, sortedProducts]);

  useEffect(() => {
    const searchFromUrl = searchParams.get("search") ?? "";
    setSearchInput(searchFromUrl);
    if (searchFromUrl.trim()) {
      setProductGroupFilter("");
      setCategoryFilter(null);
    }
    setPage(1);
  }, [searchParams]);

  useEffect(() => {
    if (searchParams.get("addProduct") !== "1") return;
    if (!canManageProducts) {
      router.replace("/dashboard/products", { scroll: false });
      return;
    }
    setAddProductModalOpen(true);
    router.replace("/dashboard/products", { scroll: false });
  }, [canManageProducts, router, searchParams]);

  const refreshProducts = async () => {
    activeFetchControllerRef.current?.abort();
    const controller = new AbortController();
    activeFetchControllerRef.current = controller;
    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;
    setError(null);

    const cachedSnapshot = peekCachedProducts(ALL_PRODUCTS_QUERY);
    if (cachedSnapshot) {
      setAllProducts(cachedSnapshot.data);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      const { data } = await getProducts(ALL_PRODUCTS_QUERY, {
        signal: controller.signal,
      });

      if (requestId !== latestRequestRef.current) return;
      setAllProducts(data);
    } catch (err) {
      if (requestId !== latestRequestRef.current) return;
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Failed to fetch products");
    } finally {
      if (activeFetchControllerRef.current === controller) {
        activeFetchControllerRef.current = null;
      }
      if (requestId === latestRequestRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(
    () => () => {
      activeFetchControllerRef.current?.abort();
    },
    [],
  );

  const refreshCategories = async () => {
    try {
      const data = await getCategoryOptionsCached();
      setCategories(data);
    } catch {
      // Optional path only.
    }
  };

  const handleSyncBakeryCatalog = async () => {
    if (!canManageProducts) return;
    setSyncingCatalog(true);
    setError(null);
    setSyncCatalogMessage(null);
    try {
      const result = await syncBakeryCatalogProducts();
      setProductGroupFilter("");
      setCategoryFilter(null);
      setSearchInput("");
      setPage(1);
      await refreshCategories();
      await refreshProducts();
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
    void refreshProducts();
  }, []);

  useEffect(() => {
    if (!categoryFilter) return;
    if (
      filteredSubcategoryOptions.some((category) => category.id === categoryFilter)
    ) {
      return;
    }
    setCategoryFilter(null);
    setPage(1);
  }, [categoryFilter, filteredSubcategoryOptions]);

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);

  const activeSortLabel = useMemo(
    () =>
      PRODUCT_SORT_OPTIONS.find(
        (option) => option.sortBy === sortBy && option.sortOrder === sortOrder,
      )?.label ?? "Nama A-Z",
    [sortBy, sortOrder],
  );

  const cycleSortOption = () => {
    const currentIndex = PRODUCT_SORT_OPTIONS.findIndex(
      (option) => option.sortBy === sortBy && option.sortOrder === sortOrder,
    );
    const nextOption =
      PRODUCT_SORT_OPTIONS[
        currentIndex >= 0
          ? (currentIndex + 1) % PRODUCT_SORT_OPTIONS.length
          : 0
      ];
    setSortBy(nextOption.sortBy);
    setSortOrder(nextOption.sortOrder);
    setPage(1);
  };

  const handlePageChange = (nextPage: number) => {
    const boundedPage = Math.min(Math.max(1, nextPage), totalPages);
    if (boundedPage === page || loading) return;
    setPage(boundedPage);
  };

  return (
    <>
      <div className="mx-auto max-w-6xl space-y-5 text-[#1e120a]">
        <section className="overflow-hidden rounded-[30px] border border-[#d9cabc] bg-[#f2eae1] shadow-[0_24px_60px_-40px_rgba(30,18,10,0.35)]">
          <div className="flex items-center justify-between gap-3 border-b border-[#e0d0c4] px-4 py-4 sm:px-5">
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-[#1e120a] sm:text-xl">
                Products
              </h1>
              <p className="mt-0.5 text-xs text-[#b89080]">
                {totalCount} produk · {visibleCategories.length} kategori
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSyncBakeryCatalog}
                disabled={syncingCatalog || !canManageProducts}
                className="hidden rounded-full border border-[#d7b6a1] bg-white px-3 py-2 text-xs font-semibold text-[#7c3410] transition hover:bg-[#fff7f1] disabled:opacity-60 sm:inline-flex"
              >
                {syncingCatalog ? "Sync..." : "Sync Catalog"}
              </button>
              {canManageProducts ? (
                <button
                  onClick={() => setAddProductModalOpen(true)}
                  className="inline-flex items-center gap-1 rounded-full bg-[#c86030] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#a84820]"
                >
                  <Plus size={16} />
                  Tambah
                </button>
              ) : null}
            </div>
          </div>

          <div className="space-y-4 px-4 py-4 sm:px-5">
            {syncCatalogMessage ? (
              <div className="rounded-2xl border border-[#d8eadf] bg-[#f4fbf7] px-4 py-3 text-sm font-semibold text-[#2a5c3f]">
                {syncCatalogMessage}
              </div>
            ) : null}

            {!roleLoading && isAdmin ? (
              <div className="rounded-2xl border border-[#eadccf] bg-[#fff8f2] px-4 py-3 text-sm font-medium text-[#8c6248]">
                Role Admin hanya bisa melihat data product. Ubah, hapus, tambah, dan sync hanya untuk Owner.
              </div>
            ) : null}

            <div className="flex items-center gap-3 rounded-[18px] border border-[#e0d0c4] bg-[#fdfaf7] px-4 py-3 shadow-[0_1px_4px_rgba(30,18,10,0.06)]">
              <Search size={18} className="shrink-0 text-[#c86030]" />
              <input
                type="text"
                placeholder="Cari nama produk..."
                className="h-6 w-full bg-transparent text-sm text-[#1e120a] outline-none placeholder:text-[#b89080]"
                value={searchInput}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setSearchInput(nextValue);
                  if (nextValue.trim()) {
                    setProductGroupFilter("");
                    setCategoryFilter(null);
                  }
                  setPage(1);
                }}
              />
            </div>

            {productGroupOptions.length > 0 ? (
              <div className="-mx-1 overflow-x-auto">
                <div className="flex min-w-max gap-2 px-1">
                  <button
                    type="button"
                    onClick={() => {
                      setProductGroupFilter("");
                      setCategoryFilter(null);
                      setPage(1);
                    }}
                    className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                      !productGroupFilter
                        ? "border-[#c86030] bg-[#c86030] text-white"
                        : "border-[#e0d0c4] bg-[#fdfaf7] text-[#6b4a38]"
                    }`}
                  >
                    Semua
                  </button>
                  {productGroupOptions.map((group) => (
                    <button
                      key={group}
                      type="button"
                      onClick={() => {
                        setProductGroupFilter(group);
                        setCategoryFilter(null);
                        setPage(1);
                      }}
                      className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                        productGroupFilter === group
                          ? "border-[#c86030] bg-[#c86030] text-white"
                          : "border-[#e0d0c4] bg-[#fdfaf7] text-[#6b4a38]"
                      }`}
                    >
                      {group}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {filteredSubcategoryOptions.length > 0 ? (
              <select
                className="h-11 w-full rounded-2xl border border-[#e0d0c4] bg-[#fdfaf7] px-4 text-sm text-[#1e120a] outline-none"
                value={categoryFilter ?? ""}
                onChange={(e) => {
                  setCategoryFilter(
                    e.target.value === "" ? null : Number(e.target.value),
                  );
                  setPage(1);
                }}
              >
                <option value="">Semua Subkategori</option>
                {filteredSubcategoryOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3 px-1">
            <div>
              <h2 className="text-[1.55rem] font-bold text-[#1e120a]">
                {totalCount} produk
              </h2>
              <p className="text-xs text-[#8d6a55]">
                Rata-rata harga {totalCount > 0 ? formatCurrency(avgSellingPrice) : "—"}
                {" · "}
                margin {totalCount > 0 ? `${avgMargin}%` : "—"}
              </p>
            </div>
            <button
              type="button"
              onClick={cycleSortOption}
              className="inline-flex items-center gap-1 text-sm font-semibold text-[#7c3410] transition hover:text-[#a84820]"
            >
              <ArrowUpDown size={14} />
              Sort
            </button>
          </div>

          <p className="px-1 text-xs text-[#b89080]">
            Urutan aktif: {activeSortLabel}
          </p>

          {loading && allProducts.length === 0 ? (
            <div className="rounded-[24px] border border-[#e0d0c4] bg-[#fdfaf7] px-6 py-16 text-center">
              <Loader2 size={28} className="mx-auto animate-spin text-[#c86030]" />
              <p className="mt-3 text-sm font-semibold text-[#8d6a55]">
                Memuat produk...
              </p>
            </div>
          ) : error ? (
            <div className="rounded-[24px] border border-[#f0cbc6] bg-[#fff7f5] px-6 py-12 text-center text-[#a83030]">
              <AlertTriangle size={28} className="mx-auto" />
              <p className="mt-3 text-sm font-semibold">{error}</p>
              <button
                onClick={() => void refreshProducts()}
                className="mt-4 rounded-full border border-[#e8b8b1] bg-white px-4 py-2 text-sm font-semibold text-[#a83030]"
              >
                Coba lagi
              </button>
            </div>
          ) : pageProducts.length === 0 ? (
            <div className="rounded-[24px] border border-[#e0d0c4] bg-[#fdfaf7] px-6 py-14 text-center text-[#8d6a55]">
              <ChefHat size={34} className="mx-auto text-[#c9a48f]" />
              {normalizedSearch || productGroupFilter || categoryFilter ? (
                <>
                  <p className="mt-3 text-base font-bold text-[#1e120a]">
                    Produk tidak ditemukan
                  </p>
                  <p className="mt-1 text-sm">
                    Coba ubah kata pencarian atau filter yang dipakai.
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-3 text-base font-bold text-[#1e120a]">
                    Belum ada produk
                  </p>
                  {canManageProducts ? (
                    <button
                      onClick={() => setAddProductModalOpen(true)}
                      className="mt-4 rounded-full bg-[#c86030] px-4 py-2 text-sm font-bold text-white"
                    >
                      Tambah Produk
                    </button>
                  ) : null}
                </>
              )}
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {pageProducts.map((product) => {
                  const sellingPrice = Number(product.sellingPrice || 0);
                  const cogs = Number(product.cogs || 0);
                  const margin =
                    sellingPrice > 0 && cogs > 0
                      ? Math.round(((sellingPrice - cogs) / sellingPrice) * 100)
                      : null;
                  const productGroup = getProductGroupName(product);
                  const stock =
                    product.productType === "ReadyStock"
                      ? Math.max(0, Number(product.availableStock ?? 0))
                      : 0;
                  const status = getProductStatus(product);

                  return (
                    <article
                      key={product.id}
                      className={`overflow-hidden rounded-[20px] border border-[#e0d0c4] bg-[#fdfaf7] shadow-[0_1px_4px_rgba(30,18,10,0.06)] ${status.cardClassName}`}
                    >
                      <div className="flex items-start justify-between gap-3 border-b border-[#e0d0c4] px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setRecipeModal(product)}
                          className="min-w-0 flex-1 text-left"
                          title="Lihat detail resep"
                        >
                          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#c86030]">
                            {productGroup}
                          </p>
                          <h3 className="mt-0.5 line-clamp-2 text-[1rem] font-bold text-[#1e120a]">
                            {product.name}
                          </h3>
                          <p className="mt-1 text-[11px] text-[#6b4a38]">
                            Sub: {product.category?.name ?? "Tanpa subkategori"}
                          </p>
                        </button>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setRecipeModal(product)}
                            className="rounded-full p-1.5 text-[#8d6a55] transition hover:bg-[#f5e0d0] hover:text-[#7c3410]"
                            title="Lihat resep"
                          >
                            <Eye size={15} />
                          </button>
                          {canManageProducts ? (
                            <>
                              <button
                                onClick={() => setEditModal(product)}
                                className="rounded-full p-1.5 text-[#f06b2b] transition hover:bg-[#fff0e7]"
                                title="Edit produk"
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                onClick={() => setDeleteModal(product)}
                                className="rounded-full p-1.5 text-[#6f6f8f] transition hover:bg-[#f5f2ef]"
                                title="Hapus produk"
                              >
                                <Trash2 size={15} />
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>

                      <div className="grid grid-cols-5 border-b border-[#e0d0c4] px-3 py-3">
                        <div className="border-r border-[#e0d0c4] px-1 text-center">
                          <p className="text-[10px] text-[#b89080]">Harga</p>
                          <p className="mt-1 text-sm font-bold text-[#c86030]">
                            {formatCompactCurrency(sellingPrice)}
                          </p>
                        </div>
                        <div className="border-r border-[#e0d0c4] px-1 text-center">
                          <p className="text-[10px] text-[#b89080]">COGS / HPP</p>
                          <p className="mt-1 text-sm font-semibold text-[#1e120a]">
                            {cogs > 0 ? formatCompactCurrency(cogs) : "—"}
                          </p>
                        </div>
                        <div className="border-r border-[#e0d0c4] px-1 text-center">
                          <p className="text-[10px] text-[#b89080]">Margin</p>
                          <p className="mt-1 text-sm font-bold">
                            {margin !== null ? <MarginBadge margin={margin} /> : "—"}
                          </p>
                        </div>
                        <div className="border-r border-[#e0d0c4] px-1 text-center">
                          <p className="text-[10px] text-[#b89080]">Token</p>
                          <p className="mt-1 text-sm font-semibold text-[#1e120a]">
                            {Math.max(0, Number(product.productionToken ?? 0))}
                          </p>
                        </div>
                        <div className="px-1 text-center">
                          <p className="text-[10px] text-[#b89080]">Stok</p>
                          <p className="mt-1 text-sm font-semibold text-[#1e120a]">
                            {stock}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${status.badgeClassName}`}
                        >
                          • {status.label}
                        </span>
                        <p className="text-[10px] text-[#b89080]">
                          Diperbarui {formatProductTimestamp(product)}
                        </p>
                      </div>
                    </article>
                  );
                })}
              </div>

              {totalPages > 1 ? (
                <div className="flex items-center justify-center gap-3 py-2">
                  <button
                    className="rounded-full border border-[#e0d0c4] bg-[#fdfaf7] px-4 py-2 text-sm font-semibold text-[#7c3410] disabled:opacity-40"
                    disabled={page === 1 || loading}
                    onClick={() => handlePageChange(page - 1)}
                  >
                    Prev
                  </button>
                  <span className="rounded-full bg-[#f5e0d0] px-4 py-2 text-sm font-semibold text-[#7c3410]">
                    {page} / {totalPages}
                  </span>
                  <button
                    className="rounded-full border border-[#e0d0c4] bg-[#fdfaf7] px-4 py-2 text-sm font-semibold text-[#7c3410] disabled:opacity-40"
                    disabled={page === totalPages || loading}
                    onClick={() => handlePageChange(page + 1)}
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>

      {recipeModal ? (
        <RecipeModal
          product={recipeModal}
          onClose={() => setRecipeModal(null)}
        />
      ) : null}

      {editModal ? (
        <EditProductModal
          product={editModal}
          categories={visibleCategories}
          onClose={() => setEditModal(null)}
          onSaved={(updated) => {
            setAllProducts((prev) =>
              prev.map((product) => (product.id === updated.id ? updated : product)),
            );
            setRecipeModal((prev) => (prev?.id === updated.id ? updated : prev));
            void refreshCategories();
            setEditModal(null);
          }}
        />
      ) : null}

      {deleteModal ? (
        <DeleteConfirmModal
          product={deleteModal}
          onClose={() => setDeleteModal(null)}
          onDeleted={() => {
            const nextPage =
              pageProducts.length <= 1 && page > 1 ? page - 1 : page;
            setAllProducts((prev) =>
              prev.filter((product) => product.id !== deleteModal.id),
            );
            setDeleteModal(null);
            setPage(nextPage);
          }}
        />
      ) : null}

      <UnifiedAddProductModal
        open={addProductModalOpen}
        onClose={() => setAddProductModalOpen(false)}
        onSaved={() => {
          void refreshProducts();
          void refreshCategories();
        }}
      />
    </>
  );
}
