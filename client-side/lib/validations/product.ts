import { z } from "zod";

// ===================== CATEGORY =====================

export const createCategorySchema = z.object({
  name: z.string().min(1, "Category name is required").max(100),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

// ===================== INGREDIENT UNITS =====================

export const INGREDIENT_UNITS = [
  // Weight
  "gram",
  "ons",
  "kg",
  // Volume
  "ml",
  "liter",
  // Count / Packaging
  "pcs",
  "lusin",
  "pak",
  "karton",
  "sachet",
  "botol",
  "kaleng",
  "ikat",
  "lembar",
  // Length
  "meter",
] as const;

export type IngredientUnit = (typeof INGREDIENT_UNITS)[number];

// ===================== INGREDIENT =====================

export const createIngredientSchema = z.object({
  name: z.string().min(1, "Ingredient name is required").max(200),
  unit: z.enum(INGREDIENT_UNITS, { error: "Pilih satuan yang valid" }),
  minStock: z.number().int().min(0).default(0),
  initialBatch: z
    .object({
      quantity: z.number().min(0, "Quantity must be 0 or more"),
      costPerUnit: z.number().min(0, "Cost must be non-negative"),
      expirationDate: z.string().optional(),
    })
    .optional(),
});

export const bulkCreateIngredientsSchema = z.object({
  ingredients: z.array(createIngredientSchema).min(1, "At least one ingredient is required"),
});

export type CreateIngredientInput = z.infer<typeof createIngredientSchema>;

export const updateIngredientSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  unit: z.enum(INGREDIENT_UNITS).optional(),
  minStock: z.number().int().min(0).optional(),
  batch: z
    .object({
      remainingQty: z.number().min(0, "Stock must be non-negative").optional(),
      costPerUnit: z.number().min(0, "Cost must be non-negative").optional(),
      expirationDate: z.string().datetime().nullable().optional(),
    })
    .optional(),
});

export type UpdateIngredientInput = z.infer<typeof updateIngredientSchema>;

// ===================== RECIPE ITEM =====================

export const recipeItemSchema = z.object({
  ingredientId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive("Quantity must be positive"),
});

export type RecipeItemInput = z.infer<typeof recipeItemSchema>;

// ===================== PRODUCT =====================

export const createProductSchema = z.object({
  name: z.string().min(1, "Product name is required").max(200),
  categoryName: z.string().min(1, "Category is required").max(100),
  sellingPrice: z.number().positive("Selling price must be positive"),
  cogs: z.number().positive("COGS must be greater than 0"),
  productionToken: z.number().int().min(0).optional().default(0),
  weightGram: z.number().int().min(0).optional().default(0),
  manualStock: z.number().int().min(0).optional().default(0),
  minimumOrder: z.number().int().min(0).optional().default(0),
  productType: z.enum(["ReadyStock", "PreOrder"]).optional().default("PreOrder"),
  recipe: z.array(recipeItemSchema).optional().default([]),
  manualCogs: z.number().min(0).optional(),
});

export const bulkCreateProductsSchema = z.object({
  products: z.array(createProductSchema).min(1, "At least one product is required"),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

// ===================== AI GENERATION =====================

export const generateProductByNameSchema = z.object({
  productName: z.string().min(1, "Product name is required").max(200),
});

export type GenerateProductByNameInput = z.infer<typeof generateProductByNameSchema>;

// ===================== API RESPONSE TYPES =====================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  details?: string;
}

export interface ProductWithRecipe {
  id: number;
  name: string;
  sellingPrice: number;
  isActive: boolean;
  categoryId: number | null;
  category: { id: number; name: string } | null;
  cogs: number; // direct currency-based product COGS
  recipes: {
    id: number;
    quantity: number;
    ingredient: {
      id: number;
      name: string;
      unit: string;
      costPerUnit: number | null; // from latest batch
      currentStock: number; // sum of remaining batch quantities
    };
  }[];
}

export interface IngredientWithBatches {
  id: number;
  name: string;
  unit: string;
  minStock: number;
  inventoryBatches: {
    id: number;
    remainingQty: number;
    costPerUnit: number;
    expirationDate: string | null;
  }[];
}

// ===================== AI GENERATED SHAPES =====================

/** Shape the AI should return for a single generated product */
export interface AIGeneratedProduct {
  name: string;
  categoryName: string;
  sellingPrice: number;
  productType?: "ReadyStock" | "PreOrder";
  cogs?: number; // direct currency-based product COGS
  recipe: {
    ingredientId?: number; // existing ingredient
    ingredientName: string; // for display / new ingredient creation
    unit: string;
    quantity: number;
    costPerUnit?: number; // from latest batch or AI estimate
    estimatedStockQty?: number; // AI-estimated initial stock for new ingredients
    expirationDate?: string; // ISO date (YYYY-MM-DD) computed from AI shelf-life estimate
  }[];
}

/** Schema for recommend-price endpoint */
export const recommendPriceSchema = z.object({
  cogs: z.number().positive("COGS must be greater than 0"),
  categoryName: z.string().optional(),
  productName: z.string().optional(),
});

export type RecommendPriceInput = z.infer<typeof recommendPriceSchema>;
