import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Toaster } from "sonner";
import "./globals.css";
import AppProviders from "@/context/AppProviders";
import PWAProvider from "@/app/components/PWAProvider";

// Initialize auto-cleanup scheduler for ImageKit (server only)
if (typeof window === "undefined") {
  import("@/lib/cleanup-scheduler");
}

const midtransClientKey = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || "";
const explicitMidtransProdRaw =
  process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION ?? process.env.MIDTRANS_IS_PRODUCTION;
const explicitMidtransProd =
  explicitMidtransProdRaw === "true"
    ? true
    : explicitMidtransProdRaw === "false"
      ? false
      : undefined;
const midtransIsProduction = explicitMidtransProd ?? false;
const midtransSnapScriptSrc = midtransIsProduction
  ? "https://app.midtrans.com/snap/snap.js"
  : "https://app.sandbox.midtrans.com/snap/snap.js";

export const viewport: Viewport = {
  themeColor: "#4f46e5",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "Cuanify — Bikin Bisnis Makin Cuan",
  description:
    "Platform cerdas untuk UMKM Indonesia — POS kasir, inventori FIFO, kasbon, AI assistant, dan analytics real-time. Gratis selamanya.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Cuanify",
  },
  icons: {
    icon: "/cuanify-icon.svg",
    apple: "/cuanify-icon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head />
      <body className="antialiased">
        <AppProviders>{children}</AppProviders>

        {/* PWA: Service Worker + Offline Detection + Install Prompt */}
        <PWAProvider />

        {/* 🔥 Toast System */}
        <Toaster richColors position="top-right" />

        {/* Midtrans Script */}
        <Script
          src={midtransSnapScriptSrc}
          data-client-key={midtransClientKey}
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
