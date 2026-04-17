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
    const isGeneratedOrderImage =
      parsed.pathname.includes("/orders/generated/");

    if (isGeneratedOrderImage) {
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
  const seen = new Set<string>();

  for (const reference of references) {
    const normalizedUrl = normalizeReferenceImageUrl(reference?.url);
    if (!normalizedUrl) continue;

    const label = reference.label?.trim() || undefined;
    const key = `${normalizedUrl}::${label || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    normalized.push({
      url: normalizedUrl,
      label,
      orderIndex:
        typeof reference.orderIndex === "number" &&
        Number.isFinite(reference.orderIndex)
          ? reference.orderIndex
          : undefined,
    });
  }

  return normalized;
}

export async function sendOrderToWhatsApp(
  order: SendOrderToWhatsAppInput,
): Promise<void> {
  console.log("🚀 START WA FLOW");

  const selectedImageUrls = normalizeReferenceImageUrls(order);
  const structuredReferenceImages = normalizeStructuredReferenceImages(order);
  const productImageUrl = selectedImageUrls[0] || FALLBACK_IMAGE_URL;

  console.log("🖼️ Product image used:", productImageUrl);

  const payload: SendOrderToWhatsAppInput = {
    ...order,
    imageUrl: productImageUrl,
    imageUrls: selectedImageUrls,
    referenceImages: structuredReferenceImages,
  };

  let generatedOrderImageUrl = "";

  try {
    console.log("📸 Generating image...");
    const buffer = await generateOrderImage(payload);

    console.log("✅ Image generated. Buffer size:", buffer?.length);

    console.log("☁️ Uploading to Cloudinary...");
    const imageUrl = await uploadToCloudinary(buffer, {
      folder: "orders/generated",
    });

    console.log("✅ Uploaded image URL:", imageUrl);

    if (!imageUrl || !imageUrl.trim()) {
      throw new Error("Image URL is missing");
    }

    generatedOrderImageUrl = imageUrl;
  } catch (error) {
    console.error("❌ ERROR during image generation/upload:", error);
  }

  if (!generatedOrderImageUrl) {
    console.error("❌ STOP: No image URL, skipping WA send");
    return;
  }

  try {
    console.log("📤 Sending to WA:", generatedOrderImageUrl);

    await sendWhatsAppImage(
      generatedOrderImageUrl,
      buildProductionCaption(payload),
    );

    console.log("✅ WA Image sent successfully");
  } catch (error) {
    console.error("❌ ERROR sending to WA:", error);
  }

  console.log("🏁 END WA FLOW");
}
