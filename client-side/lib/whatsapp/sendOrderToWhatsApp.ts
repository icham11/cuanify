import {
  generateOrderImage,
  type WhatsAppReferenceImage,
  type WhatsAppOrderImagePayload,
} from "@/lib/whatsapp/generateOrderImage";
import {
  buildOrderDeliveryDetailsWhatsAppText,
  formatWhatsAppDeliveryDate,
  formatWhatsAppDeliveryTime,
  type WhatsAppRecapItem,
} from "@/lib/bookings/whatsapp-message-template";
import { uploadToCloudinary } from "@/lib/whatsapp/uploadToCloudinary";
import {
  sendWhatsAppImage,
  sendWhatsAppText,
} from "@/lib/whatsapp/sendWhatsApp";

const FALLBACK_IMAGE_URL = "https://via.placeholder.com/300";

export interface SendOrderToWhatsAppInput extends WhatsAppOrderImagePayload {
  imageUrl?: string;
  customerNotes?: string;
  designNotes?: string;
  fullAddress?: string;
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

export function buildProductionCaption(
  order: SendOrderToWhatsAppInput,
): string {
  const lines: string[] = [];

  lines.push("Tanggal Pengiriman :");
  lines.push(formatWhatsAppDeliveryDate(order.deliveryDate));
  lines.push("");

  lines.push(`KODE BOOKING : ${order.bookingCode || "-"}`);
  lines.push("");

  lines.push("Order :");
  const itemSummary =
    (order.captionItems ?? []).map((it) => it.productName).join(", ") ||
    order.item ||
    "-";
  lines.push(itemSummary);
  lines.push("");

  if (order.designNotes || order.customerNotes) {
    const notes = (order.designNotes || order.customerNotes || "").trim();
    if (notes) {
      lines.push(`Design cake : ${notes}`);
      lines.push("");
    }
  }

  lines.push(
    `Jam Pengiriman: ${formatWhatsAppDeliveryTime(order.deliveryTime)}`,
  );
  lines.push(`Metode Pengiriman : ${order.shippingMethod || "-"}`);
  lines.push(
    `Nama penerima : ${order.recipientName || order.customerName || "-"}`,
  );
  lines.push(
    `No. telp penerima : ${order.recipientPhone || order.phone || "-"}`,
  );
  lines.push(`Alamat lengkap : ${order.fullAddress || order.address || "-"}`);

  return lines.join("\n");
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
        orderIndex,
      };
      byUrl.set(normalizedUrl, nextReference);
      normalized.push(nextReference);
      continue;
    }

    if (!existing.label && label) {
      existing.label = label;
    }
    if (existing.orderIndex === undefined && orderIndex !== undefined) {
      existing.orderIndex = orderIndex;
    }
  }

  return normalized;
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

  // Ambil semua kandidat gambar user-upload (http/https, bukan template/data URI/placeholder)
  const userUploadedImages = [
    ...selectedImageUrls,
    ...structuredReferenceImages.map((r) => r.url),
  ].filter((url) => {
    return (
      url &&
      /^https?:\/\//i.test(url) &&
      !url.includes("/orders/generated/") &&
      !url.includes("via.placeholder.com")
    );
  });
  const dedupedUserUploadedImages = Array.from(
    new Set(userUploadedImages),
  );
  console.info("[WA DEBUG] userUploadedImages:", dedupedUserUploadedImages);

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

  // Jika tidak ada gambar user-upload, fallback ke template lama (generate template)
  if (dedupedUserUploadedImages.length === 0) {
    // ...existing code for template generation...
    let generatedOrderImageUrl = "";
    let generatedBuffer: Buffer | null = null;
    const payload: SendOrderToWhatsAppInput = {
      ...order,
      imageUrl: undefined,
      imageUrls: [],
      referenceImages: [],
    };
    try {
      generatedBuffer = await generateOrderImage(payload);
    } catch (error) {
      return {
        ok: false,
        stage: "generate",
        message:
          error instanceof Error
            ? error.message
            : "Failed to generate WhatsApp order image.",
      };
    }
    try {
      const imageUrl = await uploadToCloudinary(generatedBuffer, {
        folder: "orders/generated",
      });
      if (!imageUrl || !imageUrl.trim()) {
        throw new Error("Image URL is missing.");
      }
      generatedOrderImageUrl = imageUrl;
    } catch (error) {
      return {
        ok: false,
        stage: "upload",
        message:
          error instanceof Error
            ? error.message
            : "Failed to upload WhatsApp order image.",
      };
    }
    try {
      await sendWhatsAppImage(
        generatedOrderImageUrl,
        buildProductionCaption(payload),
      );
      return {
        ok: true,
        stage: "send",
        message:
          "WhatsApp production notification sent successfully (template fallback).",
        imageUrl: generatedOrderImageUrl,
      };
    } catch (error) {
      return {
        ok: false,
        stage: "send",
        message:
          error instanceof Error
            ? error.message
            : "Failed to send WhatsApp production notification.",
        imageUrl: generatedOrderImageUrl,
      };
    }
  }

  // 1. Kirim satu pesan teks rekap order (tanpa gambar)
  let lastResult: SendOrderToWhatsAppResult = {
    ok: false,
    stage: "send",
    message: "No messages sent",
  };
  try {
    const lines: string[] = [];
    lines.push(
      `Tanggal Pengiriman :\n${formatWhatsAppDeliveryDate(order.deliveryDate)}`,
    );
    lines.push("");
    lines.push(`KODE BOOKING : ${order.bookingCode || "-"}`);
    lines.push("");
    if (order.captionItems && order.captionItems.length > 0) {
      for (const item of order.captionItems) {
        lines.push(`Order :\n${item.productName || "-"}`);
        if (item.detailLines && item.detailLines.length > 0) {
          for (const d of item.detailLines) {
            lines.push(`${d.label} : ${d.value}`);
          }
        }
        lines.push("");
      }
    }
    lines.push(
      `Jam Pengiriman: ${formatWhatsAppDeliveryTime(order.deliveryTime)}`,
    );
    lines.push(`Metode Pengiriman : ${order.shippingMethod || "-"}`);
    lines.push(
      `Nama penerima : ${order.recipientName || order.customerName || "-"}`,
    );
    lines.push(
      `No. telp penerima : ${order.recipientPhone || order.phone || "-"}`,
    );
    lines.push(`Alamat lengkap : ${order.fullAddress || order.address || "-"}`);

    await sendWhatsAppText(lines.join("\n"));
    lastResult = {
      ok: true,
      stage: "send",
      message: "WhatsApp order recap text sent successfully.",
      imageUrl: undefined,
    };
  } catch (error) {
    lastResult = {
      ok: false,
      stage: "send",
      message:
        error instanceof Error
          ? error.message
          : "Failed to send WhatsApp order recap text.",
      imageUrl: undefined,
    };
    return lastResult;
  }

  // 2. Kirim satu per satu gambar user-upload, caption = detail gambar dari parser
  for (let i = 0; i < dedupedUserUploadedImages.length; i++) {
    const imgUrl = dedupedUserUploadedImages[i];
    let caption = "";
    // Ambil label/notes dari referenceImages jika ada, jika tidak dari captionItems
    if (order.referenceImages && order.referenceImages[i]?.label) {
      caption = order.referenceImages[i].label ?? "";
    } else if (order.captionItems && order.captionItems[i]?.productName) {
      caption = order.captionItems[i].productName ?? "";
    } else {
      caption = `Gambar ${i + 1}`;
    }
    try {
      await sendWhatsAppImage(imgUrl, caption);
      lastResult = {
        ok: true,
        stage: "send",
        message: `WhatsApp image sent for image ${i + 1}`,
        imageUrl: imgUrl,
      };
    } catch (error) {
      lastResult = {
        ok: false,
        stage: "send",
        message:
          error instanceof Error
            ? error.message
            : `Failed to send WhatsApp image for image ${i + 1}`,
        imageUrl: imgUrl,
      };
      break;
    }
  }
  return lastResult;
}
