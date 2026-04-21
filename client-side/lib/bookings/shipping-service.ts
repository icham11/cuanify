import type {
  ShippingDistanceSource,
  ShippingProvider,
  ShippingQuote,
  ShippingQuoteRequest,
  ShippingQuoteResponse,
  ShippingResiRequest,
  ShippingResiResponse,
  ShippingShipment,
} from "@/lib/bookings/shipping-types";

interface GeoPoint {
  latitude: number;
  longitude: number;
}

interface OriginConfig extends GeoPoint {
  address: string;
  postalCode: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
}

interface BiteshipRateLike {
  courier_name?: string;
  courier_code?: string;
  courier_service_name?: string;
  courier_service_code?: string;
  company?: string;
  type?: string;
  description?: string;
  price?: number;
  final_price?: number;
  amount?: number;
  duration?: string | number;
  shipment_duration_range?: string;
  shipment_duration_unit?: string;
  estimation?: string;
}

interface BiteshipAreaLike {
  id?: string;
  name?: string;
  latitude?: number | string;
  longitude?: number | string;
  lat?: number | string;
  lng?: number | string;
  coordinate?: {
    latitude?: number | string;
    longitude?: number | string;
    lat?: number | string;
    lng?: number | string;
  };
}

interface AreaHints {
  postalCode?: string;
  point?: GeoPoint;
}

type RateDestination =
  | {
      mode: "coordinate";
      latitude: number;
      longitude: number;
    }
  | {
      mode: "postal";
      postalCode: string;
    };

interface DestinationResolution {
  point: GeoPoint | null;
  postalCode?: string;
  distanceSource?: ShippingDistanceSource;
  warning?: string;
}

interface NormalizedAddressByAI {
  normalizedAddress: string;
  areaHint?: string;
  postalCode?: string;
  confidence: number;
}

interface TimedCacheEntry<T> {
  expiresAt: number;
  value: T;
}

const BITESHIP_BASE_URL = "https://api.biteship.com/v1";
const EXTERNAL_REQUEST_TIMEOUT_MS = parseNumber(
  process.env.SHIPPING_EXTERNAL_TIMEOUT_MS,
  10000,
);
const EXTERNAL_REQUEST_RETRY_COUNT = Math.max(
  0,
  Math.floor(parseNumber(process.env.SHIPPING_EXTERNAL_RETRY_COUNT, 1)),
);
const EXTERNAL_RETRY_BASE_DELAY_MS = Math.max(
  100,
  Math.floor(
    parseNumber(process.env.SHIPPING_EXTERNAL_RETRY_BASE_DELAY_MS, 300),
  ),
);
const DEFAULT_ORIGIN: OriginConfig = {
  address: "Jakarta Selatan",
  postalCode: "12190",
  latitude: -6.261493,
  longitude: 106.8106,
  contactName: "Crumbella Admin",
  contactPhone: "628111111111",
  contactEmail: "admin@crumbella.local",
};

const AI_GEO_FALLBACK_ENABLED =
  process.env.SHIPPING_AI_ADDRESS_FALLBACK !== "false";
const JABODETABEK_BOUNDS = {
  minLatitude: -6.95,
  maxLatitude: -5.85,
  minLongitude: 106.35,
  maxLongitude: 107.35,
};
const JABODETABEK_KEYWORDS = [
  "jakarta",
  "jaksel",
  "jakbar",
  "jakut",
  "jakpus",
  "jaktim",
  "bekasi",
  "depok",
  "bogor",
  "tangerang",
  "bsd",
  "bintaro",
  "ciputat",
  "serpong",
  "karawaci",
  "cibubur",
];
const aiAddressFallbackCache = new Map<string, NormalizedAddressByAI | null>();
const destinationResolutionCache = new Map<
  string,
  TimedCacheEntry<DestinationResolution>
>();
const DESTINATION_RESOLUTION_CACHE_TTL_MS = Math.max(
  1000,
  Math.floor(
    parseNumber(process.env.SHIPPING_DESTINATION_CACHE_TTL_MS, 5 * 60 * 1000),
  ),
);
const FALLBACK_CAR_BASE_FEE = 18000;
const FALLBACK_CAR_PER_KM_FEE = 3500;
const FALLBACK_CAR_MIN_FEE = 25000;
const FALLBACK_CAR_MAX_FEE = 95000;

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readTimedCache<T>(
  cache: Map<string, TimedCacheEntry<T>>,
  key: string,
): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function writeTimedCache<T>(
  cache: Map<string, TimedCacheEntry<T>>,
  key: string,
  value: T,
  ttlMs: number,
) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

