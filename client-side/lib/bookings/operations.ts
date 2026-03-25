export interface BookingItemForOperations {
  category: string;
  subcategory?: string;
  productName?: string;
  size?: string;
  quantity?: number;
}

export interface BookingOrderForOperations {
  id?: string;
  deliveryDate: string;
  deliverySlot: string;
  orderStatus?: string;
  items: BookingItemForOperations[];
}

export type CapacityBucket =
  | "seasonal_cookies"
  | "custom_cookies"
  | "cake_tower"
  | "cupcakes"
  | "bouquet";

export const CAPACITY_LIMITS: Record<CapacityBucket, number> = {
  seasonal_cookies: 500,
  custom_cookies: 300,
  cake_tower: 3,
  cupcakes: 200,
  bouquet: 5,
};

export const CAPACITY_LABELS: Record<CapacityBucket, string> = {
  seasonal_cookies: "Seasonal / Bulk Cookies",
  custom_cookies: "Custom Cookies",
  cake_tower: "Cake / Cookies Tower",
  cupcakes: "Cupcakes",
  bouquet: "Bouquet",
};

const CAPACITY_BUCKET_ORDER: CapacityBucket[] = [
  "seasonal_cookies",
  "custom_cookies",
  "cake_tower",
  "cupcakes",
  "bouquet",
];

const seasonalHints = [
  "halloween",
  "christmas",
  "xmas",
  "cny",
  "imlek",
  "eid",
  "ramadan",
  "lebaran",
  "seasonal",
  "special edition",
];

const bulkCookieHints = [
  "sharing box",
  " box",
  "pack",
  "set ",
  "3 in 1",
  "4 in 1",
  "mini bites",
  "diy",
  "bauble",
  "mickey",
  "tree",
  "noel",
  "lunar",
  "lotus",
  "dimsum",
  "wishful",
  "joyful",
  "jingle",
  "bites nastar",
  "character box",
];

