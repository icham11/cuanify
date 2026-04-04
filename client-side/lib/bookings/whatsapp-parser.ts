import {
  ensureCatalogSelection,
  getDefaultCatalogSelectionForCategory,
  suggestCatalogSelection,
} from "@/lib/bookings/pricelist";

export type WhatsAppOrderType =
  | "cake"
  | "cookies"
  | "cupcakes"
  | "buket"
  | "cookies_tower";

export type WhatsAppOrderTypeOrUnknown = WhatsAppOrderType | "unknown";

export type WhatsAppSourceType = "text" | "manual" | "image" | "email";

interface FieldDefinition {
  key: string;
  label: string;
  aliases: string[];
}

const MONTH_MAP: Record<string, number> = {
  jan: 1,
  januari: 1,
  feb: 2,
  februari: 2,
  mar: 3,
  maret: 3,
  apr: 4,
  april: 4,
  mei: 5,
  jun: 6,
  juni: 6,
  jul: 7,
  juli: 7,
  agu: 8,
  agustus: 8,
  agt: 8,
  sep: 9,
  september: 9,
  okt: 10,
  oktober: 10,
  nov: 11,
  november: 11,
  des: 12,
  desember: 12,
};

export const WHATSAPP_ORDER_LABELS: Record<WhatsAppOrderType, string> = {
  cake: "Data Cake",
  cookies: "Data Cookies",
  cupcakes: "Data Cupcakes",
  buket: "Data Buket",
  cookies_tower: "Data Cookies Tower",
};

const commonFieldDefinitions: FieldDefinition[] = [
  {
    key: "deliveryDate",
    label: "Tanggal Pengiriman",
    aliases: [
      "tanggal pengiriman",
      "tgl pengiriman",
      "tanggal kirim",
      "tgl kirim",
    ],
  },
  {
    key: "bookingCode",
    label: "KODE BOOKING",
    aliases: ["kode booking", "booking code", "kode"],
  },
  {
    key: "order",
    label: "Order",
    aliases: ["order", "pesanan"],
  },
  {
    key: "deliveryTime",
    label: "Jam Pengiriman",
    aliases: ["jam pengiriman", "jam kirim", "waktu pengiriman", "jam"],
  },
  {
    key: "deliveryMethod",
    label: "Metode Pengiriman",
    aliases: ["metode pengiriman", "metode kirim", "pengiriman", "metode"],
  },
  {
    key: "recipientName",
    label: "Nama penerima",
    aliases: ["nama penerima", "nama penerima", "nama customer", "penerima"],
  },
  {
    key: "recipientPhone",
    label: "No. telp penerima",
    aliases: [
      "no telp penerima",
      "no. telp penerima",
      "nomor penerima",
      "telepon penerima",
      "no hp penerima",
    ],
  },
  {
    key: "fullAddress",
    label: "Alamat lengkap",
    aliases: ["alamat lengkap", "alamat", "alamat pengiriman"],
  },
];

const detailFieldDefinitions: Record<WhatsAppOrderType, FieldDefinition[]> = {
  cake: [
    {
      key: "cakeName",
      label: "Nama di Cake",
      aliases: ["nama di cake", "nama cake"],
    },
    {
      key: "cakeAge",
      label: "Umur di cake",
      aliases: ["umur di cake", "umur cake", "usia di cake"],
    },
    {
      key: "cakeSize",
      label: "Ukuran cake",
      aliases: ["ukuran cake", "size cake", "ukuran"],
    },
    {
      key: "cakeFlavor",
      label: "Rasa cake",
      aliases: ["rasa cake", "flavor cake", "rasa"],
    },
    {
      key: "cakeDesign",
      label: "Design cake",
      aliases: ["design cake", "desain cake", "tema cake"],
    },
  ],
  cookies: [
    {
      key: "toFromNotes",
      label: "To From Notes",
      aliases: ["to from notes", "to-from-notes", "to from", "notes"],
    },
  ],
  cupcakes: [
    {
      key: "cupcakeCount",
      label: "Jumlah Cupcakes",
      aliases: [
        "jumlah cupcakes",
        "jumlah cupcake",
        "qty cupcakes",
        "qty cupcake",
      ],
    },
    {
      key: "cupcakeFlavor",
      label: "Rasa Cupcakes",
      aliases: ["rasa cupcakes", "rasa cupcake", "flavor cupcakes"],
    },
    {
      key: "cupcakeColor",
      label: "Warna Cupcakes",
      aliases: ["warna cupcakes", "warna cupcake"],
    },
    {
      key: "topperCookieCount",
      label: "Jumlah Topper Cookies",
      aliases: ["jumlah topper cookies", "topper cookies", "jumlah topper"],
    },
  ],
  buket: [
    {
      key: "bouquetDesign",
      label: "Design",
      aliases: ["design", "desain"],
    },
    {
      key: "bouquetPaperColor",
      label: "Warna kertas bouquet",
      aliases: [
        "warna kertas bouquet",
        "warna kertas bouquet",
        "warna kertas buket",
        "warna kertas",
      ],
    },
    {
      key: "flowerCount",
      label: "Jumlah Cookies",
      aliases: [
        "jumlah cookies",
        "qty cookies",
        "jumlah cookie",
        "qty cookie",
        "jumlah cookies isi bouquet",
        "jumlah cookies isi buket",
        "isi bouquet",
        "isi buket",
        "jumlah bunga",
        "qty bunga",
      ],
    },
    {
      key: "cookiePrice",
      label: "Harga Cookie / pcs",
      aliases: [
        "harga cookie",
        "harga cookies",
        "harga cookie pcs",
        "harga cookies pcs",
        "harga cookie per pcs",
        "harga cookie per pc",
        "harga cookie per piece",
        "harga per cookie",
        "cookie price",
      ],
    },
    {
      key: "flowerColor",
      label: "Warna Bunga",
      aliases: ["warna bunga"],
    },
    {
      key: "greetingCard",
      label: "Kartu ucapan",
      aliases: ["kartu ucapan", "ucapan", "isi kartu"],
    },
  ],
  cookies_tower: [
    {
      key: "designTheme",
      label: "Tema Design",
      aliases: ["tema design", "tema desain", "tema"],
    },
    {
      key: "colorTheme",
      label: "Tema Warna",
      aliases: ["tema warna", "warna tema"],
    },
    {
      key: "towerName",
      label: "Nama",
      aliases: ["nama"],
    },
    {
      key: "towerAge",
      label: "Umur",
      aliases: ["umur", "usia"],
    },
  ],
};

const optionalDetailFieldKeys: Record<WhatsAppOrderType, string[]> = {
  cake: [],
  cookies: ["toFromNotes"],
  cupcakes: [],
  buket: ["cookiePrice"],
  cookies_tower: [],
};

const allFieldDefinitions: FieldDefinition[] = [
  ...commonFieldDefinitions,
  ...Object.values(detailFieldDefinitions).flat(),
];

