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

export const BOOKING_PRODUCT_CATALOG: PricelistCategory[] = [
  {
    category: "Cake",
    keywords: ["cake", "kue"],
    subcategories: [
      {
        name: "Cake Tinggi 10 cm",
        keywords: [
          "cake 10 cm",
          "regular",
          "reg",
          "tinggi 10 cm",
          "height 10 cm",
          "real cake",
          "dummy cake",
        ],
        products: [
          {
            name: "Real Cake (10 cm)",
            keywords: ["regular", "real", "10 cm", "real cake"],
            defaultVariant: "Real Diameter 16 cm (Tinggi 10 cm)",
            variants: [
              variant("Real Diameter 14 cm (Tinggi 10 cm)", 400000, [
                "14",
                "14cm",
                "size 14",
                "real 14",
                "real 14 cm",
                "diameter 14",
              ]),
              variant("Real Diameter 16 cm (Tinggi 10 cm)", 450000, [
                "16",
                "16cm",
                "size 16",
                "real 16",
                "real 16 cm",
                "diameter 16",
              ]),
              variant("Real Diameter 18 cm (Tinggi 10 cm)", 550000, [
                "18",
                "18cm",
                "size 18",
                "real 18",
                "real 18 cm",
                "diameter 18",
              ]),
              variant("Real Diameter 20 cm (Tinggi 10 cm)", 650000, [
                "20",
                "20cm",
                "size 20",
                "real 20",
                "real 20 cm",
                "diameter 20",
              ]),
            ],
          },
          {
            name: "Dummy Cake (10 cm)",
            keywords: ["dummy", "dummy cake", "10 cm"],
            defaultVariant: "Dummy Diameter 16 cm (Tinggi 10 cm)",
            variants: [
              variant("Dummy Diameter 14 cm (Tinggi 10 cm)", 250000, [
                "14",
                "14cm",
                "dummy 14",
                "dummy 14 cm",
                "diameter 14",
              ]),
              variant("Dummy Diameter 16 cm (Tinggi 10 cm)", 275000, [
                "16",
                "16cm",
                "dummy 16",
                "dummy 16 cm",
                "diameter 16",
              ]),
              variant("Dummy Diameter 18 cm (Tinggi 10 cm)", 300000, [
                "18",
                "18cm",
                "dummy 18",
                "dummy 18 cm",
                "diameter 18",
              ]),
              variant("Dummy Diameter 20 cm (Tinggi 10 cm)", 350000, [
                "20",
                "20cm",
                "dummy 20",
                "dummy 20 cm",
                "diameter 20",
              ]),
            ],
          },
        ],
      },
      {
        name: "Cake Tinggi 15 cm",
        keywords: [
          "cake 15 cm",
          "tall",
          "15 cm",
          "tinggi 15 cm",
          "height 15 cm",
          "real cake",
          "dummy cake",
        ],
        products: [
          {
            name: "Real Cake (15 cm)",
            keywords: ["tall", "15 cm", "real", "real cake"],
            defaultVariant: "Real Diameter 16 cm (Tinggi 15 cm)",
            variants: [
              variant("Real Diameter 14 cm (Tinggi 15 cm)", 500000, [
                "14",
                "14cm",
                "real 14",
                "real 14 cm",
                "tall 14",
                "diameter 14",
              ]),
              variant("Real Diameter 16 cm (Tinggi 15 cm)", 550000, [
                "16",
                "16cm",
                "real 16",
                "real 16 cm",
                "tall 16",
                "diameter 16",
              ]),
              variant("Real Diameter 18 cm (Tinggi 15 cm)", 650000, [
                "18",
                "18cm",
                "real 18",
                "real 18 cm",
                "tall 18",
                "diameter 18",
              ]),
              variant("Real Diameter 20 cm (Tinggi 15 cm)", 750000, [
                "20",
                "20cm",
                "real 20",
                "real 20 cm",
                "tall 20",
                "diameter 20",
              ]),
            ],
          },
          {
            name: "Dummy Cake (15 cm)",
            keywords: ["dummy", "dummy cake", "15 cm", "tall dummy"],
            defaultVariant: "Dummy Diameter 16 cm (Tinggi 15 cm)",
            variants: [
              variant("Dummy Diameter 14 cm (Tinggi 15 cm)", 300000, [
                "14",
                "14cm",
                "dummy 14",
                "dummy 14 cm",
                "tall dummy 14",
                "diameter 14",
              ]),
              variant("Dummy Diameter 16 cm (Tinggi 15 cm)", 325000, [
                "16",
                "16cm",
                "dummy 16",
                "dummy 16 cm",
                "tall dummy 16",
                "diameter 16",
              ]),
              variant("Dummy Diameter 18 cm (Tinggi 15 cm)", 350000, [
                "18",
                "18cm",
                "dummy 18",
                "dummy 18 cm",
                "tall dummy 18",
                "diameter 18",
              ]),
              variant("Dummy Diameter 20 cm (Tinggi 15 cm)", 400000, [
                "20",
                "20cm",
                "dummy 20",
                "dummy 20 cm",
                "tall dummy 20",
                "diameter 20",
              ]),
            ],
          },
        ],
      },
      {
        name: "Two Tiered Cake",
        keywords: ["tier", "two tier", "2 tier", "two-tiered"],
        products: [
          {
            name: "Two Tiered Cake",
            keywords: ["tier", "two tier", "2 tier", "wedding"],
            defaultVariant: "Medium (12 & 18 cm)",
            variants: [
              variant("Medium (12 & 18 cm)", 550000, [
                "12",
                "18",
                "12 18",
                "medium",
              ]),
              variant("Large (14 & 20 cm)", 650000, [
                "14",
                "20",
                "14 20",
                "large",
              ]),
              variant("Large Tall (14 & 20 cm)", 750000, [
                "large tall",
                "tall tier",
                "4+4",
              ]),
            ],
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
        name: "Core Cookies (Mama's Kitchen)",
        keywords: ["core", "regular", "mama's kitchen"],
        products: [
          {
            name: "Individual Cookie",
            keywords: ["individual", "single cookie"],
            defaultVariant: "Simple Character (15K / pcs)",
            variants: [
              variant("Simple Character (15K / pcs)", 15000, [
                "simple character",
                "start from 15k",
                "15k",
              ]),
              variant("Custom Text / Shape Simple (17K / pcs)", 17000, [
                "text",
                "simple",
                "17k",
                "tulisan",
              ]),
              variant("Medium Custom Shape (20K / pcs)", 20000, [
                "medium",
                "shape",
                "20k",
                "custom shape",
              ]),
              variant("Cartoon Face (17K / pcs)", 17000, [
                "cartoon face",
                "17k",
                "face only",
              ]),
              variant("Cartoon Face (20K / pcs)", 20000, [
                "cartoon face",
                "20k",
              ]),
              variant("Cartoon Half Body (20K / pcs)", 20000, [
                "cartoon half",
                "half body",
                "20k",
              ]),
              variant("Cartoon Half Body (25K / pcs)", 25000, [
                "cartoon half",
                "half body",
                "25k",
              ]),
              variant("Cartoon Full Body (30K / pcs)", 30000, [
                "cartoon full",
                "full body",
                "30k",
              ]),
              variant("Chibi Face (20K / pcs)", 20000, ["chibi face", "20k"]),
              variant("Chibi Face (25K / pcs)", 25000, [
                "chibi face",
                "25k",
              ]),
              variant("Chibi Half Body (25K / pcs)", 25000, [
                "chibi half",
                "25k",
              ]),
              variant("Chibi Half Body (30K / pcs)", 30000, [
                "chibi half",
                "30k",
              ]),
              variant("Chibi Full Body (30K / pcs)", 30000, [
                "chibi full",
                "30k",
              ]),
              variant("Chibi Full Body (35K / pcs)", 35000, [
                "chibi full",
                "35k",
              ]),
              variant("Chibi Full Body + Accessories (35K / pcs)", 35000, [
                "chibi accessories",
                "35k",
              ]),
              variant("Chibi Full Body + Accessories (40K / pcs)", 40000, [
                "chibi full",
                "accessories",
                "40k",
              ]),
              variant("Anime/Caricature Face (25K / pcs)", 25000, [
                "anime",
                "caricature face",
                "25k",
              ]),
              variant("Anime/Caricature Face (30K / pcs)", 30000, [
                "anime",
                "caricature face",
                "30k",
              ]),
              variant("Anime/Caricature Half Body (30K / pcs)", 30000, [
                "anime half",
                "caricature half",
                "30k",
              ]),
              variant("Anime/Caricature Half Body (35K / pcs)", 35000, [
                "anime half",
                "caricature half",
                "35k",
              ]),
              variant("Anime/Caricature Full Body (35K / pcs)", 35000, [
                "anime full",
                "caricature full",
                "35k",
              ]),
              variant("Anime/Caricature Full Body (40K / pcs)", 40000, [
                "anime full",
                "caricature full",
                "40k",
              ]),
              variant("Edible Print Square/Circle (20K / pcs)", 20000, [
                "edible print",
                "square",
                "circle",
                "20k",
              ]),
              variant("Edible Print Custom Shape (25K / pcs)", 25000, [
                "edible print",
                "custom shape",
                "25k",
              ]),
              variant("Edible Print Custom Shape (30K / pcs)", 30000, [
                "edible print",
                "custom shape",
                "30k",
              ]),
            ],
          },
          fixedProduct("4 in 1 Mini Cookies", 35000, {
            keywords: ["4 in 1", "4in1", "mini"],
            variantLabel: "Per Pack (isi 4)",
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
        name: "Halloween 2025",
        keywords: ["halloween"],
        products: [
          fixedProduct("Set A", 15000, {
            keywords: ["set a"],
            variantLabel: "Per pcs",
          }),
          fixedProduct("Set B", 17000, {
            keywords: ["set b"],
            variantLabel: "Per pcs",
          }),
          fixedProduct("Set C", 17000, {
            keywords: ["set c"],
            variantLabel: "Per pcs",
          }),
          fixedProduct("Mini Bites", 30000, {
            keywords: ["mini bites"],
            variantLabel: "Per pack (isi 3)",
          }),
          fixedProduct("Sharing Box (isi 2)", 45000, {
            keywords: ["sharing box", "box isi 2", "isi 2"],
            variantLabel: "Box isi 2",
          }),
          fixedProduct("Sharing Box (isi 3)", 60000, {
            keywords: ["sharing box", "box isi 3", "isi 3"],
            variantLabel: "Box isi 3",
          }),
          fixedProduct("DIY Set", 120000, {
            keywords: ["diy"],
            variantLabel: "Per pack",
          }),
        ],
      },
      {
        name: "Christmas 2025",
        keywords: ["christmas", "xmas", "natal"],
        products: [
          fixedProduct("Bauble", 60000, {
            keywords: ["bauble"],
            variantLabel: "Per pack (isi 5)",
          }),
          fixedProduct("Set A", 15000, {
            keywords: ["set a"],
            variantLabel: "Per pcs",
          }),
          fixedProduct("Mickey", 12000, {
            keywords: ["mickey"],
            variantLabel: "Per pcs",
          }),
          fixedProduct("Set B", 17000, {
            keywords: ["set b"],
            variantLabel: "Per pcs",
          }),
          fixedProduct("Set C", 17000, {
            keywords: ["set c"],
            variantLabel: "Per pcs",
          }),
          fixedProduct("Tree", 17000, {
            keywords: ["tree"],
            variantLabel: "Per pcs",
          }),
          fixedProduct("3 in 1", 30000, {
            keywords: ["3 in 1", "3in1"],
            variantLabel: "Per pack",
          }),
          fixedProduct("DIY Classic", 110000, {
            keywords: ["diy classic"],
            variantLabel: "Per pcs",
          }),
          fixedProduct("DIY Gingerbread House", 130000, {
            keywords: ["gingerbread", "diy gingerbread"],
            variantLabel: "Per pcs",
          }),
          fixedProduct("Sharing Box (isi 2)", 45000, {
            keywords: ["sharing box", "box isi 2", "isi 2"],
            variantLabel: "Box isi 2",
          }),
          fixedProduct("Sharing Box (isi 3)", 60000, {
            keywords: ["sharing box", "box isi 3", "isi 3"],
            variantLabel: "Box isi 3",
          }),
          fixedProduct("Noel Box", 90000, {
            keywords: ["noel"],
            variantLabel: "Per box",
          }),
          fixedProduct("Character Box", 160000, {
            keywords: ["character box"],
            variantLabel: "Per box",
          }),
          fixedProduct("Bites Nastar", 200000, {
            keywords: ["bites nastar", "nastar"],
            variantLabel: "Per box",
          }),
          fixedProduct("Joyful Box", 100000, {
            keywords: ["joyful"],
            variantLabel: "Per box",
          }),
          fixedProduct("Jingle Box", 200000, {
            keywords: ["jingle"],
            variantLabel: "Per box",
          }),
        ],
      },
      {
        name: "CNY 2026",
        keywords: ["cny", "imlek", "chinese new year"],
        products: [
          fixedProduct("Set A", 17000, {
            keywords: ["set a"],
            variantLabel: "Per pcs",
          }),
          fixedProduct("Set B", 17000, {
            keywords: ["set b"],
            variantLabel: "Per pcs",
          }),
          fixedProduct("3 in 1", 30000, {
            keywords: ["3 in 1", "3in1"],
            variantLabel: "Per pack",
          }),
          fixedProduct("DIY Classic", 110000, {
            keywords: ["diy classic"],
            variantLabel: "Per pcs",
          }),
          fixedProduct("Sharing Box (isi 2)", 45000, {
            keywords: ["sharing box", "box isi 2", "isi 2"],
            variantLabel: "Box isi 2",
          }),
          fixedProduct("Sharing Box (isi 3)", 60000, {
            keywords: ["sharing box", "box isi 3", "isi 3"],
            variantLabel: "Box isi 3",
          }),
          fixedProduct("Lunar Box", 90000, {
            keywords: ["lunar"],
            variantLabel: "Per box",
          }),
          fixedProduct("Character Box", 160000, {
            keywords: ["character box"],
            variantLabel: "Per box",
          }),
          fixedProduct("Bites Nastar", 200000, {
            keywords: ["bites nastar", "nastar"],
            variantLabel: "Per box",
          }),
          fixedProduct("Wishful Box", 110000, {
            keywords: ["wishful"],
            variantLabel: "Per box",
          }),
          fixedProduct("Dimsum Box", 220000, {
            keywords: ["dimsum"],
            variantLabel: "Per box",
          }),
        ],
      },
      {
        name: "EID 2026",
        keywords: ["eid", "ramadan", "lebaran"],
        products: [
          fixedProduct("Set A", 17000, {
            keywords: ["set a"],
            variantLabel: "Per pcs",
          }),
          fixedProduct("Set B", 17000, {
            keywords: ["set b"],
            variantLabel: "Per pcs",
          }),
          fixedProduct("DIY Classic", 110000, {
            keywords: ["diy classic"],
            variantLabel: "Per pcs",
          }),
          fixedProduct("Sharing Box (isi 2)", 45000, {
            keywords: ["sharing box", "box isi 2", "isi 2"],
            variantLabel: "Box isi 2",
          }),
          fixedProduct("Sharing Box (isi 3)", 60000, {
            keywords: ["sharing box", "box isi 3", "isi 3"],
            variantLabel: "Box isi 3",
          }),
          fixedProduct("Character Box", 160000, {
            keywords: ["character box"],
            variantLabel: "Per box",
          }),
          fixedProduct("Bites Nastar", 200000, {
            keywords: ["bites nastar", "nastar"],
            variantLabel: "Per box",
          }),
          fixedProduct("Wishful Box", 110000, {
            keywords: ["wishful"],
            variantLabel: "Per box",
          }),
          fixedProduct("Dimsum Box", 250000, {
            keywords: ["dimsum"],
            variantLabel: "Per box",
          }),
          fixedProduct("Lotus Box", 175000, {
            keywords: ["lotus"],
            variantLabel: "Per box",
          }),
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
          fixedProduct("1 Dozen Cupcakes", 240000, {
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
          fixedProduct("Individual Cupcakes + Cookie", 47000, {
            keywords: ["cupcake + cookie", "cupcakes + cookie"],
            variantLabel: "Per pcs",
          }),
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
    { id: "dark-color", label: "Dark Color Cake", price: 50000 },
    { id: "fondant-name", label: "Fondant Name", price: 20000 },
    { id: "mini-details", label: "Mini Details", price: 10000 },
    { id: "small-cookies", label: "Small Cookies (4-6cm)", price: 20000 },
    { id: "medium-cookies", label: "Medium Cookies (8-9cm)", price: 40000 },
    { id: "large-cookies", label: "Large Cookies (10-18cm)", price: 70000 },
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
    {
      id: "dark-color-buttercream",
      label: "Dark Color Buttercream",
      price: 50000,
    },
    { id: "cookie-topper", label: "Additional Cookie Topper", price: 15000 },
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

function includesKeyword(normalizedText: string, keyword: string): boolean {
  const probe = normalize(keyword);
  if (!probe) return false;
  return normalizedText.includes(probe);
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

  return variants.find((entry) => {
    const normalizedLabel = normalize(entry.label);
    if (
      normalizedLabel === normalizedSize ||
      normalizedLabel.includes(normalizedSize) ||
      normalizedSize.includes(normalizedLabel)
    ) {
      return true;
    }

    return (entry.keywords ?? []).some((keyword) =>
      includesKeyword(normalizedSize, keyword),
    );
  });
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
  const size = findVariantBySelection(variants, partial.size ?? "")?.label ??
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
      const productScore =
        scoreKeywordList(normalizedText, [product.name], 4) +
        scoreKeywordList(normalizedText, product.keywords, 8);

      const totalScore = subcategoryScore + productScore;

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
