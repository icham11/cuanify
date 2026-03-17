import prisma from "@/lib/prisma";
import type { AIGeneratedProduct } from "@/lib/validations/product";

interface ResolvedRecipeItem {
  ingredientId: number;
  ingredientName: string;
  unit: string;
  quantity: number;
  costPerUnit: number;
  isNew: boolean;
  expirationDate?: string;
}

export interface ResolvedProduct {
  name: string;
  categoryName: string;
  sellingPrice: number;
  productType?: "ReadyStock" | "PreOrder";
  recipe: ResolvedRecipeItem[];
}

/**
 * Resolve AI-generated recipe items into real ingredient IDs.
 *
 * For each recipe item:
 *   - If it already has a valid `ingredientId` → keep it
 *   - If not → find-or-create an ingredient by name (case-insensitive)
 *     and create an initial inventory batch with the AI-estimated cost
 *
 * Returns products with all `ingredientId`s filled in,
 * ready for `POST /api/products`.
 */
export async function resolveIngredients(
  businessId: number,
  products: AIGeneratedProduct[],
): Promise<{ resolved: ResolvedProduct[]; newIngredientsCreated: string[] }> {
  const newIngredientsCreated: string[] = [];

  // Cache to avoid creating the same ingredient twice within one call
  const ingredientCache = new Map<string, number>();

  const resolved: ResolvedProduct[] = [];

  for (const product of products) {
    const resolvedRecipe: ResolvedRecipeItem[] = [];

    for (const item of product.recipe) {
      const name = item.ingredientName;
      const cacheKey = name.toLowerCase().trim();
      const costPerUnit = item.costPerUnit ?? 0;

      let ingredientId = item.ingredientId;
      let isNew = false;

      if (ingredientId) {
        // Verify the ingredient actually belongs to this business
        const exists = await prisma.ingredient.findFirst({
          where: { id: ingredientId, businessId },
          select: { id: true },
        });

        if (exists) {
          resolvedRecipe.push({
            ingredientId,
            ingredientName: name,
            unit: item.unit,
            quantity: item.quantity,
            costPerUnit,
            isNew: false,
          });
          continue;
        }
        // If AI provided a bad ID, fall through to find-or-create
        ingredientId = undefined;
      }

      // Check cache first
      if (ingredientCache.has(cacheKey)) {
        resolvedRecipe.push({
          ingredientId: ingredientCache.get(cacheKey)!,
          ingredientName: name,
          unit: item.unit,
          quantity: item.quantity,
          costPerUnit,
          isNew: false,
        });
        continue;
      }

      // Try to find existing ingredient by name (case-insensitive)
      const existing = await prisma.ingredient.findFirst({
        where: {
          businessId,
          name: { equals: name, mode: "insensitive" },
        },
        select: { id: true },
      });

      if (existing) {
        ingredientCache.set(cacheKey, existing.id);
        resolvedRecipe.push({
          ingredientId: existing.id,
          ingredientName: name,
          unit: item.unit,
          quantity: item.quantity,
          costPerUnit,
          isNew: false,
        });
        continue;
      }

      // Create new ingredient with an initial inventory batch
      const created = await prisma.ingredient.create({
        data: {
          businessId,
          name,
          unit: item.unit,
          minStock: -1, // -1 = no alert (AI-generated, user should configure manually)
          inventoryBatches: {
            create: {
              remainingQty: 0,
              costPerUnit,
              ...(item.expirationDate ? { expirationDate: new Date(item.expirationDate) } : {}),
            },
          },
        },
        select: { id: true },
      });

      ingredientCache.set(cacheKey, created.id);
      newIngredientsCreated.push(name);
      isNew = true;

      resolvedRecipe.push({
        ingredientId: created.id,
        ingredientName: name,
        unit: item.unit,
        quantity: item.quantity,
        costPerUnit,
        isNew,
        ...(item.expirationDate ? { expirationDate: item.expirationDate } : {}),
      });
    }

    resolved.push({
      name: product.name,
      categoryName: product.categoryName,
      sellingPrice: product.sellingPrice,
      productType: product.productType,
      recipe: resolvedRecipe,
    });
  }

  return { resolved, newIngredientsCreated };
}
