import { isDateInPreviousMonth } from "@/lib/helpers/date-normalization";
import { normalizeOrderStatus } from "@/lib/bookings/order-status";

type LockedHistoricalOrderStatusTransitionArgs = {
  deliveryDate: unknown;
  currentStatus?: string | null;
  requestedStatus?: string | null;
  referenceDate?: Date;
};

export function canUpdateLockedHistoricalOrderStatus(
  args: LockedHistoricalOrderStatusTransitionArgs,
): boolean {
  if (!isDateInPreviousMonth(args.deliveryDate, args.referenceDate)) {
    return true;
  }

  const currentStatus = normalizeOrderStatus(args.currentStatus);
  const requestedStatus = normalizeOrderStatus(args.requestedStatus);

  if (currentStatus === requestedStatus) {
    return true;
  }

  return Boolean(requestedStatus);
}
