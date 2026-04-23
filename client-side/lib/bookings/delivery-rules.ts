export type DeliveryMethod =
  | "PICKUP"
  | "CUSTOMER_APP_COURIER"
  | "ASSISTED_GOSEND"
  | "ASSISTED_GRAB"
  | "ASSISTED_GOCAR"
  | "ASSISTED_PAXEL"
  | "ASSISTED_SAME_DAY"
  | "REGULAR_JNE_JNT";

export interface DeliveryMethodOption {
  value: DeliveryMethod;
  label: string;
  description: string;
}

export const ADMIN_ASSISTED_SERVICE_CHARGE = 10_000;

const SERVICE_CHARGE_DELIVERY_METHODS = new Set<DeliveryMethod>([
  "ASSISTED_GOSEND",
  "ASSISTED_GRAB",
  "ASSISTED_GOCAR",
  "ASSISTED_PAXEL",
  "ASSISTED_SAME_DAY",
]);

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
  { probe: "handbq", weightGram: 3000 },
  { probe: "hbq", weightGram: 3000 },
  { probe: "standing bouquet", weightGram: 7000 },
  { probe: "standingbq", weightGram: 7000 },
  { probe: "sbq", weightGram: 7000 },
  { probe: "diy pack", weightGram: 1000 },
];

const BOUQUET_COOKIE_QTY_MIN = 7;
const BOUQUET_COOKIE_QTY_MAX = 20;

export const DELIVERY_METHOD_OPTIONS: DeliveryMethodOption[] = [
  {
    value: "PICKUP",
    label: "Pickup",
    description: "Pengambilan langsung oleh customer.",
  },
  {
    value: "CUSTOMER_APP_COURIER",
    label: "Grab/GoCar (pesan customer)",
    description: "Customer pesan kurir sendiri via aplikasi.",
  },
  {
    value: "ASSISTED_GOSEND",
    label: "GoSend (dibantu admin)",
    description: "Admin bantu pemesanan GoSend same-day.",
  },
  {
    value: "ASSISTED_GRAB",
    label: "Grab (dibantu admin)",
    description: "Admin bantu pemesanan Grab same-day.",
  },
  {
    value: "ASSISTED_GOCAR",
    label: "GoCar (dibantu admin)",
    description: "Admin bantu pemesanan GoCar same-day.",
  },
  {
    value: "ASSISTED_PAXEL",
    label: "Paxel (dibantu admin)",
    description: "Admin bantu pengiriman khusus Paxel.",
  },
  {
    value: "ASSISTED_SAME_DAY",
    label: "Same Day (dibantu admin)",
    description: "Admin bantu pilih layanan same-day terbaik (GoSend/Grab/Paxel).",
  },
  {
    value: "REGULAR_JNE_JNT",
    label: "JNE/J&T (pengiriman reguler)",
    description: "Dibantu admin dengan opsi reguler antarkota.",
  },
];

function normalizeDeliveryMethodValue(
  value: DeliveryMethod | string | null | undefined,
): string {
  return String(value || "").trim().toUpperCase();
}

export function isAdminManagedDeliveryMethod(
  method: DeliveryMethod | string | null | undefined,
): boolean {
  const normalized = normalizeDeliveryMethodValue(method);
  return normalized.startsWith("ASSISTED_") || normalized === "REGULAR_JNE_JNT";
}

export function isServiceChargeDeliveryMethod(
  method: DeliveryMethod | string | null | undefined,
): boolean {
  const normalized = normalizeDeliveryMethodValue(method);
  return SERVICE_CHARGE_DELIVERY_METHODS.has(normalized as DeliveryMethod);
}

export function resolveAdminServiceCharge(
  method: DeliveryMethod | string | null | undefined,
): number {
  return isServiceChargeDeliveryMethod(method)
    ? ADMIN_ASSISTED_SERVICE_CHARGE
    : 0;
}

export function parseServiceChargeFromNotes(notes?: string | null): number {
  const match = String(notes || "").match(
    /service\s*charge\s*:\s*([+\-]?\s*[\d.,]+)/i,
  );
  if (!match?.[1]) return 0;

  const digits = match[1].replace(/[^\d-]/g, "");
  if (!digits || digits === "-") return 0;

  const parsed = Number(digits);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed));
}

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

export function isBouquetItem(item: DeliveryRuleItem): boolean {
  const source = getItemSource(item);

  if ((item.category || "").toLowerCase() === "buket") return true;
  return (
    source.includes("bouquet") ||
    source.includes("buket") ||
    source.includes("hbq") ||
    source.includes("sbq")
  );
}

function getQuantity(item: DeliveryRuleItem): number {
  const parsed = Number(item.quantity);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.round(parsed));
}

function resolveOperationalUnits(item: DeliveryRuleItem): number {
  const quantity = getQuantity(item);
  if (!isBouquetItem(item)) return quantity;

  // Bouquet qty in form often means cookie fill count (7-20), not number of bundles.
  if (
    quantity >= BOUQUET_COOKIE_QTY_MIN &&
    quantity <= BOUQUET_COOKIE_QTY_MAX
  ) {
    return 1;
  }

  return quantity;
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

  return Math.max(100, Math.round(unitWeight * resolveOperationalUnits(item)));
}

export function resolveShippingParcelCount(item: DeliveryRuleItem): number {
  return resolveOperationalUnits(item);
}

export function isGrabCarOnlyItem(item: DeliveryRuleItem): boolean {
  const source = getItemSource(item);
  const category = (item.category || "").toLowerCase();

  if (category === "cake") return true;
  if (category === "cupcakes") return true;

  if (isBouquetItem(item)) {
    return source.includes("standing") || source.includes("sbq");
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

    if ((category === "buket" || source.includes("bouquet")) && (source.includes("standing") || source.includes("sbq"))) {
      reasons.add("Standing Bouquet");
    }
  });

  return Array.from(reasons);
}

export function usesShippingEngine(method: DeliveryMethod): boolean {
  return (
    method === "ASSISTED_SAME_DAY" ||
    method === "ASSISTED_GOSEND" ||
    method === "ASSISTED_GRAB" ||
    method === "ASSISTED_GOCAR" ||
    method === "ASSISTED_PAXEL" ||
    method === "REGULAR_JNE_JNT"
  );
}
