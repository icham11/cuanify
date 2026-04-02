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

function normalizeProductImageUrl(url?: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    const isHttpsCloudinary =
      parsed.protocol === "https:" &&
      parsed.hostname === "res.cloudinary.com";
    const isGeneratedOrderImage = parsed.pathname.includes("/orders/generated/");

    if (!isHttpsCloudinary || isGeneratedOrderImage) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export async function sendOrderToWhatsApp(
  order: SendOrderToWhatsAppInput,
): Promise<void> {
  console.log("🚀 START WA FLOW");

  const productImageUrl =
    normalizeProductImageUrl(order.imageUrl) || FALLBACK_IMAGE_URL;

  console.log("🖼️ Product image used:", productImageUrl);

  const payload: SendOrderToWhatsAppInput = {
    ...order,
    imageUrl: productImageUrl,
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
