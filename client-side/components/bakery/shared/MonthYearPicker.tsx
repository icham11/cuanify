"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight } from "lucide-react";

function cn(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(" ");
}

function isMonthKey(value: string | null | undefined): value is string {
  return /^\d{4}-\d{2}$/.test(value || "");
}

function toMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function buildSelectableMonthKeys(args?: {
  monthsBack?: number;
  monthsForward?: number;
  includeMonthKeys?: Array<string | null | undefined>;
  anchorDate?: Date;
}) {
  const {
    monthsBack = 18,
    monthsForward = 5,
    includeMonthKeys = [],
    anchorDate = new Date(),
  } = args ?? {};

  const monthKeys = new Set<string>();

  for (let offset = -monthsBack; offset <= monthsForward; offset += 1) {
    monthKeys.add(
      toMonthKey(new Date(anchorDate.getFullYear(), anchorDate.getMonth() + offset, 1)),
    );
  }

  includeMonthKeys.forEach((monthKey) => {
    if (isMonthKey(monthKey)) {
      monthKeys.add(monthKey);
    }
  });

  return Array.from(monthKeys).sort((left, right) => left.localeCompare(right));
}

function formatYearLabel(year: number) {
  return String(year);
}

function formatMonthShortLabel(monthIndex: number) {
  return new Intl.DateTimeFormat("id-ID", { month: "short" }).format(
    new Date(2026, monthIndex, 1),
  );
}

type MonthYearPickerProps = {
  value: string;
  onChange: (monthKey: string) => void;
  monthKeys: string[];
  formatLabel: (monthKey: string) => string;
  buttonClassName?: string;
  popoverClassName?: string;
  align?: "left" | "right";
};

export default function MonthYearPicker({
  value,
  onChange,
  monthKeys,
  formatLabel,
  buttonClassName,
  popoverClassName,
  align = "left",
}: MonthYearPickerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const availableYears = useMemo(() => {
    const years = Array.from(
      new Set(
        monthKeys
          .filter(isMonthKey)
          .map((monthKey) => Number(monthKey.slice(0, 4)))
          .filter((year) => Number.isInteger(year) && year > 0),
      ),
    ).sort((left, right) => left - right);

    if (years.length > 0) return years;
    return [new Date().getFullYear()];
  }, [monthKeys]);
  const selectedYear = Number(value.slice(0, 4)) || new Date().getFullYear();
  const [visibleYear, setVisibleYear] = useState(selectedYear);

  useEffect(() => {
    setVisibleYear(selectedYear);
  }, [selectedYear]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const minYear = availableYears[0] ?? selectedYear;
  const maxYear = availableYears[availableYears.length - 1] ?? selectedYear;
  const availableMonthKeySet = useMemo(() => new Set(monthKeys), [monthKeys]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className={cn(
          "inline-flex h-11 w-full items-center justify-between gap-3 rounded-xl border border-[#dfc9b7] bg-white px-4 text-left text-sm font-semibold text-[#2f1e13] shadow-[0_6px_18px_-16px_rgba(98,57,35,0.28)] transition hover:border-[#cf9f7d] hover:bg-[#fffaf6]",
          buttonClassName,
        )}
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0 text-[#cb6531]" />
          <span className="truncate">{formatLabel(value)}</span>
        </span>
        <span className="rounded-full bg-[#f6e7da] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#a55527]">
          Bulan
        </span>
      </button>

      {isOpen ? (
        <div
          className={cn(
            "absolute z-40 mt-2 w-[min(92vw,22rem)] rounded-[24px] border border-[#e6d4c7] bg-[#fffaf6] p-4 shadow-[0_24px_60px_-28px_rgba(57,31,17,0.45)]",
            align === "right" ? "right-0" : "left-0",
            popoverClassName,
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setVisibleYear((current) => Math.max(minYear, current - 1))}
              disabled={visibleYear <= minYear}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#e2d0c2] bg-white text-[#8c6148] transition hover:border-[#cf9f7d] hover:text-[#cb6531] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#b58872]">
                Pilih Periode
              </p>
              <p className="mt-1 text-base font-extrabold text-[#23150f]">
                {formatYearLabel(visibleYear)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setVisibleYear((current) => Math.min(maxYear, current + 1))}
              disabled={visibleYear >= maxYear}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#e2d0c2] bg-white text-[#8c6148] transition hover:border-[#cf9f7d] hover:text-[#cb6531] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {Array.from({ length: 12 }, (_, monthIndex) => {
              const monthKey = `${visibleYear}-${String(monthIndex + 1).padStart(2, "0")}`;
              const isSelected = monthKey === value;
              const isAvailable = availableMonthKeySet.has(monthKey);

              return (
                <button
                  key={monthKey}
                  type="button"
                  disabled={!isAvailable}
                  onClick={() => {
                    onChange(monthKey);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "group rounded-[18px] border px-3 py-3 text-left transition",
                    isSelected
                      ? "border-[#cf7442] bg-[#cf7442] text-white shadow-[0_14px_26px_-18px_rgba(184,89,44,0.55)]"
                      : isAvailable
                        ? "border-[#e6d4c7] bg-white text-[#2f1e13] hover:border-[#cf9f7d] hover:bg-[#fff2e8]"
                        : "border-[#efe2d8] bg-[#fbf3ed] text-[#c5a693] opacity-55",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold">
                      {formatMonthShortLabel(monthIndex)}
                    </span>
                    {isSelected ? <Check className="h-4 w-4" /> : null}
                  </div>
                  <p
                    className={cn(
                      "mt-1 text-[10px]",
                      isSelected
                        ? "text-white/80"
                        : isAvailable
                          ? "text-[#a06f52]"
                          : "text-[#c5a693]",
                    )}
                  >
                    {visibleYear}
                  </p>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              const currentMonth = toMonthKey(new Date());
              if (availableMonthKeySet.has(currentMonth)) {
                onChange(currentMonth);
              }
              setVisibleYear(new Date().getFullYear());
              setIsOpen(false);
            }}
            className="mt-4 inline-flex h-10 items-center justify-center rounded-xl border border-[#e2d0c2] bg-white px-4 text-sm font-semibold text-[#8c6148] transition hover:border-[#cf9f7d] hover:text-[#cb6531]"
          >
            Kembali ke bulan ini
          </button>
        </div>
      ) : null}
    </div>
  );
}
