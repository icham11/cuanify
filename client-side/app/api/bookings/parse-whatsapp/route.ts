import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { loadEffectiveBookingCatalog } from "@/lib/bookings/catalog-config-server";
import { analyzeBusinessData } from "@/lib/groq";
import {
  generateOrderImage,
  type WhatsAppOrderImagePayload,
} from "@/lib/whatsapp/generateOrderImage";
import { uploadToCloudinary } from "@/lib/whatsapp/uploadToCloudinary";
import {
  buildBookingAutoFillFromParsed,
  buildParsedDetectedItems,
  buildWhatsAppTemplate,
  type BookingFormAutoFill,
  type ParsedWhatsAppOrder,
  parseWhatsAppOrderText,
  type WhatsAppOrderType,
  type WhatsAppOrderTypeOrUnknown,
  type WhatsAppSourceType,
} from "@/lib/bookings/whatsapp-parser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseSourceType(value: string): WhatsAppSourceType {
  if (value === "image" || value === "manual" || value === "email")
    return value;
  return "text";
}

function parseOrderType(value: string): WhatsAppOrderTypeOrUnknown {
  if (
    value === "cake" ||
    value === "cookies" ||
    value === "cupcakes" ||
    value === "buket" ||
    value === "cookies_tower"
  ) {
    return value;
  }

  if (value === "cookies tower") return "cookies_tower";
  return "unknown";
}

function parseOrderTypeFromText(value: string): WhatsAppOrderTypeOrUnknown {
  const matched = value.match(
    /jenis\s+pesanan\s*[:=-]\s*(cake|cookies|cupcakes|buket|cookies_tower|cookies tower)/i,
  );
  if (matched?.[1]) {
    return parseOrderType(matched[1].toLowerCase());
  }

  const heading = value.match(
    /(?:^|\n)\s*(?:\[wa\s*parser\]\s*)?data\s+(cake|cookies|cupcakes|buket|cookies\s*tower)\b/i,
  );
  if (heading?.[1]) {
    return parseOrderType(heading[1].toLowerCase());
  }

  return "unknown";
}

function buildVisionPrompt(
  preferredOrderType: WhatsAppOrderTypeOrUnknown,
): string {
  const selectedTypeInstruction =
    preferredOrderType === "unknown"
      ? `
1) Tentukan jenis pesanan paling cocok: cake | cookies | cupcakes | buket | cookies_tower.
2) Tulis baris pertama: Jenis Pesanan: <jenis pesanan>.
3) Setelah itu susun hasil ekstraksi dengan format label yang sesuai jenis pesanan.
`
      : `
1) Gunakan jenis pesanan: ${preferredOrderType}.
2) Tulis baris pertama: Jenis Pesanan: ${preferredOrderType}.
3) Setelah itu susun hasil ekstraksi dengan format label berikut.
`;

  const template =
    preferredOrderType === "unknown"
      ? [
          "Pilih salah satu template ini:",
          "- cake",
          buildWhatsAppTemplate("cake"),
          "",
          "- cookies",
          buildWhatsAppTemplate("cookies"),
          "",
          "- cupcakes",
          buildWhatsAppTemplate("cupcakes"),
          "",
          "- buket",
          buildWhatsAppTemplate("buket"),
          "",
          "- cookies_tower",
          buildWhatsAppTemplate("cookies_tower"),
        ].join("\n")
      : buildWhatsAppTemplate(preferredOrderType as WhatsAppOrderType);

  return `Kamu membaca screenshot chat WhatsApp pesanan.
Ekstrak data pesanan dengan teliti.

Aturan wajib:
${selectedTypeInstruction}
4) Jika field tidak ditemukan, isi dengan tanda "-".
5) Balas hanya teks hasil ekstraksi, tanpa penjelasan tambahan.

Template:
${template}`;
}

