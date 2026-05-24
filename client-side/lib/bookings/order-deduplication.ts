import { getLatestOrderActivityTimestamp, type OrderActivityLike } from "@/lib/bookings/order-activity";

export interface DeduplicationComparableOrder extends OrderActivityLike {
  bookingCode?: string | null;
  resi?: string | null;
  shippingReferenceId?: string | null;
}

export function choosePreferredOrderCandidate<T extends DeduplicationComparableOrder>(
  current: T,
  candidate: T,
): T {
  const currentLatest = getLatestOrderActivityTimestamp(current);
  const candidateLatest = getLatestOrderActivityTimestamp(candidate);

  if (candidateLatest > currentLatest) return candidate;
  if (currentLatest > candidateLatest) return current;

  const currentIdentityScore =
    (current.bookingCode ? 1 : 0) +
    (current.resi ? 1 : 0) +
    (current.shippingReferenceId ? 1 : 0);
  const candidateIdentityScore =
    (candidate.bookingCode ? 1 : 0) +
    (candidate.resi ? 1 : 0) +
    (candidate.shippingReferenceId ? 1 : 0);

  if (candidateIdentityScore > currentIdentityScore) return candidate;
  return current;
}
