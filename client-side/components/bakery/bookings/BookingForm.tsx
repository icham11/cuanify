"use client";
import { WHATSAPP_ORDER_LABELS, getDisplayFields } from "@/lib/bookings/whatsapp-parser";


import {
  ADDRESS_LOCATION_KEYWORD_PATTERN,
  ADDRESS_NUMBER_PATTERN,
  ADDRESS_CONTACT_LABEL_PATTERN,
  ADDRESS_PHONE_PATTERN,
  normalizeAddressText,
  sanitizePostalCodeInput,
  extractPostalCodeFromAddress,
  toTitleCaseWords,
  inferAreaFromAddress,
  areaLooksValid,
  addressLooksStructured,
  defaultItemSelection,
  EMPTY_ITEMS,
  EMPTY_ADDRESSES,
  BOUQUET_HAND_COST,
  BOUQUET_STANDING_COST,
  BOUQUET_HAND_MIN_QTY,
  BOUQUET_HAND_MAX_QTY,
  BOUQUET_STANDING_MIN_QTY,
  BOUQUET_STANDING_MAX_QTY,
  TOKEN_DIFFICULTY_OPTIONS,
  CUPCAKE_INDIVIDUAL_MIN_QTY,
  COOKIE_CUSTOM_TOTAL_MIN_QTY,
  COOKIE_INCLUDED_DESIGN_LIMIT,
  COOKIE_ADDITIONAL_DESIGN_PRICE,
  COOKIE_ADDITIONAL_DESIGN_ADDON_IDS,
  DARK_COLOR_BUTTERCREAM_ADDON_ID,
  DARK_BUTTERCREAM_COLOR_OPTIONS,
  MAX_DARK_BUTTERCREAM_COLORS,
  CUPCAKE_COOKIE_ADDON_IDS,
  BOUQUET_EXTRA_3_FLOWER_ADDON_ID,
  BOUQUET_EXTRA_6_FLOWER_ADDON_ID,
  FRAGILE_ORDER_ALLOWED_METHODS,
  FRAGILE_ORDER_ALLOWED_METHODS_TEXT,
  normalizeDarkButtercreamColors,
  isCupcakeCookieAddOnId,
  normalizeTokenDifficultyValue,
  normalizeBouquetCookiePriceValue,
  normalizeBouquetPriceOverrideValue,
  normalizeSharingBoxPriceOverrideValue,
  normalizeCookieDesignCount,
  getAdditionalCookieDesignCount,
  getCookieAdditionalDesignCountFromItem,
  getTokenDifficultyOption,
  orderTypeLabel,
  getBookingItemGroupLabel,
  slotStatusLabel,
  formatIsoDateToIdLabel,
  parseEtaToHours,
  whatsappOrderTypeOptions,
  specificWhatsappOrderTypeOptions,
  normalizeReferenceLabelInput,
  buildParsedReferenceImages,
  summarizeDetectedItems,
  getParsedSubtotalOverride,
  getParsedUnitPriceOverride,
  hasParsedPricingOverride,
  extractCookieDifficultyBreakdown,
  parseCookieDifficultyRows,
  formatCookieDifficultyRows,
  mergeCookieBreakdownIntoNotes,
  removeCookieBreakdownFromNotes,
  extractBouquetGreetingCardFromNotes,
  extractBouquetPaperColorFromNotes,
  extractBouquetRibbonFromNotes,
  extractBouquetFlowerCountFromNotes,
  extractBouquetFlowerColorFromNotes,
  extractBouquetRibbonColorFromNotes,
  removeBouquetStructuredFieldsFromNotes,
  inferBouquetFlowerCountFromAddOns,
  inferBouquetCookieFillQuantityFromText,
  getDefaultSelectionFromCatalog,
  resolveCookieCatalogMode,
  getCookieSelectionByMode,
  ensureSelectionFromCatalog,
  getVariantsFromCatalog,
  getUnitPriceFromCatalog,
  getCategoryAddOnsFromCatalog,
  getCookieAdditionalDesignUnitPrice,
  getFlavorOptionsForCategory,
  getNonFlavorAddOnsForCategory,
  normalizeAddOnQuantities,
  normalizeAddOnPriceOverrides,
  normalizeCustomAddOns,
  getCustomAddOnTotal,
  supportsAddOnQuantity,
  isTwoTierCakeItem,
  formatOneTierCakeVariantLabel,
  formatTwoTierCakeVariantLabel,
  getReadableVariantLabel,
  getTwoTierSummaryLabel,
  getAddOnUnitMultiplier,
  isBouquetFlowerAddOnId,
  getBouquetFlowerAddOnUnitPrice,
  normalizeBubblewrapSourceText,
  resolveBubblewrapUnitPrice,
  calculatePerUnitAddOnPrice,
  getSelectedFlavorIdFromItem,
  detectBouquetTypeFromItem,
  getBouquetCostByType,
  getBouquetMinQuantity,
  resolveBouquetSelectionByType,
  isValidBouquetQuantity,
  getBouquetQtyRangeLabel,
  getQuantityRuleViolationMessage,
  formatCompactSurcharge,
  getIndividualCupcakeQuantityRule,
  resolveIndividualCupcakeSizeByQuantity,
  getAutoQuantityForItem,
  isCustomCookieItem,
  isCustomCookieSharingBoxItem,
  getItemQuantityRule,
  getBouquetLineTotal,
  normalizeVariantLabel,
  isMediumVariantLabel,
  isLargeVariantLabel,
  resolveBouquetVariantForPaxel,
  getItemBasePrice,
  getItemProductionToken,
  normalizeTokenLookupKey,
  toDashboardProductNameFromItem,
  getItemProductionTokenSynced,
  getTotalProductionTokenSynced,
  getDraftItemPriceBreakdown,
  toBookingDatePart,
  extractSequenceForDate,
  getDailyBookingSequence,
  generateBookingCode,
  formatSubmitTimestamp,
  normalizeDuplicateTemplateText,
  normalizeTemplateForSimilarity,
  buildCharacterNgrams,
  calculateDiceCoefficient,
  calculateTokenJaccard,
  calculateTemplateSimilarity,
  DUPLICATE_TEMPLATE_SIMILARITY_THRESHOLD,
  DUPLICATE_TEMPLATE_MIN_SIMILARITY_CHARS,
  DUPLICATE_TEMPLATE_MIN_CHAR_SIMILARITY,
  DUPLICATE_TEMPLATE_MIN_TOKEN_SIMILARITY,
  findOrdersWithDuplicateParsedTemplate,
  formatDuplicateWarningDate,
  formatTemplateSimilarityLabel,
  type BookingItemInput,
  type ParserSource,
  type ParserOrderType,
  type BouquetFormType,
  type TokenDifficultyValue,
  type ItemQuantityRule,
  type BookingItemGroupLabel,
  type ParseWhatsAppApiResponse,
  type ParseWhatsAppRequestArgs,
  type CapacitySingleDateResponse,
  type DuplicateTemplateWarningState,
  type CookieDifficultyRow,
  type CookieCatalogMode,
  type CustomAddOnInput,
  type DuplicateTemplateMatch,
} from "./booking-form-helpers";

import { isGrabCarOnlyItem } from "@/lib/bookings/delivery-rules";

import {
  itemSchema,
  addressSchema,
  bookingSchema,
  type BookingFormInput,
  type BookingFormValues
} from "./booking-form-schema";



