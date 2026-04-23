import {
  BOOKING_PRODUCT_CATALOG,
  ensureCatalogSelectionFromCatalog,
  getUnitPriceBySelectionFromCatalog,
  type PricelistCategory,
} from "@/lib/bookings/pricelist";

export type PricingProductType =
  | "COOKIE"
  | "BOUQUET"
  | "CAKE"
  | "CUPCAKE"
  | "TOWER";

export type BouquetType = "HAND" | "STANDING";
export type CakeType = "DUMMY" | "REAL";
export type CupcakePackType = "DOZEN" | "INDIVIDUAL";

interface CookieRule {
  code: string;
  label: string;
  min: number;
  max: number;
}

export interface PricingOrderItemInput {
  id?: string;
  category?: string;
  subcategory?: string;
  productName?: string;
  size?: string;
  quantity?: number;
  notes?: string;
  tokenDifficulty?: string;
  productType?: string;
  selectedPrice?: number;
  basePrice?: number;
  cookiePrice?: number;
  designCount?: number;
  additionalDesignCount?: number;
  additionalCost?: number;
  bouquetType?: string;
  bouquetCost?: number;
  cakeDiameterCm?: number;
  cakeHeightCm?: number;
  cakeType?: string;
  cupcakePackType?: string;
  hasCookieTopper?: boolean;
  lineTotal?: number;
}

export interface ItemPricingSafeResult {
  itemId?: string;
  productType: PricingProductType | null;
  total: number;
  fallbackUsed: boolean;
  warnings: string[];
}

export interface OrderPricingSafeResult {
  total: number;
  itemsTotal: number;
  fallbackUsed: boolean;
  usedOrderFallback: boolean;
  warnings: string[];
  itemResults: ItemPricingSafeResult[];
}

export class PricingValidationError extends Error {
  code: string;

  constructor(message: string, code = "PRICING_VALIDATION_ERROR") {
    super(message);
    this.name = "PricingValidationError";
    this.code = code;
  }
}

const COOKIE_MIN_ORDER = 20;
const COOKIE_INCLUDED_DESIGN_LIMIT = 5;
const COOKIE_DESIGN_PRICE = 10_000;
const COOKIE_MAX_REASONABLE_UNIT_PRICE = 100_000;

const BOUQUET_HAND_COST = 100_000;
const BOUQUET_STANDING_COST = 250_000;
const BOUQUET_HAND_MIN_QTY = 7;
const BOUQUET_HAND_MAX_QTY = 10;
const BOUQUET_STANDING_MIN_QTY = 12;
const BOUQUET_STANDING_MAX_QTY = 20;

const CUPCAKE_DOZEN_PRICE = 240_000;
const CUPCAKE_INDIVIDUAL_MIN_PRICE = 30_000;

const TOWER_COOKIE_QTY = 40;
const TOWER_PACKAGING_COST = 250_000;
const BOUQUET_DIFFICULTY_COOKIE_PRICE_MAP = {
  SIMPLE: 17_000,
  NORMAL: 20_000,
  HARD: 25_000,
  ADVANCED: 30_000,
  EXPERT: 35_000,
} as const;

const CAKE_PRICE_MATRIX: Record<string, number> = {
  "14|10|DUMMY": 250_000,
  "14|10|REAL": 400_000,
  "15|15|DUMMY": 300_000,
  "15|15|REAL": 500_000,
  "14|15|DUMMY": 300_000, // Compatibility alias for "Cake 15 cm" catalog wording.
  "14|15|REAL": 500_000,
  "16|10|DUMMY": 275_000,
  "16|10|REAL": 450_000,
  "16|15|DUMMY": 325_000,
  "16|15|REAL": 550_000,
  "18|10|DUMMY": 300_000,
  "18|10|REAL": 550_000,
  "18|15|DUMMY": 350_000,
  "18|15|REAL": 650_000,
  "20|10|DUMMY": 350_000,
  "20|10|REAL": 650_000,
  "20|15|DUMMY": 400_000,
  "20|15|REAL": 750_000,
};

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function asMoney(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed));
}

