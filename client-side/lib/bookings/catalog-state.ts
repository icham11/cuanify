import {
  BOOKING_ADD_ON_CATALOG,
  BOOKING_PRODUCT_CATALOG,
  type CatalogAddOn,
  type PricelistCategory,
} from "@/lib/bookings/pricelist";
import { buildDashboardProductName } from "@/lib/products/dashboard-name";

export interface CustomProductEntry {
  category: string;
  subcategory: string;
  productName: string;
  variantLabel: string;
  price: number;
}

export interface CustomAddOnEntry {
  category: string;
  id: string;
  label: string;
  price: number;
  cogs?: number;
}

export interface CatalogAdminState {
  productVariantPriceOverrides: Record<string, number>;
  addOnPriceOverrides: Record<string, number>;
  addOnCogsOverrides: Record<string, number>;
  inactiveProducts: string[];
  inactiveAddOns: string[];
  customProducts: CustomProductEntry[];
  customAddOns: CustomAddOnEntry[];
}

export const EMPTY_CATALOG_ADMIN_STATE: CatalogAdminState = {
  productVariantPriceOverrides: {},
  addOnPriceOverrides: {},
  addOnCogsOverrides: {},
  inactiveProducts: [],
  inactiveAddOns: [],
  customProducts: [],
  customAddOns: [],
};

const CORE_BOOKING_CATEGORY_NAMES = new Set(
  BOOKING_PRODUCT_CATALOG.map((entry) => entry.category),
);

function isCoreBookingCategory(category: string): boolean {
  return CORE_BOOKING_CATEGORY_NAMES.has(category);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeMoney(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed));
}

function normalizeNameKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildDashboardNameKey(productName: string, variantLabel: string): string {
  return normalizeNameKey(
    buildDashboardProductName({
      productName: productName.trim(),
      variantLabel: variantLabel.trim(),
      variantCount: 1,
    }),
  );
}

function getReservedDashboardNameKeys(): Set<string> {
  const keys = new Set<string>();

  BOOKING_PRODUCT_CATALOG.forEach((category) => {
    category.subcategories.forEach((subcategory) => {
      subcategory.products.forEach((product) => {
        product.variants.forEach((variant) => {
          keys.add(
            normalizeNameKey(
              buildDashboardProductName({
                productName: product.name,
                variantLabel: variant.label,
                variantCount: product.variants.length,
              }),
            ),
          );
        });
      });
    });
  });

  return keys;
}

function normalizeNumberRecord(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entry]) => [key, normalizeMoney(entry)] as const)
      .filter(([key]) => key.length > 0),
  );
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

export function normalizeCatalogAdminState(
  value: unknown,
): CatalogAdminState {
  if (!isRecord(value)) return EMPTY_CATALOG_ADMIN_STATE;

  const reservedDashboardNameKeys = getReservedDashboardNameKeys();
  const seenCustomDashboardNameKeys = new Set<string>();

  return {
    productVariantPriceOverrides: normalizeNumberRecord(
      value.productVariantPriceOverrides,
    ),
    addOnPriceOverrides: normalizeNumberRecord(value.addOnPriceOverrides),
    addOnCogsOverrides: normalizeNumberRecord(value.addOnCogsOverrides),
    inactiveProducts: normalizeStringList(value.inactiveProducts),
    inactiveAddOns: normalizeStringList(value.inactiveAddOns),
    customProducts: Array.isArray(value.customProducts)
      ? value.customProducts
          .filter(isRecord)
          .map((entry) => ({
            category: String(entry.category || ""),
            subcategory: String(entry.subcategory || ""),
            productName: String(entry.productName || ""),
            variantLabel: String(entry.variantLabel || ""),
            price: normalizeMoney(entry.price),
          }))
          .filter(
            (entry) =>
              entry.category &&
              entry.subcategory &&
              entry.productName &&
              entry.variantLabel,
          )
          .filter((entry) => {
            const dashboardNameKey = buildDashboardNameKey(
              entry.productName,
              entry.variantLabel,
            );
            if (!dashboardNameKey) return false;
            if (reservedDashboardNameKeys.has(dashboardNameKey)) {
              return false;
            }
            if (seenCustomDashboardNameKeys.has(dashboardNameKey)) {
              return false;
            }
            seenCustomDashboardNameKeys.add(dashboardNameKey);
            return true;
          })
      : [],
    customAddOns: Array.isArray(value.customAddOns)
      ? value.customAddOns
          .filter(isRecord)
          .map((entry) => ({
            category: String(entry.category || ""),
            id: String(entry.id || ""),
            label: String(entry.label || ""),
            price: normalizeMoney(entry.price),
            cogs: normalizeMoney(entry.cogs),
          }))
          .filter(
            (entry) =>
              entry.category &&
              entry.id &&
              entry.label &&
              isCoreBookingCategory(entry.category),
          )
      : [],
  };
}

