export const BUSINESS_TIME_ZONE = "Asia/Jakarta";

export type PaymentStatus = "Paid" | "DP Paid" | "Pending" | "Unknown";

export interface DailyOmzetSnapshot {
  businessDate: string;
  businessDateLabel: string;
  timeZone: string;
  generatedAt: string;
  summary: {
    bookingCountCreatedToday: number;
    fullyPaidBookingCountCreatedToday: number;
    bookingSalesCreatedToday: number;
    pendingFromCreatedToday: number;
    paymentReceiptCountToday: number;
    dpReceivedToday: number;
    finalReceivedToday: number;
    totalPaymentsReceived: number;
  };
  reconciliation: {
    bakery: {
      bookingSalesCreatedToday: number;
      pendingSalesToday: number;
      paymentsReceivedToday: number;
      paymentReceiptCountToday: number;
    };
    deltaPaymentsMinusBookingSales: number;
  };
  sales: Array<{
    id: string;
    reference: string;
    customerName: string;
    paymentStatus: PaymentStatus;
    totalPrice: number;
    totalPaidAmount: number;
    remainingBalance: number;
    createdAt: string;
  }>;
  payments: Array<{
    id: string;
    reference: string;
    customerName: string;
    amount: number;
    paymentType: "DP" | "Final";
    note?: string;
    createdAt: string;
  }>;
}

export type DailyOmzetSummaryCardKey =
  | "paymentsReceived"
  | "bookingSales"
  | "pendingBalance"
  | "fullyPaidBookings";

export interface DailyOmzetSummaryCard {
  key: DailyOmzetSummaryCardKey;
  title: string;
  value: string;
  hint: string;
}

export function getJakartaDateKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatTimeWib(dateIso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: BUSINESS_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(dateIso));
}

export function formatDailyOmzetPaymentStatusLabel(status: PaymentStatus): string {
  if (status === "Paid") return "Lunas";
  if (status === "DP Paid") return "DP";
  if (status === "Pending") return "Belum Bayar";
  return "-";
}

export function getDailyOmzetDerivedCounts(data: DailyOmzetSnapshot) {
  const paidBookingCount = data.sales.filter((sale) => sale.totalPaidAmount > 0).length;
  const fullyPaidBookingCount = data.sales.filter(
    (sale) => sale.totalPaidAmount > 0 && sale.remainingBalance <= 0,
  ).length;
  const dpReceiptCount = data.payments.filter(
    (payment) => payment.paymentType === "DP" && payment.amount > 0,
  ).length;
  const finalReceiptCount = data.payments.filter(
    (payment) => payment.paymentType === "Final" && payment.amount > 0,
  ).length;

  return {
    paidBookingCount,
    fullyPaidBookingCount,
    dpReceiptCount,
    finalReceiptCount,
  };
}

export function buildDailyOmzetSummaryCards(
  data: DailyOmzetSnapshot,
  formatCurrency: (value: number) => string,
): DailyOmzetSummaryCard[] {
  const {
    paidBookingCount,
    fullyPaidBookingCount,
    dpReceiptCount,
    finalReceiptCount,
  } = getDailyOmzetDerivedCounts(data);

  return [
    {
      key: "paymentsReceived",
      title: "Uang Masuk Hari Ini",
      value: formatCurrency(data.summary.totalPaymentsReceived),
      hint: `${paidBookingCount} booking menerima pembayaran di tanggal ini`,
    },
    {
      key: "bookingSales",
      title: "Total Pesanan Tanggal Ini",
      value: formatCurrency(data.summary.bookingSalesCreatedToday),
      hint: `${data.summary.bookingCountCreatedToday} booking masuk ke tanggal bisnis ini`,
    },
    {
      key: "pendingBalance",
      title: "Sisa Belum Lunas Tanggal Ini",
      value: formatCurrency(data.summary.pendingFromCreatedToday),
      hint: "Sisa tagihan dari booking pada tanggal bisnis ini",
    },
    {
      key: "fullyPaidBookings",
      title: "Booking Lunas di Tanggal Ini",
      value: `${fullyPaidBookingCount} booking`,
      hint: `${dpReceiptCount} transaksi DP, ${finalReceiptCount} transaksi pelunasan`,
    },
  ];
}
