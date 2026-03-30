export type DeliveryMethod =
  | "PICKUP"
  | "CUSTOMER_APP_COURIER"
  | "ASSISTED_SAME_DAY"
  | "REGULAR_JNE_JNT";

export interface DeliveryMethodOption {
  value: DeliveryMethod;
  label: string;
  description: string;
}

export interface DeliveryRuleItem {
  category?: string;
  subcategory?: string;
  productName?: string;
  size?: string;
  quantity?: number;
}

const DEFAULT_WEIGHT_BY_CATEGORY: Record<string, number> = {
  Cake: 1800,
  Cookies: 100,
  Cupcakes: 450,
  Buket: 1200,
  "Cookies Tower": 3000,
};

const PRODUCT_WEIGHT_RULES: Array<{ probe: string; weightGram: number }> = [
  { probe: "character box", weightGram: 500 },
  { probe: "dimsum box", weightGram: 2000 },
  { probe: "lotus box", weightGram: 1000 },
  { probe: "sharing box", weightGram: 167 },
  { probe: "hand bouquet", weightGram: 3000 },
  { probe: "diy pack", weightGram: 1000 },
];

export const DELIVERY_METHOD_OPTIONS: DeliveryMethodOption[] = [
  {
    value: "PICKUP",
    label: "Pickup",
    description: "Pengambilan langsung oleh customer.",
  },
  {
    value: "CUSTOMER_APP_COURIER",
    label: "GoSend/Grab (pesan customer)",
    description: "Customer pesan kurir sendiri via aplikasi.",
  },
  {
    value: "ASSISTED_SAME_DAY",
    label: "GoSend/Grab/Paxel (dibantu admin)",
    description: "Admin bantu pemesanan kurir, termasuk ongkir + handling.",
  },
  {
    value: "REGULAR_JNE_JNT",
    label: "JNE/J&T (pengiriman reguler)",
    description: "Dibantu admin dengan opsi reguler antarkota.",
  },
];

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getItemSource(item: DeliveryRuleItem): string {
  return normalizeText(
    `${item.category || ""} ${item.subcategory || ""} ${item.productName || ""} ${item.size || ""}`,
  );
}

function getQuantity(item: DeliveryRuleItem): number {
  const parsed = Number(item.quantity);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.round(parsed));
}

export function estimateOperationalWeightGram(item: DeliveryRuleItem): number {
  const source = getItemSource(item);
  const matchedRule = PRODUCT_WEIGHT_RULES.find((rule) =>
    source.includes(rule.probe),
  );

  const unitWeight =
    matchedRule?.weightGram ??
    DEFAULT_WEIGHT_BY_CATEGORY[item.category || ""] ??
    500;

  return Math.max(100, Math.round(unitWeight * getQuantity(item)));
}

export function isGrabCarOnlyItem(item: DeliveryRuleItem): boolean {
  const source = getItemSource(item);
  const category = (item.category || "").toLowerCase();

  if (category === "cake") return true;
  if (category === "cupcakes") return true;

  if (category === "buket") {
    return source.includes("standing");
  }

  return false;
}

export function getGrabCarOnlyReasons(items: DeliveryRuleItem[]): string[] {
  const reasons = new Set<string>();

  items.forEach((item) => {
    const source = getItemSource(item);
    const category = (item.category || "").toLowerCase();

    if (category === "cake") {
      reasons.add("Cake/Kue");
      return;
    }

    if (category === "cupcakes") {
      reasons.add("Cupcake");
      return;
    }

    if (category === "buket" && source.includes("standing")) {
      reasons.add("Standing Bouquet");
    }
  });

  return Array.from(reasons);
}

export function usesShippingEngine(method: DeliveryMethod): boolean {
  return method === "ASSISTED_SAME_DAY" || method === "REGULAR_JNE_JNT";
}
