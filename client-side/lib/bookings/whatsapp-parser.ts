import {
  BOOKING_ADD_ON_CATALOG,
  BOOKING_PRODUCT_CATALOG,
  ensureCatalogSelectionFromCatalog,
  getDefaultCatalogSelectionFromCatalog,
  suggestCatalogSelectionFromCatalog,
  type CatalogAddOn,
  type PricelistCategory,
} from "@/lib/bookings/pricelist";
import {
  getFlavorOptionsByCategory,
  type FlavorOption,
} from "@/lib/bookings/flavor-options";

export type WhatsAppOrderType =
  | "cake"
  | "cookies"
  | "cupcakes"
  | "buket"
  | "cookies_tower";

export type WhatsAppOrderTypeOrUnknown = WhatsAppOrderType | "unknown";

export type WhatsAppSourceType = "text" | "manual" | "image" | "email";

export interface BookingParserCatalogContext {
  productCatalog?: PricelistCategory[];
  addOnCatalog?: Record<string, CatalogAddOn[]>;
}

const ORDER_TYPE_SEQUENCE: WhatsAppOrderType[] = [
  "cake",
  "cookies",
  "cupcakes",
  "buket",
  "cookies_tower",
];

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
    aliases: [
      "nama penerima",
      "nama penerima",
      "nama customer",
      "penerima",
      "customer",
    ],
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
  {
    key: "postalCode",
    label: "Kode pos",
    aliases: ["kode pos", "postal code", "postcode"],
  },
];

export const detailFieldDefinitions: Record<
  WhatsAppOrderType,
  FieldDefinition[]
