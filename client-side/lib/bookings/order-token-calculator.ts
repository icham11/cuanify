/**
 * Shared item-based token calculator.
 * Safe for both client and server imports (no DB/prisma dependencies).
 */

/**
 * Interface for items passed to calculateOrderTokenFromItems.
 */
export interface OrderItemForTokenCalc {
  category: string;
  subcategory?: string;
  productName?: string;
  difficulty?: string;
  tokenDifficulty?: string;
  quantity?: number;
  customTokenPerUnit?: number;
}

const COOKIE_DIFFICULTY_TOKEN_MAP: Record<string, number> = {
  simple: 1,
  mudah: 1,
  sederhana: 1,
  gampang: 1,
  medium: 2,
  sedang: 2,
  menengah: 2,
  normal: 2,
  hard: 3,
  sulit: 3,
  susah: 3,
  rumit: 3,
  difficult: 3,
  advanced: 4,
  mahir: 4,
  expert: 5,
};

const BOUQUET_TOKEN_MAP: Record<string, number> = {
  hand_bouquet: 20,
  standing_bouquet: 50,
};

const BOUQUET_COOKIE_QTY_MIN = 7;
const BOUQUET_COOKIE_QTY_MAX = 20;

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSearchSource(item: OrderItemForTokenCalc): string {
  return normalizeText(
    `${item.category || ""} ${item.subcategory || ""} ${item.productName || ""}`,
  );
}

function parseQuantity(raw: number | undefined): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 1;
  if (parsed <= 0) return 0;
  return Math.min(1000, Math.round(parsed));
}

function resolveCookieDifficultyToken(item: OrderItemForTokenCalc): number {
  const difficultyRaw = normalizeText(
    `${item.tokenDifficulty || ""} ${item.difficulty || ""}`,
  );
  if (!difficultyRaw) return COOKIE_DIFFICULTY_TOKEN_MAP.simple;

  const firstToken = difficultyRaw.split(" ")[0] || "";
  if (firstToken && COOKIE_DIFFICULTY_TOKEN_MAP[firstToken]) {
    return COOKIE_DIFFICULTY_TOKEN_MAP[firstToken];
  }

  if (difficultyRaw.includes("expert"))
    return COOKIE_DIFFICULTY_TOKEN_MAP.expert;
  if (difficultyRaw.includes("advanced") || difficultyRaw.includes("mahir")) {
    return COOKIE_DIFFICULTY_TOKEN_MAP.advanced;
  }
  if (
    difficultyRaw.includes("hard") ||
    difficultyRaw.includes("difficult") ||
    difficultyRaw.includes("sulit") ||
    difficultyRaw.includes("susah") ||
    difficultyRaw.includes("rumit")
  ) {
    return COOKIE_DIFFICULTY_TOKEN_MAP.hard;
  }
  if (
    difficultyRaw.includes("normal") ||
    difficultyRaw.includes("medium") ||
    difficultyRaw.includes("sedang") ||
    difficultyRaw.includes("menengah")
  ) {
    return COOKIE_DIFFICULTY_TOKEN_MAP.normal;
  }
  if (
    difficultyRaw.includes("simple") ||
    difficultyRaw.includes("easy") ||
    difficultyRaw.includes("mudah") ||
    difficultyRaw.includes("sederhana") ||
    difficultyRaw.includes("gampang")
  ) {
    return COOKIE_DIFFICULTY_TOKEN_MAP.simple;
  }
  return COOKIE_DIFFICULTY_TOKEN_MAP.simple;
}

function resolveBouquetToken(searchSource: string): number {
  if (searchSource.includes("standing") || searchSource.includes("sbq")) {
    return BOUQUET_TOKEN_MAP.standing_bouquet;
  }
  if (searchSource.includes("hand") || searchSource.includes("hbq")) {
    return BOUQUET_TOKEN_MAP.hand_bouquet;
  }
  return BOUQUET_TOKEN_MAP.hand_bouquet;
}

function isBouquetCookieFillQuantity(quantity: number): boolean {
  return (
    quantity >= BOUQUET_COOKIE_QTY_MIN && quantity <= BOUQUET_COOKIE_QTY_MAX
  );
}

function resolveBouquetUnits(quantity: number): number {
  if (quantity <= 0) return 0;
  // In bouquet form, qty is often cookie count (7-20), which still represents one bouquet.
  if (isBouquetCookieFillQuantity(quantity)) {
    return 1;
  }
  return quantity;
}

function calculateBouquetToken(
  item: OrderItemForTokenCalc,
  searchSource: string,
  qty: number,
): number {
  const baseToken =
    resolveBouquetToken(searchSource) * resolveBouquetUnits(qty);

  // For bouquet qty entered as cookie fill count (7-20), difficulty should impact token.
  if (!isBouquetCookieFillQuantity(qty)) {
    return baseToken;
  }

  const difficultyToken = resolveCookieDifficultyToken(item);
  const cookieWorkloadToken = difficultyToken * qty;
  return Math.max(baseToken, cookieWorkloadToken);
}

function calculateItemToken(item: OrderItemForTokenCalc): number {
  const category = normalizeText(item.category || "");
  const searchSource = getSearchSource(item);
  const qty = parseQuantity(item.quantity);
  const customToken = Number(item.customTokenPerUnit || 0);
  if (qty <= 0) return 0;

  if (Number.isFinite(customToken) && customToken > 0) {
    return Math.round(customToken) * qty;
  }

  if (
    searchSource.includes("cookies tower") ||
    searchSource.includes("cookie tower")
  ) {
    return 100 * qty;
  }

  if (searchSource.includes("buket") || searchSource.includes("bouquet")) {
    return calculateBouquetToken(item, searchSource, qty);
  }

  if (searchSource.includes("cupcake")) {
    const isDozenCupcake =
      searchSource.includes("dozen") ||
      searchSource.includes("12 pcs") ||
      searchSource.includes("12pcs") ||
      searchSource.includes("lusin");
    if (isDozenCupcake) {
      return 2 * qty;
    }
    return 5 * qty;
  }

  if (category.includes("cake")) {
    return 100 * qty;
  }

  if (searchSource.includes("cookies") || searchSource.includes("cookie")) {
    const diffToken = resolveCookieDifficultyToken(item);
    return diffToken * qty;
  }

  if (process.env.NODE_ENV !== "production") {
    console.warn(
      `[calculateItemToken] Unknown category: "${item.category}" -- returning 0 tokens`,
    );
  }
  return 0;
}

export function calculateOrderTokenFromItems(
  items: OrderItemForTokenCalc[],
): number {
  if (!items || items.length === 0) return 0;
  const total = items.reduce((sum, item) => sum + calculateItemToken(item), 0);
  return Math.max(0, total);
}
