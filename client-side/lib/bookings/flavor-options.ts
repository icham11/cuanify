export interface FlavorOption {
  id: string;
  label: string;
  price: number;
  premium: boolean;
  aliases: string[];
  shortCodes: string[];
}

export const CAKE_FLAVOR_OPTIONS: FlavorOption[] = [
  {
    id: "flavor-cake-choco-banana",
    label: "Choco Banana",
    price: 0,
    premium: false,
    aliases: ["choco banana", "chocobanana", "banana choco"],
    shortCodes: ["CB"],
  },
  {
    id: "flavor-cake-double-choco",
    label: "Double Choco",
    price: 0,
    premium: false,
    aliases: ["double choco", "double chocolate"],
    shortCodes: ["DC"],
  },
  {
    id: "flavor-cake-classic-vanilla",
    label: "Classic Vanilla",
    price: 0,
    premium: false,
    aliases: ["classic vanilla", "vanilla classic"],
    shortCodes: ["CV"],
  },
  {
    id: "flavor-cake-lapis-surabaya",
    label: "Lapis Surabaya",
    price: 0,
    premium: false,
    aliases: ["lapis surabaya", "lapis"],
    shortCodes: ["LS"],
  },
  {
    id: "flavor-cake-red-velvet-premium",
    label: "Red Velvet",
    price: 100000,
    premium: true,
    aliases: ["red velvet"],
    shortCodes: ["RV"],
  },
  {
    id: "flavor-cake-lapis-surabaya-premium",
    label: "Lapis Surabaya Premium",
    price: 100000,
    premium: true,
    aliases: ["lapis surabaya premium", "lapis premium"],
    shortCodes: ["LSP"],
  },
  {
    id: "flavor-cake-japanese-cheese-premium",
    label: "Japanese Cheese",
    price: 50000,
    premium: true,
    aliases: ["japanese cheese", "japan cheese"],
    shortCodes: ["JC"],
  },
];

export const CUPCAKE_FLAVOR_OPTIONS: FlavorOption[] = [
  {
    id: "flavor-cupcake-choco-banana",
    label: "Choco Banana",
    price: 0,
    premium: false,
    aliases: ["choco banana", "chocobanana", "banana choco"],
    shortCodes: ["CB"],
  },
  {
    id: "flavor-cupcake-double-choco",
    label: "Double Choco",
    price: 0,
    premium: false,
    aliases: ["double choco", "double chocolate"],
    shortCodes: ["DC"],
  },
  {
    id: "flavor-cupcake-classic-vanilla",
    label: "Classic Vanilla",
    price: 0,
    premium: false,
    aliases: ["classic vanilla", "vanilla classic"],
    shortCodes: ["CV"],
  },
];

export function getFlavorOptionsByCategory(category: string): FlavorOption[] {
  if (category === "Cake") return CAKE_FLAVOR_OPTIONS;
  if (category === "Cupcakes") return CUPCAKE_FLAVOR_OPTIONS;
  return [];
}

export function getFlavorAddOnIdsByCategory(category: string): string[] {
  return getFlavorOptionsByCategory(category).map((option) => option.id);
}
