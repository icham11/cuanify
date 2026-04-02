"use client";

import {
  type CalendarStatus,
  getCalendarStatusUI,
} from "@/lib/calendar/getCalendarStatus";

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getBarColor(ratio: number): string {
  if (ratio >= 1) return "bg-red-500";
  if (ratio >= 0.8) return "bg-amber-400";
  return "bg-emerald-500";
}

function getTokenTextColor(status: CalendarStatus): string {
  if (status === "PAST") return "text-gray-400";
  if (status === "BLOCKED") return "text-rose-500";
  if (status === "FULL") return "text-red-600";
  if (status === "WARNING") return "text-amber-700";
  if (status === "CUTOFF") return "text-rose-500";
  return "text-gray-400";
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * CalendarCell renders a single date cell in the calendar.
 *
 * Displays:
 * - Date number
 * - Status badge (Passed / Full / Almost Full / Closed H-1)
 * - Token progress bar with color coding
 * - Token usage info (e.g., "580 / 600")
 * - Remaining token count
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
  const safeMax = maxToken > 0 ? maxToken : 600;
  const ratio = Math.min(1, usedToken / safeMax);
  const barColor = getBarColor(ratio);
  const remaining = safeMax - usedToken;
  const tooltipText = `Digunakan: ${usedToken} / ${safeMax} — Sisa: ${remaining}`;

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
        title={tooltipText}
        className={`w-fit rounded px-1 text-xs font-semibold transition ${
          isDisabled
            ? "cursor-not-allowed text-gray-400"
            : "text-gray-700 hover:bg-indigo-50 hover:text-indigo-700"
        }`}
      >
        {label}
      </button>

      {/* Status badge */}
      {ui.label && (
        <span
          className={`inline-block w-fit rounded-sm px-1 py-px text-[9px] font-bold leading-tight ${
            status === "PAST"
              ? "bg-gray-200 text-gray-600"
              : status === "BLOCKED"
                ? "bg-rose-200 text-rose-700"
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

      {/* Token progress bar */}
      {status !== "PAST" && (
        <div
          className="h-1 w-full overflow-hidden rounded-full bg-gray-200"
          title={tooltipText}
        >
          <div
            className={`h-1 rounded-full transition-all duration-300 ${barColor}`}
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>
      )}

      {/* Token usage info */}
      <span
        className={`text-[9px] font-medium leading-tight ${getTokenTextColor(status)}`}
        title={tooltipText}
      >
        {usedToken} / {safeMax}
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