function asSignedMoney(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed);
}

function asPositiveInt(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

function firstPositive(...values: number[]): number {
  return values.find((value) => value > 0) ?? 0;
}

function normalizeDifficultyTokenForPrice(
  value: unknown,
): keyof typeof BOUQUET_DIFFICULTY_COOKIE_PRICE_MAP | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toUpperCase();
  if (!normalized) return null;

  if (normalized === "MEDIUM") return "NORMAL";
  if (normalized === "DIFFICULT") return "HARD";

  if (normalized in BOUQUET_DIFFICULTY_COOKIE_PRICE_MAP) {
    return normalized as keyof typeof BOUQUET_DIFFICULTY_COOKIE_PRICE_MAP;
  }

  return null;
}

function resolveBouquetCookiePriceFromDifficulty(
  item: PricingOrderItemInput,
): number {
  const difficulty = normalizeDifficultyTokenForPrice(item.tokenDifficulty);
  if (!difficulty) return 0;

  return BOUQUET_DIFFICULTY_COOKIE_PRICE_MAP[difficulty];
}

function getFallbackItemTotal(item: PricingOrderItemInput): number {
  return firstPositive(asMoney(item.lineTotal), asMoney(item.basePrice));
}

function categoryFromProductType(productType: PricingProductType): string {
  switch (productType) {
    case "COOKIE":
      return "Cookies";
    case "BOUQUET":
      return "Buket";
    case "CAKE":
      return "Cake";
    case "CUPCAKE":
      return "Cupcakes";
    case "TOWER":
      return "Cookies Tower";
    default:
      return "Cake";
  }
}

function getItemSource(item: PricingOrderItemInput): string {
  return normalizeText(
    `${item.category ?? ""} ${item.subcategory ?? ""} ${item.productName ?? ""} ${item.size ?? ""} ${item.notes ?? ""}`,
  );
}

function hasAny(source: string, probes: string[]): boolean {
  return probes.some((probe) => source.includes(probe));
}

function isWithinRange(price: number, min: number, max: number): boolean {
  return price >= min && price <= max;
}

function detectProductType(
  item: PricingOrderItemInput,
): PricingProductType | null {
  const explicit = normalizeText(item.productType).toUpperCase();
  if (
    explicit === "COOKIE" ||
    explicit === "BOUQUET" ||
    explicit === "CAKE" ||
    explicit === "CUPCAKE" ||
    explicit === "TOWER"
  ) {
    return explicit;
  }

  const source = getItemSource(item);

  if (source.includes("tower")) return "TOWER";
  if (source.includes("buket") || source.includes("bouquet")) return "BOUQUET";
  if (source.includes("cupcake")) return "CUPCAKE";
  if (source.includes("cookie")) return "COOKIE";
  if (source.includes("cake")) return "CAKE";

  return null;
}

function detectBouquetType(item: PricingOrderItemInput): BouquetType | null {
  const explicit = normalizeText(item.bouquetType).toUpperCase();
  if (explicit === "HAND" || explicit === "STANDING") {
    return explicit;
  }

  const source = getItemSource(item);
  if (source.includes("standing")) return "STANDING";
  if (source.includes("hand")) return "HAND";

  const quantity = asPositiveInt(item.quantity);
  if (quantity >= BOUQUET_HAND_MIN_QTY && quantity <= BOUQUET_HAND_MAX_QTY) {
    return "HAND";
  }
  if (
    quantity >= BOUQUET_STANDING_MIN_QTY &&
    quantity <= BOUQUET_STANDING_MAX_QTY
  ) {
    return "STANDING";
  }

  return null;
}

function detectCakeType(item: PricingOrderItemInput): CakeType | null {
  const explicit = normalizeText(item.cakeType).toUpperCase();
  if (explicit === "DUMMY" || explicit === "REAL") {
    return explicit as CakeType;
  }

  const source = getItemSource(item);
  if (source.includes("dummy")) return "DUMMY";
  if (source.includes("real")) return "REAL";
  return null;
}

