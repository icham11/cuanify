import { z } from "zod";

export const ingredientSchema = z.object({
  ingredientId: z.string().optional(),
  name: z.string().min(1, "Ingredient name is required"),
  quantity: z.number().min(1, "Quantity must be at least 1"),
  unit: z.string().min(1, "Unit is required"),
  costPerUnit: z.number().min(0, "Cost must be 0 or more"),
});

export const recipeSchema = z.object({
  name: z.string().min(1, "Recipe name is required"),
  mode: z.enum(["manual", "ai"]),
  ingredients: z.array(ingredientSchema).min(1, "Add at least one ingredient"),
});

export type RecipeFormValues = z.infer<typeof recipeSchema>;