import NextLink from "next/link";
import { Loader2, Plus, Trash2, X, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PriceSummaryCard from "@/components/bakery/bookings/PriceSummaryCard";
import WhatsAppParserSection from "@/components/bakery/bookings/WhatsAppParserSection";
import CustomerSection from "@/components/bakery/bookings/CustomerSection";
import DeliverySection from "@/components/bakery/bookings/DeliverySection";
import { formatCurrency } from "@/components/orders/formatters";
import {
  useOrders,
  type BakeryOrder,
} from "@/components/bakery/store";

import { useBookingFormState } from "./hooks/useBookingFormState";

export default function BookingForm({
  onBookingSuccess,
  onBookingCanceled,
  orderToEdit,
  editingMode,
  availableMarketplaceOrders,
}: {
  onBookingSuccess?: () => void;
  onBookingCanceled?: () => void;
  orderToEdit?: BakeryOrder | null;
  editingMode?: boolean;
  availableMarketplaceOrders?: any[];
}) {
  const state = useBookingFormState();
  // Note: props unused internally by hook? If they are needed, hook signature needs fix.

  const {
    addCustomAddOn,
    addOnCatalog,
    addOnTotal,
    addressFields,
    appendAddress,
    appendItem,
    autofillPostalCodeFromAddress,
    basePrice,
    blockedDates,
    bookingProgressLabel,
    bookingProgressPercent,
    calendarDateError,
    categoryPriceBreakdown,
    cheapestShippingQuote,
    clearParsedPricingOverride,
    closeDuplicateTemplateWarning,
    closeSubmitConfirmationReminder,
    confirmSubmitAfterReminder,
    continueDuplicateTemplateSubmission,
    control,
    dbWillExceed,
    deliveryDate,
    deliveryFee,
    deliveryMethod,
    deliverySlot,
    deliverySlots,
    displayedShippingDistanceKm,
    displayedShippingQuotes,
    draftImported,
    duplicateTemplateWarning,
    duplicateWarningDialogRef,
    errors,
    duplicateWarningPrimaryButtonRef,
    effectivePaymentStatus,
    fastestShippingQuote,
    fetchLatestMarketplaceEmail,
    fillManualTemplate,
    filteredShippingQuotes,
    fragileOrderReasons,
    handleSubmit,
    handleSuggestionClick,
    importDraft,
    insuranceFee,
    isAddressTooShortForShipping,
    isAllowedFragileOrderMethod,
    isBlockedDate,
    isBookingCreationInFlight,
    isBookingProcessing,
    isCalendarCapacityLoading,
    isCalendarDateInvalid,
    isCapacityValidating,
    isCarRideHailingMethod,
    isCheckingShipping,
    isFetchingMarketplaceEmail,
    isFragileOrder,
    isManualSubmitInFlight,
    isParsingWhatsApp,
    isRecommendationLoading,
    isSubmitting,
    itemFields,
    manualAdjustment,
    onSubmit,
    openDetectedDuplicateBooking,
    orderItemGroupingSummary,
    parsedPreview,
    pendingDuplicateSubmissionRef,
    pendingSubmitConfirmationRef,
    productCatalog,
    productTokenByName,
    productionPreviewImageUrl,
    quickPaste,
    referenceFileInputKey,
    referenceFilesChangedSinceParse,
    referenceImageFiles,
    referenceImageLabelsInput,
    register,
    remainingBalance,
    removeAddress,
    removeCustomAddOn,
    removeItem,
    reset,
    selectableDeliveryMethodOptions,
    selectedOrderType,
    selectedPaymentStatus,
    selectedShippingQuoteId,
    serviceCharge,
    setValue,
    setCustomAddOnLabel,
    setCustomAddOnPrice,
    setDraftImported,
    setDuplicateTemplateWarning,
    setItemAddOnPriceOverride,
    setItemAddOnQuantity,
    setParsedPreview,
    setProductionPreviewImageUrl,
    setQuickPaste,
    setReferenceFileInputKey,
    setReferenceFilesChangedSinceParse,
    setReferenceImageFiles,
    setReferenceImageLabelsInput,
    setSelectedOrderType,
    setSelectedShippingQuoteId,
    setShippingDistanceKm,
    setShippingDistanceSource,
    setShippingQuotes,
    setShippingWarning,
    setShowAllShippingOptions,
    setShowOrderTypeSelector,
    setShowSubmitConfirmation,
    setSubmitError,
    setSubmitSuccess,
    setSubmitSuccessMeta,
    setVisionRawOutput,
    shippingDistanceSource,
    shippingFallbackMessage,
    shippingPayload,
    shippingWarning,
    shippingWeightSummary,
    shouldShowDateRecommendations,
    shouldUseShippingEngine,
    showAllShippingOptions,
    showOrderTypeSelector,
    showSubmitConfirmation,
    skipDuplicateTemplateWarningRef,
    skipSubmitConfirmationRef,
    slotAvailability,
    slotLimitPerHour,
    slotProfileLabel,
    slotStatusByTime,
    submitConfirmationPrimaryButtonRef,
    submitError,
    submitSuccess,
    submitSuccessMeta,
    suggestedDates,
    suggestedDownPaymentAmount,
    toggleDarkButtercreamColor,
    toggleItemAddOn,
    toggleItemFlavor,
    totalPaid,
    totalPrice,
    watchedItems,
    wholesaleDiscountAmount,
    wholesaleDiscountPercent,
  } = state;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card className="rounded-xl border-indigo-100 shadow-sm">
        <CardHeader className="p-6 pb-2">
          <CardTitle>WhatsApp & Email Parser (Paste / Manual)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 px-6 pb-6 pt-0">
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-2 text-xs text-indigo-700">
            <p>
              Default parser: <span className="font-semibold">Auto Detect</span>
              . Cukup paste chat lalu klik Parse WhatsApp.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-indigo-200 bg-white px-2 py-1 font-semibold text-indigo-700">
                Mode aktif:{" "}
                {selectedOrderType === "unknown"
                  ? "Auto Detect"
                  : WHATSAPP_ORDER_LABELS[selectedOrderType]}
              </span>
              <Button
                type="button"
                variant="outline"
                className="h-7 border-indigo-200 px-2 text-[11px] text-indigo-700 hover:bg-indigo-100"
                onClick={() => setShowOrderTypeSelector((current) => !current)}
              >
                {showOrderTypeSelector
                  ? "Sembunyikan Jenis Order"
                  : "Ubah Jenis Order"}
              </Button>
              {selectedOrderType !== "unknown" && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-7 border-gray-200 px-2 text-[11px] text-gray-700 hover:bg-gray-100"
                  onClick={() => {
                    setSelectedOrderType("unknown");
                    setShowOrderTypeSelector(false);
                  }}
                >
                  Kembali ke Auto Detect
                </Button>
              )}
            </div>
          </div>

          {showOrderTypeSelector && (
            <label className="grid gap-2 text-sm font-medium text-gray-700">
              Jenis Order (Override)
              <Select
                value={selectedOrderType}
                onChange={(event) =>
                  setSelectedOrderType(event.target.value as ParserOrderType)
                }
              >
                {whatsappOrderTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </label>
          )}

          <Textarea
            value={quickPaste}
            onChange={(event) => setQuickPaste(event.target.value)}
            placeholder="Paste chat WA di sini. Sistem akan auto-detect format parser dari teks."
            className="min-h-28"
          />

          <div className="grid gap-4 rounded-xl border border-dashed border-gray-200 bg-gray-50/60 p-4">
            <label className="grid gap-2 text-sm font-medium text-gray-700">
              Gambar Referensi Customer
              <Input
                key={referenceFileInputKey}
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => {
                  setReferenceImageFiles(Array.from(event.target.files ?? []));
                  setReferenceFilesChangedSinceParse(true);
                }}
              />
              <span className="text-xs font-normal text-gray-500">
                Upload gambar yang dipilih customer. Bisa satu gambar crop per
                desain, atau satu sheet gambar bertanda merah. Jika file diubah,
                klik Parse WhatsApp lagi supaya referensinya ter-upload.
              </span>
            </label>

            <label className="grid gap-2 text-sm font-medium text-gray-700">
              Label Desain per Gambar
              <Textarea
                value={referenceImageLabelsInput}
                onChange={(event) => {
                  setReferenceImageLabelsInput(event.target.value);
                  if (draftImported) {
                    setReferenceFilesChangedSinceParse(true);
                  }
                }}
                placeholder={
                  "Opsional. Isi satu label per baris sesuai urutan upload.\nContoh:\nPikachu\nBulbasaur\nPiplup"
                }
                className="min-h-24"
              />
              <span className="text-xs font-normal text-gray-500">
                Dipakai untuk mencocokkan gambar ke slot/template produk.
              </span>
            </label>

            {referenceImageFiles.length > 0 && (
              <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
                {referenceImageFiles.length} gambar siap dipakai:{" "}
                {referenceImageFiles.map((file) => file.name).join(", ")}
              </div>
            )}

            {referenceFilesChangedSinceParse &&
              referenceImageFiles.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Referensi gambar atau label desain berubah. Klik{" "}
                  <span className="font-semibold">Parse WhatsApp</span> lagi
                  supaya versi terbaru ikut tersimpan ke booking dan dipakai
                  template produksi.
                </div>
              )}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700"
              onClick={() => void importDraft()}
              disabled={isParsingWhatsApp}
            >
              <Upload size={16} />
              {isParsingWhatsApp
                ? "Parsing & Preview..."
                : referenceFilesChangedSinceParse || draftImported
                  ? "Parse Ulang WhatsApp"
                  : "Parse WhatsApp"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-sky-200 text-sky-700 hover:bg-sky-50"
              onClick={() => void fetchLatestMarketplaceEmail()}
              disabled={isFetchingMarketplaceEmail || isParsingWhatsApp}
            >
              {isFetchingMarketplaceEmail
                ? "Mengambil Email..."
                : "Ambil Email Tokopedia/Shopee"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
              onClick={fillManualTemplate}
            >
              Isi Template Manual
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-gray-200 text-gray-700 hover:bg-gray-50"
              onClick={() => {
                setQuickPaste("");
                setSelectedOrderType("unknown");
                setShowOrderTypeSelector(false);
                setParsedPreview(null);
                setProductionPreviewImageUrl("");
                setVisionRawOutput("");
                setDraftImported(false);
                setReferenceImageFiles([]);
                setReferenceFilesChangedSinceParse(false);
                setReferenceImageLabelsInput("");
                setReferenceFileInputKey((current) => current + 1);
              }}
            >
              Clear Parser
            </Button>
          </div>

          {draftImported && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm text-indigo-700">
              Draft berhasil di-auto populate. Cek ulang semua data sebelum
              create booking.
            </div>
          )}

          {parsedPreview && (
            <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Preview Hasil Parser
                </p>
                <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                  Terdeteksi utama:{" "}
                  {WHATSAPP_ORDER_LABELS[parsedPreview.orderType]}
                  {Array.isArray(parsedPreview.detectedItems) &&
                  parsedPreview.detectedItems.length > 1
                    ? ` • ${parsedPreview.detectedItems.length} item`
                    : ""}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {getDisplayFields(parsedPreview).map((field, index) => (
                  <div
                    key={`${field.label}-${index}`}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      {field.label}
                    </p>
                    <p className="text-sm text-gray-800">
                      {field.value || "-"}
                    </p>
                  </div>
                ))}
              </div>



              {Array.isArray(parsedPreview.referenceImages) &&
                parsedPreview.referenceImages.length > 0 && (
                  <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-700">
                    Template produksi akan memakai{" "}
                    {parsedPreview.referenceImages.length} gambar referensi.
                    {Array.isArray(parsedPreview.requestedImageLabels) &&
                    parsedPreview.requestedImageLabels.length > 0
                      ? ` Label aktif: ${parsedPreview.requestedImageLabels.join(", ")}`
                      : ""}
                  </div>
                )}
              {productionPreviewImageUrl && (
                <div className="rounded-lg border border-emerald-200 bg-white p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                      Preview Template Produksi
                    </p>
                    <a
                      href={productionPreviewImageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-emerald-700 underline underline-offset-2"
                    >
                      Buka file Cloudinary
                    </a>
                  </div>
                  {/* Using a plain img keeps arbitrary Cloudinary preview URLs simple in the admin form. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={productionPreviewImageUrl}
                    alt="Preview template produksi"
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 object-contain"
                  />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="p-6 pb-2">
            <CardTitle>Booking Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 px-6 pb-6 pt-0">
            <div>
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

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Order Items
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 gap-1 border-indigo-200 text-indigo-700"
                    onClick={() => {
                      const nextDefault =
                        getDefaultSelectionFromCatalog(productCatalog);
                      const nextTokenDifficulty =
                        nextDefault.category === "Cookies"
                          ? "SIMPLE"
                          : undefined;
                      const autoQuantity =
                        getAutoQuantityForItem({
                          category: nextDefault.category,
                          subcategory: nextDefault.subcategory,
                          productName: nextDefault.productName,
                          size: nextDefault.size,
                          quantity: 1,
                          tokenDifficulty: nextTokenDifficulty,
                          customTokenPerUnit: undefined,
                          bouquetPriceOverride: undefined,
                          sharingBoxPriceOverride: undefined,
                          cookiePrice: undefined,
                          addOns: [],
                          addOnQuantities: {},
                          addOnPriceOverrides: {},
                          customAddOns: [],
                          greetingCard: "",
                          bouquetPaperColor: "",
                          ribbon: "",
                          flowerCount: "",
                          flowerColor: "",
                          ribbonColor: "",
                          notes: "",
                        }) ?? 1;
                      appendItem({
                        category: nextDefault.category,
                        subcategory: nextDefault.subcategory,
                        productName: nextDefault.productName,
                        size: nextDefault.size,
                        quantity: autoQuantity,
                        tokenDifficulty: nextTokenDifficulty,
                        customTokenPerUnit: undefined,
                        bouquetPriceOverride: undefined,
                        sharingBoxPriceOverride: undefined,
                        cookiePrice: undefined,
                        addOns: [],
                        addOnQuantities: {},
                        addOnPriceOverrides: {},
                        customAddOns: [],
                        darkColorButtercreamColors: [],
                        parsedUnitPrice: undefined,
                        parsedSubtotal: undefined,
                        pricingSource: undefined,
                        greetingCard: "",
                        bouquetPaperColor: "",
                        ribbon: "",
                        flowerCount: "",
                        flowerColor: "",
                        ribbonColor: "",
                        notes: "",
                      });
                    }}
                  >
                    <Plus size={14} />
                    Add Item
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-700">
                    Custom: {orderItemGroupingSummary.customCount}
                  </span>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">
                    Seasonal/Event: {orderItemGroupingSummary.seasonalCount}
                  </span>
                </div>

                <div className="space-y-3">
                  {itemFields.map((field, index) => {
                    const item = watchedItems[index];
                    const normalizedSelection = ensureSelectionFromCatalog(
                      productCatalog,
                      {
                        category: item?.category,
                        subcategory: item?.subcategory,
                        productName: item?.productName,
                        size: item?.size,
                      },
                    );
                    const categoryData = productCatalog.find(
                      (entry) =>
                        entry.category === normalizedSelection.category,
                    );
                    const subcategories = categoryData?.subcategories ?? [];
                    const subcategoryData =
                      subcategories.find(
                        (entry) =>
                          entry.name === normalizedSelection.subcategory,
                      ) ?? subcategories[0];
                    const products = subcategoryData?.products ?? [];
                    const variants = getVariantsFromCatalog(
                      productCatalog,
                      normalizedSelection,
                    );
                    const addOns = getCategoryAddOnsFromCatalog(
                      addOnCatalog,
                      normalizedSelection.category,
                    );
                    const flavorOptions = getFlavorOptionsForCategory(
                      normalizedSelection.category,
                    );
                    const selectedFlavorId = getSelectedFlavorIdFromItem({
                      category: normalizedSelection.category,
                      subcategory: normalizedSelection.subcategory,
                      productName: normalizedSelection.productName,
                      size: normalizedSelection.size,
                      quantity: Number(item?.quantity) || 0,
                      tokenDifficulty: item?.tokenDifficulty,
                      customTokenPerUnit:
                        Number(item?.customTokenPerUnit) > 0
                          ? Number(item?.customTokenPerUnit)
                          : undefined,
                      cookiePrice:
                        Number(item?.cookiePrice) > 0
                          ? Number(item?.cookiePrice)
                          : undefined,
                      addOns: item?.addOns ?? [],
                      notes: item?.notes ?? "",
                    });
                    const nonFlavorAddOns = getNonFlavorAddOnsForCategory({
                      addOns,
                      category: normalizedSelection.category,
                    });
                    const regularFlavorOptions = flavorOptions.filter(
                      (option) => !option.premium,
                    );
                    const premiumFlavorOptions = flavorOptions.filter(
                      (option) => option.premium,
                    );
                    const premiumFlavorSurcharges = premiumFlavorOptions
                      .map((option) => option.price)
                      .filter((price) => price > 0);
                    const premiumFlavorMinSurcharge =
                      premiumFlavorSurcharges.length > 0
                        ? Math.min(...premiumFlavorSurcharges)
                        : 0;
                    const premiumFlavorMaxSurcharge =
                      premiumFlavorSurcharges.length > 0
                        ? Math.max(...premiumFlavorSurcharges)
                        : 0;
                    const flavorGuideText =
                      normalizedSelection.category === "Cake"
                        ? `Cake flavor: ${regularFlavorOptions.length} regular + ${premiumFlavorOptions.length} premium. Pilih 1 rasa per item cake.${premiumFlavorMaxSurcharge > 0 ? ` Premium surcharge ${premiumFlavorMinSurcharge === premiumFlavorMaxSurcharge ? formatCurrency(premiumFlavorMaxSurcharge) : `${formatCurrency(premiumFlavorMinSurcharge)} - ${formatCurrency(premiumFlavorMaxSurcharge)}`} / cake.` : ""}`
                        : "Cupcake flavor: pilih 1 rasa untuk item cupcakes ini.";
                    const bouquetProbeItem: BookingItemInput = {
                      category: normalizedSelection.category,
                      subcategory: normalizedSelection.subcategory,
                      productName: normalizedSelection.productName,
                      size: normalizedSelection.size,
                      quantity: Number(item?.quantity) || 0,
                      tokenDifficulty: item?.tokenDifficulty,
                      customTokenPerUnit:
                        Number(item?.customTokenPerUnit) > 0
                          ? Number(item?.customTokenPerUnit)
                          : undefined,
                      bouquetPriceOverride:
                        Number(item?.bouquetPriceOverride) > 0
                          ? Number(item?.bouquetPriceOverride)
                          : undefined,
                      sharingBoxPriceOverride:
                        Number(item?.sharingBoxPriceOverride) > 0
                          ? Number(item?.sharingBoxPriceOverride)
                          : undefined,
                      cookiePrice:
                        Number(item?.cookiePrice) > 0
                          ? Number(item?.cookiePrice)
                          : undefined,
                      addOns: item?.addOns ?? [],
                      notes: item?.notes ?? "",
                    };
                    const bouquetType =
                      detectBouquetTypeFromItem(bouquetProbeItem);
                    const isBouquet = normalizedSelection.category === "Buket";
                    const isCupcakes =
                      normalizedSelection.category === "Cupcakes";
                    const isCookies =
                      normalizedSelection.category === "Cookies";
                    const isCustomCookiesItem =
                      isCookies && isCustomCookieItem(bouquetProbeItem);
                    const itemGroupLabel = getBookingItemGroupLabel({
                      category: normalizedSelection.category,
                      subcategory: normalizedSelection.subcategory,
                      productName: normalizedSelection.productName,
                      size: normalizedSelection.size,
                      quantity: Number(item?.quantity) || 0,
                    });
                    const isSeasonalEventItem =
                      itemGroupLabel === "SEASONAL_EVENT";
                    const isCustomCookieSharingBox =
                      isCookies &&
                      isCustomCookieSharingBoxItem(bouquetProbeItem);
                    const isTwoTierCake = isTwoTierCakeItem(bouquetProbeItem);
                    const allowedVariants =
                      deliveryMethod === "ASSISTED_PAXEL" && isBouquet
                        ? variants.filter(
                            (variant) => !isMediumVariantLabel(variant.label),
                          )
                        : variants;
                    const displayVariants =
                      allowedVariants.length > 0 ? allowedVariants : variants;
                    const supportsDifficulty = isCookies;
                    const bouquetLineTotal = getBouquetLineTotal(
                      productCatalog,
                      bouquetProbeItem,
                    );
                    const itemGrabCarOnly = isGrabCarOnlyItem(bouquetProbeItem);
                    const quantityRule = getItemQuantityRule(bouquetProbeItem);
                    const itemTokenPreview = getItemProductionTokenSynced(
                      bouquetProbeItem,
                      productTokenByName,
                    );
                    const bouquetPriceOverride = isBouquet
                      ? normalizeBouquetPriceOverrideValue(
                          item?.bouquetPriceOverride,
                        )
                      : undefined;
                    const hasParsedRecapPrice = hasParsedPricingOverride(item);
                    const parsedUnitPrice = getParsedUnitPriceOverride(item);
                    const parsedSubtotal = getParsedSubtotalOverride(item);
                    const sharingBoxUnitPriceOverride = isCustomCookieSharingBox
                      ? normalizeSharingBoxPriceOverrideValue(
                          item?.sharingBoxPriceOverride,
                        )
                      : undefined;
                    const cookieDifficultyBreakdown =
                      extractCookieDifficultyBreakdown(item);
                    const cookieDifficultyRowsFromNotes =
                      parseCookieDifficultyRows(
                        String(cookieDifficultyBreakdown || ""),
                      );
                    const cookieDifficultyRows: CookieDifficultyRow[] =
                      cookieDifficultyRowsFromNotes.length > 0
                        ? cookieDifficultyRowsFromNotes
                        : [
                            {
                              difficulty: normalizeTokenDifficultyValue(
                                item?.tokenDifficulty || "SIMPLE",
                              ),
                              quantity: Math.max(
                                1,
                                Number(item?.quantity) || 1,
                              ),
                            },
                          ];
                    const hasCustomTokenOverride =
                      Number(item?.customTokenPerUnit) > 0;
                    const quantityError = errors.items?.[index]?.quantity
                      ?.message as string | undefined;
                    const hasDarkColorButtercream =
                      isCupcakes &&
                      (item?.addOns?.includes(
                        DARK_COLOR_BUTTERCREAM_ADDON_ID,
                      ) ??
                        false);
                    const cookieCatalogMode = resolveCookieCatalogMode({
                      category: normalizedSelection.category,
                      subcategory: normalizedSelection.subcategory,
                    });
                    const selectedDarkButtercreamColors =
                      normalizeDarkButtercreamColors(
                        item?.darkColorButtercreamColors ?? [],
                      );
                    const hasMultipleSubcategories = subcategories.length > 1;
                    const hasMultipleProducts = products.length > 1;
                    const hasMultipleVariants = displayVariants.length > 1;
                    const quantityValue = Number(item?.quantity) || 0;
                    const normalizedAddOnQuantities = normalizeAddOnQuantities(
                      item?.addOnQuantities,
                    );
                    const normalizedAddOnPriceOverrides =
                      normalizeAddOnPriceOverrides(item?.addOnPriceOverrides);
                    const customAddOns = normalizeCustomAddOns(
                      item?.customAddOns,
                    );
                    const selectedNonFlavorAddOns = nonFlavorAddOns.filter(
                      (addon) => item?.addOns?.includes(addon.id) ?? false,
                    );
                    // Separate flowers from other add-ons for proper pricing calculation
                    const selectedFlowerAddOns = selectedNonFlavorAddOns.filter(
                      (addon) => isBouquetFlowerAddOnId(addon.id),
                    );
                    const selectedOtherAddOns = selectedNonFlavorAddOns.filter(
                      (addon) => !isBouquetFlowerAddOnId(addon.id),
                    );

                    // Calculate flower add-ons (fixed, no quantity multiplier)
                    const selectedFlowerAddOnTotal =
                      selectedFlowerAddOns.reduce((sum, addon) => {
                        const overriddenPrice =
                          normalizedAddOnPriceOverrides[addon.id];
                        const unitPrice =
                          overriddenPrice !== undefined
                            ? overriddenPrice
                            : (getBouquetFlowerAddOnUnitPrice({
                                addonId: addon.id,
                                bouquetType,
                              }) ?? addon.price);
                        return sum + unitPrice;
                      }, 0);

                    // Calculate other add-ons (scaled by quantity)
                    const selectedOtherAddOnTotal =
                      selectedOtherAddOns.reduce((sum, addon) => {
                        const multiplier = getAddOnUnitMultiplier({
                          category: normalizedSelection.category,
                          addonId: addon.id,
                          addOnQuantities: normalizedAddOnQuantities,
                        });
                        const overriddenPrice =
                          normalizedAddOnPriceOverrides[addon.id];
                        const unitPrice =
                          overriddenPrice !== undefined
                            ? overriddenPrice
                            : addon.price;
                        return sum + unitPrice * multiplier;
                      }, 0) * Math.max(1, quantityValue);

                    const selectedNonFlavorAddOnTotal =
                      selectedFlowerAddOnTotal + selectedOtherAddOnTotal;

                    // Calculate total add-ons properly handling flowers
                    const flowerAddOnsPrice = (item?.addOns ?? [])
                      .filter((id) => isBouquetFlowerAddOnId(id))
                      .reduce((sum, addonId) => {
                        const addon = addOns.find((a) => a.id === addonId);
                        if (!addon) return sum;
                        const overriddenPrice =
                          normalizedAddOnPriceOverrides[addonId];
                        const unitPrice =
                          overriddenPrice !== undefined
                            ? overriddenPrice
                            : (getBouquetFlowerAddOnUnitPrice({
                                addonId,
                                bouquetType,
                              }) ?? addon.price);
                        return sum + unitPrice;
                      }, 0);

                    const nonFlowerAddOnsPrice =
                      calculatePerUnitAddOnPrice({
                        category: normalizedSelection.category,
                        bouquetType,
                        selectedAddOnIds: (item?.addOns ?? []).filter(
                          (id) => !isBouquetFlowerAddOnId(id),
                        ),
                        addOnQuantities: normalizedAddOnQuantities,
                        addOnPriceOverrides: normalizedAddOnPriceOverrides,
                        addOnCatalogEntries: addOns,
                        itemSelection: {
                          category: normalizedSelection.category,
                          subcategory: normalizedSelection.subcategory,
                          productName: normalizedSelection.productName,
                          size: normalizedSelection.size,
                        },
                      }) * Math.max(1, quantityValue);

                    const selectedAllAddOnTotal =
                      flowerAddOnsPrice + nonFlowerAddOnsPrice;
                    const customAddOnTotal = getCustomAddOnTotal(
                      customAddOns,
                      quantityValue,
                    );
                    const cookieBreakdownSubtotal = isCustomCookiesItem
                      ? cookieDifficultyRows.reduce((sum, row) => {
                          const rowDifficulty = getTokenDifficultyOption(
                            row.difficulty,
                          );
                          return (
                            sum +
                            Math.max(0, row.quantity) *
                              rowDifficulty.cookiePrice
                          );
                        }, 0)
                      : 0;
                    const cookieBreakdownUnitPrice =
                      quantityValue > 0 && cookieBreakdownSubtotal > 0
                        ? Math.round(cookieBreakdownSubtotal / quantityValue)
                        : 0;
                    const customCookieAdditionalDesignCount =
                      isCustomCookiesItem
                        ? getCookieAdditionalDesignCountFromItem({
                            designCount: item?.designCount,
                            additionalDesignCount: item?.additionalDesignCount,
                          })
                        : 0;
                    const customCookieAdditionalDesignUnitPrice =
                      isCustomCookiesItem
                        ? getCookieAdditionalDesignUnitPrice({
                            categoryAddOns: addOns,
                            item: {
                              addOnPriceOverrides: item?.addOnPriceOverrides,
                            },
                          })
                        : COOKIE_ADDITIONAL_DESIGN_PRICE;
                    const customCookieAdditionalDesignCharge =
                      customCookieAdditionalDesignCount *
                      customCookieAdditionalDesignUnitPrice;
                    const parsedSubtotalWithDesignCharge =
                      hasParsedRecapPrice && parsedSubtotal
                        ? parsedSubtotal + customCookieAdditionalDesignCharge
                        : parsedSubtotal;
                    const cookieSubtotalWithDesignCharge =
                      isCustomCookiesItem && cookieBreakdownSubtotal > 0
                        ? cookieBreakdownSubtotal +
                          customCookieAdditionalDesignCharge
                        : undefined;
                    const displayUnitPrice =
                      hasParsedRecapPrice && parsedUnitPrice
                        ? parsedUnitPrice
                        : bouquetPriceOverride !== undefined
                          ? bouquetPriceOverride
                          : sharingBoxUnitPriceOverride !== undefined
                            ? sharingBoxUnitPriceOverride
                            : isCustomCookiesItem &&
                                cookieBreakdownUnitPrice > 0
                              ? cookieBreakdownUnitPrice
                              : getUnitPriceFromCatalog(productCatalog, {
                                  category: normalizedSelection.category,
                                  subcategory: normalizedSelection.subcategory,
                                  productName: normalizedSelection.productName,
                                  size: normalizedSelection.size,
                                });
                    const displayLinePrice =
                      hasParsedRecapPrice && cookieSubtotalWithDesignCharge
                        ? cookieSubtotalWithDesignCharge
                        : hasParsedRecapPrice && parsedSubtotalWithDesignCharge
                          ? parsedSubtotalWithDesignCharge
                          : isCustomCookiesItem && cookieBreakdownSubtotal > 0
                            ? cookieBreakdownSubtotal
                            : getItemBasePrice(
                                productCatalog,
                                bouquetProbeItem,
                                {
                                  cookieAdditionalDesignUnitPrice:
                                    customCookieAdditionalDesignUnitPrice,
                                },
                              );
                    const itemTotalCostDisplay =
                      hasParsedRecapPrice && cookieSubtotalWithDesignCharge
                        ? cookieSubtotalWithDesignCharge
                        : hasParsedRecapPrice && parsedSubtotalWithDesignCharge
                          ? parsedSubtotalWithDesignCharge
                          : displayLinePrice +
                            selectedAllAddOnTotal +
                            customAddOnTotal +
                            customCookieAdditionalDesignCharge;
                    const totalAddOnAndSurchargeDisplay =
                      selectedAllAddOnTotal +
                      customAddOnTotal +
                      customCookieAdditionalDesignCharge;

                    return (
                      <div
                        key={field.id}
                        className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Item {index + 1}
                          </p>
                          <div className="flex items-center gap-2 text-[11px] font-medium text-slate-600">
                            {isSeasonalEventItem && (
                              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">
                                Seasonal/Event
                              </span>
                            )}
                            {isTwoTierCake && (
                              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-indigo-700">
                                Two Tiered Cake
                              </span>
                            )}
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">
                              Unit {formatCurrency(displayUnitPrice)}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">
                              Subtotal {formatCurrency(displayLinePrice)}
                            </span>
                          </div>
                        </div>

                        <div className="grid gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
                          <label className="grid gap-2 text-sm font-medium text-gray-700">
                            Category
                            <Select
                              {...register(`items.${index}.category`)}
                              value={normalizedSelection.category}
                              onChange={(event) => {
                                const nextCategory = event.target.value;
                                const nextSelection =
                                  getDefaultSelectionFromCatalog(
                                    productCatalog,
                                    nextCategory,
                                  );
                                const nextProbeItem: BookingItemInput = {
                                  category: nextSelection.category,
                                  subcategory: nextSelection.subcategory,
                                  productName: nextSelection.productName,
                                  size: nextSelection.size,
                                  quantity: Number(item?.quantity) || 0,
                                  tokenDifficulty: item?.tokenDifficulty,
                                  customTokenPerUnit:
                                    Number(item?.customTokenPerUnit) > 0
                                      ? Number(item?.customTokenPerUnit)
                                      : undefined,
                                  cookiePrice:
                                    Number(item?.cookiePrice) > 0
                                      ? Number(item?.cookiePrice)
                                      : undefined,
                                  addOns: item?.addOns ?? [],
                                  notes: item?.notes ?? "",
                                };
                                const nextAutoQuantity =
                                  getAutoQuantityForItem(nextProbeItem);
                                clearParsedPricingOverride(index);
                                setValue(
                                  `items.${index}.category`,
                                  nextSelection.category,
                                  { shouldValidate: true },
                                );
                                setValue(
                                  `items.${index}.subcategory`,
                                  nextSelection.subcategory,
                                  {
                                    shouldValidate: true,
                                  },
                                );
                                setValue(
                                  `items.${index}.productName`,
                                  nextSelection.productName,
                                  {
                                    shouldValidate: true,
                                  },
                                );
                                setValue(
                                  `items.${index}.size`,
                                  nextSelection.size,
                                  { shouldValidate: true },
                                );
                                setValue(`items.${index}.addOns`, [], {
                                  shouldValidate: true,
                                });
                                setValue(
                                  `items.${index}.addOnQuantities`,
                                  {},
                                  {
                                    shouldValidate: true,
                                  },
                                );
                                setValue(
                                  `items.${index}.addOnPriceOverrides`,
                                  {},
                                  {
                                    shouldValidate: true,
                                  },
                                );
                                setValue(
                                  `items.${index}.darkColorButtercreamColors`,
                                  [],
                                  {
                                    shouldValidate: true,
                                  },
                                );
                                setValue(
                                  `items.${index}.bouquetPriceOverride`,
                                  undefined,
                                  {
                                    shouldValidate: true,
                                  },
                                );
                                setValue(
                                  `items.${index}.cookiePrice`,
                                  undefined,
                                  {
                                    shouldValidate: true,
                                  },
                                );
                                setValue(
                                  `items.${index}.greetingCard`,
                                  nextSelection.category === "Buket"
                                    ? String(item?.greetingCard || "")
                                    : "",
                                  {
                                    shouldValidate: true,
                                  },
                                );
                                setValue(
                                  `items.${index}.bouquetPaperColor`,
                                  nextSelection.category === "Buket"
                                    ? String(item?.bouquetPaperColor || "")
                                    : "",
                                  {
                                    shouldValidate: true,
                                  },
                                );
                                setValue(
                                  `items.${index}.ribbon`,
                                  nextSelection.category === "Buket"
                                    ? String(item?.ribbon || "")
                                    : "",
                                  {
                                    shouldValidate: true,
                                  },
                                );
                                setValue(
                                  `items.${index}.flowerCount`,
                                  nextSelection.category === "Buket"
                                    ? String(item?.flowerCount || "")
                                    : "",
                                  {
                                    shouldValidate: true,
                                  },
                                );
                                setValue(
                                  `items.${index}.flowerColor`,
                                  nextSelection.category === "Buket"
                                    ? String(item?.flowerColor || "")
                                    : "",
                                  {
                                    shouldValidate: true,
                                  },
                                );
                                setValue(
                                  `items.${index}.ribbonColor`,
                                  nextSelection.category === "Buket"
                                    ? String(item?.ribbonColor || "")
                                    : "",
                                  {
                                    shouldValidate: true,
                                  },
                                );
                                setValue(
                                  `items.${index}.cookieDifficultyBreakdown`,
                                  undefined,
                                  {
                                    shouldValidate: true,
                                  },
                                );
                                setValue(
                                  `items.${index}.tokenDifficulty`,
                                  nextSelection.category === "Cookies"
                                    ? "SIMPLE"
                                    : undefined,
                                  {
                                    shouldValidate: true,
                                  },
                                );
                                if (typeof nextAutoQuantity === "number") {
                                  setValue(
                                    `items.${index}.quantity`,
                                    nextAutoQuantity,
                                    {
                                      shouldValidate: true,
                                    },
                                  );
                                }
                              }}
                            >
                              {productCatalog.map((entry) => (
                                <option
                                  key={entry.category}
                                  value={entry.category}
                                >
                                  {entry.category}
                                </option>
                              ))}
                            </Select>
                          </label>

                          <label className="grid gap-2 text-sm font-medium text-gray-700">
                            {isCookies ? "Mode Cookies" : "Subcategory"}
                            {isCookies ? (
                              <>
                                <Select
                                  value={cookieCatalogMode}
                                  onChange={(event) => {
                                    const nextMode = event.target
                                      .value as CookieCatalogMode;
                                    const nextSelection =
                                      getCookieSelectionByMode({
                                        catalog: productCatalog,
                                        mode: nextMode,
                                        previousSelection: normalizedSelection,
                                      });
                                    const nextProbeItem: BookingItemInput = {
                                      category: nextSelection.category,
                                      subcategory: nextSelection.subcategory,
                                      productName: nextSelection.productName,
                                      size: nextSelection.size,
                                      quantity: Number(item?.quantity) || 0,
                                      tokenDifficulty: item?.tokenDifficulty,
                                      customTokenPerUnit:
                                        Number(item?.customTokenPerUnit) > 0
                                          ? Number(item?.customTokenPerUnit)
                                          : undefined,
                                      cookiePrice:
                                        Number(item?.cookiePrice) > 0
                                          ? Number(item?.cookiePrice)
                                          : undefined,
                                      addOns: item?.addOns ?? [],
                                      notes: item?.notes ?? "",
                                    };
                                    const nextAutoQuantity =
                                      getAutoQuantityForItem(nextProbeItem);
                                    clearParsedPricingOverride(index);
                                    setValue(
                                      `items.${index}.subcategory`,
                                      nextSelection.subcategory,
                                      { shouldValidate: true },
                                    );
                                    setValue(
                                      `items.${index}.productName`,
                                      nextSelection.productName,
                                      { shouldValidate: true },
                                    );
                                    setValue(
                                      `items.${index}.size`,
                                      nextSelection.size,
                                      {
                                        shouldValidate: true,
                                      },
                                    );
                                    if (typeof nextAutoQuantity === "number") {
                                      setValue(
                                        `items.${index}.quantity`,
                                        nextAutoQuantity,
                                        {
                                          shouldValidate: true,
                                        },
                                      );
                                    }
                                  }}
                                >
                                  <option value="CUSTOM">Custom</option>
                                  <option value="SEASONAL_EVENT">
                                    Seasonal/Event
                                  </option>
                                </Select>
                                <span className="text-[11px] font-normal text-gray-500">
                                  Subcategory aktif:{" "}
                                  {normalizedSelection.subcategory || "-"}
                                </span>
                              </>
                            ) : hasMultipleSubcategories ? (
                              <Select
                                {...register(`items.${index}.subcategory`)}
                                value={normalizedSelection.subcategory}
                                onChange={(event) => {
                                  const nextSub = event.target.value;
                                  const nextSelection =
                                    ensureSelectionFromCatalog(productCatalog, {
                                      category: normalizedSelection.category,
                                      subcategory: nextSub,
                                    });
                                  const nextProbeItem: BookingItemInput = {
                                    category: nextSelection.category,
                                    subcategory: nextSelection.subcategory,
                                    productName: nextSelection.productName,
                                    size: nextSelection.size,
                                    quantity: Number(item?.quantity) || 0,
                                    tokenDifficulty: item?.tokenDifficulty,
                                    customTokenPerUnit:
                                      Number(item?.customTokenPerUnit) > 0
                                        ? Number(item?.customTokenPerUnit)
                                        : undefined,
                                    cookiePrice:
                                      Number(item?.cookiePrice) > 0
                                        ? Number(item?.cookiePrice)
                                        : undefined,
                                    addOns: item?.addOns ?? [],
                                    notes: item?.notes ?? "",
                                  };
                                  const nextAutoQuantity =
                                    getAutoQuantityForItem(nextProbeItem);
                                  clearParsedPricingOverride(index);
                                  setValue(
                                    `items.${index}.subcategory`,
                                    nextSelection.subcategory,
                                    {
                                      shouldValidate: true,
                                    },
                                  );
                                  setValue(
                                    `items.${index}.productName`,
                                    nextSelection.productName,
                                    {
                                      shouldValidate: true,
                                    },
                                  );
                                  setValue(
                                    `items.${index}.size`,
                                    nextSelection.size,
                                    { shouldValidate: true },
                                  );
                                  if (typeof nextAutoQuantity === "number") {
                                    setValue(
                                      `items.${index}.quantity`,
                                      nextAutoQuantity,
                                      {
                                        shouldValidate: true,
                                      },
                                    );
                                  }
                                }}
                              >
                                {subcategories.map((entry) => (
                                  <option key={entry.name} value={entry.name}>
                                    {entry.name}
                                  </option>
                                ))}
                              </Select>
                            ) : (
                              <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
                                {normalizedSelection.subcategory || "-"}
                              </div>
                            )}
                          </label>

                          <label className="grid gap-2 text-sm font-medium text-gray-700">
                            Product
                            {hasMultipleProducts ? (
                              <Select
                                {...register(`items.${index}.productName`)}
                                value={normalizedSelection.productName}
                                onChange={(event) => {
                                  const nextProduct = event.target.value;
                                  const nextSelection =
                                    ensureSelectionFromCatalog(productCatalog, {
                                      category: normalizedSelection.category,
                                      subcategory:
                                        normalizedSelection.subcategory,
                                      productName: nextProduct,
                                    });
                                  const nextProbeItem: BookingItemInput = {
                                    category: nextSelection.category,
                                    subcategory: nextSelection.subcategory,
                                    productName: nextSelection.productName,
                                    size: nextSelection.size,
                                    quantity: Number(item?.quantity) || 0,
                                    tokenDifficulty: item?.tokenDifficulty,
                                    customTokenPerUnit:
                                      Number(item?.customTokenPerUnit) > 0
                                        ? Number(item?.customTokenPerUnit)
                                        : undefined,
                                    cookiePrice:
                                      Number(item?.cookiePrice) > 0
                                        ? Number(item?.cookiePrice)
                                        : undefined,
                                    addOns: item?.addOns ?? [],
                                    notes: item?.notes ?? "",
                                  };
                                  const nextAutoQuantity =
                                    getAutoQuantityForItem(nextProbeItem);
                                  clearParsedPricingOverride(index);
                                  setValue(
                                    `items.${index}.productName`,
                                    nextSelection.productName,
                                    {
                                      shouldValidate: true,
                                    },
                                  );
                                  setValue(
                                    `items.${index}.size`,
                                    nextSelection.size,
                                    { shouldValidate: true },
                                  );
                                  if (typeof nextAutoQuantity === "number") {
                                    setValue(
                                      `items.${index}.quantity`,
                                      nextAutoQuantity,
                                      {
                                        shouldValidate: true,
                                      },
                                    );
                                  }
                                }}
                              >
                                {products.map((product) => (
                                  <option
                                    key={product.name}
                                    value={product.name}
                                  >
                                    {product.name}
                                  </option>
                                ))}
                              </Select>
                            ) : (
                              <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
                                {normalizedSelection.productName || "-"}
                              </div>
                            )}
                            {itemGrabCarOnly && (
                              <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">
                                GrabCar only
                              </span>
                            )}
                          </label>

                          <label className="grid gap-2 text-sm font-medium text-gray-700">
                            Varian / Size
                            {isCustomCookiesItem ? (
                              <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
                                Mixed by difficulty
                              </div>
                            ) : hasMultipleVariants ? (
                              <Select
                                {...register(`items.${index}.size`)}
                                value={normalizedSelection.size}
                                onChange={(event) => {
                                  const nextSize = event.target.value;
                                  const nextProbeItem: BookingItemInput = {
                                    category: normalizedSelection.category,
                                    subcategory:
                                      normalizedSelection.subcategory,
                                    productName:
                                      normalizedSelection.productName,
                                    size: nextSize,
                                    quantity: Number(item?.quantity) || 0,
                                    tokenDifficulty: item?.tokenDifficulty,
                                    customTokenPerUnit:
                                      Number(item?.customTokenPerUnit) > 0
                                        ? Number(item?.customTokenPerUnit)
                                        : undefined,
                                    cookiePrice:
                                      Number(item?.cookiePrice) > 0
                                        ? Number(item?.cookiePrice)
                                        : undefined,
                                    addOns: item?.addOns ?? [],
                                    notes: item?.notes ?? "",
                                  };
                                  const nextAutoQuantity =
                                    getAutoQuantityForItem(nextProbeItem);
                                  clearParsedPricingOverride(index);
                                  setValue(`items.${index}.size`, nextSize, {
                                    shouldValidate: true,
                                  });
                                  if (typeof nextAutoQuantity === "number") {
                                    setValue(
                                      `items.${index}.quantity`,
                                      nextAutoQuantity,
                                      {
                                        shouldValidate: true,
                                      },
                                    );
                                  }
                                }}
                              >
                                {displayVariants.map((sizeOption) => (
                                  <option
                                    key={sizeOption.label}
                                    value={sizeOption.label}
                                  >
                                    {getReadableVariantLabel({
                                      ...bouquetProbeItem,
                                      size: sizeOption.label,
                                    })}{" "}
                                    ({formatCurrency(sizeOption.price)})
                                  </option>
                                ))}
                              </Select>
                            ) : (
                              <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
                                {getReadableVariantLabel(bouquetProbeItem)}
                              </div>
                            )}
                            {deliveryMethod === "ASSISTED_PAXEL" &&
                              isBouquet && (
                                <span className="text-[11px] font-normal leading-4 text-gray-500">
                                  Paxel untuk bouquet hanya mendukung varian
                                  Large/XL.
                                </span>
                              )}
                          </label>

                          <label className="grid gap-1.5 text-sm font-medium text-gray-700">
                            {quantityRule.label}
                            <Input
                              type="number"
                              min={quantityRule.min}
                              max={quantityRule.max}
                              step={1}
                              {...register(`items.${index}.quantity`, {
                                valueAsNumber: true,
                                onChange: () => {
                                  clearParsedPricingOverride(index);
                                },
                                onBlur: (event) => {
                                  const parsed =
                                    Number(event.target.value) || 0;
                                  const minQty = quantityRule.min;
                                  if (parsed > 0 && parsed < minQty) {
                                    setValue(
                                      `items.${index}.quantity`,
                                      minQty,
                                      {
                                        shouldValidate: true,
                                      },
                                    );
                                  }
                                },
                                validate: (value) => {
                                  const quantity = Number(value) || 0;
                                  if (quantity < quantityRule.min) {
                                    return getQuantityRuleViolationMessage(
                                      quantityRule,
                                    );
                                  }
                                  if (
                                    typeof quantityRule.max === "number" &&
                                    quantity > quantityRule.max
                                  ) {
                                    return getQuantityRuleViolationMessage(
                                      quantityRule,
                                    );
                                  }
                                  return true;
                                },
                              })}
                            />
                            {quantityRule.helperText && (
                              <span className="min-h-4 text-[11px] font-normal leading-4 text-gray-500">
                                {quantityRule.helperText}
                              </span>
                            )}
                            {isCustomCookiesItem && (
                              <label className="grid gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-[12px] font-medium text-emerald-900">
                                Jumlah Design Cookies
                                <Input
                                  type="number"
                                  min={1}
                                  max={100}
                                  placeholder="contoh: 7"
                                  {...register(`items.${index}.designCount`, {
                                    setValueAs: (value) =>
                                      normalizeCookieDesignCount(value),
                                    onChange: (event) => {
                                      clearParsedPricingOverride(index);
                                      const nextDesignCount =
                                        normalizeCookieDesignCount(
                                          event.target.value,
                                        ) ?? 0;
                                      setValue(
                                        `items.${index}.additionalDesignCount`,
                                        getAdditionalCookieDesignCount(
                                          nextDesignCount,
                                        ),
                                        {
                                          shouldValidate: true,
                                        },
                                      );
                                    },
                                  })}
                                />
                                <span className="min-h-4 text-[11px] font-normal leading-4 text-emerald-700">
                                  Maks {COOKIE_INCLUDED_DESIGN_LIMIT} design
                                  tanpa surcharge. Di atas itu dikenakan{" "}
                                  {formatCurrency(
                                    customCookieAdditionalDesignUnitPrice,
                                  )}{" "}
                                  per design tambahan.
                                </span>
                              </label>
                            )}
                            {isCustomCookiesItem && (
                              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                                <div className="mb-1.5 flex items-center justify-between">
                                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                                    Breakdown Difficulty
                                  </span>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="h-6 border-indigo-200 px-2 text-[11px] text-indigo-700"
                                    onClick={() => {
                                      clearParsedPricingOverride(index);
                                      const nextRows: CookieDifficultyRow[] = [
                                        ...cookieDifficultyRows,
                                        {
                                          difficulty:
                                            "SIMPLE" as TokenDifficultyValue,
                                          quantity: 1,
                                        },
                                      ];
                                      const nextTotal = nextRows.reduce(
                                        (sum, row) =>
                                          sum + Math.max(0, row.quantity),
                                        0,
                                      );
                                      const nextBreakdown =
                                        mergeCookieBreakdownIntoNotes(nextRows);
                                      setValue(
                                        `items.${index}.quantity`,
                                        nextTotal,
                                        {
                                          shouldValidate: true,
                                        },
                                      );
                                      setValue(
                                        `items.${index}.tokenDifficulty`,
                                        nextRows[0]?.difficulty || "SIMPLE",
                                        { shouldValidate: true },
                                      );
                                      setValue(
                                        `items.${index}.cookieDifficultyBreakdown`,
                                        nextBreakdown,
                                        {
                                          shouldValidate: true,
                                        },
                                      );
                                    }}
                                  >
                                    <Plus size={12} className="mr-1" />
                                    Tambah
                                  </Button>
                                </div>
                                <div className="space-y-1.5">
                                  {cookieDifficultyRows.map((row, rowIndex) => (
                                    <div
                                      key={`${row.difficulty}-${rowIndex}`}
                                      className="grid grid-cols-[1fr_1fr_auto] items-center gap-1.5"
                                    >
                                      <Input
                                        type="number"
                                        min={1}
                                        step={1}
                                        value={row.quantity}
                                        onChange={(event) => {
                                          clearParsedPricingOverride(index);
                                          const nextRows =
                                            cookieDifficultyRows.map(
                                              (entry, entryIndex) =>
                                                entryIndex === rowIndex
                                                  ? {
                                                      ...entry,
                                                      quantity: Math.max(
                                                        1,
                                                        Number(
                                                          event.target.value,
                                                        ) || 1,
                                                      ),
                                                    }
                                                  : entry,
                                            );
                                          const nextTotal = nextRows.reduce(
                                            (sum, entry) =>
                                              sum + Math.max(0, entry.quantity),
                                            0,
                                          );
                                          const nextBreakdown =
                                            mergeCookieBreakdownIntoNotes(
                                              nextRows,
                                            );
                                          setValue(
                                            `items.${index}.quantity`,
                                            nextTotal,
                                            {
                                              shouldValidate: true,
                                            },
                                          );
                                          setValue(
                                            `items.${index}.cookieDifficultyBreakdown`,
                                            nextBreakdown,
                                            {
                                              shouldValidate: true,
                                            },
                                          );
                                        }}
                                      />
                                      <Select
                                        value={row.difficulty}
                                        onChange={(event) => {
                                          clearParsedPricingOverride(index);
                                          const nextDifficulty =
                                            normalizeTokenDifficultyValue(
                                              event.target.value,
                                            );
                                          const nextRows =
                                            cookieDifficultyRows.map(
                                              (entry, entryIndex) =>
                                                entryIndex === rowIndex
                                                  ? {
                                                      ...entry,
                                                      difficulty:
                                                        nextDifficulty,
                                                    }
                                                  : entry,
                                            );
                                          const nextBreakdown =
                                            mergeCookieBreakdownIntoNotes(
                                              nextRows,
                                            );
                                          setValue(
                                            `items.${index}.tokenDifficulty`,
                                            nextRows[0]?.difficulty || "SIMPLE",
                                            {
                                              shouldValidate: true,
                                            },
                                          );
                                          setValue(
                                            `items.${index}.cookieDifficultyBreakdown`,
                                            nextBreakdown,
                                            {
                                              shouldValidate: true,
                                            },
                                          );
                                        }}
                                      >
                                        {TOKEN_DIFFICULTY_OPTIONS.map(
                                          (option) => (
                                            <option
                                              key={option.value}
                                              value={option.value}
                                            >
                                              {option.label}
                                            </option>
                                          ),
                                        )}
                                      </Select>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="h-9 border-rose-200 px-2 text-rose-600"
                                        disabled={
                                          cookieDifficultyRows.length <= 1
                                        }
                                        onClick={() => {
                                          clearParsedPricingOverride(index);
                                          const nextRows =
                                            cookieDifficultyRows.filter(
                                              (_entry, entryIndex) =>
                                                entryIndex !== rowIndex,
                                            );
                                          if (!nextRows.length) return;
                                          const nextTotal = nextRows.reduce(
                                            (sum, entry) =>
                                              sum + Math.max(0, entry.quantity),
                                            0,
                                          );
                                          const nextBreakdown =
                                            mergeCookieBreakdownIntoNotes(
                                              nextRows,
                                            );
                                          setValue(
                                            `items.${index}.quantity`,
                                            nextTotal,
                                            {
                                              shouldValidate: true,
                                            },
                                          );
                                          setValue(
                                            `items.${index}.tokenDifficulty`,
                                            nextRows[0]?.difficulty || "SIMPLE",
                                            {
                                              shouldValidate: true,
                                            },
                                          );
                                          setValue(
                                            `items.${index}.cookieDifficultyBreakdown`,
                                            nextBreakdown,
                                            {
                                              shouldValidate: true,
                                            },
                                          );
                                        }}
                                      >
                                        <Trash2 size={13} />
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {cookieDifficultyBreakdown && (
                              <span className="min-h-4 text-[11px] font-medium leading-4 text-indigo-700">
                                Komposisi difficulty:{" "}
                                {cookieDifficultyBreakdown}
                              </span>
                            )}
                            {quantityError && (
                              <span className="min-h-4 text-[11px] font-normal leading-4 text-rose-600">
                                {quantityError}
                              </span>
                            )}
                          </label>

                          {isCustomCookieSharingBox && (
                            <label className="grid gap-1.5 text-sm font-medium text-gray-700">
                              Override Harga Sharing Box
                              <Input
                                type="number"
                                min={0}
                                step={1000}
                                placeholder={String(displayUnitPrice)}
                                {...register(
                                  `items.${index}.sharingBoxPriceOverride`,
                                  {
                                    setValueAs: (value) =>
                                      normalizeSharingBoxPriceOverrideValue(
                                        value,
                                      ),
                                    onChange: () => {
                                      clearParsedPricingOverride(index);
                                    },
                                  },
                                )}
                              />
                              <span className="min-h-4 text-[11px] font-normal leading-4 text-gray-500">
                                Kosongkan jika ingin pakai harga default dari
                                katalog.
                              </span>
                            </label>
                          )}

                          {supportsDifficulty && !isCustomCookiesItem && (
                            <label className="grid gap-1.5 text-sm font-medium text-gray-700">
                              Difficulty Token
                              <Select
                                {...register(`items.${index}.tokenDifficulty`)}
                                defaultValue={item?.tokenDifficulty || "SIMPLE"}
                              >
                                {TOKEN_DIFFICULTY_OPTIONS.map((option) => (
                                  <option
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label} ({option.token})
                                  </option>
                                ))}
                              </Select>
                            </label>
                          )}

                          {isBouquet && (
                            <label className="grid gap-1.5 text-sm font-medium text-gray-700">
                              Override Harga Buket
                              <Input
                                type="number"
                                min={0}
                                step={1000}
                                placeholder={String(displayUnitPrice)}
                                {...register(
                                  `items.${index}.bouquetPriceOverride`,
                                  {
                                    setValueAs: (value) =>
                                      normalizeBouquetPriceOverrideValue(value),
                                    onChange: () => {
                                      clearParsedPricingOverride(index);
                                    },
                                  },
                                )}
                              />
                              <span className="min-h-4 text-[11px] font-normal leading-4 text-gray-500">
                                {bouquetPriceOverride !== undefined
                                  ? `Override harga buket aktif: ${formatCurrency(bouquetPriceOverride)}.`
                                  : "Kosongkan jika ingin pakai harga default start from katalog."}
                              </span>
                              <span className="min-h-4 text-[11px] font-normal leading-4 text-gray-500">
                                Token bouquet fixed: Hand = 20, Standing = 50
                                per bouquet.
                              </span>
                              {bouquetLineTotal !== null && (
                                <span className="text-[11px] font-normal leading-4 text-indigo-600">
                                  Estimasi subtotal bouquet:{" "}
                                  {formatCurrency(bouquetLineTotal)}
                                </span>
                              )}
                            </label>
                          )}

                          {isBouquet && (
                            <label className="grid gap-1.5 text-sm font-medium text-gray-700 sm:col-span-2 lg:col-span-4">
                              Kartu Ucapan
                              <Textarea
                                className="min-h-20"
                                placeholder="Contoh: Happy Birthday Elliora!"
                                {...register(`items.${index}.greetingCard`)}
                              />
                            </label>
                          )}

                          <label className="grid gap-1.5 text-sm font-medium text-gray-700 sm:col-span-2 lg:col-span-4">
                            Customer Notes
                            <Input
                              placeholder="Decoration instructions"
                              {...register(`items.${index}.notes`)}
                            />
                          </label>

                          {isBouquet && (
                            <div className="grid gap-2 sm:col-span-2 lg:col-span-4 sm:grid-cols-2">
                              <label className="grid gap-1.5 text-sm font-medium text-gray-700">
                                Warna kertas bouquet
                                <Input
                                  placeholder="Contoh: No 13"
                                  {...register(
                                    `items.${index}.bouquetPaperColor`,
                                  )}
                                />
                              </label>
                              <label className="grid gap-1.5 text-sm font-medium text-gray-700">
                                Ribbon
                                <Input
                                  placeholder="Contoh: Satin"
                                  {...register(`items.${index}.ribbon`)}
                                />
                              </label>
                              <label className="grid gap-1.5 text-sm font-medium text-gray-700">
                                Jumlah Bunga
                                <Input
                                  placeholder="Contoh: - / 3 bunga"
                                  {...register(`items.${index}.flowerCount`)}
                                />
                              </label>
                              <label className="grid gap-1.5 text-sm font-medium text-gray-700">
                                Warna Bunga
                                <Input
                                  placeholder="Contoh: Putih"
                                  {...register(`items.${index}.flowerColor`)}
                                />
                              </label>
                              <label className="grid gap-1.5 text-sm font-medium text-gray-700 sm:col-span-2">
                                Warna Pita
                                <Input
                                  placeholder="Contoh: Blue pastel"
                                  {...register(`items.${index}.ribbonColor`)}
                                />
                              </label>
                            </div>
                          )}
                        </div>

                        {hasParsedRecapPrice && (
                          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                            Harga dari recap aktif
                            {parsedUnitPrice
                              ? ` • Harga satuan ${formatCurrency(parsedUnitPrice)}`
                              : ""}
                            {parsedSubtotal
                              ? ` • Subtotal ${formatCurrency(parsedSubtotal)}`
                              : ""}
                            {customCookieAdditionalDesignCharge > 0
                              ? ` • Surcharge design +${formatCurrency(customCookieAdditionalDesignCharge)}`
                              : ""}
                            {cookieDifficultyBreakdown
                              ? ` • Komposisi ${cookieDifficultyBreakdown}`
                              : ""}
                            . Jika produk, size, atau qty diubah, override ini
                            akan otomatis direset.
                          </div>
                        )}

                        <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-700">
                          Estimasi token item ini: {itemTokenPreview}
                          {hasCustomTokenOverride
                            ? " (custom token override)"
                            : ""}
                          {isTwoTierCake && !hasCustomTokenOverride
                            ? " • Two-tier dihitung sebagai 2 cake (100 + 100 token) tapi tetap 1 item."
                            : ""}
                        </div>

                        {flavorOptions.length > 0 && (
                          <label className="grid gap-1.5 text-sm font-medium text-gray-700 sm:max-w-2xl">
                            <span className="flex items-center justify-between">
                              <span>Choose Flavor</span>
                              <span className="text-[11px] font-normal text-gray-500">
                                1 flavor per item
                              </span>
                            </span>

                            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                              {regularFlavorOptions.map((option) => {
                                const checked = selectedFlavorId === option.id;
                                const shortCode = option.shortCodes?.[0] || "";

                                return (
                                  <label
                                    key={option.id}
                                    className={`flex items-center justify-between rounded-xl border px-3 py-1.5 text-sm transition ${
                                      checked
                                        ? "border-indigo-300 bg-indigo-50 text-indigo-800"
                                        : "border-gray-200 bg-gray-50 text-gray-700"
                                    }`}
                                  >
                                    <span className="flex items-center gap-2">
                                      <span>{option.label}</span>
                                      {shortCode && (
                                        <span className="rounded-md border border-gray-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
                                          {shortCode}
                                        </span>
                                      )}
                                    </span>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() =>
                                        toggleItemFlavor(
                                          index,
                                          normalizedSelection.category,
                                          option.id,
                                        )
                                      }
                                      className="h-4 w-4 accent-indigo-600"
                                    />
                                  </label>
                                );
                              })}
                            </div>

                            {premiumFlavorOptions.length > 0 && (
                              <>
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                                  Premium Flavors (Surcharge)
                                </span>
                                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                                  {premiumFlavorOptions.map((option) => {
                                    const checked =
                                      selectedFlavorId === option.id;
                                    const shortCode =
                                      option.shortCodes?.[0] || "";

                                    return (
                                      <label
                                        key={option.id}
                                        className={`flex items-center justify-between rounded-xl border px-3 py-1.5 text-sm transition ${
                                          checked
                                            ? "border-amber-300 bg-amber-50 text-amber-900"
                                            : "border-amber-200 bg-amber-50/60 text-gray-700"
                                        }`}
                                      >
                                        <span className="flex items-center gap-2">
                                          <span>{option.label}</span>
                                          {shortCode && (
                                            <span className="rounded-md border border-amber-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                                              {shortCode}
                                            </span>
                                          )}
                                          {option.price > 0 && (
                                            <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                                              +
                                              {formatCompactSurcharge(
                                                option.price,
                                              )}
                                              /cake
                                            </span>
                                          )}
                                        </span>
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() =>
                                            toggleItemFlavor(
                                              index,
                                              normalizedSelection.category,
                                              option.id,
                                            )
                                          }
                                          className="h-4 w-4 accent-amber-600"
                                        />
                                      </label>
                                    );
                                  })}
                                </div>
                              </>
                            )}

                            <span className="min-h-4 text-[11px] font-normal leading-4 text-gray-500">
                              {flavorGuideText}
                            </span>
                          </label>
                        )}

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Add-ons
                            </span>
                            <span className="text-[11px] font-medium text-slate-500">
                              {selectedNonFlavorAddOns.length +
                                customAddOns.length}{" "}
                              dipilih
                              {selectedNonFlavorAddOns.length > 0 ||
                              customAddOns.length > 0
                                ? ` • ${formatCurrency(selectedNonFlavorAddOnTotal + customAddOnTotal)}`
                                : ""}
                            </span>
                          </div>
                          <div className="grid gap-1.5 sm:grid-cols-3">
                            {nonFlavorAddOns.map((addon) => {
                              const checked =
                                item?.addOns?.includes(addon.id) ?? false;
                              const overriddenPrice =
                                normalizedAddOnPriceOverrides[addon.id];
                              const baseUnitPrice =
                                overriddenPrice !== undefined
                                  ? overriddenPrice
                                  : addon.price;
                              const dynamicBubblewrapUnitPrice =
                                resolveBubblewrapUnitPrice({
                                  category: normalizedSelection.category,
                                  addonId: addon.id,
                                  defaultPrice: baseUnitPrice,
                                  itemSelection: {
                                    category: normalizedSelection.category,
                                    subcategory:
                                      normalizedSelection.subcategory,
                                    productName:
                                      normalizedSelection.productName,
                                    size: normalizedSelection.size,
                                  },
                                });
                              const supportsQuantity = supportsAddOnQuantity(
                                normalizedSelection.category,
                                addon.id,
                              );
                              const perCakeUnits = getAddOnUnitMultiplier({
                                category: normalizedSelection.category,
                                addonId: addon.id,
                                addOnQuantities: normalizedAddOnQuantities,
                              });
                              const effectiveUnitPrice =
                                (normalizedSelection.category === "Buket"
                                  ? (getBouquetFlowerAddOnUnitPrice({
                                      addonId: addon.id,
                                      bouquetType,
                                    }) ?? dynamicBubblewrapUnitPrice)
                                  : dynamicBubblewrapUnitPrice) * perCakeUnits;

                              return (
                                <div
                                  key={addon.id}
                                  className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-700"
                                >
                                  <span className="min-w-0">
                                    {addon.label}{" "}
                                    <span className="text-xs text-gray-400">
                                      {formatCurrency(effectiveUnitPrice)}
                                      {supportsQuantity
                                        ? ` / item (${perCakeUnits}x)`
                                        : ""}
                                      {overriddenPrice !== undefined
                                        ? " (adjusted)"
                                        : ""}
                                      {!isBouquetFlowerAddOnId(addon.id) &&
                                      quantityValue > 0
                                        ? ` (x${quantityValue} = ${formatCurrency(effectiveUnitPrice * quantityValue)})`
                                        : ""}
                                    </span>
                                  </span>
                                  <span className="flex items-center gap-2">
                                    {supportsQuantity && checked && (
                                      <Input
                                        type="number"
                                        min={1}
                                        step={1}
                                        value={perCakeUnits}
                                        onChange={(event) =>
                                          setItemAddOnQuantity(
                                            index,
                                            addon.id,
                                            Number(event.target.value),
                                          )
                                        }
                                        className="h-8 w-16"
                                      />
                                    )}
                                    {checked &&
                                      addon.id !==
                                        DARK_COLOR_BUTTERCREAM_ADDON_ID &&
                                      !isBouquetFlowerAddOnId(addon.id) &&
                                      !isCupcakeCookieAddOnId(addon.id) && (
                                        <Input
                                          type="number"
                                          min={0}
                                          step={1000}
                                          value={
                                            overriddenPrice !== undefined
                                              ? overriddenPrice
                                              : ""
                                          }
                                          placeholder={String(addon.price)}
                                          onChange={(event) =>
                                            setItemAddOnPriceOverride(
                                              index,
                                              addon.id,
                                              event.target.value,
                                            )
                                          }
                                          className="h-8 w-24"
                                        />
                                      )}
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() =>
                                        toggleItemAddOn(index, addon.id)
                                      }
                                      className="h-4 w-4 accent-indigo-600"
                                    />
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                                Add-on Custom
                              </span>
                              <Button
                                type="button"
                                variant="outline"
                                className="h-7 border-indigo-200 px-2 text-[11px] font-medium text-indigo-700"
                                onClick={() => addCustomAddOn(index)}
                              >
                                + Tambah
                              </Button>
                            </div>
                            {customAddOns.length === 0 ? (
                              <p className="text-[11px] text-slate-500">
                                Gunakan jika kebutuhan add-on tidak ada di list.
                              </p>
                            ) : (
                              <div className="space-y-1.5">
                                {customAddOns.map(
                                  (customAddOn, customIndex) => (
                                    <div
                                      key={`${customAddOn.label}-${customIndex}`}
                                      className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_130px_auto]"
                                    >
                                      <Input
                                        value={customAddOn.label}
                                        placeholder="Nama add-on custom"
                                        onChange={(event) =>
                                          setCustomAddOnLabel(
                                            index,
                                            customIndex,
                                            event.target.value,
                                          )
                                        }
                                      />
                                      <Input
                                        type="number"
                                        min={0}
                                        step={1}
                                        value={customAddOn.price}
                                        placeholder="Harga"
                                        onChange={(event) =>
                                          setCustomAddOnPrice(
                                            index,
                                            customIndex,
                                            Number(event.target.value),
                                          )
                                        }
                                      />
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="h-9 border-rose-200 px-2 text-xs text-rose-600"
                                        onClick={() =>
                                          removeCustomAddOn(index, customIndex)
                                        }
                                      >
                                        Hapus
                                      </Button>
                                    </div>
                                  ),
                                )}
                              </div>
                            )}
                          </div>
                          <div className="sticky bottom-2 z-10 rounded-xl border border-emerald-200 bg-linear-to-r from-emerald-50 via-white to-emerald-50 px-3 py-2.5 shadow-sm backdrop-blur-sm">
                            <div className="flex flex-wrap items-center justify-between gap-1.5">
                              <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                                Total Biaya Item
                              </span>
                              <span className="text-sm font-bold text-emerald-800 sm:text-base">
                                {formatCurrency(itemTotalCostDisplay)}
                                <span>
                                  Add-on custom:{" "}
                                  {formatCurrency(customAddOnTotal)}
                                </span>
                              </span>
                            </div>
                            <div className="mt-1 grid gap-1 text-[11px] text-slate-600 sm:grid-cols-3">
                              <span>
                                Subtotal produk:{" "}
                                {formatCurrency(displayLinePrice)}
                              </span>
                              <span>
                                Total add-ons + surcharge:{" "}
                                {formatCurrency(totalAddOnAndSurchargeDisplay)}
                              </span>
                            </div>
                            <p className="mt-1 text-[11px] font-medium text-slate-500">
                              {hasParsedRecapPrice && parsedSubtotal
                                ? customCookieAdditionalDesignCharge > 0
                                  ? "Sumber angka: recap parser + surcharge design tambahan."
                                  : "Sumber angka: recap parser (override aktif)."
                                : customCookieAdditionalDesignCharge > 0
                                  ? "Sumber angka: subtotal produk + add-ons + surcharge design dinamis."
                                  : "Sumber angka: subtotal produk + semua add-ons terpilih."}
                            </p>
                          </div>
                        </div>

                        {(selectedNonFlavorAddOns.length > 0 ||
                          customAddOns.length > 0) && (
                          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                            {[
                              ...selectedFlowerAddOns.map(
                                (addon) => addon.label,
                              ),
                              ...selectedOtherAddOns.map((addon) => {
                                const units = getAddOnUnitMultiplier({
                                  category: normalizedSelection.category,
                                  addonId: addon.id,
                                  addOnQuantities: normalizedAddOnQuantities,
                                });
                                return units > 1
                                  ? `${addon.label} x${units}`
                                  : addon.label;
                              }),
                              ...customAddOns.map(
                                (entry) =>
                                  `${entry.label} (${formatCurrency(entry.price)} / item)`,
                              ),
                            ].join(", ")}
                          </div>
                        )}

                        {hasDarkColorButtercream && (
                          <label className="grid gap-1.5 text-sm font-medium text-gray-700 sm:max-w-sm">
                            Pilih Warna Dark Color (maks. 3)
                            <div className="grid gap-1.5 sm:grid-cols-2">
                              {DARK_BUTTERCREAM_COLOR_OPTIONS.map((color) => {
                                const checked =
                                  selectedDarkButtercreamColors.includes(color);
                                const disableNewSelection =
                                  !checked &&
                                  selectedDarkButtercreamColors.length >=
                                    MAX_DARK_BUTTERCREAM_COLORS;

                                return (
                                  <label
                                    key={color}
                                    className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-700"
                                  >
                                    <span>{color}</span>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={disableNewSelection}
                                      onChange={() =>
                                        toggleDarkButtercreamColor(index, color)
                                      }
                                      className="h-4 w-4 accent-indigo-600"
                                    />
                                  </label>
                                );
                              })}
                            </div>
                            <span className="min-h-4 text-[11px] font-normal leading-4 text-gray-500">
                              Dipilih:{" "}
                              {selectedDarkButtercreamColors.join(", ") ||
                                "belum ada"}
                              . Dark color additional charge 50k / item.
                            </span>
                          </label>
                        )}

                        {itemFields.length > 1 && (
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 gap-1 border-rose-200 text-rose-600 hover:bg-rose-50"
                            onClick={() => removeItem(index)}
                          >
                            <Trash2 size={14} />
                            Remove Item
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <DeliverySection
                register={register}
                errors={errors}
                addressFields={addressFields}
                appendAddress={appendAddress}
                removeAddress={removeAddress}
                autofillPostalCodeFromAddress={autofillPostalCodeFromAddress}
                shouldUseShippingEngine={shouldUseShippingEngine}
                isCheckingShipping={isCheckingShipping}
                selectableDeliveryMethodOptions={selectableDeliveryMethodOptions}
                deliveryMethod={deliveryMethod}
                isCarRideHailingMethod={isCarRideHailingMethod}
                shippingWeightSummary={shippingWeightSummary}
                isFragileOrder={isFragileOrder}
                isAllowedFragileOrderMethod={isAllowedFragileOrderMethod}
                fragileOrderReasons={fragileOrderReasons}
                displayedShippingDistanceKm={displayedShippingDistanceKm}
                shippingDistanceSource={shippingDistanceSource || ""}
                shippingWarning={shippingWarning}
                shippingFallbackMessage={shippingFallbackMessage}
                filteredShippingQuotes={filteredShippingQuotes}
                cheapestShippingQuote={cheapestShippingQuote}
                fastestShippingQuote={fastestShippingQuote}
                displayedShippingQuotes={displayedShippingQuotes}
                selectedShippingQuoteId={selectedShippingQuoteId}
                setSelectedShippingQuoteId={setSelectedShippingQuoteId}
                showAllShippingOptions={showAllShippingOptions}
                setShowAllShippingOptions={setShowAllShippingOptions}
                shippingPayload={shippingPayload}
                isAddressTooShortForShipping={isAddressTooShortForShipping}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-gray-700">
                Payment Status
                <Select {...register("paymentStatus")}>
                  <option value="DP Paid">DP 50%</option>
                  <option value="Paid">Lunas</option>
                </Select>
              </label>

              <label className="grid gap-2 text-sm font-medium text-gray-700">
                Discount Grosir
                <Select
                  {...register("wholesaleDiscountPercent", {
                    valueAsNumber: true,
                  })}
                >
                  <option value={0}>Tanpa Diskon</option>
                  <option value={10}>Diskon 10%</option>
                  <option value={15}>Diskon 15%</option>
                  <option value={20}>Diskon 20%</option>
                </Select>
              </label>

              <label className="grid gap-2 text-sm font-medium text-gray-700">
                Manual Adjustment (+/-)
                <Input
                  type="number"
                  step="1000"
                  {...register("manualAdjustment", { valueAsNumber: true })}
                />
              </label>
            </div>

            <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm text-indigo-800">
              <p className="font-semibold">
                Pembayaran otomatis dari pilihan status:
              </p>
              <p className="mt-1">
                {selectedPaymentStatus === "Paid"
                  ? "Jika pilih Lunas, sistem otomatis set pembayaran 100% dari total pesanan."
                  : `Jika pilih DP 50%, sistem otomatis set DP sebesar ${formatCurrency(
                      suggestedDownPaymentAmount,
                    )}.`}
              </p>
            </div>

            <label className="grid gap-2 text-sm font-medium text-gray-700">
              Notes
              <Textarea
                placeholder="Special handling, color palette, pickup notes"
                {...register("customNotes")}
              />
            </label>

            <div className="flex flex-wrap gap-3">
              <Button
                type="submit"
                className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:ring-indigo-500"
                disabled={
                  isSubmitting ||
                  isBookingCreationInFlight ||
                  isManualSubmitInFlight ||
                  isCapacityValidating ||
                  isCheckingShipping ||
                  isBlockedDate ||
                  isCalendarDateInvalid ||
                  dbWillExceed
                }
              >
                {isSubmitting ||
                isManualSubmitInFlight ||
                isBookingCreationInFlight
                  ? "Saving Booking..."
                  : isCapacityValidating
                    ? "Validating Capacity..."
                    : "Create Booking"}
              </Button>
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  reset();
                  setSubmitError("");
                  setSubmitSuccess("");
                  setSubmitSuccessMeta(null);
                  setQuickPaste("");
                  setSelectedOrderType("unknown");
                  setShowOrderTypeSelector(false);
                  setParsedPreview(null);
                  setProductionPreviewImageUrl("");
                  setVisionRawOutput("");
                  setDraftImported(false);
                  setShippingQuotes([]);
                  setSelectedShippingQuoteId("");
                  setShippingDistanceKm(null);
                  setShippingDistanceSource(undefined);
                  setShippingWarning("");
                  setShowSubmitConfirmation(false);
                  pendingSubmitConfirmationRef.current = null;
                  skipSubmitConfirmationRef.current = false;
                  setDuplicateTemplateWarning(null);
                  pendingDuplicateSubmissionRef.current = null;
                  skipDuplicateTemplateWarningRef.current = false;
                }}
                className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                disabled={
                  isSubmitting ||
                  isManualSubmitInFlight ||
                  isBookingCreationInFlight
                }
              >
                Reset Form
              </Button>
            </div>
            {submitError ? (
              <p className="text-sm font-medium text-rose-600">{submitError}</p>
            ) : null}
            {submitSuccess ? (
              <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                <p className="font-semibold">{submitSuccess}</p>
                {submitSuccessMeta ? (
                  <div className="space-y-1">
                    <p>
                      Status: <span className="font-semibold">Submitted</span>
                    </p>
                    <p>
                      Kode Booking:{" "}
                      <span className="font-semibold">
                        {submitSuccessMeta.bookingCode}
                      </span>
                    </p>
                    <p>
                      Waktu Submit:{" "}
                      {formatSubmitTimestamp(submitSuccessMeta.submittedAt)}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <PriceSummaryCard
            basePrice={basePrice}
            addOnTotal={addOnTotal}
            deliveryFee={deliveryFee}
            insuranceFee={insuranceFee}
            serviceCharge={serviceCharge}
            manualAdjustment={Number(manualAdjustment || 0)}
            wholesaleDiscountPercent={Number(wholesaleDiscountPercent || 0)}
            wholesaleDiscountAmount={wholesaleDiscountAmount}
            totalPrice={totalPrice}
            categoryBreakdown={categoryPriceBreakdown}
            paymentStatus={effectivePaymentStatus}
            paymentPaidAmount={totalPaid}
            paymentRemainingAmount={remainingBalance}
          />
        </div>
      </div>

      {showSubmitConfirmation ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/35 px-4 py-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Konfirmasi submit booking"
            className="w-full max-w-lg rounded-2xl border border-indigo-200 bg-white p-5 shadow-2xl"
          >
            <p className="text-base font-semibold text-indigo-900">
              Konfirmasi Sebelum Submit
            </p>
            <p className="mt-2 text-sm text-indigo-800">
              Pastikan orderan sudah dicek dan semua data sudah benar sebelum
              lanjut simpan booking.
            </p>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-gray-300"
                onClick={closeSubmitConfirmationReminder}
                disabled={isManualSubmitInFlight || isBookingCreationInFlight}
              >
                Batal Dulu
              </Button>
              <Button
                ref={submitConfirmationPrimaryButtonRef}
                type="button"
                className="bg-indigo-600 text-white hover:bg-indigo-700"
                onClick={confirmSubmitAfterReminder}
                disabled={isManualSubmitInFlight || isBookingCreationInFlight}
              >
                Ya, Sudah Dicek
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {duplicateTemplateWarning ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 py-6">
          <div
            ref={duplicateWarningDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Peringatan Potensi Double Order"
            className="relative w-full max-w-2xl rounded-2xl border border-amber-200 bg-white p-5 shadow-2xl"
          >
            <Button
              type="button"
              variant="ghost"
              className="absolute right-3 top-3 h-8 w-8 text-amber-700 hover:bg-amber-100 hover:text-amber-900"
              onClick={closeDuplicateTemplateWarning}
              aria-label="Tutup peringatan"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
            <p className="text-base font-semibold text-amber-900">
              Peringatan Potensi Double Order
            </p>
            <p className="mt-2 text-sm text-amber-800">
              Parsing template yang sama persis atau sangat mirip sudah pernah
              dipakai di booking lain. Silakan cek dulu daftar booking untuk
              memastikan bukan order duplikat, atau lanjutkan jika memang order
              baru.
            </p>

            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                Cuplikan Template
              </p>
              <p className="mt-1 whitespace-pre-wrap wrap-break-word text-xs text-amber-900">
                {duplicateTemplateWarning.templatePreview}
              </p>
            </div>

            <div className="mt-3 max-h-44 space-y-2 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3">
              {duplicateTemplateWarning.matches.map((match) => (
                <NextLink
                  key={match.id}
                  href={`/bakery/bookings/${match.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 hover:border-indigo-300 hover:bg-indigo-50"
                >
                  <p className="font-semibold text-gray-900">
                    {match.bookingLabel}
                  </p>
                  <p className="mt-0.5">
                    {match.customerName} • {match.deliveryDateLabel}
                  </p>
                  <p
                    className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      match.matchType === "exact"
                        ? "border-rose-200 bg-rose-50 text-rose-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {match.similarityLabel}
                  </p>
                </NextLink>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button
                ref={duplicateWarningPrimaryButtonRef}
                type="button"
                variant="outline"
                className="border-gray-300"
                onClick={openDetectedDuplicateBooking}
                disabled={isManualSubmitInFlight || isBookingCreationInFlight}
              >
                Cek Booking Dulu
              </Button>
              <Button
                type="button"
                className="bg-amber-600 text-white hover:bg-amber-700"
                onClick={continueDuplicateTemplateSubmission}
                disabled={isManualSubmitInFlight || isBookingCreationInFlight}
              >
                Lanjutkan Pesan Dengan Template Sama
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {isBookingProcessing ? (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200/70 bg-white/95 shadow-2xl">
            <div className="relative h-1 w-full overflow-hidden bg-slate-200">
              <div
                className="h-full bg-linear-to-r from-indigo-500 via-cyan-500 to-emerald-500 transition-[width] duration-500 ease-out"
                style={{ width: `${bookingProgressPercent}%` }}
              />
            </div>

            <div className="space-y-4 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-linear-to-br from-indigo-600 to-cyan-500 text-white shadow-lg">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-indigo-700">
                    Processing Booking
                  </p>
                  <p className="text-base font-semibold text-slate-900">
                    {bookingProgressLabel}
                  </p>
                </div>
              </div>

              <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-sm">
                <div className="flex items-center justify-between text-slate-700">
                  <span>Validasi kapasitas</span>
                  <span className="font-semibold text-slate-900">
                    {isCapacityValidating ? "Sedang diproses" : "Siap"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-700">
                  <span>Simpan booking</span>
                  <span className="font-semibold text-slate-900">
                    {isBookingCreationInFlight
                      ? "Menyimpan"
                      : isBookingProcessing
                        ? "Menunggu"
                        : "Siap"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-700">
                  <span>Sinkron data & trigger otomatis</span>
                  <span className="font-semibold text-slate-900">
                    Berjalan otomatis
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-600">
                Mohon tunggu sebentar. Jangan tutup tab agar proses booking
                selesai sempurna.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}


