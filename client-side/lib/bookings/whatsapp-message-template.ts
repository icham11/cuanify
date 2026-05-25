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

/**
 * Fungsi untuk menghasilkan kode booking otomatis jika kosong dari data pesanan.
 * Mengambil 2 huruf pertama dari nama penerima dan 2 angka terakhir dari nomor hp.
 */
function generateAutomatedBookingCode(recipientName?: string, recipientPhone?: string): string {
  try {
    // 1. Membersihkan string nama penerima hanya menjadi huruf (menghilangkan spasi/simbol)
    const nameStr = (recipientName || "").replace(/[^a-zA-Z]/g, "");
    
    // 2. Membersihkan string nomor telepon hanya menjadi angka
    const phoneStr = (recipientPhone || "").replace(/[^0-9]/g, "");
    
    // 3. Mengambil 2 huruf pertama dari nama, jika kurang dari 2, maka pad dengan 'X'
    const namePrefix = nameStr.length >= 2 
      ? nameStr.substring(0, 2) 
      : nameStr.padEnd(2, "X");
      
    // 4. Mengambil 2 angka terakhir dari nomor telepon, jika kurang, pad dengan '0'
    const phoneSuffix = phoneStr.length >= 2 
      ? phoneStr.substring(phoneStr.length - 2) 
      : phoneStr.padStart(2, "0");
      
    // 5. Mengembalikan kode yang diformat dengan uppercase (contoh: MO-17)
    return `${namePrefix.toUpperCase()}-${phoneSuffix}`;
  } catch (error) {
    // 6. Tangkap error jika terjadi sesuatu yang tak terduga
    console.error("Gagal men-generate kode booking:", error);
    return "XX-00"; // Fallback default
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
  >,
) {
  lines.push("Tanggal Pengiriman :");
  lines.push(formatWhatsAppDeliveryDate(input.deliveryDate));
  lines.push("");
  
  // Cek apakah input.bookingCode kosong atau bernilai "-"
  let finalBookingCode = normalizeInlineValue(input.bookingCode || "");
  if (!finalBookingCode || finalBookingCode === "-") {
    // Jika kosong, buat kode booking otomatis dari data penerima dan HP
    finalBookingCode = generateAutomatedBookingCode(input.recipientName, input.recipientPhone);
  }
  
  // Masukkan kode booking yang final ke dalam output baris
  lines.push(`KODE BOOKING : ${finalBookingCode}`);
  lines.push("");

  // Lakukan iterasi untuk setiap item pesanan dalam daftar
  input.items.forEach((item) => {
    // Tambahkan label teks "Order :" ke dalam rincian pesan
    lines.push("Order :");
    // Tentukan awalan kuantitas (qty) jika quantity didefinisikan dan lebih besar dari 0
    const qtyPrefix = item.quantity && item.quantity > 0 ? `${item.quantity}× ` : "";
    // Gabungkan awalan qty dengan nama label order atau nama produk, lalu bersihkan spasinya dan masukkan ke baris
    lines.push(normalizeInlineValue(`${qtyPrefix}${item.orderLabel || item.productName || "-"}`));
    // Tambahkan baris kosong untuk pemisah
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
  >,
): string {
  const lines: string[] = [];
  appendOrderDeliveryDetailLines(lines, input);
  return compactEmptyLines(lines).join("\n");
}
