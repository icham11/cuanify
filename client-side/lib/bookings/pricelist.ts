import {
  CAKE_FLAVOR_OPTIONS,
  CUPCAKE_FLAVOR_OPTIONS,
} from "@/lib/bookings/flavor-options";

export interface PricelistVariant {
  label: string;
  price: number;
  keywords?: string[];
}

export interface PricelistProduct {
  name: string;
  keywords?: string[];
  variants: PricelistVariant[];
  defaultVariant?: string;
}

export interface PricelistSubcategory {
  name: string;
  keywords?: string[];
  products: PricelistProduct[];
}

export interface PricelistCategory {
  category: string;
  keywords?: string[];
  subcategories: PricelistSubcategory[];
}

export interface CatalogSelection {
  category: string;
  subcategory: string;
  productName: string;
  size: string;
}

export interface CatalogAddOn {
  id: string;
  label: string;
  price: number;
}

function variant(
  label: string,
  price: number,
  keywords: string[] = [],
): PricelistVariant {
  return {
    label,
    price,
    keywords,
  };
}

function fixedProduct(
  name: string,
  price: number,
  options?: {
    keywords?: string[];
    variantLabel?: string;
    variantKeywords?: string[];
  },
): PricelistProduct {
  return {
    name,
    keywords: options?.keywords ?? [],
    variants: [
      variant(
        options?.variantLabel ?? "Standard",
        price,
        options?.variantKeywords ?? [],
      ),
    ],
    defaultVariant: options?.variantLabel ?? "Standard",
  };
}

const ONE_TIER_DIAMETERS = [14, 16, 18, 20] as const;
const ONE_TIER_HEIGHTS = [10, 15] as const;
const TWO_TIER_TOP_DIAMETERS = [14, 16] as const;
const TWO_TIER_BOTTOM_DIAMETERS = [18, 20] as const;
const TWO_TIER_STACKING_COST = 75000;

type CakeBodyType = "REAL" | "DUMMY";

const ONE_TIER_PRICE_TABLE: Record<
  CakeBodyType,
  Record<number, Record<number, number>>
> = {
  REAL: {
    14: { 10: 400000, 15: 500000 },
    16: { 10: 450000, 15: 550000 },
    18: { 10: 550000, 15: 650000 },
    20: { 10: 650000, 15: 750000 },
  },
  DUMMY: {
    14: { 10: 250000, 15: 300000 },
    16: { 10: 275000, 15: 325000 },
    18: { 10: 300000, 15: 350000 },
    20: { 10: 350000, 15: 400000 },
  },
};

function getOneTierPrice(
  type: CakeBodyType,
  diameter: number,
  height: number,
): number {
  return ONE_TIER_PRICE_TABLE[type][diameter]?.[height] ?? 0;
}

function buildOneTierCakeVariants(type: CakeBodyType): PricelistVariant[] {
  return ONE_TIER_DIAMETERS.flatMap((diameter) =>
    ONE_TIER_HEIGHTS.map((height) =>
      variant(
        `D${diameter}-T${height}`,
        getOneTierPrice(type, diameter, height),
        [
          `d${diameter}`,
          `t${height}`,
          `diameter ${diameter}`,
          `tinggi ${height}`,
          `${diameter}cm`,
          `${height}cm`,
          `diameter ${diameter} cm tinggi ${height} cm`,
        ],
      ),
    ),
  );
}

function roundPriceToFiveThousand(value: number): number {
  return Math.round(value / 5000) * 5000;
}

function buildTwoTierVariants(
  topType: CakeBodyType,
  bottomType: CakeBodyType,
): PricelistVariant[] {
  const variants: PricelistVariant[] = [];

  for (const topDiameter of TWO_TIER_TOP_DIAMETERS) {
    for (const bottomDiameter of TWO_TIER_BOTTOM_DIAMETERS) {
      if (topDiameter >= bottomDiameter) continue;

      for (const topHeight of ONE_TIER_HEIGHTS) {
        for (const bottomHeight of ONE_TIER_HEIGHTS) {
          const topPrice = getOneTierPrice(topType, topDiameter, topHeight);
          const bottomPrice = getOneTierPrice(
            bottomType,
            bottomDiameter,
            bottomHeight,
          );
          const totalPrice = roundPriceToFiveThousand(
            topPrice + bottomPrice + TWO_TIER_STACKING_COST,
          );

          variants.push(
            variant(
              `Top D${topDiameter}-T${topHeight} + Bottom D${bottomDiameter}-T${bottomHeight}`,
              totalPrice,
              [
                `top d${topDiameter} t${topHeight}`,
                `bottom d${bottomDiameter} t${bottomHeight}`,
                `two tier ${topDiameter} ${bottomDiameter}`,
                `${topType.toLowerCase()} top`,
                `${bottomType.toLowerCase()} bottom`,
              ],
            ),
          );
        }
      }
    }
  }

  return variants;
}

