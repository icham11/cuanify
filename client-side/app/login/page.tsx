"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signIn, getSession } from "next-auth/react";
import { Eye, EyeOff } from "lucide-react";

// Helper to read cookie value
function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : undefined;
}

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Redirect if already authenticated — role-aware
  useEffect(() => {
    async function checkAuth() {
      // 1. Check custom JWT cookie
      const token = getCookie("token");
      
      // 2. Check NextAuth session on client side
      const session = await getSession();

      if (token || session) {
        // Anti-loop protection: if we've redirected more than 3 times in 10 seconds, stop.
        const now = Date.now();
        const lastRedirect = Number(sessionStorage.getItem("last_auth_redirect") || 0);
        const redirectCount = Number(sessionStorage.getItem("auth_redirect_count") || 0);

        if (now - lastRedirect < 10000 && redirectCount > 3) {
          console.warn("Auth loop detected. Stopping automatic redirect.");
          setError("Terdeteksi masalah login (loop). Silakan hapus cache browser Anda.");
          return;
        }

        sessionStorage.setItem("last_auth_redirect", String(now));
        sessionStorage.setItem("auth_redirect_count", String(redirectCount + 1));

        window.location.replace("/api/auth/post-login");
      } else {
        // Reset count if we are finally showing the login page
        sessionStorage.removeItem("auth_redirect_count");
      }
    }
    
    checkAuth();
  }, []);

  const handleEmailLogin = async () => {
    setError("");

    if (!email || !password) {
      setError("Email dan password wajib diisi");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }

      // Login success — redirect through server-side post-login route
      // which checks role (Cashier → /pos, Owner → /dashboard, no business → /onboarding)
      await new Promise((r) => setTimeout(r, 200)); // wait for cookie to set
      window.location.replace("/api/auth/post-login");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login gagal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-linear-to-br from-[#f6f8fc] via-[#fffaf5] to-[#fef3ea] p-4">
      {/* Decorative blobs */}
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-[#dbe2ea]/70 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -right-20 h-80 w-80 rounded-full bg-[#ffd6bf]/50 blur-3xl" />

      <div className="w-full max-w-md relative z-10">
        {/* Card */}
        <div className="rounded-2xl border border-[#e5e7eb] bg-white/95 p-8 shadow-xl shadow-slate-200/70 backdrop-blur-sm sm:p-10">
          <h1 className="mb-1 text-center text-2xl font-bold text-[#243b5a]">
            Selamat Datang
          </h1>
          <p className="mb-7 text-center text-sm text-gray-500">
            Masuk ke dashboard Crumbella untuk kelola operasional cake shop
          </p>

          {/* Error message */}
          {error && (
            <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded-xl">
              {error}
            </div>
          )}

          {/* Email Login Form */}
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                placeholder="nama@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleEmailLogin()}
                className="w-full rounded-xl border border-[#dbe2ea] px-4 py-3 text-sm text-gray-900 placeholder-gray-400 transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#334e68]"
              />
            </div>
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Masukkan password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleEmailLogin()}
                className="w-full rounded-xl border border-[#dbe2ea] px-4 py-3 pr-11 text-sm text-gray-900 placeholder-gray-400 transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#334e68]"
              />
              <button
                type="button"
                aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                aria-pressed={showPassword}
                className="absolute right-3 top-8.5 text-gray-400 transition hover:text-gray-600"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            onClick={handleEmailLogin}
            disabled={loading}
            className="mt-5 w-full rounded-xl bg-linear-to-r from-[#f36f21] to-[#d85f1c] py-3 text-sm font-bold text-white shadow-md shadow-orange-200 transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Memproses..." : "Masuk"}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 font-medium">atau</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Google Login */}
          <button
            onClick={() =>
              signIn("google", { callbackUrl: "/api/auth/post-login" })
            }
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-[#dbe2ea] bg-white py-3 text-sm font-semibold text-gray-700 transition hover:border-[#cfd7e3] hover:bg-[#fffaf5]"
          >
            <svg className="w-5 h-5" viewBox="0 0 48 48" fill="none">
              <path
                d="M47.532 24.552c0-1.636-.146-3.192-.418-4.667H24.48v8.844h12.98c-.56 3.016-2.24 5.57-4.77 7.29v6.06h7.72c4.52-4.164 7.12-10.3 7.12-17.527z"
                fill="#4285F4"
              />
              <path
                d="M24.48 48c6.48 0 11.93-2.15 15.91-5.85l-7.72-6.06c-2.14 1.44-4.88 2.3-8.19 2.3-6.3 0-11.63-4.26-13.54-9.98H2.01v6.25C5.97 43.14 14.48 48 24.48 48z"
                fill="#34A853"
              />
              <path
                d="M10.94 28.41a14.77 14.77 0 0 1 0-9.42v-6.25H2.01a24.01 24.01 0 0 0 0 21.92l8.93-6.25z"
                fill="#FBBC05"
              />
              <path
                d="M24.48 9.5c3.53 0 6.67 1.22 9.15 3.62l6.84-6.84C36.41 2.15 30.96 0 24.48 0 14.48 0 5.97 4.86 2.01 12.34l8.93 6.25c1.91-5.72 7.24-9.98 13.54-9.98z"
                fill="#EA4335"
              />
            </svg>
            Masuk dengan Google
          </button>

          {/* Register Link */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              Belum punya akun?{" "}
              <button
                onClick={() => router.push("/register")}
                className="font-semibold text-[#243b5a] transition hover:text-[#1f324d]"
              >
                Daftar gratis
              </button>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-xs text-gray-400 text-center mt-6">
          &copy; 2026 Crumbella Admin. All rights reserved.
        </p>
      </div>
    </div>
  );
}
