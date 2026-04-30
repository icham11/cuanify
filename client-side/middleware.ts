import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Simpan state rate-limit di memory.
// Catatan: Pada Vercel Serverless/Edge, variabel ini akan tersimpan per isolate,
// sehingga tidak menjamin 100% exact limit across all global requests,
// namun cukup untuk mitigasi dasar DDoS dan bruteforce.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function middleware(request: NextRequest) {
  // Ambil IP address dari request header
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  
  const now = Date.now();
  const windowMs = 60_000; // 1 menit
  const maxRequests = 100; // maksimal 100 request per menit per IP
  
  const record = rateLimitMap.get(ip);

  if (!record) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
  } else if (now > record.resetAt) {
    // Reset limit jika waktu sudah melewati window
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
  } else {
    record.count++;
    if (record.count > maxRequests) {
      // Jika melebihi batas, tolak dengan HTTP 429 Too Many Requests
      return new NextResponse(
        JSON.stringify({ error: "Terlalu banyak permintaan, coba lagi nanti." }),
        { 
          status: 429, 
          headers: { "Content-Type": "application/json" } 
        }
      );
    }
  }

  return NextResponse.next();
}

// Konfigurasi matcher middleware agar hanya berjalan di endpoint API
export const config = {
  matcher: "/api/:path*",
};
