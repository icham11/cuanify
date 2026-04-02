const FONNTE_ENDPOINT = "https://api.fonnte.com/send";

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export async function sendWhatsAppImage(imageUrl: string): Promise<void> {
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

  const response = await fetch(FONNTE_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      target,
      file: imageUrl,
      message: "ORDER BARU MASUK - PRODUKSI",
      type: "image",
      delay: "2",
    }),
  });

  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(`Fonnte error: ${rawText}`);
  }

  try {
    const payload = JSON.parse(rawText) as { status?: boolean; reason?: string };
    if (payload.status === false) {
      throw new Error(`Fonnte error: ${payload.reason || rawText}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Fonnte error:")) {
      throw error;
    }
  }
}
