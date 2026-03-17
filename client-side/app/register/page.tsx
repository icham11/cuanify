"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Eye, EyeOff } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirmPassword) {
      setError("Password tidak sama");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }
      router.push("/login");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registrasi gagal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
      {/* Decorative blobs */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-purple-200/30 rounded-full blur-3xl translate-x-1/3 -translate-y-1/3 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-indigo-200/30 rounded-full blur-3xl -translate-x-1/3 translate-y-1/3 pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
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
            Buat Akun Baru
          </h1>
          <p className="text-center text-gray-500 mb-7 text-sm">
            Daftar gratis untuk mulai kelola bisnis Anda
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nama Lengkap
              </label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900 placeholder-gray-400 text-sm transition"
                placeholder="Nama lengkap Anda"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900 placeholder-gray-400 text-sm transition"
                placeholder="nama@email.com"
              />
            </div>
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                value={form.password}
                onChange={handleChange}
                required
                minLength={6}
                className="w-full px-4 py-3 pr-11 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900 placeholder-gray-400 text-sm transition"
                placeholder="Min. 6 karakter"
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Konfirmasi Password
              </label>
              <input
                type={showPassword ? "text" : "password"}
                name="confirmPassword"
                value={form.confirmPassword}
                onChange={handleChange}
                required
                minLength={6}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900 placeholder-gray-400 text-sm transition"
                placeholder="Ulangi password"
              />
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded-xl">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold py-3 rounded-xl transition shadow-md shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {loading ? "Mendaftar..." : "Daftar Gratis"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              Sudah punya akun?{" "}
              <button
                onClick={() => router.push("/login")}
                className="font-semibold text-indigo-600 hover:text-indigo-700 transition"
              >
                Masuk di sini
              </button>
            </p>
          </div>
        </div>

        <p className="text-xs text-gray-400 text-center mt-6">
          &copy; 2026 Cuanify. All rights reserved.
        </p>
      </div>
    </div>
  );
}
