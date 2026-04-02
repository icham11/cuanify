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
}

const COOKIE_DIFFICULTY_TOKEN_MAP: Record<string, number> = {
  simple: 1,
  normal: 2,
  hard: 3,
  advanced: 4,
  expert: 5,
};

const BOUQUET_TOKEN_MAP: Record<string, number> = {
  hand_bouquet: 20,
  standing_bouquet: 50,
};

function calculateItemToken(item: OrderItemForTokenCalc): number {
  const category = (item.category || "").toLowerCase().trim();
  const qty = Math.min(1000, Math.max(1, Number(item.quantity) || 1));

  if (category.includes("cookies tower") || category.includes("cookie tower")) {
    return 100;
  }

  if (category.includes("buket") || category.includes("bouquet")) {
    const bouquetSource = `${item.subcategory || ""} ${item.productName || ""}`
      .toLowerCase()
      .trim();

    if (bouquetSource.includes("standing") || bouquetSource.includes("sbq")) {
      return BOUQUET_TOKEN_MAP.standing_bouquet;
    }

    if (bouquetSource.includes("hand") || bouquetSource.includes("hbq")) {
      return BOUQUET_TOKEN_MAP.hand_bouquet;
    }

    return BOUQUET_TOKEN_MAP.hand_bouquet;
  }

  if (category.includes("cupcake")) {
    const productLower = (item.productName || item.subcategory || "")
      .toLowerCase()
      .trim();
    if (productLower.includes("dozen") || productLower.includes("12")) {
      return 2;
    }
    return 5;
  }

  if (category.includes("cake")) {
    return 100;
  }

  if (category.includes("cookies") || category.includes("cookie")) {
    const difficultyRaw = item.tokenDifficulty || item.difficulty || "";
    const diffKey = difficultyRaw.toLowerCase().trim() || "simple";
    const diffToken = COOKIE_DIFFICULTY_TOKEN_MAP[diffKey] ?? 1;
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
