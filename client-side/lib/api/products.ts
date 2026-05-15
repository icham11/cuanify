import type { Product, CreateProductInput } from "@/types/product";
import { apiFetch, invalidateApiCache, peekApiCache } from "./client";

const PRODUCT_API_CACHE_INVALIDATION_PATTERN =
  /\/api\/(products(?:\/\d+\/recipe)?|categories|bookings\/catalog-config)/;

async function extractApiErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const contentType = response.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      const json = (await response.json()) as {
        error?: string;
        details?: string | string[];
      };
      if (typeof json.error === "string" && json.error.trim()) {
        return json.error.trim();
      }
      if (Array.isArray(json.details) && json.details.length > 0) {
        return json.details.join(", ");
      }
      if (typeof json.details === "string" && json.details.trim()) {
        return json.details.trim();
      }
    } else {
      const text = (await response.text()).trim();
      if (text) return text;
    }
  } catch {
    // Ignore parse errors and use the fallback below.
  }

  return fallback;
}

// ─── Fetch helpers ─────────────────────────────────────────────────────────────

export type PaginationMeta = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  avgSellingPrice: number;
  avgMargin: number;
};

function getActiveBusinessCacheScope(): string | null {
  if (typeof document === "undefined") return null;

  const match = document.cookie.match(
    /(?:^|;\s*)active_business_id=([^;]*)/,
  );
  const businessId = match ? decodeURIComponent(match[1] || "").trim() : "";
  return businessId || null;
}

export type GetProductsParams = {
  search?: string;
  categoryId?: number;
  categoryIds?: number[];
  excludeCategoryNames?: string[];
  sortBy?: "name" | "sellingPrice" | "createdAt" | "cogs" | "margin";
  sortOrder?: "asc" | "desc";
  withRecipe?: boolean;
  page?: number;
  limit?: number;
};

type ProductsApiPayload = {
  data?: Product[];
  meta?: PaginationMeta;
};

function getDefaultPaginationMeta(): PaginationMeta {
  return {
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
    avgSellingPrice: 0,
    avgMargin: 0,
  };
}

export function buildProductsUrl(params?: GetProductsParams): string {
  const url = new URL("/api/products", window.location.origin);
  const activeBusinessScope = getActiveBusinessCacheScope();
  if (activeBusinessScope) {
    // Cache scope only. The server ignores this param.
    url.searchParams.set("_activeBusinessId", activeBusinessScope);
  }
  if (params?.search) url.searchParams.set("search", params.search);
  if (params?.categoryId)
    url.searchParams.set("categoryId", String(params.categoryId));
  if (params?.categoryIds?.length)
    url.searchParams.set("categoryIds", params.categoryIds.join(","));
  if (params?.excludeCategoryNames?.length)
    url.searchParams.set(
      "excludeCategoryNames",
      params.excludeCategoryNames.join(","),
    );
  if (params?.sortBy) url.searchParams.set("sortBy", params.sortBy);
  if (params?.sortOrder) url.searchParams.set("sortOrder", params.sortOrder);
  if (params?.withRecipe === false) url.searchParams.set("withRecipe", "false");
  if (params?.page) url.searchParams.set("page", String(params.page));
  if (params?.limit) url.searchParams.set("limit", String(params.limit));
  return url.toString();
}

function buildCategoriesUrl(): string {
  const url = new URL("/api/categories", window.location.origin);
  const activeBusinessScope = getActiveBusinessCacheScope();
  if (activeBusinessScope) {
    // Cache scope only. The server ignores this param.
    url.searchParams.set("_activeBusinessId", activeBusinessScope);
  }
  return url.toString();
}

export function peekCachedProducts(
  params?: GetProductsParams,
): { data: Product[]; meta: PaginationMeta } | null {
  if (typeof window === "undefined") return null;

  const payload = peekApiCache<ProductsApiPayload>(
    buildProductsUrl(params),
    undefined,
    { allowStale: true },
  );

  if (!payload) return null;

  return {
    data: payload.data ?? [],
    meta: payload.meta ?? getDefaultPaginationMeta(),
  };
}

export async function getProducts(
  params?: GetProductsParams,
  options?: { signal?: AbortSignal },
): Promise<{ data: Product[]; meta: PaginationMeta }> {
  const json = (await apiFetch(buildProductsUrl(params), {
    signal: options?.signal,
  })) as ProductsApiPayload;
  return {
    data: json.data ?? [],
    meta: json.meta ?? getDefaultPaginationMeta(),
  };
}

// ─── Create helpers ────────────────────────────────────────────────────────────

export async function createProduct(
  input: CreateProductInput,
): Promise<Product> {
  const res = await fetch("/api/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to create product");
  invalidateApiCache(PRODUCT_API_CACHE_INVALIDATION_PATTERN);
  return data.data;
}

export async function createBulkProducts(
  products: CreateProductInput[],
): Promise<Product[]> {
  const res = await fetch("/api/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ products }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to create products");
  invalidateApiCache(PRODUCT_API_CACHE_INVALIDATION_PATTERN);
  return data.data;
}

// ─── AI generation helpers ─────────────────────────────────────────────────────

/** POST /api/products/generate/name — generate product data from a name */
export async function generateProductByName(productName: string) {
  const res = await fetch("/api/products/generate/name", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ productName }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to generate product");
  return data;
}

/** POST /api/products/generate/image — extract multiple products from a menu/photo */
export async function generateProductsByImage(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/products/generate/image", {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.error ?? "Failed to generate products from image");
  return data;
}

