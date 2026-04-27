import { GROQ_MODELS, createGroqCompletion } from "@/lib/groq";
import type { AIGeneratedProduct } from "@/lib/validations/product";
import { INGREDIENT_UNITS } from "@/lib/validations/product";

// ===================== SYSTEM PROMPTS =====================

const ALLOWED_UNITS = INGREDIENT_UNITS.join(", ");

const UNIT_PRICING_HINT = `Soft pricing guidance for costPerUnit (cost per 1 unit in IDR, Indonesian market):
- gram: typically Rp 5–200 (flour, sugar ~Rp 15; meat ~Rp 100–150; spices ~Rp 50–200)
- ons (100g): typically Rp 500–15,000
- kg: typically Rp 5,000–150,000
- ml: typically Rp 5–100 (water/oil ~Rp 10–30; syrup ~Rp 30–80)
- liter: typically Rp 5,000–50,000
- pcs: typically Rp 200–50,000 depending on item
- sachet: typically Rp 500–5,000
- botol: typically Rp 5,000–50,000
- kaleng: typically Rp 8,000–40,000
- pak: typically Rp 5,000–30,000
- karton: typically Rp 50,000–300,000
- lembar: typically Rp 200–5,000
- ikat: typically Rp 2,000–15,000
- lusin: typically Rp 10,000–100,000
- meter: typically Rp 5,000–50,000
These are hints only — use your judgment for premium or specialty items.`;

const PRODUCT_SYSTEM_PROMPT = `You are an AI assistant for UMKM (Indonesian small businesses).
You help generate product data including recipes and ingredients.
You MUST respond ONLY with valid JSON — no markdown, no code fences, no explanation text.
All prices should be in Indonesian Rupiah (IDR).
Units MUST be one of the following (exact string, lowercase): ${ALLOWED_UNITS}.
${UNIT_PRICING_HINT}`;

// ===================== GENERATE BY NAME =====================

interface GenerateByNameParams {
  productName: string;
  existingIngredients: { id: number; name: string; unit: string; costPerUnit?: number | null }[];
  existingCategories: { id: number; name: string }[];
}

/**
 * Generate a single product with recipe from just a product name.
 * Uses existing ingredients when possible, suggests new ones when needed.
 */
