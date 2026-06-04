"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload } from "lucide-react";
import {
  getDisplayFields,
  type ParsedWhatsAppOrder,
  WHATSAPP_ORDER_LABELS,
} from "@/lib/bookings/whatsapp-parser";
import {
  type ParserOrderType,
  whatsappOrderTypeOptions,
} from "./booking-form-helpers";

// ── Props interface: hanya variabel yang dibutuhkan section ini ──────────────
export interface WhatsAppParserSectionProps {
  // State values
  selectedOrderType: ParserOrderType;
  showOrderTypeSelector: boolean;
  quickPaste: string;
  referenceFileInputKey: number;
  referenceImageFiles: File[];
  referenceImageLabelsInput: string;
  referenceFilesChangedSinceParse: boolean;
  draftImported: boolean;
  parsedPreview: ParsedWhatsAppOrder | null;
  productionPreviewImageUrl: string;
  isParsingWhatsApp: boolean;
  isFetchingMarketplaceEmail: boolean;

  // State setters
  setSelectedOrderType: (value: ParserOrderType) => void;
  setShowOrderTypeSelector: (updater: boolean | ((prev: boolean) => boolean)) => void;
  setQuickPaste: (value: string) => void;
  setReferenceImageFiles: (files: File[]) => void;
  setReferenceFilesChangedSinceParse: (value: boolean) => void;
  setReferenceImageLabelsInput: (value: string) => void;
  setParsedPreview: (value: ParsedWhatsAppOrder | null) => void;
  setProductionPreviewImageUrl: (value: string) => void;
  setVisionRawOutput: (value: string) => void;
  setDraftImported: (value: boolean) => void;
  setReferenceFileInputKey: (updater: number | ((prev: number) => number)) => void;

  // Action handlers
  importDraft: () => Promise<void>;
  fetchLatestMarketplaceEmail: () => Promise<void>;
  fillManualTemplate: () => void;
}

/**
 * Section WhatsApp & Email Parser — Card pertama di BookingForm.
 * Menangani input chat WA, upload gambar referensi, parse, dan preview hasil.
 */
export default function WhatsAppParserSection({
  selectedOrderType,
  showOrderTypeSelector,
  quickPaste,
  referenceFileInputKey,
  referenceImageFiles,
  referenceImageLabelsInput,
  referenceFilesChangedSinceParse,
  draftImported,
  parsedPreview,
  productionPreviewImageUrl,
  isParsingWhatsApp,
  isFetchingMarketplaceEmail,
  setSelectedOrderType,
  setShowOrderTypeSelector,
  setQuickPaste,
  setReferenceImageFiles,
  setReferenceFilesChangedSinceParse,
  setReferenceImageLabelsInput,
  setParsedPreview,
  setProductionPreviewImageUrl,
  setVisionRawOutput,
  setDraftImported,
  setReferenceFileInputKey,
  importDraft,
  fetchLatestMarketplaceEmail,
  fillManualTemplate,
}: WhatsAppParserSectionProps) {
  return (
    <Card className="rounded-xl border-indigo-100 shadow-sm">
      <CardHeader className="p-6 pb-2">
        <CardTitle>WhatsApp &amp; Email Parser (Paste / Manual)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-6 pb-6 pt-0">
        {/* ── Info bar: mode aktif + toggle order type ────────────────────── */}
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

        {/* ── Order type selector (conditional) ──────────────────────────── */}
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

        {/* ── Chat paste textarea ────────────────────────────────────────── */}
        <Textarea
          value={quickPaste}
          onChange={(event) => setQuickPaste(event.target.value)}
          placeholder="Paste chat WA di sini. Sistem akan auto-detect format parser dari teks."
          className="min-h-28"
        />

        {/* ── Gambar referensi & label ────────────────────────────────────── */}
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
              klik Parse WhatsApp lagi supaya referensinya ter-upload. File
              besar akan diperkecil otomatis sebelum diproses.
            </span>
          </label>

          {referenceImageFiles.length > 0 ? (
            <div className="grid gap-3">
              <span className="text-sm font-medium text-gray-700">Label Desain per Gambar</span>
              {referenceImageFiles.map((file, index) => {
                const labels = referenceImageLabelsInput.split("\n");
                const currentLabel = labels[index] || "";
                return (
                  <div key={`${file.name}-${index}`} className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded border border-gray-200 bg-gray-50 flex-shrink-0 flex items-center justify-center text-xs font-semibold text-gray-500">
                      #{index + 1}
                    </div>
                    <Input
                      value={currentLabel}
                      onChange={(event) => {
                        const newLabels = [...labels];
                        while (newLabels.length <= index) {
                          newLabels.push("");
                        }
                        newLabels[index] = event.target.value;
                        setReferenceImageLabelsInput(newLabels.join("\n"));
                        if (draftImported) {
                          setReferenceFilesChangedSinceParse(true);
                        }
                      }}
                      placeholder={`Keterangan untuk gambar ${file.name}`}
                      className="flex-1 bg-white"
                    />
                  </div>
                );
              })}
              <span className="text-xs font-normal text-gray-500">
                Dipakai untuk mencocokkan gambar ke slot/template produk.
              </span>
            </div>
          ) : (
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
          )}

          {/* ── File summary ───────────────────────────────────────────── */}
          {referenceImageFiles.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
              {referenceImageFiles.length} gambar siap dipakai:{" "}
              {referenceImageFiles.map((file) => file.name).join(", ")}
            </div>
          )}

          {/* ── Warning: files changed since parse ─────────────────────── */}
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

        {/* ── Action buttons ─────────────────────────────────────────────── */}
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

        {/* ── Draft imported notice ───────────────────────────────────────── */}
        {draftImported && (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm text-indigo-700">
            Draft berhasil di-auto populate. Cek ulang semua data sebelum
            create booking.
          </div>
        )}

        {/* ── Parsed preview panel ───────────────────────────────────────── */}
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

            {/* ── Reference images info ───────────────────────────────────── */}
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

            {/* ── Production preview image ────────────────────────────────── */}
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
  );
}