function buildEmailPrompt(
  preferredOrderType: WhatsAppOrderTypeOrUnknown,
  emailText: string,
): string {
  const selectedTypeInstruction =
    preferredOrderType === "unknown"
      ? `
1) Tentukan jenis pesanan paling cocok: cake | cookies | cupcakes | buket | cookies_tower.
2) Tulis baris pertama: Jenis Pesanan: <jenis pesanan>.
3) Susun output menggunakan label format pesanan (gaya form booking).
`
      : `
1) Gunakan jenis pesanan: ${preferredOrderType}.
2) Tulis baris pertama: Jenis Pesanan: ${preferredOrderType}.
3) Susun output menggunakan label format pesanan.
`;

  const template =
    preferredOrderType === "unknown"
      ? [
          buildWhatsAppTemplate("cake"),
          "",
          buildWhatsAppTemplate("cookies"),
          "",
          buildWhatsAppTemplate("cupcakes"),
          "",
          buildWhatsAppTemplate("buket"),
          "",
          buildWhatsAppTemplate("cookies_tower"),
        ].join("\n")
      : buildWhatsAppTemplate(preferredOrderType as WhatsAppOrderType);

  return `Kamu membaca notifikasi email pesanan e-commerce.
Ekstrak data order secara akurat ke format terstruktur.

Aturan wajib:
${selectedTypeInstruction}
4) Jika field tidak ditemukan, isi dengan tanda "-".
5) Gunakan Bahasa Indonesia.
6) Balas hanya hasil ekstraksi (tanpa penjelasan tambahan).

Template:
${template}

Email mentah:
${emailText}`;
}

function getStringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function deriveReferenceLabelFromFileName(fileName: string): string | undefined {
  const normalized = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return undefined;
  if (normalized.length < 4) return undefined;
  if (/^[a-f0-9-]{12,}$/i.test(normalized.replace(/\s+/g, "-"))) {
    return undefined;
  }
  if (/^(img|image|foto|photo)\s*\d[\d\s-]*$/i.test(normalized)) {
    return undefined;
  }

  return normalized;
}

function normalizeReferenceLabelsInput(value: string): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();

  for (const rawEntry of value.split(/\n|,|;/g)) {
    const normalized = rawEntry.trim().replace(/\s+/g, " ");
    if (!normalized) continue;

    const matchKey = normalized.toLowerCase();
    if (seen.has(matchKey)) continue;
    seen.add(matchKey);
    labels.push(normalized);
  }

  return labels;
}

function inferPreviewTemplateKey(parsed: ParsedWhatsAppOrder): string {
  const orderText = [parsed.common.order, parsed.rawText].join(" ").toLowerCase();

  if (parsed.orderType === "cake") return "cake";
  if (parsed.orderType === "cupcakes") return "cupcakes";
  if (parsed.orderType === "cookies_tower") return "cookies_tower";
  if (parsed.orderType === "cookies") {
    if (/\bbox\b/.test(orderText)) return "box";
    return "cookies";
  }
  if (parsed.orderType === "buket") {
    if (/standing/.test(orderText)) return "buket_standing";
    return "buket_hand";
  }
  return "cake";
}

