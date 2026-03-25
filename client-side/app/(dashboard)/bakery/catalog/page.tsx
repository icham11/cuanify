"use client";

import { useMemo, useState } from "react";
import GradientPageHeader from "@/components/bakery/shared/GradientPageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatCurrency } from "@/components/orders/formatters";
import {
  makeAddOnKey,
  makeProductKey,
  makeVariantKey,
  useCatalogAdminState,
} from "@/lib/bookings/catalog-admin";
import { Settings2 } from "lucide-react";
import { toast } from "sonner";

function buildDefaultProductDraft(category: string) {
  return {
    category,
    subcategory: "",
    productName: "",
    variantLabel: "",
    price: 0,
  };
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
    () => productCatalog.map((entry) => entry.category),
    [productCatalog],
  );

  const firstCategory = categories[0] ?? "Cake";
  const [newProduct, setNewProduct] = useState(() =>
    buildDefaultProductDraft(firstCategory),
  );
  const [newAddOn, setNewAddOn] = useState({
    category: firstCategory,
    id: "",
    label: "",
    price: 0,
  });

  const selectedCategoryData =
    productCatalog.find((entry) => entry.category === newProduct.category) ??
    productCatalog[0];
  const subcategories = selectedCategoryData?.subcategories ?? [];

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
    if (
      !newProduct.category ||
      !newProduct.subcategory ||
      !newProduct.productName ||
      !newProduct.variantLabel
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
          category: newProduct.category,
          subcategory: newProduct.subcategory,
          productName: newProduct.productName,
          variantLabel: newProduct.variantLabel,
          price: Math.max(0, Math.round(Number(newProduct.price || 0))),
        },
      ],
    }));

    toast.success("Custom product ditambahkan ke katalog aktif.");
    setNewProduct((prev) => ({
      ...prev,
      productName: "",
      variantLabel: "",
      price: 0,
    }));
  };

  const handleAddCustomAddOn = () => {
    if (!newAddOn.category || !newAddOn.id || !newAddOn.label) {
      toast.error("Lengkapi category, add-on ID, dan label.");
      return;
    }

    setCatalogAdminState((prev) => ({
      ...prev,
      customAddOns: [
        ...prev.customAddOns,
        {
          category: newAddOn.category,
          id: newAddOn.id,
          label: newAddOn.label,
          price: Math.max(0, Math.round(Number(newAddOn.price || 0))),
        },
      ],
    }));

    toast.success("Custom add-on ditambahkan.");
    setNewAddOn((prev) => ({ ...prev, id: "", label: "", price: 0 }));
  };

  return (
    <div className="space-y-6 pb-10">
      <GradientPageHeader
        title="Catalog Management"
        description="Kelola harga, active/inactive, dan item baru sesuai SOP tanpa edit kode."
        icon={Settings2}
        actions={
          <Button
            type="button"
            variant="outline"
            className="border-rose-200 text-rose-600 hover:bg-rose-50"
            onClick={() => {
              resetCatalogAdminState();
              toast.success("Catalog override di-reset ke default pricelist.");
            }}
          >
            Reset Overrides
          </Button>
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
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl shadow-sm">
        <CardHeader className="p-6 pb-2">
          <CardTitle>Product Pricing & Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 px-6 pb-6 pt-0">
          {productCatalog.map((category) => (
            <div
              key={category.category}
              className="space-y-3 rounded-xl border border-gray-200 p-4"
            >
              <p className="text-sm font-semibold text-gray-900">
                {category.category}
              </p>
              {category.subcategories.map((subcategory) => (
                <div
                  key={subcategory.name}
                  className="space-y-2 rounded-lg border border-gray-100 p-3"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {subcategory.name}
                  </p>
                  {subcategory.products.map((product) => {
                    const productKey = makeProductKey(
                      category.category,
                      subcategory.name,
                      product.name,
                    );
                    const inactive =
                      state.inactiveProducts.includes(productKey);

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
                                category.category,
                                subcategory.name,
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
                                    category.category,
                                    subcategory.name,
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
              ))}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-xl shadow-sm">
        <CardHeader className="p-6 pb-2">
          <CardTitle>Add-On Pricing & Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 px-6 pb-6 pt-0">
          {Object.entries(addOnCatalog).map(([category, addOns]) => (
            <div
              key={category}
              className="space-y-2 rounded-xl border border-gray-200 p-4"
            >
              <p className="text-sm font-semibold text-gray-900">{category}</p>
              {addOns.map((addOn) => {
                const key = makeAddOnKey(category, addOn.id);
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
                          category,
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
                      onClick={() => toggleAddOnActive(category, addOn.id)}
                    >
                      {inactive ? "Activate" : "Deactivate"}
                    </Button>
                  </div>
                );
              })}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="p-6 pb-2">
            <CardTitle>Add Custom Product</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-6 pb-6 pt-0">
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
            <Input
              placeholder="Product name"
              value={newProduct.productName}
              onChange={(event) =>
                setNewProduct((prev) => ({
                  ...prev,
                  productName: event.target.value,
                }))
              }
            />
            <Input
              placeholder="Variant label"
              value={newProduct.variantLabel}
              onChange={(event) =>
                setNewProduct((prev) => ({
                  ...prev,
                  variantLabel: event.target.value,
                }))
              }
            />
            <Input
              type="number"
              min={0}
              step={1000}
              placeholder="Price"
              value={newProduct.price}
              onChange={(event) =>
                setNewProduct((prev) => ({
                  ...prev,
                  price: Number(event.target.value || 0),
                }))
              }
            />
            <Button type="button" onClick={handleAddCustomProduct}>
              Add Product
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-xl shadow-sm">
          <CardHeader className="p-6 pb-2">
            <CardTitle>Add Custom Add-On</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-6 pb-6 pt-0">
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
            <Input
              placeholder="Add-on ID"
              value={newAddOn.id}
              onChange={(event) =>
                setNewAddOn((prev) => ({ ...prev, id: event.target.value }))
              }
            />
            <Input
              placeholder="Label"
              value={newAddOn.label}
              onChange={(event) =>
                setNewAddOn((prev) => ({ ...prev, label: event.target.value }))
              }
            />
            <Input
              type="number"
              min={0}
              step={1000}
              placeholder="Price"
              value={newAddOn.price}
              onChange={(event) =>
                setNewAddOn((prev) => ({
                  ...prev,
                  price: Number(event.target.value || 0),
                }))
              }
            />
            <Button type="button" onClick={handleAddCustomAddOn}>
              Add Add-On
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
