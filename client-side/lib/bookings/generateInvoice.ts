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
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  grandTotal: number;
  bank: typeof BANK_INFO;
}

/**
 * Build data invoice dari BakeryOrder.
 * @param order - Data order dari store
 * @param discountPercent - Persentase diskon (0-100), default 0
 */
export function buildInvoiceData(
  order: BakeryOrder,
  discountPercent = 0,
): InvoiceData {
  // Konversi setiap item order ke baris invoice
  const lineItems: InvoiceLineItem[] = (order.items ?? []).map(
    (item: OrderItem) => {
      // Harga per unit: basePrice + addOn
      const unitPrice = (item.basePrice || 0) + (item.addOnTotal || 0);
      const quantity = Math.max(1, Number(item.quantity) || 1);
      const total = unitPrice * quantity;

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

  // Hitung subtotal dari semua item
  const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);

  // Hitung diskon
  const clampedDiscount = Math.max(0, Math.min(100, discountPercent));
  const discountAmount = Math.round(subtotal * (clampedDiscount / 100));
  const grandTotal = subtotal - discountAmount;

  return {
    invoiceNumber: generateInvoiceNumber(order),
    invoiceDate: getInvoiceDateString(),
    customerName: order.customerName || "Customer",
    customerPhone: order.customerPhone || "-",
    lineItems,
    subtotal,
    discountPercent: clampedDiscount,
    discountAmount,
    grandTotal,
    bank: BANK_INFO,
  };
}