function getOriginConfig(): OriginConfig {
  return {
    address: process.env.SHIPPING_ORIGIN_ADDRESS || DEFAULT_ORIGIN.address,
    postalCode:
      process.env.SHIPPING_ORIGIN_POSTAL_CODE || DEFAULT_ORIGIN.postalCode,
    latitude: parseNumber(
      process.env.SHIPPING_ORIGIN_LATITUDE,
      DEFAULT_ORIGIN.latitude,
    ),
    longitude: parseNumber(
      process.env.SHIPPING_ORIGIN_LONGITUDE,
      DEFAULT_ORIGIN.longitude,
    ),
    contactName:
      process.env.SHIPPING_ORIGIN_CONTACT_NAME || DEFAULT_ORIGIN.contactName,
    contactPhone:
      process.env.SHIPPING_ORIGIN_CONTACT_PHONE || DEFAULT_ORIGIN.contactPhone,
    contactEmail:
      process.env.SHIPPING_ORIGIN_CONTACT_EMAIL || DEFAULT_ORIGIN.contactEmail,
  };
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchExternalWithRetry(
  input: string,
  init: RequestInit,
  options?: {
    retryCount?: number;
    timeoutMs?: number;
  },
): Promise<Response> {
  const retryCount = Math.max(
    0,
    options?.retryCount ?? EXTERNAL_REQUEST_RETRY_COUNT,
  );
  const timeoutMs = Math.max(
    1000,
    options?.timeoutMs ?? EXTERNAL_REQUEST_TIMEOUT_MS,
  );

  let lastError: unknown;

  const shouldRetryResponse = (status: number): boolean =>
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504;

  const sleep = async (ms: number) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      const response = await fetchWithTimeout(input, init, timeoutMs);
      if (!shouldRetryResponse(response.status) || attempt === retryCount) {
        return response;
      }

      const delayMs = EXTERNAL_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      await sleep(delayMs);
    } catch (error) {
      lastError = error;
      if (attempt < retryCount) {
        const delayMs = EXTERNAL_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await sleep(delayMs);
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("External request failed");
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function haversineKm(origin: GeoPoint, destination: GeoPoint): number {
  const earthRadiusKm = 6371;
  const dLat = toRadians(destination.latitude - origin.latitude);
  const dLon = toRadians(destination.longitude - origin.longitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(origin.latitude)) *
      Math.cos(toRadians(destination.latitude)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function parseProviderFromCourierCode(
  rawCode: string,
): ShippingProvider | null {
  const code = rawCode.toLowerCase();
  const compactCode = code.replace(/[^a-z0-9]/g, "");
  if (
    compactCode.includes("gojek") ||
    compactCode.includes("gosend") ||
    compactCode.includes("gocar")
  ) {
    return "GOJEK";
  }
  if (compactCode.includes("grab")) return "GRAB";
  if (compactCode.includes("jne")) return "JNE";
  if (compactCode.includes("jnt") || compactCode.includes("jandt")) {
    return "JNT";
  }
  if (compactCode.includes("paxel") || compactCode.includes("pxl")) {
    return "PAXEL";
  }
  return null;
}

function parseProviderFromRate(
  entry: BiteshipRateLike,
): ShippingProvider | null {
  const candidates = [
    asString(entry.courier_code),
    asString(entry.courier_name),
    asString(entry.company),
    asString(entry.courier_service_name),
    asString(entry.type),
    asString(entry.description),
  ];

  for (const candidate of candidates) {
    const provider = parseProviderFromCourierCode(candidate);
    if (provider) return provider;
  }

  return null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeItemQuantity(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.round(parsed));
}

function normalizeTotalItemWeightGram(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 100;
  return Math.max(100, Math.round(parsed));
}

function toBiteshipUnitWeightGram(item: {
  quantity: unknown;
  weightGram: unknown;
}): number {
  const quantity = normalizeItemQuantity(item.quantity);
  const totalWeightGram = normalizeTotalItemWeightGram(item.weightGram);

  // Internal payload stores total row weight, while Biteship expects unit weight.
  return Math.max(1, Math.round(totalWeightGram / quantity));
}

function cleanSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

const GENERIC_AREA_HINTS = new Set([
  "outside area",
  "outside",
  "luar area",
  "other",
  "others",
  "optional",
  "n/a",
  "na",
  "none",
  "-",
  "central city",
  "north district",
  "south district",
  "east district",
  "west district",
]);

function normalizeAreaHint(value: string | undefined): string | undefined {
  const normalized = cleanSpaces(value || "");
  if (!normalized) return undefined;

  const lowered = normalized.toLowerCase();
  if (GENERIC_AREA_HINTS.has(lowered)) {
    return undefined;
  }

  return normalized;
}

/**
 * Memberikan label kurir yang cerdas.
 * Jika dijadwalkan untuk nanti, tambahkan awalan "Terjadwal".
 */
export function getSmartCourierLabel(args: {
  courierName: string;
  deliveryDate?: string;
  isScheduled?: boolean;
}): string {
  const { courierName, deliveryDate, isScheduled } = args;
  
  // Jika sudah ditandai terjadwal atau tanggal bukan hari ini
  const today = parseJakartaToday();
  const needsScheduledTag = isScheduled || (deliveryDate && deliveryDate > today);

  if (needsScheduledTag) {
    return `Terjadwal (${courierName})`;
  }

  return courierName;
}

function normalizeAddressForLookup(address: string): string {
  return cleanSpaces(
    address
      .replace(/\([^)]*\)/g, " ")
      .replace(/\bjl\.?\b/gi, "jalan")
      .replace(/\bkec\.?\b/gi, "kecamatan")
      .replace(/\bkel\.?\b/gi, "kelurahan")
      .replace(/\bno\.?\b/gi, "nomor")
      .replace(/\bjaksel\b/gi, "jakarta selatan")
      .replace(/\bjakbar\b/gi, "jakarta barat")
      .replace(/\bjakut\b/gi, "jakarta utara")
      .replace(/\bjakpus\b/gi, "jakarta pusat")
      .replace(/\bjaktim\b/gi, "jakarta timur")
      .replace(/\brt\s*\d+\b/gi, " ")
      .replace(/\brw\s*\d+\b/gi, " "),
  );
}

function isPointWithinJabodetabek(point: GeoPoint): boolean {
  return (
    point.latitude >= JABODETABEK_BOUNDS.minLatitude &&
    point.latitude <= JABODETABEK_BOUNDS.maxLatitude &&
    point.longitude >= JABODETABEK_BOUNDS.minLongitude &&
    point.longitude <= JABODETABEK_BOUNDS.maxLongitude
  );
}

function isLikelyJabodetabekAddress(value: string): boolean {
  const normalized = normalizeAddressForLookup(value).toLowerCase();
  if (!normalized) return false;
  return JABODETABEK_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function buildAddressFallbackCacheKey(args: {
  address: string;
  destinationArea?: string;
  destinationPostalCode?: string;
}): string {
  return normalizeAddressForLookup(
    `${args.address} | ${args.destinationArea || ""} | ${args.destinationPostalCode || ""}`,
  ).toLowerCase();
}

function buildDestinationResolutionCacheKey(
  payload: Pick<
    ShippingQuoteRequest,
    | "destinationAddress"
    | "destinationArea"
    | "destinationPostalCode"
    | "destinationLatitude"
    | "destinationLongitude"
  >,
): string {
  const latitude = Number.isFinite(payload.destinationLatitude)
    ? Number(payload.destinationLatitude).toFixed(6)
    : "";
  const longitude = Number.isFinite(payload.destinationLongitude)
    ? Number(payload.destinationLongitude).toFixed(6)
    : "";

  return [
    normalizeAddressForLookup(payload.destinationAddress).toLowerCase(),
    normalizeAreaHint(payload.destinationArea)?.toLowerCase() || "",
    sanitizePostalCode(payload.destinationPostalCode) || "",
    latitude,
    longitude,
  ].join("|");
}

function sanitizeAIAddressResult(raw: unknown): NormalizedAddressByAI | null {
  if (!raw || typeof raw !== "object") return null;

  const payload = raw as {
    normalizedAddress?: unknown;
    areaHint?: unknown;
    postalCode?: unknown;
    confidence?: unknown;
  };

  const normalizedAddress = cleanSpaces(asString(payload.normalizedAddress));
  if (normalizedAddress.length < 8) return null;

  const confidence = Number(payload.confidence);
  if (!Number.isFinite(confidence) || confidence < 0.4) return null;

  const areaHint = normalizeAreaHint(asString(payload.areaHint));
  const postalCode = sanitizePostalCode(asString(payload.postalCode));

  return {
    normalizedAddress,
    areaHint,
    postalCode,
    confidence,
  };
}

async function normalizeAddressWithAI(args: {
  address: string;
  destinationArea?: string;
  destinationPostalCode?: string;
}): Promise<NormalizedAddressByAI | null> {
  if (!AI_GEO_FALLBACK_ENABLED) return null;
  if (!process.env.GROQ_API_KEY) return null;

  const cacheKey = buildAddressFallbackCacheKey(args);
  if (aiAddressFallbackCache.has(cacheKey)) {
    return aiAddressFallbackCache.get(cacheKey) ?? null;
  }

  const prompt = [
    "Kamu membantu normalisasi alamat Indonesia untuk kebutuhan geocoding.",
    "Tugas: rapikan alamat mentah agar lebih mudah dipetakan, tanpa menebak detail yang tidak ada.",
    "Keluarkan JSON object valid dengan field:",
    "- normalizedAddress: string (wajib, alamat rapih)",
    "- areaHint: string | null (opsional, kecamatan/kota yang paling jelas)",
    "- postalCode: string | null (5 digit jika ada)",
    "- confidence: number 0..1",
    "Jika data minim, isi sesuai yang diketahui dan confidence rendah.",
    `Raw address: ${args.address}`,
    `Area hint: ${args.destinationArea || ""}`,
    `Postal code: ${args.destinationPostalCode || ""}`,
  ].join("\n");

  try {
    const { createGroqCompletion, GROQ_MODELS } = await import("@/lib/groq");

    const completion = await createGroqCompletion({
      messages: [
        {
          role: "system",
          content:
            "Kamu adalah parser alamat Indonesia. Jawab ketat dalam JSON object saja.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      model: GROQ_MODELS.text.primary,
      maxTokens: 220,
      temperature: 0.1,
      responseFormat: { type: "json_object" },
    });

    const content = asString(completion.choices?.[0]?.message?.content);
    const parsed = content ? JSON.parse(content) : null;
    const sanitized = sanitizeAIAddressResult(parsed);

    aiAddressFallbackCache.set(cacheKey, sanitized);
    return sanitized;
  } catch (error: unknown) {
    try {
      const { logAI } = await import("@/lib/logger");
      logAI.warn("AI address fallback failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    } catch {
      // Ignore logger failures in fallback flow.
    }
    aiAddressFallbackCache.set(cacheKey, null);
    return null;
  }
}

const LOCATION_TOKEN_STOP_WORDS = new Set([
  "jalan",
  "kecamatan",
  "kelurahan",
  "kabupaten",
  "provinsi",
  "nomor",
  "komplek",
  "kompleks",
  "indonesia",
  "outside",
  "area",
]);

function buildLocationTokens(value: string): string[] {
  const normalized = normalizeAddressForLookup(value).toLowerCase();
  const tokens = normalized
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length >= 4 &&
        !/^\d+$/.test(token) &&
        !LOCATION_TOKEN_STOP_WORDS.has(token),
    );

  return uniqueByKey(tokens, (token) => token);
}

function scoreAreaHintMatch(args: {
  areaName: string;
  addressTokens: string[];
  expectedPostalCode?: string;
}): number {
  const normalizedName = normalizeAddressForLookup(args.areaName).toLowerCase();
  if (!normalizedName) return 0;

  let score = 0;
  if (
    args.expectedPostalCode &&
    normalizedName.includes(args.expectedPostalCode)
  ) {
    score += 10;
  }

  for (const token of args.addressTokens) {
    if (normalizedName.includes(token)) {
      score += 2;
    }
  }

  return score;
}

function simplifyAddressForGeocoding(address: string): string {
  return cleanSpaces(
    normalizeAddressForLookup(address)
      .replace(/\b(kecamatan|kelurahan|kabupaten|provinsi|kota)\b/gi, " ")
      .replace(
        /\b(lantai|lt\.?|gedung|tower|blok|patokan|komplek|kompleks)\b.*$/gi,
        " ",
      )
      .replace(/[;|]/g, ",")
      .replace(/\s+,/g, ",")
      .replace(/,+/g, ","),
  );
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pointFromArea(area: BiteshipAreaLike): GeoPoint | null {
  const latitude =
    toFiniteNumber(area.latitude) ??
    toFiniteNumber(area.lat) ??
    toFiniteNumber(area.coordinate?.latitude) ??
    toFiniteNumber(area.coordinate?.lat);
  const longitude =
    toFiniteNumber(area.longitude) ??
    toFiniteNumber(area.lng) ??
    toFiniteNumber(area.coordinate?.longitude) ??
    toFiniteNumber(area.coordinate?.lng);

  if (latitude === null || longitude === null) return null;
  return { latitude, longitude };
}

function buildGeocodeQueries(
  address: string,
  destinationArea?: string,
): string[] {
  const normalizedAreaHint = normalizeAreaHint(destinationArea);
  const simplifiedAddress = simplifyAddressForGeocoding(address);
  const baseParts = simplifiedAddress
    .split(",")
    .map((part) => cleanSpaces(part))
    .filter(Boolean);

  const rollingQueries: string[] = [];
  for (let index = 0; index < baseParts.length; index += 1) {
    const sliced = baseParts.slice(index).join(", ");
    if (sliced) rollingQueries.push(sliced);
  }

  const candidates = [
    simplifiedAddress,
    normalizedAreaHint
      ? `${simplifiedAddress} ${normalizedAreaHint}`.trim()
      : "",
    normalizedAreaHint || "",
    ...rollingQueries,
  ]
    .map((entry) => cleanSpaces(entry))
    .filter(Boolean);

  return uniqueByKey(candidates, (entry) => entry.toLowerCase());
}

function extractPostalCode(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const matched = text.match(/\b\d{5}\b/);
  return matched?.[0];
}

function sanitizePostalCode(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, "");
  return digits.length === 5 ? digits : undefined;
}

function buildAreaLookupQueries(
  address: string,
  destinationArea?: string,
  destinationPostalCode?: string,
): string[] {
  const normalizedAreaHint = normalizeAreaHint(destinationArea);
  const normalizedAddress = normalizeAddressForLookup(address);
  const sanitizedPostalCode = sanitizePostalCode(destinationPostalCode);
  const queries = [
    sanitizedPostalCode || "",
    address,
    normalizedAddress,
    normalizedAreaHint || "",
    `${normalizedAddress} ${normalizedAreaHint || ""}`.trim(),
  ].map(cleanSpaces);

  const uniqueQueries = uniqueByKey(queries.filter(Boolean), (entry) =>
    entry.toLowerCase(),
  );
  return uniqueQueries;
}

async function resolveAreaHintsFromBiteship(
  address: string,
  destinationArea?: string,
  destinationPostalCode?: string,
): Promise<AreaHints> {
  const apiKey = process.env.BITESHIP_API_KEY || "";
  if (!apiKey) return {};

  const queries = buildAreaLookupQueries(
    address,
    destinationArea,
    destinationPostalCode,
  );
  const addressTokens = buildLocationTokens(
    `${address}, ${normalizeAreaHint(destinationArea) || ""}`,
  );
  const expectedPostalCode = sanitizePostalCode(destinationPostalCode);
  const confidenceThreshold = expectedPostalCode ? 4 : 2;
  let bestScore = 0;
  let bestPostalCode: string | undefined;
  let bestPoint: GeoPoint | undefined;

  for (const queryText of queries) {
    const query = new URLSearchParams({
      countries: "ID",
      input: queryText,
    });

    let response: Response;
    try {
      response = await fetchExternalWithRetry(
        `${BITESHIP_BASE_URL}/maps/areas?${query.toString()}`,
        {
          headers: {
            Authorization: apiKey,
          },
          cache: "no-store",
        },
      );
    } catch {
      continue;
    }

    if (!response.ok) {
      continue;
    }

    const data = (await response.json().catch(() => ({}))) as {
      areas?: BiteshipAreaLike[];
    };

    const areas = Array.isArray(data.areas) ? data.areas : [];
    for (const area of areas) {
      const areaName = asString(area.name);
      const code = extractPostalCode(areaName);
      const point = pointFromArea(area) || undefined;
      const score = scoreAreaHintMatch({
        areaName,
        addressTokens,
        expectedPostalCode,
      });

      if (score > bestScore) {
        bestScore = score;
        bestPostalCode = code;
        bestPoint = point;
      }
    }

    if (bestScore >= confidenceThreshold) {
      return {
        postalCode: bestPostalCode,
        point: bestPoint,
      };
    }
  }

  if (bestScore > 0) {
    return {
      postalCode: bestPostalCode,
      point: bestPoint,
    };
  }

  return {};
}

async function geocodeAddress(
  address: string,
  destinationArea?: string,
): Promise<GeoPoint | null> {
  const queries = buildGeocodeQueries(address, destinationArea);
  if (!queries.length) return null;

  for (const queryText of queries) {
    const query = new URLSearchParams({
      format: "json",
      limit: "5",
      countrycodes: "id",
      q: `${queryText}, Indonesia`,
    });

    let response: Response;
    try {
      response = await fetchExternalWithRetry(
        `https://nominatim.openstreetmap.org/search?${query.toString()}`,
        {
          headers: {
            "User-Agent": "crumbella-bakery-oms/1.0",
          },
          cache: "no-store",
        },
      );
    } catch {
      continue;
    }

    if (!response.ok) continue;

    const payload = (await response.json().catch(() => [])) as Array<{
      lat?: string;
      lon?: string;
    }>;
    const candidates = payload
      .map((entry) => {
        const latitude = Number(entry.lat);
        const longitude = Number(entry.lon);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          return null;
        }
        return { latitude, longitude };
      })
      .filter((entry): entry is GeoPoint => Boolean(entry));

    if (!candidates.length) continue;

    if (isLikelyJabodetabekAddress(queryText)) {
      const candidateInMetro = candidates.find((entry) =>
        isPointWithinJabodetabek(entry),
      );
      if (candidateInMetro) {
        return candidateInMetro;
      }
    }

    return candidates[0];
  }

  return null;
}

async function geocodeAddressWithArea(
  address: string,
  destinationArea?: string,
): Promise<GeoPoint | null> {
  const normalizedAreaHint = normalizeAreaHint(destinationArea);
  const merged = cleanSpaces(`${address}, ${normalizedAreaHint || ""}`);
  return geocodeAddress(merged || address, normalizedAreaHint);
}

async function resolveDestination(
  payload: Pick<
    ShippingQuoteRequest,
    | "destinationAddress"
    | "destinationArea"
    | "destinationPostalCode"
    | "destinationLatitude"
    | "destinationLongitude"
  >,
): Promise<DestinationResolution> {
  if (
    Number.isFinite(payload.destinationLatitude) &&
    Number.isFinite(payload.destinationLongitude)
  ) {
    return {
      point: {
        latitude: Number(payload.destinationLatitude),
        longitude: Number(payload.destinationLongitude),
      },
      postalCode:
        sanitizePostalCode(payload.destinationPostalCode) ||
        extractPostalCode(payload.destinationAddress),
      distanceSource: "input_coordinate",
    };
  }

  const cacheKey = buildDestinationResolutionCacheKey(payload);
  const cached = readTimedCache(destinationResolutionCache, cacheKey);
  if (cached) {
    return cached;
  }

  const normalizedAreaHint = normalizeAreaHint(payload.destinationArea);

  const postalCodeFromPayload = sanitizePostalCode(
    payload.destinationPostalCode,
  );
  const postalCodeFromAddress = extractPostalCode(payload.destinationAddress);
  const areaHintsPromise = resolveAreaHintsFromBiteship(
    payload.destinationAddress,
    normalizedAreaHint,
    payload.destinationPostalCode,
  );
  const [directPoint, areaPoint] = await Promise.all([
    geocodeAddress(payload.destinationAddress, normalizedAreaHint),
    geocodeAddressWithArea(payload.destinationAddress, normalizedAreaHint),
  ]);

  let areaHints: AreaHints = {};
  let areaHintsLoaded = false;
  const loadAreaHints = async (): Promise<AreaHints> => {
    if (!areaHintsLoaded) {
      areaHints = await areaHintsPromise;
      areaHintsLoaded = true;
    }
    return areaHints;
  };

  let resolvedPostalCode = postalCodeFromPayload || postalCodeFromAddress;

  let resolvedPoint: GeoPoint | null = null;
  let distanceSource: ShippingDistanceSource | undefined;

  if (directPoint) {
    resolvedPoint = directPoint;
    distanceSource = "nominatim";
  } else if (areaPoint) {
    resolvedPoint = areaPoint;
    distanceSource = "nominatim_with_area";
  }

  if (!resolvedPostalCode || !resolvedPoint) {
    const hints = await loadAreaHints();
    resolvedPostalCode = resolvedPostalCode || hints.postalCode;

    if (!resolvedPoint && hints.point) {
      resolvedPoint = hints.point;
      distanceSource = "biteship_area";
    }
  }

  const fullAddressHint = `${payload.destinationAddress} ${normalizedAreaHint || ""}`;
  const likelyJabodetabek = isLikelyJabodetabekAddress(fullAddressHint);
  const hasSuspiciousPoint =
    Boolean(resolvedPoint) &&
    likelyJabodetabek &&
    !isPointWithinJabodetabek(resolvedPoint as GeoPoint);

  let warning: string | undefined;

  if (hasSuspiciousPoint) {
    resolvedPoint = null;
    distanceSource = undefined;
    warning =
      "Koordinat awal terdeteksi di luar Jabodetabek. Sistem mencoba pemetaan ulang alamat agar jarak lebih akurat.";
  }

  if (!resolvedPoint || hasSuspiciousPoint) {
    const postalCodeForAi =
      resolvedPostalCode ||
      (await loadAreaHints()).postalCode ||
      postalCodeFromPayload ||
      postalCodeFromAddress;
    const aiAddress = await normalizeAddressWithAI({
      address: payload.destinationAddress,
      destinationArea: normalizedAreaHint,
      destinationPostalCode: postalCodeForAi,
    });

    if (aiAddress) {
      const aiAreaHintsPromise = resolveAreaHintsFromBiteship(
        aiAddress.normalizedAddress,
        aiAddress.areaHint,
        aiAddress.postalCode || postalCodeForAi,
      );
      const [aiDirectPoint, aiAreaPoint] = await Promise.all([
        geocodeAddress(aiAddress.normalizedAddress, aiAddress.areaHint),
        geocodeAddressWithArea(aiAddress.normalizedAddress, aiAddress.areaHint),
      ]);

      let aiAreaHints: AreaHints = {};
      let aiAreaHintsLoaded = false;
      const loadAiAreaHints = async (): Promise<AreaHints> => {
        if (!aiAreaHintsLoaded) {
          aiAreaHints = await aiAreaHintsPromise;
          aiAreaHintsLoaded = true;
        }
        return aiAreaHints;
      };

      let aiResolvedPostalCode = aiAddress.postalCode || resolvedPostalCode;
      let aiResolvedPoint: GeoPoint | null = aiDirectPoint || aiAreaPoint;

      if (!aiResolvedPostalCode || !aiResolvedPoint) {
        const hints = await loadAiAreaHints();
        aiResolvedPostalCode = aiResolvedPostalCode || hints.postalCode;
        aiResolvedPoint = aiResolvedPoint || hints.point || null;
      }

      resolvedPostalCode = aiResolvedPostalCode || resolvedPostalCode;

      if (aiResolvedPoint) {
        if (!likelyJabodetabek || isPointWithinJabodetabek(aiResolvedPoint)) {
          resolvedPoint = aiResolvedPoint;
          distanceSource = "ai_fallback";
          warning =
            "Alamat dipetakan ulang dengan AI fallback untuk meningkatkan akurasi estimasi jarak.";
        }
      }
    }
  }

  const result = {
    point: resolvedPoint,
    postalCode: resolvedPostalCode,
    distanceSource,
    warning,
  };

  writeTimedCache(
    destinationResolutionCache,
    cacheKey,
    result,
    DESTINATION_RESOLUTION_CACHE_TTL_MS,
  );

  return result;
}

function uniqueByKey<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = getKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

async function getBiteshipRates(args: {
  destination: RateDestination;
  items: ShippingQuoteRequest["items"];
}): Promise<ShippingQuote[]> {
  const apiKey = process.env.BITESHIP_API_KEY || "";
  if (!apiKey) return [];

  const origin = getOriginConfig();
  const basePayload = {
    ...(args.destination.mode === "coordinate"
      ? {
          origin_latitude: origin.latitude,
          origin_longitude: origin.longitude,
          destination_latitude: args.destination.latitude,
          destination_longitude: args.destination.longitude,
        }
      : {
          origin_postal_code:
            sanitizePostalCode(origin.postalCode) || undefined,
          destination_postal_code: args.destination.postalCode,
        }),
    items: args.items.map((item) => {
      const quantity = normalizeItemQuantity(item.quantity);
      return {
        name: item.name || "Order Item",
        description: "Bakery item",
        value: Math.max(1000, Number(item.value) || 1000),
        quantity,
        weight: toBiteshipUnitWeightGram(item),
        length: 20,
        width: 20,
        height: 10,
      };
    }),
  };

  const courierAttempts = [
    "jne,jnt,paxel,gojek,grab",
    "jne,jnt,paxel,gosend,grab",
    "jne,jnt,paxel",
    "",
  ];

  const attemptErrors: string[] = [];

  for (const couriers of courierAttempts) {
    const payload = couriers
      ? { ...basePayload, couriers }
      : { ...basePayload };

    const response = await fetchExternalWithRetry(
      `${BITESHIP_BASE_URL}/rates/couriers`,
      {
        method: "POST",
        headers: {
          Authorization: apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        cache: "no-store",
      },
    );

    const data = (await response.json().catch(() => ({}))) as {
      pricing?: BiteshipRateLike[];
      rates?: BiteshipRateLike[];
      couriers?: BiteshipRateLike[];
      error?: string;
      message?: string;
    };

    if (!response.ok) {
      attemptErrors.push(
        `${couriers || "all"}: ${data.error || data.message || `status ${response.status}`}`,
      );
      continue;
    }

    const rawRates = [
      ...(Array.isArray(data.pricing) ? data.pricing : []),
      ...(Array.isArray(data.rates) ? data.rates : []),
      ...(Array.isArray(data.couriers) ? data.couriers : []),
    ];

    const mapped = rawRates
      .map((entry) => {
        const courierCode = asString(
          entry.courier_code || entry.company,
        ).toLowerCase();
        const provider = parseProviderFromRate(entry);
        if (!provider) return null;

        const serviceCode =
          asString(entry.courier_service_code || entry.type).toLowerCase() ||
          "regular";
        const serviceName =
          asString(entry.courier_service_name) ||
          asString(entry.description) ||
          asString(entry.type) ||
          "Regular";
        const price = Math.round(
          asNumber(entry.price) ||
            asNumber(entry.final_price) ||
            asNumber(entry.amount),
        );
        if (price <= 0) return null;

        const eta =
          asString(entry.estimation) ||
          asString(entry.duration) ||
          [
            asString(entry.shipment_duration_range),
            asString(entry.shipment_duration_unit),
          ]
            .join(" ")
            .trim() ||
          "-";

        return {
          provider,
          courierCode,
          courierServiceCode: serviceCode,
          courierServiceName: serviceName,
          price,
          eta,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    const uniqueMapped = uniqueByKey(
      mapped,
      (entry) =>
        `${entry.provider}:${entry.courierCode}:${entry.courierServiceCode}:${entry.price}`,
    );

    if (uniqueMapped.length > 0) {
      return uniqueMapped.map((entry) => ({
        id: `biteship-${entry.courierCode}-${entry.courierServiceCode}-${entry.price}`,
        provider: entry.provider,
        courierCode: entry.courierCode,
        courierServiceCode: entry.courierServiceCode,
        courierServiceName: entry.courierServiceName,
        price: entry.price,
        eta: entry.eta,
        distanceKm: 0,
        source: "biteship" as const,
      }));
    }
  }

  if (attemptErrors.length > 0) {
    throw new Error(
      `Biteship rates unavailable (${attemptErrors.slice(0, 2).join(" | ")})`,
    );
  }

  return [];
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "628111111111";
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}

function toJakartaDateOnly(input: Date): string {
  return input.toLocaleDateString("en-CA", {
    timeZone: "Asia/Jakarta",
  });
}

function parseJakartaToday(): string {
  return toJakartaDateOnly(new Date());
}

function normalizeDeliveryTime(value: string | undefined): string {
  if (!value) return "09:00";
  const matched = value.match(/^(\d{2}):(\d{2})$/);
  if (!matched) return "09:00";
  return `${matched[1]}:${matched[2]}`;
}

function estimateFallbackCarPrice(args: {
  distanceKm: number;
  items: ShippingQuoteRequest["items"];
}): number {
  const estimated =
    FALLBACK_CAR_BASE_FEE + args.distanceKm * FALLBACK_CAR_PER_KM_FEE;

  return Math.max(
    FALLBACK_CAR_MIN_FEE,
    Math.min(FALLBACK_CAR_MAX_FEE, Math.round(estimated)),
  );
}

function buildFallbackCarQuotes(args: {
  distanceKm: number;
  items: ShippingQuoteRequest["items"];
}): ShippingQuote[] {
  const price = estimateFallbackCarPrice(args);
  const baseQuote = {
    distanceKm: args.distanceKm,
    source: "fallback" as const,
    eta:
      args.distanceKm <= 8
        ? "30-45 min"
        : args.distanceKm <= 15
          ? "45-60 min"
          : "60-90 min",
  };

  return [
    {
      id: "fallback-gocar",
      provider: "GOJEK" as const,
      courierCode: "gocar",
      courierServiceCode: "car",
      courierServiceName: "GoCar (fallback)",
      price,
      ...baseQuote,
    },
    {
      id: "fallback-grab",
      provider: "GRAB" as const,
      courierCode: "grabcar",
      courierServiceCode: "car",
      courierServiceName: "GrabCar (fallback)",
      price: Math.round(price * 1.03),
      ...baseQuote,
    },
  ];
}

export async function getShippingQuote(
  payload: ShippingQuoteRequest,
): Promise<ShippingQuoteResponse> {
  const origin = getOriginConfig();
  const destination = await resolveDestination(payload);
  const destinationPoint = destination.point;
  const destinationPostalCode = destination.postalCode;

  if (!destinationPoint && !destinationPostalCode) {

    return {
      success: false,
      quotes: [],
      distanceKm: 0,
      distanceSource: destination.distanceSource,
      destinationPostalCode,
      destinationLatitude: undefined,
      destinationLongitude: undefined,
      warning: destination.warning,
      error:
        "Alamat belum bisa dipetakan. Mohon lengkapi alamat atau tambahkan kode pos 5 digit.",
    };
  }

  const distanceKm = destinationPoint
    ? Number(haversineKm(origin, destinationPoint).toFixed(2))
    : 0;
  const collectedQuotes: ShippingQuote[] = [];
  const quoteErrors: string[] = [];
  const quoteTasks: Array<Promise<void>> = [];

  if (destinationPoint) {
    quoteTasks.push(
      getBiteshipRates({
        destination: {
          mode: "coordinate",
          latitude: destinationPoint.latitude,
          longitude: destinationPoint.longitude,
        },
        items: payload.items,
      })
        .then((quotes) => {
          collectedQuotes.push(...quotes);
        })
        .catch((error: unknown) => {
          quoteErrors.push(
            error instanceof Error
              ? error.message
              : "Gagal mengambil ongkir mode koordinat.",
          );
        }),
    );
  }

  if (destinationPostalCode) {
    quoteTasks.push(
      getBiteshipRates({
        destination: {
          mode: "postal",
          postalCode: destinationPostalCode,
        },
        items: payload.items,
      })
        .then((quotes) => {
          collectedQuotes.push(...quotes);
        })
        .catch((error: unknown) => {
          quoteErrors.push(
            error instanceof Error
              ? error.message
              : "Gagal mengambil ongkir mode kode pos.",
          );
        }),
    );
  }

  await Promise.all(quoteTasks);

  const biteshipQuotes = uniqueByKey(
    collectedQuotes,
    (entry) =>
      `${entry.provider}:${entry.courierCode}:${entry.courierServiceCode}:${entry.price}`,
  );

  const fallbackQuotes =
    biteshipQuotes.length === 0
      ? buildFallbackCarQuotes({
          distanceKm,
          items: payload.items,
        })
      : [];
  const combinedQuotes = [...biteshipQuotes, ...fallbackQuotes];

  if (biteshipQuotes.length === 0 && quoteErrors.length > 0) {
    return {
      success: true,
      quotes: combinedQuotes,
      distanceKm,
      distanceSource: destination.distanceSource,
      destinationPostalCode,
      warning:
        destination.warning ||
        `Biteship tidak mengembalikan quote live (${quoteErrors[0]}). Menggunakan estimasi fallback GoCar/GrabCar.`,
      destinationLatitude: destinationPoint?.latitude,
      destinationLongitude: destinationPoint?.longitude,
    };
  }

  if (biteshipQuotes.length === 0) {
    return {
      success: true,
      quotes: combinedQuotes,
      distanceKm,
      distanceSource: destination.distanceSource,
      destinationPostalCode,
      warning:
        destination.warning ||
        "Tidak ada quote live dari Biteship. Menggunakan estimasi fallback GoCar/GrabCar.",
      destinationLatitude: destinationPoint?.latitude,
      destinationLongitude: destinationPoint?.longitude,
    };
  }

  const quotes = combinedQuotes.map((quote) => ({ ...quote, distanceKm }));

  return {
    success: true,
    quotes,
    distanceKm,
    distanceSource: destination.distanceSource,
    destinationPostalCode,
    warning: destination.warning,
    destinationLatitude: destinationPoint?.latitude,
    destinationLongitude: destinationPoint?.longitude,
  };
}

export async function createShippingResi(
  payload: ShippingResiRequest,
): Promise<ShippingResiResponse> {
  const apiKey = process.env.BITESHIP_API_KEY || "";
  const origin = getOriginConfig();

  if (!apiKey) {
    return {
      success: false,
      error: "BITESHIP_API_KEY belum di-set. Resi live tidak bisa dibuat.",
    };
  }

  const destination = await resolveDestination({
    destinationAddress: payload.destinationAddress,
    destinationArea: undefined,
    destinationPostalCode: payload.destinationPostalCode,
    destinationLatitude: payload.destinationLatitude,
    destinationLongitude: payload.destinationLongitude,
  });

  const requestedDate = payload.deliveryDate || "";
  const todayJakarta = parseJakartaToday();
  const isFutureDelivery = Boolean(
    requestedDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) &&
    requestedDate > todayJakarta,
  );

  // Biteship Parameter: scheduled_at
  // Digunakan untuk menjadwalkan pickup Instant/Same Day di masa depan.
  const deliveryTime = normalizeDeliveryTime(payload.deliveryTime);
  const scheduledAt = isFutureDelivery
    ? `${requestedDate} ${deliveryTime}:00`
    : undefined;

  const deliveryType = isFutureDelivery ? "later" : "now";
  const deliveryDate = isFutureDelivery ? requestedDate : undefined;

  const referenceId =
    payload.referenceId || payload.bookingCode || payload.orderId;

  const response = await fetchExternalWithRetry(`${BITESHIP_BASE_URL}/orders`, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      reference_id: referenceId,
      shipper_contact_name: origin.contactName,
      shipper_contact_phone: normalizePhone(origin.contactPhone),
      shipper_contact_email: origin.contactEmail,
      shipper_organization: "Crumbella",
      origin_contact_name: origin.contactName,
      origin_contact_phone: normalizePhone(origin.contactPhone),
      origin_address: origin.address,
      origin_postal_code: Number(origin.postalCode) || undefined,
      origin_coordinate: {
        latitude: origin.latitude,
        longitude: origin.longitude,
      },
      destination_contact_name: payload.customerName,
      destination_contact_phone: normalizePhone(payload.customerPhone),
      destination_contact_email: origin.contactEmail,
      destination_address: payload.destinationAddress,
      destination_postal_code:
        Number(
          destination.postalCode ||
            extractPostalCode(payload.destinationAddress),
        ) || undefined,
      destination_coordinate:
        destination.point?.latitude && destination.point?.longitude
          ? {
              latitude: destination.point.latitude,
              longitude: destination.point.longitude,
            }
          : undefined,
      delivery_type: deliveryType,
      delivery_date: deliveryDate,
      delivery_time: deliveryTime,
      scheduled_at: scheduledAt,
      order_note: `Booking ${referenceId}`,
      courier_company: payload.selectedQuote.courierCode,
      courier_type: payload.selectedQuote.courierServiceCode,
      items: payload.items.map((item) => {
        const quantity = normalizeItemQuantity(item.quantity);
        return {
          name: item.name || "Order Item",
          description: `Booking ${referenceId}`,
          category: "food_and_drink",
          value: Math.max(1000, Number(item.value) || 1000),
          quantity,
          weight: toBiteshipUnitWeightGram(item),
          length: 20,
          width: 20,
          height: 10,
        };
      }),
    }),
    cache: "no-store",
  });

  const data = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    const message =
      asString(data.error) ||
      asString(data.message) ||
      `Biteship create order error ${response.status}`;
    const normalizedMessage = message.toLowerCase();
    return {
      success: false,
      error: normalizedMessage.includes("bite points tidak cukup")
        ? "biteship_insufficient_balance"
        : normalizedMessage.includes("reference id has already been used before")
        ? `Reference ID resi bentrok. Kemungkinan booking ini sudah pernah dipakai untuk membuat order kurir sebelumnya.`
        : message,
    };
  }

  const waybill =
    asString(data.waybill_id) ||
    asString(data.waybill) ||
    asString(data.tracking_number) ||
    asString(
      (data.courier as Record<string, unknown> | undefined)?.waybill_id,
    ) ||
    asString(
      (data.courier as Record<string, unknown> | undefined)?.tracking_number,
    ) ||
    "";

  const externalOrderId =
    asString(data.id) ||
    asString(data.order_id) ||
    asString((data.order as Record<string, unknown> | undefined)?.id) ||
    "";

  const shipment: ShippingShipment = {
    provider: payload.selectedQuote.provider,
    courierCode: payload.selectedQuote.courierCode,
    courierServiceCode: payload.selectedQuote.courierServiceCode,
    courierServiceName: payload.selectedQuote.courierServiceName,
    referenceId: referenceId || undefined,
    trackingNumber: waybill || externalOrderId || "PENDING",
    status: waybill ? "created" : "pending_waybill",
    source: "biteship",
    externalOrderId: externalOrderId || undefined,
    trackingUrl: waybill
      ? `https://biteship.com/id/tracking/${encodeURIComponent(waybill)}`
      : undefined,
    scheduledAt: scheduledAt || undefined,
    createdAt: new Date().toISOString(),
  };

  return {
    success: true,
    shipment,
    warning: waybill
      ? undefined
      : "Order kurir berhasil dibuat, waybill belum tersedia (pending dari kurir).",
  };
}
