const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

export function isValidEmail(value: unknown): boolean {
  const normalized = normalizeEmail(value);
  return normalized.length > 0 && EMAIL_REGEX.test(normalized);
}