export const BOOKING_PRODUCT_CATALOG: PricelistCategory[] = [
  {
    category: "Cake",
    keywords: ["cake", "kue"],
    subcategories: [
      {
        name: "One Tier Cake",
        keywords: ["one tier", "single tier", "real cake", "dummy cake"],
        products: [
          {
            name: "Real Cake",
            keywords: ["real", "real cake", "one tier real"],
            defaultVariant: "D16-T10",
            variants: buildOneTierCakeVariants("REAL"),
          },
          {
            name: "Dummy Cake",
            keywords: ["dummy", "dummy cake", "one tier dummy"],
            defaultVariant: "D16-T10",
            variants: buildOneTierCakeVariants("DUMMY"),
          },
        ],
      },
      {
        name: "Two Tier Cake",
        keywords: ["tier", "two tier", "2 tier", "two-tiered", "wedding"],
        products: [
          {
            name: "Top Real + Bottom Real",
            keywords: ["top real", "bottom real", "real real", "rr"],
            defaultVariant: "Top D14-T10 + Bottom D18-T10",
            variants: buildTwoTierVariants("REAL", "REAL"),
          },
          {
            name: "Top Real + Bottom Dummy",
            keywords: ["top real", "bottom dummy", "real dummy", "rd"],
            defaultVariant: "Top D14-T10 + Bottom D18-T10",
            variants: buildTwoTierVariants("REAL", "DUMMY"),
          },
          {
            name: "Top Dummy + Bottom Real",
            keywords: ["top dummy", "bottom real", "dummy real", "dr"],
            defaultVariant: "Top D14-T10 + Bottom D18-T10",
            variants: buildTwoTierVariants("DUMMY", "REAL"),
          },
          {
            name: "Top Dummy + Bottom Dummy",
            keywords: ["top dummy", "bottom dummy", "dummy dummy", "dd"],
            defaultVariant: "Top D14-T10 + Bottom D18-T10",
            variants: buildTwoTierVariants("DUMMY", "DUMMY"),
          },
        ],
      },
      {
        name: "Party Package",
        keywords: [
          "party package",
          "bulk order",
          "mama's kitchen party package",
        ],
        products: [
          {
            name: "Cake 16cm + 30 Box Single Box Cupcakes",
            keywords: [
              "cake 16",
              "30 box",
              "single box cupcakes",
              "party package",
            ],
            defaultVariant: "Start From",
            variants: [
              variant("Start From", 1350000, [
                "normal",
                "start from",
                "1,350,000",
              ]),
              variant("Best Deal!", 1215000, ["best deal", "promo", "1.215k"]),
            ],
          },
          {
            name: "Cake 16cm + 30 Cookies + 30 Box Single Box Cupcakes",
            keywords: ["cake 16", "30 cookies", "30 box", "party package"],
            defaultVariant: "Start From",
            variants: [
              variant("Start From", 1860000, [
                "normal",
                "start from",
                "1,860,000",
              ]),
              variant("Best Deal!", 1599000, ["best deal", "promo", "1.599k"]),
            ],
          },
        ],
      },
      {
        name: "Best Seller Kids Edition",
        keywords: ["kids", "best seller"],
        products: [
          fixedProduct("Little Rabbit", 540000, {
            keywords: ["little rabbit", "rabbit"],
            variantLabel: "D18 cm (3 Layers)",
          }),
          fixedProduct("Minecraft", 810000, {
            keywords: ["minecraft"],
            variantLabel: "D16 cm (3 Layers)",
          }),
          fixedProduct("Animal Jungle", 700000, {
            keywords: ["animal jungle", "jungle"],
            variantLabel: "D18 cm (3 Layers)",
          }),
          fixedProduct("Kids Signature", 830000, {
            keywords: ["kids signature", "kids edition"],
            variantLabel: "D16 cm (3 Layers)",
          }),
          fixedProduct("Jurassic World", 640000, {
            keywords: ["jurassic"],
            variantLabel: "D14 cm (3 Layers)",
          }),
          fixedProduct("Unicorn", 950000, {
            keywords: ["unicorn"],
            variantLabel: "D16 cm (4 Layers)",
          }),
          fixedProduct("Boss Baby", 650000, {
            keywords: ["boss baby"],
            variantLabel: "D16 cm (3 Layers)",
          }),
          fixedProduct("Sanrio", 610000, {
            keywords: ["sanrio"],
            variantLabel: "D18 cm (3 Layers)",
          }),
        ],
      },
      {
        name: "Best Seller Signature",
        keywords: ["best seller", "signature"],
        products: [
          fixedProduct("Flowery Charicature", 890000, {
            keywords: ["flowery", "charicature", "character flower"],
            variantLabel: "D18 cm (3 Layers)",
          }),
          fixedProduct("Elegant Flower", 920000, {
            keywords: ["elegant flower"],
            variantLabel: "D16 cm (3 Layers)",
          }),
          fixedProduct("Sport Charicature", 790000, {
            keywords: ["sport", "charicature"],
            variantLabel: "D18 cm (3 Layers)",
          }),
          fixedProduct("Simple Roses", 650000, {
            keywords: ["simple roses", "roses"],
            variantLabel: "D18 cm (4 Layers)",
          }),
        ],
      },
    ],
  },
  {
    category: "Cookies",
    keywords: ["cookies", "cookie"],
    subcategories: [
      {
        name: "Custom Cookies",
        keywords: ["custom", "regular", "individual", "core"],
        products: [
          {
            name: "Custom Cookies",
            keywords: ["individual", "single cookie", "custom cookie"],
            defaultVariant: "Simple",
            variants: [
              variant("Simple", 17000, ["simple", "token 1", "17k"]),
              variant("Normal", 20000, ["normal", "medium", "token 2", "20k"]),
              variant("Hard", 25000, ["hard", "difficult", "token 3", "25k"]),
              variant("Advanced", 30000, ["advanced", "token 4", "30k"]),
              variant("Expert", 35000, ["expert", "token 5", "35k"]),
            ],
          },
          fixedProduct("3 in 1 Mini Cookies", 30000, {
            keywords: ["3 in 1", "3in1", "mini"],
            variantLabel: "Per Pack (isi 3)",
          }),
          fixedProduct("Sharing Box (isi 2)", 45000, {
            keywords: ["sharing box", "box isi 2", "isi 2"],
            variantLabel: "Box isi 2",
          }),
          fixedProduct("Sharing Box (isi 3)", 60000, {
            keywords: ["sharing box", "box isi 3", "isi 3"],
            variantLabel: "Box isi 3",
          }),
          fixedProduct("Sharing Box (isi 4)", 75000, {
            keywords: ["sharing box", "box isi 4", "isi 4"],
            variantLabel: "Box isi 4",
          }),
          fixedProduct("Sharing Box (isi 9)", 160000, {
            keywords: ["sharing box", "box isi 9", "isi 9"],
            variantLabel: "Box isi 9",
          }),
        ],
      },
      {
        name: "Event Cookies",
        keywords: [
          "event",
          "seasonal",
          "halloween",
          "christmas",
          "xmas",
          "cny",
          "imlek",
          "eid",
          "ramadan",
          "lebaran",
        ],
        products: [
          {
            name: "Christmas 2025",
            keywords: ["christmas", "xmas", "natal"],
            defaultVariant: "Set A (Per pcs)",
            variants: [
              variant("Set A (Per pcs)", 15000, ["set a", "christmas set a"]),
              variant("Set B (Per pcs)", 17000, ["set b", "christmas set b"]),
              variant("Set C (Per pcs)", 17000, ["set c", "christmas set c"]),
              variant("Mickey (Per pcs)", 12000, ["mickey"]),
              variant("Tree (Per pcs)", 17000, ["tree"]),
              variant("3 in 1 Mini Cookies (Per pack)", 30000, [
                "3 in 1",
                "3in1",
                "mini",
                "mini bites",
              ]),
              variant("Sharing Box isi 2", 45000, ["sharing box", "box isi 2"]),
              variant("Sharing Box isi 3", 60000, ["sharing box", "box isi 3"]),
              variant("Noel Box", 90000, ["noel box"]),
              variant("Character Box", 160000, ["character box", "box isi 9"]),
              variant("Bites Nastar", 200000, ["bites nastar"]),
              variant("Bauble", 60000, ["bauble"]),
              variant("DIY Classic", 110000, ["diy classic", "diy"]),
              variant("DIY Gingerbread House", 130000, [
                "diy gingerbread house",
                "gingerbread",
              ]),
              variant("Jingle Box", 100000, ["jingle box"]),
              variant("Joyful Box", 200000, ["joyful box"]),
            ],
          },
          {
            name: "CNY 2026",
            keywords: ["cny", "imlek", "lunar", "chinese new year"],
            defaultVariant: "Set A (Per pcs)",
            variants: [
              variant("Set A (Per pcs)", 17000, ["set a", "imlek set a"]),
              variant("Set B (Per pcs)", 17000, ["set b", "imlek set b"]),
              variant("3 in 1 Mini Cookies (Per pack)", 30000, [
                "3 in 1",
                "3in1",
                "mini",
              ]),
              variant("Sharing Box isi 2", 45000, ["sharing box", "box isi 2"]),
              variant("Sharing Box isi 3", 60000, ["sharing box", "box isi 3"]),
              variant("Lunar Box", 90000, ["lunar box"]),
              variant("Character Box", 160000, ["character box", "box isi 9"]),
              variant("Bites Nastar", 200000, ["bites nastar"]),
              variant("Wishful Box", 110000, ["wishful box"]),
              variant("Dimsum Box", 220000, ["dimsum box"]),
              variant("DIY Classic", 110000, ["diy classic", "diy"]),
            ],
          },
          {
            name: "Halloween 2025",
            keywords: ["halloween", "haloween"],
            defaultVariant: "Set A (Per pcs)",
            variants: [
              variant("Set A (Per pcs)", 15000, ["set a", "halloween set a"]),
              variant("Set B (Per pcs)", 17000, ["set b", "halloween set b"]),
              variant("Set C (Per pcs)", 17000, ["set c", "halloween set c"]),
              variant("Mini Bites (Per pack)", 30000, [
                "mini bites",
                "3 in 1",
                "3in1",
              ]),
              variant("Sharing Box isi 2", 45000, ["sharing box", "box isi 2"]),
              variant("Sharing Box isi 3", 60000, ["sharing box", "box isi 3"]),
              variant("DIY Set", 120000, ["diy set", "diy"]),
            ],
          },
          {
            name: "EID 2026",
            keywords: ["eid", "ramadan", "lebaran"],
            defaultVariant: "Set A (Per pcs)",
            variants: [
              variant("Set A (Per pcs)", 17000, ["set a", "eid set a"]),
              variant("Set B (Per pcs)", 17000, ["set b", "eid set b"]),
              variant("Sharing Box isi 2", 45000, ["sharing box", "box isi 2"]),
              variant("Sharing Box isi 3", 60000, ["sharing box", "box isi 3"]),
              variant("Character Box", 160000, ["character box", "box isi 9"]),
              variant("Bites Nastar", 200000, ["bites nastar"]),
              variant("Dimsum Box", 250000, ["dimsum box"]),
              variant("Wishful Box", 110000, ["wishful box"]),
              variant("DIY Classic", 110000, ["diy classic", "diy"]),
              variant("Lotus Box", 175000, ["lotus box"]),
            ],
          },
        ],
      },
    ],
  },
  {
    category: "Cupcakes",
    keywords: ["cupcake", "cupcakes"],
    subcategories: [
      {
        name: "Cupcakes",
        keywords: ["cupcakes", "regular"],
        products: [
          fixedProduct("Dozen Cupcakes", 240000, {
            keywords: ["dozen", "1 dozen", "12 pcs", "lusin"],
            variantLabel: "12 pcs",
          }),
          {
            name: "Individual Cupcakes",
            keywords: ["individual", "per pcs", "start from 30k", "box"],
            defaultVariant: "10-24 Box (30K / pcs)",
            variants: [
              variant("10-24 Box (30K / pcs)", 30000, [
                "10-24",
                "30k",
                "tier 1",
              ]),
              variant("25-49 Box (25K / pcs)", 25000, [
                "25-49",
                "25k",
                "tier 2",
              ]),
              variant(">=50 Box (27K / pcs, after 10% discount)", 27000, [
                "50",
                "discount 10",
                "27k",
              ]),
              variant(">=100 Box (25.5K / pcs, after 15% discount)", 25500, [
                "100",
                "discount 15",
                "25.5k",
              ]),
            ],
          },
        ],
      },
    ],
  },
  {
    category: "Buket",
    keywords: ["bouquet", "buket", "hbq", "sbq"],
    subcategories: [
      {
        name: "Bouquet",
        keywords: ["bouquet", "buket"],
        products: [
          {
            name: "Hand Bouquet (7-10 pcs)",
            keywords: ["hand bouquet", "hbq", "handbq"],
            defaultVariant: "Start From",
            variants: [
              variant("Start From", 200000, ["start", "standard"]),
              variant("+ 3 Bunga", 220000, ["3 bunga"]),
              variant("+ 6 Bunga", 235000, ["6 bunga"]),
            ],
          },
          {
            name: "Standing Bouquet (12-20 pcs)",
            keywords: ["standing bouquet", "sbq", "standingbq"],
            defaultVariant: "Start From",
            variants: [
              variant("Start From", 370000, ["start", "standard"]),
              variant("+ 3 Bunga", 395000, ["3 bunga"]),
              variant("+ 6 Bunga", 410000, ["6 bunga"]),
            ],
          },
        ],
      },
    ],
  },
  {
    category: "Cookies Tower",
    keywords: ["cookies tower", "tower"],
    subcategories: [
      {
        name: "Tower",
        keywords: ["tower"],
        products: [
          fixedProduct("Cookies Tower D16", 800000, {
            keywords: ["cookies tower", "tower"],
            variantLabel: "Formula Min (40 pcs + 250K)",
          }),
        ],
      },
    ],
  },
];

