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
  return "text-[#8a6a54]";
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * CalendarCell renders a single date cell in the calendar.
 *
 * Displays:
 * - Date number
 * - Status badge (Passed / Full / Almost Full / Closed H-1)
 * - Token progress bar with color coding
 * - Token usage info (e.g., "480 / 500")
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
  const safeMax = maxToken > 0 ? maxToken : 500;
  const ratio = Math.min(1, usedToken / safeMax);
  const barColor = getBarColor(ratio);
  const remaining = safeMax - usedToken;
  const tooltipText = `Digunakan: ${usedToken} / ${safeMax} — Sisa: ${remaining}`;
  const orderLabel = `${orderCount} order`;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDisabled || !onDateClick) return;
    onDateClick(date);
  };

  return (
    <div className="flex min-h-[58px] flex-col gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isDisabled}
        title={tooltipText}
        className={`w-fit rounded-md px-1.5 text-left text-[13px] font-semibold leading-none transition ${
          isDisabled
            ? "cursor-not-allowed text-[#b7aea6]"
            : "text-[#2f1e13] hover:bg-[#fff0de]"
        }`}
      >
        {label}
      </button>

      {ui.label ? (
        <span
          className={`inline-flex w-fit rounded-md px-1.5 py-0.5 text-[9px] font-bold leading-none ${
            status === "PAST"
              ? "bg-[#ece7e2] text-[#8d837c]"
              : status === "BLOCKED"
                ? "bg-[#ffe4e4] text-[#dc6e59]"
                : status === "FULL"
                  ? "bg-[#ffedd6] text-[#d7662d]"
                  : status === "CUTOFF"
                    ? "bg-[#ffdede] text-[#d24f40]"
                    : "bg-[#fff0c9] text-[#9c6a12]"
          }`}
        >
          {ui.label}
        </span>
      ) : null}

      {status !== "PAST" ? (
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-[#eadbcf]"
          title={tooltipText}
        >
          <div
            className={`h-1.5 rounded-full transition-all duration-300 ${barColor}`}
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>
      ) : null}

      <div className="mt-auto flex items-end justify-between gap-1">
        <span
          className={`text-[9px] font-semibold leading-none ${getTokenTextColor(status)}`}
          title={tooltipText}
        >
          {usedToken}/{safeMax}
        </span>
        {orderCount > 0 ? (
          <span className="inline-flex rounded-md bg-[#5b3a23] px-1.5 py-0.5 text-[9px] font-bold leading-none text-white">
            {orderLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}
