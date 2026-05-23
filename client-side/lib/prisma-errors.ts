import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

const DB_TIMEOUT_COOLDOWN_MS = 30_000;
const globalForDbHealth = globalThis as typeof globalThis & {
  __dbTimeoutCooldownUntil?: number;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export class DatabaseTemporarilyUnavailableError extends Error {
  constructor(
    message = "Koneksi database sedang tidak tersedia sementara. Coba lagi beberapa saat.",
  ) {
    super(message);
    this.name = "DatabaseTemporarilyUnavailableError";
  }
}

export function isPrismaConnectionTimeout(error: unknown): boolean {
  // Jika error sudah merupakan instansiasi dari DatabaseTemporarilyUnavailableError, langsung return true
  if (error instanceof DatabaseTemporarilyUnavailableError) {
    return true;
  }

  // Lakukan pengecekan struktural jika error adalah objek (seperti ErrorEvent WebSocket atau AggregateError)
  if (error && typeof error === "object") {
    const errObj = error as any;

    // Periksa apakah ada properti nested error (misalnya ErrorEvent.error) yang bertipe ETIMEDOUT
    if (errObj.error && typeof errObj.error === "object" && errObj.error.code === "ETIMEDOUT") {
      return true;
    }

    // Periksa jika properti code langsung bernilai ETIMEDOUT
    if (errObj.code === "ETIMEDOUT") {
      return true;
    }

    // Periksa jika ada properti errors (dari AggregateError) dan salah satunya bertipe ETIMEDOUT
    if (errObj.errors && Array.isArray(errObj.errors)) {
      if (errObj.errors.some((e: any) => e && (e.code === "ETIMEDOUT" || String(e).toLowerCase().includes("etimedout")))) {
        return true;
      }
    }
  }

  // Dapatkan string pesan error dan ubah menjadi huruf kecil (case-insensitive)
  const message = getErrorMessage(error).toLowerCase();

  // Deteksi berbagai kemungkinan string kegagalan koneksi database, termasuk isu WebSocket dan close code 1006 dari Neon Serverless
  return (
    message.includes("timeout exceeded when trying to connect") ||
    message.includes("can't reach database server") ||
    message.includes("cant reach database server") ||
    message.includes("connection timeout") ||
    message.includes("connection terminated due to connection timeout") ||
    message.includes("connection terminated unexpectedly") ||
    message.includes("connect timeout") ||
    message.includes("max clients reached in session mode") ||
    message.includes("emaxconnsession") ||
    message.includes("too many clients") ||
    message.includes("websocket") ||
    message.includes("1006") ||
    message.includes("etimedout") ||
    message.includes("aggregateerror")
  );
}

export function markPrismaTimeoutCooldown() {
  // Tandai waktu berakhirnya cooldown koneksi database
  globalForDbHealth.__dbTimeoutCooldownUntil =
    Date.now() + DB_TIMEOUT_COOLDOWN_MS;
}

export function isPrismaTimeoutCooldownActive(): boolean {
  // Ambil waktu cooldown yang terdaftar
  const until = globalForDbHealth.__dbTimeoutCooldownUntil ?? 0;
  // Periksa apakah waktu sekarang masih berada dalam durasi cooldown
  return until > Date.now();
}

export function throwIfPrismaTimeoutCooldownActive() {
  // Jika cooldown koneksi sedang aktif, langsung lemparkan error database tidak tersedia
  if (isPrismaTimeoutCooldownActive()) {
    throw new DatabaseTemporarilyUnavailableError();
  }
}

/**
 * Utilitas untuk menjalankan kueri database Prisma dengan mekanisme percobaan ulang (retry) otomatis.
 * Sangat tangguh untuk menangani error koneksi transient (seperti Neon DB cold-start timeout).
 *
 * @param fn Fungsi kueri database yang akan dieksekusi
 * @param retries Jumlah maksimal percobaan ulang (default: 3)
 * @param delayMs Jeda waktu awal sebelum mencoba kembali dalam milidetik (default: 1000ms)
 */
export async function withPrismaRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 1000
): Promise<T> {
  // Variabel untuk menampung error terakhir jika semua percobaan gagal
  let lastError: unknown;

  // Lakukan iterasi sejumlah maksimal percobaan yang diizinkan
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Selalu periksa apakah cooldown koneksi sedang aktif sebelum memulai eksekusi kueri
      throwIfPrismaTimeoutCooldownActive();

      // Jalankan kueri database
      return await fn();
    } catch (error) {
      // Simpan referensi error terakhir
      lastError = error;

      // Jika error terdeteksi sebagai masalah koneksi transient (misalnya timeout/cold-start)
      if (isPrismaConnectionTimeout(error)) {
        // Tulis log peringatan ke konsol untuk memudahkan debugging
        console.warn(
          `[PrismaRetry] Error koneksi transient terdeteksi pada percobaan ${attempt}/${retries}. Pesan:`,
          getErrorMessage(error)
        );

        // Jika masih ada sisa kesempatan mencoba kembali
        if (attempt < retries) {
          // Hitung waktu tunda menggunakan exponential backoff (makin lama jedanya di setiap kegagalan)
          const backoffDelay = delayMs * attempt;
          console.log(`[PrismaRetry] Menunggu ${backoffDelay}ms sebelum mencoba kueri kembali...`);
          // Tunggu selama durasi backoffDelay
          await new Promise((resolve) => setTimeout(resolve, backoffDelay));
          continue;
        }
      }

      // Jika bukan error koneksi transient, atau sudah mencapai percobaan terakhir, lempar langsung error tersebut
      throw error;
    }
  }

  // Jika semua percobaan habis dan selalu gagal dengan connection error, lemparkan error terakhir
  throw lastError;
}

export function prismaConnectionErrorResponse(
  fallbackMessage = "Koneksi database sedang sibuk. Coba lagi beberapa saat.",
) {
  // Aktifkan tanda cooldown koneksi
  markPrismaTimeoutCooldown();
  // Kembalikan respons 503 Service Unavailable
  return NextResponse.json({ error: fallbackMessage }, { status: 503 });
}