function detectCupcakePackType(
  item: PricingOrderItemInput,
): CupcakePackType | null {
  const explicit = normalizeText(item.cupcakePackType).toUpperCase();
  if (explicit === "DOZEN" || explicit === "INDIVIDUAL") {
    return explicit;
  }

  const source = getItemSource(item);
  if (hasAny(source, ["dozen", "12 pcs", "12pcs", "lusin"])) return "DOZEN";
  if (hasAny(source, ["individual", "per pcs", "per piece", "single"])) {
    return "INDIVIDUAL";
  }

  return null;
}

function detectCookieRule(item: PricingOrderItemInput): CookieRule | null {
  const source = getItemSource(item);

  if (source.includes("edible print")) {
    if (hasAny(source, ["custom shape", "custom"])) {
      return {
        code: "COOKIE_EDIBLE_PRINT_CUSTOM_SHAPE",
        label: "COOKIE edible print custom shape",
        min: 25_000,
        max: 30_000,
      };
    }

    if (hasAny(source, ["square", "circle", "bulat"])) {
      return {
        code: "COOKIE_EDIBLE_PRINT_SQUARE_CIRCLE",
        label: "COOKIE edible print square/circle",
        min: 20_000,
        max: 20_000,
      };
    }
  }

  const isCartoon = source.includes("cartoon");
  const isChibi = source.includes("chibi");
  const isAnimeOrCaricature =
    source.includes("anime") || source.includes("caricature");
  const isHalfBody = source.includes("half body");
  const isFullBody = source.includes("full body");
  const hasAccessories = hasAny(source, [
    "accessories",
    "accessory",
    "aksesoris",
    "aksesori",
  ]);
  const isFaceOnly = hasAny(source, ["face only", "face", "head only", "head"]);

  if (isCartoon) {
    if (isFullBody) {
      return {
        code: "COOKIE_CARTOON_FULL_BODY",
        label: "COOKIE cartoon full body",
        min: 30_000,
        max: 30_000,
      };
    }
    if (isHalfBody) {
      return {
        code: "COOKIE_CARTOON_HALF_BODY",
        label: "COOKIE cartoon half body",
        min: 20_000,
        max: 25_000,
      };
    }
    if (isFaceOnly) {
      return {
        code: "COOKIE_CARTOON_FACE_ONLY",
        label: "COOKIE cartoon face only",
        min: 17_000,
        max: 20_000,
      };
    }
  }

  if (isChibi) {
    if (isFullBody && hasAccessories) {
      return {
        code: "COOKIE_CHIBI_FULL_BODY_ACCESSORIES",
        label: "COOKIE chibi full body + accessories",
        min: 35_000,
        max: 40_000,
      };
    }
    if (isFullBody) {
      return {
        code: "COOKIE_CHIBI_FULL_BODY",
        label: "COOKIE chibi full body",
        min: 30_000,
        max: 35_000,
      };
    }
    if (isHalfBody) {
      return {
        code: "COOKIE_CHIBI_HALF_BODY",
        label: "COOKIE chibi half body",
        min: 25_000,
        max: 30_000,
      };
    }
    if (isFaceOnly) {
      return {
        code: "COOKIE_CHIBI_FACE_ONLY",
        label: "COOKIE chibi face only",
        min: 20_000,
        max: 25_000,
      };
    }
  }

  if (isAnimeOrCaricature) {
    if (isFullBody) {
      return {
        code: "COOKIE_ANIME_CARICATURE_FULL_BODY",
        label: "COOKIE anime/caricature full body",
        min: 35_000,
        max: 40_000,
      };
    }
    if (isHalfBody) {
      return {
        code: "COOKIE_ANIME_CARICATURE_HALF_BODY",
        label: "COOKIE anime/caricature half body",
        min: 30_000,
        max: 35_000,
      };
    }
    if (isFaceOnly) {
      return {
        code: "COOKIE_ANIME_CARICATURE_FACE_ONLY",
        label: "COOKIE anime/caricature face only",
        min: 25_000,
        max: 30_000,
      };
    }
  }

  if (hasAny(source, ["tulisan saja", "tulisan", "text only", "custom text"])) {
    return {
      code: "COOKIE_CUSTOM_TEXT_ONLY",
      label: "COOKIE custom text only",
      min: 17_000,
      max: 17_000,
    };
  }

  if (hasAny(source, ["simple shape", "heart", "flower", "shape simple"])) {
    return {
      code: "COOKIE_SIMPLE_SHAPE",
      label: "COOKIE simple shape",
      min: 17_000,
      max: 17_000,
    };
  }

  if (
    hasAny(source, [
      "medium",
      "medium difficulty",
      "baby clothes",
      "custom shape",
    ])
  ) {
    return {
      code: "COOKIE_MEDIUM_DIFFICULTY",
      label: "COOKIE medium difficulty",
      min: 20_000,
      max: 20_000,
    };
  }

  return null;
}