const cookieUnitMap: Array<{ probe: string; units: number }> = [
  { probe: "bauble", units: 5 },
  { probe: "3 in 1", units: 3 },
  { probe: "4 in 1", units: 4 },
  { probe: "mini bites", units: 3 },
  { probe: "diy gingerbread", units: 10 },
  { probe: "diy", units: 6 },
  { probe: "character box", units: 9 },
  { probe: "bites nastar", units: 15 },
  { probe: "noel box", units: 4 },
  { probe: "lunar box", units: 4 },
  { probe: "lotus box", units: 15 },
  { probe: "dimsum box", units: 10 },
  { probe: "cookies tower", units: 40 },
];

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getQuantity(item: BookingItemForOperations): number {
  const parsed = Number(item.quantity || 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
}

function getItemSource(item: BookingItemForOperations): string {
  return normalize(
    `${item.subcategory || ""} ${item.productName || ""} ${item.size || ""}`
  );
}

function parseIsiCount(text: string): number | null {
  const match = text.match(/\bisi\s*(\d{1,3})\b/i);
  if (!match?.[1]) return null;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export function isSeasonalCookiesItem(item: BookingItemForOperations): boolean {
  if (item.category !== "Cookies") return false;

  const source = getItemSource(item);
  return seasonalHints.some((hint) => source.includes(hint));
}

function isBulkCookiesItem(item: BookingItemForOperations): boolean {
  if (item.category !== "Cookies") return false;
  if (isSeasonalCookiesItem(item)) return true;

  const source = getItemSource(item);
  if (source.includes("individual cookie")) return false;

  return bulkCookieHints.some((hint) => source.includes(normalize(hint)));
}

export function isSeasonalOrderItems(items: BookingItemForOperations[]): boolean {
  if (!items.length) return false;
  return items.every((item) => item.category === "Cookies" && isBulkCookiesItem(item));
}

export function getSlotLimitByItems(items: BookingItemForOperations[]): number {
  return isSeasonalOrderItems(items) ? 7 : 3;
}

function parseLocalDay(deliveryDate: string): number {
  if (!deliveryDate) return 1;
  const parsed = new Date(`${deliveryDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return 1;
  return parsed.getDay();
}

export function getDeliverySlotsForDate(deliveryDate: string): string[] {
  const day = parseLocalDay(deliveryDate);
  const startHour = 10;
  const endHour = day === 0 ? 15 : 22;

  const slots: string[] = [];
  for (let hour = startHour; hour <= endHour; hour += 1) {
    slots.push(`${String(hour).padStart(2, "0")}:00`);
  }

  return slots;
}

function isActiveOrder(orderStatus: string | undefined): boolean {
  return !["Cancelled", "Completed", "Delivered"].includes(orderStatus || "");
}

function classifyCapacityBucket(item: BookingItemForOperations): CapacityBucket | null {
  if (item.category === "Cookies") {
    return isBulkCookiesItem(item) ? "seasonal_cookies" : "custom_cookies";
  }

  if (item.category === "Cake" || item.category === "Cookies Tower") {
    return "cake_tower";
  }

  if (item.category === "Cupcakes") {
    return "cupcakes";
  }

  if (item.category === "Buket") {
    return "bouquet";
  }

  return null;
}

function getCookieUnitsPerOrder(item: BookingItemForOperations): number {
  const source = getItemSource(item);
  const fromIsi = parseIsiCount(source);
  if (fromIsi) return fromIsi;

  const known = cookieUnitMap.find((entry) => source.includes(normalize(entry.probe)));
  if (known) return known.units;

  return 1;
}

function getCupcakeUnitsPerOrder(item: BookingItemForOperations): number {
  const source = getItemSource(item);
  if (source.includes("dozen") || source.includes("12 pcs")) {
    return 12;
  }
  return 1;
}

function getCapacityUnitsPerOrder(item: BookingItemForOperations): number {
  if (item.category === "Cookies") {
    return getCookieUnitsPerOrder(item);
  }

  if (item.category === "Cupcakes") {
    return getCupcakeUnitsPerOrder(item);
  }

  return 1;
}

export function summarizeCapacityByItems(items: BookingItemForOperations[]): Record<CapacityBucket, number> {
  const result: Record<CapacityBucket, number> = {
    seasonal_cookies: 0,
    custom_cookies: 0,
    cake_tower: 0,
    cupcakes: 0,
    bouquet: 0,
  };

  items.forEach((item) => {
    const bucket = classifyCapacityBucket(item);
    if (!bucket) return;
    const quantity = getQuantity(item);
    const unitsPerOrder = getCapacityUnitsPerOrder(item);
    result[bucket] += quantity * unitsPerOrder;
  });

  return result;
}

export function summarizeCapacityByOrdersForDate(
  orders: BookingOrderForOperations[],
  deliveryDate: string,
  excludeOrderId?: string
): Record<CapacityBucket, number> {
  const result: Record<CapacityBucket, number> = {
    seasonal_cookies: 0,
    custom_cookies: 0,
    cake_tower: 0,
    cupcakes: 0,
    bouquet: 0,
  };

  orders.forEach((order) => {
    if (excludeOrderId && order.id === excludeOrderId) return;
    if (order.deliveryDate !== deliveryDate) return;
    if (!isActiveOrder(order.orderStatus)) return;

    const summary = summarizeCapacityByItems(order.items || []);
    CAPACITY_BUCKET_ORDER.forEach((bucket) => {
      result[bucket] += summary[bucket];
    });
  });

  return result;
}

export function getCapacityOverflows(
  existing: Record<CapacityBucket, number>,
  incoming: Record<CapacityBucket, number>
): CapacityBucket[] {
  return CAPACITY_BUCKET_ORDER.filter((bucket) => {
    return existing[bucket] + incoming[bucket] > CAPACITY_LIMITS[bucket];
  });
}

export function countConcurrentOrdersForSlot(args: {
  orders: BookingOrderForOperations[];
  deliveryDate: string;
  deliverySlot: string;
  targetItems: BookingItemForOperations[];
  excludeOrderId?: string;
}): number {
  const targetSeasonal = isSeasonalOrderItems(args.targetItems);

  return args.orders.filter((order) => {
    if (args.excludeOrderId && order.id === args.excludeOrderId) return false;
    if (order.deliveryDate !== args.deliveryDate) return false;
    if (order.deliverySlot !== args.deliverySlot) return false;
    if (!isActiveOrder(order.orderStatus)) return false;

    const orderSeasonal = isSeasonalOrderItems(order.items || []);
    return orderSeasonal === targetSeasonal;
  }).length;
}
