"use client";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { UseFormRegister, FieldErrors, UseFormSetValue } from "react-hook-form";
import type { BookingFormInput } from "./booking-form-schema";
import type { SlotAvailabilityStatus } from "@/lib/bookings/operations";
import { formatIsoDateToIdLabel, slotStatusLabel } from "./booking-form-helpers";

export interface CustomerSectionProps {
  register: UseFormRegister<BookingFormInput>;
  errors: FieldErrors<BookingFormInput>;
  setValue: UseFormSetValue<BookingFormInput>;
  deliveryDate?: string;
  deliverySlots: string[];
  slotStatusByTime: Map<string, SlotAvailabilityStatus>;
  isCalendarCapacityLoading: boolean;
  calendarDateError: string | null;
  blockedDates: string[];
  isBlockedDate: boolean;
  slotProfileLabel: string;
  slotLimitPerHour: number;
  slotAvailability: Array<{ slot: string; status: SlotAvailabilityStatus; used: number }>;
  shouldShowDateRecommendations: boolean;
  dbWillExceed: boolean;
  isRecommendationLoading: boolean;
  suggestedDates: Array<{ dateKey: string; remaining: number }>;
  handleSuggestionClick: (dateStr: string) => void;
}

export default function CustomerSection({
  register,
  errors,
  setValue,
  deliveryDate,
  deliverySlots,
  slotStatusByTime,
  isCalendarCapacityLoading,
  calendarDateError,
  blockedDates,
  isBlockedDate,
  slotProfileLabel,
  slotLimitPerHour,
  slotAvailability,
  shouldShowDateRecommendations,
  dbWillExceed,
  isRecommendationLoading,
  suggestedDates,
  handleSuggestionClick,
}: CustomerSectionProps) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium text-gray-700">
          Customer Name
          <Input
            placeholder="Nadia Pratama"
            {...register("customerName")}
          />
          {errors.customerName && (
            <span className="text-xs text-rose-500">
              {errors.customerName.message}
            </span>
          )}
        </label>
        <label className="grid gap-2 text-sm font-medium text-gray-700">
          Phone Number
          <Input
            placeholder="08xxxxxxxxxx"
            {...register("phoneNumber")}
          />
          {errors.phoneNumber && (
            <span className="text-xs text-rose-500">
              {errors.phoneNumber.message}
            </span>
          )}
        </label>
        <label className="grid gap-2 text-sm font-medium text-gray-700">
          Delivery Date
          <Input type="date" {...register("deliveryDate")} />
          {errors.deliveryDate && (
            <span className="text-xs text-rose-500">
              {errors.deliveryDate.message}
            </span>
          )}
          {deliveryDate && isCalendarCapacityLoading ? (
            <span className="text-xs text-slate-500">
              Mengecek kapasitas produksi...
            </span>
          ) : null}
          {deliveryDate && calendarDateError ? (
            <span className="text-xs font-medium text-rose-600">
              {calendarDateError}
            </span>
          ) : null}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
              Kalender Libur
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {blockedDates.map((blockedDate) => {
                const active = deliveryDate === blockedDate;
                return (
                  <button
                    key={blockedDate}
                    type="button"
                    onClick={() =>
                      setValue("deliveryDate", blockedDate, {
                        shouldValidate: true,
                      })
                    }
                    className={`rounded-md border px-2 py-1 text-[11px] ${
                      active
                        ? "border-rose-300 bg-rose-100 text-rose-700"
                        : "border-amber-200 bg-white text-amber-700"
                    }`}
                  >
                    {formatIsoDateToIdLabel(blockedDate)}
                  </button>
                );
              })}
            </div>
          </div>
        </label>
        <label className="grid gap-2 text-sm font-medium text-gray-700">
          Delivery Slot
          <Select {...register("deliverySlot")}>
            <option value="">Select hour</option>
            {deliverySlots.map((slot) => {
              const status = slotStatusByTime.get(slot) ?? "AVAILABLE";
              return (
                <option key={slot} value={slot}>
                  {slot} - {slotStatusLabel(status)}
                </option>
              );
            })}
          </Select>
          {errors.deliverySlot && (
            <span className="text-xs text-rose-500">
              {errors.deliverySlot.message}
            </span>
          )}
        </label>
      </div>

      {isBlockedDate && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Tanggal tidak tersedia (libur admin atau cutoff H-1 jam 10:00
          sudah lewat).
        </div>
      )}

      {deliveryDate && (
        <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Slot Availability ({deliveryDate}) - {slotProfileLabel}{" "}
            Limit {slotLimitPerHour}/hour
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {slotAvailability.map((entry) => (
              <div
                key={entry.slot}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                  entry.status === "FULL"
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : entry.status === "ALMOST_FULL"
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                }`}
              >
                <div>{entry.slot}</div>
                <div className="font-normal">
                  {entry.status === "FULL"
                    ? "🔴 FULL"
                    : entry.status === "ALMOST_FULL"
                      ? `🟡 ALMOST_FULL (${entry.used}/${slotLimitPerHour})`
                      : `🟢 AVAILABLE (${entry.used}/${slotLimitPerHour})`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {deliveryDate && (
        <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Capacity Check ({deliveryDate})
          </p>
          {/* ── Smart Date Recommendations ── */}
          {shouldShowDateRecommendations && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2 text-xs">
              <p className="font-semibold text-rose-600">
                {dbWillExceed
                  ? "Kapasitas tidak mencukupi untuk tanggal ini"
                  : calendarDateError ||
                    "Tanggal dipilih tidak tersedia"}
              </p>

              {isRecommendationLoading ? (
                <p className="mt-1 text-indigo-500">Mencari tanggal…</p>
              ) : suggestedDates.length > 0 ? (
                <>
                  <p className="mt-1 font-medium text-indigo-700">
                    Tanggal tersedia:
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {suggestedDates.map(({ dateKey, remaining }) => (
                      <button
                        key={dateKey}
                        type="button"
                        onClick={() => handleSuggestionClick(dateKey)}
                        className="rounded-md border border-indigo-300 bg-white px-2 py-1 font-medium text-indigo-700 shadow-[0_0_0_0_rgba(99,102,241,0.35)] transition-all duration-300 hover:-translate-y-0.5 hover:border-indigo-500 hover:bg-indigo-100 hover:shadow-[0_0_0_4px_rgba(99,102,241,0.18)]"
                        title={`Sisa kapasitas: ${remaining} token`}
                      >
                        {formatIsoDateToIdLabel(dateKey)}
                        <span className="ml-1 text-indigo-400">
                          ({remaining} sisa)
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="mt-1 font-medium text-rose-600">
                  Semua tanggal dalam 30 hari penuh
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
