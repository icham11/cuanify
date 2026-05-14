"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

async function hasActiveSession(): Promise<boolean> {
  try {
    const response = await fetch("/api/auth/me", {
      method: "GET",
      credentials: "same-origin",
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

export function LoginForm() {
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
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }

      const sessionReady = await waitForActiveSession();
      if (!sessionReady) {
        throw new Error("Sesi login belum siap. Coba klik masuk sekali lagi.");
      }

      window.location.replace("/api/auth/post-login");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login gagal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <h1 className="mb-1 text-center text-2xl font-bold text-[#243b5a]">
        Selamat Datang
      </h1>
      <p className="mb-7 text-center text-sm text-gray-500">
        Masuk ke dashboard Crumbella untuk kelola operasional cake shop
      </p>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
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
          <label className="mb-1 block text-sm font-medium text-gray-700">
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
            aria-label={
              showPassword ? "Sembunyikan password" : "Tampilkan password"
            }
            aria-pressed={showPassword}
            className="absolute right-3 top-8.5 text-gray-400 transition hover:text-gray-600"
            onClick={() => setShowPassword((value) => !value)}
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
    </>
  );
}
