// deprecated: do not use ingredient-based COGS in runtime.
export const useIngredientBasedCOGS = false;

export function normalizeDirectCogs(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("COGS must be greater than 0");
  }
  return Math.round(parsed * 100) / 100;
}