export function makeProductKey(
  category: string,
  subcategory: string,
  productName: string,
): string {
  return [category, subcategory, productName].join("||");
}

export function makeVariantKey(
  category: string,
  subcategory: string,
  productName: string,
  variantLabel: string,
): string {
  return [category, subcategory, productName, variantLabel].join("||");
}

export function makeAddOnKey(category: string, addOnId: string): string {
  return [category, addOnId].join("||");
}

function cloneCatalog(base: PricelistCategory[]): PricelistCategory[] {
  return base.map((category) => ({
    ...category,
    subcategories: category.subcategories.map((subcategory) => ({
      ...subcategory,
      products: subcategory.products.map((product) => ({
        ...product,
        variants: product.variants.map((variant) => ({ ...variant })),
      })),
    })),
  }));
}

export function buildEffectiveProductCatalog(
  state: CatalogAdminState,
): PricelistCategory[] {
  const next = cloneCatalog(BOOKING_PRODUCT_CATALOG);

  state.customProducts.forEach((entry) => {
    let category = next.find((item) => item.category === entry.category);
    if (!category) {
      category = {
        category: entry.category,
        keywords: [],
        subcategories: [],
      };
      next.push(category);
    }

    let subcategory = category.subcategories.find(
      (item) => item.name === entry.subcategory,
    );
    if (!subcategory) {
      subcategory = {
        name: entry.subcategory,
        keywords: [],
        products: [],
      };
      category.subcategories.push(subcategory);
    }

    const targetProduct = subcategory.products.find(
      (item) => item.name === entry.productName,
    );

    if (targetProduct) {
      const hasVariant = targetProduct.variants.some(
        (variant) => variant.label === entry.variantLabel,
      );
      if (!hasVariant) {
        targetProduct.variants.push({
          label: entry.variantLabel,
          price: normalizeMoney(entry.price),
        });
      }
      return;
    }

    subcategory.products.push({
      name: entry.productName,
      variants: [
        {
          label: entry.variantLabel,
          price: normalizeMoney(entry.price),
        },
      ],
      defaultVariant: entry.variantLabel,
      keywords: [],
    });
  });

  next.forEach((category) => {
    category.subcategories.forEach((subcategory) => {
      subcategory.products = subcategory.products
        .filter((product) => {
          const productKey = makeProductKey(
            category.category,
            subcategory.name,
            product.name,
          );
          return !state.inactiveProducts.includes(productKey);
        })
        .map((product) => {
          const variants = product.variants.map((variant) => {
            const key = makeVariantKey(
              category.category,
              subcategory.name,
              product.name,
              variant.label,
            );
            const override = state.productVariantPriceOverrides[key];
            return {
              ...variant,
              price:
                override !== undefined
                  ? normalizeMoney(override)
                  : variant.price,
            };
          });

          return {
            ...product,
            variants,
            defaultVariant:
              variants.find((item) => item.label === product.defaultVariant)
                ?.label ??
              variants[0]?.label ??
              "Standard",
          };
        });
    });
  });

  return next;
}

export function buildEffectiveAddOnCatalog(
  state: CatalogAdminState,
): Record<string, CatalogAddOn[]> {
  const next: Record<string, CatalogAddOn[]> = Object.fromEntries(
    Object.entries(BOOKING_ADD_ON_CATALOG).map(([category, list]) => [
      category,
      list.map((item) => ({ ...item })),
    ]),
  );

  state.customAddOns.forEach((entry) => {
    if (!isCoreBookingCategory(entry.category)) return;
    const list = next[entry.category] ?? [];
    const exists = list.some((item) => item.id === entry.id);
    if (exists) return;
    list.push({
      id: entry.id,
      label: entry.label,
      price: normalizeMoney(entry.price),
      cogs: normalizeMoney(entry.cogs ?? 0),
    });
    next[entry.category] = list;
  });

  Object.entries(next).forEach(([category, list]) => {
    next[category] = list
      .filter(
        (item) =>
          !state.inactiveAddOns.includes(makeAddOnKey(category, item.id)),
      )
      .map((item) => {
        const key = makeAddOnKey(category, item.id);
        const override = state.addOnPriceOverrides[key];
        const cogsOverride = state.addOnCogsOverrides[key];
        return {
          ...item,
          price: override !== undefined ? normalizeMoney(override) : item.price,
          cogs:
            cogsOverride !== undefined
              ? normalizeMoney(cogsOverride)
              : normalizeMoney(item.cogs ?? 0),
        };
      });
  });

  return next;
}
