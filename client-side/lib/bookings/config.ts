const DEFAULT_DOWN_PAYMENT_PERCENT = 50;
const DEFAULT_BLOCKED_DATES = [
  "2026-04-14",
  "2026-04-15",
  "2026-04-16",
  "2026-04-17",
  "2026-04-18",
  "2026-04-19",
  "2026-04-20",
  "2026-04-21",
  "2026-04-22",
  "2026-04-23",
];

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
  if (!raw) return DEFAULT_BLOCKED_DATES;

  const parsed = raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item));

  return Array.from(new Set([...DEFAULT_BLOCKED_DATES, ...parsed]));
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
