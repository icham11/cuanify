const DEFAULT_DOWN_PAYMENT_PERCENT = 50;

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_DOWN_PAYMENT_PERCENT;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function parseDownPaymentPercent(): number {
  const raw = process.env.NEXT_PUBLIC_BAKERY_DOWN_PAYMENT_PERCENT;
  if (!raw) return DEFAULT_DOWN_PAYMENT_PERCENT;
  return clampPercent(Number(raw));
}

function parseBlockedDates(): string[] {
  const raw = process.env.NEXT_PUBLIC_BAKERY_BLOCKED_DATES;
  if (!raw) return [];

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item));
}

export const BAKERY_DOWN_PAYMENT_PERCENT = parseDownPaymentPercent();
export const BAKERY_DOWN_PAYMENT_RATIO = BAKERY_DOWN_PAYMENT_PERCENT / 100;
export const BAKERY_BLOCKED_DATES = parseBlockedDates();

export function calculateDownPayment(totalPrice: number): number {
  return Math.round(
    Math.max(0, Number(totalPrice) || 0) * BAKERY_DOWN_PAYMENT_RATIO,
  );
}

export function getDownPaymentLabel(): string {
  return `Down Payment (${BAKERY_DOWN_PAYMENT_PERCENT}%)`;
}