export async function generateProductByName(params: GenerateByNameParams): Promise<AIGeneratedProduct> {
  const { productName, existingIngredients, existingCategories } = params;

  const prompt = `Generate product data for: "${productName}"

EXISTING INGREDIENTS in the business database (prefer using these by their exact ID and name):
${JSON.stringify(existingIngredients, null, 2)}

EXISTING CATEGORIES in the business:
${JSON.stringify(existingCategories.map((c) => c.name))}

Respond with a SINGLE JSON object (NOT an array) in this exact format:
{
  "name": "product name",
  "categoryName": "one of the existing categories above, or suggest a new one if none fit",
  "sellingPrice": 25000,
  "productType": "PreOrder",
  "recipe": [
    {
      "ingredientId": 101,
      "ingredientName": "Existing Ingredient Name",
      "unit": "gram",
      "quantity": 200,
      "costPerUnit": 100
    },
    {
      "ingredientName": "New Ingredient Not In DB",
      "unit": "ml",
      "quantity": 50,
      "costPerUnit": 50,
      "estimatedStockQty": 500
    }
  ]
}

Rules:
- "productType" MUST be one of: "ReadyStock" or "PreOrder".
  - Use "ReadyStock" for products that are typically pre-made in batches and stored before selling (e.g., bottled drinks, packaged snacks, kue kering, roti, kerupuk, sambal kemasan, pre-packaged items).
  - Use "PreOrder" (Made to Order) for products that are freshly prepared when a customer orders (e.g., kopi, jus, nasi goreng, mie ayam, fresh beverages, cooked-to-order food).
- If an ingredient exists in the database, include its "ingredientId" and use its costPerUnit from the data above. If it does NOT exist, omit "ingredientId" and estimate a realistic costPerUnit in IDR.
- "unit" MUST be one of: ${ALLOWED_UNITS}. Choose the most appropriate one — prefer gram/ml for bulk ingredients, pcs for whole items, sachet/botol/kaleng for packaged goods.
- "costPerUnit" is the cost per 1 unit in IDR. Use the pricing guidance in the system prompt as a soft reference.
- For NEW ingredients (no ingredientId), include:
  - "estimatedStockQty" — a realistic initial stock quantity a small business would typically have on hand, in the same unit.
  - "estimatedShelfLifeDays" — typical shelf life in days for this ingredient (e.g. fresh chicken: 3, eggs: 21, milk: 7, flour: 180, cooking oil: 365, dried spices: 730). Be realistic.
- "sellingPrice" should be a realistic retail price in IDR, typically 2-3x the total COGS.
- "quantity" is how much of the ingredient is needed to make ONE unit of the product.
- The recipe should be realistic and complete.`;

  const completion = await createGroqCompletion({
    messages: [
      { role: "system", content: PRODUCT_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    model: GROQ_MODELS.text.primary,
    temperature: 0.4,
    maxTokens: 1024,
    responseFormat: { type: "json_object" },
  });

  const raw = completion.choices?.[0]?.message?.content || "";
  return parseAIProductResponse(raw);
}

// ===================== GENERATE BY IMAGE (BULK) =====================

interface GenerateByImageParams {
  imageUrl: string;
  existingIngredients: { id: number; name: string; unit: string; costPerUnit?: number | null }[];
  existingCategories: { id: number; name: string }[];
  existingProductNames?: string[];
}

/**
 * Generate multiple products from an image (e.g. a menu, price list, or product display).
 * Step 1 of the image flow: validates the image is a list, then extracts products.
 */
export async function generateProductsByImage(
  params: GenerateByImageParams,
): Promise<{ isValid: boolean; products: AIGeneratedProduct[]; error?: string }> {
  const { imageUrl, existingIngredients, existingCategories, existingProductNames = [] } = params;

  const existingProductsBlock =
    existingProductNames.length > 0
      ? `\nEXISTING PRODUCTS (already in the system — DO NOT include these in your output, skip them entirely):\n${existingProductNames.map((n) => `- ${n}`).join("\n")}\n`
      : "";

  const prompt = `Analyze this image. Is it a list of products, a menu, a price list, or a product display?

If YES — extract all products from the image and generate structured data for each.
If NO — respond with: { "isValid": false, "error": "description of why this is not a product list", "products": [] }
${existingProductsBlock}
EXISTING INGREDIENTS in the business database (prefer using these by their exact ID and name):
${JSON.stringify(existingIngredients, null, 2)}

EXISTING CATEGORIES:
${JSON.stringify(existingCategories.map((c) => c.name))}

If the image IS a product list, respond with this exact JSON format:
{
  "isValid": true,
  "products": [
    {
      "name": "Product Name",
      "categoryName": "Category",
      "sellingPrice": 25000,
      "productType": "PreOrder",
      "recipe": [
        {
          "ingredientId": 101,
          "ingredientName": "Existing Ingredient",
          "unit": "gram",
          "quantity": 200,
          "costPerUnit": 100
        },
        {
          "ingredientName": "New Ingredient",
          "unit": "ml",
          "quantity": 50,
          "costPerUnit": 50,
          "estimatedStockQty": 500
        }
      ]
    }
  ]
}

Rules:
- Extract ALL products visible in the image.
- If prices are visible, use them. Otherwise estimate realistic IDR prices.
- "productType" MUST be one of: "ReadyStock" or "PreOrder".
  - Use "ReadyStock" for products that are typically pre-made in batches and stored before selling (e.g., bottled drinks, packaged snacks, kue kering, roti, kerupuk, sambal kemasan, pre-packaged items).
  - Use "PreOrder" (Made to Order) for products that are freshly prepared when a customer orders (e.g., kopi, jus, nasi goreng, mie ayam, fresh beverages, cooked-to-order food).
- For recipes: generate a realistic recipe for each product. Use existing ingredients when possible (include ingredientId and their costPerUnit from the data). For new ingredients, omit ingredientId and estimate costPerUnit.
- "unit" MUST be one of: ${ALLOWED_UNITS}. Choose the most appropriate one — prefer gram/ml for bulk ingredients, pcs for whole items, sachet/botol/kaleng for packaged goods.
- "costPerUnit" is the cost per 1 unit in IDR. Use the pricing guidance in the system prompt as a soft reference.
- For NEW ingredients (no ingredientId), include:
  - "estimatedStockQty" — a realistic initial stock quantity a small business would typically have on hand, in the same unit.
  - "estimatedShelfLifeDays" — typical shelf life in days for this ingredient (e.g. fresh chicken: 3, eggs: 21, milk: 7, flour: 180, cooking oil: 365, dried spices: 730). Be realistic.
- Use the same ingredient across products when it makes sense (e.g., "Susu Fresh Milk" for all milk-based drinks).`;

  const completion = await createGroqCompletion({
    messages: [
      { role: "system", content: PRODUCT_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
    model: GROQ_MODELS.vision.primary,
    temperature: 0.3,
    maxTokens: 4096,
    responseFormat: { type: "json_object" },
  });

  const raw = completion.choices?.[0]?.message?.content || "";

  try {
    const parsed = JSON.parse(raw);

    if (parsed.isValid === false) {
      return {
        isValid: false,
        products: [],
        error: parsed.error || "The image does not appear to be a product list.",
      };
    }

    // Compute expiration dates from AI-estimated shelf life (same logic as parseAIProductResponse)
    const today = new Date();
    const toExpiryDate = (days: number): string => {
      const d = new Date(today);
      d.setDate(d.getDate() + Math.max(1, Math.round(days)));
      return d.toISOString().split("T")[0]; // YYYY-MM-DD
    };

    const products: AIGeneratedProduct[] = Array.isArray(parsed.products)
      ? parsed.products.map((p: RawAIProductResponse) => ({
          name: String(p.name || ""),
          categoryName: String(p.categoryName || ""),
          sellingPrice: Number(p.sellingPrice || 0),
          cogs: Number(p.cogs || Math.max(1, Math.round(Number(p.sellingPrice || 0) * 0.45))),
          productType: p.productType === "ReadyStock" ? "ReadyStock" : "PreOrder",
          recipe: Array.isArray(p.recipe)
            ? p.recipe.map((r: RawAIRecipeItem) => ({
                ...(r.ingredientId ? { ingredientId: Number(r.ingredientId) } : {}),
                ingredientName: String(r.ingredientName || r.name || "Unknown"),
                unit: String(r.unit || "gram"),
                quantity: Number(r.quantity || 0),
                costPerUnit: r.costPerUnit ? Number(r.costPerUnit) : undefined,
                estimatedStockQty: r.estimatedStockQty ? Number(r.estimatedStockQty) : undefined,
                // Convert shelf-life hint → concrete expiration date for new ingredients
                ...(!r.ingredientId && r.estimatedShelfLifeDays
                  ? { expirationDate: toExpiryDate(r.estimatedShelfLifeDays) }
                  : {}),
              }))
            : [],
        }))
      : [];

    return { isValid: true, products };
  } catch {
    return {
      isValid: false,
      products: [],
      error: "Failed to parse AI response. Please try again.",
    };
  }
}

// ===================== GENERATE RECIPE BY IMAGE =====================

interface GenerateRecipeByImageParams {
  imageUrl: string;
  productName?: string;
  existingIngredients: { id: number; name: string; unit: string; costPerUnit?: number | null }[];
}

/**
 * Generate a recipe from a photo (e.g. a recipe card, ingredient list, or finished dish).
 * Used in the manual product creation flow.
 */
export async function generateRecipeByImage(params: GenerateRecipeByImageParams): Promise<{
  isValid: boolean;
  recipe: AIGeneratedProduct["recipe"];
  error?: string;
}> {
  const { imageUrl, productName, existingIngredients } = params;

  const contextLine = productName ? `This recipe is for: "${productName}".` : "Identify what this recipe is for.";

  const prompt = `Analyze this image. Is it a recipe, a list of ingredients, or a photo of food/ingredients?

${contextLine}

If the image shows a recipe or ingredients — extract the ingredient list.
If the image is NOT related to recipes or food — respond with: { "isValid": false, "error": "description", "recipe": [] }

EXISTING INGREDIENTS in the business database (use these by ID when possible):
${JSON.stringify(existingIngredients, null, 2)}

If valid, respond with this exact JSON format:
{
  "isValid": true,
  "recipe": [
    {
      "ingredientId": 101,
      "ingredientName": "Existing Ingredient",
      "unit": "gram",
      "quantity": 200,
      "costPerUnit": 100
    },
    {
      "ingredientName": "New Ingredient Not In DB",
      "unit": "ml",
      "quantity": 50,
      "costPerUnit": 50,
      "estimatedStockQty": 500
    }
  ]
}

Rules:
- Match existing ingredients by name (case-insensitive). If matched, include "ingredientId" and use their costPerUnit from the data.
- For new ingredients, omit "ingredientId" and estimate a realistic costPerUnit in IDR.
- "unit" MUST be one of: ${ALLOWED_UNITS}. Choose the most appropriate one — prefer gram/ml for bulk ingredients, pcs for whole items, sachet/botol/kaleng for packaged goods.
- "costPerUnit" is the cost per 1 unit in IDR. Use the pricing guidance in the system prompt as a soft reference.
- For NEW ingredients (no ingredientId), include "estimatedStockQty" — a realistic initial stock quantity a small business would typically have on hand, in the same unit.
- Quantities should be for ONE serving/unit of the product.`;

  const completion = await createGroqCompletion({
    messages: [
      { role: "system", content: PRODUCT_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
    model: GROQ_MODELS.vision.primary,
    temperature: 0.3,
    maxTokens: 2048,
    responseFormat: { type: "json_object" },
  });

  const raw = completion.choices?.[0]?.message?.content || "";

  try {
    const parsed = JSON.parse(raw);

    if (parsed.isValid === false) {
      return {
        isValid: false,
        recipe: [],
        error: parsed.error || "The image does not appear to be a recipe.",
      };
    }

    return {
      isValid: true,
      recipe: Array.isArray(parsed.recipe) ? parsed.recipe : [],
    };
  } catch {
    return {
      isValid: false,
      recipe: [],
      error: "Failed to parse AI response. Please try again.",
    };
  }
}

// ===================== HELPERS =====================

interface RawAIRecipeItem {
  ingredientId?: number;
  ingredientName?: string;
  name?: string;
  unit?: string;
  quantity?: number;
  costPerUnit?: number;
  estimatedStockQty?: number;
  estimatedShelfLifeDays?: number; // shelf life in days for new ingredients
}

interface RawAIProductResponse {
  name?: string;
  categoryName?: string;
  sellingPrice?: number;
  cogs?: number;
  productType?: string;
  recipe?: RawAIRecipeItem[];
}

function parseAIProductResponse(raw: string): AIGeneratedProduct {
  try {
    const parsed: RawAIProductResponse = JSON.parse(raw);

    // Validate minimum structure
    if (!parsed.name || !parsed.categoryName || !parsed.sellingPrice) {
      throw new Error("AI response missing required fields (name, categoryName, sellingPrice)");
    }

    // Base date for shelf-life computation
    const today = new Date();
    const toExpiryDate = (days: number): string => {
      const d = new Date(today);
      d.setDate(d.getDate() + Math.max(1, Math.round(days)));
      return d.toISOString().split("T")[0]; // YYYY-MM-DD
    };

    const product: AIGeneratedProduct = {
      name: String(parsed.name),
      categoryName: String(parsed.categoryName),
      sellingPrice: Number(parsed.sellingPrice),
      cogs: Number(parsed.cogs || Math.max(1, Math.round(Number(parsed.sellingPrice || 0) * 0.45))),
      productType: parsed.productType === "ReadyStock" ? "ReadyStock" : "PreOrder",
      recipe: Array.isArray(parsed.recipe)
        ? parsed.recipe.map((r: RawAIRecipeItem) => ({
            ...(r.ingredientId ? { ingredientId: Number(r.ingredientId) } : {}),
            ingredientName: String(r.ingredientName || r.name || "Unknown"),
            unit: String(r.unit || "gram"),
            quantity: Number(r.quantity || 0),
            costPerUnit: r.costPerUnit ? Number(r.costPerUnit) : undefined,
            estimatedStockQty: r.estimatedStockQty ? Number(r.estimatedStockQty) : undefined,
            // Only compute expirationDate for new ingredients (no ingredientId)
            ...(!r.ingredientId && r.estimatedShelfLifeDays
              ? { expirationDate: toExpiryDate(r.estimatedShelfLifeDays) }
              : {}),
          }))
        : [],
    };

    return product;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`AI returned invalid JSON: ${raw.substring(0, 200)}`);
    }
    throw error;
  }
}
