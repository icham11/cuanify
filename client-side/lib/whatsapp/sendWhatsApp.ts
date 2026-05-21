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

type FonnteOutboundMessage = {
  message: string;
  imageUrl?: string;
};

const FONNTE_MAX_ATTEMPTS = 3;
const FONNTE_RETRY_DELAY_MS = 2_000;

function waitBeforeRetry(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function shouldRetryFonnteHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function sendFonnteMessage(
  message: string,
  customTarget?: string,
  imageUrl?: string,
  delaySeconds = 2,
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
    isImageMessage: !!imageUrl,
  });

  // Fonnte API WAJIB menggunakan multipart/form-data (FormData) untuk pengiriman gambar via URL.
  // Jika menggunakan JSON (application/json), Fonnte tidak dapat membaca field 'url' dan
  // hanya mengirimkan teks saja tanpa gambar.
  const formData = new FormData();
  formData.set("target", normalizedTarget);
  formData.set("message", message);
  formData.set("delay", String(Math.max(0, Math.round(delaySeconds))));

  if (imageUrl) {
    // Menggunakan field 'url' untuk mengirimkan link publik gambar ke Fonnte
    formData.set("url", imageUrl);
    // Field 'filename' diperlukan Fonnte agar gambar tidak ditolak WA sebagai dokumen
    formData.set("filename", "referensi.jpg");
  }

  console.debug(`${logLabel} FormData yang akan dikirim ke Fonnte:`, {
    target: normalizedTarget,
    messageLength: message.length,
    hasUrl: !!imageUrl,
    urlPreview: imageUrl ? imageUrl.substring(0, 80) : undefined,
  });

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= FONNTE_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(FONNTE_ENDPOINT, {
        method: "POST",
        // Tidak set Content-Type header secara manual saat pakai FormData:
        // browser/Node akan otomatis set multipart/form-data + boundary yang benar
        headers: {
          Authorization: token,
        },
        body: formData,
      });

      const rawText = await response.text();

      if (!response.ok) {
        console.error(`${logLabel} Fonnte HTTP Error:`, {
          attempt,
          status: response.status,
          statusText: response.statusText,
          body: rawText,
        });

        if (
          attempt < FONNTE_MAX_ATTEMPTS &&
          shouldRetryFonnteHttpStatus(response.status)
        ) {
          await waitBeforeRetry(FONNTE_RETRY_DELAY_MS * attempt);
          continue;
        }

        throw new Error(`Fonnte API Error (${response.status}): ${rawText}`);
      }

      const result = JSON.parse(rawText) as FonnteResponse;

      if (result.status === false) {
        console.error(`${logLabel} Fonnte menolak pesan:`, {
          attempt,
          reason: result.reason,
        });
        throw new Error(`Fonnte rejection: ${result.reason || rawText}`);
      }

      console.info(`${logLabel} Berhasil mengirim pesan WhatsApp:`, {
        attempt,
        status: result.status,
        messageIds: result.id,
        hasImage: !!imageUrl,
        rawResponse: rawText.substring(0, 200),
      });
      return;
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error(String(error || "Unknown"));

      const message = lastError.message.toLowerCase();
      const isRetryableNetworkIssue =
        message.includes("fetch failed") ||
        message.includes("network") ||
        message.includes("timeout") ||
        message.includes("econnreset") ||
        message.includes("socket hang up");

      if (attempt < FONNTE_MAX_ATTEMPTS && isRetryableNetworkIssue) {
        console.warn(`${logLabel} Retry pengiriman WhatsApp ke Fonnte`, {
          attempt,
          nextAttempt: attempt + 1,
          error: lastError.message,
        });
        await waitBeforeRetry(FONNTE_RETRY_DELAY_MS * attempt);
        continue;
      }

      console.error(`${logLabel} Gagal dalam proses pengiriman:`, {
        attempt,
        error: lastError.message,
      });
      throw lastError;
    }
  }

  throw lastError ?? new Error("Fonnte send failed.");
}

