"use client";

import {
  type CalendarStatus,
  getCalendarStatusUI,
} from "@/lib/calendar/getCalendarStatus";

export interface CalendarCellProps {
  label: string;
  date: Date;
  usedToken: number;
  maxToken: number;
  status: CalendarStatus;
  orderCount: number;
  onDateClick?: (date: Date) => void;
}

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

function getOrderIndicatorColor(status: CalendarStatus): string {
  if (status === "PAST") return "bg-[#cfc7c1]";
  if (status === "BLOCKED") return "bg-[#f0a6a0]";
  if (status === "FULL") return "bg-[#d7662d]";
  if (status === "WARNING") return "bg-[#d3a423]";
  if (status === "CUTOFF") return "bg-[#d24f40]";
  return "bg-[#cb6531]";
}

function getCompactStatusLabel(status: CalendarStatus): string {
  switch (status) {
    case "PAST":
      return "Lewat";
    case "BLOCKED":
      return "Libur";
    case "FULL":
      return "Penuh";
    case "CUTOFF":
      return "H-1";
    case "WARNING":
      return "80%+";
    default:
      return "";
  }
}

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
  const safeMax = maxToken > 0 ? maxToken : 500;
  const ratio = Math.min(1, usedToken / safeMax);
  const barColor = getBarColor(ratio);
  const remaining = safeMax - usedToken;
  const tooltipText = `Digunakan: ${usedToken} / ${safeMax} | Sisa: ${remaining}`;
  const orderLabel = orderCount === 1 ? "1 order" : `${orderCount} order`;
  const compactStatusLabel = getCompactStatusLabel(status);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onDateClick) return;
    onDateClick(date);
  };

  return (
    <div className="flex min-h-[44px] w-full flex-col overflow-hidden rounded-md border border-transparent px-0.5 py-0.5 sm:min-h-[64px] sm:px-1 sm:py-1">
      <div className="flex items-start justify-between gap-1">
        <button
          type="button"
          onClick={handleClick}
          title={tooltipText}
          className={`max-w-full rounded-md px-0.5 text-left text-[9px] font-semibold leading-none transition sm:px-1 sm:text-[13px] ${
            ui.disabled
              ? "text-[#8d837c] hover:bg-[#f3ece7]"
              : "text-[#2f1e13] hover:bg-[#fff0de]"
          }`}
        >
          {label}
        </button>
      </div>

      <div className="mt-0.5 min-h-[16px]">
        {orderCount > 0 ? (
          <span
            className="inline-flex h-3.5 min-w-[14px] items-center justify-center gap-1 rounded-full border border-white/70 bg-white/95 px-1 text-[6px] font-bold leading-none text-[#5b3a23] shadow-[0_1px_3px_rgba(47,30,19,0.12)] sm:h-4 sm:min-w-[16px] sm:text-[8px]"
            title={orderLabel}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${getOrderIndicatorColor(status)}`}
            />
            {orderCount}
          </span>
        ) : (
          <span className="block h-4" aria-hidden="true" />
        )}
      </div>

      <div className="mt-0.5 min-h-[16px]">
        {ui.label ? (
          <span
            className={`inline-flex max-w-full items-center rounded-md px-1 py-0.5 text-[6px] font-bold leading-none sm:px-1.5 sm:text-[8px] ${
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
            {compactStatusLabel}
          </span>
        ) : null}
      </div>

      <div className="mt-auto space-y-1">
        {status !== "PAST" ? (
          <div
            className="h-1 w-full overflow-hidden rounded-full bg-[#eadbcf]"
            title={tooltipText}
          >
            <div
              className={`h-1 rounded-full transition-all duration-300 ${barColor}`}
              style={{ width: `${Math.round(ratio * 100)}%` }}
            />
          </div>
        ) : (
          <div
            className="h-1 w-full overflow-hidden rounded-full bg-[#e9e2dc]"
            title={tooltipText}
          >
            <div
              className="h-1 rounded-full bg-[#b7aea6]"
              style={{ width: `${Math.round(ratio * 100)}%` }}
            />
          </div>
        )}

        <span
          className={`block truncate text-[6px] font-semibold leading-none sm:text-[8px] ${getTokenTextColor(status)}`}
          title={tooltipText}
        >
          {usedToken}/{safeMax}
        </span>
      </div>
    </div>
  );
}
