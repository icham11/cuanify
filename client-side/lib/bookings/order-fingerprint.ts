type FingerprintItemInput = {
  category?: unknown;
  subcategory?: unknown;
  productName?: unknown;
  size?: unknown;
  quantity?: unknown;
  tokenDifficulty?: unknown;
  customTokenPerUnit?: unknown;
  basePrice?: unknown;
  selectedPrice?: unknown;
  cookiePrice?: unknown;
  designCount?: unknown;
  additionalDesignCount?: unknown;
  lineTotal?: unknown;
  addOns?: unknown;
  addOnQuantities?: unknown;
  addOnPriceOverrides?: unknown;
  addOnTotal?: unknown;
  notes?: unknown;
};

export type OrderFingerprintInput = {
  customerName?: unknown;
  customerPhone?: unknown;
  deliveryDate?: unknown;
  deliverySlot?: unknown;
  basePrice?: unknown;
  addOnTotal?: unknown;
  deliveryFee?: unknown;
  insuranceFee?: unknown;
  manualAdjustment?: unknown;
  dpPaidAmount?: unknown;
  finalPaidAmount?: unknown;
  totalPrice?: unknown;
  sales_channel?: unknown;
  salesChannel?: unknown;
  items?: FingerprintItemInput[] | unknown[];
};

export function normalizeBookingFingerprintText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function normalizeBookingReference(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}

export function normalizeBookingFingerprintPhone(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

export function normalizeFingerprintMoney(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed);
}

function normalizeFingerprintCount(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
}

function normalizeFingerprintRecordNumbers(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];

  return Object.entries(value as Record<string, unknown>)
    .map(([key, entryValue]) => ({
      key: normalizeBookingFingerprintText(key),
      value: normalizeFingerprintMoney(entryValue),
    }))
    .filter((entry) => entry.key.length > 0 || entry.value !== 0)
    .sort((left, right) => left.key.localeCompare(right.key));
}

export function buildOrderFingerprint(order: OrderFingerprintInput): string {
  const items = (Array.isArray(order.items) ? order.items : []) as FingerprintItemInput[];

  return JSON.stringify({
    customerName: normalizeBookingFingerprintText(order.customerName),
    customerPhone: normalizeBookingFingerprintPhone(order.customerPhone),
    deliveryDate:
      normalizeBookingFingerprintText(order.deliveryDate).slice(0, 10) ||
      String(order.deliveryDate ?? ""),
    deliverySlot: normalizeBookingFingerprintText(order.deliverySlot),
    basePrice: normalizeFingerprintMoney(order.basePrice),
    addOnTotal: normalizeFingerprintMoney(order.addOnTotal),
    deliveryFee: normalizeFingerprintMoney(order.deliveryFee),
    insuranceFee: normalizeFingerprintMoney(order.insuranceFee),
    manualAdjustment: normalizeFingerprintMoney(order.manualAdjustment),
    dpPaidAmount: normalizeFingerprintMoney(order.dpPaidAmount),
    finalPaidAmount: normalizeFingerprintMoney(order.finalPaidAmount),
    totalPrice: normalizeFingerprintMoney(order.totalPrice),
    salesChannel: normalizeBookingFingerprintText(
      order.sales_channel ?? order.salesChannel,
    ),
    items: items.map((item) => ({
      category: normalizeBookingFingerprintText(item?.category),
      subcategory: normalizeBookingFingerprintText(item?.subcategory),
      productName: normalizeBookingFingerprintText(item?.productName),
      size: normalizeBookingFingerprintText(item?.size),
      quantity: normalizeFingerprintCount(item?.quantity),
      tokenDifficulty: normalizeBookingFingerprintText(item?.tokenDifficulty),
      customTokenPerUnit: normalizeFingerprintMoney(item?.customTokenPerUnit),
      basePrice: normalizeFingerprintMoney(item?.basePrice),
      selectedPrice: normalizeFingerprintMoney(item?.selectedPrice),
      cookiePrice: normalizeFingerprintMoney(item?.cookiePrice),
      designCount: normalizeFingerprintCount(item?.designCount),
      additionalDesignCount: normalizeFingerprintCount(
        item?.additionalDesignCount,
      ),
      lineTotal: normalizeFingerprintMoney(item?.lineTotal),
      addOns: Array.isArray(item?.addOns)
        ? [...item.addOns]
            .map((entry) => normalizeBookingFingerprintText(entry))
            .filter(Boolean)
            .sort((left, right) => left.localeCompare(right))
        : [],
      addOnQuantities: normalizeFingerprintRecordNumbers(item?.addOnQuantities),
      addOnPriceOverrides: normalizeFingerprintRecordNumbers(
        item?.addOnPriceOverrides,
      ),
      addOnTotal: normalizeFingerprintMoney(item?.addOnTotal),
      notes: normalizeBookingFingerprintText(item?.notes),
    })),
  });
}