function validateCookieSelectedPrice(
  selectedPrice: number,
  rule: CookieRule,
): void {
  if (!isWithinRange(selectedPrice, rule.min, rule.max)) {
    throw new PricingValidationError(
      `${rule.label} selectedPrice must be within Rp ${rule.min.toLocaleString("id-ID")} - Rp ${rule.max.toLocaleString("id-ID")}, received Rp ${selectedPrice.toLocaleString("id-ID")}.`,
      `${rule.code}_OUT_OF_RANGE`,
    );
  }
}

function inferCatalogUnitPrice(
  item: PricingOrderItemInput,
  productType: PricingProductType,
  catalog: PricelistCategory[] = BOOKING_PRODUCT_CATALOG,
): number {
  const category = item.category || categoryFromProductType(productType);
  if (!category) return 0;

  const normalized = ensureCatalogSelectionFromCatalog(catalog, {
    category,
    subcategory: item.subcategory,
    productName: item.productName,
    size: item.size,
  });

  return asMoney(getUnitPriceBySelectionFromCatalog(catalog, normalized));
}

function getCookieUnitPriceCandidates(
  item: PricingOrderItemInput,
  quantity: number,
  catalog?: PricelistCategory[],
): number[] {
  const selectedPrice = asMoney(item.selectedPrice);
  const cookiePrice = asMoney(item.cookiePrice);
  const basePrice = asMoney(item.basePrice);
  const catalogPrice = inferCatalogUnitPrice(item, "COOKIE", catalog);
  const lineTotal = asMoney(item.lineTotal);
  const baseAsUnit =
    basePrice > COOKIE_MAX_REASONABLE_UNIT_PRICE && quantity > 0
      ? asMoney(basePrice / quantity)
      : basePrice;
  const lineAsUnit = quantity > 0 ? asMoney(lineTotal / quantity) : 0;

  return [selectedPrice, cookiePrice, baseAsUnit, catalogPrice, lineAsUnit];
}

function getCookieExplicitUnitPriceCandidates(
  item: PricingOrderItemInput,
  quantity: number,
): number[] {
  const selectedPrice = asMoney(item.selectedPrice);
  const cookiePrice = asMoney(item.cookiePrice);
  const basePrice = asMoney(item.basePrice);
  const lineTotal = asMoney(item.lineTotal);
  const baseAsUnit =
    basePrice > COOKIE_MAX_REASONABLE_UNIT_PRICE && quantity > 0
      ? asMoney(basePrice / quantity)
      : basePrice;
  const lineAsUnit = quantity > 0 ? asMoney(lineTotal / quantity) : 0;

  return [selectedPrice, cookiePrice, baseAsUnit, lineAsUnit];
}

