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
    aliases: ["tanggal pengiriman", "tgl pengiriman", "tanggal kirim", "tgl kirim"],
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
    aliases: ["no telp penerima", "no. telp penerima", "nomor penerima", "telepon penerima", "no hp penerima"],
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
      aliases: ["jumlah cupcakes", "jumlah cupcake", "qty cupcakes", "qty cupcake"],
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
      aliases: ["warna kertas bouquet", "warna kertas bouquet", "warna kertas buket", "warna kertas"],
    },
    {
      key: "flowerCount",
      label: "Jumlah Bunga",
      aliases: ["jumlah bunga", "qty bunga"],
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
  common: ParsedCommonFields;
  details: Record<string, string>;
  missingFields: string[];
}

export interface BookingFormAutoFill {
  customerName: string;
  phoneNumber: string;
  deliveryDate: string;
  deliverySlot: string;
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
    addOns: string[];
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
  const cleaned = normalizeSpaces(value.replace(/^[:\-=\s]+/, "").replace(/[\s]+$/, ""));
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
    field.aliases.some((alias) => normalized.startsWith(normalizeLabel(alias)))
  );
}

function collectBlockValue(lines: string[], startIndex: number, firstLineValue: string): string {
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
  definition: FieldDefinition
): string {
  const normalizedAliases = definition.aliases.map((alias) => normalizeLabel(alias));

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

    for (let aliasIndex = 0; aliasIndex < definition.aliases.length; aliasIndex += 1) {
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
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
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

  const dayMonthWordYearWithSlash = text.match(/\b(\d{1,2})[\/-]([a-zA-Z]+)[\/-](\d{2,4})\b/i);
  if (dayMonthWordYearWithSlash) {
    const day = Number(dayMonthWordYearWithSlash[1]);
    const month = MONTH_MAP[normalizeLabel(dayMonthWordYearWithSlash[2])];
    const year = normalizeYear(Number(dayMonthWordYearWithSlash[3]));
    if (month) {
      return toIsoDate(year, month, day);
    }
  }

  const dayMonthWordYear = text.match(/\b(\d{1,2})\s+([a-zA-Z]+)\s+(\d{2,4})\b/i);
  if (dayMonthWordYear) {
    const day = Number(dayMonthWordYear[1]);
    const month = MONTH_MAP[normalizeLabel(dayMonthWordYear[2])];
    const year = normalizeYear(Number(dayMonthWordYear[3]));
    if (month) {
      return toIsoDate(year, month, day);
    }
  }

  const monthWordDayYear = text.match(/\b([a-zA-Z]+)\s+(\d{1,2})\s+(\d{2,4})\b/i);
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

  if (lowered.includes("pickup") || lowered.includes("ambil sendiri")) return "Pickup";
  if (lowered.includes("gosend")) return "GoSend";
  if (lowered.includes("gojek")) return "Gojek";
  if (lowered.includes("grab")) return "Grab";
  if (lowered.includes("kurir")) return "Kurir";
  if (lowered.includes("delivery") || lowered.includes("antar")) return "Delivery";

  return value;
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

function detectOrderType(
  rawText: string,
  lookup: Map<string, string>,
  preferredOrderType: WhatsAppOrderTypeOrUnknown
): WhatsAppOrderType {
  if (preferredOrderType !== "unknown") return preferredOrderType;

  const keys = Array.from(lookup.keys()).join(" ");
  const normalizedText = normalizeLabel(`${rawText} ${keys}`);

  if (
    normalizedText.includes("cookies tower") ||
    normalizedText.includes("tema design") ||
    normalizedText.includes("tema warna")
  ) {
    return "cookies_tower";
  }

  if (
    normalizedText.includes("cupcake") ||
    normalizedText.includes("jumlah topper cookies")
  ) {
    return "cupcakes";
  }

  if (
    normalizedText.includes("buket") ||
    normalizedText.includes("bouquet") ||
    normalizedText.includes("jumlah bunga") ||
    normalizedText.includes("warna kertas bouquet")
  ) {
    return "buket";
  }

  if (
    normalizedText.includes("cookies") ||
    normalizedText.includes("to from notes")
  ) {
    return "cookies";
  }

  return "cake";
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

function extractPositiveInteger(value: string): number | null {
  const match = value.match(/\d+/);
  if (!match) return null;
  const parsed = Number(match[0]);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function guessDeliveryArea(address: string): string {
  const normalized = normalizeLabel(address);
  if (!normalized) return "Outside Area";

  if (normalized.includes("pusat") || normalized.includes("central")) return "Central City";
  if (normalized.includes("utara") || normalized.includes("north")) return "North District";
  if (normalized.includes("selatan") || normalized.includes("south")) return "South District";
  if (normalized.includes("barat") || normalized.includes("west")) return "West District";

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
  const searchSource = [
    parsed.common.order,
    ...Object.values(parsed.details),
  ]
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

function extractOrderQuantity(value: string): number | null {
  const text = value.trim();
  if (!text) return null;

  const explicit = text.match(
    /(?:qty|jumlah|order|pesan|x)\s*[:=\-]?\s*(\d{1,4})\b/i
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
  if (parsed.orderType === "cake" || parsed.orderType === "buket" || parsed.orderType === "cookies_tower") {
    return 1;
  }

  if (parsed.orderType === "cupcakes") {
    const fromField = extractPositiveInteger(parsed.details.cupcakeCount ?? "");
    if (fromField) return fromField;
    return extractOrderQuantity(parsed.common.order ?? "") ?? 1;
  }

  return extractOrderQuantity(parsed.common.order ?? "") ?? 1;
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
        "Jumlah Bunga:",
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
  }
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
    if (!details[field.key]) {
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

export function formatParsedWhatsAppForNotes(parsed: ParsedWhatsAppOrder): string {
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

export function buildBookingAutoFillFromParsed(parsed: ParsedWhatsAppOrder): BookingFormAutoFill {
  const catalog = chooseCatalogSelection(parsed);
  const quantity = chooseQuantity(parsed);

  const detailNotes = detailFieldDefinitions[parsed.orderType]
    .map((field) => {
      const value = parsed.details[field.key];
      if (!value) return "";
      return `${field.label}: ${value}`;
    })
    .filter(Boolean)
    .join(" | ");

  const orderLine = parsed.common.order ? `Order: ${parsed.common.order}` : "";
  const itemNotes = [orderLine, detailNotes].filter(Boolean).join(" | ").slice(0, 200);

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

  const notesSections = [
    formatParsedWhatsAppForNotes(parsed),
    parsed.common.deliveryMethod ? `Metode Pengiriman: ${parsed.common.deliveryMethod}` : "",
    parsed.common.bookingCode ? `KODE BOOKING: ${parsed.common.bookingCode}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 400);

  return {
    customerName,
    phoneNumber,
    deliveryDate,
    deliverySlot,
    customNotes: notesSections,
    deliveryAddresses: [
      {
        label: "Primary",
        area,
        addressLine: address,
      },
    ],
    items: [
      {
        category: catalog.category,
        subcategory: catalog.subcategory,
        productName: catalog.productName,
        size: catalog.size,
        quantity,
        addOns: [],
        notes: itemNotes,
      },
    ],
  };
}

export function getDisplayFields(parsed: ParsedWhatsAppOrder): Array<{ label: string; value: string }> {
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