export const BOOKING_ADD_ON_CATALOG: Record<string, CatalogAddOn[]> = {
  Cake: [
    ...CAKE_FLAVOR_OPTIONS.map((option) => ({
      id: option.id,
      label: option.label,
      price: option.price,
    })),
    { id: "dark-color", label: "Dark Color", price: 50000 },
    { id: "fondant-name", label: "Fondant Name", price: 20000 },
    { id: "mini-details", label: "Mini Details", price: 10000 },
    {
      id: "small-cookies",
      label: "Additional Cookies Small (4-6cm)",
      price: 20000,
    },
    {
      id: "medium-cookies",
      label: "Additional Cookies Medium (8-9cm)",
      price: 40000,
    },
    {
      id: "large-cookies",
      label: "Additional Cookies Large (10-18cm)",
      price: 70000,
    },
    { id: "candy-background", label: "Candy Background", price: 50000 },
    { id: "meringue-background", label: "Meringue Background", price: 50000 },
    {
      id: "transparent-sail-background",
      label: "Transparent Sail Background",
      price: 100000,
    },
    { id: "artificial-flower", label: "Artificial Flower", price: 50000 },
    { id: "birthday-topper", label: "Birthday Topper", price: 30000 },
    { id: "custom-topper", label: "Custom Topper", price: 50000 },
    { id: "ball-decorations", label: "Ball Decorations", price: 70000 },
    { id: "paintings", label: "Paintings", price: 70000 },
    { id: "cookie-crumbs", label: "Cookie Crumbs", price: 30000 },
    { id: "edible-print", label: "Edible Print", price: 50000 },
    { id: "macaroon", label: "Macaroon", price: 35000 },
    { id: "fondant-decor", label: "Fondant Decor", price: 100000 },
  ],
  Cookies: [
    { id: "custom-card", label: "Custom Card", price: 2000 },
    { id: "bubblewrap", label: "Extra Bubblewrap", price: 1000 },
  ],
  Cupcakes: [
    ...CUPCAKE_FLAVOR_OPTIONS.map((option) => ({
      id: option.id,
      label: option.label,
      price: option.price,
    })),
    { id: "cookie-simple", label: "Cookie Simple", price: 17000 },
    { id: "cookie-normal", label: "Cookie Normal", price: 20000 },
    { id: "cookie-hard", label: "Cookie Hard", price: 25000 },
    { id: "cookie-advanced", label: "Cookie Advanced", price: 30000 },
    { id: "cookie-expert", label: "Cookie Expert", price: 35000 },
    {
      id: "dark-color-buttercream",
      label: "Dark Color Buttercream",
      price: 50000,
    },
  ],
  Buket: [],
  "Cookies Tower": [],
};

