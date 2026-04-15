import {
  BAKERY_BLOCKED_DATES,
  BAKERY_DAILY_PRODUCTION_TOKEN_LIMIT,
  BAKERY_H_MINUS_1_CUTOFF_HOUR,
  BAKERY_TOKEN_DIFFICULT_PER_UNIT,
  BAKERY_TOKEN_MULTIPLIER_BUKET,
  BAKERY_TOKEN_MULTIPLIER_CAKE_TOWER,
  BAKERY_TOKEN_MULTIPLIER_COOKIES,
  BAKERY_TOKEN_MULTIPLIER_CUPCAKES,
  BAKERY_TOKEN_CARRY_OVER_DAYS,
  BAKERY_TOKEN_MEDIUM_PER_UNIT,
  BAKERY_TOKEN_SIMPLE_PER_UNIT,
} from "@/lib/bookings/config";
import {
  normalizeDateInput,
  parseSafeDate,
} from "@/lib/helpers/date-normalization";
import { calculateOrderTokenFromItems } from "@/lib/bookings/order-token-calculator";

export interface BookingItemForOperations {
  category: string;
  subcategory?: string;
  productName?: string;
  size?: string;
  quantity?: number;
  tokenDifficulty?: string;
  customTokenPerUnit?: number;
  cookieDifficultyBreakdown?: string;
  addOns?: string[];
  addOnQuantities?: Record<string, number>;
}

export interface BookingOrderForOperations {
  id?: string;
  deliveryDate: string;
  deliverySlot: string;
  orderStatus?: string;
  items: BookingItemForOperations[];
}

export interface DateBlockingContext {
  deliveryMethod?: string;
  items?: BookingItemForOperations[];
  blockedDates?: readonly string[];
}

export type SlotOrderType = "CUSTOM" | "SEASONAL";
export type SlotAvailabilityStatus = "AVAILABLE" | "ALMOST_FULL" | "FULL";

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

export const DAILY_PRODUCTION_TOKEN_LIMIT = BAKERY_DAILY_PRODUCTION_TOKEN_LIMIT;
export const H_MINUS_1_CUTOFF_HOUR = BAKERY_H_MINUS_1_CUTOFF_HOUR;
export const TOKEN_CARRY_OVER_DAYS = BAKERY_TOKEN_CARRY_OVER_DAYS;
export const TOKEN_DIFFICULTY_POINTS = {
  SIMPLE: BAKERY_TOKEN_SIMPLE_PER_UNIT,
  MEDIUM: BAKERY_TOKEN_MEDIUM_PER_UNIT,
  DIFFICULT: BAKERY_TOKEN_DIFFICULT_PER_UNIT,
} as const;

function getCategoryTokenMultiplier(item: BookingItemForOperations): number {
  if (item.category === "Cake" || item.category === "Cookies Tower") {
    return BAKERY_TOKEN_MULTIPLIER_CAKE_TOWER;
  }
  if (item.category === "Buket") {
    return BAKERY_TOKEN_MULTIPLIER_BUKET;
  }
  if (item.category === "Cupcakes") {
    return BAKERY_TOKEN_MULTIPLIER_CUPCAKES;
  }
  if (item.category === "Cookies") {
    return BAKERY_TOKEN_MULTIPLIER_COOKIES;
  }
  return 1;
}

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

const seasonalEventCookieHints = [
  "event cookies",
  "lotus box",
  "dimsum box",
  "bites box",
  "bites nastar",
  "3 in 1",
  "bauble",
  "character box",
  "noel box",
  "lunar box",
];

const bulkCookieHints = [
  "sharing box",
  " box",
  "pack",
  "set ",
  "3 in 1",
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
  { probe: "3 in 1", units: 5 },
  { probe: "bites box", units: 10 },
  { probe: "mini bites", units: 3 },
  { probe: "diy gingerbread", units: 10 },
  { probe: "diy", units: 6 },
  { probe: "character box", units: 9 },
  { probe: "bites nastar", units: 10 },
  { probe: "noel box", units: 4 },
  { probe: "lunar box", units: 4 },
  { probe: "lotus box", units: 10 },
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
    `${item.subcategory || ""} ${item.productName || ""} ${item.size || ""}`,
  );
}

function isCookieLikeCategory(category: string): boolean {
  const normalized = normalize(category);
  return normalized === "cookies" || normalized === "seasonal event";
}

