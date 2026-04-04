import {
  generateOrderImage,
  type WhatsAppOrderImagePayload,
} from "@/lib/whatsapp/generateOrderImage";
import { uploadToCloudinary } from "@/lib/whatsapp/uploadToCloudinary";
import { sendWhatsAppImage } from "@/lib/whatsapp/sendWhatsApp";

const FALLBACK_IMAGE_URL = "https://via.placeholder.com/300";

export interface SendOrderToWhatsAppInput extends WhatsAppOrderImagePayload {
  imageUrl?: string;
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

export async function sendOrderToWhatsApp(
  order: SendOrderToWhatsAppInput,
): Promise<void> {
  console.log("🚀 START WA FLOW");

  const selectedImageUrls = normalizeReferenceImageUrls(order);
  const productImageUrl = selectedImageUrls[0] || FALLBACK_IMAGE_URL;

  console.log("🖼️ Product image used:", productImageUrl);

  const payload: SendOrderToWhatsAppInput = {
    ...order,
    imageUrl: productImageUrl,
    imageUrls: selectedImageUrls,
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

    await sendWhatsAppImage(generatedOrderImageUrl);

    console.log("✅ WA Image sent successfully");
  } catch (error) {
    console.error("❌ ERROR sending to WA:", error);
  }

  console.log("🏁 END WA FLOW");
}
