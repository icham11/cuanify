export interface WhatsAppRecapItemDetail {
  label: string;
  value: string;
}

export interface WhatsAppRecapItem {
  productName: string;
  unitPrice?: number;
  quantity?: number;
  addOnText?: string;
  subtotal?: number;
  orderLabel?: string;
  detailLines?: WhatsAppRecapItemDetail[];
}

export interface WhatsAppRecapInput {
  items: WhatsAppRecapItem[];
  deliveryFee?: number;
  serviceCharge?: number;
  manualAdjustment?: number;
  totalPrice?: number;
  downPaymentAmount?: number;
  remainingBalance?: number;
  deliveryDate?: string;
  bookingCode?: string;
  deliveryTime?: string;
  shippingMethod?: string;
  recipientName?: string;
  recipientPhone?: string;
  fullAddress?: string;
  postalCode?: string;
}

function normalizeInlineValue(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeRawTextValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeMultilineValue(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function isGenericImagePlaceholderLine(value: string): boolean {
  const normalized = value
    .trim()
    .replace(/^[*\-•]+\s*/, "")
    .replace(/\s+/g, " ");

  if (!normalized) return false;

  return /^(gambar|image|img|foto|photo|pic)(?:\s+referensi)?(?:\s+ke)?\s*(\d+|pertama|kedua|ketiga|keempat|kelima|keenam|ketujuh|kedelapan|kesembilan|kesepuluh)$/i.test(
    normalized,
  );
}

function formatMoney(value: unknown): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return Math.round(parsed).toLocaleString("id-ID");
}

export function formatWhatsAppDeliveryDate(value?: string): string {
  const trimmed = (value || "").trim();
  if (!trimmed) return "-";

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!isoMatch) return trimmed;

  const [, year, month, day] = isoMatch;
  const parsed = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day)),
  );

  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(parsed);
}

export function formatWhatsAppDeliveryTime(value?: string): string {
  const trimmed = (value || "").trim().replace(/\s*wib$/i, "");
  if (!trimmed) return "-";
  return trimmed.replace(":", ".");
}

function pushLabeledValue(lines: string[], label: string, value?: string) {
  const normalized = normalizeMultilineValue(value || "");
  if (!normalized.length) return;

  if (normalized.length === 1) {
    lines.push(`${label} : ${normalized[0]}`);
    return;
  }

  lines.push(`${label} :`);
  lines.push(...normalized);
}

function collectGroupedDetailLines(
  items: WhatsAppRecapItem[],
): WhatsAppRecapItemDetail[] {
  const grouped = new Map<string, { label: string; values: string[] }>();

  for (const item of items) {
    for (const detailLine of item.detailLines ?? []) {
      const normalizedLabel = detailLine.label.trim().toLowerCase();
      const normalizedValues = normalizeMultilineValue(detailLine.value || "");
      if (!normalizedLabel || normalizedValues.length === 0) continue;

      const existing = grouped.get(normalizedLabel);
      if (!existing) {
        grouped.set(normalizedLabel, {
          label: detailLine.label.trim(),
          values: [...normalizedValues],
        });
        continue;
      }

      for (const value of normalizedValues) {
        if (!existing.values.includes(value)) {
          existing.values.push(value);
        }
      }
    }
  }

  return Array.from(grouped.values()).map((entry) => ({
    label: entry.label,
    value: entry.values.join("\n"),
  }));
}

function compactEmptyLines(lines: string[]): string[] {
  const compacted: string[] = [];

  for (const line of lines) {
    const normalizedLine = line.trim() ? line : "";
    if (!normalizedLine && compacted[compacted.length - 1] === "") continue;
    compacted.push(normalizedLine);
  }

  while (compacted[0] === "") compacted.shift();
  while (compacted[compacted.length - 1] === "") compacted.pop();

  return compacted;
}

export function sanitizeRawWhatsAppTemplateSection(value: string): string {
  const filteredLines = value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !isGenericImagePlaceholderLine(line));

  return compactEmptyLines(filteredLines).join("\n");
}

export function extractRawOrderDeliveryDetailsWhatsAppText(
  rawText: unknown,
): string {
  const lines = normalizeRawTextValue(rawText)
    .replace(/\r\n/g, "\n")
    .split("\n");
  const startIndex = lines.findIndex((line) =>
    /^\s*tanggal pengiriman\s*:/i.test(line),
  );

  if (startIndex < 0) {
    return "";
  }

  return sanitizeRawWhatsAppTemplateSection(lines.slice(startIndex).join("\n"));
}

