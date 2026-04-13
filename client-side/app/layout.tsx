import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Toaster } from "sonner";
import "./globals.css";
import AppProviders from "@/context/AppProviders";
import PWAProvider from "@/app/components/PWAProvider";

// Initialize auto-cleanup scheduler for ImageKit (server only)
if (
  typeof window === "undefined" &&
  process.env.NODE_ENV === "production" &&
  process.env.ENABLE_AUTO_CLEANUP === "true"
) {
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
  themeColor: "#173a7a",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "Crumbella Workspace",
  description:
    "Workspace operasional internal Crumbella untuk owner, admin, staff, dan kasir.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Crumbella Workspace",
  },
  icons: {
    icon: "/icons/icon-192x192.png",
    apple: "/icons/icon-192x192.png",
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
