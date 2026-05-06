const FONNTE_ENDPOINT = "https://api.fonnte.com/send";

/**
 * Validasi apakah string adalah URL HTTP/HTTPS yang valid
 */
function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Normalisasi nomor HP untuk Fonnte (menghilangkan non-digit dan memastikan awalan 62)
 */
export function normalizePhoneForFonnte(phone: string): string {
  // Hanya ambil digit
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";

  // Jika sudah 62, biarkan
  if (digits.startsWith("62")) return digits;
  // Jika 0, ganti dengan 62
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  // Default kirim apa adanya (untuk group ID atau format internasional lain)
  return digits;
}

/**
 * Normalisasi target (bisa koma separated atau group ID)
 */
export function normalizeFonnteTarget(target: string): string {
  return target
    .split(/[,\n;]+/)
    .map((rawTarget) => {
      const parsedTarget = rawTarget.trim();
      if (!parsedTarget) return "";
      // Jika group ID (@g.us), jangan di-normalize digitnya
      if (/@g\.us$/i.test(parsedTarget)) return parsedTarget;
      return normalizePhoneForFonnte(parsedTarget);
    })
    .filter(Boolean)
    .join(",");
}

type FonnteResponse = {
  status?: boolean;
  reason?: string;
  id?: string[];
};

async function sendFonnteMessage(
  message: string,
  customTarget?: string,
  imageUrl?: string,
): Promise<void> {
  const token = process.env.FONNTE_TOKEN?.trim();
  const defaultTarget = process.env.FONNTE_PRODUCTION_TARGET?.trim();
  const rawTarget = customTarget || defaultTarget;

  if (!token) {
    throw new Error(
      "[sendFonnteMessage] FONNTE_TOKEN tidak ditemukan di environment variables.",
    );
  }

  if (!rawTarget) {
    throw new Error(
      "[sendFonnteMessage] Target WhatsApp (FONNTE_PRODUCTION_TARGET) tidak ditemukan.",
    );
  }

  const normalizedTarget = normalizeFonnteTarget(rawTarget);
  const logLabel = imageUrl ? "[sendWhatsAppImage]" : "[sendWhatsAppText]";

  console.info(`${logLabel} Mempersiapkan pengiriman WhatsApp:`, {
    originalTarget: rawTarget,
    normalizedTarget,
    imageUrl: imageUrl ? imageUrl.substring(0, 50) + "..." : undefined,
    caption: message.substring(0, 30) + "...",
  });

  const payload: {
    target: string;
    message: string;
    delay: string;
    url?: string;
  } = {
    target: normalizedTarget,
    message,
    delay: "2",
  };

  if (imageUrl) {
    payload.url = imageUrl;
  }

  try {
    const response = await fetch(FONNTE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const rawText = await response.text();

    if (!response.ok) {
      console.error(`${logLabel} Fonnte HTTP Error:`, {
        status: response.status,
        statusText: response.statusText,
        body: rawText,
      });
      throw new Error(`Fonnte API Error (${response.status}): ${rawText}`);
    }

    const result = JSON.parse(rawText) as FonnteResponse;

    if (result.status === false) {
      console.error(`${logLabel} Fonnte menolak pesan:`, result.reason);
      throw new Error(`Fonnte rejection: ${result.reason || rawText}`);
    }

    console.info(`${logLabel} Berhasil mengirim pesan WhatsApp:`, {
      status: result.status,
      messageIds: result.id,
    });
  } catch (error) {
    console.error(`${logLabel} Gagal dalam proses pengiriman:`, error);
    throw error;
  }
}

export async function sendWhatsAppText(
  message: string,
  customTarget?: string,
): Promise<void> {
  await sendFonnteMessage(message, customTarget);
}

/**
 * Mengirim pesan gambar ke WhatsApp via Fonnte
 */
export async function sendWhatsAppImage(
  imageUrl: string,
  caption = "ORDER BARU MASUK - PRODUKSI",
  customTarget?: string, // Opsional: jika ingin mengirim ke target selain target produksi default
): Promise<void> {
  if (!imageUrl || !isValidHttpUrl(imageUrl)) {
    throw new Error(
      `[sendWhatsAppImage] Image URL tidak valid atau kosong: ${imageUrl}`,
    );
  }

  await sendFonnteMessage(caption, customTarget, imageUrl);
}
