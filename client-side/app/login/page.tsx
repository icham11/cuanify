"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

async function hasActiveSession(): Promise<boolean> {
  try {
    const response = await fetch("/api/auth/me", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForActiveSession(timeoutMs = 5000): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await hasActiveSession()) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return false;
}

function fallbackLoginErrorMessage(status: number): string {
  if (status === 400) return "Email dan password wajib diisi";
  if (status === 401) return "Email atau password salah";
  if (status === 503) {
    return "Koneksi database sedang sibuk. Coba login lagi beberapa saat.";
  }
  return "Login gagal. Coba lagi.";
}

async function readLoginErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const payload = await response.json().catch(() => null);
    if (payload && typeof payload.error === "string" && payload.error.trim()) {
      return payload.error;
    }
    if (
      payload &&
      typeof payload.message === "string" &&
      payload.message.trim()
    ) {
      return payload.message;
    }
  }

  const text = (await response.text()).trim();

  if (!text) {
    return fallbackLoginErrorMessage(response.status);
  }

  if (
    text.startsWith("<!DOCTYPE") ||
    text.startsWith("<html") ||
    text.includes("<body")
  ) {
    return fallbackLoginErrorMessage(response.status);
  }

  return text;
}

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function checkAuth() {
      const authenticated = await hasActiveSession();

      if (authenticated) {
        const now = Date.now();
        const lastRedirect = Number(
          sessionStorage.getItem("last_auth_redirect") || 0,
        );
        const redirectCount = Number(
          sessionStorage.getItem("auth_redirect_count") || 0,
        );

        if (now - lastRedirect < 10000 && redirectCount > 3) {
          console.warn("Auth loop detected. Stopping automatic redirect.");
          setError(
            "Terdeteksi masalah login (loop). Silakan hapus cache browser Anda.",
          );
          return;
        }

        sessionStorage.setItem("last_auth_redirect", String(now));
        sessionStorage.setItem(
          "auth_redirect_count",
          String(redirectCount + 1),
        );

        window.location.replace("/api/auth/post-login");
      } else {
        sessionStorage.removeItem("auth_redirect_count");
      }
    }

    void checkAuth();
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
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        throw new Error(await readLoginErrorMessage(res));
      }

      const sessionReady = await waitForActiveSession(1500);
      if (!sessionReady) {
        // Android WebView/tablet browsers can apply Set-Cookie slightly later
        // for follow-up fetches even though the login itself already succeeded.
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

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
                aria-label={
                  showPassword ? "Sembunyikan password" : "Tampilkan password"
                }
                aria-pressed={showPassword}
                className="absolute right-3 top-9 text-[var(--crumbella-muted)] transition hover:text-[var(--foreground)]"
                onClick={() => setShowPassword((value) => !value)}
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
