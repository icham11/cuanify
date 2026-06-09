import type {
  WhatsAppReferenceImage,
  WhatsAppOrderImagePayload,
} from "@/lib/whatsapp/generateOrderImage";
import {
  buildOrderDeliveryDetailsWhatsAppText,
  type WhatsAppRecapItem,
} from "@/lib/bookings/whatsapp-message-template";
import { uploadToCloudinary } from "@/lib/whatsapp/uploadToCloudinary";
import {
  sendWhatsAppImage,
  sendWhatsAppSequence,
  sendWhatsAppText,
} from "@/lib/whatsapp/sendWhatsApp";

export interface SendOrderToWhatsAppInput extends WhatsAppOrderImagePayload {
  imageUrl?: string;
  customerNotes?: string;
  designNotes?: string;
  fullAddress?: string;
  postalCode?: string;
  deliveryFee?: number;
  manualAdjustment?: number;
  totalPrice?: number;
  downPaymentAmount?: number;
  remainingBalance?: number;
  captionItems?: WhatsAppRecapItem[];
}

export interface SendOrderToWhatsAppResult {
  ok: boolean;
  stage: "preflight" | "generate" | "upload" | "send";
  message: string;
  imageUrl?: string;
}

const OUTBOUND_WA_IMAGE_TTL_MS = 24 * 60 * 60 * 1000;
const INTER_MESSAGE_DELAY_MS = 3500; // Increased to ensure text is fully sent before image
const WA_TEXT_DELAY_SECONDS = 0; // Server-side delay di Fonnte (gunakan client-side delay saja)
const WA_IMAGE_BASE_DELAY_SECONDS = 1; // Minimal delay, rely on INTER_MESSAGE_DELAY_MS
const WA_IMAGE_DELAY_STEP_SECONDS = 2;

function sanitizeBookingCode(value?: string): string {
  const raw = (value || "").trim();
  if (!raw) return "-";

  const cleaned = raw
    .replace(/^kode\s*booking\s*[:\-]?\s*/i, "")
    .replace(/^booking\s*[:\-]?\s*/i, "")
    .trim();

  const finalValue = cleaned || raw;
  return /[a-z0-9]/i.test(finalValue) ? finalValue : "-";
}

function isMeaningfulImageCaption(value?: string): boolean {
  const text = (value || "").trim();
  if (!text) return false;
  if (/^[a-f0-9-]{12,}$/i.test(text)) return false;
  if (/^[a-f0-9-]{12,}$/i.test(text.replace(/\s+/g, "-"))) return false;
  if (/^(img|image|foto|photo)\s*\d[\d\s-]*$/i.test(text)) return false;
  if (/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(text)) return false;
  return true;
}

export function buildProductionCaption(
  order: SendOrderToWhatsAppInput,
): string {
  const fallbackDetailLines: Array<{ label: string; value: string }> = [];
  if ((order.designNotes || "").trim()) {
    fallbackDetailLines.push({
      label: "Design",
      value: order.designNotes!.trim(),
    });
  }

  const captionItems =
    order.captionItems && order.captionItems.length > 0
      ? order.captionItems.map((item, index) => {
          if (index !== 0 || fallbackDetailLines.length === 0) {
            return item;
          }

          const existingLabels = new Set(
            (item.detailLines ?? []).map((detailLine) =>
              detailLine.label.trim().toLowerCase(),
            ),
          );
          const mergedFallbackLines = fallbackDetailLines.filter(
            (detailLine) =>
              !existingLabels.has(detailLine.label.trim().toLowerCase()),
          );

          if (mergedFallbackLines.length === 0) {
            return item;
          }

          return {
            ...item,
            detailLines: [...(item.detailLines ?? []), ...mergedFallbackLines],
          };
        })
      : [
          {
            productName: order.item || "-",
            orderLabel: order.item || "-",
            detailLines: fallbackDetailLines,
          },
        ];

  return buildOrderDeliveryDetailsWhatsAppText({
    items: captionItems,
    deliveryDate: order.deliveryDate,
    bookingCode: sanitizeBookingCode(order.bookingCode),
    deliveryTime: order.deliveryTime,
    shippingMethod: order.shippingMethod || "-",
    recipientName: order.recipientName || order.customerName || "-",
    recipientPhone: order.recipientPhone || order.phone || "-",
    fullAddress: order.fullAddress || order.address || "-",
    postalCode: order.postalCode,
  });
}

