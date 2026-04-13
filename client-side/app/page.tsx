"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Space_Grotesk, Manrope } from "next/font/google";
import {
  ArrowRight,
  CalendarCheck2,
  ClipboardList,
  KeyRound,
  MonitorCog,
  UserCog,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const headingFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
});

const bodyFont = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

function getCookie(name: string): string | null {
  if (typeof window === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
  return null;
}

const QUICK_ROUTES: Array<{
  title: string;
  hint: string;
  href: string;
  icon: LucideIcon;
  accent: string;
}> = [
  {
    title: "Dashboard Owner",
    hint: "Kontrol KPI, laporan, dan setup bisnis.",
    href: "/dashboard/business",
    icon: MonitorCog,
    accent: "from-[#173a7a] to-[#2a4d91]",
  },
  {
    title: "Produksi Staff",
    hint: "Update assignment dan progres harian.",
    href: "/bakery/production",
    icon: ClipboardList,
    accent: "from-[#f26a21] to-[#d85f1c]",
  },
  {
    title: "POS Kasir",
    hint: "Akses kasir cepat untuk transaksi toko.",
    href: "/pos",
    icon: UserCog,
    accent: "from-[#25b4c8] to-[#0f6f7d]",
  },
  {
    title: "Kalender Booking",
    hint: "Kelola timeline order produksi mingguan.",
    href: "/bakery/calendar",
    icon: CalendarCheck2,
    accent: "from-[#f9bd1f] to-[#f26a21]",
  },
];

export default function LandingPage() {
  const [isChecking, setIsChecking] = useState(true);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const token = getCookie("token");
    if (token) {
      window.location.href = "/api/auth/post-login";
      return;
    }

    setIsChecking(false);
    requestAnimationFrame(() => setIsReady(true));
  }, []);

  if (isChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f8fc]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-[#173a7a]" />
          <p className="text-sm text-gray-500">Menyiapkan Workspace Crumbella...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${bodyFont.className} relative min-h-screen overflow-hidden bg-[#f8fafc] text-[#111827]`}
    >
      <div className="pointer-events-none absolute -left-20 -top-20 h-96 w-96 rounded-full bg-[#f26a21]/15 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-0 h-80 w-80 rounded-full bg-[#25b4c8]/18 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-[#f9bd1f]/18 blur-3xl" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 pb-10 pt-4 sm:px-6 lg:px-8">
        <main className="mt-4 grid flex-1 items-stretch gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section
            className={`rounded-4xl border border-[#ffd8b7] bg-[linear-gradient(135deg,#173a7a_0%,#243b5a_45%,#f26a21_100%)] p-6 text-white shadow-[0_28px_60px_-35px_rgba(23,58,122,0.95)] transition-all duration-700 sm:p-9 ${
              isReady ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
            }`}
          >
            <div className="-mx-1 mb-5 overflow-hidden rounded-2xl border border-white/20 bg-white/5 sm:-mx-2">
              <Image
                src="/branding/Copy%20of%20booth%20sisi%20atas.png"
                alt="Crumbella Booth"
                width={1100}
                height={300}
                className="h-auto w-full object-contain"
                sizes="(max-width: 768px) 100vw, 52vw"
                priority
              />
            </div>

            <h1
              className={`${headingFont.className} mt-4 text-4xl font-bold leading-[1.05] sm:text-5xl`}
            >
              Command Center untuk Tim Internal Crumbella
            </h1>

            <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-100/95 sm:text-base">
              Halaman ini untuk operasional tim internal Crumbella: owner,
              staff, kasir, dan admin. Semua alur pencatatan dan monitoring
              harian dimulai dari sini.
            </p>

            <div className="mt-6 flex flex-wrap gap-2.5">
              {["Role-based Access", "Secure Session", "Operational Mode"].map(
                (tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-medium"
                  >
                    {tag}
                  </span>
                ),
              )}
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-[#173a7a] transition hover:brightness-95"
              >
                Masuk ke Workspace
                <ArrowRight className="h-4 w-4" />
              </Link>

              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-xl border border-white/40 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/20"
              >
                Buat Akun Tim
                <KeyRound className="h-4 w-4" />
              </Link>
            </div>

          </section>

          <section className="grid h-full gap-4 lg:grid-rows-4">
            {QUICK_ROUTES.map((item, index) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.title}
                  href={`/login?next=${encodeURIComponent(item.href)}`}
                  className={`group flex h-full flex-col rounded-3xl border border-[#ffd8b7] bg-white/92 p-5 shadow-[0_18px_40px_-30px_rgba(23,58,122,0.8)] transition-all duration-700 hover:-translate-y-0.5 hover:shadow-[0_22px_44px_-30px_rgba(23,58,122,0.9)] ${
                    isReady ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0"
                  }`}
                  style={{ transitionDelay: `${180 + index * 90}ms` }}
                >
                  <div className="flex items-center justify-between">
                    <div
                      className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-linear-to-br ${item.accent} text-white`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <ArrowRight className="h-4 w-4 text-[#64748b] transition group-hover:translate-x-0.5 group-hover:text-[#173a7a]" />
                  </div>
                  <h2
                    className={`${headingFont.className} mt-4 text-lg font-semibold text-[#173a7a]`}
                  >
                    {item.title}
                  </h2>
                  <p className="mt-1 text-sm text-[#475569]">{item.hint}</p>
                </Link>
              );
            })}
          </section>
        </main>

        <section
          className={`mt-6 rounded-3xl border border-[#dbe2ea] bg-white/90 p-5 shadow-[0_14px_28px_-22px_rgba(23,58,122,0.8)] backdrop-blur-sm transition-all duration-700 sm:p-6 ${
            isReady ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
          }`}
          style={{ transitionDelay: "420ms" }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#64748b]">
              Kickoff Harian Tim
            </p>
            <span className="rounded-full border border-[#ffd8b7] bg-[#fff4ed] px-3 py-1 text-xs font-semibold text-[#b4531a]">
              Internal Operations
            </span>
          </div>

          <div className="mt-3 grid gap-2 text-sm text-[#334155] sm:grid-cols-3">
            <div className="rounded-2xl border border-[#eef2f7] bg-[#f8fafc] px-4 py-3">
              1. Verifikasi akses role tim pagi ini.
            </div>
            <div className="rounded-2xl border border-[#eef2f7] bg-[#f8fafc] px-4 py-3">
              2. Cek antrean produksi dan kalender booking.
            </div>
            <div className="rounded-2xl border border-[#eef2f7] bg-[#f8fafc] px-4 py-3">
              3. Jalankan operasional kasir dan monitoring dashboard.
            </div>
          </div>
        </section>

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[#e5e7eb] pt-4 text-xs text-[#64748b]">
          <p>© 2026 Crumbella. Internal team workspace.</p>
          <p>Powered by role-aware access and secure session routing.</p>
        </footer>
      </div>
    </div>
  );
}
