export type EditProductModalProps = {
  product: Product;
  categories: { id: number; name: string }[];
  onClose: () => void;
  onSaved: (updated: Product) => void;
};
// ─── Product types used across the Products feature ───────────────────────────

export type ProductIngredient = {
  id: number;
  name: string;
  unit: string;
  costPerUnit: number | null;
  currentStock?: number;
};

export type ProductRecipeItem = {
  id: number;
  quantity: number;
  ingredient: ProductIngredient;
};

export type ProductCategory = {
  id: number;
  name: string;
};

/** Full product as returned by GET /api/products */
export type Product = {
  id: number;
  name: string;
  businessId: number;
  categoryId: number | null;
  sellingPrice: number;
  productType?: "ReadyStock" | "PreOrder";
  availableStock?: number; // for ReadyStock: sum of production batch remaining
  createdAt?: string;
  category: ProductCategory | null;
  recipes: ProductRecipeItem[];
  cogs: number;
  productionToken?: number;
  manualStock?: number;
};

// ─── Draft / AI-generated types ───────────────────────────────────────────────

/** A single recipe row inside a draft / form */
export type DraftRecipeRow = {
  ingredientId: number;
  ingredientName: string;
  unit: string;
  quantity: number;
  costPerUnit: number | null;
  isNew?: boolean;
  /** Optional initial qty-on-hand to set when the ingredient is confirmed/saved */
  initialStock?: number;
  /** Optional ISO date string (YYYY-MM-DD) for the first batch expiry */
  expirationDate?: string;
};

/** A product draft (pre-save, may come from AI or be written manually) */
export type ProductDraft = {
  /** Temporary client-side id for list keys */
  _clientId: string;
  name: string;
  categoryName: string;
  sellingPrice: number;
  productType?: "ReadyStock" | "PreOrder";
  recipe: DraftRecipeRow[];
  cogs: number;
  /** Flag set when populated by AI */
  aiGenerated?: boolean;
};

// ─── Input shapes for API ─────────────────────────────────────────────────────

export type RecipeItemInput = {
  ingredientId: number;
  quantity: number;
};

export type CreateProductInput = {
  name: string;
  categoryName: string;
  sellingPrice: number;
  cogs: number;
  productionToken?: number;
  manualStock?: number;
  productType?: "ReadyStock" | "PreOrder";
  recipe?: RecipeItemInput[];
  manualCogs?: number;
};
