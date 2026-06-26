import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { loadEffectiveBookingCatalog } from "@/lib/bookings/catalog-config-server";
import { flattenCatalogProductsForDashboard } from "@/lib/bookings/product-sync";
import { buildDashboardProductName } from "@/lib/products/dashboard-name";
import type { NormalizedOrder } from "./route";

export type JsonRecord = Record<string, unknown>;

type ProductTokenLookupCacheEntry = {
  expiresAt: number;
  value: Map<string, number>;
};

const ORDER_PRODUCT_TOKEN_LOOKUP_CACHE_TTL_MS = 60_000;
const globalForOrderProductTokenLookup =
  globalThis as typeof globalThis & {
    __orderProductTokenLookupCache?: Map<
      number,
      ProductTokenLookupCacheEntry
    >;
    __orderProductTokenLookupInFlight?: Map<
      number,
      Promise<Map<string, number>>
    >;
  };

function getOrderProductTokenLookupCache() {
  if (!globalForOrderProductTokenLookup.__orderProductTokenLookupCache) {
    globalForOrderProductTokenLookup.__orderProductTokenLookupCache = new Map();
  }
  return globalForOrderProductTokenLookup.__orderProductTokenLookupCache;
}

function getOrderProductTokenLookupInFlight() {
  if (!globalForOrderProductTokenLookup.__orderProductTokenLookupInFlight) {
    globalForOrderProductTokenLookup.__orderProductTokenLookupInFlight =
      new Map();
  }
  return globalForOrderProductTokenLookup.__orderProductTokenLookupInFlight;
}

function readOrderProductTokenLookupCache(businessId: number) {
  const entry = getOrderProductTokenLookupCache().get(businessId);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    getOrderProductTokenLookupCache().delete(businessId);
    return null;
  }
  return new Map(entry.value);
}

function writeOrderProductTokenLookupCache(
  businessId: number,
  value: Map<string, number>,
) {
  getOrderProductTokenLookupCache().set(businessId, {
    value: new Map(value),
    expiresAt: Date.now() + ORDER_PRODUCT_TOKEN_LOOKUP_CACHE_TTL_MS,
  });
  return new Map(value);
}

export function invalidateOrderProductTokenLookupCache(businessId?: number) {
  if (typeof businessId === "number") {
    getOrderProductTokenLookupCache().delete(businessId);
    getOrderProductTokenLookupInFlight().delete(businessId);
    return;
  }

  getOrderProductTokenLookupCache().clear();
  getOrderProductTokenLookupInFlight().clear();
}

// Helper format data dasar
export function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

export function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function asPositiveIntOrNull(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export function asArrayOfRecords(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asRecord(entry))
    .filter((entry): entry is JsonRecord => Boolean(entry));
}

export function parseJsonField(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

export function toIsoOrNull(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return null;
}

export function normalizeSalesChannel(
  value: unknown,
): "direct" | "tokopedia" | "shopee" {
  const normalized = asString(value).trim().toLowerCase();
  if (normalized === "tokopedia" || normalized === "shopee") return normalized;
  return "direct";
}

// Helper produksi & staff assignment
export function orderTaskUuid(businessId: number, orderId: string): string {
  return `bakery-${businessId}-${orderId}`;
}

export function buildStaffIdByUuid(staffUserIds: number[]): Map<string, number> {
  const mapping = new Map<string, number>();
  for (const id of staffUserIds) {
    mapping.set(String(id), id);
  }
  return mapping;
}

function normalizeProductTokenLookupKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function getProductTokenLookupKeys(item: {
  productName?: unknown;
  size?: unknown;
}): string[] {
  const productName = asString(item.productName).trim();
  const size = asString(item.size).trim();
  if (!productName) return [];

  const variants = new Set<string>();
  variants.add(productName);
  if (size) {
    variants.add(`${productName} - ${size}`);
  }
  variants.add(
    buildDashboardProductName({
      productName,
      variantLabel: size,
      variantCount: 1,
    }),
  );

  return [...variants]
    .map((value) => normalizeProductTokenLookupKey(value))
    .filter(Boolean);
}

// Loader Token Lookup Produk secara sequential (DRY & pool-safe)
export async function loadOrderProductTokenLookup(
  businessId: number,
): Promise<Map<string, number>> {
  const cached = readOrderProductTokenLookupCache(businessId);
  if (cached) {
    return cached;
  }

  const inFlight = getOrderProductTokenLookupInFlight().get(businessId);
  if (inFlight) {
    return inFlight.then((value) => new Map(value));
  }

  const request = (async () => {
    const lookup = new Map<string, number>();

    try {
      const products = await prisma.product.findMany({
        where: {
          businessId,
          deletedAt: null,
        },
        select: {
          name: true,
          productionToken: true,
        },
      });

      for (const product of products) {
        const token = Math.max(0, Number(product.productionToken || 0));
        if (token <= 0) continue;
        lookup.set(normalizeProductTokenLookupKey(product.name), token);
      }
    } catch (dbError) {
      console.warn(
        `[loadOrderProductTokenLookup] DB query failed, using catalog fallback:`,
        dbError,
      );
    }

    try {
      const effectiveCatalog = await loadEffectiveBookingCatalog(businessId);

      for (const item of flattenCatalogProductsForDashboard(
        effectiveCatalog.productCatalog,
      )) {
        const token = Math.max(0, Number(item.productionToken || 0));
        if (token <= 0) continue;
        const key = normalizeProductTokenLookupKey(item.name);
        if (!lookup.has(key)) {
          lookup.set(key, token);
        }
      }
    } catch (catalogError) {
      console.warn(
        `[loadOrderProductTokenLookup] Catalog config load failed:`,
        catalogError,
      );
    }

    return writeOrderProductTokenLookupCache(businessId, lookup);
  })().finally(() => {
    getOrderProductTokenLookupInFlight().delete(businessId);
  });

  getOrderProductTokenLookupInFlight().set(businessId, request);
  return request.then((value) => new Map(value));
}

function hydrateOrderItemWithProductToken<T extends JsonRecord>(
  item: T,
  productTokenLookup: Map<string, number>,
): T {
  const currentCustomToken = asNumber(item.customTokenPerUnit);
  if (currentCustomToken > 0 || productTokenLookup.size === 0) {
    return item;
  }

  for (const key of getProductTokenLookupKeys(item)) {
    const token = productTokenLookup.get(key);
    if (token && token > 0) {
      return {
        ...item,
        customTokenPerUnit: token,
      };
    }
  }

  return item;
}

export function hydrateOrderItemsWithProductTokens<T extends JsonRecord>(
  items: T[],
  productTokenLookup: Map<string, number>,
): T[] {
  return items.map((item) =>
    hydrateOrderItemWithProductToken(item, productTokenLookup),
  );
}

// Image fields resolver versi sederhana & mandiri untuk detail order
export function resolvePersistedImageFields(order: NormalizedOrder) {
  const imageUrls: string[] = [];
  if (Array.isArray(order.imageUrls)) {
    imageUrls.push(...order.imageUrls.map(String).filter(Boolean));
  }
  const imageUrl = order.imageUrl || imageUrls[0] || "";
  return {
    imageUrl,
    imageUrls,
    referenceImages: Array.isArray(order.referenceImages) ? order.referenceImages : [],
  };
}