function parseIsiCount(text: string): number | null {
  const match = text.match(/\bisi\s*(\d{1,3})\b/i);
  if (!match?.[1]) return null;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export function isSeasonalCookiesItem(item: BookingItemForOperations): boolean {
  if (!isCookieLikeCategory(item.category)) return false;

  const normalizedSubcategory = normalize(item.subcategory || "");
  if (
    normalizedSubcategory.includes("event") ||
    normalizedSubcategory.includes("seasonal")
  ) {
    return true;
  }

  const source = getItemSource(item);
  if (seasonalHints.some((hint) => source.includes(hint))) return true;

  return seasonalEventCookieHints.some((hint) =>
    source.includes(normalize(hint)),
  );
}

function isBulkCookiesItem(item: BookingItemForOperations): boolean {
  if (!isCookieLikeCategory(item.category)) return false;
  if (isSeasonalCookiesItem(item)) return true;

  const source = getItemSource(item);
  if (source.includes("individual cookie")) return false;

  return bulkCookieHints.some((hint) => source.includes(normalize(hint)));
}

export function isSeasonalOrderItems(
  items: BookingItemForOperations[],
): boolean {
  if (!items.length) return false;
  return items.every(
    (item) => isCookieLikeCategory(item.category) && isBulkCookiesItem(item),
  );
}

export function getSlotLimitByItems(items: BookingItemForOperations[]): number {
  return isSeasonalOrderItems(items) ? 7 : 3;
}

export function getSlotLimitByOrderType(orderType: SlotOrderType): number {
  return orderType === "SEASONAL" ? 7 : 3;
}

export function inferOrderTypeFromItems(
  items: BookingItemForOperations[],
): SlotOrderType {
  return isSeasonalOrderItems(items) ? "SEASONAL" : "CUSTOM";
}

function parseLocalDay(deliveryDate: string): number {
  const parsed = parseSafeDate(deliveryDate);
  if (!parsed) return 1;
  return parsed.getDay();
}

function parseLocalDateOnly(value: string): Date | null {
  return parseSafeDate(value);
}

function isCookiesPickupHolidayException(
  context?: DateBlockingContext,
): boolean {
  if (!context) return false;

  const deliveryMethod = (context.deliveryMethod || "").toUpperCase();
  if (deliveryMethod !== "PICKUP") return false;

  const items = context.items ?? [];
  if (!items.length) return false;

  return items.every((item) => isCookieLikeCategory(item.category));
}

export function isNextDayCutoffBlocked(
  deliveryDate: string,
  now: Date = new Date(),
): boolean {
  if (!deliveryDate) return false;

  const targetDate = parseLocalDateOnly(deliveryDate);
  if (!targetDate) return false;

  const cutoffDate = new Date(targetDate);
  cutoffDate.setDate(cutoffDate.getDate() - 1);
  cutoffDate.setHours(H_MINUS_1_CUTOFF_HOUR, 0, 0, 0);

  return now.getTime() > cutoffDate.getTime();
}

export function isDateBlockedForOrdering(
  deliveryDate: string,
  now: Date = new Date(),
  context?: DateBlockingContext,
): boolean {
  const normalized = normalizeDateInput(deliveryDate);
  if (!normalized) return true;

  const blockedDates = context?.blockedDates ?? BAKERY_BLOCKED_DATES;

  if (blockedDates.includes(normalized)) {
    if (isCookiesPickupHolidayException(context)) return false;
    return true;
  }
  return isNextDayCutoffBlocked(normalized, now);
}

export function getDeliverySlotsForDate(
  deliveryDate: string,
  now: Date = new Date(),
  context?: DateBlockingContext,
): string[] {
  if (isDateBlockedForOrdering(deliveryDate, now, context)) {
    return [];
  }

  const day = parseLocalDay(deliveryDate);
  const startHour = 10;
  const endHour = day === 0 ? 15 : 22;

  const slots: string[] = [];
  for (let hour = startHour; hour <= endHour; hour += 1) {
    slots.push(`${String(hour).padStart(2, "0")}:00`);
  }

  return slots;
}

export function isWithinBusinessHours(
  deliveryDate: string,
  deliverySlot: string,
  now: Date = new Date(),
  context?: DateBlockingContext,
): boolean {
  if (!deliveryDate || !deliverySlot) return false;
  if (isDateBlockedForOrdering(deliveryDate, now, context)) return false;
  if (!/^\d{2}:\d{2}$/.test(deliverySlot)) return false;
  return getDeliverySlotsForDate(deliveryDate, now, context).includes(
    deliverySlot,
  );
}

function isActiveOrder(orderStatus: string | undefined): boolean {
  return !["Cancelled", "Completed", "Delivery", "Delivered"].includes(
    orderStatus || "",
  );
}

function inferOrderTypeFromOrder(
  order: BookingOrderForOperations,
): SlotOrderType {
  return inferOrderTypeFromItems(order.items || []);
}

function classifyCapacityBucket(
  item: BookingItemForOperations,
): CapacityBucket | null {
  if (isCookieLikeCategory(item.category)) {
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

  const known = cookieUnitMap.find((entry) =>
    source.includes(normalize(entry.probe)),
  );
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

function getDifficultyTokenPerUnit(item: BookingItemForOperations): number {
  const customToken = Number(item.customTokenPerUnit || 0);
  if (Number.isFinite(customToken) && customToken > 0) {
    return Math.round(customToken);
  }

  const manualDifficulty = normalize(item.tokenDifficulty || "");
  if (
    manualDifficulty.includes("difficult") ||
    manualDifficulty.includes("hard")
  ) {
    return TOKEN_DIFFICULTY_POINTS.DIFFICULT;
  }
  if (manualDifficulty.includes("medium")) {
    return TOKEN_DIFFICULTY_POINTS.MEDIUM;
  }
  if (
    manualDifficulty.includes("simple") ||
    manualDifficulty.includes("easy")
  ) {
    return TOKEN_DIFFICULTY_POINTS.SIMPLE;
  }

  let baseTokenPerUnit = TOKEN_DIFFICULTY_POINTS.SIMPLE;
  const source = getItemSource(item);

  const hardHints = [
    "difficult",
    "hard",
    "3d",
    "portrait",
    "character",
    "standing",
    "wedding",
    "tower",
  ];
  if (hardHints.some((hint) => source.includes(hint))) {
    baseTokenPerUnit = TOKEN_DIFFICULTY_POINTS.DIFFICULT;
    return Math.max(
      1,
      Math.round(baseTokenPerUnit * getCategoryTokenMultiplier(item)),
    );
  }

  const mediumHints = [
    "medium",
    "semi",
    "logo",
    "painted",
    "custom",
    "bouquet",
    "cupcake",
  ];
  if (mediumHints.some((hint) => source.includes(hint))) {
    baseTokenPerUnit = TOKEN_DIFFICULTY_POINTS.MEDIUM;
    return Math.max(
      1,
      Math.round(baseTokenPerUnit * getCategoryTokenMultiplier(item)),
    );
  }

  if (item.category === "Cake" || item.category === "Cookies Tower") {
    baseTokenPerUnit = TOKEN_DIFFICULTY_POINTS.DIFFICULT;
    return Math.max(
      1,
      Math.round(baseTokenPerUnit * getCategoryTokenMultiplier(item)),
    );
  }
  if (item.category === "Buket" || item.category === "Cupcakes") {
    baseTokenPerUnit = TOKEN_DIFFICULTY_POINTS.MEDIUM;
    return Math.max(
      1,
      Math.round(baseTokenPerUnit * getCategoryTokenMultiplier(item)),
    );
  }

  baseTokenPerUnit = TOKEN_DIFFICULTY_POINTS.SIMPLE;
  return Math.max(
    1,
    Math.round(baseTokenPerUnit * getCategoryTokenMultiplier(item)),
  );
}

export function resolveTokenPerUnit(item: BookingItemForOperations): number {
  return getDifficultyTokenPerUnit(item);
}

export function summarizeProductionTokensByItems(
  items: BookingItemForOperations[],
): number {
  return calculateOrderTokenFromItems(
    items.map((item) => {
      const difficultyFromPayload =
        typeof (item as { difficulty?: unknown }).difficulty === "string"
          ? ((item as { difficulty?: string }).difficulty ?? "")
          : "";

      return {
        category: item.category,
        subcategory: item.subcategory,
        productName: item.productName,
        size: item.size,
        tokenDifficulty: item.tokenDifficulty,
        customTokenPerUnit: item.customTokenPerUnit,
        cookieDifficultyBreakdown: item.cookieDifficultyBreakdown,
        addOns: item.addOns,
        addOnQuantities: item.addOnQuantities,
        difficulty: difficultyFromPayload,
        quantity: item.quantity,
      };
    }),
  );
}

export function summarizeProductionTokensByOrdersForDate(
  orders: BookingOrderForOperations[],
  deliveryDate: string,
  excludeOrderId?: string,
): number {
  return orders.reduce((sum, order) => {
    if (excludeOrderId && order.id === excludeOrderId) return sum;
    if (order.deliveryDate !== deliveryDate) return sum;
    if (!isActiveOrder(order.orderStatus)) return sum;
    return sum + summarizeProductionTokensByItems(order.items || []);
  }, 0);
}

function formatDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDateKey(dateKey: string, offsetDays: number): string | null {
  const parsed = parseLocalDateOnly(dateKey);
  if (!parsed) return null;
  parsed.setDate(parsed.getDate() + offsetDays);
  return formatDateKey(parsed);
}

export function summarizeCarryOverTokensForDate(
  orders: BookingOrderForOperations[],
  deliveryDate: string,
  windowDays: number = TOKEN_CARRY_OVER_DAYS,
): number {
  if (windowDays <= 0) return 0;

  let carryOver = 0;
  for (let dayOffset = 1; dayOffset <= windowDays; dayOffset += 1) {
    const previousDate = shiftDateKey(deliveryDate, -dayOffset);
    if (!previousDate) continue;
    const used = summarizeProductionTokensByOrdersForDate(orders, previousDate);
    const spare = Math.max(0, DAILY_PRODUCTION_TOKEN_LIMIT - used);
    carryOver += spare;
  }

  return carryOver;
}

export function evaluateProductionTokenCapacity(args: {
  orders: BookingOrderForOperations[];
  deliveryDate: string;
  incomingItems: BookingItemForOperations[];
  carryOverDays?: number;
  excludeOrderId?: string;
}) {
  const usedToday = summarizeProductionTokensByOrdersForDate(
    args.orders,
    args.deliveryDate,
    args.excludeOrderId,
  );
  const incoming = summarizeProductionTokensByItems(args.incomingItems);
  const carryOver = summarizeCarryOverTokensForDate(
    args.orders,
    args.deliveryDate,
    args.carryOverDays,
  );
  const allowed = DAILY_PRODUCTION_TOKEN_LIMIT + carryOver;
  const planned = usedToday + incoming;

  return {
    usedToday,
    incoming,
    carryOver,
    allowed,
    planned,
    overflow: Math.max(0, planned - allowed),
    isOverflow: planned > allowed,
  };
}

export function isDateClosedByTokenCapacity(args: {
  orders: BookingOrderForOperations[];
  deliveryDate: string;
  carryOverDays?: number;
}): boolean {
  if (!args.deliveryDate) return false;

  const capacity = evaluateProductionTokenCapacity({
    orders: args.orders,
    deliveryDate: args.deliveryDate,
    incomingItems: [],
    carryOverDays: args.carryOverDays,
  });

  return capacity.usedToday >= capacity.allowed;
}

export function summarizeCapacityByItems(
  items: BookingItemForOperations[],
): Record<CapacityBucket, number> {
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
  excludeOrderId?: string,
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
  incoming: Record<CapacityBucket, number>,
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

export function countConcurrentOrdersByTypeForSlot(args: {
  orders: BookingOrderForOperations[];
  deliveryDate: string;
  deliverySlot: string;
  orderType: SlotOrderType;
  excludeOrderId?: string;
}): number {
  return args.orders.filter((order) => {
    if (args.excludeOrderId && order.id === args.excludeOrderId) return false;
    if (order.deliveryDate !== args.deliveryDate) return false;
    if (order.deliverySlot !== args.deliverySlot) return false;
    if (!isActiveOrder(order.orderStatus)) return false;
    return inferOrderTypeFromOrder(order) === args.orderType;
  }).length;
}

export function checkSlotAvailability(
  date: string,
  time: string,
  orderType: SlotOrderType,
  options?: {
    orders?: BookingOrderForOperations[];
    excludeOrderId?: string;
    dateContext?: DateBlockingContext;
  },
): SlotAvailabilityStatus {
  if (!isWithinBusinessHours(date, time, new Date(), options?.dateContext)) {
    return "FULL";
  }

  const orders = options?.orders ?? [];
  const currentCount = countConcurrentOrdersByTypeForSlot({
    orders,
    deliveryDate: date,
    deliverySlot: time,
    orderType,
    excludeOrderId: options?.excludeOrderId,
  });

  const limit = getSlotLimitByOrderType(orderType);
  if (currentCount >= limit) return "FULL";
  if (currentCount >= Math.max(1, limit - 1)) return "ALMOST_FULL";
  return "AVAILABLE";
}
