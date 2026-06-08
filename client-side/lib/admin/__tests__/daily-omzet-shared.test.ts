import { describe, expect, it } from "vitest";
import {
  buildDailyOmzetSummaryCards,
  formatDailyOmzetPaymentStatusLabel,
  getDailyOmzetDerivedCounts,
  type DailyOmzetSnapshot,
} from "../daily-omzet-shared";

const snapshot: DailyOmzetSnapshot = {
  businessDate: "2026-06-08",
  businessDateLabel: "Senin, 08 Juni 2026",
  timeZone: "Asia/Jakarta",
  generatedAt: "2026-06-08T10:00:00.000Z",
  summary: {
    bookingCountCreatedToday: 3,
    fullyPaidBookingCountCreatedToday: 1,
    bookingSalesCreatedToday: 450000,
    pendingFromCreatedToday: 150000,
    paymentReceiptCountToday: 3,
    dpReceivedToday: 150000,
    finalReceivedToday: 200000,
    totalPaymentsReceived: 350000,
  },
  reconciliation: {
    bakery: {
      bookingSalesCreatedToday: 450000,
      pendingSalesToday: 150000,
      paymentsReceivedToday: 350000,
      paymentReceiptCountToday: 3,
    },
    deltaPaymentsMinusBookingSales: -100000,
  },
  sales: [
    {
      id: "order-1",
      reference: "BK-001",
      customerName: "Alya",
      paymentStatus: "Paid",
      totalPrice: 200000,
      totalPaidAmount: 200000,
      remainingBalance: 0,
      createdAt: "2026-06-08T03:00:00.000Z",
    },
    {
      id: "order-2",
      reference: "BK-002",
      customerName: "Bima",
      paymentStatus: "DP Paid",
      totalPrice: 150000,
      totalPaidAmount: 100000,
      remainingBalance: 50000,
      createdAt: "2026-06-08T04:00:00.000Z",
    },
    {
      id: "order-3",
      reference: "BK-003",
      customerName: "Caca",
      paymentStatus: "Pending",
      totalPrice: 100000,
      totalPaidAmount: 50000,
      remainingBalance: 50000,
      createdAt: "2026-06-08T05:00:00.000Z",
    },
  ],
  payments: [
    {
      id: "pay-1",
      reference: "BK-001",
      customerName: "Alya",
      amount: 200000,
      paymentType: "Final",
      createdAt: "2026-06-08T03:00:00.000Z",
    },
    {
      id: "pay-2",
      reference: "BK-002",
      customerName: "Bima",
      amount: 100000,
      paymentType: "DP",
      createdAt: "2026-06-08T04:00:00.000Z",
    },
    {
      id: "pay-3",
      reference: "BK-003",
      customerName: "Caca",
      amount: 50000,
      paymentType: "DP",
      createdAt: "2026-06-08T05:00:00.000Z",
    },
  ],
};

describe("daily omzet shared helpers", () => {
  it("derives paid, fully-paid, and receipt counts from the same snapshot", () => {
    expect(getDailyOmzetDerivedCounts(snapshot)).toEqual({
      paidBookingCount: 3,
      fullyPaidBookingCount: 1,
      dpReceiptCount: 2,
      finalReceiptCount: 1,
    });
  });

  it("builds summary cards from snapshot values and derived counts", () => {
    const cards = buildDailyOmzetSummaryCards(snapshot, (value) => `Rp ${value}`);

    expect(cards).toEqual([
      {
        key: "paymentsReceived",
        title: "Uang Masuk Hari Ini",
        value: "Rp 350000",
        hint: "3 booking menerima pembayaran di tanggal ini",
      },
      {
        key: "bookingSales",
        title: "Total Pesanan Tanggal Ini",
        value: "Rp 450000",
        hint: "3 booking masuk ke tanggal bisnis ini",
      },
      {
        key: "pendingBalance",
        title: "Sisa Belum Lunas Tanggal Ini",
        value: "Rp 150000",
        hint: "Sisa tagihan dari booking pada tanggal bisnis ini",
      },
      {
        key: "fullyPaidBookings",
        title: "Booking Lunas di Tanggal Ini",
        value: "1 booking",
        hint: "2 transaksi DP, 1 transaksi pelunasan",
      },
    ]);
  });

  it("formats payment status labels for shared owner and admin views", () => {
    expect(formatDailyOmzetPaymentStatusLabel("Paid")).toBe("Lunas");
    expect(formatDailyOmzetPaymentStatusLabel("DP Paid")).toBe("DP");
    expect(formatDailyOmzetPaymentStatusLabel("Pending")).toBe("Belum Bayar");
    expect(formatDailyOmzetPaymentStatusLabel("Unknown")).toBe("-");
  });
});