function generateAutomatedBookingCode(
  recipientName?: string,
  recipientPhone?: string,
): string {
  try {
    const nameStr = (recipientName || "").replace(/[^a-zA-Z]/g, "");
    const phoneStr = (recipientPhone || "").replace(/[^0-9]/g, "");
    const namePrefix =
      nameStr.length >= 2 ? nameStr.substring(0, 2) : nameStr.padEnd(2, "X");
    const phoneSuffix =
      phoneStr.length >= 2
        ? phoneStr.substring(phoneStr.length - 2)
        : phoneStr.padStart(2, "0");

    return `${namePrefix.toUpperCase()}-${phoneSuffix}`;
  } catch (error) {
    console.error("Gagal men-generate kode booking:", error);
    return "XX-00";
  }
}

function appendOrderDeliveryDetailLines(
  lines: string[],
  input: Pick<
    WhatsAppRecapInput,
    | "items"
    | "deliveryDate"
    | "bookingCode"
    | "deliveryTime"
    | "shippingMethod"
    | "recipientName"
    | "recipientPhone"
    | "fullAddress"
    | "postalCode"
  >,
) {
  lines.push(
    `Tanggal Pengiriman : ${formatWhatsAppDeliveryDate(input.deliveryDate)}`,
  );
  lines.push("");

  let finalBookingCode = normalizeInlineValue(input.bookingCode || "");
  if (!finalBookingCode || finalBookingCode === "-") {
    finalBookingCode = generateAutomatedBookingCode(
      input.recipientName,
      input.recipientPhone,
    );
  }

  lines.push(`KODE BOOKING : ${finalBookingCode}`);
  lines.push("");

  lines.push("Order: ");
  for (const item of input.items) {
    const qtyPrefix =
      item.quantity && item.quantity > 0 ? `${item.quantity}pcs ` : "";
    lines.push(
      normalizeInlineValue(`•  ${qtyPrefix}${item.productName || "-"}`),
    );
  }
  lines.push("");

  const groupedDetailLines = collectGroupedDetailLines(input.items);
  for (const detailLine of groupedDetailLines) {
    pushLabeledValue(lines, detailLine.label, detailLine.value);
  }

  if (groupedDetailLines.length > 0) {
    lines.push("");
  }

  lines.push(
    `Jam Pengiriman: ${formatWhatsAppDeliveryTime(input.deliveryTime)}`,
  );
  lines.push(
    `Metode Pengiriman : ${normalizeInlineValue(input.shippingMethod || "-")}`,
  );
  lines.push(
    `Nama penerima : ${normalizeInlineValue(input.recipientName || "-")}`,
  );
  lines.push(
    `No. telp penerima : ${normalizeInlineValue(input.recipientPhone || "-")}`,
  );
  pushLabeledValue(lines, "Alamat lengkap", input.fullAddress || "-");
  if (input.postalCode) {
    pushLabeledValue(lines, "Kode pos", input.postalCode);
  }
}

export function buildOrderRecapWhatsAppText(input: WhatsAppRecapInput): string {
  const lines: string[] = ["REKAP ORDER"];

  input.items.forEach((item, index) => {
    lines.push(`ITEM ${index + 1}`);
    lines.push("");
    lines.push(`Nama Produk: ${normalizeInlineValue(item.productName || "-")}`);
    lines.push(`Harga Satuan: ${formatMoney(item.unitPrice)}`);
    lines.push(`Qty: ${Math.max(0, Number(item.quantity || 0))}`);

    const addOnText = normalizeInlineValue(item.addOnText || "");
    lines.push(addOnText ? `Add On: ${addOnText}` : "Add On:");

    lines.push(`Subtotal: ${formatMoney(item.subtotal)}`);
    lines.push("");
  });

  lines.push(`ONGKIR: ${formatMoney(input.deliveryFee)}`);
  lines.push(`SERVICE CHARGE: ${formatMoney(input.serviceCharge)}`);
  lines.push(`ADJUSTMENT: ${formatMoney(input.manualAdjustment)}`);
  lines.push(`TOTAL: ${formatMoney(input.totalPrice)}`);
  lines.push(`DP: ${formatMoney(input.downPaymentAmount)}`);
  lines.push(`SISA: ${formatMoney(input.remainingBalance)}`);
  lines.push("");
  appendOrderDeliveryDetailLines(lines, input);

  return compactEmptyLines(lines).join("\n");
}

export function buildOrderDeliveryDetailsWhatsAppText(
  input: Pick<
    WhatsAppRecapInput,
    | "items"
    | "deliveryDate"
    | "bookingCode"
    | "deliveryTime"
    | "shippingMethod"
    | "recipientName"
    | "recipientPhone"
    | "fullAddress"
    | "postalCode"
  >,
): string {
  const lines: string[] = [];
  appendOrderDeliveryDetailLines(lines, input);
  return compactEmptyLines(lines).join("\n");
}