function waitForMessageOrdering(delayMs = INTER_MESSAGE_DELAY_MS) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function normalizeReferenceImageUrl(url?: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(trimmed)) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.pathname.includes("/orders/generated/")) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeReferenceImageUrls(
  order: SendOrderToWhatsAppInput,
): string[] {
  const candidates = [order.imageUrl ?? "", ...(order.imageUrls ?? [])];

  const normalized = candidates
    .map((value) => normalizeReferenceImageUrl(value))
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set(normalized));
}

function normalizeStructuredReferenceImages(
  order: SendOrderToWhatsAppInput,
): WhatsAppReferenceImage[] {
  const references = Array.isArray(order.referenceImages)
    ? order.referenceImages
    : [];

  const normalized: WhatsAppReferenceImage[] = [];
  const byUrl = new Map<string, WhatsAppReferenceImage>();

  for (const reference of references) {
    const normalizedUrl = normalizeReferenceImageUrl(reference?.url);
    if (!normalizedUrl) continue;

    const label = reference.label?.trim() || undefined;
    const note = reference.note?.trim() || undefined;
    const orderIndex =
      typeof reference.orderIndex === "number" &&
      Number.isFinite(reference.orderIndex)
        ? reference.orderIndex
        : undefined;
    const existing = byUrl.get(normalizedUrl);

    if (!existing) {
      const nextReference = {
        url: normalizedUrl,
        label,
        note,
        orderIndex,
      };
      byUrl.set(normalizedUrl, nextReference);
      normalized.push(nextReference);
      continue;
    }

    if (!existing.label && label) {
      existing.label = label;
    }
    if (!existing.note && note) {
      existing.note = note;
    }
    if (existing.orderIndex === undefined && orderIndex !== undefined) {
      existing.orderIndex = orderIndex;
    }
  }

  // Sort berdasarkan orderIndex agar urutan gambar dan label sesuai input pengguna
  return normalized.sort((a, b) => {
    const aIdx = a.orderIndex ?? Infinity;
    const bIdx = b.orderIndex ?? Infinity;
    return aIdx - bIdx;
  });
}

type OutboundWhatsAppMessage = {
  message: string;
  imageUrl?: string;
};

async function sendOutboundWhatsAppSequence(
  messages: OutboundWhatsAppMessage[],
): Promise<void> {
  try {
    await sendWhatsAppSequence(messages);
  } catch (error) {
    console.warn(
      "[sendOrderToWhatsApp] Batch WA sequence failed, falling back to legacy sequential sends",
      {
        error: error instanceof Error ? error.message : String(error),
        messageCount: messages.length,
      },
    );

    for (let index = 0; index < messages.length; index += 1) {
      const entry = messages[index];
      if (entry.imageUrl) {
        await sendWhatsAppImage(
          entry.imageUrl,
          entry.message,
          undefined,
          WA_IMAGE_BASE_DELAY_SECONDS + index * WA_IMAGE_DELAY_STEP_SECONDS,
        );
      } else {
        await sendWhatsAppText(entry.message, undefined, WA_TEXT_DELAY_SECONDS);
      }
      await waitForMessageOrdering(INTER_MESSAGE_DELAY_MS);
    }
  }
}

async function prepareOutboundWhatsAppImageUrl(
  sourceUrl: string,
  index: number,
): Promise<string> {
  if (!sourceUrl.trim()) {
    throw new Error("Reference image URL is empty.");
  }

  if (sourceUrl.includes("/orders/outbound-temp/")) {
    return sourceUrl;
  }

  const expiresAt = Date.now() + OUTBOUND_WA_IMAGE_TTL_MS;

  try {
    const mirroredUrl = await uploadToCloudinary(sourceUrl, {
      folder: "orders/outbound-temp",
      format: "jpg",
      tags: ["temp", "wa-outbound", `expire:${expiresAt}`],
    });

    if (mirroredUrl?.trim()) {
      console.info(
        "[sendOrderToWhatsApp] Mirrored outbound image to Cloudinary",
        {
          index,
          sourceUrl: sourceUrl.substring(0, 80),
          mirroredUrl: mirroredUrl.substring(0, 80),
        },
      );
      return mirroredUrl;
    }
  } catch (error) {
    console.warn(
      "[sendOrderToWhatsApp] Failed to mirror outbound image, falling back to source URL",
      {
        index,
        sourceUrl: sourceUrl.substring(0, 80),
        error: error instanceof Error ? error.message : String(error),
      },
    );
  }

  return sourceUrl;
}