/** POST /api/products/generate/recipe-image — extract recipe from an image */
export async function generateRecipeFromImage(
  file: File,
  productName?: string,
) {
  const formData = new FormData();
  formData.append("file", file);
  if (productName) formData.append("productName", productName);

  const res = await fetch("/api/products/generate/recipe-image", {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.error ?? "Failed to generate recipe from image");
  return data;
}

/** POST /api/products/generate/recommend-price — get AI price recommendation */
export async function recommendPrice(params: {
  cogs: number;
  categoryName?: string;
  productName?: string;
}) {
  const res = await fetch("/api/products/generate/recommend-price", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.error ?? "Failed to get price recommendation");
  return data.data as {
    recommendedPrice: number;
    margin: number;
    reasoning: string;
    cogs: number;
  };
}

// ─── Ingredient helpers ────────────────────────────────────────────────────────

export type IngredientOption = {
  id: number;
  name: string;
  unit: string;
  costPerUnit: number | null;
  currentStock: number;
};

export async function getIngredientOptions(): Promise<IngredientOption[]> {
  const data = (await apiFetch("/api/ingredients")) as {
    data?: Array<{
      id: number;
      name: string;
      unit: string;
      costPerUnit: number | null;
      currentStock?: number;
    }>;
  };
  return (data.data ?? []).map(
    (ing: {
      id: number;
      name: string;
      unit: string;
      costPerUnit: number | null;
      currentStock?: number;
    }) => ({
      id: Number(ing.id),
      name: ing.name,
      unit: ing.unit,
      costPerUnit: ing.costPerUnit ?? null,
      currentStock: ing.currentStock ?? 0,
    }),
  );
}

export async function getCategoryOptionsCached(): Promise<
  { id: number; name: string }[]
> {
  const payload = (await apiFetch(buildCategoriesUrl())) as {
    data?: Array<{ id: number; name: string }>;
  };
  return payload.data ?? [];
}

export function peekCachedCategoryOptions(): { id: number; name: string }[] {
  if (typeof window === "undefined") return [];

  const payload = peekApiCache<{ data?: Array<{ id: number; name: string }> }>(
    buildCategoriesUrl(),
    undefined,
    { allowStale: true },
  );

  return payload?.data ?? [];
}

export async function getCategoryOptions(): Promise<
  { id: number; name: string }[]
> {
  const res = await fetch("/api/categories", {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) return []; // categories may not have a dedicated endpoint — fallback to empty
  const data = await res.json();
  return data.data ?? [];
}

export async function updateProduct(
  id: number,
  input: {
    name?: string;
    categoryId?: number;
    categoryName?: string;
    sellingPrice?: number;
    cogs?: number;
    productionToken?: number;
    manualStock?: number;
    productType?: "ReadyStock" | "PreOrder";
    createdAt?: string;
    recipe?: Array<{ ingredientId: number; quantity: number }>;
    manualCogs?: number;
  },
): Promise<Product> {
  const res = await fetch(`/api/products/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(await extractApiErrorMessage(res, "Failed to update product"));
  }

  const data = (await res.json().catch(() => ({}))) as { data?: Product };
  invalidateApiCache(PRODUCT_API_CACHE_INVALIDATION_PATTERN);
  if (!data.data) {
    throw new Error("Failed to update product");
  }
  return data.data;
}

/** PATCH /api/products/[id] — update selling price only */
export async function updateProductPrice(
  id: number,
  sellingPrice: number,
): Promise<Product> {
  return updateProduct(id, { sellingPrice });
}

/** DELETE /api/products/[id] — permanently delete product and its recipes */
export async function deleteProduct(id: number): Promise<void> {
  const res = await fetch(`/api/products/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const errorMessage = await extractApiErrorMessage(
      res,
      "Failed to delete product",
    );

    if (
      res.status === 404 &&
      /product not found|tidak ditemukan|sudah dihapus/i.test(errorMessage)
    ) {
      invalidateApiCache(PRODUCT_API_CACHE_INVALIDATION_PATTERN);
      return;
    }

    throw new Error(errorMessage);
  }
  invalidateApiCache(PRODUCT_API_CACHE_INVALIDATION_PATTERN);
}

/** DELETE /api/products — permanently delete multiple products and their recipes */
export async function bulkDeleteProducts(ids: number[]): Promise<void> {
  const res = await fetch("/api/products", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Failed to delete products");
  }
  invalidateApiCache(PRODUCT_API_CACHE_INVALIDATION_PATTERN);
}

/** POST /api/ingredients - create a new ingredient (find-or-create), always seats an initial batch */
export async function createIngredient(data: {
  name: string;
  unit: string;
  costPerUnit: number;
  initialStock?: number;
  expirationDate?: string;
}): Promise<{ id: number; name: string; unit: string }> {
  const res = await fetch("/api/ingredients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      name: data.name,
      unit: data.unit,
      initialBatch: {
        quantity: data.initialStock ?? 0,
        costPerUnit: data.costPerUnit,
        ...(data.expirationDate ? { expirationDate: data.expirationDate } : {}),
      },
    }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error ?? "Failed to create ingredient");
  }
  const json = await res.json();
  invalidateApiCache(/\/api\/ingredients/);
  return json.data;
}

/** PATCH /api/ingredients/[id] — update name, unit, costPerUnit, initialStock, and/or expirationDate */
export async function patchIngredient(
  id: number,
  data: {
    name?: string;
    unit?: string;
    costPerUnit?: number;
    initialStock?: number;
    expirationDate?: string;
  },
): Promise<void> {
  const res = await fetch(`/api/ingredients/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error ?? "Failed to update ingredient");
  }
  invalidateApiCache(/\/api\/ingredients/);
}

/** DELETE /api/ingredients/[id] — permanently remove an auto-created (AI) ingredient */
export async function deleteIngredient(id: number): Promise<void> {
  const res = await fetch(`/api/ingredients/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Failed to delete ingredient");
  }
  invalidateApiCache(/\/api\/ingredients/);
}