function resolveCookieUnitPrice(
  item: PricingOrderItemInput,
  quantity: number,
  catalog?: PricelistCategory[],
): number {
  const rule = detectCookieRule(item);
  const selectedPrice = asMoney(item.selectedPrice);

  if (rule && selectedPrice > 0) {
    validateCookieSelectedPrice(selectedPrice, rule);
  }

  const candidates = getCookieUnitPriceCandidates(item, quantity, catalog);
  if (!rule) {
    return firstPositive(...candidates);
  }

  if (rule.min !== rule.max) {
    const explicitSelected = firstPositive(
      ...getCookieExplicitUnitPriceCandidates(item, quantity),
    );
    if (explicitSelected <= 0) return 0;
    validateCookieSelectedPrice(explicitSelected, rule);
    return explicitSelected;
  }

  const inRangeCandidate = candidates.find(
    (candidate) =>
      candidate > 0 && isWithinRange(candidate, rule.min, rule.max),
  );

  if (inRangeCandidate) return inRangeCandidate;
  if (selectedPrice > 0) {
    validateCookieSelectedPrice(selectedPrice, rule);
  }

  return 0;
}

function isCustomCookieItem(item: PricingOrderItemInput): boolean {
  if (detectProductType(item) !== "COOKIE") return false;
  const source = getItemSource(item);
  if (
    source.includes(" custom cookies ") ||
    source.includes(" individual cookie ")
  ) {
    return true;
  }
  if (source.includes(" cookies ")) {
    if (
      source.includes(" simple") ||
      source.includes(" normal") ||
      source.includes(" hard") ||
      source.includes(" advanced") ||
      source.includes(" expert")
    ) {
      return true;
    }
    if (source.endsWith(" cookies")) return true;
  }
  return (
    source.includes("custom cookies") || source.includes("individual cookie")
  );
}

function getCustomCookieQuantity(item: PricingOrderItemInput): number {
  if (!isCustomCookieItem(item)) return 0;
  return asPositiveInt(item.quantity);
}

function validateCustomCookieMinimumOrder(
  items: PricingOrderItemInput[],
): void {
  const customCookieTotalQty = (items ?? []).reduce(
    (sum, item) => sum + getCustomCookieQuantity(item),
    0,
  );
  if (customCookieTotalQty <= 0) return;

  if (customCookieTotalQty < COOKIE_MIN_ORDER) {
    throw new PricingValidationError(
      `COOKIE minimum total order is ${COOKIE_MIN_ORDER} pcs, received ${customCookieTotalQty} pcs.`,
      "COOKIE_MINIMUM_ORDER",
    );
  }
}

function resolveBouquetCookiePrice(
  item: PricingOrderItemInput,
  quantity: number,
  bouquetType: BouquetType,
): number {
  const fromDifficulty = resolveBouquetCookiePriceFromDifficulty(item);
  if (fromDifficulty > 0) return fromDifficulty;

  const bouquetCost =
    bouquetType === "HAND" ? BOUQUET_HAND_COST : BOUQUET_STANDING_COST;

  const selectedPrice = asMoney(item.selectedPrice);
  if (selectedPrice > 0) return selectedPrice;

  const cookiePrice = asMoney(item.cookiePrice);
  if (cookiePrice > 0) return cookiePrice;

  const basePrice = asMoney(item.basePrice);
  if (basePrice > 0) {
    if (basePrice <= COOKIE_MAX_REASONABLE_UNIT_PRICE) return basePrice;
  }

  const lineTotal = asMoney(item.lineTotal);
  if (quantity > 0 && lineTotal > bouquetCost) {
    return asMoney((lineTotal - bouquetCost) / quantity);
  }

  return 0;
}

function parseCakeDimensionCandidates(item: PricingOrderItemInput): {
  diameterCm: number;
  heightCm: number;
} {
  const explicitDiameter = asPositiveInt(item.cakeDiameterCm);
  const explicitHeight = asPositiveInt(item.cakeHeightCm);

  const source =
    `${item.subcategory ?? ""} ${item.productName ?? ""} ${item.size ?? ""}`.toLowerCase();
  const normalized = source.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ");

  const diameterMatch = normalized.match(/\b(14|15|16|18|20)\b/);
  const inferredDiameterCm = diameterMatch?.[1] ? Number(diameterMatch[1]) : 0;

  let inferredHeightCm = 0;
  const explicitHeightMatch = normalized.match(/\b(10|15)\s*cm\b/);
  if (explicitHeightMatch?.[1]) {
    inferredHeightCm = Number(explicitHeightMatch[1]);
  } else if (normalized.includes("tall")) {
    inferredHeightCm = 15;
  } else if (normalized.includes("cake 15 cm")) {
    inferredHeightCm = 15;
  } else if (normalized.includes("cake 10 cm")) {
    inferredHeightCm = 10;
  }

  return {
    diameterCm: explicitDiameter || inferredDiameterCm,
    heightCm: explicitHeight || inferredHeightCm,
  };
}

