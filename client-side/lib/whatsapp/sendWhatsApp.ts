const FONNTE_ENDPOINT = "https://api.fonnte.com/send";

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export async function sendWhatsAppImage(
  imageUrl: string,
  caption = "ORDER BARU MASUK - PRODUKSI",
): Promise<void> {
  const token = process.env.FONNTE_TOKEN;
  const target = process.env.FONNTE_PRODUCTION_TARGET;

  if (!imageUrl || !isValidHttpUrl(imageUrl)) {
    throw new Error("Image URL is missing or invalid.");
  }

  if (!token) {
    throw new Error("Missing FONNTE_TOKEN env variable.");
  }

  if (!target) {
    throw new Error("Missing FONNTE_PRODUCTION_TARGET env variable.");
  }

  console.info("[sendWhatsAppImage] Attempting to send WhatsApp image:", {
    target,
    imageUrl: imageUrl.substring(0, 50) + "...",
    caption: caption.substring(0, 30) + "..."
  });

  const body = new FormData();
  body.set("target", target);
  body.set("url", imageUrl);
  body.set("message", caption);
  body.set("delay", "2");

  const response = await fetch(FONNTE_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: token,
    },
    body,
  });

  const rawText = await response.text();
  console.info("[sendWhatsAppImage] Fonnte Response:", rawText);

  if (!response.ok) {
    throw new Error(`Fonnte error: ${rawText}`);
  }

  try {
    const payload = JSON.parse(rawText) as { status?: boolean; reason?: string };
    if (payload.status === false) {
      console.error("[sendWhatsAppImage] Fonnte rejected message:", payload.reason);
      throw new Error(`Fonnte error: ${payload.reason || rawText}`);
    }
    console.info("[sendWhatsAppImage] Fonnte Success:", payload);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Fonnte error:")) {
      throw error;
    }
  }
}
