"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

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

function formatMonthLongLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) return monthKey;
  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
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
  const sortedMonthKeys = useMemo(
    () => monthKeys.filter(isMonthKey).slice().sort((left, right) => left.localeCompare(right)),
    [monthKeys],
  );
  const selectedMonthIndex = sortedMonthKeys.indexOf(value);
  const previousMonthKey =
    selectedMonthIndex > 0 ? sortedMonthKeys[selectedMonthIndex - 1] : null;
  const nextMonthKey =
    selectedMonthIndex >= 0 && selectedMonthIndex < sortedMonthKeys.length - 1
      ? sortedMonthKeys[selectedMonthIndex + 1]
      : null;
  const currentMonthKey = toMonthKey(new Date());
  const isSelectedCurrentMonth = value === currentMonthKey;
  const quickYearOptions = useMemo(() => {
    const candidates = [visibleYear - 1, visibleYear, visibleYear + 1];
    return candidates.filter((year, index) => {
      if (year < minYear || year > maxYear) return false;
      return candidates.indexOf(year) === index;
    });
  }, [maxYear, minYear, visibleYear]);

  return (
    <div ref={rootRef} className="relative">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => previousMonthKey && onChange(previousMonthKey)}
          disabled={!previousMonthKey}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#e2d0c2] bg-[#fffdfb] text-[#8c6148] shadow-[0_6px_18px_-16px_rgba(98,57,35,0.22)] transition hover:border-[#cf9f7d] hover:bg-[#fff8f2] hover:text-[#cb6531] disabled:cursor-not-allowed disabled:opacity-45 sm:h-11 sm:w-11"
          aria-label="Bulan lalu"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          className={cn(
            "inline-flex h-10 w-full items-center justify-between gap-3 rounded-xl border border-[#dfc9b7] bg-[#fffdfb] px-3.5 text-left text-sm font-semibold text-[#2f1e13] shadow-[0_6px_18px_-16px_rgba(98,57,35,0.22)] transition hover:border-[#cf9f7d] hover:bg-[#fff8f2] sm:h-11 sm:px-4",
            buttonClassName,
          )}
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            <CalendarDays className="h-4 w-4 shrink-0 text-[#cb6531]" />
            <span className="truncate">{formatLabel(value)}</span>
          </span>
          <span className="inline-flex items-center gap-2">
            {isSelectedCurrentMonth ? (
              <span className="rounded-full bg-[#e6f4ea] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#237247]">
                Sekarang
              </span>
            ) : null}
            <span className="rounded-full bg-[#f6e7da] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#a55527]">
              Bulan
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => nextMonthKey && onChange(nextMonthKey)}
          disabled={!nextMonthKey}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#e2d0c2] bg-[#fffdfb] text-[#8c6148] shadow-[0_6px_18px_-16px_rgba(98,57,35,0.22)] transition hover:border-[#cf9f7d] hover:bg-[#fff8f2] hover:text-[#cb6531] disabled:cursor-not-allowed disabled:opacity-45 sm:h-11 sm:w-11"
          aria-label="Bulan depan"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {isOpen ? (
        <div
          className={cn(
            "absolute z-40 mt-2 w-[min(96vw,24rem)] overflow-hidden rounded-[26px] border border-[#e6d4c7] bg-[#fffaf6] shadow-[0_22px_52px_-30px_rgba(57,31,17,0.38)] sm:w-[min(96vw,28rem)] sm:rounded-[28px]",
            align === "right" ? "right-0" : "left-0",
            popoverClassName,
          )}
        >
          <div className="border-b border-[#ecddd2] bg-[#fff8f3] px-3.5 py-3.5 sm:px-4 sm:py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="inline-flex items-center rounded-full border border-[#ead7ca] bg-[#fffdfb] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#b16a3f]">
                  Kalender bulan
                </p>
                <p className="mt-2.5 text-lg font-extrabold leading-tight text-[#23150f]">
                  {formatMonthLongLabel(value)}
                </p>
                <p className="mt-1 text-[11px] leading-5 text-[#9b6c4f]">
                  Pilih bulan yang ingin dilihat, termasuk bulan sebelumnya dan bulan yang akan datang.
                </p>
              </div>

              <div className="rounded-[18px] border border-[#ead7ca] bg-[#fffdfb] px-3 py-2 text-right">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#b58872]">
                  Tahun Aktif
                </p>
                <p className="mt-1 text-lg font-extrabold text-[#23150f]">
                  {formatYearLabel(visibleYear)}
                </p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-2.5">
              <button
                type="button"
                onClick={() => setVisibleYear((current) => Math.max(minYear, current - 1))}
                disabled={visibleYear <= minYear}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#e2d0c2] bg-[#fffdfb] text-[#8c6148] transition hover:border-[#cf9f7d] hover:text-[#cb6531] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="flex flex-1 flex-wrap items-center justify-center gap-2">
                {quickYearOptions.map((year) => {
                  const isVisible = year === visibleYear;
                  return (
                    <button
                      key={year}
                      type="button"
                      onClick={() => setVisibleYear(year)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-bold transition",
                        isVisible
                          ? "border-[#cf7442] bg-[#cf7442] text-white"
                          : "border-[#e2d0c2] bg-[#fffdfb] text-[#8c6148] hover:border-[#cf9f7d] hover:text-[#cb6531]",
                      )}
                    >
                      {year}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setVisibleYear((current) => Math.min(maxYear, current + 1))}
                disabled={visibleYear >= maxYear}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#e2d0c2] bg-[#fffdfb] text-[#8c6148] transition hover:border-[#cf9f7d] hover:text-[#cb6531] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="px-3.5 pb-3.5 pt-3.5 sm:px-4 sm:pb-4 sm:pt-4">
            <div className="mb-3 grid grid-cols-4 gap-2">
              {["Jan", "Apr", "Jul", "Okt"].map((quarter) => (
                <div
                  key={quarter}
                  className="rounded-full border border-[#efe1d6] bg-[#fffdfb] px-2 py-1 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-[#b58872]"
                >
                  {quarter}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 12 }, (_, monthIndex) => {
                const monthKey = `${visibleYear}-${String(monthIndex + 1).padStart(2, "0")}`;
                const isSelected = monthKey === value;
                const isAvailable = availableMonthKeySet.has(monthKey);
                const isCurrentMonth = monthKey === currentMonthKey;

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
                      "group rounded-[18px] border px-3 py-3 text-left transition sm:rounded-[20px]",
                      isSelected
                        ? "border-[#cf7442] bg-[#cf7442] text-white"
                        : isCurrentMonth && isAvailable
                          ? "border-[#74b68a] bg-[#edf8f1] text-[#205b37]"
                          : isAvailable
                            ? "border-[#e6d4c7] bg-[#fffdfb] text-[#2f1e13] hover:border-[#cf9f7d] hover:bg-[#fff7f0]"
                            : "border-[#efe2d8] bg-[#fbf3ed] text-[#c5a693] opacity-55",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold">
                        {formatMonthShortLabel(monthIndex)}
                      </span>
                      {isSelected ? <Check className="h-4 w-4" /> : null}
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <p
                        className={cn(
                          "text-[10px]",
                          isSelected
                            ? "text-white/80"
                            : isCurrentMonth && isAvailable
                              ? "text-[#2f7f49]"
                              : isAvailable
                                ? "text-[#a06f52]"
                                : "text-[#c5a693]",
                        )}
                      >
                        {visibleYear}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-[#ecddd2] bg-[#fff8f3] px-3.5 py-3.5 sm:px-4 sm:py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[#d6ebdc] bg-[#edf8f1] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#2f7f49]">
                  Highlight hijau = bulan sekarang
                </span>
                <span className="rounded-full border border-[#f0d9ca] bg-[#fff2e8] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#a55527]">
                  Oranye = bulan terpilih
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (availableMonthKeySet.has(currentMonthKey)) {
                    onChange(currentMonthKey);
                  }
                  setVisibleYear(new Date().getFullYear());
                  setIsOpen(false);
                }}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-[#e2d0c2] bg-[#fffdfb] px-4 text-sm font-semibold text-[#8c6148] transition hover:border-[#cf9f7d] hover:text-[#cb6531]"
              >
                Kembali ke bulan ini
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