function resolveCakeMatrixPrice(item: PricingOrderItemInput): number {
  const cakeType = detectCakeType(item);
  if (!cakeType) return 0;

  const dimensions = parseCakeDimensionCandidates(item);
  if (dimensions.diameterCm <= 0) return 0;

  const heightCm = dimensions.heightCm || 10;
  const key = `${dimensions.diameterCm}|${heightCm}|${cakeType}`;
  return asMoney(CAKE_PRICE_MATRIX[key] ?? 0);
}

function validateBouquetQuantity(
  quantity: number,
  bouquetType: BouquetType,
): void {
  if (bouquetType === "HAND") {
    if (quantity < BOUQUET_HAND_MIN_QTY || quantity > BOUQUET_HAND_MAX_QTY) {
      throw new PricingValidationError(
        `HAND bouquet quantity must be ${BOUQUET_HAND_MIN_QTY}-${BOUQUET_HAND_MAX_QTY}, received ${quantity}.`,
        "BOUQUET_HAND_QTY_OUT_OF_RANGE",
      );
    }
    return;
  }

  if (bouquetType === "STANDING") {
    if (
      quantity < BOUQUET_STANDING_MIN_QTY ||
      quantity > BOUQUET_STANDING_MAX_QTY
    ) {
      throw new PricingValidationError(
        `STANDING bouquet quantity must be ${BOUQUET_STANDING_MIN_QTY}-${BOUQUET_STANDING_MAX_QTY}, received ${quantity}.`,
        "BOUQUET_STANDING_QTY_OUT_OF_RANGE",
      );
    }
  }
}

function resolveCupcakeBasePrice(
  item: PricingOrderItemInput,
  packType: CupcakePackType | null,
  catalog?: PricelistCategory[],
): number {
  const quantity = Math.max(1, asPositiveInt(item.quantity));
  const selectedPrice = asMoney(item.selectedPrice);
  const rawBasePrice = asMoney(item.basePrice);
  const catalogUnitPrice = inferCatalogUnitPrice(item, "CUPCAKE", catalog);
  const catalogLinePrice =
    catalogUnitPrice > 0 ? asMoney(catalogUnitPrice * quantity) : 0;

  let basePrice = firstPositive(selectedPrice, rawBasePrice, catalogLinePrice);

  if (packType === "DOZEN") {
    const expectedLinePrice = CUPCAKE_DOZEN_PRICE * quantity;
    if (selectedPrice > 0 && selectedPrice !== expectedLinePrice) {
      throw new PricingValidationError(
        `CUPCAKE dozen selectedPrice must be Rp ${expectedLinePrice.toLocaleString("id-ID")} for quantity ${quantity}, received Rp ${selectedPrice.toLocaleString("id-ID")}.`,
        "CUPCAKE_DOZEN_PRICE_MISMATCH",
      );
    }
    if (basePrice <= 0) basePrice = expectedLinePrice;
  }

  if (packType === "INDIVIDUAL" && basePrice > 0) {
    const unitPrice = asMoney(basePrice / quantity);
    const shouldStrictlyValidate =
      item.selectedPrice !== undefined ||
      normalizeText(item.cupcakePackType) !== "";
    if (shouldStrictlyValidate && unitPrice < CUPCAKE_INDIVIDUAL_MIN_PRICE) {
      throw new PricingValidationError(
        `CUPCAKE individual price starts from Rp ${CUPCAKE_INDIVIDUAL_MIN_PRICE.toLocaleString("id-ID")} per pcs, received Rp ${unitPrice.toLocaleString("id-ID")} per pcs.`,
        "CUPCAKE_INDIVIDUAL_PRICE_TOO_LOW",
      );
    }
  }

  return basePrice;
}

