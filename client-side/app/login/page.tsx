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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#f8efe6_0%,#f2eae1_46%,#e8ddd2_100%)] px-4 py-6 text-[var(--foreground)] sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-[430px] rounded-[36px] border border-[var(--crumbella-border)] bg-[linear-gradient(180deg,rgba(242,234,225,0.98)_0%,rgba(253,250,247,0.94)_100%)] px-5 py-7 shadow-[0_28px_52px_-34px_rgba(30,18,10,0.52)] sm:px-6 sm:py-8">
        <div className="mb-8 text-center">
          <div className="text-[2rem] font-extrabold tracking-tight text-[var(--crumbella-primary)] sm:text-[2.2rem]">
            Crumbella
          </div>
          <p className="mt-1 text-[13px] text-[var(--crumbella-muted)] sm:text-sm">
            Internal Dashboard
          </p>
        </div>

        <div className="rounded-[26px] border border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] p-5 shadow-[0_16px_30px_-24px_rgba(30,18,10,0.5)] sm:p-6">
          <h1 className="text-[1.6rem] font-extrabold leading-tight text-[var(--foreground)] sm:text-[1.85rem]">
            Selamat Datang
          </h1>
          <p className="mt-2 text-[12px] leading-relaxed text-[var(--crumbella-muted)] sm:text-[13px]">
            Masuk ke dashboard Crumbella untuk kelola operasional harian
          </p>

          {error && (
            <div className="mt-4 rounded-xl border border-[#e8a0a0] bg-[#fdeaea] px-3 py-2 text-[11.5px] font-medium text-[#a83030]">
              {error}
            </div>
          )}

          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--foreground)]">
                Email
              </label>
              <input
                type="email"
                placeholder="nama@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleEmailLogin()}
                className="w-full rounded-[14px] border border-[var(--crumbella-border)] bg-[var(--background)] px-4 py-3 text-[15px] text-[var(--foreground)] placeholder:text-[var(--crumbella-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--crumbella-focus)]"
              />
            </div>
            <div className="relative">
              <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--foreground)]">
                Password
              </label>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Masukkan password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleEmailLogin()}
                className="w-full rounded-[14px] border border-[var(--crumbella-border)] bg-[var(--background)] px-4 py-3 pr-11 text-[15px] tracking-[0.2em] text-[var(--foreground)] placeholder:text-[var(--crumbella-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--crumbella-focus)]"
              />
              <button
                type="button"
                aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                aria-pressed={showPassword}
                className="absolute right-3 top-9 text-[var(--crumbella-muted)] transition hover:text-[var(--foreground)]"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            onClick={handleEmailLogin}
            disabled={loading}
            className="mt-5 w-full rounded-[14px] bg-[var(--crumbella-accent)] py-3.5 text-[15px] font-bold text-white transition hover:bg-[var(--crumbella-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60 sm:text-base"
          >
            {loading ? "Memproses..." : "Masuk ->"}
          </button>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-[var(--crumbella-border)]" />
            <span className="text-xs text-[var(--crumbella-muted)]">atau</span>
            <div className="h-px flex-1 bg-[var(--crumbella-border)]" />
          </div>

          <button
            onClick={() =>
              signIn("google", { callbackUrl: "/api/auth/post-login" })
            }
            className="flex w-full items-center justify-center gap-3 rounded-[14px] border border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] py-3 text-sm font-semibold text-[var(--foreground)] transition hover:bg-white"
          >
            <svg className="h-5 w-5" viewBox="0 0 48 48" fill="none">
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

          <div className="mt-6 text-center">
            <p className="text-[11.5px] text-[var(--crumbella-muted)]">
              Belum punya akun?{" "}
              <button
                onClick={() => router.push("/register")}
                className="font-semibold text-[var(--crumbella-primary)] transition hover:text-[var(--crumbella-accent)]"
              >
                Daftar gratis
              </button>
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-[10.5px] text-[var(--crumbella-muted)]">
          &copy; 2026 Crumbella Admin. All rights reserved.
        </p>
      </div>
    </div>
  );
}
