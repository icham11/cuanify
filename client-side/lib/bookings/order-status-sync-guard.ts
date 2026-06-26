export function shouldPreserveExistingOrderStatusForStaleSync(args: {
  incomingStatus?: string | null;
  incomingUpdatedAt?: string | null;
  existingStatus?: string | null;
  existingUpdatedAt?: Date | string | null;
}): boolean {
  const incomingStatus = String(args.incomingStatus || "").trim();
  const existingStatus = String(args.existingStatus || "").trim();

  if (!incomingStatus || !existingStatus || incomingStatus === existingStatus) {
    return false;
  }

  const incomingUpdatedAt = Date.parse(String(args.incomingUpdatedAt || ""));
  const existingUpdatedAt =
    args.existingUpdatedAt instanceof Date
      ? args.existingUpdatedAt.getTime()
      : Date.parse(String(args.existingUpdatedAt || ""));

  if (!Number.isFinite(incomingUpdatedAt) || !Number.isFinite(existingUpdatedAt)) {
    return false;
  }

  return incomingUpdatedAt < existingUpdatedAt;
}