function resolveTowerCookiePrice(item: PricingOrderItemInput): number {
  const selectedPrice = asMoney(item.selectedPrice);
  if (selectedPrice > 0) return selectedPrice;

  const cookiePrice = asMoney(item.cookiePrice);
  if (cookiePrice > 0) return cookiePrice;

  const basePrice = asMoney(item.basePrice);
  if (basePrice > 0) {
    if (basePrice > TOWER_PACKAGING_COST) {
      return asMoney((basePrice - TOWER_PACKAGING_COST) / TOWER_COOKIE_QTY);
    }
    if (basePrice < COOKIE_MAX_REASONABLE_UNIT_PRICE) {
      return basePrice;
    }
  }

  const lineTotal = asMoney(item.lineTotal);
  if (lineTotal > TOWER_PACKAGING_COST) {
    return asMoney((lineTotal - TOWER_PACKAGING_COST) / TOWER_COOKIE_QTY);
  }

  return 0;
}

export function calculateCookie(
  item: PricingOrderItemInput,
  catalog?: PricelistCategory[],
): number {
  const quantity = asPositiveInt(item.quantity);

  const unitPrice = resolveCookieUnitPrice(item, quantity, catalog);
  if (unitPrice <= 0) return getFallbackItemTotal(item);

  const designCount = asPositiveInt(item.designCount);
  const legacyAdditionalDesignCount = asPositiveInt(item.additionalDesignCount);
  const additionalDesignCount =
    designCount > 0
      ? Math.max(0, designCount - COOKIE_INCLUDED_DESIGN_LIMIT)
      : legacyAdditionalDesignCount;

  return asMoney(
    quantity * unitPrice + additionalDesignCount * COOKIE_DESIGN_PRICE,
  );
}

export function calculateBouquet(item: PricingOrderItemInput): number {
  const quantity = asPositiveInt(item.quantity);
  if (quantity <= 0) {
    throw new PricingValidationError(
      "BOUQUET quantity must be greater than 0.",
      "BOUQUET_INVALID_QUANTITY",
    );
  }

  const bouquetType = detectBouquetType(item);
  if (!bouquetType) return getFallbackItemTotal(item);

  validateBouquetQuantity(quantity, bouquetType);

  const bouquetCost =
    bouquetType === "HAND" ? BOUQUET_HAND_COST : BOUQUET_STANDING_COST;

  const cookiePrice = resolveBouquetCookiePrice(item, quantity, bouquetType);
  if (cookiePrice <= 0) return getFallbackItemTotal(item);

  return asMoney(cookiePrice * quantity + bouquetCost);
}

export function calculateCake(
  item: PricingOrderItemInput,
  catalog?: PricelistCategory[],
): number {
  const matrixPrice = resolveCakeMatrixPrice(item);
  const selectedPrice = asMoney(item.selectedPrice);

  if (matrixPrice > 0) {
    if (selectedPrice > 0 && selectedPrice !== matrixPrice) {
      throw new PricingValidationError(
        `CAKE selectedPrice must match matrix price Rp ${matrixPrice.toLocaleString("id-ID")}, received Rp ${selectedPrice.toLocaleString("id-ID")}.`,
        "CAKE_MATRIX_PRICE_MISMATCH",
      );
    }
    return matrixPrice;
  }

  return firstPositive(
    selectedPrice,
    asMoney(item.basePrice),
    inferCatalogUnitPrice(item, "CAKE", catalog),
    asMoney(item.lineTotal),
  );
}

export function calculateCupcake(
  item: PricingOrderItemInput,
  catalog?: PricelistCategory[],
): number {
  const packType = detectCupcakePackType(item);
  const basePrice = resolveCupcakeBasePrice(item, packType, catalog);
  if (basePrice <= 0) return getFallbackItemTotal(item);

  let cookieTopperPrice = firstPositive(
    asMoney(item.cookiePrice),
    asMoney(item.additionalCost),
  );
  const lineTotal = asMoney(item.lineTotal);
  if (cookieTopperPrice <= 0 && lineTotal > basePrice) {
    cookieTopperPrice = lineTotal - basePrice;
  }
  if (item.hasCookieTopper && cookieTopperPrice <= 0) {
    throw new PricingValidationError(
      "CUPCAKE with topper requires cookiePrice/additionalCost.",
      "CUPCAKE_TOPPER_PRICE_REQUIRED",
    );
  }

  return asMoney(basePrice + cookieTopperPrice);
}

