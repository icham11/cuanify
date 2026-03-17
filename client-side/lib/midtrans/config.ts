import midtransClient from "midtrans-client";

type MidtransMode = "sandbox" | "production";

function parseBooleanEnv(raw: string | undefined): boolean | undefined {
  if (!raw) return undefined;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return undefined;
}

function inferModeFromKey(key: string): MidtransMode | undefined {
  if (!key) return undefined;
  if (key.startsWith("SB-Mid-")) return "sandbox";
  if (key.startsWith("Mid-")) return "production";
  return undefined;
}

const serverKey = process.env.MIDTRANS_SERVER_KEY?.trim() || "";
const clientKey =
  process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY?.trim() ||
  process.env.MIDTRANS_CLIENT_KEY?.trim() ||
  "";
const rawIsProductionEnv = process.env.MIDTRANS_IS_PRODUCTION;

const explicitIsProd = parseBooleanEnv(rawIsProductionEnv);
const inferredMode = inferModeFromKey(serverKey) || inferModeFromKey(clientKey);
const inferredIsProd = inferredMode ? inferredMode === "production" : undefined;

const warnings: string[] = [];

if (
  rawIsProductionEnv &&
  explicitIsProd === undefined
) {
  warnings.push(
    `Invalid MIDTRANS_IS_PRODUCTION value "${rawIsProductionEnv}". Use "true" or "false".`,
  );
}

if (explicitIsProd !== undefined && inferredIsProd !== undefined && explicitIsProd !== inferredIsProd) {
  const explicitLabel = explicitIsProd ? "production" : "sandbox";
  const inferredLabel = inferredIsProd ? "production" : "sandbox";
  warnings.push(
    `MIDTRANS_IS_PRODUCTION=${explicitLabel} does not match key prefix (${inferredLabel}); using MIDTRANS_IS_PRODUCTION as source of truth.`,
  );
}

// Source of truth: MIDTRANS_IS_PRODUCTION (if provided).
// Key prefix is treated only as advisory warning.
const isProduction = explicitIsProd ?? inferredIsProd ?? false;
const environment: MidtransMode = isProduction ? "production" : "sandbox";

// Initialize Snap API client for Midtrans
export const snap = new midtransClient.Snap({
  isProduction,
  serverKey,
  clientKey,
});

export const coreApi = new midtransClient.CoreApi({
  isProduction,
  serverKey,
  clientKey,
});

export const MIDTRANS_CONFIG = {
  isProduction,
  environment,
  serverKey,
  clientKey,
  warnings,
};

export function assertMidtransConfig(): void {
  const errors: string[] = [];
  if (!serverKey) {
    errors.push("Missing MIDTRANS_SERVER_KEY environment variable.");
  }
  if (!clientKey) {
    errors.push(
      "Missing NEXT_PUBLIC_MIDTRANS_CLIENT_KEY (or MIDTRANS_CLIENT_KEY) environment variable.",
    );
  }
  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }
}
