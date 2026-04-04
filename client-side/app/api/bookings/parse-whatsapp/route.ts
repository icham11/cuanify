import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { analyzeBusinessData } from "@/lib/groq";
import { uploadToCloudinary } from "@/lib/whatsapp/uploadToCloudinary";
import {
  buildBookingAutoFillFromParsed,
  buildParsedDetectedItems,
  buildWhatsAppTemplate,
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

  return normalized || undefined;
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
    await requireAuth();

    const contentType = request.headers.get("content-type") || "";

    let sourceType: WhatsAppSourceType = "text";
    let preferredOrderType: WhatsAppOrderTypeOrUnknown = "unknown";
    let textInput = "";
    let files: File[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      sourceType = parseSourceType(getStringValue(formData.get("sourceType")));
      preferredOrderType = parseOrderType(
        getStringValue(formData.get("orderType")),
      );
      textInput = getStringValue(formData.get("text"));

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
          label: deriveReferenceLabelFromFileName(file.name),
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

    const autoFill = buildBookingAutoFillFromParsed(parsed);
    const parsedWithImage = {
      ...parsed,
      imageUrl: uploadedImageUrls[0],
      uploadedImageUrls,
      referenceImages: uploadedReferenceImages,
      detectedItems: buildParsedDetectedItems(autoFill.items),
    };
    const responseWarnings = [...parserWarnings];

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
