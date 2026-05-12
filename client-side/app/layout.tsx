import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";
import NumericZeroInputBehavior from "@/app/components/NumericZeroInputBehavior";
import AppProviders from "@/context/AppProviders";
import PWAProvider from "@/app/components/PWAProvider";

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

const crumbellaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-crumbella-sans",
});

const crumbellaMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-crumbella-mono",
});

export const viewport: Viewport = {
  themeColor: "#173a7a",
  width: "device-width",
  initialScale: 1,
  userScalable: true,
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
    icon: [
      {
        url: "/branding/Copy%20of%20logo%20versi%202%20transparant.png",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/branding/Copy%20of%20logo%20versi%202%20transparant.png",
        type: "image/png",
      },
    ],
    shortcut: "/favicon.ico",
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
      <body
        className={`${crumbellaSans.variable} ${crumbellaMono.variable} antialiased`}
      >
        <NumericZeroInputBehavior />
        <AppProviders>{children}</AppProviders>
        <Toaster position="top-center" richColors />
        <PWAProvider />
        <Script
          src={midtransSnapScriptSrc}
          data-client-key={midtransClientKey}
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
