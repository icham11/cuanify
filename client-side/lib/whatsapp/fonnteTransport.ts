const FONNTE_ENDPOINT = "https://api.fonnte.com/send";

export type FonnteFields = Record<string, string>;

/**
 * Ringkas error fetch beserta penyebab aslinya (mis. ETIMEDOUT, ECONNREFUSED),
 * karena undici hanya memberi pesan generik "fetch failed".
 */
export function describeFetchError(error: unknown): string {
  if (!(error instanceof Error)) return String(error || "Unknown");
  const cause = error.cause as { code?: string; message?: string } | undefined;
  if (!cause) return error.message;
  const causeText = [cause.code, cause.message].filter(Boolean).join(" ");
  return causeText ? `${error.message} (cause: ${causeText})` : error.message;
}

export async function postToFonnte(
  token: string,
  fields: FonnteFields,
): Promise<Response> {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }

  // Tidak set Content-Type manual: Node otomatis set multipart/form-data + boundary
  return fetch(FONNTE_ENDPOINT, {
    method: "POST",
    headers: { Authorization: token },
    body: formData,
  });
}
