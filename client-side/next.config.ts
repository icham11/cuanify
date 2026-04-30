import type { NextConfig } from "next";

const publicBuildVersion =
  process.env.NEXT_PUBLIC_BUILD_VERSION ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.VERCEL_GIT_COMMIT_REF ||
  "local";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },

  env: {
    NEXT_PUBLIC_BUILD_VERSION: publicBuildVersion,
  },

  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],

  // Allow Google profile images + ImageKit
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "ik.imagekit.io" },
    ],
  },

  // PWA: Set Cache-Control for the service worker so browsers always check for updates
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },

  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
