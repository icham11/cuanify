import { BOOKING_PRODUCT_CATALOG } from "@/lib/bookings/pricelist";

const SUBCATEGORY_TO_MAIN_CATEGORY = new Map(
  BOOKING_PRODUCT_CATALOG.flatMap((category) =>
    category.subcategories.map(
      (subcategory) => [subcategory.name.trim().toLowerCase(), category.category] as const,
    ),
  ),
);

const KNOWN_MAIN_CATEGORIES = new Map(
  BOOKING_PRODUCT_CATALOG.map((category) => [
    category.category.trim().toLowerCase(),
    category.category,
  ] as const),
);

export const REMOVED_BAKERY_SUBCATEGORIES = new Set([
  ["Best", "Seller", "Kids", "Edition"].join(" "),
  ["Best", "Seller", "Signature"].join(" "),
]);

export function normalizeMainCategoryKey(value: string) {
  return value.trim().toLowerCase();
}

export function shouldIgnoreProductCategory(categoryName: string) {
  return REMOVED_BAKERY_SUBCATEGORIES.has(categoryName.trim());
}

export function resolveMainProductCategory(categoryName: string) {
  const normalized = normalizeMainCategoryKey(categoryName);
  if (!normalized) return "";

  const knownMainCategory = KNOWN_MAIN_CATEGORIES.get(normalized);
  if (knownMainCategory) return knownMainCategory;

  return SUBCATEGORY_TO_MAIN_CATEGORY.get(normalized) ?? "Custom";
}

export function buildMainProductCategoryOptions(
  categories: Array<{ name: string; productCount?: number }>,
) {
  const grouped = new Map<
    string,
    {
      value: string;
      label: string;
      productCount: number;
    }
  >();

  categories.forEach((category) => {
    const rawName = category.name.trim();
    if (!rawName || shouldIgnoreProductCategory(rawName)) return;

    const mainCategory = resolveMainProductCategory(rawName);
    if (!mainCategory) return;

    const key = normalizeMainCategoryKey(mainCategory);
    const current = grouped.get(key);
    if (current) {
      current.productCount += Number(category.productCount ?? 0);
      return;
    }

    grouped.set(key, {
      value: mainCategory,
      label: mainCategory,
      productCount: Number(category.productCount ?? 0),
    });
  });

  return Array.from(grouped.values()).sort((left, right) =>
    left.label.localeCompare(right.label, "id"),
  );
}
