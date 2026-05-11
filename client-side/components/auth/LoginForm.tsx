"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "next-auth/react";
import { Eye, EyeOff } from "lucide-react";

// Helper to read cookie value
function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : undefined;
}

export function LoginForm() {
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
    <>
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
    </>
  );
}
