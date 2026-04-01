"use client";

import { type CalendarStatus, getCalendarStatusUI } from "@/lib/calendar/getCalendarStatus";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CalendarCellProps {
  /** The date label (day number) from react-big-calendar */
  label: string;
  /** The Date object for this cell */
  date: Date;
  /** Token usage for this date */
  usedToken: number;
  /** Max token capacity for this date */
  maxToken: number;
  /** Computed calendar status */
  status: CalendarStatus;
  /** Number of orders on this date */
  orderCount: number;
  /** Callback when the date is clicked */
  onDateClick?: (date: Date) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * CalendarCell renders a single date cell in the calendar.
 *
 * Displays:
 * - Date number
 * - Status badge (Passed / Full / Almost Full / Closed H-1)
 * - Token usage info (e.g., "580 / 600")
 * - Order count
 *
 * Disables interaction for PAST, FULL and CUTOFF statuses.
 */
export default function CalendarCell({
  label,
  date,
  usedToken,
  maxToken,
  status,
  orderCount,
  onDateClick,
}: CalendarCellProps) {
  const ui = getCalendarStatusUI(status);
  const isDisabled = ui.disabled;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDisabled || !onDateClick) return;
    onDateClick(date);
  };

  return (
    <div className="flex flex-col gap-0.5">
      {/* Date number */}
      <button
        type="button"
        onClick={handleClick}
        disabled={isDisabled}
        className={`w-fit rounded px-1 text-xs font-semibold transition ${
          isDisabled
            ? "cursor-not-allowed text-gray-400"
            : "text-gray-700 hover:bg-indigo-50 hover:text-indigo-700"
        }`}
        title={`${usedToken} / ${maxToken} token used`}
      >
        {label}
      </button>

      {/* Status badge */}
      {ui.label && (
        <span
          className={`inline-block w-fit rounded-sm px-1 py-px text-[9px] font-bold leading-tight ${
            status === "PAST"
              ? "bg-gray-200 text-gray-600"
              : status === "FULL"
              ? "bg-red-500 text-white"
              : status === "CUTOFF"
                ? "bg-rose-200 text-rose-700"
                : status === "WARNING"
                  ? "bg-amber-200 text-amber-800"
                  : ""
          }`}
        >
          {ui.label}
        </span>
      )}

      {/* Token usage info */}
      <span
        className={`text-[9px] font-medium leading-tight ${
          status === "PAST"
            ? "text-gray-500"
            : status === "FULL"
            ? "text-red-600"
            : status === "WARNING"
              ? "text-amber-700"
              : status === "CUTOFF"
                ? "text-rose-500"
                : "text-gray-400"
        }`}
        title={`${usedToken} / ${maxToken} token used`}
      >
        {usedToken} / {maxToken}
      </span>

      {/* Order count */}
      {orderCount > 0 && (
        <span className="text-[10px] font-semibold text-indigo-600">
          {orderCount} orders
        </span>
      )}
    </div>
  );
}
