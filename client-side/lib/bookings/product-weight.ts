import {
  estimateOperationalWeightGram,
  resolveShippingParcelCount,
  type DeliveryRuleItem,
} from "@/lib/bookings/delivery-rules";
import { buildDashboardProductName } from "@/lib/products/dashboard-name";

export interface ProductWeightLookupItem
  extends Pick<
    DeliveryRuleItem,
    "category" | "subcategory" | "productName" | "size" | "quantity"
  > {
  tokenDifficulty?: string;
  productLookupKey?: string;
  weightGram?: number;
}

export function normalizeProductLookupKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function isCustomCookieLike(item: ProductWeightLookupItem): boolean {
  if (item.category !== "Cookies") return false;

  const productName = String(item.productName || "").toLowerCase();
  const size = String(item.size || "").toLowerCase();

  if (productName === "cookies") return true;
  if (["simple", "normal", "hard", "advanced", "expert"].includes(size)) {
    return true;
  }

  return (
    productName.includes("custom cookies") ||
    productName.includes("individual cookie")
  );
}

function normalizeTokenDifficulty(value: unknown): string {
  const normalized =
    typeof value === "string" ? value.trim().toUpperCase() : "";

  if (normalized === "NORMAL" || normalized === "MEDIUM") return "NORMAL";
  if (normalized === "HARD" || normalized === "DIFFICULT") return "HARD";
  if (normalized === "ADVANCED") return "ADVANCED";
  if (normalized === "EXPERT") return "EXPERT";
  return "SIMPLE";
}

export function toDashboardProductNameFromLookupItem(
  item: ProductWeightLookupItem,
): string {
  let effectiveProductName = item.productName || "";
  if (
    isCustomCookieLike(item) &&
    effectiveProductName.toLowerCase().trim() === "cookies"
  ) {
    effectiveProductName = "Custom Cookies";
  }

  const effectiveVariantLabel =
    isCustomCookieLike(item) &&
    normalizeTokenDifficulty(item.tokenDifficulty) !== "SIMPLE"
      ? normalizeTokenDifficulty(item.tokenDifficulty)
      : isCustomCookieLike(item) &&
          ["", "standard", "start from"].includes(
            String(item.size || "")
              .trim()
              .toLowerCase(),
          )
        ? normalizeTokenDifficulty(item.tokenDifficulty)
        : item.size || "";

  return buildDashboardProductName({
    productName: effectiveProductName,
    variantLabel: effectiveVariantLabel,
    variantCount: 1,
  });
}

export function getProductLookupKeyFromItem(
  item: ProductWeightLookupItem,
): string {
  const explicitKey = normalizeProductLookupKey(item.productLookupKey || "");
  if (explicitKey) return explicitKey;

  return normalizeProductLookupKey(toDashboardProductNameFromLookupItem(item));
}

export function calculateShippingWeightGram(
  item: ProductWeightLookupItem,
  options?: {
    weightByProductName?: Map<string, number>;
  },
): number {
  const lookupKey = getProductLookupKeyFromItem(item);
  const units = Math.max(1, resolveShippingParcelCount(item));
  const weightOverride =
    lookupKey && options?.weightByProductName
      ? Math.max(
          0,
          Number(options.weightByProductName.get(lookupKey) ?? 0),
        )
      : 0;

  if (weightOverride > 0) {
    return Math.max(100, Math.round(weightOverride * units));
  }

  const existingWeight = Math.max(0, Number(item.weightGram ?? 0));
  if (existingWeight > 0) {
    return Math.max(100, Math.round(existingWeight));
  }

  return estimateOperationalWeightGram(item);
}

export function applyWeightOverridesToShippingItems<
  T extends {
    name: string;
    quantity: number;
    value: number;
    weightGram: number;
    productLookupKey?: string;
    category?: string;
    subcategory?: string;
    productName?: string;
    size?: string;
    tokenDifficulty?: string;
  },
>(items: T[], weightByProductName?: Map<string, number>): T[] {
  if (!weightByProductName || weightByProductName.size === 0) {
    return items.map((item) => ({
      ...item,
      weightGram: calculateShippingWeightGram(item),
    }));
  }

  return items.map((item) => ({
    ...item,
    weightGram: calculateShippingWeightGram(item, {
      weightByProductName,
    }),
  }));
}