function formatTemplateDate(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return trimmed;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

function formatTemplateTime(value: string): string {
  return value.trim().replace(/\s*wib$/i, "");
}

function buildPreviewTemplateFields(
  parsed: ParsedWhatsAppOrder,
  templateKey: string,
  itemSummary: string,
): WhatsAppOrderImagePayload["templateFields"] {
  const details = parsed.details ?? {};

  const templateFields: NonNullable<WhatsAppOrderImagePayload["templateFields"]> = {
    dateTime: [
      formatTemplateDate(parsed.common.deliveryDate || ""),
      formatTemplateTime(parsed.common.deliveryTime || ""),
    ]
      .filter(Boolean)
      .join(" | "),
    recipientName: parsed.common.recipientName || "Customer",
    recipientPhone: parsed.common.recipientPhone || "",
  };

  if (templateKey === "cake") {
    templateFields.rightTop = details.cakeFlavor;
    templateFields.rightMiddle = details.cakeName;
    templateFields.rightBottom = details.cakeAge;
  } else if (templateKey === "cookies_tower") {
    templateFields.rightTop = details.designTheme || details.colorTheme;
    templateFields.rightMiddle = details.towerName;
    templateFields.rightBottom = details.towerAge;
  } else if (templateKey === "cupcakes") {
    templateFields.rightTop = details.cupcakeFlavor;
    templateFields.rightMiddle = details.greetingCard || details.toFromNotes;
  } else if (templateKey === "cookies") {
    templateFields.rightMiddle = details.toFromNotes || details.greetingCard;
  } else if (templateKey === "box") {
    templateFields.rightTop = itemSummary;
  } else if (
    templateKey === "buket_hand" ||
    templateKey === "buket_standing"
  ) {
    templateFields.rightTop = details.bouquetPaperColor;
    templateFields.rightMiddle = details.flowerCount;
    templateFields.rightBottom = details.flowerColor;
  }

  return templateFields;
}

function buildProductionPreviewPayload(args: {
  parsed: ParsedWhatsAppOrder;
  autoFill: BookingFormAutoFill;
  explicitRequestedLabels: string[];
}): WhatsAppOrderImagePayload {
  const itemSummary = args.autoFill.items
    .map((item) => item.productName)
    .filter(Boolean)
    .join(", ");
  const templateKey = inferPreviewTemplateKey(args.parsed);
  const referenceImages = Array.isArray(args.parsed.referenceImages)
    ? args.parsed.referenceImages
    : [];
  const mergedRequestedImageLabels = [
    ...(Array.isArray(args.parsed.requestedImageLabels)
      ? args.parsed.requestedImageLabels
      : []),
    ...args.explicitRequestedLabels,
  ].filter((value, index, array) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    return (
      array.findIndex((entry) => entry.trim().toLowerCase() === normalized) ===
      index
    );
  });

  return {
    customerName: args.autoFill.customerName || args.parsed.common.recipientName || "Customer",
    recipientName: args.parsed.common.recipientName || args.autoFill.customerName || "Customer",
    phone: args.autoFill.phoneNumber || args.parsed.common.recipientPhone || "",
    recipientPhone:
      args.parsed.common.recipientPhone || args.autoFill.phoneNumber || "",
    deliveryDate: args.autoFill.deliveryDate || args.parsed.common.deliveryDate || "",
    deliveryTime: args.autoFill.deliverySlot || args.parsed.common.deliveryTime || "",
    shippingMethod: args.parsed.common.deliveryMethod || "",
    item: itemSummary || args.parsed.common.order || "",
    notes: args.autoFill.customNotes || "",
    address: args.autoFill.deliveryAddresses[0]?.addressLine || args.parsed.common.fullAddress || "",
    bookingCode: args.parsed.common.bookingCode || "",
    orderType: args.parsed.orderType,
    templateKey,
    productTags: args.autoFill.items.flatMap((item) => [
      item.category,
      item.productName,
      item.size,
    ]),
    imageUrl: referenceImages[0]?.url || "",
    imageUrls: referenceImages.map((reference) => reference.url),
    referenceImages,
    requestedImageLabels: mergedRequestedImageLabels,
    templateFields: buildPreviewTemplateFields(args.parsed, templateKey, itemSummary),
    slotNotes: mergedRequestedImageLabels,
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    const bookingCatalog = await loadEffectiveBookingCatalog(auth.businessId);

    const contentType = request.headers.get("content-type") || "";

    let sourceType: WhatsAppSourceType = "text";
    let preferredOrderType: WhatsAppOrderTypeOrUnknown = "unknown";
    let textInput = "";
    let referenceLabelsInput = "";
    let files: File[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      sourceType = parseSourceType(getStringValue(formData.get("sourceType")));
      preferredOrderType = parseOrderType(
        getStringValue(formData.get("orderType")),
      );
      textInput = getStringValue(formData.get("text"));
      referenceLabelsInput = getStringValue(formData.get("referenceLabels"));

      const uploadedFiles = formData
        .getAll("files")
        .filter(
          (entry): entry is File => entry instanceof File && entry.size > 0,
        );
      const maybeSingleFile = formData.get("file");
      const fallbackSingleFile =
        maybeSingleFile instanceof File && maybeSingleFile.size > 0
          ? [maybeSingleFile]
          : [];

      files = uploadedFiles.length > 0 ? uploadedFiles : fallbackSingleFile;
    } else {
      const body = (await request.json()) as {
        sourceType?: string;
        orderType?: string;
        text?: string;
      };

      sourceType = parseSourceType(getStringValue(body.sourceType));
      preferredOrderType = parseOrderType(getStringValue(body.orderType));
      textInput = getStringValue(body.text);
      referenceLabelsInput = getStringValue(
        (body as { referenceLabels?: string }).referenceLabels,
      );
    }

    const parserWarnings: string[] = [];
    const requestedSourceType = sourceType;

    if (requestedSourceType === "image") {
      if (!textInput.trim()) {
        return NextResponse.json(
          {
            error:
              "Parsing gambar AI dinonaktifkan sementara. Gunakan copy-paste teks chat atau template manual.",
          },
          { status: 400 },
        );
      }

      parserWarnings.push(
        "Parsing gambar AI dinonaktifkan sementara. Sistem memproses teks manual yang Anda kirim, tapi gambar referensi tetap disimpan untuk template produksi.",
      );
      sourceType = "manual";
    }

    if (
      (sourceType === "text" ||
        sourceType === "manual" ||
        sourceType === "email") &&
      !textInput.trim()
    ) {
      return NextResponse.json(
        { error: "Text input is required for text/manual/email mode." },
        { status: 400 },
      );
    }

    let extractedText = textInput.trim();
    let visionRawOutput = "";
    const explicitRequestedLabels = normalizeReferenceLabelsInput(
      referenceLabelsInput,
    );
    const uploadedImageUrls: string[] = [];
    const uploadedReferenceImages: Array<{
      url: string;
      label?: string;
      orderIndex?: number;
    }> = [];

    if (files.length > 0) {
      for (const [index, file] of files.entries()) {
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const imageUrl = await uploadToCloudinary(buffer, {
          folder: "orders/source",
        });

        uploadedImageUrls.push(imageUrl);
        uploadedReferenceImages.push({
          url: imageUrl,
          label:
            explicitRequestedLabels[index] || deriveReferenceLabelFromFileName(file.name),
          orderIndex: index,
        });
      }
    }

    if (sourceType === "image" && files.length > 0) {
      const extractionBlocks: string[] = [];
      for (const imageUrl of uploadedImageUrls) {
        const extractedFromImage = await analyzeBusinessData({
          prompt: buildVisionPrompt(preferredOrderType),
          imageUrl,
          temperature: 0.1,
          maxTokens: 1600,
        });

        if (extractedFromImage.trim()) {
          extractionBlocks.push(extractedFromImage.trim());
        }
      }

      visionRawOutput = extractionBlocks.join("\n\n");
      extractedText = [visionRawOutput, extractedText]
        .filter(Boolean)
        .join("\n");
    }

    if (sourceType === "email") {
      visionRawOutput = await analyzeBusinessData({
        prompt: buildEmailPrompt(preferredOrderType, extractedText),
        temperature: 0.1,
        maxTokens: 1600,
      });
      extractedText = [visionRawOutput].filter(Boolean).join("\n");
    }

    const orderTypeFromVision = parseOrderTypeFromText(
      visionRawOutput || extractedText,
    );
    const effectiveOrderType =
      preferredOrderType === "unknown"
        ? orderTypeFromVision
        : preferredOrderType;

    const parsed = parseWhatsAppOrderText(extractedText, {
      preferredOrderType: effectiveOrderType,
      sourceType,
    });

    const autoFill = buildBookingAutoFillFromParsed(parsed, bookingCatalog);
    const parsedWithImage = {
      ...parsed,
      imageUrl: uploadedImageUrls[0],
      uploadedImageUrls,
      referenceImages: uploadedReferenceImages,
      requestedImageLabels: [
        ...(Array.isArray(parsed.requestedImageLabels)
          ? parsed.requestedImageLabels
          : []),
        ...explicitRequestedLabels,
      ].filter((value, index, array) => {
        const normalized = value.trim().toLowerCase();
        if (!normalized) return false;
        return (
          array.findIndex(
            (entry) => entry.trim().toLowerCase() === normalized,
          ) === index
        );
      }),
      detectedItems: buildParsedDetectedItems(autoFill.items),
    };
    const responseWarnings = [...parserWarnings];
    let productionPreviewImageUrl: string | null = null;

    if (uploadedReferenceImages.length > 0) {
      try {
        const previewPayload = buildProductionPreviewPayload({
          parsed: parsedWithImage,
          autoFill,
          explicitRequestedLabels,
        });
        const previewBuffer = await generateOrderImage(previewPayload);
        productionPreviewImageUrl = await uploadToCloudinary(previewBuffer, {
          folder: "orders/generated/preview",
        });
      } catch (previewError) {
        responseWarnings.push(
          `Preview template produksi belum berhasil dibuat: ${getErrorMessage(previewError)}`,
        );
      }
    }

    if (parsedWithImage.missingFields.length > 0) {
      responseWarnings.push(
        `Parser mendeteksi field yang belum lengkap: ${parsedWithImage.missingFields.join(", ")}`,
      );
    }

    return NextResponse.json({
      success: true,
      parsed: parsedWithImage,
      autoFill,
      uploadedImageUrls,
      productionPreviewImageUrl,
      visionRawOutput:
        sourceType === "image" || sourceType === "email"
          ? visionRawOutput
          : null,
      warnings: responseWarnings,
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    const message = getErrorMessage(error);
    const lowered = message.toLowerCase();
    const status =
      lowered.includes("connection error") ||
      lowered.includes("fetch failed") ||
      lowered.includes("network")
        ? 503
        : 500;

    return NextResponse.json(
      {
        error: message || "Failed to parse WhatsApp order",
        details: message,
      },
      { status },
    );
  }
}
