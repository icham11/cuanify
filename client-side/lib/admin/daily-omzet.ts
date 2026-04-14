import prisma from "@/lib/prisma";

export const BUSINESS_TIME_ZONE = "Asia/Jakarta";
const JAKARTA_UTC_OFFSET_HOURS = 7;

interface BakeryOrderRow {
  external_id: string;
  booking_code: string | null;
  resi: string | null;
  customer_name: string | null;
  payment_status: string | null;
  total_price: unknown;
  total_paid_amount: unknown;
  payment_transactions: unknown;
  created_at: Date;
  updated_at: Date;
}

interface ParsedPaymentTransaction {
  id: string;
  timestamp: string;
  amount: number;
  type: "DP" | "Final";
  note?: string;
}

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
    paymentStatus: "Pending" | "DP Paid" | "Paid" | "Unknown";
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

function getDatePartsInTimeZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value || 0);
  const month = Number(parts.find((part) => part.type === "month")?.value || 0);
  const day = Number(parts.find((part) => part.type === "day")?.value || 0);

  return { year, month, day };
}

function getBusinessDayRangeUtc(now: Date): { startUtc: Date; endUtc: Date } {
  const { year, month, day } = getDatePartsInTimeZone(now, BUSINESS_TIME_ZONE);
  const startUtc = new Date(
    Date.UTC(year, month - 1, day, -JAKARTA_UTC_OFFSET_HOURS, 0, 0, 0),
  );
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
  return { startUtc, endUtc };
}

function getBusinessDateYmd(now: Date): string {
  const { year, month, day } = getDatePartsInTimeZone(now, BUSINESS_TIME_ZONE);
  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function getBusinessDateLabel(now: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: BUSINESS_TIME_ZONE,
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(now);
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isInRange(date: Date | null, startUtc: Date, endUtc: Date): boolean {
  if (!date || Number.isNaN(date.getTime())) return false;
  return date >= startUtc && date < endUtc;
}

function toDateOrNull(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

export async function buildDailyOmzetSnapshot(
  businessId: number,
  now: Date = new Date(),
): Promise<DailyOmzetSnapshot> {
  const { startUtc, endUtc } = getBusinessDayRangeUtc(now);

  let bakeryOrderRows: BakeryOrderRow[] = [];
  try {
    bakeryOrderRows = await prisma.$queryRaw<BakeryOrderRow[]>`
      SELECT
        external_id,
        booking_code,
        resi,
        customer_name,
        payment_status,
        total_price,
        total_paid_amount,
        payment_transactions,
        created_at,
        updated_at
      FROM bakery_orders
      WHERE business_id = ${businessId}
        AND (created_at >= ${startUtc} AND created_at < ${endUtc})
      ORDER BY updated_at DESC
    `;
  } catch (error) {
    console.warn("[admin/daily-omzet] bakery_orders query skipped", {
      businessId,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  let bookingCountCreatedToday = 0;
  let fullyPaidBookingCountCreatedToday = 0;
  let bookingSalesCreatedToday = 0;
  let pendingFromCreatedToday = 0;

  let dpReceivedToday = 0;
  let finalReceivedToday = 0;
  let bakeryPaymentsReceivedToday = 0;
  let bakeryPaymentReceiptCountToday = 0;

  const bakerySalesDetail: DailyOmzetSnapshot["sales"] = [];
  const bakeryPaymentsDetail: DailyOmzetSnapshot["payments"] = [];

  for (const row of bakeryOrderRows) {
    const createdAt = toDateOrNull(row.created_at);
    const createdToday = isInRange(createdAt, startUtc, endUtc);

    const reference =
      row.resi || row.booking_code || row.external_id || "BAKERY-ORDER";
    const customerName = row.customer_name || "Walk-in Customer";
    const totalPrice = toNumber(row.total_price);
    const totalPaid = Math.min(totalPrice, toNumber(row.total_paid_amount));
    const remainingBalance = Math.max(0, totalPrice - totalPaid);

    const normalizedPaymentStatus: DailyOmzetSnapshot["sales"][number]["paymentStatus"] =
      row.payment_status === "Paid" ||
      row.payment_status === "Pending" ||
      row.payment_status === "DP Paid"
        ? row.payment_status
        : "Unknown";

    if (createdToday) {
      bookingCountCreatedToday += 1;
      if (totalPrice > 0 && totalPaid >= totalPrice) {
        fullyPaidBookingCountCreatedToday += 1;
      }
      bookingSalesCreatedToday += totalPrice;
      pendingFromCreatedToday += remainingBalance;
      bakeryPaymentsReceivedToday += totalPaid;

      if (totalPaid > 0) {
        bakeryPaymentReceiptCountToday += 1;
      }

      if (totalPaid >= totalPrice && totalPrice > 0) {
        finalReceivedToday += totalPaid;
      } else {
        dpReceivedToday += totalPaid;
      }

      bakerySalesDetail.push({
        id: row.external_id,
        reference,
        customerName,
        paymentStatus: normalizedPaymentStatus,
        totalPrice,
        totalPaidAmount: totalPaid,
        remainingBalance,
        createdAt: createdAt?.toISOString() || now.toISOString(),
      });
    }
  }

  return {
    businessDate: getBusinessDateYmd(now),
    businessDateLabel: getBusinessDateLabel(now),
    timeZone: BUSINESS_TIME_ZONE,
    generatedAt: now.toISOString(),
    summary: {
      bookingCountCreatedToday,
      fullyPaidBookingCountCreatedToday,
      bookingSalesCreatedToday,
      pendingFromCreatedToday,
      paymentReceiptCountToday: bakeryPaymentReceiptCountToday,
      dpReceivedToday,
      finalReceivedToday,
      totalPaymentsReceived: bakeryPaymentsReceivedToday,
    },
    reconciliation: {
      bakery: {
        bookingSalesCreatedToday,
        pendingSalesToday: pendingFromCreatedToday,
        paymentsReceivedToday: bakeryPaymentsReceivedToday,
        paymentReceiptCountToday: bakeryPaymentReceiptCountToday,
      },
      deltaPaymentsMinusBookingSales:
        bakeryPaymentsReceivedToday - bookingSalesCreatedToday,
    },
    sales: bakerySalesDetail.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    payments: bakeryPaymentsDetail.sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    ),
  };
}
