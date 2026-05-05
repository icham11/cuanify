import {
  generateOrderImage,
  type WhatsAppReferenceImage,
  type WhatsAppOrderImagePayload,
} from "@/lib/whatsapp/generateOrderImage";
import {
  buildOrderDeliveryDetailsWhatsAppText,
  type WhatsAppRecapItem,
} from "@/lib/bookings/whatsapp-message-template";
import { uploadToCloudinary } from "@/lib/whatsapp/uploadToCloudinary";
import { sendWhatsAppImage } from "@/lib/whatsapp/sendWhatsApp";

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

function buildProductionCaption(order: SendOrderToWhatsAppInput): string {
  const captionItems =
    order.captionItems && order.captionItems.length > 0
      ? order.captionItems
      : [
          {
            productName: order.item || "-",
            quantity: 1,
          },
        ];

  return buildOrderDeliveryDetailsWhatsAppText({
    items: captionItems,
    deliveryDate: order.deliveryDate,
    bookingCode: order.bookingCode,
    deliveryTime: order.deliveryTime,
    shippingMethod: order.shippingMethod,
    recipientName: order.recipientName || order.customerName,
    recipientPhone: order.recipientPhone || order.phone,
    fullAddress: order.fullAddress || order.address,
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
  const productImageUrl = selectedImageUrls[0] || FALLBACK_IMAGE_URL;

  const payload: SendOrderToWhatsAppInput = {
    ...order,
    imageUrl: productImageUrl,
    imageUrls: selectedImageUrls,
    referenceImages: structuredReferenceImages,
  };

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

  let generatedOrderImageUrl = "";
  let generatedBuffer: Buffer;

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
      message: "WhatsApp production notification sent successfully.",
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