export const DELIVERY_FEES: Record<string, number> = {
  "Central City": 20000,
  "North District": 30000,
  "South District": 25000,
  "West District": 28000,
  "Outside Area": 45000,
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value: string): string {
  return normalize(value).replace(/\s+/g, "");
}

function includesKeyword(normalizedText: string, keyword: string): boolean {
  const probe = normalize(keyword);
  if (!probe) return false;

  if (normalizedText.includes(probe)) return true;

  const compactText = compact(normalizedText);
  const compactProbe = compact(probe);
  if (!compactText || !compactProbe) return false;
  return compactText.includes(compactProbe);
}

function getCategory(category: string): PricelistCategory | undefined {
  return BOOKING_PRODUCT_CATALOG.find((entry) => entry.category === category);
}

function getSubcategory(
  categoryData: PricelistCategory,
  subcategory: string,
): PricelistSubcategory | undefined {
  const exact = categoryData.subcategories.find(
    (entry) => entry.name === subcategory,
  );
  if (exact) return exact;

  const normalizedQuery = normalize(subcategory);
  if (!normalizedQuery) return undefined;

  return categoryData.subcategories.find((entry) => {
    const normalizedName = normalize(entry.name);
    if (
      normalizedName === normalizedQuery ||
      normalizedName.includes(normalizedQuery) ||
      normalizedQuery.includes(normalizedName)
    ) {
      return true;
    }

    return (entry.keywords ?? []).some((keyword) =>
      includesKeyword(normalizedQuery, keyword),
    );
  });
}