export async function sendWhatsAppSequence(
  messages: FonnteOutboundMessage[],
  customTarget?: string,
): Promise<void> {
  const token = process.env.FONNTE_TOKEN?.trim();
  const defaultTarget = process.env.FONNTE_PRODUCTION_TARGET?.trim();
  const rawTarget = customTarget || defaultTarget;

  if (!token) {
    throw new Error(
      "[sendWhatsAppSequence] FONNTE_TOKEN tidak ditemukan di environment variables.",
    );
  }

  if (!rawTarget) {
    throw new Error(
      "[sendWhatsAppSequence] Target WhatsApp (FONNTE_PRODUCTION_TARGET) tidak ditemukan.",
    );
  }

  const normalizedTarget = normalizeFonnteTarget(rawTarget);
  const sanitizedMessages = messages
    .map((entry) => ({
      message: String(entry.message || "").trim(),
      imageUrl: entry.imageUrl?.trim() || undefined,
    }))
    .filter((entry) => entry.message || entry.imageUrl);

  if (sanitizedMessages.length === 0) {
    throw new Error("[sendWhatsAppSequence] Tidak ada pesan untuk dikirim.");
  }

  const sequencePayload = sanitizedMessages.map((entry) => ({
    target: normalizedTarget,
    message: entry.message,
    ...(entry.imageUrl ? { url: entry.imageUrl } : {}),
  }));

  const formData = new FormData();
  formData.set("data", JSON.stringify(sequencePayload));
  formData.set("sequence", "true");
  formData.set("countryCode", "0");

  console.info("[sendWhatsAppSequence] Mengirim batch WA berurutan:", {
    target: normalizedTarget,
    messageCount: sequencePayload.length,
    mediaCount: sequencePayload.filter((entry) => Boolean(entry.url)).length,
  });

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= FONNTE_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(FONNTE_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: token,
        },
        body: formData,
      });

      const rawText = await response.text();

      if (!response.ok) {
        console.error("[sendWhatsAppSequence] Fonnte HTTP Error:", {
          attempt,
          status: response.status,
          statusText: response.statusText,
          body: rawText,
        });

        if (
          attempt < FONNTE_MAX_ATTEMPTS &&
          shouldRetryFonnteHttpStatus(response.status)
        ) {
          await waitBeforeRetry(FONNTE_RETRY_DELAY_MS * attempt);
          continue;
        }

        throw new Error(`Fonnte API Error (${response.status}): ${rawText}`);
      }

      const result = JSON.parse(rawText) as FonnteResponse;
      if (result.status === false) {
        throw new Error(`Fonnte rejection: ${result.reason || rawText}`);
      }

      console.info("[sendWhatsAppSequence] Batch WA berhasil dikirim:", {
        attempt,
        status: result.status,
        messageIds: result.id,
      });
      return;
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error(String(error || "Unknown"));

      const message = lastError.message.toLowerCase();
      const isRetryableNetworkIssue =
        message.includes("fetch failed") ||
        message.includes("network") ||
        message.includes("timeout") ||
        message.includes("econnreset") ||
        message.includes("socket hang up");

      if (attempt < FONNTE_MAX_ATTEMPTS && isRetryableNetworkIssue) {
        await waitBeforeRetry(FONNTE_RETRY_DELAY_MS * attempt);
        continue;
      }

      throw lastError;
    }
  }

  throw lastError ?? new Error("Fonnte sequence send failed.");
}

export async function sendWhatsAppText(
  message: string,
  customTarget?: string,
  delaySeconds?: number,
): Promise<void> {
  await sendFonnteMessage(message, customTarget, undefined, delaySeconds);
}

/**
 * Mengirim pesan gambar ke WhatsApp via Fonnte
 */
export async function sendWhatsAppImage(
  imageUrl: string,
  caption = "ORDER BARU MASUK - PRODUKSI",
  customTarget?: string, // Opsional: jika ingin mengirim ke target selain target produksi default
  delaySeconds?: number,
): Promise<void> {
  if (!imageUrl || !isValidHttpUrl(imageUrl)) {
    throw new Error(
      `[sendWhatsAppImage] Image URL tidak valid atau kosong: ${imageUrl}`,
    );
  }

  await sendFonnteMessage(caption, customTarget, imageUrl, delaySeconds);
}
