import {
  parseServiceChargeFromNotes,
  parseWholesaleDiscountAmountFromNotes,
  parseWholesaleDiscountPercentFromNotes,
} from "@/lib/bookings/delivery-rules";

export type OrderFinancialBreakdownInput = {
  basePrice?: number | null;
  designAdjustmentTotal?: number | null;
  addOnTotal?: number | null;
  productAdjustment?: number | null;
  nonProductAdjustment?: number | null;
  serviceCharge?: number | null;
  deliveryFee?: number | null;
  insuranceFee?: number | null;
  productSubtotal?: number | null;
  productDiscountAmount?: number | null;
  wholesaleDiscountPercent?: number | null;
  totalPrice?: number | null;
  legacyManualAdjustment?: number | null;
  notes?: string | null;
};

export type OrderFinancialBreakdown = {
  basePrice: number;
  designAdjustmentTotal: number;
  addOnTotal: number;
  productAdjustment: number;
  nonProductAdjustment: number;
  serviceCharge: number;
  deliveryFee: number;
  insuranceFee: number;
  productSubtotal: number;
  wholesaleDiscountPercent: number;
  productDiscountAmount: number;
  productNetRevenue: number;
  totalPrice: number;
  legacyManualAdjustment: number;
};

function normalizeMoney(value: number | null | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed);
}

export function calculateOrderFinancialBreakdown(
  input: OrderFinancialBreakdownInput,
): OrderFinancialBreakdown {
  const basePrice = Math.max(0, normalizeMoney(input.basePrice));
  const designAdjustmentTotal = normalizeMoney(input.designAdjustmentTotal);
  const addOnTotal = Math.max(0, normalizeMoney(input.addOnTotal));
  const productAdjustment = normalizeMoney(input.productAdjustment);
  const legacyManualAdjustment = normalizeMoney(input.legacyManualAdjustment);
  const nonProductAdjustment =
    input.nonProductAdjustment === null || input.nonProductAdjustment === undefined
      ? legacyManualAdjustment
      : normalizeMoney(input.nonProductAdjustment);
  const serviceCharge =
    input.serviceCharge === null || input.serviceCharge === undefined
      ? parseServiceChargeFromNotes(input.notes)
      : Math.max(0, normalizeMoney(input.serviceCharge));
  const deliveryFee = Math.max(0, normalizeMoney(input.deliveryFee));
  const insuranceFee = Math.max(0, normalizeMoney(input.insuranceFee));
  const totalPrice = Math.max(0, normalizeMoney(input.totalPrice));

  const wholesaleDiscountPercent = Math.max(
    0,
    Math.min(
      100,
      Number.isFinite(Number(input.wholesaleDiscountPercent))
        ? Number(input.wholesaleDiscountPercent)
        : parseWholesaleDiscountPercentFromNotes(input.notes),
    ),
  );
  const explicitOrParsedDiscountAmount =
    input.productDiscountAmount === null ||
    input.productDiscountAmount === undefined
      ? Math.max(
          0,
          parseWholesaleDiscountAmountFromNotes(input.notes) ||
            0,
        )
      : Math.max(0, normalizeMoney(input.productDiscountAmount));

  const fallbackProductSubtotal =
    basePrice + designAdjustmentTotal + addOnTotal + productAdjustment;
  const hasExplicitProductComponents =
    fallbackProductSubtotal > 0 ||
    (input.productSubtotal !== null && input.productSubtotal !== undefined);
  const fallbackNetProductRevenue = Math.max(
    0,
    totalPrice -
      deliveryFee -
      insuranceFee -
      serviceCharge -
      nonProductAdjustment,
  );

  let productSubtotal =
    input.productSubtotal === null || input.productSubtotal === undefined
      ? Math.max(
          0,
          hasExplicitProductComponents
            ? fallbackProductSubtotal
            : fallbackNetProductRevenue + explicitOrParsedDiscountAmount,
        )
      : Math.max(0, normalizeMoney(input.productSubtotal));

  let productDiscountAmount =
    explicitOrParsedDiscountAmount > 0
      ? explicitOrParsedDiscountAmount
      : Math.max(
          0,
          Math.round(productSubtotal * (wholesaleDiscountPercent / 100)),
        );

  if (
    !hasExplicitProductComponents &&
    totalPrice > 0 &&
    explicitOrParsedDiscountAmount === 0 &&
    wholesaleDiscountPercent > 0 &&
    wholesaleDiscountPercent < 100
  ) {
    productSubtotal = Math.round(
      fallbackNetProductRevenue / (1 - wholesaleDiscountPercent / 100),
    );
    productDiscountAmount = Math.max(
      0,
      productSubtotal - fallbackNetProductRevenue,
    );
  }

  const productNetRevenue = Math.max(0, productSubtotal - productDiscountAmount);
  const finalTotalPrice = Math.max(
    0,
    productNetRevenue +
      deliveryFee +
      insuranceFee +
      serviceCharge +
      nonProductAdjustment,
  );

  return {
    basePrice,
    designAdjustmentTotal,
    addOnTotal,
    productAdjustment,
    nonProductAdjustment,
    serviceCharge,
    deliveryFee,
    insuranceFee,
    productSubtotal,
    wholesaleDiscountPercent,
    productDiscountAmount,
    productNetRevenue,
    totalPrice: finalTotalPrice,
    legacyManualAdjustment,
  };
}