function getProduct(
  subcategoryData: PricelistSubcategory,
  productName: string,
): PricelistProduct | undefined {
  const exact = subcategoryData.products.find(
    (entry) => entry.name === productName,
  );
  if (exact) return exact;

  const normalizedQuery = normalize(productName);
  if (!normalizedQuery) return undefined;

  return subcategoryData.products.find((entry) => {
    const normalizedName = normalize(entry.name);
    if (
      normalizedName === normalizedQuery ||
      normalizedName.includes(normalizedQuery) ||
      normalizedQuery.includes(normalizedName)
    ) {
      return true;
    }

    return (entry.keywords ?? []).some((keyword) =>
      includesKeyword(normalizedQuery, keyword),
    );
  });
}

function findVariantBySelection(
  variants: PricelistVariant[],
  size: string,
): PricelistVariant | undefined {
  const exact = variants.find((entry) => entry.label === size);
  if (exact) return exact;

  const normalizedSize = normalize(size);
  if (!normalizedSize) return undefined;
  const compactSize = compact(normalizedSize);

  return variants.find((entry) => {
    const normalizedLabel = normalize(entry.label);
    const compactLabel = compact(normalizedLabel);
    if (
      normalizedLabel === normalizedSize ||
      normalizedLabel.includes(normalizedSize) ||
      normalizedSize.includes(normalizedLabel) ||
      (compactLabel &&
        compactSize &&
        (compactLabel === compactSize ||
          compactLabel.includes(compactSize) ||
          compactSize.includes(compactLabel)))
    ) {
      return true;
    }

    return (entry.keywords ?? []).some((keyword) =>
      includesKeyword(normalizedSize, keyword),
    );
  });
}

