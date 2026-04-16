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
}

function normalizeInlineValue(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeMultilineValue(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
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

export function buildOrderRecapWhatsAppText(
  input: WhatsAppRecapInput,
): string {
  const lines: string[] = ["REKAP ORDER"];

  input.items.forEach((item, index) => {
    lines.push(`ITEM ${index + 1}`);
    lines.push("");
    lines.push(`Nama Produk: ${normalizeInlineValue(item.productName || "-")}`);
    lines.push(`Harga Satuan: ${formatMoney(item.unitPrice)}`);
    lines.push(`Qty: ${Math.max(0, Number(item.quantity || 0))}`);

    const addOnText = normalizeInlineValue(item.addOnText || "");
    if (addOnText) {
      lines.push(`Add On: ${addOnText}`);
    }

    lines.push(`Subtotal: ${formatMoney(item.subtotal)}`);
    lines.push("");
  });

  lines.push(`ONGKIR: ${formatMoney(input.deliveryFee)}`);
  lines.push(`ADJUSTMENT: ${formatMoney(input.manualAdjustment)}`);
  lines.push(`TOTAL: ${formatMoney(input.totalPrice)}`);
  lines.push(`DP: ${formatMoney(input.downPaymentAmount)}`);
  lines.push(`SISA: ${formatMoney(input.remainingBalance)}`);
  lines.push("");
  lines.push("Tanggal Pengiriman :");
  lines.push(formatWhatsAppDeliveryDate(input.deliveryDate));
  lines.push("");
  lines.push(`KODE BOOKING : ${normalizeInlineValue(input.bookingCode || "-")}`);
  lines.push("");

  input.items.forEach((item) => {
    lines.push("Order :");
    lines.push(normalizeInlineValue(item.orderLabel || item.productName || "-"));
    lines.push("");

    for (const detailLine of item.detailLines ?? []) {
      pushLabeledValue(lines, detailLine.label, detailLine.value);
    }

    if ((item.detailLines?.length ?? 0) > 0) {
      lines.push("");
    }
  });

  lines.push(`Jam Pengiriman: ${formatWhatsAppDeliveryTime(input.deliveryTime)}`);
  lines.push(
    `Metode Pengiriman : ${normalizeInlineValue(input.shippingMethod || "-")}`,
  );
  lines.push(`Nama penerima : ${normalizeInlineValue(input.recipientName || "-")}`);
  lines.push(
    `No. telp penerima : ${normalizeInlineValue(input.recipientPhone || "-")}`,
  );
  pushLabeledValue(lines, "Alamat lengkap", input.fullAddress || "-");

  return compactEmptyLines(lines).join("\n");
}
