import type { BakeryOrder, OrderItem } from "@/components/bakery/store";

// ==================== KONSTANTA ====================

/** Info bank untuk ditampilkan di invoice */
const BANK_INFO = {
  bankName: "BCA",
  accountName: "Felicia Elvina",
  accountNumber: "5360174125",
} as const;

/** Nama bulan dalam format Bahasa Indonesia */
const BULAN_INDO = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

/** Nomor bulan → angka Romawi (untuk format invoice number) */
const BULAN_ROMAWI = [
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
  "XI",
  "XII",
] as const;

// ==================== FORMAT HELPERS ====================

/**
 * Format angka ke Rupiah tanpa simbol "Rp" (hanya titik pemisah ribuan).
 * Contoh: 23500000 → "23.500.000"
 */
export function formatInvoiceCurrency(value: number): string {
  return Math.round(value).toLocaleString("id-ID");
}

/**
 * Format Date ke format Indonesia.
 * Contoh: new Date("2026-03-02") → "2 Maret 2026"
 */
export function formatInvoiceDate(date: Date): string {
  const day = date.getDate();
  const month = BULAN_INDO[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * Generate tanggal invoice: pakai hari ini.
 */
export function getInvoiceDateString(): string {
  return formatInvoiceDate(new Date());
}

// ==================== INVOICE NUMBER ====================

/**
 * Generate nomor invoice otomatis dari booking code.
 * Format: INV-{INISIAL}-{TAHUN}{SEQUENCE}-{BULAN_ROMAWI}
 * Contoh: INV-MK-20261-XII
 */
export function generateInvoiceNumber(order: BakeryOrder): string {
  // Ambil inisial dari booking code (2 huruf pertama)
  const bookingCode = order.bookingCode || order.resi || order.id;
  const initialsMatch = bookingCode.match(/^([A-Z]{2})/i);
  const initials = initialsMatch
    ? initialsMatch[1].toUpperCase()
    : order.customerName
        .replace(/[^a-zA-Z]/g, "")
        .slice(0, 2)
        .toUpperCase()
        .padEnd(2, "X");

  // Ambil tahun & bulan dari deliveryDate atau hari ini
  const dateSource = order.deliveryDate
    ? new Date(order.deliveryDate)
    : new Date();
  const year = dateSource.getFullYear();
  const monthIndex = dateSource.getMonth();
  const romawi = BULAN_ROMAWI[monthIndex];

  // Sequence: ambil dari booking code atau generate dari timestamp
  const seqMatch = bookingCode.match(/(\d{3})$/);
  const sequence = seqMatch ? seqMatch[1] : String(Date.now() % 1000).padStart(3, "0");

  return `INV-${initials}-${year}${sequence}-${romawi}`;
}

// ==================== INVOICE DATA ====================

/** Representasi 1 baris item di tabel invoice */
export interface InvoiceLineItem {
  description: string;
  price: number;
  quantity: number;
  total: number;
}

/** Data lengkap yang dibutuhkan untuk render invoice */
export interface InvoiceData {
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  customerPhone: string;
  lineItems: InvoiceLineItem[];
  itemsSubtotal: number;
  deliveryFee: number;
  manualAdjustment: number;
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  grandTotal: number;
  bank: typeof BANK_INFO;
}

function parseWholesaleDiscountPercent(notes?: string): number | null {
  if (!notes) return null;

  const match = notes.match(
    /wholesale\s*discount\s*:\s*(\d+(?:[.,]\d+)?)\s*%/i,
  );
  if (!match) return null;

  const parsed = Number(match[1].replace(",", "."));
  if (!Number.isFinite(parsed)) return null;

  return Math.max(0, Math.min(100, Number(parsed.toFixed(2))));
}

function deriveDiscountPercent(subtotal: number, discountAmount: number): number {
  if (subtotal <= 0 || discountAmount <= 0) return 0;

  const derived = (discountAmount / subtotal) * 100;
  return Math.max(0, Math.min(100, Number(derived.toFixed(2))));
}

/**
 * Build data invoice dari BakeryOrder.
 * @param order - Data order dari store
 */
export function buildInvoiceData(order: BakeryOrder): InvoiceData {
  // Konversi setiap item order ke baris invoice
  const lineItems: InvoiceLineItem[] = (order.items ?? []).map(
    (item: OrderItem) => {
      const quantity = Math.max(1, Number(item.quantity) || 1);

      // Nilai item pada data order sudah disimpan sebagai line total (bukan unit).
      const baseLineTotal = Math.max(
        0,
        Math.round(Number(item.lineTotal ?? item.basePrice ?? 0)),
      );
      const addOnLineTotal = Math.max(
        0,
        Math.round(Number(item.addOnTotal ?? 0)),
      );
      const total = Math.max(0, baseLineTotal + addOnLineTotal);

      // Harga yang ditampilkan pada kolom Price adalah harga per unit.
      const unitPrice =
        quantity > 0 ? Math.round(total / quantity) : Math.round(total);

      // Deskripsi: nama produk + size + add-ons
      const parts = [item.productName];
      if (item.size) parts.push(`(${item.size})`);
      if (item.addOns?.length) parts.push(`+ ${item.addOns.join(", ")}`);

      return {
        description: parts.join(" "),
        price: unitPrice,
        quantity,
        total,
      };
    },
  );

  // Hitung subtotal item, lalu tambahkan ongkir dan adjustment agar sinkron dengan total order.
  const itemsSubtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
  const deliveryFee = Math.max(0, Math.round(Number(order.deliveryFee || 0)));
  const manualAdjustment = Math.round(Number(order.manualAdjustment || 0));
  const subtotal = Math.max(0, itemsSubtotal + deliveryFee + manualAdjustment);

  // Prioritaskan total final order yang tersimpan dari booking agar sinkron
  // dengan nilai yang disimpan setelah diskon grosir dipilih di form booking.
  const savedGrandTotal = Math.max(0, Math.round(Number(order.totalPrice || 0)));
  const grandTotal = Math.min(subtotal, savedGrandTotal);
  const discountAmount = Math.max(0, subtotal - grandTotal);

  const parsedDiscountPercent = parseWholesaleDiscountPercent(order.notes);
  let discountPercent = parsedDiscountPercent ?? 0;
  if (discountAmount <= 0) {
    discountPercent = 0;
  } else if (discountPercent <= 0) {
    discountPercent = deriveDiscountPercent(subtotal, discountAmount);
  }

  return {
    invoiceNumber: generateInvoiceNumber(order),
    invoiceDate: getInvoiceDateString(),
    customerName: order.customerName || "Customer",
    customerPhone: order.customerPhone || "-",
    lineItems,
    itemsSubtotal,
    deliveryFee,
    manualAdjustment,
    subtotal,
    discountPercent,
    discountAmount,
    grandTotal,
    bank: BANK_INFO,
  };
}
