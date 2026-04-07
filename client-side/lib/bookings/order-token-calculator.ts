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
  addOns?: string[];
  addOnQuantities?: Record<string, number>;
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

const CUPCAKE_COOKIE_ADDON_TOKEN_MAP: Record<string, number> = {
  "cookie-simple": COOKIE_DIFFICULTY_TOKEN_MAP.simple,
  "cookie-normal": COOKIE_DIFFICULTY_TOKEN_MAP.normal,
  "cookie-hard": COOKIE_DIFFICULTY_TOKEN_MAP.hard,
  "cookie-advanced": COOKIE_DIFFICULTY_TOKEN_MAP.advanced,
  "cookie-expert": COOKIE_DIFFICULTY_TOKEN_MAP.expert,
};

const CUPCAKE_DOZEN_PIECE_TOKEN = 2;
const CUPCAKE_INDIVIDUAL_PIECE_TOKEN = 5;

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

function normalizeQuantityMap(
  value: Record<string, number> | undefined,
): Record<string, number> {
  if (!value || typeof value !== "object") return {};

  const next: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) continue;
    next[key] = Math.max(1, Math.round(parsed));
  }

  return next;
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

function isDozenCupcake(searchSource: string): boolean {
  return (
    searchSource.includes("dozen") ||
    searchSource.includes("12 pcs") ||
    searchSource.includes("12pcs") ||
    searchSource.includes("lusin")
  );
}

function resolveCupcakePieceQuantity(
  searchSource: string,
  qty: number,
): number {
  if (qty <= 0) return 0;

  if (isDozenCupcake(searchSource)) {
    return qty * 12;
  }

  return qty;
}

function resolveCupcakeBaseTokenPerPiece(searchSource: string): number {
  if (isDozenCupcake(searchSource)) {
    return CUPCAKE_DOZEN_PIECE_TOKEN;
  }
  return CUPCAKE_INDIVIDUAL_PIECE_TOKEN;
}

function resolveCupcakeAddOnToken(item: OrderItemForTokenCalc): number {
  const addonIds = Array.isArray(item.addOns) ? item.addOns : [];
  if (addonIds.length === 0) return 0;

  const searchSource = getSearchSource(item);
  const pieceCount = resolveCupcakePieceQuantity(
    searchSource,
    parseQuantity(item.quantity),
  );
  if (pieceCount <= 0) return 0;

  const addOnQuantities = normalizeQuantityMap(item.addOnQuantities);

  return addonIds.reduce((sum, addonId) => {
    const tokenPerPiece = CUPCAKE_COOKIE_ADDON_TOKEN_MAP[addonId] ?? 0;
    if (tokenPerPiece <= 0) return sum;

    const units = Math.max(1, addOnQuantities[addonId] ?? 1);
    return sum + tokenPerPiece * pieceCount * units;
  }, 0);
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

function calculateBouquetToken(searchSource: string, qty: number): number {
  return resolveBouquetToken(searchSource) * resolveBouquetUnits(qty);
}

function calculateItemToken(item: OrderItemForTokenCalc): number {
  const category = normalizeText(item.category || "");
  const searchSource = getSearchSource(item);
  const isCakeItem = /\bcake\b/.test(category) || /\bcake\b/.test(searchSource);
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
    return calculateBouquetToken(searchSource, qty);
  }

  // Evaluate cake before cupcake to avoid product-name collisions (e.g. Cake with "cupcake" note).
  if (isCakeItem) {
    if (
      searchSource.includes("two tier") ||
      searchSource.includes("two tiered")
    ) {
      // Operational rule: one two-tier set is treated as two cakes.
      return 200 * qty;
    }
    return 100 * qty;
  }

  if (searchSource.includes("cupcake")) {
    const pieceCount = resolveCupcakePieceQuantity(searchSource, qty);
    const pieceToken = Math.max(
      1,
      Math.round(resolveCupcakeBaseTokenPerPiece(searchSource)),
    );
    return pieceCount * pieceToken + resolveCupcakeAddOnToken(item);
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
