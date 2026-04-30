"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import type { UseFormRegister, FieldErrors } from "react-hook-form";
import type { BookingFormInput } from "./booking-form-schema";
import {
  sanitizePostalCodeInput,
  FRAGILE_ORDER_ALLOWED_METHODS_TEXT,
} from "./booking-form-helpers";
import { DELIVERY_METHOD_OPTIONS } from "@/lib/bookings/delivery-rules";
import { formatCurrency } from "@/components/orders/formatters";
import type { ShippingQuote } from "@/lib/bookings/shipping-types";

// Need type for field array from react-hook-form to explicitly handle fields array
import type { FieldArrayWithId } from "react-hook-form";

export interface DeliverySectionProps {
  register: UseFormRegister<BookingFormInput>;
  errors: FieldErrors<BookingFormInput>;
  addressFields: FieldArrayWithId<BookingFormInput, "deliveryAddresses", "id">[];
  appendAddress: (value: any) => void;
  removeAddress: (index: number) => void;
  autofillPostalCodeFromAddress: (index: number, addressValue: string) => void;
  shouldUseShippingEngine: boolean;
  isCheckingShipping: boolean;
  selectableDeliveryMethodOptions: Array<{ value: string; label: string }>;
  deliveryMethod: string;
  isCarRideHailingMethod: boolean;
  shippingWeightSummary: {
    totalGram: number;
    totalKg: number;
    rows: Array<{
      name: string;
      qty: number;
      perPcsGram: number;
      totalGram: number;
    }>;
  };
  isFragileOrder: boolean;
  isAllowedFragileOrderMethod: boolean;
  fragileOrderReasons: string[];
  displayedShippingDistanceKm: number | null;
  shippingDistanceSource: string;
  shippingWarning: string | null;
  shippingFallbackMessage: string | null;
  filteredShippingQuotes: ShippingQuote[];
  cheapestShippingQuote?: ShippingQuote | null;
  fastestShippingQuote?: ShippingQuote | null;
  displayedShippingQuotes: ShippingQuote[];
  selectedShippingQuoteId: string | null;
  setSelectedShippingQuoteId: (id: string) => void;
  showAllShippingOptions: boolean;
  setShowAllShippingOptions: (updater: boolean | ((prev: boolean) => boolean)) => void;
  shippingPayload: any;
  isAddressTooShortForShipping: boolean;
}