function scoreVariantMatch(
  normalizedText: string,
  variant: PricelistVariant,
): number {
  let score = 0;

  if (includesKeyword(normalizedText, variant.label)) {
    score += 8;
  }

  score += scoreKeywordList(normalizedText, variant.keywords, 5);
  return score;
}

function getDefaultVariantLabel(product: PricelistProduct): string {
  if (product.defaultVariant) return product.defaultVariant;
  if (product.variants.length > 0) return product.variants[0].label;
  return "Standard";
}

function scoreKeywordList(
  normalizedText: string,
  keywords: string[] | undefined,
  weight: number,
): number {
  if (!keywords?.length) return 0;
  return keywords.reduce((sum, keyword) => {
    return includesKeyword(normalizedText, keyword) ? sum + weight : sum;
  }, 0);
}

export function getDefaultCatalogSelection(): CatalogSelection {
  return getDefaultCatalogSelectionForCategory(
    BOOKING_PRODUCT_CATALOG[0]?.category ?? "Cake",
  );
}

export function getDefaultCatalogSelectionForCategory(
  category: string,
): CatalogSelection {
  const categoryData = getCategory(category) ?? BOOKING_PRODUCT_CATALOG[0];
  const subcategoryData = categoryData?.subcategories[0];
  const productData = subcategoryData?.products[0];

  return {
    category: categoryData?.category ?? "Cake",
    subcategory: subcategoryData?.name ?? "",
    productName: productData?.name ?? "",
    size: productData ? getDefaultVariantLabel(productData) : "",
  };
}

