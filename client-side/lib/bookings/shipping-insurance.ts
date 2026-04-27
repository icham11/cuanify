import type { ShippingProvider, ShippingQuote } from "@/lib/bookings/shipping-types";

export const SHIPPING_INSURANCE_THRESHOLD_IDR = 2_000_000;
export const SHIPPING_INSURANCE_RATE = 0.003;
export const SHIPPING_INSURANCE_ADMIN_FEE = 5_000;

const INSURED_PROVIDERS = new Set<ShippingProvider>(["JNE", "JNT"]);

export function shouldApplyShippingInsurance(args: {
  provider?: string | null;
  transactionValue: number;
}): boolean {
  const provider = (args.provider || "").toUpperCase();
  return (
    INSURED_PROVIDERS.has(provider as ShippingProvider) &&
    args.transactionValue > SHIPPING_INSURANCE_THRESHOLD_IDR
  );
}

export function calculateShippingInsuranceFee(args: {
  provider?: string | null;
  transactionValue: number;
}): number {
  const value = Math.max(0, Number(args.transactionValue) || 0);
  if (!shouldApplyShippingInsurance({ provider: args.provider, transactionValue: value })) {
    return 0;
  }
  return Math.ceil(value * SHIPPING_INSURANCE_RATE + SHIPPING_INSURANCE_ADMIN_FEE);
}

export function applyShippingInsuranceToQuote(
  quote: ShippingQuote,
  transactionValue: number,
): ShippingQuote {
  const insuranceFee = calculateShippingInsuranceFee({
    provider: quote.provider,
    transactionValue,
  });

  return {
    ...quote,
    insuranceFee,
    priceWithoutInsurance: quote.price,
    price: quote.price + insuranceFee,
  };
}