const requiredCommonKeys = [
  "deliveryDate",
  "order",
  "deliveryTime",
  "recipientName",
  "recipientPhone",
  "fullAddress",
] as const;

type CommonFieldKey = (typeof commonFieldDefinitions)[number]["key"];

export type ParsedCommonFields = Record<CommonFieldKey, string>;

export interface ParsedWhatsAppOrder {
  orderType: WhatsAppOrderType;
  sourceType: WhatsAppSourceType;
  rawText: string;
  imageUrl?: string;
  uploadedImageUrls?: string[];
  common: ParsedCommonFields;
  details: Record<string, string>;
  missingFields: string[];
}

export interface BookingFormAutoFill {
  customerName: string;
  phoneNumber: string;
  deliveryDate: string;
  deliverySlot: string;
  deliveryMethod:
    | "PICKUP"
    | "CUSTOMER_APP_COURIER"
    | "ASSISTED_GOSEND"
    | "ASSISTED_GRAB"
    | "ASSISTED_GOCAR"
    | "ASSISTED_PAXEL"
    | "ASSISTED_SAME_DAY"
    | "REGULAR_JNE_JNT";
  customNotes: string;
  deliveryAddresses: Array<{
    label: string;
    area: string;
    addressLine: string;
  }>;
  items: Array<{
    category: string;
    subcategory: string;
    productName: string;
    size: string;
    quantity: number;
    tokenDifficulty?: "SIMPLE" | "NORMAL" | "HARD" | "ADVANCED" | "EXPERT";
    cookiePrice?: number;
    addOns: string[];
    darkColorButtercreamColor?: string;
    notes: string;
  }>;
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeLabel(value: string): string {
  return normalizeSpaces(value.toLowerCase().replace(/[^a-z0-9\s]/g, " "));
}

function cleanupValue(value: string): string {
  const cleaned = normalizeSpaces(
    value.replace(/^[:\-=\s]+/, "").replace(/[\s]+$/, ""),
  );
  if (!cleaned || cleaned === "-" || cleaned.toLowerCase() === "n/a") {
    return "";
  }
  return cleaned;
}

function getInlineValueAfterLabel(line: string, alias: string): string {
  const withSeparator = line.match(/[:=-]\s*(.*)$/);
  if (withSeparator?.[1]) {
    return cleanupValue(withSeparator[1]);
  }

  const aliasPattern = new RegExp(`^\\s*${escapeRegExp(alias)}\\s*`, "i");
  if (aliasPattern.test(line)) {
    const remainder = line.replace(aliasPattern, "");
    return cleanupValue(remainder);
  }

  return "";
}

function looksLikeLabeledLine(value: string): boolean {
  const normalized = normalizeLabel(value);
  if (!normalized) return false;
  if (normalized.startsWith("jenis pesanan")) return true;
  if (/^[a-z0-9\s]{2,60}\s*[:=-]\s*/i.test(value.trim())) return true;

  return allFieldDefinitions.some((field) =>
    field.aliases.some((alias) => normalized.startsWith(normalizeLabel(alias))),
  );
}

function collectBlockValue(
  lines: string[],
  startIndex: number,
  firstLineValue: string,
): string {
  const parts: string[] = [];
  if (firstLineValue) {
    parts.push(firstLineValue);
  }

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    if (!line) continue;
    if (looksLikeLabeledLine(line)) break;
    parts.push(line);
  }

  return cleanupValue(parts.join(" | "));
}

function buildKeyValueLookup(lines: string[]): Map<string, string> {
  const lookup = new Map<string, string>();

  lines.forEach((line, index) => {
    const match = line.match(/^(.{2,80}?)\s*[:=-]\s*(.*)$/);
    if (!match) return;

    const rawKey = match[1] ?? "";
    const rawValue = match[2] ?? "";
    const key = normalizeLabel(rawKey);
    if (!key) return;

    const value = collectBlockValue(lines, index, cleanupValue(rawValue));

    if (!lookup.has(key) || value) {
      lookup.set(key, value);
    }
  });

  return lookup;
}

function readFieldValue(
  rawText: string,
  lines: string[],
  lookup: Map<string, string>,
  definition: FieldDefinition,
): string {
  const normalizedAliases = definition.aliases.map((alias) =>
    normalizeLabel(alias),
  );

  for (const alias of normalizedAliases) {
    const direct = lookup.get(alias);
    if (direct) return direct;
  }

  for (const [key, value] of lookup.entries()) {
    if (!value) continue;
    for (const alias of normalizedAliases) {
      if (key === alias || key.includes(alias) || alias.includes(key)) {
        return value;
      }
    }
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const normalizedLine = normalizeLabel(line);
    if (!normalizedLine) continue;

    for (
      let aliasIndex = 0;
      aliasIndex < definition.aliases.length;
      aliasIndex += 1
    ) {
      const alias = definition.aliases[aliasIndex];
      const normalizedAlias = normalizedAliases[aliasIndex];
      if (!normalizedLine.startsWith(normalizedAlias)) continue;

      const inlineValue = getInlineValueAfterLabel(line, alias);
      const blockValue = collectBlockValue(lines, lineIndex, inlineValue);
      if (blockValue) return blockValue;
    }
  }

  for (const alias of definition.aliases) {
    const aliasPattern = escapeRegExp(alias).replace(/\s+/g, "\\s+");
    const regex = new RegExp(`${aliasPattern}\\s*[:=-]?\\s*([^\\n]+)`, "i");
    const match = rawText.match(regex);
    if (match?.[1]) {
      const value = cleanupValue(match[1]);
      if (value) return value;
    }
  }

  return "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeYear(year: number): number {
  if (year >= 100) return year;
  return 2000 + year;
}

function toIsoDate(year: number, month: number, day: number): string {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return "";
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return "";
  }

  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(candidate.getTime()) ||
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return "";
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDate(value: string): string {
  const text = value.replace(/[()]/g, " ").replace(/,/g, " ").trim();
  if (!text) return "";

  const iso = text.match(/\b(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})\b/);
  if (iso) {
    return toIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const dmy = text.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/);
  if (dmy) {
    const year = normalizeYear(Number(dmy[3]));
    return toIsoDate(year, Number(dmy[2]), Number(dmy[1]));
  }

  const dayMonthWordYearWithSlash = text.match(
    /\b(\d{1,2})[\/-]([a-zA-Z]+)[\/-](\d{2,4})\b/i,
  );
  if (dayMonthWordYearWithSlash) {
    const day = Number(dayMonthWordYearWithSlash[1]);
    const month = MONTH_MAP[normalizeLabel(dayMonthWordYearWithSlash[2])];
    const year = normalizeYear(Number(dayMonthWordYearWithSlash[3]));
    if (month) {
      return toIsoDate(year, month, day);
    }
  }

  const dayMonthWordYear = text.match(
    /\b(\d{1,2})\s+([a-zA-Z]+)\s+(\d{2,4})\b/i,
  );
  if (dayMonthWordYear) {
    const day = Number(dayMonthWordYear[1]);
    const month = MONTH_MAP[normalizeLabel(dayMonthWordYear[2])];
    const year = normalizeYear(Number(dayMonthWordYear[3]));
    if (month) {
      return toIsoDate(year, month, day);
    }
  }

  const monthWordDayYear = text.match(
    /\b([a-zA-Z]+)\s+(\d{1,2})\s+(\d{2,4})\b/i,
  );
  if (monthWordDayYear) {
    const month = MONTH_MAP[normalizeLabel(monthWordDayYear[1])];
    const day = Number(monthWordDayYear[2]);
    const year = normalizeYear(Number(monthWordDayYear[3]));
    if (month) {
      return toIsoDate(year, month, day);
    }
  }

  return "";
}

