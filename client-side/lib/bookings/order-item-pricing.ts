type OrderItemPricingLike = {
  basePrice?: number | null;
  selectedPrice?: number | null;
  lineTotal?: number | null;
  addOnTotal?: number | null;
  quantity?: number | null;
  notes?: string | null;
};

type RecapPriceSplitInput = {
  parsedSubtotal?: number | null;
  parsedUnitPrice?: number | null;
  quantity?: number | null;
  catalogBaseAmount?: number | null;
  computedAddOnAmount?: number | null;
  designAdjustmentAmount?: number | null;
};

export type RecapPriceSplit = {
  baseAmount: number;
  addOnAmount: number;
  totalAmount: number;
};

function normalizeMoney(value: number | null | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed));
}

function parseMoneyText(value: string | undefined): number {
  const digits = String(value || "").replace(/[^\d]/g, "");
  if (!digits) return 0;
  return normalizeMoney(Number(digits));
}

function getRecapPriceParts(item: OrderItemPricingLike) {
  const notes = String(item.notes || "");
  const unitMatch = notes.match(/harga\s+recap\s*:?\s*rp\s*([\d.\s\u00a0]+)/i);
  const subtotalMatch = notes.match(
    /subtotal\s+recap\s*:?\s*rp\s*([\d.\s\u00a0]+)/i,
  );

  return {
    unitPrice: parseMoneyText(unitMatch?.[1]),
    subtotal: parseMoneyText(subtotalMatch?.[1]),
  };
}

export function resolveOrderItemBaseAmount(
  item: OrderItemPricingLike,
): number {
  const quantity = Math.max(0, Math.round(Number(item.quantity) || 0));
  const recap = getRecapPriceParts(item);
  if (recap.unitPrice > 0 && quantity > 0) {
    return recap.unitPrice * quantity;
  }

  const selectedPrice = normalizeMoney(item.selectedPrice);
  if (selectedPrice > 0) return selectedPrice;

  return normalizeMoney(item.basePrice);
}

export function resolveOrderItemAddOnAmount(
  item: OrderItemPricingLike,
): number {
  const addOnTotal = normalizeMoney(item.addOnTotal);
  if (addOnTotal > 0) return addOnTotal;

  const recap = getRecapPriceParts(item);
  if (recap.subtotal <= 0) return 0;

  return Math.max(0, recap.subtotal - resolveOrderItemBaseAmount(item));
}

export function resolveOrderItemLineTotal(item: OrderItemPricingLike): number {
  const lineTotal = normalizeMoney(item.lineTotal);
  if (lineTotal > 0) return lineTotal;

  return resolveOrderItemBaseAmount(item) + resolveOrderItemAddOnAmount(item);
}

export function splitRecapPriceComponents(
  input: RecapPriceSplitInput,
): RecapPriceSplit {
  const quantity = Math.max(0, Math.round(Number(input.quantity) || 0));
  const parsedSubtotal = normalizeMoney(input.parsedSubtotal);
  const parsedUnitPrice = normalizeMoney(input.parsedUnitPrice);
  const catalogBaseAmount = normalizeMoney(input.catalogBaseAmount);
  const computedAddOnAmount = normalizeMoney(input.computedAddOnAmount);
  const designAdjustmentAmount = normalizeMoney(input.designAdjustmentAmount);
  const baseFromUnit =
    parsedUnitPrice > 0 && quantity > 0 ? parsedUnitPrice * quantity : 0;
  const baseAmount =
    baseFromUnit > 0
      ? baseFromUnit
      : catalogBaseAmount > 0
        ? catalogBaseAmount
        : parsedSubtotal;
  const totalAmount = Math.max(
    0,
    parsedSubtotal > 0
      ? parsedSubtotal + designAdjustmentAmount
      : baseAmount + computedAddOnAmount + designAdjustmentAmount,
  );
  const derivedAddOnAmount = Math.max(
    0,
    totalAmount - baseAmount - designAdjustmentAmount,
  );

  return {
    baseAmount,
    addOnAmount:
      derivedAddOnAmount > 0 ? derivedAddOnAmount : computedAddOnAmount,
    totalAmount,
  };
}