export async function sendOrderToWhatsApp(
  order: SendOrderToWhatsAppInput,
): Promise<SendOrderToWhatsAppResult> {
  const selectedImageUrls = normalizeReferenceImageUrls(order);
  const structuredReferenceImages = normalizeStructuredReferenceImages(order);

  // DEBUG LOGGING
  console.info("[WA DEBUG] selectedImageUrls:", selectedImageUrls);
  console.info(
    "[WA DEBUG] structuredReferenceImages:",
    structuredReferenceImages,
  );

  // Ambil gambar user-upload (http/https, bukan template/placeholder)
  // Menggunakan array terurut dari structuredReferenceImages agar label & urutan terjaga
  const isValidUserImage = (url: string) =>
    url &&
    /^https?:\/\//i.test(url) &&
    !url.includes("/orders/generated/") &&
    !url.includes("via.placeholder.com");

  // Bangun list gambar final dengan label-nya, dimulai dari structuredReferenceImages (sudah terurut)
  const seenUrls = new Set<string>();
  const finalImagesToUpload: Array<{
    url: string;
    label: string;
    note?: string;
  }> = [];

  // 1. Prioritaskan structuredReferenceImages karena memiliki label & sudah terurut
  for (const ref of structuredReferenceImages) {
    if (isValidUserImage(ref.url) && !seenUrls.has(ref.url)) {
      seenUrls.add(ref.url);
      finalImagesToUpload.push({
        url: ref.url,
        label: ref.label || "",
        note: ref.note || "",
      });
    }
  }

  // 2. Tambahkan selectedImageUrls yang mungkin tidak ada di referenceImages
  for (const url of selectedImageUrls) {
    if (isValidUserImage(url) && !seenUrls.has(url)) {
      seenUrls.add(url);
      finalImagesToUpload.push({ url, label: "", note: "" });
    }
  }

  console.info(
    "[WA DEBUG] finalImagesToUpload (ordered):",
    finalImagesToUpload,
  );

  if (!process.env.FONNTE_TOKEN) {
    return {
      ok: false,
      stage: "preflight",
      message: "Missing FONNTE_TOKEN env variable.",
    };
  }

  if (!process.env.FONNTE_PRODUCTION_TARGET) {
    return {
      ok: false,
      stage: "preflight",
      message: "Missing FONNTE_PRODUCTION_TARGET env variable.",
    };
  }

  const outboundMessages: OutboundWhatsAppMessage[] = [];
  const recapText = buildProductionCaption(order);
  outboundMessages.push({ message: recapText });

  // Siapkan satu per satu gambar user-upload, caption = detail gambar dari parser
  for (let i = 0; i < finalImagesToUpload.length; i++) {
    const {
      url: sourceImgUrl,
      label: referenceLabel,
      note: referenceNote,
    } = finalImagesToUpload[i];
    let caption = "";

    // Ambil label/notes dari referenceImages jika ada, jika tidak dari captionItems
    const productName = order.captionItems?.[i]?.productName;
    if (isMeaningfulImageCaption(referenceNote)) {
      caption = referenceNote!.trim();
    } else if (isMeaningfulImageCaption(referenceLabel)) {
      caption = referenceLabel.trim();
    } else if (isMeaningfulImageCaption(productName)) {
      caption = productName!.trim();
    } else {
      caption = `Referensi ${i + 1}`;
    }

    try {
      const imgUrl = await prepareOutboundWhatsAppImageUrl(sourceImgUrl, i);
      outboundMessages.push({
        message: caption,
        imageUrl: imgUrl,
      });
      console.info(
        `[sendOrderToWhatsApp] User image ${i + 1} queued successfully:`,
        {
          imageUrl: imgUrl.substring(0, 60),
          caption: caption.substring(0, 50),
        },
      );
    } catch (error) {
      console.error(`[sendOrderToWhatsApp] User image ${i + 1} send failed:`, {
        imageUrl: sourceImgUrl.substring(0, 60),
        caption: caption.substring(0, 50),
        error: error instanceof Error ? error.message : String(error),
      });
      // Skip gambar ini jika gagal upload
    }
  }

  if (outboundMessages.length === 0) {
    return {
      ok: false,
      stage: "send",
      message: "No messages to send.",
    };
  }

  let lastResult: SendOrderToWhatsAppResult;
  try {
    await sendOutboundWhatsAppSequence(outboundMessages);
    lastResult = {
      ok: true,
      stage: "send",
      message: `WhatsApp production notification sent successfully (${outboundMessages.length} message(s)).`,
      imageUrl: outboundMessages.findLast((entry) => Boolean(entry.imageUrl))
        ?.imageUrl,
    };
  } catch (error) {
    lastResult = {
      ok: false,
      stage: "send",
      message:
        error instanceof Error
          ? error.message
          : "Failed to send WhatsApp production notification.",
      imageUrl: outboundMessages.findLast((entry) => Boolean(entry.imageUrl))
        ?.imageUrl,
    };
  }

  return lastResult;
}