export default function DeliverySection({
  register,
  errors,
  addressFields,
  appendAddress,
  removeAddress,
  autofillPostalCodeFromAddress,
  shouldUseShippingEngine,
  isCheckingShipping,
  selectableDeliveryMethodOptions,
  deliveryMethod,
  isCarRideHailingMethod,
  shippingWeightSummary,
  isFragileOrder,
  isAllowedFragileOrderMethod,
  fragileOrderReasons,
  displayedShippingDistanceKm,
  shippingDistanceSource,
  shippingWarning,
  shippingFallbackMessage,
  filteredShippingQuotes,
  cheapestShippingQuote,
  fastestShippingQuote,
  displayedShippingQuotes,
  selectedShippingQuoteId,
  setSelectedShippingQuoteId,
  showAllShippingOptions,
  setShowAllShippingOptions,
  shippingPayload,
  isAddressTooShortForShipping,
}: DeliverySectionProps) {
  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Delivery Addresses
          </p>
          <Button
            type="button"
            variant="outline"
            className="h-8 gap-1 border-indigo-200 text-indigo-700"
            onClick={() =>
              appendAddress({
                label: "Extra",
                area: "",
                postalCode: "",
                addressLine: "",
              })
            }
          >
            <Plus size={14} />
            Add Address
          </Button>
        </div>

        <div className="space-y-3">
          {addressFields.map((field, index) => {
            const addressError = errors.deliveryAddresses?.[index];
            const isPrimaryShippingAddress =
              shouldUseShippingEngine && index === 0;

            return (
              <div
                key={field.id}
                className="grid gap-3 rounded-xl border border-gray-200 p-4 sm:grid-cols-2"
              >
                <label className="grid gap-2 text-sm font-medium text-gray-700">
                  Label
                  <Input
                    placeholder="Primary / Gift address"
                    {...register(`deliveryAddresses.${index}.label`)}
                  />
                  {addressError?.label?.message && (
                    <span className="text-[11px] font-normal text-rose-600">
                      {String(addressError.label.message)}
                    </span>
                  )}
                </label>
                <label className="grid gap-2 text-sm font-medium text-gray-700">
                  Area{" "}
                  {isPrimaryShippingAddress
                    ? "(Wajib untuk Shipping)"
                    : "(Opsional)"}
                  <Input
                    placeholder="Kecamatan / Kota"
                    {...register(`deliveryAddresses.${index}.area`)}
                  />
                  {isPrimaryShippingAddress &&
                    !addressError?.area?.message && (
                      <span className="text-[11px] font-normal leading-4 text-gray-500">
                        Isi minimal kecamatan dan kota, mis. `Cipondoh /
                        Tangerang`.
                      </span>
                    )}
                  {addressError?.area?.message && (
                    <span className="text-[11px] font-normal text-rose-600">
                      {String(addressError.area.message)}
                    </span>
                  )}
                </label>
                <label className="grid gap-2 text-sm font-medium text-gray-700">
                  Kode Pos{" "}
                  {isPrimaryShippingAddress
                    ? "(Wajib / dari alamat)"
                    : "(Opsional)"}
                  <Input
                    inputMode="numeric"
                    placeholder="Contoh: 11470"
                    {...register(
                      `deliveryAddresses.${index}.postalCode`,
                      {
                        setValueAs: (value) =>
                          typeof value === "string"
                            ? sanitizePostalCodeInput(value)
                            : "",
                      },
                    )}
                  />
                  {isPrimaryShippingAddress &&
                    !addressError?.postalCode?.message && (
                      <span className="text-[11px] font-normal leading-4 text-gray-500">
                        Isi 5 digit. Kalau ada di alamat, sistem akan
                        coba ambil otomatis.
                      </span>
                    )}
                  {addressError?.postalCode?.message && (
                    <span className="text-[11px] font-normal text-rose-600">
                      {String(addressError.postalCode.message)}
                    </span>
                  )}
                </label>
                <label className="grid gap-2 text-sm font-medium text-gray-700 sm:col-span-2">
                  Full Address
                  <Textarea
                    className="min-h-20"
                    placeholder="Jalan, nomor, blok, RT/RW, kelurahan, kecamatan, kota"
                    {...register(
                      `deliveryAddresses.${index}.addressLine`,
                      {
                        onBlur: (event) => {
                          autofillPostalCodeFromAddress(
                            index,
                            event.target.value,
                          );
                        },
                      },
                    )}
                  />
                  {!addressError?.addressLine?.message && (
                    <span className="text-[11px] font-normal leading-4 text-gray-500">
                      Jangan campur nama penerima atau no. telepon di
                      field ini. Fokus ke satu alamat final.
                    </span>
                  )}
                  {addressError?.addressLine?.message && (
                    <span className="text-[11px] font-normal text-rose-600">
                      {String(addressError.addressLine.message)}
                    </span>
                  )}
                </label>
                {addressFields.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 w-fit gap-1 border-rose-200 text-rose-600 hover:bg-rose-50"
                    onClick={() => removeAddress(index)}
                  >
                    <Trash2 size={14} />
                    Remove Address
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Shipping &amp; Delivery Method
          </p>
          {isCheckingShipping && (
            <span className="text-xs text-indigo-600">
              Menghitung ongkir otomatis...
            </span>
          )}
        </div>

        <label className="grid gap-2 text-sm font-medium text-gray-700">
          Sales Channel
          <Select {...register("sales_channel")}>
            <option value="">Pilih sales channel</option>
            <option value="direct">direct</option>
            <option value="tokopedia">tokopedia</option>
            <option value="shopee">shopee</option>
          </Select>
          {errors.sales_channel?.message && (
            <span className="text-[11px] font-normal text-rose-600">
              {String(errors.sales_channel.message)}
            </span>
          )}
        </label>

        <label className="grid gap-2 text-sm font-medium text-gray-700">
          Metode Pengiriman
          <Select {...register("deliveryMethod")}>
            {selectableDeliveryMethodOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>

        <p className="text-xs text-gray-500">
          {
            DELIVERY_METHOD_OPTIONS.find(
              (option) => option.value === deliveryMethod,
            )?.description
          }
        </p>

        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
          {isCarRideHailingMethod ? (
            <p>
              GoCar / GrabCar dipakai berdasarkan jarak, jadi berat
              tidak ditampilkan di sini.
            </p>
          ) : (
            <>
              <p>
                Total berat kirim: {shippingWeightSummary.totalGram}{" "}
                gram ({shippingWeightSummary.totalKg} kg)
              </p>
              {shippingWeightSummary.rows.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-gray-700">
                    Lihat rincian berat per item
                  </summary>
                  <div className="mt-2 space-y-1">
                    {shippingWeightSummary.rows.map((row) => (
                      <p key={row.name}>
                        {row.name}: {row.qty} pcs x {row.perPcsGram}{" "}
                        gram = {row.totalGram} gram
                      </p>
                    ))}
                  </div>
                </details>
              )}
            </>
          )}
        </div>

        {isFragileOrder && (
          <p
            className={`rounded-lg px-3 py-2 text-xs ${
              isAllowedFragileOrderMethod
                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border border-amber-200 bg-amber-50 text-amber-700"
            }`}
          >
            {isAllowedFragileOrderMethod
              ? `Produk ${fragileOrderReasons.join(", ")} sudah memakai metode yang diizinkan (${FRAGILE_ORDER_ALLOWED_METHODS_TEXT}).`
              : `Produk ${fragileOrderReasons.join(", ")} hanya bisa ${FRAGILE_ORDER_ALLOWED_METHODS_TEXT}`}
          </p>
        )}

        {!shouldUseShippingEngine && (
          <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
            Metode ini tidak memakai kalkulasi ongkir live.
          </p>
        )}

        {displayedShippingDistanceKm !== null && (
          <p className="text-xs text-gray-600">
            Estimasi jarak gudang ke alamat:{" "}
            <span className="font-semibold">
              {displayedShippingDistanceKm} km
              {shippingDistanceSource === "ai_fallback" && (
                <span className="ml-1 text-[10px] font-medium uppercase tracking-wide text-amber-600">
                  (AI fallback)
                </span>
              )}
            </span>
          </p>
        )}

        {shippingWarning && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {shippingWarning}
          </p>
        )}

        {shippingFallbackMessage && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {shippingFallbackMessage}
          </p>
        )}

        {filteredShippingQuotes.length > 0 && (
          <div className="space-y-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <p>
                Rekomendasi termurah: {cheapestShippingQuote?.provider}{" "}
                - {cheapestShippingQuote?.courierServiceName} ({" "}
                {cheapestShippingQuote
                  ? formatCurrency(cheapestShippingQuote.price)
                  : "-"}
                )
              </p>
              {fastestShippingQuote &&
                fastestShippingQuote.id !==
                  cheapestShippingQuote?.id && (
                  <p>
                    Rekomendasi tercepat:{" "}
                    {fastestShippingQuote.provider} -{" "}
                    {fastestShippingQuote.courierServiceName} (ETA{" "}
                    {fastestShippingQuote.eta})
                  </p>
                )}
              {filteredShippingQuotes.length > 3 && (
                <p className="mt-1 text-[11px] text-slate-600">
                  Menampilkan {displayedShippingQuotes.length} dari{" "}
                  {filteredShippingQuotes.length} layanan.
                </p>
              )}
            </div>

            {displayedShippingQuotes.map((quote) => {
              const active = quote.id === selectedShippingQuoteId;
              const isCheapest = cheapestShippingQuote?.id === quote.id;
              const isFastest = fastestShippingQuote?.id === quote.id;
              return (
                <button
                  key={quote.id}
                  type="button"
                  onClick={() => setSelectedShippingQuoteId(quote.id)}
                  className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${
                    active
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                      : "border-gray-200 bg-white text-gray-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 font-semibold">
                      <span>
                        {quote.provider} - {quote.courierServiceName}
                      </span>
                      {isCheapest && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                          Termurah
                        </span>
                      )}
                      {isFastest && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                          Tercepat
                        </span>
                      )}
                    </span>
                    <span className="font-semibold">
                      {formatCurrency(quote.price)}
                    </span>
                  </div>
                  <p className="text-xs">
                    ETA {quote.eta} | Jarak {quote.distanceKm} km |
                    Source: API Kurir
                  </p>
                </button>
              );
            })}

            {filteredShippingQuotes.length > 3 && (
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 px-3 text-xs"
                  onClick={() =>
                    setShowAllShippingOptions((current) => !current)
                  }
                >
                  {showAllShippingOptions
                    ? "Tampilkan ringkas"
                    : `Lihat semua layanan (${filteredShippingQuotes.length})`}
                </Button>
              </div>
            )}
          </div>
        )}

        {!filteredShippingQuotes.length && !shippingPayload && (
          <p className="text-xs text-gray-500">
            {shouldUseShippingEngine
              ? isAddressTooShortForShipping
                ? "Alamat terlalu pendek untuk kalkulasi ongkir. Lengkapi alamat utama minimal 8 karakter."
                : "Lengkapi alamat utama, area (Kecamatan/Kota), kode pos, dan item order untuk kalkulasi ongkir otomatis."
              : "Pilih metode berbasis kurir reguler/admin jika ingin kalkulasi ongkir otomatis."}
          </p>
        )}

        {!filteredShippingQuotes.length &&
          shippingPayload &&
          !isCheckingShipping && (
            <p className="text-xs text-gray-500">
              Belum ada opsi ongkir yang bisa dipakai untuk alamat ini.
            </p>
          )}
      </div>
    </>
  );
}