export function getProductVariants(
  category: string,
  subcategory: string,
  productName: string,
): PricelistVariant[] {
  const categoryData = getCategory(category);
  if (!categoryData) return [];
  const subcategoryData = getSubcategory(categoryData, subcategory);
  if (!subcategoryData) return [];
  const productData = getProduct(subcategoryData, productName);
  return productData?.variants ?? [];
}

export function getUnitPriceBySelection(selection: CatalogSelection): number {
  const variants = getProductVariants(
    selection.category,
    selection.subcategory,
    selection.productName,
  );
  const chosen = findVariantBySelection(variants, selection.size);
  if (chosen) return chosen.price;
  return variants[0]?.price ?? 0;
}

export function ensureCatalogSelection(
  partial: Partial<CatalogSelection>,
): CatalogSelection {
  const fallback = getDefaultCatalogSelectionForCategory(
    partial.category ?? "Cake",
  );
  const categoryData =
    getCategory(partial.category ?? "") ?? getCategory(fallback.category);

  if (!categoryData) return fallback;

  const subcategoryData =
    getSubcategory(categoryData, partial.subcategory ?? "") ??
    categoryData.subcategories[0];

  const productData =
    (subcategoryData &&
      getProduct(subcategoryData, partial.productName ?? "")) ??
    subcategoryData?.products[0];

  const variants = productData?.variants ?? [];
  const size =
    findVariantBySelection(variants, partial.size ?? "")?.label ??
    (productData ? getDefaultVariantLabel(productData) : "");

  return {
    category: categoryData.category,
    subcategory: subcategoryData?.name ?? "",
    productName: productData?.name ?? "",
    size,
  };
}

export function suggestCatalogSelection(
  category: string,
  rawText: string,
): CatalogSelection {
  const categoryData = getCategory(category);
  if (!categoryData) {
    return getDefaultCatalogSelection();
  }

  const normalizedText = normalize(rawText);
  if (!normalizedText) {
    return getDefaultCatalogSelectionForCategory(category);
  }

  let best:
    | {
        subcategory: PricelistSubcategory;
        product: PricelistProduct;
        score: number;
      }
    | undefined;

  categoryData.subcategories.forEach((subcategory) => {
    const subcategoryScore =
      scoreKeywordList(normalizedText, [subcategory.name], 2) +
      scoreKeywordList(normalizedText, subcategory.keywords, 4);

    subcategory.products.forEach((product) => {
      const variantScore = product.variants.reduce((highest, variant) => {
        return Math.max(highest, scoreVariantMatch(normalizedText, variant));
      }, 0);

      const productScore =
        scoreKeywordList(normalizedText, [product.name], 4) +
        scoreKeywordList(normalizedText, product.keywords, 8);

      const totalScore = subcategoryScore + productScore + variantScore;

      if (!best || totalScore > best.score) {
        best = {
          subcategory,
          product,
          score: totalScore,
        };
      }
    });
  });

  if (!best || best.score <= 0) {
    return getDefaultCatalogSelectionForCategory(category);
  }

  const variantByLabel = best.product.variants.find((entry) =>
    includesKeyword(normalizedText, entry.label),
  );

  const variantByKeyword = best.product.variants.find((entry) => {
    return (entry.keywords ?? []).some((keyword) =>
      includesKeyword(normalizedText, keyword),
    );
  });

  return ensureCatalogSelection({
    category: categoryData.category,
    subcategory: best.subcategory.name,
    productName: best.product.name,
    size:
      variantByKeyword?.label ??
      variantByLabel?.label ??
      getDefaultVariantLabel(best.product),
  });
}