function parseTime(value: string): string {
  const text = value.trim();
  if (!text) return "";

  const fullTime = text.match(/\b(\d{1,2})[.:](\d{2})\b/);
  if (fullTime) {
    const hour = Number(fullTime[1]);
    const minute = Number(fullTime[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
  }

  const hourOnly = text.match(/\b(?:jam\s*)?(\d{1,2})\b/i);
  if (hourOnly) {
    const hour = Number(hourOnly[1]);
    if (hour >= 0 && hour <= 23) {
      return `${String(hour).padStart(2, "0")}:00`;
    }
  }

  return "";
}

function parsePhone(value: string): string {
  const raw = value.trim();
  if (!raw) return "";

  const hasPlus = raw.includes("+");
  const digitsOnly = raw.replace(/\D/g, "");
  if (!digitsOnly) return "";

  return hasPlus ? `+${digitsOnly}` : digitsOnly;
}

function normalizeDeliveryMethod(value: string): string {
  const lowered = normalizeLabel(value);
  if (!lowered) return "";

  if (lowered.includes("pickup") || lowered.includes("ambil sendiri"))
    return "Pickup";
  if (lowered.includes("gosend")) return "GoSend";
  if (lowered.includes("gojek")) return "Gojek";
  if (lowered.includes("grab")) return "Grab";
  if (lowered.includes("kurir")) return "Kurir";
  if (lowered.includes("delivery") || lowered.includes("antar"))
    return "Delivery";

  return value;
}

function mapDeliveryMethodToFormValue(
  rawMethod: string,
): BookingFormAutoFill["deliveryMethod"] {
  const normalized = normalizeLabel(rawMethod);
  if (!normalized) return "REGULAR_JNE_JNT";

  if (normalized.includes("pickup") || normalized.includes("ambil sendiri")) {
    return "PICKUP";
  }

  if (normalized.includes("paxel")) {
    return "ASSISTED_PAXEL";
  }

  const isAdminAssisted =
    normalized.includes("dibantu") ||
    normalized.includes("admin") ||
    normalized.includes("assisted");

  if (normalized.includes("gocar") || normalized.includes("go car")) {
    return isAdminAssisted ? "ASSISTED_GOCAR" : "CUSTOMER_APP_COURIER";
  }

  if (normalized.includes("grab")) {
    return isAdminAssisted ? "ASSISTED_GRAB" : "CUSTOMER_APP_COURIER";
  }

  if (normalized.includes("gosend") || normalized.includes("gojek")) {
    return "ASSISTED_GOSEND";
  }

  if (
    normalized.includes("jne") ||
    normalized.includes("jnt") ||
    normalized.includes("j t")
  ) {
    return "REGULAR_JNE_JNT";
  }

  return "REGULAR_JNE_JNT";
}

function normalizeByKey(key: string, value: string): string {
  const cleaned = cleanupValue(value);
  if (!cleaned) return "";

  switch (key) {
    case "deliveryDate":
      return parseDate(cleaned) || cleaned;
    case "deliveryTime":
      return parseTime(cleaned) || cleaned;
    case "recipientPhone":
      return parsePhone(cleaned) || cleaned;
    case "deliveryMethod":
      return normalizeDeliveryMethod(cleaned);
    default:
      return cleaned;
  }
}

function parseOrderTypeToken(value: string): WhatsAppOrderTypeOrUnknown {
  const normalized = normalizeLabel(value);
  if (
    normalized === "cake" ||
    normalized === "cookies" ||
    normalized === "cupcakes" ||
    normalized === "buket"
  ) {
    return normalized as WhatsAppOrderType;
  }

  if (normalized === "cookies tower" || normalized === "cookies_tower") {
    return "cookies_tower";
  }

  return "unknown";
}

function parseOrderTypeFromText(rawText: string): WhatsAppOrderTypeOrUnknown {
  const explicit = rawText.match(
    /jenis\s+pesanan\s*[:=-]\s*(cake|cookies|cupcakes|buket|cookies_tower|cookies tower)/i,
  );
  if (explicit?.[1]) {
    return parseOrderTypeToken(explicit[1]);
  }

  const heading = rawText.match(
    /(?:^|\n)\s*(?:\[wa\s*parser\]\s*)?data\s+(cake|cookies|cupcakes|buket|cookies\s*tower)\b/i,
  );
  if (heading?.[1]) {
    return parseOrderTypeToken(heading[1]);
  }

  return "unknown";
}

function detectOrderType(
  rawText: string,
  lookup: Map<string, string>,
  preferredOrderType: WhatsAppOrderTypeOrUnknown,
): WhatsAppOrderType {
  if (preferredOrderType !== "unknown") return preferredOrderType;

  const explicitOrderType = parseOrderTypeFromText(rawText);

  const normalizedText = normalizeLabel(rawText);
  const normalizedKeys = Array.from(lookup.keys()).map((key) =>
    normalizeLabel(key),
  );

  const hasMarkerInKeys = (markers: string[]): boolean => {
    return markers.some((marker) => {
      const normalizedMarker = normalizeLabel(marker);
      return normalizedKeys.some((key) => {
        return key === normalizedMarker || key.includes(normalizedMarker);
      });
    });
  };

  const hasMarkerInText = (markers: string[]): boolean => {
    return markers.some((marker) =>
      normalizedText.includes(normalizeLabel(marker)),
    );
  };

  const hasAnyMarker = (markers: string[]): boolean => {
    return hasMarkerInKeys(markers) || hasMarkerInText(markers);
  };

  const isTowerMarker =
    hasAnyMarker(["tema design", "tema desain", "tema warna"]) ||
    normalizedText.includes("cookies tower");
  const isCupcakeMarker =
    hasAnyMarker([
      "jumlah cupcakes",
      "jumlah cupcake",
      "rasa cupcakes",
      "warna cupcakes",
      "jumlah topper cookies",
    ]) || normalizedText.includes("cupcake");
  const isCakeMarker = hasAnyMarker([
    "nama di cake",
    "umur di cake",
    "ukuran cake",
    "rasa cake",
    "design cake",
    "desain cake",
  ]);
  const isBouquetMarker =
    hasAnyMarker([
      "warna kertas bouquet",
      "warna kertas buket",
      "jumlah bunga",
      "jumlah cookies",
      "qty cookies",
      "isi bouquet",
      "isi buket",
      "warna bunga",
      "kartu ucapan",
      "harga cookie",
      "harga cookies",
      "cookie price",
      "hand bouquet",
      "standing bouquet",
    ]) ||
    normalizedText.includes("buket") ||
    normalizedText.includes("bouquet");
  const isCookiesMarker = hasAnyMarker([
    "to from notes",
    "to from",
    "data cookies",
  ]);

  let detectedFromMarkers: WhatsAppOrderType = "cake";

  if (isTowerMarker) {
    detectedFromMarkers = "cookies_tower";
  } else if (isCupcakeMarker) {
    detectedFromMarkers = "cupcakes";
  } else if (isCakeMarker) {
    detectedFromMarkers = "cake";
  } else if (isBouquetMarker) {
    detectedFromMarkers = "buket";
  } else if (isCookiesMarker) {
    detectedFromMarkers = "cookies";
  } else if (normalizedText.includes("cake")) {
    detectedFromMarkers = "cake";
  } else if (normalizedText.includes("cupcake")) {
    detectedFromMarkers = "cupcakes";
  } else if (
    normalizedText.includes("buket") ||
    normalizedText.includes("bouquet")
  ) {
    detectedFromMarkers = "buket";
  } else if (normalizedText.includes("cookies")) {
    detectedFromMarkers = "cookies";
  }

  if (explicitOrderType === "unknown") {
    return detectedFromMarkers;
  }

  const explicitHasMarker =
    (explicitOrderType === "cake" && isCakeMarker) ||
    (explicitOrderType === "cookies" && isCookiesMarker) ||
    (explicitOrderType === "cupcakes" && isCupcakeMarker) ||
    (explicitOrderType === "buket" && isBouquetMarker) ||
    (explicitOrderType === "cookies_tower" && isTowerMarker);

  if (explicitHasMarker) {
    return explicitOrderType;
  }

  return detectedFromMarkers;
}

function buildEmptyCommonFields(): ParsedCommonFields {
  return {
    deliveryDate: "",
    bookingCode: "",
    order: "",
    deliveryTime: "",
    deliveryMethod: "",
    recipientName: "",
    recipientPhone: "",
    fullAddress: "",
  };
}

type BookingAutoFillItem = BookingFormAutoFill["items"][number];

const DARK_COLOR_BUTTERCREAM_ADDON_ID = "dark-color-buttercream";
const DARK_BUTTERCREAM_COLOR_CANDIDATES: Array<{
  label: string;
  aliases: string[];
}> = [
  { label: "Black", aliases: ["black", "hitam"] },
  { label: "Red", aliases: ["red", "merah"] },
  { label: "Navy Blue", aliases: ["navy blue", "navy", "dongker"] },
  {
    label: "Forest Green",
    aliases: ["forest green", "hijau botol", "hijau tua"],
  },
  {
    label: "Electric Blue",
    aliases: ["electric blue", "biru elektrik", "biru terang"],
  },
  {
    label: "Fuschia Pink",
    aliases: ["fuschia pink", "fuchsia pink", "fuschia", "fuchsia"],
  },
];

function resolveDarkButtercreamColor(value: string): string | undefined {
  const normalized = normalizeLabel(value);
  if (!normalized) return undefined;

  for (const candidate of DARK_BUTTERCREAM_COLOR_CANDIDATES) {
    const matched = candidate.aliases.some((alias) =>
      normalized.includes(normalizeLabel(alias)),
    );
    if (matched) return candidate.label;
  }

  return undefined;
}

function detectCupcakeDarkColorButtercream(value: string): {
  addOns: string[];
  darkColorButtercreamColor?: string;
} {
  const normalized = normalizeLabel(value);
  if (!normalized) {
    return { addOns: [] };
  }

  const hasDarkMarker =
    normalized.includes("dark color") || normalized.includes("darkcolor");
  const hasButtercreamMarker =
    normalized.includes("butter cream") || normalized.includes("buttercream");
  const hasDarkColorButtercream =
    normalized.includes("dark color butter cream") ||
    normalized.includes("dark color buttercream") ||
    normalized.includes("dark butter cream") ||
    normalized.includes("dark buttercream") ||
    (hasDarkMarker && hasButtercreamMarker);

  if (!hasDarkColorButtercream) {
    return { addOns: [] };
  }

  return {
    addOns: [DARK_COLOR_BUTTERCREAM_ADDON_ID],
    darkColorButtercreamColor: resolveDarkButtercreamColor(value),
  };
}

function extractPositiveInteger(value: string): number | null {
  const match = value.match(/\d+/);
  if (!match) return null;
  const parsed = Number(match[0]);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseCurrencyAmount(value: string): number | null {
  const text = value.trim();
  if (!text) return null;

  const normalized = normalizeLabel(text);
  const shorthand = normalized.match(/(\d+(?:[.,]\d+)?)\s*k\b/i);
  if (shorthand?.[1]) {
    const parsed = Number(shorthand[1].replace(",", "."));
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.round(parsed * 1000);
    }
  }

  const digitsOnly = text.replace(/\D/g, "");
  if (!digitsOnly) return null;

  const parsed = Number(digitsOnly);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed);
}

interface CupcakeQuantityBreakdown {
  dozenCount: number;
  individualCount: number;
  fallbackQuantity: number | null;
}

function sumRegexNumberMatches(value: string, pattern: RegExp): number {
  let total = 0;
  for (const match of value.matchAll(pattern)) {
    const quantity = Number(match[1]);
    if (Number.isInteger(quantity) && quantity > 0) {
      total += quantity;
    }
  }
  return total;
}

function parseCupcakeQuantityBreakdown(
  sources: string[],
): CupcakeQuantityBreakdown {
  let dozenCount = 0;
  let individualCount = 0;
  let fallbackQuantity: number | null = null;

  for (const source of sources) {
    const text = source.trim();
    if (!text) continue;

    const dozenFromPrefix = sumRegexNumberMatches(
      text,
      /(\d{1,4})\s*(?:dozen|lusin)\b/gi,
    );
    const dozenFromSuffix = sumRegexNumberMatches(
      text,
      /(?:dozen|lusin)\s*(?::|=)?\s*(\d{1,4})\b/gi,
    );
    const parsedDozenCount = dozenFromPrefix + dozenFromSuffix;

    const individualFromPrefix = sumRegexNumberMatches(
      text,
      /(\d{1,4})\s*(?:p+\s*c+\s*s*|pcs?|pc|box)?\s*(?:indv|individu(?:al)?|individual|indivial|indvidual|invidual)\b/gi,
    );
    const individualFromSuffix = sumRegexNumberMatches(
      text,
      /(?:indv|individu(?:al)?|individual|indivial|indvidual|invidual)\s*(?:cupcake[s]?|box|pcs?|pc)?\s*[:=+\-x]?\s*(\d{1,4})\b/gi,
    );
    const parsedIndividualCount = individualFromPrefix + individualFromSuffix;

    if (dozenCount === 0 && parsedDozenCount > 0) {
      dozenCount = parsedDozenCount;
    }
    if (individualCount === 0 && parsedIndividualCount > 0) {
      individualCount = parsedIndividualCount;
    }

    if (fallbackQuantity === null) {
      fallbackQuantity =
        extractOrderQuantity(text) ?? extractPositiveInteger(text) ?? null;
    }
  }

  return {
    dozenCount,
    individualCount,
    fallbackQuantity,
  };
}

function hasCupcakeIndividualMarker(value: string): boolean {
  const normalized = normalizeLabel(value);
  if (!normalized) return false;
  return /\b(indv|individu|individual|indivial|indvidual|invidual)\b/i.test(
    normalized,
  );
}

function hasCupcakeDozenMarker(value: string): boolean {
  const normalized = normalizeLabel(value);
  if (!normalized) return false;
  return /\b(dozen|lusin|12\s*pcs?)\b/i.test(normalized);
}

function resolveCupcakeQuantityBreakdown(parsed: ParsedWhatsAppOrder): {
  dozenCount: number;
  individualCount: number;
  fallbackQuantity: number | null;
} {
  const orderText = parsed.common.order ?? "";
  const detailText = parsed.details.cupcakeCount ?? "";

  const fromOrder = parseCupcakeQuantityBreakdown([orderText]);
  const fromDetail = parseCupcakeQuantityBreakdown([detailText]);
  const merged = parseCupcakeQuantityBreakdown([detailText, orderText]);

  const orderHasIndividual = hasCupcakeIndividualMarker(orderText);
  const orderHasDozen = hasCupcakeDozenMarker(orderText);

  if (orderHasIndividual && !orderHasDozen) {
    const quantity =
      fromOrder.individualCount || fromOrder.fallbackQuantity || 0;
    return {
      dozenCount: 0,
      individualCount: quantity || fromDetail.individualCount,
      fallbackQuantity: quantity || fromDetail.fallbackQuantity,
    };
  }

  if (orderHasDozen && !orderHasIndividual) {
    const quantity = fromOrder.dozenCount || fromOrder.fallbackQuantity || 0;
    return {
      dozenCount: quantity || fromDetail.dozenCount,
      individualCount: 0,
      fallbackQuantity: quantity || fromDetail.fallbackQuantity,
    };
  }

  if (orderHasIndividual && orderHasDozen) {
    return {
      dozenCount: fromOrder.dozenCount || fromDetail.dozenCount,
      individualCount: fromOrder.individualCount || fromDetail.individualCount,
      fallbackQuantity: fromOrder.fallbackQuantity || fromDetail.fallbackQuantity,
    };
  }

  return merged;
}

function guessDeliveryArea(address: string): string {
  const normalized = normalizeLabel(address);
  if (!normalized) return "Outside Area";

  if (normalized.includes("pusat") || normalized.includes("central"))
    return "Central City";
  if (normalized.includes("utara") || normalized.includes("north"))
    return "North District";
  if (normalized.includes("selatan") || normalized.includes("south"))
    return "South District";
  if (normalized.includes("barat") || normalized.includes("west"))
    return "West District";

  return "Outside Area";
}

function getCategoryByOrderType(orderType: WhatsAppOrderType): string {
  switch (orderType) {
    case "cake":
      return "Cake";
    case "cookies":
      return "Cookies";
    case "cupcakes":
      return "Cupcakes";
    case "buket":
      return "Buket";
    case "cookies_tower":
      return "Cookies Tower";
    default:
      return "Cake";
  }
}

function chooseCatalogSelection(parsed: ParsedWhatsAppOrder): {
  category: string;
  subcategory: string;
  productName: string;
  size: string;
} {
  const category = getCategoryByOrderType(parsed.orderType);
  const fallback = getDefaultCatalogSelectionForCategory(category);
  const searchSource = [parsed.common.order, ...Object.values(parsed.details)]
    .filter(Boolean)
    .join(" ");

  const suggested = suggestCatalogSelection(category, searchSource);
  return ensureCatalogSelection({
    category: suggested.category || fallback.category,
    subcategory: suggested.subcategory || fallback.subcategory,
    productName: suggested.productName || fallback.productName,
    size: suggested.size || fallback.size,
  });
}

function chooseCatalogSelectionByText(
  category: string,
  searchSource: string,
): {
  category: string;
  subcategory: string;
  productName: string;
  size: string;
} {
  const fallback = getDefaultCatalogSelectionForCategory(category);
  const suggested = suggestCatalogSelection(category, searchSource);

  return ensureCatalogSelection({
    category: suggested.category || fallback.category,
    subcategory: suggested.subcategory || fallback.subcategory,
    productName: suggested.productName || fallback.productName,
    size: suggested.size || fallback.size,
  });
}

function extractOrderQuantity(value: string): number | null {
  const text = value.trim();
  if (!text) return null;

  const explicit = text.match(
    /(?:qty|jumlah|order|pesan|x)\s*[:=\-]?\s*(\d{1,4})\b/i,
  );
  if (explicit?.[1]) {
    const quantity = Number(explicit[1]);
    if (Number.isInteger(quantity) && quantity > 0) return quantity;
  }

  const withUnit = text.match(/\b(\d{1,4})\s*(box|pack|pcs|pc|dozen|lusin)\b/i);
  if (withUnit?.[1]) {
    const quantity = Number(withUnit[1]);
    if (Number.isInteger(quantity) && quantity > 0) return quantity;
  }

  return null;
}

function chooseQuantity(parsed: ParsedWhatsAppOrder): number {
  if (parsed.orderType === "cake" || parsed.orderType === "cookies_tower") {
    return 1;
  }

  if (parsed.orderType === "buket") {
    const bouquetCount = extractPositiveInteger(
      parsed.details.flowerCount ?? "",
    );
    if (bouquetCount) return bouquetCount;
    return extractOrderQuantity(parsed.common.order ?? "") ?? 1;
  }

  if (parsed.orderType === "cupcakes") {
    const quantityInfo = resolveCupcakeQuantityBreakdown(parsed);

    if (quantityInfo.individualCount > 0 && quantityInfo.dozenCount === 0) {
      return quantityInfo.individualCount;
    }
    if (quantityInfo.dozenCount > 0 && quantityInfo.individualCount === 0) {
      return quantityInfo.dozenCount;
    }
    if (quantityInfo.fallbackQuantity) {
      return quantityInfo.fallbackQuantity;
    }

    return 1;
  }

  return extractOrderQuantity(parsed.common.order ?? "") ?? 1;
}

function inferTokenDifficultyFromText(
  value: string,
): BookingFormAutoFill["items"][number]["tokenDifficulty"] | undefined {
  const normalized = normalizeLabel(value);
  if (!normalized) return undefined;

  if (normalized.includes("expert")) return "EXPERT";
  if (normalized.includes("advanced") || normalized.includes("mahir")) {
    return "ADVANCED";
  }
  if (
    normalized.includes("hard") ||
    normalized.includes("difficult") ||
    normalized.includes("sulit") ||
    normalized.includes("rumit") ||
    normalized.includes("susah")
  ) {
    return "HARD";
  }
  if (
    normalized.includes("normal") ||
    normalized.includes("medium") ||
    normalized.includes("sedang") ||
    normalized.includes("menengah")
  ) {
    return "NORMAL";
  }
  if (
    normalized.includes("simple") ||
    normalized.includes("easy") ||
    normalized.includes("mudah") ||
    normalized.includes("sederhana") ||
    normalized.includes("gampang")
  ) {
    return "SIMPLE";
  }

  return undefined;
}

function toPositiveQuantity(value: number | null | undefined): number {
  const parsed = Math.round(Number(value || 0));
  return parsed > 0 ? parsed : 1;
}

function extractQuantityForKeywords(
  value: string,
  keywords: string[],
): number | null {
  const text = value.trim();
  if (!text || keywords.length === 0) return null;

  const keywordPattern = keywords
    .map((keyword) => escapeRegExp(keyword).replace(/\s+/g, "\\s+"))
    .join("|");

  const before = text.match(
    new RegExp(
      `(\\d{1,4})\\s*(?:x\\s*)?(?:pcs?|pc|box|pack|dozen|lusin)?\\s*(?:${keywordPattern})\\b`,
      "i",
    ),
  );
  if (before?.[1]) {
    const parsed = Number(before[1]);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  const after = text.match(
    new RegExp(
      `(?:${keywordPattern})\\b\\s*(?:x|:|=|-)?\\s*(\\d{1,4})\\b`,
      "i",
    ),
  );
  if (after?.[1]) {
    const parsed = Number(after[1]);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function createAutoFillItemFromCategory(args: {
  category: string;
  searchSource: string;
  quantity: number;
  notes: string;
  cookiePrice?: number;
}): BookingAutoFillItem {
  const catalog = chooseCatalogSelectionByText(
    args.category,
    args.searchSource,
  );
  const inferredDifficulty = inferTokenDifficultyFromText(args.searchSource);
  const tokenDifficulty =
    catalog.category === "Cookies" || catalog.category === "Buket"
      ? (inferredDifficulty ?? "SIMPLE")
      : undefined;
  const cookiePrice =
    catalog.category === "Buket" && Number(args.cookiePrice) > 0
      ? Math.round(Number(args.cookiePrice))
      : undefined;
  const cupcakeDarkColor =
    catalog.category === "Cupcakes"
      ? detectCupcakeDarkColorButtercream(
          `${args.searchSource || ""} ${args.notes || ""}`,
        )
      : { addOns: [] as string[], darkColorButtercreamColor: undefined };

  return {
    category: catalog.category,
    subcategory: catalog.subcategory,
    productName: catalog.productName,
    size: catalog.size,
    quantity: toPositiveQuantity(args.quantity),
    tokenDifficulty,
    cookiePrice,
    addOns: cupcakeDarkColor.addOns,
    darkColorButtercreamColor: cupcakeDarkColor.darkColorButtercreamColor,
    notes: args.notes,
  };
}

function mergeAutoFillItems(
  items: BookingAutoFillItem[],
): BookingAutoFillItem[] {
  const byKey = new Map<string, BookingAutoFillItem>();

  for (const item of items) {
    const key = [item.category, item.subcategory, item.productName, item.size]
      .map((value) => value || "")
      .join("||");
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, { ...item, quantity: toPositiveQuantity(item.quantity) });
      continue;
    }

    byKey.set(key, {
      ...existing,
      quantity:
        toPositiveQuantity(existing.quantity) +
        toPositiveQuantity(item.quantity),
      addOns: Array.from(
        new Set([...(existing.addOns ?? []), ...(item.addOns ?? [])]),
      ),
      darkColorButtercreamColor:
        existing.darkColorButtercreamColor || item.darkColorButtercreamColor,
      tokenDifficulty: existing.tokenDifficulty || item.tokenDifficulty,
      cookiePrice: existing.cookiePrice ?? item.cookiePrice,
      notes: existing.notes || item.notes,
    });
  }

  return Array.from(byKey.values());
}

function buildMixedSupplementAutoFillItems(
  parsed: ParsedWhatsAppOrder,
  itemNotes: string,
): BookingAutoFillItem[] {
  const orderText = parsed.common.order || "";
  const rawText = parsed.rawText || "";

  const hasTowerMarker =
    /cookies?\s*tower|tower\s*cookies?/i.test(orderText) ||
    /\btema\s*design\b|\btema\s*desain\b|\btema\s*warna\b|\bcookies\s*tower\b/i.test(
      rawText,
    );
  const hasCakeMarker =
    /\bcake\b/i.test(orderText) ||
    /\bnama\s+di\s+cake\b|\bumur\s+di\s+cake\b|\bukuran\s+cake\b|\brasa\s+cake\b|\bdesign\s+cake\b|\bdesain\s+cake\b/i.test(
      rawText,
    );
  const hasCupcakeMarker =
    /\bcupcakes?\b/i.test(orderText) ||
    /\bjumlah\s+cupcakes?\b|\brasa\s+cupcakes?\b|\bwarna\s+cupcakes?\b|\bjumlah\s+topper\s+cookies\b|\bdata\s+cupcakes\b/i.test(
      rawText,
    );
  const hasBouquetMarker =
    /(buket|bouquet)/i.test(orderText) ||
    /\bwarna\s+kertas\s+bouquet\b|\bwarna\s+kertas\s+buket\b|\bisi\s+bouquet\b|\bisi\s+buket\b|\bwarna\s+bunga\b|\bkartu\s+ucapan\b|\bharga\s+cookie\b|\bharga\s+cookies\b|\bcookie\s+price\b|\bhand\s+bouquet\b|\bstanding\s+bouquet\b|\bdata\s+buket\b/i.test(
      rawText,
    );
  const hasCookiesMarker = /\bto\s+from\s+notes\b|\bdata\s+cookies\b/i.test(
    rawText,
  );

  if (!orderText.trim() && !rawText.trim()) return [];

  const primaryCategory = getCategoryByOrderType(parsed.orderType);
  const supplements: BookingAutoFillItem[] = [];

  const pushItem = (
    category: string,
    quantity: number,
    searchSource: string,
    cookiePrice?: number,
  ) => {
    supplements.push(
      createAutoFillItemFromCategory({
        category,
        quantity,
        searchSource,
        notes: itemNotes,
        cookiePrice,
      }),
    );
  };

  if (primaryCategory !== "Cookies Tower" && hasTowerMarker) {
    const quantity =
      extractQuantityForKeywords(orderText, [
        "cookies tower",
        "cookie tower",
        "tower cookies",
      ]) ?? 1;
    pushItem("Cookies Tower", quantity, orderText);
  }

  if (primaryCategory !== "Cake" && hasCakeMarker) {
    const quantity = extractQuantityForKeywords(orderText, ["cake"]) ?? 1;
    pushItem("Cake", quantity, orderText || rawText);
  }

  if (primaryCategory !== "Cupcakes" && hasCupcakeMarker) {
    const breakdown = parseCupcakeQuantityBreakdown([orderText]);

    if (breakdown.dozenCount > 0) {
      pushItem("Cupcakes", breakdown.dozenCount, "cupcakes dozen lusin 12 pcs");
    }

    if (breakdown.individualCount > 0) {
      pushItem(
        "Cupcakes",
        breakdown.individualCount,
        "cupcakes individual indv pcs",
      );
    }

    if (breakdown.dozenCount === 0 && breakdown.individualCount === 0) {
      const quantity =
        extractQuantityForKeywords(orderText, ["cupcakes", "cupcake"]) ??
        breakdown.fallbackQuantity ??
        1;
      pushItem("Cupcakes", quantity, orderText || rawText);
    }
  }

  const bouquetCookiePrice = parseCurrencyAmount(
    parsed.details.cookiePrice ?? "",
  );
  if (primaryCategory !== "Buket" && hasBouquetMarker) {
    const quantity =
      extractQuantityForKeywords(orderText, ["buket", "bouquet"]) ?? 1;
    pushItem(
      "Buket",
      quantity,
      orderText || rawText,
      bouquetCookiePrice ?? undefined,
    );
  }

  const orderWithoutTower = orderText.replace(/cookies?\s*tower/gi, " ");
  const orderWithoutTopper = orderWithoutTower.replace(
    /topper\s*cookies?/gi,
    " ",
  );
  const hasCookiesOnly = /\bcookies?\b/i.test(orderWithoutTopper);
  if (primaryCategory !== "Cookies" && (hasCookiesOnly || hasCookiesMarker)) {
    const quantity =
      extractQuantityForKeywords(orderWithoutTopper, ["cookies", "cookie"]) ??
      extractOrderQuantity(orderWithoutTopper) ??
      extractPositiveInteger(orderWithoutTopper) ??
      1;
    pushItem("Cookies", quantity, orderWithoutTopper || rawText);
  }

  return mergeAutoFillItems(supplements);
}

function buildDefaultAutoFillItems(
  parsed: ParsedWhatsAppOrder,
  itemNotes: string,
): BookingFormAutoFill["items"] {
  const catalog = chooseCatalogSelection(parsed);
  const quantity = chooseQuantity(parsed);
  const difficultySource = [
    parsed.common.order,
    ...Object.values(parsed.details),
  ]
    .filter(Boolean)
    .join(" ");
  const inferredDifficulty = inferTokenDifficultyFromText(difficultySource);
  const tokenDifficulty =
    catalog.category === "Cookies" || catalog.category === "Buket"
      ? (inferredDifficulty ?? "SIMPLE")
      : undefined;
  const cookiePrice =
    catalog.category === "Buket"
      ? (parseCurrencyAmount(parsed.details.cookiePrice ?? "") ?? undefined)
      : undefined;
  const cupcakeDarkColor =
    catalog.category === "Cupcakes"
      ? detectCupcakeDarkColorButtercream(
          [
            parsed.common.order,
            parsed.details.cupcakeColor,
            parsed.details.cupcakeFlavor,
            parsed.rawText,
          ]
            .filter(Boolean)
            .join(" "),
        )
      : { addOns: [] as string[], darkColorButtercreamColor: undefined };

  return [
    {
      category: catalog.category,
      subcategory: catalog.subcategory,
      productName: catalog.productName,
      size: catalog.size,
      quantity,
      tokenDifficulty,
      cookiePrice,
      addOns: cupcakeDarkColor.addOns,
      darkColorButtercreamColor: cupcakeDarkColor.darkColorButtercreamColor,
      notes: itemNotes,
    },
  ];
}

function buildCupcakeAutoFillItems(
  parsed: ParsedWhatsAppOrder,
  itemNotes: string,
): BookingFormAutoFill["items"] {
  const quantityInfo = resolveCupcakeQuantityBreakdown(parsed);

  const items: BookingFormAutoFill["items"] = [];
  const cupcakeDarkColor = detectCupcakeDarkColorButtercream(
    [
      parsed.common.order,
      parsed.details.cupcakeColor,
      parsed.details.cupcakeFlavor,
      parsed.rawText,
    ]
      .filter(Boolean)
      .join(" "),
  );

  if (quantityInfo.dozenCount > 0) {
    const catalog = chooseCatalogSelectionByText(
      "Cupcakes",
      "cupcakes 1 dozen lusin 12 pcs",
    );
    items.push({
      category: catalog.category,
      subcategory: catalog.subcategory,
      productName: catalog.productName,
      size: catalog.size,
      quantity: quantityInfo.dozenCount,
      addOns: cupcakeDarkColor.addOns,
      darkColorButtercreamColor: cupcakeDarkColor.darkColorButtercreamColor,
      notes: itemNotes,
    });
  }

  if (quantityInfo.individualCount > 0) {
    const catalog = chooseCatalogSelectionByText(
      "Cupcakes",
      "cupcakes individual indv per pcs",
    );
    items.push({
      category: catalog.category,
      subcategory: catalog.subcategory,
      productName: catalog.productName,
      size: catalog.size,
      quantity: quantityInfo.individualCount,
      addOns: cupcakeDarkColor.addOns,
      darkColorButtercreamColor: cupcakeDarkColor.darkColorButtercreamColor,
      notes: itemNotes,
    });
  }

  if (items.length > 0) {
    return items;
  }

  return buildDefaultAutoFillItems(parsed, itemNotes);
}

export function buildWhatsAppTemplate(orderType: WhatsAppOrderType): string {
  switch (orderType) {
    case "cake":
      return [
        "Data Cake",
        "Tanggal Pengiriman (/Maret/26):",
        "KODE BOOKING:",
        "Order:",
        "Nama di Cake:",
        "Umur di cake:",
        "Ukuran cake:",
        "Rasa cake:",
        "Design cake:",
        "Jam Pengiriman:",
        "Metode Pengiriman:",
        "Nama penerima:",
        "No. telp penerima:",
        "Alamat lengkap:",
      ].join("\n");
    case "cookies":
      return [
        "Data Cookies",
        "Tanggal Pengiriman (/Maret/26):",
        "KODE BOOKING:",
        "Order:",
        "To From Notes:",
        "Jam Pengiriman:",
        "Metode Pengiriman:",
        "Nama penerima:",
        "No. telp penerima:",
        "Alamat lengkap:",
      ].join("\n");
    case "cupcakes":
      return [
        "Data Cupcakes",
        "Tanggal Pengiriman (/Maret/26):",
        "KODE BOOKING:",
        "Order:",
        "Jumlah Cupcakes:",
        "Rasa Cupcakes:",
        "Warna Cupcakes:",
        "Jumlah Topper Cookies:",
        "Jam Pengiriman:",
        "Metode Pengiriman:",
        "Nama penerima:",
        "No. telp penerima:",
        "Alamat lengkap:",
      ].join("\n");
    case "buket":
      return [
        "Data Buket",
        "Tanggal Pengiriman (/Maret/26):",
        "KODE BOOKING:",
        "Order:",
        "Design:",
        "Warna kertas bouquet:",
        "Jumlah Cookies (isi bouquet):",
        "Harga Cookie / pcs:",
        "Warna Bunga:",
        "Kartu ucapan:",
        "Jam Pengiriman:",
        "Metode Pengiriman:",
        "Nama Penerima:",
        "No telp Penerima:",
        "Alamat Lengkap:",
      ].join("\n");
    case "cookies_tower":
      return [
        "Data Cookies Tower",
        "Tanggal Pengiriman (/Maret/26):",
        "KODE BOOKING:",
        "Order:",
        "Tema Design:",
        "Tema Warna:",
        "Nama:",
        "Umur:",
        "Jam Pengiriman:",
        "Metode Pengiriman:",
        "Nama penerima:",
        "No telp penerima:",
        "Alamat Lengkap:",
      ].join("\n");
    default:
      return "";
  }
}

export function parseWhatsAppOrderText(
  rawText: string,
  options?: {
    preferredOrderType?: WhatsAppOrderTypeOrUnknown;
    sourceType?: WhatsAppSourceType;
  },
): ParsedWhatsAppOrder {
  const sourceType = options?.sourceType ?? "text";
  const preferredOrderType = options?.preferredOrderType ?? "unknown";
  const text = rawText.trim();
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const lookup = buildKeyValueLookup(lines);
  const orderType = detectOrderType(text, lookup, preferredOrderType);

  const common = buildEmptyCommonFields();
  for (const field of commonFieldDefinitions) {
    const value = readFieldValue(text, lines, lookup, field);
    common[field.key as CommonFieldKey] = normalizeByKey(field.key, value);
  }

  const details: Record<string, string> = {};
  const detailDefinitions = detailFieldDefinitions[orderType];
  for (const field of detailDefinitions) {
    const value = readFieldValue(text, lines, lookup, field);
    details[field.key] = normalizeByKey(field.key, value);
  }

  const missingFields: string[] = [];
  for (const key of requiredCommonKeys) {
    if (!common[key]) {
      const field = commonFieldDefinitions.find((item) => item.key === key);
      if (field) missingFields.push(field.label);
    }
  }

  for (const field of detailDefinitions) {
    const isOptional = optionalDetailFieldKeys[orderType]?.includes(field.key);
    if (!details[field.key] && !isOptional) {
      missingFields.push(field.label);
    }
  }

  return {
    orderType,
    sourceType,
    rawText: text,
    common,
    details,
    missingFields,
  };
}

export function formatParsedWhatsAppForNotes(
  parsed: ParsedWhatsAppOrder,
): string {
  const lines: string[] = [];
  lines.push(`[WA Parser] ${WHATSAPP_ORDER_LABELS[parsed.orderType]}`);

  for (const field of commonFieldDefinitions) {
    const value = parsed.common[field.key as CommonFieldKey];
    if (!value) continue;
    lines.push(`${field.label}: ${value}`);
  }

  for (const field of detailFieldDefinitions[parsed.orderType]) {
    const value = parsed.details[field.key];
    if (!value) continue;
    lines.push(`${field.label}: ${value}`);
  }

  return lines.join("\n");
}

export function buildBookingAutoFillFromParsed(
  parsed: ParsedWhatsAppOrder,
): BookingFormAutoFill {
  const detailNotes = detailFieldDefinitions[parsed.orderType]
    .map((field) => {
      const value = parsed.details[field.key];
      if (!value) return "";
      return `${field.label}: ${value}`;
    })
    .filter(Boolean)
    .join(" | ");

  const orderLine = parsed.common.order ? `Order: ${parsed.common.order}` : "";
  const itemNotes = [orderLine, detailNotes]
    .filter(Boolean)
    .join(" | ")
    .slice(0, 200);

  const primaryAutoFillItems =
    parsed.orderType === "cupcakes"
      ? buildCupcakeAutoFillItems(parsed, itemNotes)
      : buildDefaultAutoFillItems(parsed, itemNotes);
  const mixedSupplementItems = buildMixedSupplementAutoFillItems(
    parsed,
    itemNotes,
  );
  const autoFillItems = mergeAutoFillItems([
    ...primaryAutoFillItems,
    ...mixedSupplementItems,
  ]);

  const address = parsed.common.fullAddress || "Alamat belum terisi";
  const area = guessDeliveryArea(address);

  const customerName = parsed.common.recipientName || "Customer WA";
  const phoneNumber = parsed.common.recipientPhone || "";
  const deliveryDate = /^\d{4}-\d{2}-\d{2}$/.test(parsed.common.deliveryDate)
    ? parsed.common.deliveryDate
    : "";
  const deliverySlot = /^\d{2}:\d{2}$/.test(parsed.common.deliveryTime)
    ? parsed.common.deliveryTime
    : "09:00";
  const deliveryMethod = mapDeliveryMethodToFormValue(
    parsed.common.deliveryMethod,
  );

  const notesSections = [
    formatParsedWhatsAppForNotes(parsed),
    parsed.common.deliveryMethod
      ? `Metode Pengiriman: ${parsed.common.deliveryMethod}`
      : "",
    parsed.common.bookingCode
      ? `KODE BOOKING: ${parsed.common.bookingCode}`
      : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 400);

  return {
    customerName,
    phoneNumber,
    deliveryDate,
    deliverySlot,
    deliveryMethod,
    customNotes: notesSections,
    deliveryAddresses: [
      {
        label: "Primary",
        area,
        addressLine: address,
      },
    ],
    items: autoFillItems,
  };
}

export function getDisplayFields(
  parsed: ParsedWhatsAppOrder,
): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];

  for (const field of commonFieldDefinitions) {
    rows.push({
      label: field.label,
      value: parsed.common[field.key as CommonFieldKey] || "-",
    });
  }

  for (const field of detailFieldDefinitions[parsed.orderType]) {
    rows.push({
      label: field.label,
      value: parsed.details[field.key] || "-",
    });
  }

  return rows;
}
