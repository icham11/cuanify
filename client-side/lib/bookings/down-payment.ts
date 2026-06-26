function normalizeMoney(value: unknown): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.max(0, Math.round(numericValue));
}

export function clampExplicitDownPaymentAmount(
  amount: unknown,
  totalPrice: unknown,
): number {
  const normalizedAmount = normalizeMoney(amount);
  const normalizedTotal = normalizeMoney(totalPrice);

  if (normalizedTotal <= 0) return normalizedAmount;
  return Math.min(normalizedTotal, normalizedAmount);
}

export function resolveStoredDownPaymentAmount(args: {
  downPaymentAmount?: unknown;
  dpPaidAmount?: unknown;
  totalPrice?: unknown;
}): number {
  const explicitAmount =
    args.downPaymentAmount !== undefined && args.downPaymentAmount !== null
      ? args.downPaymentAmount
      : args.dpPaidAmount;

  return clampExplicitDownPaymentAmount(explicitAmount, args.totalPrice);
}
