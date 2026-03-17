"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
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
    if (typeof window !== "undefined") {
      const token = getCookie("token");
      if (token) {
        // Hard redirect via post-login route — handles role detection server-side
        window.location.replace("/api/auth/post-login");
      }
    }
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
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
      {/* Decorative blobs */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-indigo-200/30 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-80 h-80 bg-purple-200/30 rounded-full blur-3xl translate-x-1/3 translate-y-1/3 pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Card */}
        <div className="bg-white/90 backdrop-blur-sm p-8 sm:p-10 rounded-2xl shadow-xl border border-white/60">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <Link href="/" className="group">
              <Image
                src="/cuanify-logo.svg"
                alt="Cuanify"
                width={180}
                height={44}
                className="h-10 w-auto"
                priority
              />
            </Link>
          </div>

          <h1 className="text-2xl font-bold text-center text-gray-900 mb-1">
            Selamat Datang
          </h1>
          <p className="text-center text-gray-500 mb-7 text-sm">
            Masuk ke akun Anda untuk mulai kelola bisnis
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
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900 placeholder-gray-400 text-sm transition"
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
                className="w-full px-4 py-3 pr-11 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900 placeholder-gray-400 text-sm transition"
              />
              <button
                type="button"
                tabIndex={-1}
                className="absolute right-3 top-[34px] text-gray-400 hover:text-gray-600 transition"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            onClick={handleEmailLogin}
            disabled={loading}
            className="w-full mt-5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold py-3 rounded-xl transition shadow-md shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
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
            className="flex items-center justify-center gap-3 w-full bg-white border border-gray-200 text-gray-700 font-semibold py-3 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition text-sm"
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
                className="font-semibold text-indigo-600 hover:text-indigo-700 transition"
              >
                Daftar gratis
              </button>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-xs text-gray-400 text-center mt-6">
          &copy; 2026 Cuanify. All rights reserved.
        </p>
      </div>
    </div>
  );
}