> = {
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
  // Daftar kolom detail spesifik untuk pesanan bertipe cookies
  cookies: [
    // Kolom untuk catatan dari-ke pengirim cookies
    {
      // Kunci identifikasi kolom to-from notes
      key: "toFromNotes",
      // Nama label tampilan untuk catatan dari-ke pengirim
      label: "To From Notes",
      // Daftar alias teks alternatif untuk mengenali kolom notes pengirim
      aliases: ["to from notes", "to-from-notes", "to from"],
    },
    // Kolom untuk deskripsi tema dan desain cookies
    {
      // Kunci identifikasi kolom cookie design
      key: "cookieDesign",
      // Nama label tampilan untuk desain cookies
      label: "Design Cookies",
      // Daftar alias teks alternatif untuk mengenali kolom desain cookies
      aliases: [
        "design cookies",
        "cookies design",
        "desain cookies",
        "design cookie",
      ],
    },
    // Kolom baru untuk menangkap jumlah/kuantitas cookies
    {
      // Kunci identifikasi kolom kuantitas cookies
      key: "cookieCount",
      // Nama label tampilan kolom jumlah cookies
      label: "Jumlah Cookies",
      // Daftar alias teks alternatif dalam chat untuk mengenali kuantitas cookies
      aliases: [
        "jumlah cookies",
        "qty cookies",
        "jumlah cookie",
        "qty cookie",
        "jumlah",
        "qty",
        "cookie count",
        "cookie qty",
        "cookies count",
        "cookies qty",
      ],
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
      label: "Jumlah Bunga / Isi Bouquet",
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

// Konfigurasi field detail opsional (tidak wajib diisi) untuk setiap tipe order
const optionalDetailFieldKeys: Record<WhatsAppOrderType, string[]> = {
  // Tipe cake tidak memiliki field detail opsional wajib
  cake: [],
  // Tipe cookies memiliki field opsional catatan to-from dan jumlah cookies
  cookies: ["toFromNotes", "cookieCount"],
  // Tipe cupcakes tidak memiliki field detail opsional wajib
  cupcakes: [],
  // Tipe buket memiliki field opsional harga, jumlah bunga, dan warna bunga
  buket: ["cookiePrice", "flowerCount", "flowerColor"],
  // Tipe cookies tower tidak memiliki field detail opsional wajib
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

export interface ParsedWhatsAppReferenceImage {
  url: string;
  label?: string;
  note?: string;
  orderIndex?: number;
}

export interface ParsedWhatsAppOrderRecapItem {
  itemNumber?: number;
  category: string;
  productName: string;
  quantity: number;
  size: string;
  designNotes: string;
  addOn: string;
  unitPrice?: number;
  subtotal?: number;
}

export interface ParsedWhatsAppOrderRecapTotals {
  subtotalProducts?: number;
  shippingFee?: number;
  serviceCharge?: number;
  adjustment?: number;
  total?: number;
  downPayment?: number;
  remainingBalance?: number;
}

export interface ParsedWhatsAppOrderRecap {
  items: ParsedWhatsAppOrderRecapItem[];
  totals: ParsedWhatsAppOrderRecapTotals;
}

export type ParsedWhatsAppDetailsByOrderType = Partial<
  Record<WhatsAppOrderType, Record<string, string>>
>;

export interface ParsedWhatsAppDetectedItem {
  orderType: WhatsAppOrderType;
  category: string;
  productName: string;
  size: string;
  quantity: number;
}

export interface ParsedWhatsAppOrder {
  orderType: WhatsAppOrderType;
  sourceType: WhatsAppSourceType;
  rawText: string;
  imageUrl?: string;
  uploadedImageUrls?: string[];
  referenceImages?: ParsedWhatsAppReferenceImage[];
  requestedImageLabels?: string[];
  common: ParsedCommonFields;
  details: Record<string, string>;
  detailsByOrderType?: ParsedWhatsAppDetailsByOrderType;
  detectedItems?: ParsedWhatsAppDetectedItem[];
  orderRecap?: ParsedWhatsAppOrderRecap;
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
  paymentStatus: "DP Paid" | "Paid";
  dpPaidAmount: number;
  finalPaidAmount: number;
  manualAdjustment: number;
  deliveryAddresses: Array<{
    label: string;
    area: string;
    postalCode?: string;
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
    designCount?: number;
    additionalDesignCount?: number;
    addOns: string[];
    addOnQuantities?: Record<string, number>;
    addOnPriceOverrides?: Record<string, number>;
    customAddOns?: Array<{ label: string; price: number }>;
    darkColorButtercreamColors?: string[];
    darkColorButtercreamColor?: string;
    parsedUnitPrice?: number;
    parsedSubtotal?: number;
    pricingSource?: "RECAP";
    cookieDifficultyBreakdown?: string;
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

function joinCollectedBlockParts(parts: string[]): string {
  let combined = "";

  for (const rawPart of parts) {
    const part = cleanupValue(rawPart);
    if (!part) continue;

    if (!combined) {
      combined = part;
      continue;
    }

    if (/[,:+/-]\s*$/.test(combined) || /^[,;.)/+:-]/.test(part)) {
      combined = `${combined} ${part}`;
      continue;
    }

    combined = `${combined} | ${part}`;
  }

  return cleanupValue(
    combined
      .replace(/\s+,/g, ",")
      .replace(/\s+;/g, ";")
      .replace(/,\s*\|/g, ", ")
      .replace(/:\s*\|/g, ": "),
  );
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

const recapItemFieldDefinitions: FieldDefinition[] = [
  {
    key: "category",
    label: "Kategori",
    aliases: ["kategori", "category"],
  },
  {
    key: "productName",
    label: "Nama Produk",
    aliases: ["nama produk", "produk", "product", "nama item"],
  },
  {
    key: "quantity",
    label: "Qty",
    aliases: ["qty", "quantity", "jumlah"],
  },
  {
    key: "size",
    label: "Size/Varian",
    aliases: ["size/varian", "size varian", "size", "varian", "ukuran"],
  },
  {
    key: "designNotes",
    label: "Design/Notes",
    aliases: ["design/notes", "design notes", "design", "notes"],
  },
  {
    key: "addOn",
    label: "Add On",
    aliases: ["add on", "add-on", "addon"],
  },
  {
    key: "unitPrice",
    label: "Harga Satuan",
    aliases: ["harga satuan", "harga", "price"],
  },
  {
    key: "totalItemCost",
    label: "Total Biaya Item",
    aliases: ["total biaya item", "total item", "item total"],
  },
  {
    key: "subtotal",
    label: "Subtotal",
    aliases: ["subtotal"],
  },
];

const recapTotalFieldDefinitions: Array<
  FieldDefinition & { key: keyof ParsedWhatsAppOrderRecapTotals }
> = [
  {
    key: "subtotalProducts",
    label: "Subtotal Produk",
    aliases: ["subtotal produk", "subtotal item", "subtotal items"],
  },
  {
    key: "shippingFee",
    label: "Ongkir",
    aliases: ["ongkir", "delivery fee", "shipping fee"],
  },
  {
    key: "serviceCharge",
    label: "Service Charge",
    aliases: ["service charge", "biaya layanan", "admin fee"],
  },
  {
    key: "adjustment",
    label: "Adjustment",
    aliases: ["adjustment", "penyesuaian", "adjust"],
  },
  {
    key: "total",
    label: "Total",
    aliases: ["total", "grand total"],
  },
  {
    key: "downPayment",
    label: "DP",
    aliases: ["dp", "down payment", "uang muka"],
  },
  {
    key: "remainingBalance",
    label: "Sisa",
    aliases: ["sisa", "remaining", "remaining balance", "pelunasan"],
  },
];

function parseRecapItemHeader(line: string): {
  itemNumber?: number;
  title?: string;
} | null {
  const match = line.match(
    /^(?:item\s*(\d+)|(\d+)[.)])(?:\s*(?:[:-]\s*|\s+)(.+))?$/i,
  );
  if (!match) return null;

  const usesExplicitItemLabel = Boolean(match[1]);
  const title = cleanupValue(match[3] || "");
  if (!usesExplicitItemLabel) {
    if (!title) return null;

    const normalizedTitle = normalizeLabel(title);
    const looksLikeDesignListEntry =
      /^(?:nailong|design|desain|tema|warna|all design|full body)\b/i.test(
        normalizedTitle,
      );
    const looksLikeRecapProductTitle =
      /\b(cake|cookie|cookies|cupcake|bouquet|buket|hbq|sbq|tower|box|paket|packet|dozen|lusin)\b/i.test(
        normalizedTitle,
      );

    if (looksLikeDesignListEntry || !looksLikeRecapProductTitle) {
      return null;
    }
  }

  const itemNumber = Number(match[1] || match[2] || 0);
  return {
    itemNumber:
      Number.isInteger(itemNumber) && itemNumber > 0 ? itemNumber : undefined,
    title,
  };
}

function isRecapTotalsLine(line: string): boolean {
  const normalized = normalizeLabel(line);
  if (!normalized) return false;

  return recapTotalFieldDefinitions.some((field) =>
    field.aliases.some((alias) => normalized.startsWith(normalizeLabel(alias))),
  );
}

function looksLikeLabeledLine(
  value: string,
  options?: { insideBlock?: boolean },
): boolean {
  const normalized = normalizeLabel(value);
  if (!normalized) return false;

  // Explicit Section Headers
  if (normalized === "rekap order") return true;
  
  if (!options?.insideBlock && parseRecapItemHeader(value) !== null) {
    return true;
  }
  if (isRecapTotalsLine(value)) return true;

  if (normalized.startsWith("jenis pesanan")) return true;
  if (/^[a-z0-9\s]{2,60}\s*[:=-]\s*/i.test(value.trim())) return true;

  return [...allFieldDefinitions, ...recapItemFieldDefinitions].some((field) =>
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
    if (looksLikeLabeledLine(line, { insideBlock: true })) break;
    parts.push(line);
  }

  return joinCollectedBlockParts(parts);
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

// No content here, moved above.


function normalizeRecapCategory(value: string): string {
  const normalized = normalizeLabel(value);
  if (!normalized) return "";

  if (normalized.includes("cookies tower") || normalized.includes("tower")) {
    return "Cookies Tower";
  }
  if (normalized.includes("cupcake")) return "Cupcakes";
  if (
    normalized.includes("seasonal event") ||
    normalized.includes("event cookies") ||
    normalized.includes("lotus box") ||
    normalized.includes("dimsum box") ||
    normalized.includes("bites nastar") ||
    normalized.includes("bites box") ||
    normalized.includes("character box") ||
    normalized.includes("sharing box") ||
    normalized.includes("bauble") ||
    normalized.includes("3 in 1")
  ) {
    return "Seasonal Event";
  }
  if (
    normalized.includes("buket") ||
    normalized.includes("bouquet") ||
    normalized.includes("hbq") ||
    normalized.includes("sbq") ||
    normalized.includes("hand bouquet") ||
    normalized.includes("standing bouquet")
  ) {
    return "Buket";
  }
  if (normalized.includes("cookie")) return "Cookies";
  if (normalized.includes("cake")) return "Cake";

  return "";
}

interface ParsedRecapBreakdownEntry {
  quantity: number;
  size: string;
  unitPrice?: number;
  subtotal?: number;
}

function buildCookieBreakdownSummary(
  entries: ParsedRecapBreakdownEntry[],
): string {
  return entries
    .filter((entry) => entry.quantity > 0 && cleanupValue(entry.size))
    .map((entry) => `${entry.quantity} pcs ${entry.size}`)
    .join(", ");
}

function parseRecapBreakdownEntries(
  lines: string[],
): ParsedRecapBreakdownEntry[] {
  const entries: ParsedRecapBreakdownEntry[] = [];
  let currentEntry: ParsedRecapBreakdownEntry | null = null;

  const pushCurrentEntry = () => {
    if (!currentEntry) return;
    if (currentEntry.quantity > 0 && cleanupValue(currentEntry.size)) {
      entries.push({
        quantity: currentEntry.quantity,
        size: cleanupValue(currentEntry.size),
        unitPrice: currentEntry.unitPrice,
        subtotal: currentEntry.subtotal,
      });
    }
    currentEntry = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").trim();
    if (!line) continue;

    const normalized = normalizeLabel(line);
    if (!normalized) continue;

    const breakdownMatch = line.match(
      /(?:^|\s)(\d{1,4})\s*(?:pcs?|pc)?\s*(simple|normal|hard|advanced|expert)\b/i,
    );

    if (breakdownMatch) {
      pushCurrentEntry();
      currentEntry = {
        quantity: Number(breakdownMatch[1] || 0),
        size: String(breakdownMatch[2] || "").toUpperCase(),
      };
      continue;
    }

    if (!currentEntry) continue;

    if (normalized.startsWith(normalizeLabel("Harga Satuan"))) {
      const amount = parseCurrencyAmount(line);
      if (amount !== null) {
        currentEntry.unitPrice = amount;
      }
      continue;
    }

    if (normalized.startsWith(normalizeLabel("Subtotal"))) {
      const amount = parseCurrencyAmount(line);
      if (amount !== null) {
        currentEntry.subtotal = amount;
      }
      pushCurrentEntry();
    }
  }

  pushCurrentEntry();
  return entries;
}

function parseOrderRecap(
  rawText: string,
  lines: string[],
): ParsedWhatsAppOrderRecap | undefined {
  const recapMarkerIndex = lines.findIndex(
    (line) => normalizeLabel(line) === normalizeLabel("REKAP ORDER"),
  );
  const recapLines =
    recapMarkerIndex >= 0 ? lines.slice(recapMarkerIndex + 1) : lines;
  const itemBlocks: Array<{
    itemNumber?: number;
    title?: string;
    lines: string[];
  }> = [];
  let currentBlock: {
    itemNumber?: number;
    title?: string;
    lines: string[];
  } | null = null;

  for (const line of recapLines) {
    const header = parseRecapItemHeader(line);
    if (header) {
      if (currentBlock?.lines.length) {
        itemBlocks.push(currentBlock);
      }
      currentBlock = {
        itemNumber: header.itemNumber,
        title: header.title,
        lines: [line],
      };
      continue;
    }

    if (!currentBlock) continue;
    if (isRecapTotalsLine(line)) {
      if (currentBlock.lines.length) {
        itemBlocks.push(currentBlock);
      }
      currentBlock = null;
      continue;
    }

    currentBlock.lines.push(line);
  }

  if (currentBlock?.lines.length) {
    itemBlocks.push(currentBlock);
  }

  const recapItems: ParsedWhatsAppOrderRecapItem[] = itemBlocks.flatMap(
    (block) => {
      const lookup = buildKeyValueLookup(block.lines);
      const categoryValue = readFieldValue(
        block.lines.join("\n"),
        block.lines,
        lookup,
        recapItemFieldDefinitions[0],
      );
      const productNameValue = readFieldValue(
        block.lines.join("\n"),
        block.lines,
        lookup,
        recapItemFieldDefinitions[1],
      );
      const quantityValue = readFieldValue(
        block.lines.join("\n"),
        block.lines,
        lookup,
        recapItemFieldDefinitions[2],
      );
      const sizeValue = readFieldValue(
        block.lines.join("\n"),
        block.lines,
        lookup,
        recapItemFieldDefinitions[3],
      );
      const designNotesValue = readFieldValue(
        block.lines.join("\n"),
        block.lines,
        lookup,
        recapItemFieldDefinitions[4],
      );
      const addOnValue = readFieldValue(
        block.lines.join("\n"),
        block.lines,
        lookup,
        recapItemFieldDefinitions[5],
      );
      const unitPriceValue = readFieldValue(
        block.lines.join("\n"),
        block.lines,
        lookup,
        recapItemFieldDefinitions[6],
      );
      const subtotalValue = readFieldValue(
        block.lines.join("\n"),
        block.lines,
        lookup,
        recapItemFieldDefinitions[8],
      );
      const totalItemCostValue = readFieldValue(
        block.lines.join("\n"),
        block.lines,
        lookup,
        recapItemFieldDefinitions[7],
      );

      const category =
        normalizeRecapCategory(categoryValue) ||
        normalizeRecapCategory(productNameValue) ||
        normalizeRecapCategory(block.title || "");
      const productName =
        cleanupValue(productNameValue) ||
        cleanupValue(block.title || "") ||
        category;
      const size = cleanupValue(sizeValue);
      const designNotes = cleanupValue(designNotesValue);
      const rawQuantity = extractPositiveInteger(quantityValue) ?? 1;
      const bouquetIsiQuantity =
        category === "Buket"
          ? extractBouquetIsiQuantity(
              [productNameValue, sizeValue, designNotesValue]
                .filter(Boolean)
                .join(" | "),
            )
          : null;
      const quantity =
        category === "Buket" && rawQuantity <= 1 && bouquetIsiQuantity
          ? bouquetIsiQuantity
          : rawQuantity;
      const addOn = cleanupValue(addOnValue);
      const unitPrice = parseCurrencyAmount(unitPriceValue) ?? undefined;
      const totalItemCost =
        parseCurrencyAmount(totalItemCostValue) ?? undefined;
      const subtotal =
        parseCurrencyAmount(subtotalValue) ??
        totalItemCost ??
        (unitPrice && quantity > 0 ? unitPrice * quantity : undefined);
      const breakdownEntries =
        category === "Cookies" ? parseRecapBreakdownEntries(block.lines) : [];

      if (!category && !productName) return [];
      if (breakdownEntries.length > 0) {
        const breakdownQuantity = breakdownEntries.reduce(
          (sum, entry) => sum + Math.max(0, entry.quantity),
          0,
        );
        const breakdownSubtotal = breakdownEntries.reduce((sum, entry) => {
          return sum + Math.max(0, entry.subtotal ?? 0);
        }, 0);
        const breakdownSummary = buildCookieBreakdownSummary(breakdownEntries);
        const mergedDesignNotes = [
          designNotes,
          breakdownSummary ? `Breakdown: ${breakdownSummary}` : "",
        ]
          .filter(Boolean)
          .join(" | ");

        return [
          {
            itemNumber: block.itemNumber,
            category,
            productName:
              category === "Cookies" ? "Custom Cookies" : productName,
            quantity: breakdownQuantity > 0 ? breakdownQuantity : quantity,
            size: breakdownSummary ? "MIX_VARIANT" : size,
            designNotes: mergedDesignNotes,
            addOn,
            unitPrice:
              breakdownEntries.length === 1
                ? breakdownEntries[0]?.unitPrice
                : undefined,
            subtotal:
              totalItemCost ??
              (breakdownSubtotal > 0 ? breakdownSubtotal : subtotal),
          } satisfies ParsedWhatsAppOrderRecapItem,
        ];
      }

      return [
        {
          itemNumber: block.itemNumber,
          category,
          productName,
          quantity,
          size,
          designNotes,
          addOn,
          unitPrice,
          subtotal,
        } satisfies ParsedWhatsAppOrderRecapItem,
      ];
    },
  );

  const recapRawText = recapLines.join("\n");
  const lookup = buildKeyValueLookup(recapLines);
  const totals =
    recapTotalFieldDefinitions.reduce<ParsedWhatsAppOrderRecapTotals>(
      (accumulator, field) => {
        const value = readFieldValue(recapRawText, recapLines, lookup, field);
        const amount =
          field.key === "adjustment"
            ? parseSignedCurrencyAmount(value)
            : parseCurrencyAmount(value);
        if (amount !== null) {
          accumulator[field.key] = amount;
        }
        return accumulator;
      },
      {},
    );

  const hasRecapMarker = recapMarkerIndex >= 0;
  const hasTotals = Object.keys(totals).length > 0;
  if (!hasRecapMarker && recapItems.length === 0 && !hasTotals) {
    return undefined;
  }

  return {
    items: recapItems,
    totals,
  };
}

function buildDetailsByOrderType(
  rawText: string,
  lines: string[],
  lookup: Map<string, string>,
): ParsedWhatsAppDetailsByOrderType {
  const detailsByOrderType: ParsedWhatsAppDetailsByOrderType = {};

  for (const orderType of ORDER_TYPE_SEQUENCE) {
    const details: Record<string, string> = {};

    for (const field of detailFieldDefinitions[orderType]) {
      const value = readFieldValue(rawText, lines, lookup, field);
      details[field.key] = normalizeByKey(field.key, value);
    }

    detailsByOrderType[orderType] = details;
  }

  return detailsByOrderType;
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
    if (lookup.has(alias)) {
      return lookup.get(alias) ?? "";
    }
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

  if (
    lowered.includes("same day") ||
    lowered.includes("same-day") ||
    lowered.includes("sameday")
  ) {
    return "Same Day";
  }
  if (
    lowered.includes("pickup") ||
    lowered.includes("pick up") ||
    lowered.includes("ambil sendiri") ||
    lowered.startsWith("ambil")
  )
    return "Pickup";
  if (isExplicitCustomerCourierMethod(lowered)) {
    return cleanupValue(value) || "Grab/GoCar (pesan customer)";
  }
  if (lowered.includes("paxel")) return "Paxel";
  if (lowered.includes("gocar") || lowered.includes("go car")) return "GoCar";
  if (lowered.includes("gosend")) return "GoSend";
  if (lowered.includes("gojek")) return "Gojek";
  if (lowered.includes("grab")) return "Grab";
  if (
    lowered.includes("jne") ||
    lowered.includes("jnt") ||
    lowered.includes("j&t") ||
    lowered.includes("j t")
  ) {
    return "JNE/J&T";
  }
  if (lowered.includes("kurir")) return "Kurir";
  if (lowered.includes("delivery") || lowered.includes("antar"))
    return "Delivery";

  return value;
}

function isExplicitCustomerCourierMethod(normalized: string): boolean {
  return (
    normalized.includes("pesan customer") ||
    normalized.includes("customer pesan") ||
    normalized.includes("pesan sendiri") ||
    normalized.includes("order sendiri") ||
    normalized.includes("book sendiri") ||
    normalized.includes("customer app")
  );
}

function mapDeliveryMethodToFormValue(
  rawMethod: string,
): BookingFormAutoFill["deliveryMethod"] {
  const normalized = normalizeLabel(rawMethod);
  if (!normalized) return "REGULAR_JNE_JNT";

  if (
    normalized.includes("pickup") ||
    normalized.includes("pick up") ||
    normalized.includes("ambil sendiri") ||
    normalized.startsWith("ambil")
  ) {
    return "PICKUP";
  }

  if (normalized.includes("paxel")) {
    return "ASSISTED_PAXEL";
  }

  if (
    normalized.includes("same day") ||
    normalized.includes("same-day") ||
    normalized.includes("sameday")
  ) {
    return "ASSISTED_SAME_DAY";
  }

  const isCustomerArranged = isExplicitCustomerCourierMethod(normalized);

  if (normalized.includes("gocar") || normalized.includes("go car")) {
    return isCustomerArranged ? "CUSTOMER_APP_COURIER" : "ASSISTED_GOCAR";
  }

  if (normalized.includes("grab")) {
    return isCustomerArranged ? "CUSTOMER_APP_COURIER" : "ASSISTED_GRAB";
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
    case "postalCode":
      return cleaned.match(/\b\d{5}\b/)?.[0] ?? cleaned.replace(/\D/g, "").slice(0, 5);
    case "deliveryMethod":
      return normalizeDeliveryMethod(cleaned);
    case "cakeDesign":
    case "cookieDesign":
    case "bouquetDesign":
    case "designTheme": {
      return cleaned
        .split(/\s*\|\s*/)
        .map((part) => part.trim())
        .filter(Boolean)
        .join("\n");
    }
    case "cakeSize": {
      const shorthandMatch = cleaned.match(
        /\bd\s*(\d{1,2})\s*t\s*(\d{1,2})\b/i,
      );
      if (shorthandMatch?.[1] && shorthandMatch?.[2]) {
        return `D${shorthandMatch[1]}T${shorthandMatch[2]}`;
      }
      return cleaned;
    }
    case "cupcakeColor": {
      const colors = cleaned
        .split(/\n|,|;|\s+\/\s+/g)
        .map((entry) => cleanupValue(entry))
        .filter((entry) => entry.length > 0);
      if (colors.length === 0) return cleaned;
      return Array.from(new Set(colors)).slice(0, 3).join(", ");
    }
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

  if (
    normalized === "hbq" ||
    normalized === "sbq" ||
    normalized === "hand bouquet" ||
    normalized === "standing bouquet"
  ) {
    return "buket";
  }

  if (normalized === "cookies tower" || normalized === "cookies_tower") {
    return "cookies_tower";
  }

  return "unknown";
}

function parseOrderTypeFromText(rawText: string): WhatsAppOrderTypeOrUnknown {
  const explicit = rawText.match(
    /jenis\s+pesanan\s*[:=-]\s*(cake|cookies|cupcakes|buket|hbq|sbq|hand bouquet|standing bouquet|cookies_tower|cookies tower)/i,
  );
  if (explicit?.[1]) {
    return parseOrderTypeToken(explicit[1]);
  }

  const heading = rawText.match(
    /(?:^|\n)\s*(?:\[wa\s*parser\]\s*)?data\s+(cake|cookies|cupcakes|buket|hbq|sbq|hand bouquet|standing bouquet|cookies\s*tower)\b/i,
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
      "hbq",
      "sbq",
      "hand bouquet",
      "standing bouquet",
    ]) ||
    normalizedText.includes("hbq") ||
    normalizedText.includes("sbq") ||
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
    normalizedText.includes("hbq") ||
    normalizedText.includes("sbq") ||
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

function getDetailsForOrderType(
  parsed: ParsedWhatsAppOrder,
  orderType: WhatsAppOrderType,
): Record<string, string> {
  if (parsed.orderType === orderType) {
    return parsed.details;
  }

  return parsed.detailsByOrderType?.[orderType] ?? {};
}

function hasFilledDetailValues(details?: Record<string, string>): boolean {
  return Object.values(details ?? {}).some((value) => cleanupValue(value));
}

function buildDetailNotesForOrderType(
  parsed: ParsedWhatsAppOrder,
  orderType: WhatsAppOrderType,
): string {
  const details = getDetailsForOrderType(parsed, orderType);

  return detailFieldDefinitions[orderType]
    .map((field) => {
      const value = details[field.key];
      if (!value) return "";
      return `${field.label}: ${value}`;
    })
    .filter(Boolean)
    .join(" | ");
}

function buildItemNotesForOrderType(
  parsed: ParsedWhatsAppOrder,
  orderType: WhatsAppOrderType,
): string {
  return buildDetailNotesForOrderType(parsed, orderType).slice(0, 300);
}

function formatCurrencyNote(value?: number): string {
  if (!Number.isFinite(Number(value)) || Number(value) === 0) return "";
  const rounded = Math.round(Number(value));
  const absolute = Math.abs(rounded).toLocaleString("id-ID");
  return rounded < 0 ? `-Rp ${absolute}` : `Rp ${absolute}`;
}

function buildSearchSourceForOrderType(
  parsed: ParsedWhatsAppOrder,
  orderType: WhatsAppOrderType,
  fallbackSearchSource: string,
): string {
  return [
    fallbackSearchSource,
    ...Object.values(getDetailsForOrderType(parsed, orderType)),
  ]
    .filter(Boolean)
    .join(" | ")
    .slice(0, 300);
}

type BookingAutoFillItem = BookingFormAutoFill["items"][number];
type CupcakeFlavorSegment = "DOZEN" | "INDIVIDUAL";

const BOUQUET_COOKIE_QTY_MIN = 7;
const BOUQUET_COOKIE_QTY_MAX = 20;
const COOKIE_INCLUDED_DESIGN_LIMIT = 5;
const COOKIE_PRICE_TO_TOKEN_DIFFICULTY: Array<{
  price: number;
  difficulty: NonNullable<BookingAutoFillItem["tokenDifficulty"]>;
}> = [
  { price: 17000, difficulty: "SIMPLE" },
  { price: 20000, difficulty: "NORMAL" },
  { price: 25000, difficulty: "HARD" },
  { price: 30000, difficulty: "ADVANCED" },
  { price: 35000, difficulty: "EXPERT" },
];

function normalizeCookiePriceAmount(value: number): number {
  const rounded = Math.round(Number(value));
  if (!Number.isFinite(rounded) || rounded <= 0) return 0;
  // Common shorthand in chats: 17 means 17k.
  if (rounded < 1000) return rounded * 1000;
  return rounded;
}

function inferTokenDifficultyFromCookiePrice(
  value: number | null | undefined,
): BookingAutoFillItem["tokenDifficulty"] | undefined {
  const normalizedPrice = normalizeCookiePriceAmount(Number(value || 0));
  if (normalizedPrice <= 0) return undefined;

  const matched = COOKIE_PRICE_TO_TOKEN_DIFFICULTY.find(
    (entry) => entry.price === normalizedPrice,
  );
  return matched?.difficulty;
}

function inferCookieDesignCountFromText(value: string): number | undefined {
  const raw = String(value || "").trim();
  if (!raw) return undefined;

  const normalized = normalizeLabel(raw);
  if (!normalized) return undefined;
  if (normalized.startsWith("breakdown ")) return undefined;

  const segments = raw
    .split(/\n|\||;|,/)
    .map((entry) => cleanupValue(entry))
    .map((entry) =>
      entry
        .replace(/^[-•\s]+/, "")
        .replace(/^\d+[.):-]?\s*/, "")
        .trim(),
    )
    .filter((entry) => entry.length > 0);

  if (segments.length === 0) return undefined;

  const unique = new Set(
    segments
      .map((entry) => normalizeLabel(entry))
      .filter((entry) => entry.length > 0),
  );
  if (unique.size === 0) return undefined;

  return Math.max(1, Math.min(100, unique.size));
}

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
    aliases: [
      "fuschia pink",
      "fuchsia pink",
      "fuschia pin",
      "fuchsia pin",
      "fuschia",
      "fuchsia",
    ],
  },
];

function mergeUniqueAddOnIds(...sources: string[][]): string[] {
  return Array.from(
    new Set(
      sources
        .flat()
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );
}

function compactNormalizedLabel(value: string): string {
  return normalizeLabel(value).replace(/\s+/g, "");
}

function splitAddOnSegments(value: string): string[] {
  return value
    .split(/\n|\||•|;/)
    .map((entry) => entry.replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").trim())
    .filter((entry) => entry.length > 0);
}

function parseAddOnSegmentQuantity(segment: string): number {
  const match = segment.match(/^\s*(\d{1,4})\b/);
  const quantity = Number(match?.[1] || 0);
  if (!Number.isFinite(quantity) || quantity <= 0) return 1;
  return Math.round(quantity);
}

function normalizeMatchedAddOnQuantity(args: {
  category: string;
  addOnId: string;
  segment: string;
  parsedQuantity: number;
}): number {
  const baseQuantity = Math.max(1, Math.round(args.parsedQuantity || 1));
  if (args.category !== "Buket") return baseQuantity;

  const isBouquetFlowerPackage =
    args.addOnId === "bouquet-extra-3-flower" ||
    args.addOnId === "bouquet-extra-6-flower";
  if (!isBouquetFlowerPackage) return baseQuantity;

  const normalizedSegment = normalizeLabel(args.segment);
  const explicitMultiplier = normalizedSegment.match(
    /\b(\d{1,3})\s*x\s*(?:\+\s*)?(?:3|6)\s*bunga\b/i,
  );
  if (explicitMultiplier?.[1]) {
    const parsedMultiplier = Number(explicitMultiplier[1]);
    if (Number.isFinite(parsedMultiplier) && parsedMultiplier > 0) {
      return Math.max(1, Math.round(parsedMultiplier));
    }
  }

  if (
    /\b(?:\+\s*)?(?:add\s*|additional\s*)?(?:3|6)\s*bunga\b/i.test(
      normalizedSegment,
    )
  ) {
    return 1;
  }

  return baseQuantity > 1 ? 1 : baseQuantity;
}

function parseAddOnSegmentTotalPrice(
  segment: string,
  quantity: number,
): number {
  const equalMatch = segment.match(/=\s*([0-9][0-9.,\s]*k?)\s*$/i);
  if (equalMatch?.[1]) {
    const parsed = parseCurrencyAmount(equalMatch[1]);
    if (parsed && parsed > 0) return parsed;
  }

  const atPriceMatch = segment.match(/@\s*([0-9][0-9.,\s]*k?)/i);
  if (atPriceMatch?.[1]) {
    const parsedAtPrice = parseCurrencyAmount(atPriceMatch[1]);
    if (parsedAtPrice && parsedAtPrice > 0) {
      return parsedAtPrice * Math.max(1, quantity);
    }
  }

  // Guardrail: avoid reading arbitrary digits (e.g. "18 pcs ... 2 pcs")
  // as custom add-on price when there is no explicit currency marker.
  const hasExplicitPriceMarker =
    /(?:\brp\b|\bk\b|\bharga\b|\bprice\b)/i.test(segment) ||
    /@|=/.test(segment);
  if (!hasExplicitPriceMarker) return 0;

  const parsedFallback = parseCurrencyAmount(segment);
  if (parsedFallback && parsedFallback > 0) return parsedFallback;

  return 0;
}

function cleanupCustomAddOnSegmentLabel(
  segment: string,
  quantity: number,
): string {
  const withoutPrice = segment
    .replace(/@\s*[0-9][0-9.,\s]*k?/gi, "")
    .replace(/=\s*[0-9][0-9.,\s]*k?\s*$/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const withoutLeadingQty = withoutPrice
    .replace(/^\s*\d{1,4}\s*(?:x\s*)?/i, "")
    .trim();
  const normalizedLabel = cleanupValue(withoutLeadingQty || withoutPrice);
  if (!normalizedLabel) return "";

  return quantity > 1 ? `x${quantity} ${normalizedLabel}` : normalizedLabel;
}

const ADD_ON_ALIASES_BY_CATEGORY: Record<string, Record<string, string>> = {
  Cake: {
    "fondant decoration": "fondant-decor",
    "dekor fondant": "fondant-decor",
    "nama fondant": "fondant-name",
  },
  Cookies: {
    "bubble wrap": "bubblewrap",
    "bubble warp": "bubblewrap",
    "buble wrap": "bubblewrap",
    bublewrap: "bubblewrap",
    "extra bubble wrap": "bubblewrap",
    "custom card": "custom-card",
  },
  Cupcakes: {
    "dark color butter cream": "dark-color-buttercream",
    "dark buttercream": "dark-color-buttercream",
  },
  Buket: {
    "3 bunga": "bouquet-extra-3-flower",
    "+ 3 bunga": "bouquet-extra-3-flower",
    "add 3 bunga": "bouquet-extra-3-flower",
    "additional 3 bunga": "bouquet-extra-3-flower",
    "6 bunga": "bouquet-extra-6-flower",
    "+ 6 bunga": "bouquet-extra-6-flower",
    "add 6 bunga": "bouquet-extra-6-flower",
    "additional 6 bunga": "bouquet-extra-6-flower",
  },
};

function resolveCatalogAddOnBySegment(args: {
  category: string;
  segment: string;
  addOns: CatalogAddOn[];
}): CatalogAddOn | undefined {
  const normalizedSegment = normalizeLabel(args.segment);
  if (!normalizedSegment) return undefined;
  const compactSegment = compactNormalizedLabel(args.segment);

  const aliasMap = ADD_ON_ALIASES_BY_CATEGORY[args.category] ?? {};
  for (const [alias, addOnId] of Object.entries(aliasMap)) {
    const normalizedAlias = normalizeLabel(alias);
    if (!normalizedAlias) continue;
    if (
      normalizedSegment.includes(normalizedAlias) ||
      compactSegment.includes(compactNormalizedLabel(alias))
    ) {
      const matched = args.addOns.find((entry) => entry.id === addOnId);
      if (matched) return matched;
    }
  }

  return args.addOns.find((addOn) => {
    const probes = [addOn.label, addOn.id.replace(/-/g, " ")];

    const directMatch = probes.some((probe) => {
      const normalizedProbe = normalizeLabel(probe);
      if (!normalizedProbe) return false;
      return (
        normalizedSegment.includes(normalizedProbe) ||
        compactSegment.includes(compactNormalizedLabel(probe))
      );
    });
    if (directMatch) return true;

    const idTokens = normalizeLabel(addOn.id.replace(/-/g, " "))
      .split(" ")
      .filter((token) => token.length >= 3);
    if (idTokens.length === 0) return false;
    return idTokens.every((token) => normalizedSegment.includes(token));
  });
}

function detectCategoryAddOnsFromText(args: {
  category: string;
  value: string;
  allowCustomAddOns?: boolean;
  addOnCatalog?: Record<string, CatalogAddOn[]>;
}): {
  addOns: string[];
  addOnQuantities?: Record<string, number>;
  addOnPriceOverrides?: Record<string, number>;
  customAddOns?: Array<{ label: string; price: number }>;
} {
  const text = args.value.trim();
  if (!text) return { addOns: [] };

  const addOnCatalog =
    args.addOnCatalog?.[args.category] ??
    BOOKING_ADD_ON_CATALOG[args.category] ??
    [];
  const addOns = new Set<string>();
  const addOnQuantities: Record<string, number> = {};
  const addOnPriceOverrides: Record<string, number> = {};
  const customAddOns: Array<{ label: string; price: number }> = [];
  const customAddOnKeys = new Set<string>();

  for (const segment of splitAddOnSegments(text)) {
    const quantity = parseAddOnSegmentQuantity(segment);
    const matchedAddOn = resolveCatalogAddOnBySegment({
      category: args.category,
      segment,
      addOns: addOnCatalog,
    });

    if (matchedAddOn) {
      const normalizedQuantity = normalizeMatchedAddOnQuantity({
        category: args.category,
        addOnId: matchedAddOn.id,
        segment,
        parsedQuantity: quantity,
      });
      addOns.add(matchedAddOn.id);
      if (normalizedQuantity > 1) {
        addOnQuantities[matchedAddOn.id] = Math.max(
          normalizedQuantity,
          addOnQuantities[matchedAddOn.id] ?? 0,
        );
      }

      const unitPriceMatch = segment.match(/@\s*([0-9][0-9.,\s]*k?)/i);
      const explicitPriceMatch = segment.match(
        /(?:harga|price)\s*[:=-]?\s*([0-9][0-9.,\s]*k?)/i,
      );
      const parsedOverride = parseCurrencyAmount(
        unitPriceMatch?.[1] || explicitPriceMatch?.[1] || "",
      );
      if (parsedOverride && parsedOverride > 0) {
        addOnPriceOverrides[matchedAddOn.id] = parsedOverride;
      }
      continue;
    }

    if (args.allowCustomAddOns !== false) {
      const totalPrice = parseAddOnSegmentTotalPrice(segment, quantity);
      if (totalPrice <= 0) continue;

      const label = cleanupCustomAddOnSegmentLabel(segment, quantity);
      if (!label) continue;

      const key = `${normalizeLabel(label)}::${totalPrice}`;
      if (customAddOnKeys.has(key)) continue;
      customAddOnKeys.add(key);
      customAddOns.push({
        label,
        price: Math.round(totalPrice),
      });
    }
  }

  return {
    addOns: Array.from(addOns),
    addOnQuantities:
      Object.keys(addOnQuantities).length > 0 ? addOnQuantities : undefined,
    addOnPriceOverrides:
      Object.keys(addOnPriceOverrides).length > 0
        ? addOnPriceOverrides
        : undefined,
    customAddOns: customAddOns.length > 0 ? customAddOns : undefined,
  };
}

function findFlavorTokenPosition(
  normalizedText: string,
  token: string,
): number {
  const normalizedToken = normalizeLabel(token);
  if (!normalizedToken) return Number.POSITIVE_INFINITY;

  const pattern = new RegExp(
    `(?:^|\\s)${escapeRegExp(normalizedToken)}(?:\\s|$)`,
    "i",
  );
  const matched = pattern.exec(normalizedText);
  if (!matched) return Number.POSITIVE_INFINITY;
  return matched.index;
}

function detectFlavorOptionByText(
  options: FlavorOption[],
  value: string,
): FlavorOption | undefined {
  const normalized = normalizeLabel(value);
  if (!normalized) return undefined;

  const ranked = options
    .map((option) => {
      const probes = [
        option.label,
        ...(option.aliases ?? []),
        ...(option.shortCodes ?? []),
      ];
      let minPosition = Number.POSITIVE_INFINITY;

      for (const probe of probes) {
        const position = findFlavorTokenPosition(normalized, probe);
        if (position < minPosition) {
          minPosition = position;
        }
      }

      if (!Number.isFinite(minPosition)) {
        return null;
      }

      return {
        option,
        position: minPosition,
      };
    })
    .filter((entry): entry is { option: FlavorOption; position: number } =>
      Boolean(entry),
    )
    .sort((left, right) => left.position - right.position);

  return ranked[0]?.option;
}

function extractCupcakeFlavorSegmentText(
  value: string,
  segment: CupcakeFlavorSegment,
): string {
  const text = value.trim();
  if (!text) return "";

  if (segment === "DOZEN") {
    const matched = text.match(/(?:dozen|lusin)\s*[:=\-]?\s*([^\n|;]+)/i);
    if (!matched?.[1]) return "";
    return matched[1]
      .split(/(?:,|\b(?:indv|individual|individu(?:al)?)\b)/i)[0]
      .trim();
  }

  const matched = text.match(
    /(?:indv|individual|individu(?:al)?)\s*[:=\-]?\s*([^\n|;]+)/i,
  );
  if (!matched?.[1]) return "";

  return matched[1].split(/(?:,|\b(?:dozen|lusin)\b)/i)[0].trim();
}

function detectCakeFlavorOptionByText(
  options: FlavorOption[],
  value: string,
): FlavorOption | undefined {
  const text = String(value || "").trim();
  if (!text) return undefined;

  const contextualCandidates: string[] = [];
  const cakeContextRegex = /\bcake\b\s*[:=\-]?\s*([^\n|;]+)/gi;
  let matched: RegExpExecArray | null;

  while ((matched = cakeContextRegex.exec(text)) !== null) {
    const candidate = cleanupValue(matched[1] || "");
    if (candidate) contextualCandidates.push(candidate);
  }

  for (let index = contextualCandidates.length - 1; index >= 0; index -= 1) {
    const candidate = contextualCandidates[index]
      .split(
        /(?:,|\b(?:cupcakes?|dozen|lusin|indv|individual|individu(?:al)?)\b)/i,
      )[0]
      .trim();
    const detected = detectFlavorOptionByText(options, candidate);
    if (detected) return detected;
  }

  const taggedSegments = text
    .split(/[\n|;,]/)
    .map((segment) => cleanupValue(segment))
    .filter(Boolean);

  for (let index = taggedSegments.length - 1; index >= 0; index -= 1) {
    const segment = taggedSegments[index];
    if (!/\bcake\b/i.test(segment) || /\bcupcakes?\b/i.test(segment)) {
      continue;
    }

    const detected = detectFlavorOptionByText(options, segment);
    if (detected) return detected;
  }

  return undefined;
}

function detectFlavorAddOnIdsForCategory(args: {
  category: string;
  value: string;
  cupcakeSegment?: CupcakeFlavorSegment;
}): string[] {
  const options = getFlavorOptionsByCategory(args.category);
  if (options.length === 0) return [];

  if (args.category === "Cupcakes" && args.cupcakeSegment) {
    const segmentValue = extractCupcakeFlavorSegmentText(
      args.value,
      args.cupcakeSegment,
    );
    const segmentMatch = detectFlavorOptionByText(options, segmentValue);
    if (segmentMatch) return [segmentMatch.id];
  }

  if (args.category === "Cake") {
    const cakeMatch = detectCakeFlavorOptionByText(options, args.value);
    if (cakeMatch) return [cakeMatch.id];
  }

  const fallbackMatch = detectFlavorOptionByText(options, args.value);
  if (!fallbackMatch) return [];
  return [fallbackMatch.id];
}

function resolveDarkButtercreamColors(value: string): string[] {
  const normalized = normalizeLabel(value);
  if (!normalized) return [];

  const withPosition = DARK_BUTTERCREAM_COLOR_CANDIDATES.map((candidate) => {
    let firstMatchPosition = Number.POSITIVE_INFINITY;

    for (const alias of candidate.aliases) {
      const position = normalized.indexOf(normalizeLabel(alias));
      if (position >= 0 && position < firstMatchPosition) {
        firstMatchPosition = position;
      }
    }

    if (!Number.isFinite(firstMatchPosition)) {
      return null;
    }

    return {
      label: candidate.label,
      position: firstMatchPosition,
    };
  })
    .filter((entry): entry is { label: string; position: number } =>
      Boolean(entry),
    )
    .sort((left, right) => left.position - right.position);

  return withPosition.slice(0, 3).map((entry) => entry.label);
}

function resolveDarkButtercreamColor(value: string): string | undefined {
  return resolveDarkButtercreamColors(value)[0];
}

function detectCupcakeDarkColorButtercream(value: string): {
  addOns: string[];
  darkColorButtercreamColors?: string[];
  darkColorButtercreamColor?: string;
} {
  const normalized = normalizeLabel(value);
  if (!normalized) {
    return { addOns: [] };
  }

  const detectedColors = resolveDarkButtercreamColors(value);

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

  // Some customer templates list explicit cupcake colors without writing
  // "dark color buttercream". If dark palette colors are recognized,
  // auto-enable the add-on so the parsed checkbox state is correct.
  if (!hasDarkColorButtercream && detectedColors.length === 0) {
    return { addOns: [] };
  }

  return {
    addOns: [DARK_COLOR_BUTTERCREAM_ADDON_ID],
    darkColorButtercreamColors: detectedColors,
    darkColorButtercreamColor:
      detectedColors[0] || resolveDarkButtercreamColor(value),
  };
}

function detectCakeAddOnsFromText(value: string): {
  addOns: string[];
  addOnQuantities?: Record<string, number>;
  addOnPriceOverrides?: Record<string, number>;
  customAddOns?: Array<{ label: string; price: number }>;
} {
  const normalized = normalizeLabel(value);
  if (!normalized) return { addOns: [] };

  const addOns = new Set<string>();
  const addOnQuantities: Record<string, number> = {};
  const addOnPriceOverrides: Record<string, number> = {};
  const customAddOns: Array<{ label: string; price: number }> = [];
  const customAddOnKeys = new Set<string>();

  const knownAddOnKeywordGroups: string[][] = [
    ["large cookies", "large cookie", "cookies large"],
    ["medium cookies", "medium cookie", "cookies medium"],
    ["small cookies", "small cookie", "cookies small"],
    ["fondant decor", "fondant decoration", "dekor fondant"],
    ["fondant name", "nama fondant"],
    ["dark color"],
  ];

  const isKnownAddOnSegment = (segment: string): boolean => {
    const normalizedSegment = normalizeLabel(segment);
    if (!normalizedSegment) return false;
    return knownAddOnKeywordGroups.some((group) =>
      group.some((keyword) =>
        normalizedSegment.includes(normalizeLabel(keyword)),
      ),
    );
  };

  const parseSegmentQuantity = (segment: string): number => {
    const match = segment.match(/^\s*(\d{1,4})\b/);
    const quantity = Number(match?.[1] || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) return 1;
    return Math.round(quantity);
  };

  const parseSegmentTotalPrice = (
    segment: string,
    quantity: number,
  ): number => {
    const equalMatch = segment.match(/=\s*([0-9][0-9.,\s]*k?)\s*$/i);
    if (equalMatch?.[1]) {
      const parsed = parseCurrencyAmount(equalMatch[1]);
      if (parsed && parsed > 0) return parsed;
    }

    const atPriceMatch = segment.match(/@\s*([0-9][0-9.,\s]*k?)/i);
    if (atPriceMatch?.[1]) {
      const parsedAtPrice = parseCurrencyAmount(atPriceMatch[1]);
      if (parsedAtPrice && parsedAtPrice > 0) {
        return parsedAtPrice * Math.max(1, quantity);
      }
    }

    // Guardrail: do not treat arbitrary digits (e.g. d16t15, umur 1)
    // as a custom add-on price without explicit currency markers.
    const hasExplicitPriceMarker =
      /(?:\brp\b|\bk\b|\bharga\b|\bprice\b)/i.test(segment) ||
      /@|=/.test(segment);
    if (!hasExplicitPriceMarker) return 0;

    const parsedFallback = parseCurrencyAmount(segment);
    if (parsedFallback && parsedFallback > 0) return parsedFallback;

    return 0;
  };

  const cleanupCustomAddOnLabel = (
    segment: string,
    quantity: number,
  ): string => {
    const withoutPrice = segment
      .replace(/@\s*[0-9][0-9.,\s]*k?/gi, "")
      .replace(/=\s*[0-9][0-9.,\s]*k?\s*$/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    const withoutLeadingQty = withoutPrice
      .replace(/^\s*\d{1,4}\s*(?:x\s*)?/i, "")
      .trim();
    const normalizedLabel = cleanupValue(withoutLeadingQty || withoutPrice);
    if (!normalizedLabel) return "";

    return quantity > 1 ? `x${quantity} ${normalizedLabel}` : normalizedLabel;
  };

  const extractPriceOverrideForKeywords = (
    keywords: string[],
  ): number | null => {
    const segments = value
      .split(/\n|\||•|;/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    for (const segment of segments) {
      const normalizedSegment = normalizeLabel(segment);
      const hasKeyword = keywords.some((keyword) =>
        normalizedSegment.includes(normalizeLabel(keyword)),
      );
      if (!hasKeyword) continue;

      const atPriceMatch = segment.match(/@\s*([0-9][0-9.,\s]*k?)/i);
      if (atPriceMatch?.[1]) {
        const parsedAtPrice = parseCurrencyAmount(atPriceMatch[1]);
        if (parsedAtPrice && parsedAtPrice > 0) {
          return parsedAtPrice;
        }
      }

      const explicitPriceMatch = segment.match(
        /(?:harga|price)\s*[:=-]?\s*([0-9][0-9.,\s]*k?)/i,
      );
      if (explicitPriceMatch?.[1]) {
        const parsedExplicitPrice = parseCurrencyAmount(explicitPriceMatch[1]);
        if (parsedExplicitPrice && parsedExplicitPrice > 0) {
          return parsedExplicitPrice;
        }
      }
    }

    return null;
  };

  const tryAssignCookieAddOn = (args: {
    addOnId: string;
    keywords: string[];
  }) => {
    const quantity = extractQuantityForKeywords(value, args.keywords);
    const hasKeyword = args.keywords.some((keyword) =>
      normalized.includes(normalizeLabel(keyword)),
    );

    if (!hasKeyword && !quantity) return;
    addOns.add(args.addOnId);
    if (quantity && quantity > 0) {
      addOnQuantities[args.addOnId] = quantity;
    }
    const overridePrice = extractPriceOverrideForKeywords(args.keywords);
    if (overridePrice && overridePrice > 0) {
      addOnPriceOverrides[args.addOnId] = overridePrice;
    }
  };

  tryAssignCookieAddOn({
    addOnId: "large-cookies",
    keywords: ["large cookies", "large cookie", "cookies large"],
  });
  tryAssignCookieAddOn({
    addOnId: "medium-cookies",
    keywords: ["medium cookies", "medium cookie", "cookies medium"],
  });
  tryAssignCookieAddOn({
    addOnId: "small-cookies",
    keywords: ["small cookies", "small cookie", "cookies small"],
  });
  if (
    normalized.includes("fondant decor") ||
    normalized.includes("fondant decoration") ||
    normalized.includes("dekor fondant")
  ) {
    addOns.add("fondant-decor");
  }

  if (
    normalized.includes("fondant name") ||
    normalized.includes("nama fondant")
  ) {
    addOns.add("fondant-name");
  }

  if (normalized.includes("dark color")) {
    addOns.add("dark-color");
  }

  const segments = value
    .split(/\n|\||•|;/)
    .map((entry) => entry.replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").trim())
    .filter((entry) => entry.length > 0);

  for (const segment of segments) {
    if (isKnownAddOnSegment(segment)) continue;

    const quantity = parseSegmentQuantity(segment);
    const totalPrice = parseSegmentTotalPrice(segment, quantity);
    if (totalPrice <= 0) continue;

    const label = cleanupCustomAddOnLabel(segment, quantity);
    if (!label) continue;

    const key = `${normalizeLabel(label)}::${totalPrice}`;
    if (customAddOnKeys.has(key)) continue;
    customAddOnKeys.add(key);
    customAddOns.push({
      label,
      price: Math.round(totalPrice),
    });
  }

  return {
    addOns: Array.from(addOns),
    addOnQuantities:
      Object.keys(addOnQuantities).length > 0 ? addOnQuantities : undefined,
    addOnPriceOverrides:
      Object.keys(addOnPriceOverrides).length > 0
        ? addOnPriceOverrides
        : undefined,
    customAddOns: customAddOns.length > 0 ? customAddOns : undefined,
  };
}

function extractPositiveInteger(value: string): number | null {
  const match = value.match(/\d+/);
  if (!match) return null;
  const parsed = Number(match[0]);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}
function extractBouquetIsiQuantity(value: string): number | null {
  const text = String(value || "").trim();
  if (!text) return null;

  const match = text.match(/\bisi\s*(\d{1,3})\b/i);
  if (!match?.[1]) return null;

  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.max(1, Math.round(parsed));
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

function extractBouquetCookiePriceHint(value: string): number | null {
  const text = value.trim();
  if (!text) return null;

  const normalized = normalizeLabel(text);
  if (!normalized) return null;

  const hasCookiePriceKeyword =
    normalized.includes("harga cookie") || normalized.includes("cookie price");
  if (hasCookiePriceKeyword) {
    const matched = text.match(
      /(?:harga\s*cookies?|cookie\s*price)(?:\s*\/\s*(?:pcs?|pc|piece))?\s*[:=-]?\s*([^\n|;]+)/i,
    );
    if (matched?.[1]) {
      return parseCurrencyAmount(matched[1]);
    }
  }

  const hasCurrencyMarker = /\brp\b|\bk\b/i.test(text);
  if (!hasCurrencyMarker) return null;
  return parseCurrencyAmount(text);
}

function parseSignedCurrencyAmount(value: string): number | null {
  const text = value.trim();
  if (!text) return null;

  const amount = parseCurrencyAmount(text);
  if (amount === null) return null;

  const isNegative = /^\s*-\s*/.test(text) || /\(\s*-\s*/.test(text);
  return isNegative ? -amount : amount;
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
  return /\b(dozen|lusin)\b/i.test(normalized);
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
      fallbackQuantity:
        fromOrder.fallbackQuantity || fromDetail.fallbackQuantity,
    };
  }

  return merged;
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

function chooseCatalogSelection(
  parsed: ParsedWhatsAppOrder,
  catalogContext?: BookingParserCatalogContext,
): {
  category: string;
  subcategory: string;
  productName: string;
  size: string;
} {
  const category = getCategoryByOrderType(parsed.orderType);
  const productCatalog =
    catalogContext?.productCatalog ?? BOOKING_PRODUCT_CATALOG;
  const fallback = getDefaultCatalogSelectionFromCatalog(
    productCatalog,
    category,
  );
  const searchSource = [parsed.common.order, ...Object.values(parsed.details)]
    .filter(Boolean)
    .join(" ");
  const suggested = suggestCatalogSelectionFromCatalog(
    productCatalog,
    category,
    expandCatalogSearchSource(category, searchSource),
  );
  return ensureCatalogSelectionFromCatalog(productCatalog, {
    category: suggested.category || fallback.category,
    subcategory: suggested.subcategory || fallback.subcategory,
    productName: suggested.productName || fallback.productName,
    size: suggested.size || fallback.size,
  });
}

function chooseCatalogSelectionByText(
  category: string,
  searchSource: string,
  catalogContext?: BookingParserCatalogContext,
): {
  category: string;
  subcategory: string;
  productName: string;
  size: string;
} {
  const productCatalog =
    catalogContext?.productCatalog ?? BOOKING_PRODUCT_CATALOG;
  const fallback = getDefaultCatalogSelectionFromCatalog(
    productCatalog,
    category,
  );
  const suggested = suggestCatalogSelectionFromCatalog(
    productCatalog,
    category,
    expandCatalogSearchSource(category, searchSource),
  );

  return ensureCatalogSelectionFromCatalog(productCatalog, {
    category: suggested.category || fallback.category,
    subcategory: suggested.subcategory || fallback.subcategory,
    productName: suggested.productName || fallback.productName,
    size: suggested.size || fallback.size,
  });
}

function extractOrderQuantity(value: string): number | null {
  const text = value.trim();
  if (!text) return null;

  const parseMatchedQuantity = (matched: RegExpMatchArray | null) => {
    const rawQuantity = matched?.[1];
    if (!rawQuantity) return null;

    const quantity = Number(rawQuantity);
    if (Number.isInteger(quantity) && quantity > 0) {
      return quantity;
    }

    return null;
  };

  const bouquetContextual = parseMatchedQuantity(
    text.match(
      /(?:hbq|sbq|hand\s*bouquet|standing\s*bouquet|standing\s*bucket|bucket|bouquet|buket)\b(?:\s+(?:qty|jumlah|x))?\s*[:=\-]?\s*(\d{1,4})\b/i,
    ),
  );
  if (bouquetContextual) return bouquetContextual;

  const explicitContextual = parseMatchedQuantity(
    text.match(
      /(?:qty|quantity|jumlah|order|pesan|x)\s*(?:cookies?|cookie|bunga|bouquet|buket|hbq|sbq|pcs?|pc|box|pack|pkt|paket|dozen|lusin)?\s*[:=\-]?\s*(\d{1,4})\b/i,
    ),
  );
  if (explicitContextual) return explicitContextual;

  const explicit = text.match(
    /(?:qty|jumlah|order|pesan|x)\s*[:=\-]?\s*(\d{1,4})\b/i,
  );
  const explicitQuantity = parseMatchedQuantity(explicit);
  if (explicitQuantity) return explicitQuantity;

  const withUnit = text.match(
    /\b(\d{1,4})\s*(box|pack|pkt|paket|pcs|pc|dozen|lusin)\b/i,
  );
  const unitQuantity = parseMatchedQuantity(withUnit);
  if (unitQuantity) return unitQuantity;

  return null;
}

function extractSeasonalPacketCookieQuantity(value: string): number | null {
  const text = String(value || "").trim();
  if (!text) return null;

  const packetMatches = Array.from(
    text.matchAll(
      /(\d{1,4})\s*(?:pkt|pack|paket)\s*(?:sharing\s*box\s*isi\s*(\d{1,3})|(?:bites?\s*nastar|lotus\s*box|dimsum\s*box|character\s*box|bauble|3\s*in\s*1|bites?\s*box))/gi,
    ),
  );

  if (packetMatches.length === 0) return null;

  let total = 0;
  for (const match of packetMatches) {
    const packCount = Number(match[1] || 0);
    if (!Number.isFinite(packCount) || packCount <= 0) continue;
    total += packCount;
  }

  return total > 0 ? Math.round(total) : null;
}

function extractSeasonalPacketCookieEntries(
  value: string,
): Array<{ quantity: number; keyword: string }> {
  const text = String(value || "").trim();
  if (!text) return [];

  const matches = Array.from(
    text.matchAll(
      /(\d{1,4})\s*(?:pkt|pack|paket)\s*(sharing\s*box\s*isi\s*\d{1,3}|bites?\s*nastar|lotus\s*box|dimsum\s*box|character\s*box|bauble|3\s*in\s*1|bites?\s*box)\b/gi,
    ),
  );

  return matches
    .map((match) => {
      const quantity = Number(match[1] || 0);
      const keyword = cleanupValue(match[2] || "");
      if (!Number.isFinite(quantity) || quantity <= 0 || !keyword) {
        return null;
      }
      return {
        quantity: Math.round(quantity),
        keyword,
      };
    })
    .filter((entry): entry is { quantity: number; keyword: string } =>
      Boolean(entry),
    );
}

// Fungsi untuk memilih dan menentukan kuantitas order berdasarkan hasil parsing chat
function chooseQuantity(parsed: ParsedWhatsAppOrder): number {
  // Blok penentu jika order bertipe cake atau cookies tower maka default kuantitasnya 1
  if (parsed.orderType === "cake" || parsed.orderType === "cookies_tower") {
    // Kembalikan nilai default kuantitas 1
    return 1;
  }

  // Blok penentu khusus jika order bertipe cookies untuk mem-parse field cookieCount
  if (parsed.orderType === "cookies") {
    // Ekstrak nilai bilangan bulat positif dari field cookieCount hasil parsing
    const cookieCount = extractPositiveInteger(
      // Ambil nilai dari properti cookieCount, gunakan string kosong jika undefined
      parsed.details.cookieCount ?? "",
    );
    // Jika nilai cookieCount berhasil diekstrak dan valid (lebih besar dari 0)
    if (cookieCount && cookieCount > 0) {
      // Kembalikan nilai kuantitas cookies yang didapat
      return cookieCount;
    }
  }

  // Blok penentu kuantitas khusus jika tipe order adalah buket
  if (parsed.orderType === "buket") {
    // Ambil string nama produk order untuk pengecekan kata kunci tambahan
    const orderText = parsed.common.order ?? "";
    // Cari kuantitas berdasarkan kata kunci buket yang sering dipakai
    const bouquetOrderCount =
      // Jalankan fungsi pencarian kuantitas berbasis kata kunci
      extractQuantityForKeywords(orderText, [
        "hbq",
        "sbq",
        "hand bouquet",
        "standing bouquet",
        "standing bucket",
        "bucket",
        "bouquet",
        "buket",
      ]) ?? extractOrderQuantity(orderText); // Gunakan ekstraksi kuantitas order umum jika tidak ketemu

    // Kembalikan kuantitas buket dari order atau fallback ke nilai 1
    return bouquetOrderCount ?? 1;
  }

  // Blok penentu kuantitas khusus jika tipe order adalah cupcakes
  if (parsed.orderType === "cupcakes") {
    // Dapatkan rincian kuantitas cupcakes (satuan/lusin) dari helper fungsi
    const quantityInfo = resolveCupcakeQuantityBreakdown(parsed);

    // Jika memiliki kuantitas satuan dan tidak memesan lusinan
    if (quantityInfo.individualCount > 0 && quantityInfo.dozenCount === 0) {
      // Kembalikan jumlah cupcakes satuan
      return quantityInfo.individualCount;
    }
    // Jika memiliki kuantitas lusinan dan tidak memesan satuan
    if (quantityInfo.dozenCount > 0 && quantityInfo.individualCount === 0) {
      // Kembalikan jumlah cupcakes lusinan
      return quantityInfo.dozenCount;
    }
    // Jika terdapat kuantitas fallback yang valid
    if (quantityInfo.fallbackQuantity) {
      // Kembalikan kuantitas fallback tersebut
      return quantityInfo.fallbackQuantity;
    }

    // Fallback utama kuantitas cupcake jika tidak terdeteksi adalah 1
    return 1;
  }

  // Fallback akhir untuk semua tipe order dengan mengekstrak kuantitas dari kolom order umum, default ke 1
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

  const cookiePriceHint = extractBouquetCookiePriceHint(value);
  const inferredFromPrice =
    inferTokenDifficultyFromCookiePrice(cookiePriceHint);
  if (inferredFromPrice) {
    return inferredFromPrice;
  }

  return undefined;
}

function expandCatalogSearchSource(category: string, rawValue: string): string {
  const source = cleanupValue(rawValue);
  if (!source) return "";

  if (category === "Buket") {
    const normalized = normalizeLabel(source);
    const hints: string[] = [];

    if (
      normalized.includes("hbq") ||
      normalized.includes("hand bouquet") ||
      normalized.includes("handbq")
    ) {
      hints.push("hand bouquet");
    }

    if (
      normalized.includes("sbq") ||
      normalized.includes("standing bouquet") ||
      normalized.includes("standingbq")
    ) {
      hints.push("standing bouquet");
    }

    if (hints.length > 0) {
      return [source, ...hints].join(" | ");
    }

    return source;
  }

  if (category !== "Cake") {
    return source;
  }

  const sizeMatch = source.match(/\bd\s*(\d{1,2})\s*t\s*(\d{1,2})\b/i);
  if (!sizeMatch?.[1] || !sizeMatch?.[2]) {
    return source;
  }

  const diameter = Number(sizeMatch[1]);
  const height = Number(sizeMatch[2]);
  if (
    !Number.isInteger(diameter) ||
    diameter <= 0 ||
    !Number.isInteger(height) ||
    height <= 0
  ) {
    return source;
  }

  const sizeHints = [
    `diameter ${diameter}`,
    `tinggi ${height} cm`,
    height >= 15 ? "tall cake" : "cake tinggi 10 cm",
  ];

  return [source, ...sizeHints].join(" | ");
}

function buildSpecialNotesFromParsed(parsed: ParsedWhatsAppOrder): string {
  const notes: string[] = [];

  const cookiesNotes = cleanupValue(
    getDetailsForOrderType(parsed, "cookies").toFromNotes ?? "",
  );
  if (cookiesNotes) {
    notes.push(`To From Notes: ${cookiesNotes}`);
  }

  const bouquetGreetingCard = cleanupValue(
    getDetailsForOrderType(parsed, "buket").greetingCard ?? "",
  );
  if (bouquetGreetingCard) {
    notes.push(`Kartu ucapan: ${bouquetGreetingCard}`);
  }

  return notes.join("\n").slice(0, 800);
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
      `(\\d{1,4})\\s*(?:x\\s*)?(?:pcs?|pc|box|pack|pkt|paket|dozen|lusin)?\\s*(?:${keywordPattern})\\b`,
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

function extractSingleCakeSizeCode(value: string): string | undefined {
  const text = value.trim();
  if (!text) return undefined;

  const hasTwoTierMarker =
    /\b(top|bottom)\b/i.test(text) ||
    /\+/.test(text) ||
    /\btwo\s*tier\b/i.test(text);
  if (hasTwoTierMarker) return undefined;

  const matches = Array.from(
    text.matchAll(/\bd\s*(\d{1,2})\s*[-x\/]?\s*t\s*(\d{1,2})\b/gi),
  );
  if (!matches.length) return undefined;

  const first = matches[0];
  const diameter = Number(first?.[1]);
  const height = Number(first?.[2]);
  if (!Number.isInteger(diameter) || !Number.isInteger(height)) {
    return undefined;
  }

  return `D${diameter}-T${height}`;
}

function inferOneTierCakeVariantFromLooseSize(value: string): string | undefined {
  const strictCode = extractSingleCakeSizeCode(value);
  if (strictCode) return strictCode;

  const normalized = normalizeLabel(value);
  if (!normalized) return undefined;

  const centimeterNumbers = Array.from(
    value.matchAll(/\b(\d{2})\s*cm\b/gi),
  ).map((match) => Number(match[1]));
  if (centimeterNumbers.length === 0) return undefined;

  const diameter = centimeterNumbers[0];
  if (![14, 16, 18, 20].includes(diameter)) return undefined;

  const explicitHeight = centimeterNumbers.find((entry, index) => {
    if (index === 0) return false;
    return [10, 15].includes(entry);
  });
  const inferredHeight =
    explicitHeight ??
    (/\btall\b|\btinggi\s*15\b|\bt15\b/i.test(normalized) ? 15 : 10);

  if (![10, 15].includes(inferredHeight)) return undefined;
  return `D${diameter}-T${inferredHeight}`;
}

function resolveGenericRecapCakeSelection(args: {
  productName: string;
  size: string;
  designNotes: string;
  catalogContext?: BookingParserCatalogContext;
}):
  | {
      category: string;
      subcategory: string;
      productName: string;
      size: string;
    }
  | null {
  const normalizedProductName = normalizeLabel(args.productName);
  if (
    normalizedProductName &&
    normalizedProductName !== "custom cake" &&
    normalizedProductName !== "cake"
  ) {
    return null;
  }

  const inferredSize = inferOneTierCakeVariantFromLooseSize(
    [args.size, args.designNotes, args.productName].filter(Boolean).join(" "),
  );
  if (!inferredSize) return null;

  const normalizedSource = normalizeLabel(
    [args.productName, args.size, args.designNotes].filter(Boolean).join(" "),
  );
  const isDummyCake = normalizedSource.includes("dummy");

  return ensureCatalogSelectionFromCatalog(
    args.catalogContext?.productCatalog ?? BOOKING_PRODUCT_CATALOG,
    {
      category: "Cake",
      subcategory: "One Tier Cake",
      productName: isDummyCake ? "Dummy Cake" : "Real Cake",
      size: inferredSize,
    },
  );
}

function createAutoFillItemFromCategory(args: {
  category: string;
  searchSource: string;
  quantity: number;
  notes: string;
  cookiePrice?: number;
  addOnSource?: string;
  cookieDesignCount?: number;
  catalogContext?: BookingParserCatalogContext;
}): BookingAutoFillItem {
  let catalog = chooseCatalogSelectionByText(
    args.category,
    args.searchSource,
    args.catalogContext,
  );

  if (catalog.category === "Cake") {
    const forcedSize = extractSingleCakeSizeCode(
      `${args.searchSource || ""} ${args.notes || ""}`,
    );
    if (forcedSize) {
      const source = normalizeLabel(
        `${args.searchSource || ""} ${args.notes || ""}`,
      );
      const isDummy = source.includes("dummy");
      catalog = ensureCatalogSelectionFromCatalog(
        args.catalogContext?.productCatalog ?? BOOKING_PRODUCT_CATALOG,
        {
          category: "Cake",
          subcategory: "One Tier Cake",
          productName: isDummy ? "Dummy Cake" : "Real Cake",
          size: forcedSize,
        },
      );
    }
  }

  const cookiePrice =
    catalog.category === "Buket" && Number(args.cookiePrice) > 0
      ? normalizeCookiePriceAmount(Number(args.cookiePrice))
      : undefined;
  const inferredDifficulty = inferTokenDifficultyFromText(args.searchSource);
  const tokenDifficulty =
    catalog.category === "Cookies"
      ? (inferredDifficulty ?? "SIMPLE")
      : undefined;
  const designCount =
    catalog.category === "Cookies" && Number(args.cookieDesignCount) > 0
      ? Math.min(100, Math.round(Number(args.cookieDesignCount)))
      : undefined;
  const additionalDesignCount =
    typeof designCount === "number"
      ? Math.max(0, designCount - COOKIE_INCLUDED_DESIGN_LIMIT)
      : undefined;
  const flavorAddOns = detectFlavorAddOnIdsForCategory({
    category: catalog.category,
    value: `${args.searchSource || ""} ${args.notes || ""}`,
  });
  const cupcakeDarkColor =
    catalog.category === "Cupcakes"
      ? detectCupcakeDarkColorButtercream(
          `${args.searchSource || ""} ${args.notes || ""}`,
        )
      : {
          addOns: [] as string[],
          darkColorButtercreamColors: [] as string[],
          darkColorButtercreamColor: undefined,
        };
  const addOnSource =
    `${args.addOnSource || ""}`.trim() ||
    `${args.searchSource || ""} ${args.notes || ""}`;
  const hasExplicitAddOnSource = `${args.addOnSource || ""}`.trim().length > 0;
  const categoryAddOns = detectCategoryAddOnsFromText({
    category: catalog.category,
    value: addOnSource,
    allowCustomAddOns: hasExplicitAddOnSource,
    addOnCatalog: args.catalogContext?.addOnCatalog,
  });
  const cakeAddOns =
    catalog.category === "Cake"
      ? detectCakeAddOnsFromText(addOnSource)
      : {
          addOns: [] as string[],
          addOnQuantities: undefined,
          addOnPriceOverrides: undefined,
          customAddOns: undefined,
        };

  const mergedAddOnQuantities = {
    ...(categoryAddOns.addOnQuantities ?? {}),
    ...(cakeAddOns.addOnQuantities ?? {}),
  };
  const mergedAddOnPriceOverrides = {
    ...(categoryAddOns.addOnPriceOverrides ?? {}),
    ...(cakeAddOns.addOnPriceOverrides ?? {}),
  };
  const mergedCustomAddOns = Array.from(
    new Map(
      [
        ...(categoryAddOns.customAddOns ?? []),
        ...(cakeAddOns.customAddOns ?? []),
      ].map((entry) => [
        `${normalizeLabel(entry.label)}::${Math.round(entry.price || 0)}`,
        {
          label: cleanupValue(entry.label),
          price: Math.round(entry.price || 0),
        },
      ]),
    ).values(),
  ).filter((entry) => entry.label && entry.price > 0);

  return {
    category: catalog.category,
    subcategory: catalog.subcategory,
    productName: catalog.productName,
    size: catalog.size,
    quantity: toPositiveQuantity(args.quantity),
    tokenDifficulty,
    cookiePrice,
    designCount,
    additionalDesignCount,
    addOns: mergeUniqueAddOnIds(
      flavorAddOns,
      cupcakeDarkColor.addOns,
      categoryAddOns.addOns,
      cakeAddOns.addOns,
    ),
    addOnQuantities:
      Object.keys(mergedAddOnQuantities).length > 0
        ? mergedAddOnQuantities
        : undefined,
    addOnPriceOverrides:
      Object.keys(mergedAddOnPriceOverrides).length > 0
        ? mergedAddOnPriceOverrides
        : undefined,
    customAddOns:
      mergedCustomAddOns.length > 0 ? mergedCustomAddOns : undefined,
    darkColorButtercreamColors: cupcakeDarkColor.darkColorButtercreamColors,
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
      darkColorButtercreamColors: Array.from(
        new Set([
          ...(existing.darkColorButtercreamColors ?? []),
          ...(item.darkColorButtercreamColors ?? []),
        ]),
      ).slice(0, 3),
      darkColorButtercreamColor: (Array.from(
        new Set([
          ...(existing.darkColorButtercreamColors ?? []),
          ...(item.darkColorButtercreamColors ?? []),
          ...(existing.darkColorButtercreamColor
            ? [existing.darkColorButtercreamColor]
            : []),
          ...(item.darkColorButtercreamColor
            ? [item.darkColorButtercreamColor]
            : []),
        ]),
      )[0] || undefined) as string | undefined,
      tokenDifficulty: existing.tokenDifficulty || item.tokenDifficulty,
      cookiePrice: existing.cookiePrice ?? item.cookiePrice,
      designCount:
        Math.max(
          Number(existing.designCount || 0),
          Number(item.designCount || 0),
        ) || undefined,
      additionalDesignCount:
        Math.max(
          Number(existing.additionalDesignCount || 0),
          Number(item.additionalDesignCount || 0),
        ) || undefined,
      addOnQuantities: (() => {
        const merged: Record<string, number> = {
          ...(existing.addOnQuantities ?? {}),
        };
        Object.entries(item.addOnQuantities ?? {}).forEach(([id, qty]) => {
          const parsedQty = Math.max(1, Math.round(Number(qty) || 1));
          merged[id] = Math.max(merged[id] ?? 0, parsedQty);
        });
        return Object.keys(merged).length > 0 ? merged : undefined;
      })(),
      addOnPriceOverrides: (() => {
        const merged: Record<string, number> = {
          ...(existing.addOnPriceOverrides ?? {}),
        };
        Object.entries(item.addOnPriceOverrides ?? {}).forEach(
          ([id, price]) => {
            const parsedPrice = Math.round(Number(price) || 0);
            if (parsedPrice > 0) {
              merged[id] = parsedPrice;
            }
          },
        );
        return Object.keys(merged).length > 0 ? merged : undefined;
      })(),
      notes: existing.notes || item.notes,
    });
  }

  return Array.from(byKey.values());
}

function buildRecapAutoFillItems(
  parsed: ParsedWhatsAppOrder,
  catalogContext?: BookingParserCatalogContext,
): BookingAutoFillItem[] {
  const recapItems = parsed.orderRecap?.items ?? [];

  return recapItems.flatMap((item) => {
    const resolvedCategory =
      normalizeRecapCategory(item.category) ||
      normalizeRecapCategory(item.productName) ||
      getCategoryByOrderType(parsed.orderType);
    if (!resolvedCategory) return [];

    const orderType = mapCategoryToOrderType(resolvedCategory);
    const itemSpecificSearchSource = [
      resolvedCategory,
      item.productName,
      item.size,
      item.designNotes,
      item.addOn,
    ]
      .filter(Boolean)
      .join(" | ");
    const searchSource =
      itemSpecificSearchSource ||
      buildSearchSourceForOrderType(parsed, orderType, "");
    const orderTypeDetails = getDetailsForOrderType(parsed, orderType);
    const noteParts =
      orderType === "cake"
        ? [cleanupValue(orderTypeDetails.cakeDesign || ""), item.designNotes]
        : orderType === "cookies"
          ? [buildItemNotesForOrderType(parsed, orderType)]
          : [
              item.designNotes ? `Design/Notes: ${item.designNotes}` : "",
              buildItemNotesForOrderType(parsed, orderType),
            ];
    const notes = noteParts
      .filter(Boolean)
      .filter(
        (value, index, array) =>
          array.findIndex(
            (entry) => normalizeLabel(entry) === normalizeLabel(value),
          ) === index,
      )
      .join(" | ")
      .slice(0, 400);
    const autoFillItem = createAutoFillItemFromCategory({
      category: resolvedCategory,
      searchSource,
      quantity: item.quantity,
      notes,
      addOnSource: item.addOn,
      catalogContext,
    });
    const recapCakeSelection =
      resolvedCategory === "Cake"
        ? resolveGenericRecapCakeSelection({
            productName: item.productName,
            size: item.size,
            designNotes: item.designNotes,
            catalogContext,
          })
        : null;

    return [
      {
        ...autoFillItem,
        ...(recapCakeSelection ?? {}),
        parsedUnitPrice: item.unitPrice,
        parsedSubtotal: item.subtotal,
        pricingSource:
          Number(item.subtotal || 0) > 0 || Number(item.unitPrice || 0) > 0
            ? "RECAP"
            : undefined,
        cookieDifficultyBreakdown:
          orderType === "cookies"
            ? (() => {
                const matched = String(item.designNotes || "").match(
                  /(?:^|\|)\s*Breakdown:\s*([^|]+)/i,
                );
                return cleanupValue(matched?.[1] || "") || undefined;
              })()
            : undefined,
      } satisfies BookingAutoFillItem,
    ];
  });
}

function buildMixedSupplementAutoFillItems(
  parsed: ParsedWhatsAppOrder,
  itemNotes: string,
  options?: {
    forceSeasonalEventMode?: boolean;
    catalogContext?: BookingParserCatalogContext;
  },
): BookingAutoFillItem[] {
  const orderText = parsed.common.order || "";
  const rawText = parsed.rawText || "";
  const forceSeasonalEventMode = Boolean(options?.forceSeasonalEventMode);

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
    /(buket|bouquet|hbq|sbq)/i.test(orderText) ||
    /\bwarna\s+kertas\s+bouquet\b|\bwarna\s+kertas\s+buket\b|\bisi\s+bouquet\b|\bisi\s+buket\b|\bwarna\s+bunga\b|\bkartu\s+ucapan\b|\bharga\s+cookie\b|\bharga\s+cookies\b|\bcookie\s+price\b|\bhand\s+bouquet\b|\bstanding\s+bouquet\b|\bhbq\b|\bsbq\b|\bdata\s+buket\b/i.test(
      rawText,
    );
  const hasCookiesMarker = /\bto\s+from\s+notes\b|\bdata\s+cookies\b/i.test(
    rawText,
  );
  const hasCookiesEventMarker =
    /\bbites?\s*nastar\b|\blotus\s*box\b|\bdimsum\s*box\b|\bcharacter\s*box\b|\bsharing\s*box\b|\bbauble\b|\b3\s*in\s*1\b|\bbites?\s*box\b/i.test(
      `${orderText} ${rawText}`,
    );

  if (!orderText.trim() && !rawText.trim()) return [];

  const primaryCategory = getCategoryByOrderType(parsed.orderType);
  const supplements: BookingAutoFillItem[] = [];

  const pushItem = (
    category: string,
    quantity: number,
    searchSource: string,
    notes: string,
    cookiePrice?: number,
    cookieDesignCount?: number,
  ) => {
    supplements.push(
      createAutoFillItemFromCategory({
        category,
        quantity,
        searchSource,
        notes,
        cookiePrice,
        cookieDesignCount,
        catalogContext: options?.catalogContext,
      }),
    );
  };

  const buildSupplementContext = (
    orderType: WhatsAppOrderType,
    fallbackSearchSource: string,
  ) => ({
    notes: buildItemNotesForOrderType(parsed, orderType) || itemNotes,
    searchSource:
      buildSearchSourceForOrderType(parsed, orderType, fallbackSearchSource) ||
      fallbackSearchSource,
  });

  if (primaryCategory !== "Cookies Tower" && hasTowerMarker) {
    const quantity =
      extractQuantityForKeywords(orderText, [
        "cookies tower",
        "cookie tower",
        "tower cookies",
      ]) ?? 1;
    const context = buildSupplementContext(
      "cookies_tower",
      orderText || rawText,
    );
    pushItem("Cookies Tower", quantity, context.searchSource, context.notes);
  }

  if (primaryCategory !== "Cake" && hasCakeMarker) {
    const quantity = extractQuantityForKeywords(orderText, ["cake"]) ?? 1;
    const context = buildSupplementContext("cake", orderText || rawText);
    pushItem("Cake", quantity, context.searchSource, context.notes);
  }

  if (primaryCategory !== "Cupcakes" && hasCupcakeMarker) {
    const breakdown = parseCupcakeQuantityBreakdown([orderText]);
    const dozenContext = buildSupplementContext(
      "cupcakes",
      "cupcakes dozen lusin 12 pcs",
    );
    const individualContext = buildSupplementContext(
      "cupcakes",
      "cupcakes individual indv pcs",
    );
    const fallbackContext = buildSupplementContext(
      "cupcakes",
      orderText || rawText,
    );

    if (breakdown.dozenCount > 0) {
      pushItem(
        "Cupcakes",
        breakdown.dozenCount,
        dozenContext.searchSource,
        dozenContext.notes,
      );
    }

    if (breakdown.individualCount > 0) {
      pushItem(
        "Cupcakes",
        breakdown.individualCount,
        individualContext.searchSource,
        individualContext.notes,
      );
    }

    if (breakdown.dozenCount === 0 && breakdown.individualCount === 0) {
      const quantity =
        extractQuantityForKeywords(orderText, ["cupcakes", "cupcake"]) ??
        breakdown.fallbackQuantity ??
        1;
      pushItem(
        "Cupcakes",
        quantity,
        fallbackContext.searchSource,
        fallbackContext.notes,
      );
    }
  }

  const bouquetCookiePrice = parseCurrencyAmount(
    parsed.details.cookiePrice ?? "",
  );
  if (primaryCategory !== "Buket" && hasBouquetMarker) {
    const quantity =
      extractQuantityForKeywords(orderText, [
        "isi",
        "hbq",
        "sbq",
        "hand bouquet",
        "standing bouquet",
        "buket",
        "bouquet",
      ]) ??
      extractOrderQuantity(orderText) ??
      1;
    const context = buildSupplementContext("buket", orderText || rawText);
    pushItem(
      "Buket",
      quantity,
      context.searchSource,
      context.notes,
      bouquetCookiePrice ?? undefined,
    );
  }

  const orderWithoutTower = orderText.replace(/cookies?\s*tower/gi, " ");
  const orderWithoutTopper = orderWithoutTower.replace(
    /topper\s*cookies?/gi,
    " ",
  );
  const seasonalPacketEntries =
    extractSeasonalPacketCookieEntries(orderWithoutTopper);
  const shouldForceSeasonalEventMode =
    forceSeasonalEventMode || seasonalPacketEntries.length > 0;
  const hasCookiesOnly = /\bcookies?\b/i.test(orderWithoutTopper);
  if (
    (primaryCategory !== "Cookies" || shouldForceSeasonalEventMode) &&
    (hasCookiesOnly ||
      hasCookiesMarker ||
      hasCookiesEventMarker ||
      shouldForceSeasonalEventMode)
  ) {
    const context = buildSupplementContext(
      "cookies",
      orderWithoutTopper || rawText,
    );
    const cookieDesignCount = inferCookieDesignCountFromText(
      getDetailsForOrderType(parsed, "cookies").cookieDesign || "",
    );

    if (seasonalPacketEntries.length > 0) {
      seasonalPacketEntries.forEach((entry) => {
        pushItem(
          "Seasonal Event",
          entry.quantity,
          `event cookies | seasonal | ${entry.keyword}`,
          context.notes,
          undefined,
          cookieDesignCount,
        );
      });
    } else {
      const quantity =
        extractSeasonalPacketCookieQuantity(orderWithoutTopper) ??
        extractQuantityForKeywords(orderWithoutTopper, ["cookies", "cookie"]) ??
        extractOrderQuantity(orderWithoutTopper) ??
        extractPositiveInteger(orderWithoutTopper) ??
        1;
      pushItem(
        "Cookies",
        quantity,
        context.searchSource,
        context.notes,
        undefined,
        cookieDesignCount,
      );
    }
  }

  return mergeAutoFillItems(supplements);
}

function isSeasonalEventPacketTemplate(parsed: ParsedWhatsAppOrder): boolean {
  const orderText = parsed.common.order || "";
  const rawText = parsed.rawText || "";
  const source = `${orderText} ${rawText}`;

  if (!/\b(?:pkt|pack|paket)\b/i.test(source)) return false;

  return /\bbites?\s*nastar\b|\blotus\s*box\b|\bdimsum\s*box\b|\bcharacter\s*box\b|\bsharing\s*box\b|\bbauble\b|\b3\s*in\s*1\b|\bbites?\s*box\b|\bhappy\s+eid\b|\bseasonal\b|\bevent\b/i.test(
    source,
  );
}

function buildDefaultAutoFillItems(
  parsed: ParsedWhatsAppOrder,
  itemNotes: string,
  catalogContext?: BookingParserCatalogContext,
): BookingFormAutoFill["items"] {
  const catalog = chooseCatalogSelection(parsed, catalogContext);
  const quantity = chooseQuantity(parsed);
  const difficultySource = [
    parsed.common.order,
    ...Object.values(parsed.details),
  ]
    .filter(Boolean)
    .join(" ");
  const parsedBouquetCookiePrice =
    parseCurrencyAmount(parsed.details.cookiePrice ?? "") ?? undefined;
  const inferredDifficulty = inferTokenDifficultyFromText(difficultySource);
  const tokenDifficulty =
    catalog.category === "Cookies"
      ? (inferredDifficulty ?? "SIMPLE")
      : undefined;
  const cookieDesignCount =
    catalog.category === "Cookies"
      ? inferCookieDesignCountFromText(parsed.details.cookieDesign ?? "")
      : undefined;
  const cookiePrice =
    catalog.category === "Buket" ? parsedBouquetCookiePrice : undefined;
  const flavorSource = [
    parsed.common.order,
    parsed.details.cakeFlavor,
    parsed.details.cupcakeFlavor,
    parsed.rawText,
  ]
    .filter(Boolean)
    .join(" | ");
  const flavorAddOns = detectFlavorAddOnIdsForCategory({
    category: catalog.category,
    value: flavorSource,
  });
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
      : {
          addOns: [] as string[],
          darkColorButtercreamColors: [] as string[],
          darkColorButtercreamColor: undefined,
        };

  return [
    {
      category: catalog.category,
      subcategory: catalog.subcategory,
      productName: catalog.productName,
      size: catalog.size,
      quantity,
      tokenDifficulty,
      cookiePrice,
      designCount: cookieDesignCount,
      additionalDesignCount:
        typeof cookieDesignCount === "number"
          ? Math.max(0, cookieDesignCount - COOKIE_INCLUDED_DESIGN_LIMIT)
          : undefined,
      addOns: mergeUniqueAddOnIds(flavorAddOns, cupcakeDarkColor.addOns),
      darkColorButtercreamColors: cupcakeDarkColor.darkColorButtercreamColors,
      darkColorButtercreamColor: cupcakeDarkColor.darkColorButtercreamColor,
      notes: itemNotes,
    },
  ];
}

function buildCupcakeAutoFillItems(
  parsed: ParsedWhatsAppOrder,
  itemNotes: string,
  catalogContext?: BookingParserCatalogContext,
): BookingFormAutoFill["items"] {
  const quantityInfo = resolveCupcakeQuantityBreakdown(parsed);
  const flavorSource = [
    parsed.details.cupcakeFlavor,
    parsed.common.order,
    parsed.rawText,
  ]
    .filter(Boolean)
    .join(" | ");
  const fallbackCupcakeFlavorAddOns = detectFlavorAddOnIdsForCategory({
    category: "Cupcakes",
    value: flavorSource,
  });
  const dozenFlavorAddOns =
    detectFlavorAddOnIdsForCategory({
      category: "Cupcakes",
      value: flavorSource,
      cupcakeSegment: "DOZEN",
    }) || [];
  const individualFlavorAddOns =
    detectFlavorAddOnIdsForCategory({
      category: "Cupcakes",
      value: flavorSource,
      cupcakeSegment: "INDIVIDUAL",
    }) || [];

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
      catalogContext,
    );
    items.push({
      category: catalog.category,
      subcategory: catalog.subcategory,
      productName: catalog.productName,
      size: catalog.size,
      quantity: quantityInfo.dozenCount,
      addOns: mergeUniqueAddOnIds(
        dozenFlavorAddOns.length > 0
          ? dozenFlavorAddOns
          : fallbackCupcakeFlavorAddOns,
        cupcakeDarkColor.addOns,
      ),
      darkColorButtercreamColors: cupcakeDarkColor.darkColorButtercreamColors,
      darkColorButtercreamColor: cupcakeDarkColor.darkColorButtercreamColor,
      notes: itemNotes,
    });
  }

  if (quantityInfo.individualCount > 0) {
    const catalog = chooseCatalogSelectionByText(
      "Cupcakes",
      "cupcakes individual indv per pcs",
      catalogContext,
    );
    items.push({
      category: catalog.category,
      subcategory: catalog.subcategory,
      productName: catalog.productName,
      size: catalog.size,
      quantity: quantityInfo.individualCount,
      addOns: mergeUniqueAddOnIds(
        individualFlavorAddOns.length > 0
          ? individualFlavorAddOns
          : fallbackCupcakeFlavorAddOns,
        cupcakeDarkColor.addOns,
      ),
      darkColorButtercreamColors: cupcakeDarkColor.darkColorButtercreamColors,
      darkColorButtercreamColor: cupcakeDarkColor.darkColorButtercreamColor,
      notes: itemNotes,
    });
  }

  if (items.length > 0) {
    return items;
  }

  return buildDefaultAutoFillItems(parsed, itemNotes, catalogContext);
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
    // Blok case template untuk format pesanan jenis cookies
    case "cookies":
      // Kembalikan struktur template data cookies yang digabungkan per baris
      return [
        // Label header untuk data cookies
        "Data Cookies",
        // Format pengisian tanggal pengiriman
        "Tanggal Pengiriman (/Maret/26):",
        // Format pengisian kode booking pesanan
        "KODE BOOKING:",
        // Format pengisian nama produk pesanan
        "Order:",
        // Kolom baru untuk jumlah/kuantitas cookies pesanan
        "Jumlah Cookies:",
        // Format pengisian catatan to-from cookies
        "To From Notes:",
        // Format pengisian jam pengiriman cookies
        "Jam Pengiriman:",
        // Format pengisian kurir/metode pengiriman cookies
        "Metode Pengiriman:",
        // Format pengisian nama penerima pesanan
        "Nama penerima:",
        // Format pengisian nomor telepon penerima
        "No. telp penerima:",
        // Format pengisian alamat lengkap penerima
        "Alamat lengkap:",
      ].join("\n"); // Gabungkan setiap elemen array dengan baris baru
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
        "Jumlah Bunga / Isi Bouquet:",
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
  const detailsByOrderType = buildDetailsByOrderType(text, lines, lookup);
  const orderRecap = parseOrderRecap(text, lines);

  const common = buildEmptyCommonFields();
  for (const field of commonFieldDefinitions) {
    const value = readFieldValue(text, lines, lookup, field);
    common[field.key as CommonFieldKey] = normalizeByKey(field.key, value);
  }

  const detailDefinitions = detailFieldDefinitions[orderType];
  const details = detailsByOrderType[orderType] ?? {};

  if (orderType === "buket" && !details.flowerCount) {
    const extractedFlowerCount = extractBouquetIsiQuantity(common.order || "");
    if (extractedFlowerCount) {
      details.flowerCount = String(extractedFlowerCount);
    }
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
    detailsByOrderType,
    orderRecap,
    missingFields,
  };
}

export function formatParsedWhatsAppForNotes(
  parsed: ParsedWhatsAppOrder,
): string {
  const lines: string[] = [];
  lines.push(`[WA Parser] ${WHATSAPP_ORDER_LABELS[parsed.orderType]}`);
  if ((parsed.detectedItems?.length ?? 0) > 1) {
    lines.push(
      `Item Terdeteksi: ${parsed.detectedItems
        ?.map((item) => `${item.quantity}x ${item.productName}`)
        .join(" | ")}`,
    );
  }

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

  if ((parsed.orderRecap?.items.length ?? 0) > 0) {
    lines.push("[Rekap Order]");
    parsed.orderRecap?.items.forEach((item, index) => {
      const summary = [
        item.category || "",
        item.productName || "",
        item.quantity ? `Qty ${item.quantity}` : "",
        item.size ? `Size ${item.size}` : "",
        item.unitPrice ? `Harga ${formatCurrencyNote(item.unitPrice)}` : "",
        item.subtotal ? `Subtotal ${formatCurrencyNote(item.subtotal)}` : "",
      ]
        .filter(Boolean)
        .join(" | ");
      lines.push(`Item ${item.itemNumber || index + 1}: ${summary}`);
      if (item.designNotes) {
        lines.push(`Design/Notes: ${item.designNotes}`);
      }
      if (item.addOn) {
        lines.push(`Add On: ${item.addOn}`);
      }
      if (item.subtotal) {
        lines.push(`Total Biaya Item: ${formatCurrencyNote(item.subtotal)}`);
      }
    });
  }

  if (parsed.orderRecap?.totals) {
    if (parsed.orderRecap.totals.subtotalProducts) {
      lines.push(
        `Subtotal Produk: ${formatCurrencyNote(parsed.orderRecap.totals.subtotalProducts)}`,
      );
    }
    if (parsed.orderRecap.totals.shippingFee) {
      lines.push(
        `Ongkir: ${formatCurrencyNote(parsed.orderRecap.totals.shippingFee)}`,
      );
    }
    if (parsed.orderRecap.totals.serviceCharge) {
      lines.push(
        `Service Charge: ${formatCurrencyNote(parsed.orderRecap.totals.serviceCharge)}`,
      );
    }
    if (parsed.orderRecap.totals.adjustment) {
      lines.push(
        `Adjustment: ${formatCurrencyNote(parsed.orderRecap.totals.adjustment)}`,
      );
    }
    if (parsed.orderRecap.totals.total) {
      lines.push(
        `Total: ${formatCurrencyNote(parsed.orderRecap.totals.total)}`,
      );
    }
    if (parsed.orderRecap.totals.downPayment) {
      lines.push(
        `DP: ${formatCurrencyNote(parsed.orderRecap.totals.downPayment)}`,
      );
    }
    if (parsed.orderRecap.totals.remainingBalance) {
      lines.push(
        `Sisa: ${formatCurrencyNote(parsed.orderRecap.totals.remainingBalance)}`,
      );
    }
  }

  for (const orderType of ORDER_TYPE_SEQUENCE) {
    if (orderType === parsed.orderType) continue;
    const details = getDetailsForOrderType(parsed, orderType);
    if (!hasFilledDetailValues(details)) continue;

    lines.push(`[Tambahan] ${WHATSAPP_ORDER_LABELS[orderType]}`);
    for (const field of detailFieldDefinitions[orderType]) {
      const value = details[field.key];
      if (!value) continue;
      lines.push(`${field.label}: ${value}`);
    }
  }

  return lines.join("\n");
}

export function buildBookingAutoFillFromParsed(
  parsed: ParsedWhatsAppOrder,
  catalogContext?: BookingParserCatalogContext,
): BookingFormAutoFill {
  const itemNotes = buildItemNotesForOrderType(parsed, parsed.orderType);
  const recapAutoFillItems = buildRecapAutoFillItems(parsed, catalogContext);
  const recapTotals = parsed.orderRecap?.totals;

  const autoFillItems =
    recapAutoFillItems.length > 0
      ? recapAutoFillItems
      : (() => {
          if (isSeasonalEventPacketTemplate(parsed)) {
            const seasonalEventAutoFillItems =
              buildMixedSupplementAutoFillItems(parsed, itemNotes, {
                forceSeasonalEventMode: true,
                catalogContext,
              });
            if (seasonalEventAutoFillItems.length > 0) {
              return mergeAutoFillItems(seasonalEventAutoFillItems);
            }
          }

          const primaryAutoFillItems =
            parsed.orderType === "cupcakes"
              ? buildCupcakeAutoFillItems(parsed, itemNotes, catalogContext)
              : buildDefaultAutoFillItems(parsed, itemNotes, catalogContext);
          const mixedSupplementItems = buildMixedSupplementAutoFillItems(
            parsed,
            itemNotes,
            { catalogContext },
          );
          return mergeAutoFillItems([
            ...primaryAutoFillItems,
            ...mixedSupplementItems,
          ]);
        })();

  const address = parsed.common.fullAddress || "Alamat belum terisi";
  const postalCode =
    parsed.common.postalCode || address.match(/\b\d{5}\b/)?.[0] || "";

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
  const manualAdjustment = Number(recapTotals?.adjustment || 0);
  const parsedDownPaymentAmount = Math.max(
    0,
    Number(recapTotals?.downPayment || 0),
  );
  const hasExplicitDownPayment = parsedDownPaymentAmount > 0;
  const remainingBalance =
    recapTotals?.remainingBalance !== undefined
      ? Math.max(0, Number(recapTotals.remainingBalance || 0))
      : undefined;
  const totalFromRecap =
    recapTotals?.total !== undefined
      ? Math.max(0, Number(recapTotals.total || 0))
      : undefined;
  const totalPaidFromRecap =
    totalFromRecap !== undefined && remainingBalance !== undefined
      ? Math.max(0, totalFromRecap - remainingBalance)
      : undefined;
  const paymentStatus =
    hasExplicitDownPayment
      ? "DP Paid"
      : totalFromRecap !== undefined
        ? "Paid"
        : "DP Paid";
  const dpPaidAmount = hasExplicitDownPayment ? parsedDownPaymentAmount : 0;
  const finalPaidAmount =
    paymentStatus === "Paid"
      ? Math.max(0, totalFromRecap ?? totalPaidFromRecap ?? 0)
      : Math.max(0, totalPaidFromRecap ?? 0);

  return {
    customerName,
    phoneNumber,
    deliveryDate,
    deliverySlot,
    deliveryMethod,
    customNotes: buildSpecialNotesFromParsed(parsed),
    paymentStatus,
    dpPaidAmount,
    finalPaidAmount,
    manualAdjustment,
    deliveryAddresses: [
      {
        label: "Primary",
        area: "",
        postalCode,
        addressLine: address,
      },
    ],
    items: autoFillItems,
  };
}

function mapCategoryToOrderType(category: string): WhatsAppOrderType {
  const normalized = normalizeLabel(category);

  if (normalized === "cupcakes") return "cupcakes";
  if (normalized === "cookies tower") return "cookies_tower";
  if (normalized === "seasonal event") return "cookies";
  if (normalized === "cookies") return "cookies";
  if (normalized === "buket") return "buket";
  return "cake";
}

export function buildParsedDetectedItems(
  items: BookingFormAutoFill["items"],
): ParsedWhatsAppDetectedItem[] {
  return items.map((item) => ({
    orderType: mapCategoryToOrderType(item.category),
    category: item.category,
    productName: item.productName,
    size: item.size,
    quantity: item.quantity,
  }));
}

export function getDisplayFields(
  parsed: ParsedWhatsAppOrder,
): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];

  if ((parsed.detectedItems?.length ?? 0) > 0) {
    rows.push({
      label: "Item Terdeteksi",
      value:
        parsed.detectedItems
          ?.map((item) => `${item.quantity}x ${item.productName}`)
          .join(" | ") || "-",
    });
  }

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

  if ((parsed.orderRecap?.items.length ?? 0) > 0) {
    parsed.orderRecap?.items.forEach((item, index) => {
      rows.push({
        label: `Rekap Item ${item.itemNumber || index + 1}`,
        value: [
          item.category || "",
          item.productName || "",
          item.quantity ? `Qty ${item.quantity}` : "",
          item.size ? `Size ${item.size}` : "",
          item.unitPrice ? `Harga ${formatCurrencyNote(item.unitPrice)}` : "",
          item.subtotal ? `Subtotal ${formatCurrencyNote(item.subtotal)}` : "",
        ]
          .filter(Boolean)
          .join(" | "),
      });

      if (item.designNotes) {
        rows.push({
          label: `Rekap Item ${item.itemNumber || index + 1} - Design/Notes`,
          value: item.designNotes,
        });
      }

      if (item.addOn) {
        rows.push({
          label: `Rekap Item ${item.itemNumber || index + 1} - Add On`,
          value: item.addOn,
        });
      }

      if (item.subtotal) {
        rows.push({
          label: `Rekap Item ${item.itemNumber || index + 1} - Total Biaya Item`,
          value: formatCurrencyNote(item.subtotal),
        });
      }
    });
  }

  if (parsed.orderRecap?.totals.subtotalProducts) {
    rows.push({
      label: "Subtotal Produk",
      value: formatCurrencyNote(parsed.orderRecap.totals.subtotalProducts),
    });
  }
  if (parsed.orderRecap?.totals.shippingFee) {
    rows.push({
      label: "Ongkir",
      value: formatCurrencyNote(parsed.orderRecap.totals.shippingFee),
    });
  }
  if (parsed.orderRecap?.totals.serviceCharge) {
    rows.push({
      label: "Service Charge",
      value: formatCurrencyNote(parsed.orderRecap.totals.serviceCharge),
    });
  }
  if (parsed.orderRecap?.totals.adjustment) {
    rows.push({
      label: "Adjustment",
      value: formatCurrencyNote(parsed.orderRecap.totals.adjustment),
    });
  }
  if (parsed.orderRecap?.totals.total) {
    rows.push({
      label: "Total",
      value: formatCurrencyNote(parsed.orderRecap.totals.total),
    });
  }
  if (parsed.orderRecap?.totals.downPayment) {
    rows.push({
      label: "DP",
      value: formatCurrencyNote(parsed.orderRecap.totals.downPayment),
    });
  }
  if (parsed.orderRecap?.totals.remainingBalance) {
    rows.push({
      label: "Sisa",
      value: formatCurrencyNote(parsed.orderRecap.totals.remainingBalance),
    });
  }

  for (const orderType of ORDER_TYPE_SEQUENCE) {
    if (orderType === parsed.orderType) continue;
    const details = getDetailsForOrderType(parsed, orderType);
    if (!hasFilledDetailValues(details)) continue;

    for (const field of detailFieldDefinitions[orderType]) {
      if (!details[field.key]) continue;
      rows.push({
        label: `${WHATSAPP_ORDER_LABELS[orderType]} - ${field.label}`,
        value: details[field.key] || "-",
      });
    }
  }

  return rows;
}
