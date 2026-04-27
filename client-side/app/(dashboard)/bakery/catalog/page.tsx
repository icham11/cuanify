"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import GradientPageHeader from "@/components/bakery/shared/GradientPageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatCurrency } from "@/components/orders/formatters";
import UnifiedAddProductModal from "@/components/products/UnifiedAddProductModal";
import {
  makeAddOnKey,
  makeProductKey,
  makeVariantKey,
  useCatalogAdminState,
} from "@/lib/bookings/catalog-admin";
import { PackagePlus, Plus, Settings2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

type CatalogModalType = "product" | "addon" | null;
type ProductFieldMode = "existing" | "new";

function buildDefaultProductDraft(category: string) {
  return {
    category,
    categoryMode: "existing" as ProductFieldMode,
    newCategory: "",
    subcategory: "",
    subcategoryMode: "existing" as ProductFieldMode,
    newSubcategory: "",
    productName: "",
    variantLabel: "",
    price: 0,
  };
}

function makeAddOnId(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function BakeryCatalogPage() {
  const {
    state,
    productCatalog,
    addOnCatalog,
    syncStatus,
    lastSyncedAt,
    setCatalogAdminState,
    resetCatalogAdminState,
    retrySync,
  } = useCatalogAdminState();

  const syncLabel =
    syncStatus === "syncing"
      ? "Syncing to server..."
      : syncStatus === "synced"
        ? `Synced ${lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString("id-ID") : ""}`
        : syncStatus === "error"
          ? "Server sync failed (local saved)"
          : "Local mode";

  const categories = useMemo(
    () =>
      Array.from(
        new Set([
          ...productCatalog.map((entry) => entry.category),
          ...Object.keys(addOnCatalog),
        ]),
      ),
    [addOnCatalog, productCatalog],
  );

  const firstCategory = categories[0] ?? "Cake";
  const [selectedProductCategory, setSelectedProductCategory] =
    useState(firstCategory);
  const [selectedProductSubcategory, setSelectedProductSubcategory] =
    useState("");
  const [selectedAddOnCategory, setSelectedAddOnCategory] =
    useState(firstCategory);
  const [newProduct, setNewProduct] = useState(() =>
    buildDefaultProductDraft(firstCategory),
  );
  const [newAddOn, setNewAddOn] = useState({
    category: firstCategory,
    categoryMode: "existing" as ProductFieldMode,
    newCategory: "",
    id: "",
    label: "",
    price: 0,
  });
  const [activeModal, setActiveModal] = useState<CatalogModalType>(null);
  const [unifiedAddProductOpen, setUnifiedAddProductOpen] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const isProductModal = activeModal === "product";

  const selectedCategoryData =
    productCatalog.find((entry) => entry.category === newProduct.category) ??
    productCatalog[0];
  const subcategories = selectedCategoryData?.subcategories ?? [];
  const effectiveNewProductCategory =
    newProduct.categoryMode === "new"
      ? newProduct.newCategory.trim()
      : newProduct.category;
  const effectiveNewProductSubcategory =
    newProduct.subcategoryMode === "new"
      ? newProduct.newSubcategory.trim()
      : newProduct.subcategory;
  const effectiveNewAddOnCategory =
    newAddOn.categoryMode === "new"
      ? newAddOn.newCategory.trim()
      : newAddOn.category;
  const selectedProductCategoryData =
    productCatalog.find(
      (entry) => entry.category === selectedProductCategory,
    ) ?? productCatalog[0];
  const selectedProductSubcategories =
    selectedProductCategoryData?.subcategories ?? [];
  const selectedProductSubcategoryData =
    selectedProductSubcategories.find(
      (entry) => entry.name === selectedProductSubcategory,
    ) ?? selectedProductSubcategories[0];
  const selectedAddOnCategoryKey = categories.includes(selectedAddOnCategory)
    ? selectedAddOnCategory
    : firstCategory;
  const selectedAddOns = addOnCatalog[selectedAddOnCategoryKey] ?? [];

  useEffect(() => {
    if (!activeModal) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => modalRef.current?.focus(), 0);

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [activeModal]);

  const openProductModal = () => setActiveModal("product");
  const openAddOnModal = () => setActiveModal("addon");
  const closeModal = () => {
    setActiveModal(null);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });
  };

  const setVariantPrice = (
    category: string,
    subcategory: string,
    productName: string,
    variantLabel: string,
    price: number,
  ) => {
    const key = makeVariantKey(
      category,
      subcategory,
      productName,
      variantLabel,
    );
    setCatalogAdminState((prev) => ({
      ...prev,
      productVariantPriceOverrides: {
        ...prev.productVariantPriceOverrides,
        [key]: Math.max(0, Math.round(Number(price || 0))),
      },
    }));
  };

  const setAddOnPrice = (category: string, id: string, price: number) => {
    const key = makeAddOnKey(category, id);
    setCatalogAdminState((prev) => ({
      ...prev,
      addOnPriceOverrides: {
        ...prev.addOnPriceOverrides,
        [key]: Math.max(0, Math.round(Number(price || 0))),
      },
    }));
  };

  const toggleProductActive = (
    category: string,
    subcategory: string,
    productName: string,
  ) => {
    const key = makeProductKey(category, subcategory, productName);
    setCatalogAdminState((prev) => {
      const exists = prev.inactiveProducts.includes(key);
      return {
        ...prev,
        inactiveProducts: exists
          ? prev.inactiveProducts.filter((item) => item !== key)
          : [...prev.inactiveProducts, key],
      };
    });
  };

  const toggleAddOnActive = (category: string, id: string) => {
    const key = makeAddOnKey(category, id);
    setCatalogAdminState((prev) => {
      const exists = prev.inactiveAddOns.includes(key);
      return {
        ...prev,
        inactiveAddOns: exists
          ? prev.inactiveAddOns.filter((item) => item !== key)
          : [...prev.inactiveAddOns, key],
      };
    });
  };

  const handleAddCustomProduct = () => {
    const category = effectiveNewProductCategory;
    const subcategory = effectiveNewProductSubcategory;
    const productName = newProduct.productName.trim();
    const variantLabel = newProduct.variantLabel.trim();

    if (
      !category ||
      !subcategory ||
      !productName ||
      !variantLabel
    ) {
      toast.error(
        "Lengkapi category, subcategory, product, dan variant label.",
      );
      return;
    }

    setCatalogAdminState((prev) => ({
      ...prev,
      customProducts: [
        ...prev.customProducts,
        {
          category,
          subcategory,
          productName,
          variantLabel,
          price: Math.max(0, Math.round(Number(newProduct.price || 0))),
        },
      ],
    }));

    toast.success("Custom product ditambahkan ke katalog aktif.");
    setSelectedProductCategory(category);
    setSelectedProductSubcategory(subcategory);
    closeModal();
    setNewProduct((prev) => ({
      ...prev,
      category,
      categoryMode: "existing",
      newCategory: "",
      subcategory,
      subcategoryMode: "existing",
      newSubcategory: "",
      productName: "",
      variantLabel: "",
      price: 0,
    }));
  };

  const handleAddCustomAddOn = () => {
    const category = effectiveNewAddOnCategory;
    const label = newAddOn.label.trim();
    const id = (newAddOn.id.trim() || makeAddOnId(label)).trim();

    if (!category || !id || !label) {
      toast.error("Lengkapi category dan label add-on.");
      return;
    }

    setCatalogAdminState((prev) => ({
      ...prev,
      customAddOns: [
        ...prev.customAddOns,
        {
          category,
          id,
          label,
          price: Math.max(0, Math.round(Number(newAddOn.price || 0))),
        },
      ],
    }));

    toast.success("Custom add-on ditambahkan.");
    setSelectedAddOnCategory(category);
    closeModal();
    setNewAddOn((prev) => ({
      ...prev,
      category,
      categoryMode: "existing",
      newCategory: "",
      id: "",
      label: "",
      price: 0,
    }));
  };

  return (
    <div className="space-y-6 pb-10">
      <GradientPageHeader
        title="Catalog Management"
        description="Kelola harga, active/inactive, dan item baru sesuai SOP tanpa edit kode."
        icon={Settings2}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              className="gap-2 border-[#ffd9b8] bg-white text-[#173a7a] shadow-sm hover:bg-[#fff4ed]"
              onClick={() => setUnifiedAddProductOpen(true)}
            >
              <PackagePlus size={16} />
              Tambah Product
            </Button>
            <Button
              type="button"
              className="gap-2 bg-[#f36f21] text-white shadow-sm hover:bg-[#d85f1c]"
              onClick={openAddOnModal}
            >
              <Sparkles size={16} />
              Tambah Add-On
            </Button>
          </div>
        }
      />

      <Card className="rounded-xl border-indigo-100 shadow-sm">
        <CardContent className="px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium text-gray-600">Sync status</span>
            <div className="flex items-center gap-2">
              <span
                className={`font-semibold ${
                  syncStatus === "synced"
                    ? "text-emerald-700"
                    : syncStatus === "syncing"
                      ? "text-indigo-700"
                      : syncStatus === "error"
                        ? "text-rose-700"
                        : "text-gray-500"
                }`}
              >
                {syncLabel}
              </span>
              {syncStatus === "error" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={retrySync}
                  className="h-8 border-rose-200 text-rose-700 hover:bg-rose-50"
                >
                  Retry Sync
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 border-rose-200 text-rose-600 hover:bg-rose-50"
                onClick={() => {
                  resetCatalogAdminState();
                  toast.success("Catalog override di-reset ke default pricelist.");
                }}
              >
                Reset Overrides
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl shadow-sm">
        <CardHeader className="p-6 pb-2">
          <CardTitle>Product Pricing & Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 px-6 pb-6 pt-0">
          <div className="grid gap-3 rounded-xl border border-gray-100 bg-gray-50/70 p-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium text-gray-700">
              Product Category
              <Select
                value={selectedProductCategoryData?.category ?? ""}
                onChange={(event) => {
                  const category = productCatalog.find(
                    (entry) => entry.category === event.target.value,
                  );
                  setSelectedProductCategory(event.target.value);
                  setSelectedProductSubcategory(
                    category?.subcategories[0]?.name ?? "",
                  );
                }}
              >
                {productCatalog.map((category) => (
                  <option key={category.category} value={category.category}>
                    {category.category}
                  </option>
                ))}
              </Select>
            </label>

            <label className="grid gap-1 text-sm font-medium text-gray-700">
              Sub Category
              <Select
                value={selectedProductSubcategoryData?.name ?? ""}
                onChange={(event) =>
                  setSelectedProductSubcategory(event.target.value)
                }
              >
                {selectedProductSubcategories.map((subcategory) => (
                  <option key={subcategory.name} value={subcategory.name}>
                    {subcategory.name}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          {selectedProductCategoryData && selectedProductSubcategoryData ? (
            <div className="space-y-3 rounded-xl border border-gray-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {selectedProductCategoryData.category}
                  </p>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {selectedProductSubcategoryData.name}
                  </p>
                </div>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                  {selectedProductSubcategoryData.products.length} product
                </span>
              </div>

              <div className="space-y-2">
                {selectedProductSubcategoryData.products.map((product) => {
                  const productKey = makeProductKey(
                    selectedProductCategoryData.category,
                    selectedProductSubcategoryData.name,
                    product.name,
                  );
                  const inactive = state.inactiveProducts.includes(productKey);

                  return (
                    <div
                      key={product.name}
                      className="space-y-2 rounded-lg border border-gray-100 bg-gray-50/50 p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-gray-900">
                          {product.name}
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          className={
                            inactive
                              ? "border-emerald-200 text-emerald-700"
                              : "border-rose-200 text-rose-600"
                          }
                          onClick={() =>
                            toggleProductActive(
                              selectedProductCategoryData.category,
                              selectedProductSubcategoryData.name,
                              product.name,
                            )
                          }
                        >
                          {inactive ? "Activate" : "Deactivate"}
                        </Button>
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        {product.variants.map((variant) => (
                          <label
                            key={variant.label}
                            className="grid gap-1 rounded-lg border border-gray-200 bg-white p-2 text-xs"
                          >
                            <span className="font-semibold text-gray-600">
                              {variant.label}
                            </span>
                            <Input
                              type="number"
                              min={0}
                              step={1000}
                              defaultValue={variant.price}
                              onBlur={(event) =>
                                setVariantPrice(
                                  selectedProductCategoryData.category,
                                  selectedProductSubcategoryData.name,
                                  product.name,
                                  variant.label,
                                  Number(event.target.value || 0),
                                )
                              }
                            />
                            <span className="text-gray-500">
                              {formatCurrency(variant.price)}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-200 p-6 text-sm text-gray-500">
              Belum ada product di katalog aktif.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl shadow-sm">
        <CardHeader className="p-6 pb-2">
          <CardTitle>Add-On Pricing & Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 px-6 pb-6 pt-0">
          <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-4">
            <label className="grid gap-1 text-sm font-medium text-gray-700 md:max-w-sm">
              Add-On Category
              <Select
                value={selectedAddOnCategoryKey}
                onChange={(event) =>
                  setSelectedAddOnCategory(event.target.value)
                }
              >
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <div className="space-y-2 rounded-xl border border-gray-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-gray-900">
                {selectedAddOnCategoryKey}
              </p>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                {selectedAddOns.length} add-on
              </span>
            </div>

            {selectedAddOns.length > 0 ? (
              selectedAddOns.map((addOn) => {
                const key = makeAddOnKey(selectedAddOnCategoryKey, addOn.id);
                const inactive = state.inactiveAddOns.includes(key);
                return (
                  <div
                    key={addOn.id}
                    className="grid gap-2 rounded-lg border border-gray-100 bg-gray-50/50 p-3 md:grid-cols-[1fr_auto_auto] md:items-center"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {addOn.label}
                      </p>
                      <p className="text-xs text-gray-500">ID: {addOn.id}</p>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      step={1000}
                      defaultValue={addOn.price}
                      onBlur={(event) =>
                        setAddOnPrice(
                          selectedAddOnCategoryKey,
                          addOn.id,
                          Number(event.target.value || 0),
                        )
                      }
                      className="md:w-40"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className={
                        inactive
                          ? "border-emerald-200 text-emerald-700"
                          : "border-rose-200 text-rose-600"
                      }
                      onClick={() =>
                        toggleAddOnActive(selectedAddOnCategoryKey, addOn.id)
                      }
                    >
                      {inactive ? "Activate" : "Deactivate"}
                    </Button>
                  </div>
                );
              })
            ) : (
              <div className="rounded-lg border border-dashed border-gray-200 p-4 text-sm text-gray-500">
                Belum ada add-on untuk category ini.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {activeModal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div
            ref={modalRef}
            tabIndex={-1}
            className={`max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border bg-white shadow-2xl outline-none sm:max-w-2xl sm:rounded-3xl ${
              isProductModal
                ? "border-[#d7e3f8]"
                : "border-orange-100"
            }`}
          >
            <div
              className={`sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-white/95 px-5 py-4 backdrop-blur sm:px-6 ${
                isProductModal
                  ? "border-[#d7e3f8]"
                  : "border-orange-100"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                    isProductModal
                      ? "bg-[#eef3ff] text-[#173a7a]"
                      : "bg-orange-100 text-[#f36f21]"
                  }`}
                >
                  {isProductModal ? (
                    <PackagePlus size={20} />
                  ) : (
                    <Sparkles size={20} />
                  )}
                </div>
                <div>
                  <p
                    className={`text-xs font-bold uppercase tracking-wide ${
                      isProductModal ? "text-[#173a7a]" : "text-[#f36f21]"
                    }`}
                  >
                    {isProductModal ? "Product catalog" : "Add-on catalog"}
                  </p>
                  <h2 className="text-lg font-extrabold text-slate-900">
                    {isProductModal ? "Tambah Product Baru" : "Tambah Add-On Baru"}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {isProductModal
                      ? "Tambahkan produk utama seperti cake, cookies, atau sub category baru."
                      : "Tambahkan item tambahan seperti keju, susu, topper, atau dekorasi ekstra."}
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

            {isProductModal ? (
              <div className="space-y-5 px-5 py-5 sm:px-6">
                <div className="rounded-2xl border border-[#d7e3f8] bg-[#f8fbff] p-4">
                  <p className="text-sm font-bold text-[#173a7a]">
                    Struktur product
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Product utama seperti Cake atau Cookies, lalu sub category,
                    nama item, variant, dan harga.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 text-sm font-semibold text-slate-700">
                    <p>Product Category</p>
                    <div className="grid grid-cols-2 rounded-xl border border-[#d7e3f8] bg-[#eef3ff] p-1">
                      <button
                        type="button"
                        className={`rounded-lg px-3 py-2 text-sm font-bold transition ${
                          newProduct.categoryMode === "existing"
                            ? "bg-white text-[#173a7a] shadow-sm"
                            : "text-slate-500"
                        }`}
                        onClick={() =>
                          setNewProduct((prev) => ({
                            ...prev,
                            categoryMode: "existing",
                          }))
                        }
                      >
                        Pilih
                      </button>
                      <button
                        type="button"
                        className={`rounded-lg px-3 py-2 text-sm font-bold transition ${
                          newProduct.categoryMode === "new"
                            ? "bg-white text-[#173a7a] shadow-sm"
                            : "text-slate-500"
                        }`}
                        onClick={() =>
                          setNewProduct((prev) => ({
                            ...prev,
                            categoryMode: "new",
                            subcategoryMode: "new",
                          }))
                        }
                      >
                        Baru
                      </button>
                    </div>
                    {newProduct.categoryMode === "existing" ? (
                      <Select
                        value={newProduct.category}
                        onChange={(event) =>
                          setNewProduct((prev) => ({
                            ...prev,
                            category: event.target.value,
                            subcategory:
                              productCatalog.find(
                                (entry) => entry.category === event.target.value,
                              )?.subcategories[0]?.name ?? "",
                          }))
                        }
                      >
                        {categories.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Input
                        placeholder="Contoh: Hampers"
                        value={newProduct.newCategory}
                        onChange={(event) =>
                          setNewProduct((prev) => ({
                            ...prev,
                            newCategory: event.target.value,
                          }))
                        }
                      />
                    )}
                  </div>

                  <div className="space-y-2 text-sm font-semibold text-slate-700">
                    <p>Sub Category</p>
                    <div className="grid grid-cols-2 rounded-xl border border-[#d7e3f8] bg-[#eef3ff] p-1">
                      <button
                        type="button"
                        className={`rounded-lg px-3 py-2 text-sm font-bold transition ${
                          newProduct.subcategoryMode === "existing"
                            ? "bg-white text-[#173a7a] shadow-sm"
                            : "text-slate-500"
                        }`}
                        onClick={() =>
                          setNewProduct((prev) => ({
                            ...prev,
                            subcategoryMode: "existing",
                          }))
                        }
                        disabled={newProduct.categoryMode === "new"}
                      >
                        Pilih
                      </button>
                      <button
                        type="button"
                        className={`rounded-lg px-3 py-2 text-sm font-bold transition ${
                          newProduct.subcategoryMode === "new"
                            ? "bg-white text-[#173a7a] shadow-sm"
                            : "text-slate-500"
                        }`}
                        onClick={() =>
                          setNewProduct((prev) => ({
                            ...prev,
                            subcategoryMode: "new",
                          }))
                        }
                      >
                        Baru
                      </button>
                    </div>
                    {newProduct.subcategoryMode === "existing" &&
                    newProduct.categoryMode === "existing" ? (
                      <Select
                        value={newProduct.subcategory}
                        onChange={(event) =>
                          setNewProduct((prev) => ({
                            ...prev,
                            subcategory: event.target.value,
                          }))
                        }
                      >
                        <option value="">Select subcategory</option>
                        {subcategories.map((subcategory) => (
                          <option key={subcategory.name} value={subcategory.name}>
                            {subcategory.name}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Input
                        placeholder="Contoh: Premium Hampers"
                        value={newProduct.newSubcategory}
                        onChange={(event) =>
                          setNewProduct((prev) => ({
                            ...prev,
                            newSubcategory: event.target.value,
                          }))
                        }
                      />
                    )}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 text-sm font-semibold text-slate-700">
                    <p>Nama Item</p>
                    <Input
                      placeholder="Contoh: Dummy Cake"
                      value={newProduct.productName}
                      onChange={(event) =>
                        setNewProduct((prev) => ({
                          ...prev,
                          productName: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2 text-sm font-semibold text-slate-700">
                    <p>Variant / Size</p>
                    <Input
                      placeholder="Contoh: D16-T15"
                      value={newProduct.variantLabel}
                      onChange={(event) =>
                        setNewProduct((prev) => ({
                          ...prev,
                          variantLabel: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2 text-sm font-semibold text-slate-700">
                  <p>Harga</p>
                  <Input
                    type="number"
                    min={0}
                    step={1000}
                    placeholder="0"
                    value={newProduct.price}
                    onChange={(event) =>
                      setNewProduct((prev) => ({
                        ...prev,
                        price: Number(event.target.value || 0),
                      }))
                    }
                  />
                </div>

                <div className="rounded-2xl border border-[#d7e3f8] bg-[#eef3ff] p-4 text-sm text-slate-700">
                  <p className="font-bold text-slate-900">Preview</p>
                  <p className="mt-1">
                    {effectiveNewProductCategory || "Product Category"} /{" "}
                    {effectiveNewProductSubcategory || "Sub Category"} /{" "}
                    {newProduct.productName || "Nama Item"} /{" "}
                    {newProduct.variantLabel || "Variant"}
                  </p>
                  <p className="mt-1 font-bold text-[#173a7a]">
                    {formatCurrency(Number(newProduct.price || 0))}
                  </p>
                </div>

                <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeModal}
                  >
                    Batal
                  </Button>
                  <Button
                    type="button"
                    className="gap-2 bg-[#173a7a] text-white hover:bg-[#14305f]"
                    onClick={handleAddCustomProduct}
                  >
                    <PackagePlus size={16} />
                    Add Product
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-5 px-5 py-5 sm:px-6">
                <div className="rounded-2xl border border-orange-100 bg-orange-50/70 p-4">
                  <p className="text-sm font-bold text-[#f36f21]">
                    Struktur add-on
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Item tambahan terpisah dari product utama, misalnya keju,
                    susu, topper, atau dekorasi ekstra.
                  </p>
                </div>
                <div className="space-y-2 text-sm font-semibold text-slate-700">
                  <p>Kategori Add-On</p>
                  <div className="grid grid-cols-2 rounded-xl border border-orange-100 bg-white/70 p-1">
                    <button
                      type="button"
                      className={`rounded-lg px-3 py-2 text-sm font-bold transition ${
                        newAddOn.categoryMode === "existing"
                          ? "bg-white text-[#f36f21] shadow-sm"
                          : "text-slate-500"
                      }`}
                      onClick={() =>
                        setNewAddOn((prev) => ({
                          ...prev,
                          categoryMode: "existing",
                        }))
                      }
                    >
                      Pilih
                    </button>
                    <button
                      type="button"
                      className={`rounded-lg px-3 py-2 text-sm font-bold transition ${
                        newAddOn.categoryMode === "new"
                          ? "bg-white text-[#f36f21] shadow-sm"
                          : "text-slate-500"
                      }`}
                      onClick={() =>
                        setNewAddOn((prev) => ({
                          ...prev,
                          categoryMode: "new",
                        }))
                      }
                    >
                      Baru
                    </button>
                  </div>
                  {newAddOn.categoryMode === "existing" ? (
                    <Select
                      value={newAddOn.category}
                      onChange={(event) =>
                        setNewAddOn((prev) => ({
                          ...prev,
                          category: event.target.value,
                        }))
                      }
                    >
                      {categories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      placeholder="Contoh: Add-On Umum"
                      value={newAddOn.newCategory}
                      onChange={(event) =>
                        setNewAddOn((prev) => ({
                          ...prev,
                          newCategory: event.target.value,
                        }))
                      }
                    />
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 text-sm font-semibold text-slate-700">
                    <p>Label Add-On</p>
                    <Input
                      placeholder="Contoh: Dark Color Buttercream"
                      value={newAddOn.label}
                      onChange={(event) => {
                        const label = event.target.value;
                        setNewAddOn((prev) => ({
                          ...prev,
                          label,
                          id: prev.id || makeAddOnId(label),
                        }));
                      }}
                    />
                  </div>
                  <div className="space-y-2 text-sm font-semibold text-slate-700">
                    <p>Add-On ID</p>
                    <Input
                      placeholder="Otomatis dari label"
                      value={newAddOn.id}
                      onChange={(event) =>
                        setNewAddOn((prev) => ({
                          ...prev,
                          id: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2 text-sm font-semibold text-slate-700">
                  <p>Harga</p>
                  <Input
                    type="number"
                    min={0}
                    step={1000}
                    placeholder="0"
                    value={newAddOn.price}
                    onChange={(event) =>
                      setNewAddOn((prev) => ({
                        ...prev,
                        price: Number(event.target.value || 0),
                      }))
                    }
                  />
                </div>

                <div className="rounded-2xl border border-orange-100 bg-orange-50/70 p-4 text-sm text-slate-700">
                  <p className="font-bold text-slate-900">Preview</p>
                  <p className="mt-1">
                    {effectiveNewAddOnCategory || "Kategori Add-On"} /{" "}
                    {newAddOn.label || "Add-On Label"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    ID: {newAddOn.id || makeAddOnId(newAddOn.label) || "-"}
                  </p>
                  <p className="mt-1 font-bold text-[#f36f21]">
                    {formatCurrency(Number(newAddOn.price || 0))}
                  </p>
                </div>

                <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeModal}
                  >
                    Batal
                  </Button>
                  <Button
                    type="button"
                    className="gap-2"
                    onClick={handleAddCustomAddOn}
                  >
                    <Plus size={16} />
                    Add Add-On
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      <UnifiedAddProductModal
        open={unifiedAddProductOpen}
        onClose={() => setUnifiedAddProductOpen(false)}
        onSaved={() => {
          toast.success("Produk tersimpan dan disinkronkan ke booking catalog.");
        }}
      />
    </div>
  );
}
