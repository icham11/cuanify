export type ProductTokenMapEntry = {
  name: string;
  productionToken: number;
  weightGram: number;
  minimumOrder: number;
};

type ProductTokenMapCacheEntry = {
  data: ProductTokenMapEntry[];
  expiresAt: number;
};

const PRODUCT_TOKEN_MAP_CACHE_TTL_MS = 30_000;

const productTokenMapCache = new Map<number, ProductTokenMapCacheEntry>();

export function getCachedProductTokenMap(
  businessId: number,
): ProductTokenMapEntry[] | null {
  const cacheEntry = productTokenMapCache.get(businessId);
  if (!cacheEntry) return null;
  if (cacheEntry.expiresAt <= Date.now()) {
    productTokenMapCache.delete(businessId);
    return null;
  }

  return cacheEntry.data;
}

export function setCachedProductTokenMap(
  businessId: number,
  data: ProductTokenMapEntry[],
): void {
  productTokenMapCache.set(businessId, {
    data,
    expiresAt: Date.now() + PRODUCT_TOKEN_MAP_CACHE_TTL_MS,
  });
}

export function invalidateProductTokenMapCache(businessId?: number): void {
  if (typeof businessId === "number" && Number.isFinite(businessId)) {
    productTokenMapCache.delete(businessId);
    return;
  }

  productTokenMapCache.clear();
}
