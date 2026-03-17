"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  ShoppingCart,
  Package,
  BarChart3,
  Sparkles,
  CheckCircle,
  Bot,
  BookOpen,
  Users,
  Download,
  Wifi,
  Shield,
  ArrowRight,
  Star,
  Zap,
} from "lucide-react";

function getCookie(name: string): string | null {
  if (typeof window === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
  return null;
}

const FEATURES = [
  {
    icon: ShoppingCart,
    title: "POS Kasir Modern",
    desc: "Transaksi cepat dengan Cash, QRIS, Transfer, dan e-Wallet. Shortcut keyboard untuk kecepatan kasir.",
    color: "from-blue-500 to-indigo-500",
    bg: "bg-blue-50",
    iconColor: "text-blue-600",
  },
  {
    icon: Package,
    title: "Inventori FIFO Otomatis",
    desc: "Stok bahan baku terpotong otomatis saat transaksi. Perhitungan cost akurat dengan metode FIFO.",
    color: "from-emerald-500 to-teal-500",
    bg: "bg-emerald-50",
    iconColor: "text-emerald-600",
  },
  {
    icon: BookOpen,
    title: "Kasbon & Piutang",
    desc: "Catat utang pelanggan langsung dari POS. Lacak jatuh tempo dan status pelunasan.",
    color: "from-amber-500 to-orange-500",
    bg: "bg-amber-50",
    iconColor: "text-amber-600",
  },
  {
    icon: Bot,
    title: "AI Assistant",
    desc: "Chatbot AI yang paham data bisnis Anda. Analisis gambar, upload PDF, dan saran pintar.",
    color: "from-violet-500 to-purple-500",
    bg: "bg-violet-50",
    iconColor: "text-violet-600",
  },
  {
    icon: BarChart3,
    title: "Analytics Real-time",
    desc: "Dashboard penjualan, profit margin, produk terlaris, dan forecasting otomatis.",
    color: "from-indigo-500 to-blue-500",
    bg: "bg-indigo-50",
    iconColor: "text-indigo-600",
  },
  {
    icon: Users,
    title: "Multi-Role: Owner & Kasir",
    desc: "Owner lihat semua data. Kasir hanya akses POS. Cegah kecurangan dengan role terpisah.",
    color: "from-pink-500 to-rose-500",
    bg: "bg-pink-50",
    iconColor: "text-pink-600",
  },
  {
    icon: Download,
    title: "Export CSV & Excel",
    desc: "Download laporan transaksi dan inventori untuk pembukuan atau lapor pajak.",
    color: "from-cyan-500 to-sky-500",
    bg: "bg-cyan-50",
    iconColor: "text-cyan-600",
  },
  {
    icon: Wifi,
    title: "PWA & Offline Support",
    desc: "Install di HP seperti app native. Tetap bisa akses saat internet putus sebentar.",
    color: "from-teal-500 to-emerald-500",
    bg: "bg-teal-50",
    iconColor: "text-teal-600",
  },
];

const STATS = [
  { value: "100%", label: "Gratis Selamanya" },
  { value: "8+", label: "Fitur Lengkap" },
  { value: "< 2 dtk", label: "Transaksi Kasir" },
  { value: "24/7", label: "AI Assistant" },
];

export default function LandingPage() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const token = getCookie("token");
    if (token) {
      window.location.href = "/api/auth/post-login";
    } else {
      setTimeout(() => setIsChecking(false), 0);
    }
  }, [router]);

  if (isChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Memuat...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex flex-col relative overflow-hidden">
      {/* Decorative bg blobs */}
      <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-indigo-200/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-purple-200/20 rounded-full blur-3xl translate-x-1/3 translate-y-1/3 pointer-events-none" />

      {/* ═══ Navigation ═══ */}
      <nav className="container mx-auto px-4 sm:px-6 py-4 sm:py-5 flex justify-between items-center relative z-10">
        <Link href="/" className="flex items-center group">
          <Image
            src="/cuanify-logo.svg"
            alt="Cuanify"
            width={160}
            height={40}
            className="h-8 sm:h-10 w-auto"
            priority
          />
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/login"
            className="px-3 sm:px-5 py-2 sm:py-2.5 text-indigo-600 hover:text-indigo-700 font-semibold transition text-xs sm:text-sm"
          >
            Masuk
          </Link>
          <Link
            href="/register"
            className="px-3 sm:px-5 py-2 sm:py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 font-semibold transition shadow-md shadow-indigo-200 hover:shadow-lg text-xs sm:text-sm"
          >
            Daftar
          </Link>
        </div>
      </nav>

      {/* ═══ Hero ═══ */}
      <section className="container mx-auto px-4 sm:px-6 pt-10 sm:pt-16 pb-14 sm:pb-20 flex flex-col lg:flex-row items-center gap-10 sm:gap-16 relative z-10">
        {/* Left */}
        <div className="flex-1 space-y-7 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-100/80 text-indigo-700 rounded-full text-xs font-semibold border border-indigo-200/50">
            <Sparkles className="w-3.5 h-3.5" />
            Platform Bisnis dengan AI
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-[1.1] tracking-tight">
            Bikin Bisnis{" "}
            <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              Makin Cuan
            </span>
          </h1>

          <p className="text-lg text-gray-600 leading-relaxed max-w-xl">
            <strong className="text-gray-800">Cuanify</strong> adalah platform
            lengkap untuk UMKM Indonesia — dari kasir, stok bahan baku, kasbon,
            sampai AI yang bantu analisis bisnis Anda. Semua dalam satu
            aplikasi.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Link
              href="/register"
              className="flex items-center justify-center gap-2 px-7 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-bold text-base hover:from-indigo-700 hover:to-purple-700 transition shadow-lg shadow-indigo-200 hover:shadow-xl"
            >
              Mulai Sekarang yuk!
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="#features"
              className="flex items-center justify-center gap-2 px-7 py-3.5 bg-white text-gray-700 rounded-xl font-semibold text-base border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition"
            >
              Lihat Fitur
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:gap-5 pt-4">
            <div className="flex items-center gap-1.5 text-sm text-gray-500">
              {/* <CheckCircle className="w-4 h-4 text-green-500" />
              Gratis selamanya */}
            </div>
            <div className="flex items-center gap-1.5 text-sm text-gray-500">
              <CheckCircle className="w-4 h-4 text-green-500" />
              Tanpa kartu kredit
            </div>
            <div className="flex items-center gap-1.5 text-sm text-gray-500">
              <CheckCircle className="w-4 h-4 text-green-500" />
              Setup 5 menit
            </div>
          </div>
        </div>

        {/* Right — Feature preview cards */}
        <div className="hidden md:grid flex-1 grid-cols-2 gap-4 max-w-md w-full">
          {FEATURES.slice(0, 4).map((f, i) => (
            <div
              key={f.title}
              className="bg-white/80 backdrop-blur-sm p-5 rounded-2xl shadow-lg border border-white/60 hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div
                className={`w-10 h-10 ${f.bg} rounded-xl flex items-center justify-center mb-3`}
              >
                <f.icon className={`w-5 h-5 ${f.iconColor}`} />
              </div>
              <h3 className="font-bold text-gray-900 text-sm mb-1">
                {f.title}
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ Stats bar ═══ */}
      <section className="relative z-10 border-y border-indigo-100 bg-white/60 backdrop-blur-sm">
        <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8 grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-3xl font-extrabold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                {s.value}
              </p>
              <p className="text-sm text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ All Features ═══ */}
      <section
        id="features"
        className="container mx-auto px-4 sm:px-6 py-14 sm:py-20 relative z-10"
      >
        <div className="text-center mb-10 sm:mb-14 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-100/80 text-purple-700 rounded-full text-xs font-semibold mb-4">
            <Zap className="w-3.5 h-3.5" />
            Fitur Lengkap
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">
            Semua yang UMKM Butuhkan,{" "}
            <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              Satu Platform
            </span>
          </h2>
          <p className="text-gray-500 text-lg">
            Dari jualan sampai laporan, Cuanify bantu semua — tanpa ribet.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div
                className={`w-12 h-12 ${f.bg} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}
              >
                <f.icon className={`w-6 h-6 ${f.iconColor}`} />
              </div>
              <h3 className="font-bold text-gray-900 mb-2">{f.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ Trust / Why Cuanify ═══ */}
      <section className="container mx-auto px-4 sm:px-6 pb-14 sm:pb-20 relative z-10">
        <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-violet-600 rounded-2xl sm:rounded-3xl p-6 sm:p-10 md:p-14 text-white relative overflow-hidden">
          {/* Decorative */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />

          <div className="relative z-10 max-w-3xl">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-indigo-200" />
              <span className="text-indigo-200 text-sm font-semibold">
                Kenapa Cuanify?
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold mb-6 leading-tight">
              Dirancang Khusus untuk Pemilik UMKM Indonesia
            </h2>
            <div className="grid sm:grid-cols-2 gap-4 mb-8">
              {[
                "Bahasa Indonesia, mudah dipahami",
                "Support kasbon — tradisi warung Indonesia",
                "AI paham konteks bisnis Anda",
                "Bisa di-install di HP seperti app biasa",
                // "Gratis selamanya, tanpa batasan",
                "Data aman & terenkripsi",
              ].map((item) => (
                <div key={item} className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-300 mt-0.5 shrink-0" />
                  <span className="text-indigo-100 text-sm">{item}</span>
                </div>
              ))}
            </div>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-7 py-3.5 bg-white text-indigo-700 rounded-xl font-bold text-base hover:bg-indigo-50 transition shadow-lg"
            >
              Daftar Sekarang
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ Testimonial / Social proof ═══ */}
      <section className="container mx-auto px-4 sm:px-6 pb-14 sm:pb-20 relative z-10">
        <div className="text-center mb-8 sm:mb-10">
          <h2 className="text-2xl font-bold text-gray-900">
            Apa Kata Pengguna?
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 max-w-4xl mx-auto">
          {[
            {
              name: "Rina",
              biz: "Warung Kopi",
              text: "Sekarang stok bahan baku otomatis terpotong, ga perlu catat manual lagi!",
            },
            {
              name: "Budi",
              biz: "Toko Kelontong",
              text: "Fitur kasbon bikin pelanggan tetap tercatat. Tidak ada lagi hutang yang lupa.",
            },
            {
              name: "Sari",
              biz: "Bakery & Cake",
              text: "AI-nya bisa kasih saran produk terlaris. Omset naik 30% dalam sebulan!",
            },
          ].map((t) => (
            <div
              key={t.name}
              className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm"
            >
              <div className="flex gap-1 mb-3">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    className="w-4 h-4 text-amber-400 fill-amber-400"
                  />
                ))}
              </div>
              <p className="text-gray-600 text-sm mb-4 leading-relaxed">
                &ldquo;{t.text}&rdquo;
              </p>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-indigo-400 to-purple-400 rounded-full flex items-center justify-center text-white text-xs font-bold">
                  {t.name[0]}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {t.name}
                  </p>
                  <p className="text-xs text-gray-400">{t.biz}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ Final CTA ═══ */}
      <section className="container mx-auto px-4 sm:px-6 pb-14 sm:pb-20 relative z-10">
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl sm:rounded-3xl p-6 sm:p-10 md:p-14 text-center text-white shadow-2xl shadow-indigo-200">
          <h2 className="text-3xl sm:text-4xl font-extrabold mb-3">
            Siap Bikin Bisnis Makin Cuan?
          </h2>
          <p className="text-indigo-200 text-lg mb-8 max-w-lg mx-auto">
            Bergabung dengan Cuanify sekarang, tanpa ribet, langsung pakai.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 px-8 py-4 bg-white text-indigo-700 rounded-xl font-bold text-lg hover:bg-indigo-50 transition shadow-lg"
          >
            Daftar Sekarang gan!
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* ═══ Footer ═══ */}
      <footer className="border-t border-gray-200 bg-white/50 backdrop-blur-sm relative z-10">
        <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center">
            <Image
              src="/cuanify-logo.svg"
              alt="Cuanify"
              width={130}
              height={32}
              className="h-7 w-auto"
            />
          </div>
          <p className="text-sm text-gray-400">
            &copy; 2026 Cuanify. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
