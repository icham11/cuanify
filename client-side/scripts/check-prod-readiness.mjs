#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const cwd = process.cwd();
const envPath = path.join(cwd, ".env");

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath, override: false });
}

const args = process.argv.slice(2);
const targetArg = args.find((arg) => arg.startsWith("--target="));
const strict = args.includes("--strict");
const target = (targetArg?.split("=")[1] || "sandbox").toLowerCase();

if (!["sandbox", "production"].includes(target)) {
  console.error('Invalid --target value. Use "sandbox" or "production".');
  process.exit(1);
}

const requiredByTarget = {
  sandbox: [
    "NEXTAUTH_URL",
    "NEXTAUTH_SECRET",
    "JWT_SECRET",
    "DATABASE_URL",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_CALENDAR_OAUTH_REDIRECT_URI",
    "GOOGLE_CALENDAR_ID",
    "FONNTE_TOKEN",
    "CRON_SECRET",
  ],
  production: [
    "NODE_ENV",
    "NEXTAUTH_URL",
    "NEXTAUTH_SECRET",
    "JWT_SECRET",
    "DATABASE_URL",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_CALENDAR_OAUTH_REDIRECT_URI",
    "GOOGLE_CALENDAR_ID",
    "FONNTE_TOKEN",
    "FONNTE_PRODUCTION_TARGET",
    "CRON_SECRET",
    "MIDTRANS_IS_PRODUCTION",
    "NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION",
    "BITESHIP_API_KEY",
  ],
};

function getEnv(name) {
  return (process.env[name] || "").trim();
}

const errors = [];
const warnings = [];

function hasProductionTemplateDirectory() {
  const envTemplateDir = getEnv("PRODUCTION_TEMPLATE_DIR");
  const candidates = [
    envTemplateDir ? path.resolve(cwd, envTemplateDir) : "",
    path.resolve(cwd, "public", "production-templates"),
    path.resolve(cwd, "Template for Production Team"),
    path.resolve(cwd, "..", "Template for Production Team"),
  ].filter(Boolean);

  return candidates.some((candidate) => {
    try {
      return fs.existsSync(candidate) && fs.statSync(candidate).isDirectory();
    } catch {
      return false;
    }
  });
}

for (const key of requiredByTarget[target]) {
  if (!getEnv(key)) {
    errors.push(`Missing required env: ${key}`);
  }
}

if (
  target === "production" &&
  getEnv("NODE_ENV") &&
  getEnv("NODE_ENV") !== "production"
) {
  errors.push('NODE_ENV must be "production" for production target.');
}

const mtServer = getEnv("MIDTRANS_SERVER_KEY");
const mtClient =
  getEnv("NEXT_PUBLIC_MIDTRANS_CLIENT_KEY") || getEnv("MIDTRANS_CLIENT_KEY");
const mtIsProd = getEnv("MIDTRANS_IS_PRODUCTION");
const mtPublicIsProd = getEnv("NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION");
const biteshipApiKey = getEnv("BITESHIP_API_KEY");

if (target === "production") {
  if (!mtServer) errors.push("Missing required env: MIDTRANS_SERVER_KEY");
  if (!mtClient)
    errors.push(
      "Missing required env: NEXT_PUBLIC_MIDTRANS_CLIENT_KEY (or MIDTRANS_CLIENT_KEY)",
    );

  if (mtIsProd && mtIsProd !== "true") {
    errors.push('MIDTRANS_IS_PRODUCTION must be "true" for production target.');
  }
  if (mtPublicIsProd && mtPublicIsProd !== "true") {
    errors.push(
      'NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION must be "true" for production target.',
    );
  }

  if (mtServer && mtServer.startsWith("SB-Mid-")) {
    warnings.push(
      "MIDTRANS_SERVER_KEY looks like sandbox key (SB-Mid-...) while target=production.",
    );
  }
  if (mtClient && mtClient.startsWith("SB-Mid-")) {
    warnings.push(
      "Midtrans client key looks like sandbox key (SB-Mid-...) while target=production.",
    );
  }

  if (biteshipApiKey && biteshipApiKey.startsWith("biteship_test.")) {
    warnings.push(
      "BITESHIP_API_KEY looks like test key (biteship_test.*) while target=production.",
    );
  }

  const shippingOriginKeys = [
    "SHIPPING_ORIGIN_ADDRESS",
    "SHIPPING_ORIGIN_POSTAL_CODE",
    "SHIPPING_ORIGIN_CONTACT_NAME",
    "SHIPPING_ORIGIN_CONTACT_PHONE",
    "SHIPPING_ORIGIN_CONTACT_EMAIL",
    "SHIPPING_ORIGIN_LATITUDE",
    "SHIPPING_ORIGIN_LONGITUDE",
  ];
  const missingShippingOrigin = shippingOriginKeys.filter(
    (key) => !getEnv(key),
  );

  if (missingShippingOrigin.length > 0) {
    warnings.push(
      `Shipping origin env incomplete: ${missingShippingOrigin.join(", ")}. Fallback default origin may cause incorrect quote/resi in production.`,
    );
  }

  if (!hasProductionTemplateDirectory()) {
    warnings.push(
      "Production template directory not found. WhatsApp production image may fall back to the long text-layout image instead of the intended template.",
    );
  }

  const originPostalCode = getEnv("SHIPPING_ORIGIN_POSTAL_CODE");
  if (originPostalCode && !/^\d{5}$/.test(originPostalCode)) {
    warnings.push(
      "SHIPPING_ORIGIN_POSTAL_CODE should be a 5-digit code for accurate shipping mapping.",
    );
  }

  const originLatitude = Number(getEnv("SHIPPING_ORIGIN_LATITUDE"));
  const originLongitude = Number(getEnv("SHIPPING_ORIGIN_LONGITUDE"));
  if (getEnv("SHIPPING_ORIGIN_LATITUDE") && !Number.isFinite(originLatitude)) {
    warnings.push("SHIPPING_ORIGIN_LATITUDE is not a valid number.");
  }
  if (
    getEnv("SHIPPING_ORIGIN_LONGITUDE") &&
    !Number.isFinite(originLongitude)
  ) {
    warnings.push("SHIPPING_ORIGIN_LONGITUDE is not a valid number.");
  }
}

if (target === "sandbox") {
  if (mtIsProd === "true" || mtPublicIsProd === "true") {
    warnings.push("Midtrans production flags are true while target=sandbox.");
  }
}

const blockedDates = getEnv("NEXT_PUBLIC_BAKERY_BLOCKED_DATES");
if (!blockedDates) {
  warnings.push(
    "NEXT_PUBLIC_BAKERY_BLOCKED_DATES is empty. Set holiday closures before client UAT.",
  );
}

const sheetsId = getEnv("GOOGLE_SHEETS_ID");
if (!sheetsId) {
  warnings.push(
    "GOOGLE_SHEETS_ID is empty. Finance sync/export will be partially unavailable.",
  );
}

console.log(`\nReadiness target: ${target}`);
console.log(`Strict mode: ${strict ? "on" : "off"}`);

if (errors.length > 0) {
  console.log("\nBlocking issues:");
  for (const issue of errors) console.log(`- ${issue}`);
}

if (warnings.length > 0) {
  console.log("\nWarnings:");
  for (const issue of warnings) console.log(`- ${issue}`);
}

if (errors.length === 0 && (!strict || warnings.length === 0)) {
  console.log("\nReadiness check passed.");
  process.exit(0);
}

console.log("\nReadiness check failed.");
process.exit(1);