export function calculateTower(item: PricingOrderItemInput): number {
  const cookiePrice = resolveTowerCookiePrice(item);
  if (cookiePrice <= 0) return getFallbackItemTotal(item);

  return asMoney(cookiePrice * TOWER_COOKIE_QTY + TOWER_PACKAGING_COST);
}

export function calculateItemPrice(
  item: PricingOrderItemInput,
  catalog?: PricelistCategory[],
): number {
  const productType = detectProductType(item);
  if (!productType) return getFallbackItemTotal(item);

  switch (productType) {
    case "COOKIE":
      return calculateCookie(item, catalog);
    case "BOUQUET":
      return calculateBouquet(item);
    case "CAKE":
      return calculateCake(item, catalog);
    case "CUPCAKE":
      return calculateCupcake(item, catalog);
    case "TOWER":
      return calculateTower(item);
    default:
      return getFallbackItemTotal(item);
  }
}

export function calculateItemPriceSafe(
  item: PricingOrderItemInput,
  catalog?: PricelistCategory[],
): ItemPricingSafeResult {
  const productType = detectProductType(item);

  try {
    const total = calculateItemPrice(item, catalog);
    return {
      itemId: item.id,
      productType,
      total,
      fallbackUsed: false,
      warnings: [],
    };
  } catch (error: unknown) {
    return {
      itemId: item.id,
      productType,
      total: getFallbackItemTotal(item),
      fallbackUsed: true,
      warnings: [
        error instanceof Error ? error.message : "Unknown pricing error.",
      ],
    };
  }
}

export function calculateOrderPrice(
  items: PricingOrderItemInput[],
  catalog?: PricelistCategory[],
): number {
  validateCustomCookieMinimumOrder(items);
  return asMoney(
    items.reduce((sum, item) => sum + calculateItemPrice(item, catalog), 0),
  );
}

export function calculateOrderPriceSafe(input: {
  items: PricingOrderItemInput[];
  fallbackTotal?: number;
  deliveryFee?: number;
  manualAdjustment?: number;
  catalog?: PricelistCategory[];
}): OrderPricingSafeResult {
  try {
    validateCustomCookieMinimumOrder(input.items ?? []);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown pricing error.";
    return {
      total: asMoney(input.fallbackTotal),
      itemsTotal: 0,
      fallbackUsed: true,
      usedOrderFallback: true,
      warnings: [message],
      itemResults: [],
    };
  }

  const itemResults = (input.items ?? []).map((item) =>
    calculateItemPriceSafe(item, input.catalog),
  );
  const warnings = itemResults.flatMap((result) => result.warnings);

  const itemsTotal = asMoney(
    itemResults.reduce((sum, result) => sum + result.total, 0),
  );
  const deliveryFee = asMoney(input.deliveryFee);
  const manualAdjustment = asSignedMoney(input.manualAdjustment);
  const computedTotal = Math.max(
    0,
    Math.round(itemsTotal + deliveryFee + manualAdjustment),
  );

  const fallbackTotal = asMoney(input.fallbackTotal);
  const hasItemFallback = itemResults.some((result) => result.fallbackUsed);
  const usedOrderFallback =
    fallbackTotal > 0 && (hasItemFallback || computedTotal <= 0);
  const total = usedOrderFallback ? fallbackTotal : computedTotal;

  if (usedOrderFallback) {
    warnings.push(
      "Used fallback order total to preserve backward compatibility.",
    );
  }

  return {
    total,
    itemsTotal,
    fallbackUsed: hasItemFallback || usedOrderFallback,
    usedOrderFallback,
    warnings,
    itemResults,
  };
}
