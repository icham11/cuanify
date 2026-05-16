import { describe, it, expect } from "vitest";
import {
  calculateBakeryFinancialSummary,
  filterBakeryOrdersByDateRange,
  type BakeryFinancialOrder,
  type BakeryFinancialProduct,
} from "../financial-summary";

const mockProducts: BakeryFinancialProduct[] = [
  { name: "Kue Coklat", cogs: 5000 },
  { name: "Roti Tawar", cogs: 3000 },
];

describe("Revenue vs Cashflow Calculation", () => {
  it("should recognize revenue on delivery date, not payment date", () => {
    // Scenario: Order created May 1, paid May 5, delivered May 10
    const orders: BakeryFinancialOrder[] = [
      {
        deliveryDate: "2024-05-10",
        totalPrice: 100000,
        totalPaidAmount: 100000,
        paymentStatus: "Paid",
        orderStatus: "Completed",
        createdAt: new Date("2024-05-01"),
        items: [
          {
            productName: "Kue Coklat",
            quantity: 1,
            basePrice: 100000,
            lineTotal: 100000,
          },
        ],
      },
    ];

    // Check May 5 range (payment date) - should have NO revenue
    const mayFiveResult = calculateBakeryFinancialSummary({
      orders,
      products: mockProducts,
      fromDate: "2024-05-05",
      toDate: "2024-05-05",
    });
    expect(mayFiveResult.totalRevenue).toBe(0);

    // Check May 10 range (delivery date) - should have revenue
    const mayTenResult = calculateBakeryFinancialSummary({
      orders,
      products: mockProducts,
      fromDate: "2024-05-10",
      toDate: "2024-05-10",
    });
    expect(mayTenResult.totalRevenue).toBe(100000);
  });

  it("should recognize cashflow on booking created date, not delivery date", () => {
    // Scenario: Order created May 1, paid May 5, delivered May 10
    const orders: BakeryFinancialOrder[] = [
      {
        deliveryDate: "2024-05-10",
        totalPrice: 100000,
        totalPaidAmount: 100000,
        paymentStatus: "Paid",
        orderStatus: "Completed",
        createdAt: new Date("2024-05-01"),
        items: [
          {
            productName: "Kue Coklat",
            quantity: 1,
            basePrice: 100000,
            lineTotal: 100000,
          },
        ],
      },
    ];

    // Check May 1 range (booking created) - should have cashflow
    const mayOneResult = calculateBakeryFinancialSummary({
      orders,
      products: mockProducts,
      fromDate: "2024-05-01",
      toDate: "2024-05-01",
    });
    expect(mayOneResult.totalCashFlowIn).toBe(100000);

    // Check May 10 range (delivery) - should have NO cashflow (booking was before)
    const mayTenResult = calculateBakeryFinancialSummary({
      orders,
      products: mockProducts,
      fromDate: "2024-05-10",
      toDate: "2024-05-10",
    });
    expect(mayTenResult.totalCashFlowIn).toBe(0);
  });

  it("should have different revenue and cashflow in the same period", () => {
    // Scenario 1: Booking created May 1, delivered & paid May 10
    const order1: BakeryFinancialOrder = {
      deliveryDate: "2024-05-10",
      totalPrice: 100000,
      totalPaidAmount: 100000,
      paymentStatus: "Paid",
      orderStatus: "Completed",
      createdAt: new Date("2024-05-01"),
      items: [
        {
          productName: "Kue Coklat",
          quantity: 1,
          basePrice: 100000,
          lineTotal: 100000,
        },
      ],
    };

    // Scenario 2: Booking created May 10, delivered & paid May 20
    const order2: BakeryFinancialOrder = {
      deliveryDate: "2024-05-20",
      totalPrice: 50000,
      totalPaidAmount: 50000,
      paymentStatus: "Paid",
      orderStatus: "Completed",
      createdAt: new Date("2024-05-10"),
      items: [
        {
          productName: "Roti Tawar",
          quantity: 1,
          basePrice: 50000,
          lineTotal: 50000,
        },
      ],
    };

    // For May 10 (only order2 booking, order1 delivery):
    // Revenue = 100k (order1 delivered)
    // Cashflow = 50k (order2 booked)
    const mayTenResult = calculateBakeryFinancialSummary({
      orders: [order1, order2],
      products: mockProducts,
      fromDate: "2024-05-10",
      toDate: "2024-05-10",
    });

    expect(mayTenResult.totalRevenue).toBe(100000);
    expect(mayTenResult.totalCashFlowIn).toBe(50000);
    expect(mayTenResult.totalRevenue).not.toBe(mayTenResult.totalCashFlowIn);
  });

  it("should filter orders correctly by revenue or cashflow in range", () => {
    const orders: BakeryFinancialOrder[] = [
      {
        deliveryDate: "2024-05-10",
        totalPrice: 100000,
        totalPaidAmount: 100000,
        paymentStatus: "Paid",
        orderStatus: "Completed",
        createdAt: new Date("2024-05-01"),
        items: [
          {
            productName: "Kue Coklat",
            quantity: 1,
            basePrice: 100000,
            lineTotal: 100000,
          },
        ],
      },
    ];

    // Filters for May 1-9 (booking created) should include order
    const mayOneToNineFiltered = filterBakeryOrdersByDateRange(
      orders,
      "2024-05-01",
      "2024-05-09",
    );
    expect(mayOneToNineFiltered.length).toBe(1);

    // Filters for May 10-31 (delivery) should include order
    const mayTenToMonthEndFiltered = filterBakeryOrdersByDateRange(
      orders,
      "2024-05-10",
      "2024-05-31",
    );
    expect(mayTenToMonthEndFiltered.length).toBe(1);

    // Filters for June (outside both) should NOT include order
    const juneFiltered = filterBakeryOrdersByDateRange(
      orders,
      "2024-06-01",
      "2024-06-30",
    );
    expect(juneFiltered.length).toBe(0);
  });

  it("should handle orders with no delivery date (pending orders)", () => {
    const orders: BakeryFinancialOrder[] = [
      {
        // No delivery date - order still pending
        deliveryDate: undefined,
        totalPrice: 100000,
        totalPaidAmount: 50000,
        paymentStatus: "DP Paid",
        orderStatus: "Pending",
        createdAt: new Date("2024-05-01"),
        items: [
          {
            productName: "Kue Coklat",
            quantity: 1,
            basePrice: 100000,
            lineTotal: 100000,
          },
        ],
      },
    ];

    const mayOneResult = calculateBakeryFinancialSummary({
      orders,
      products: mockProducts,
      fromDate: "2024-05-01",
      toDate: "2024-05-01",
    });

    // Should have cashflow (booking created) but no revenue (not delivered)
    expect(mayOneResult.totalCashFlowIn).toBe(50000);
    expect(mayOneResult.totalRevenue).toBe(0);
  });

  it("should fall back to payment transaction dates for legacy orders without createdAt", () => {
    const orders: BakeryFinancialOrder[] = [
      {
        deliveryDate: undefined,
        totalPrice: 100000,
        totalPaidAmount: 50000,
        paymentStatus: "DP Paid",
        orderStatus: "Pending",
        paymentTransactions: [
          {
            timestamp: "2024-05-08T08:30:00.000Z",
            amount: 50000,
            type: "DP",
          },
        ],
        items: [
          {
            productName: "Kue Coklat",
            quantity: 1,
            basePrice: 100000,
            lineTotal: 100000,
          },
        ],
      },
    ];

    const result = calculateBakeryFinancialSummary({
      orders,
      products: mockProducts,
      fromDate: "2024-05-08",
      toDate: "2024-05-08",
    });

    expect(result.totalCashFlowIn).toBe(50000);
    expect(result.totalRevenue).toBe(0);
  });

  it("should recognize revenue capped at total price", () => {
    const orders: BakeryFinancialOrder[] = [
      {
        deliveryDate: "2024-05-10",
        totalPrice: 100000,
        // Paid more than total price (shouldn't happen but should be capped)
        totalPaidAmount: 150000,
        paymentStatus: "Paid",
        orderStatus: "Completed",
        createdAt: new Date("2024-05-01"),
        items: [
          {
            productName: "Kue Coklat",
            quantity: 1,
            basePrice: 100000,
            lineTotal: 100000,
          },
        ],
      },
    ];

    const result = calculateBakeryFinancialSummary({
      orders,
      products: mockProducts,
      fromDate: "2024-05-10",
      toDate: "2024-05-10",
    });

    // Revenue should be capped at total price
    expect(result.totalRevenue).toBe(100000);
  });

  it("should recognize monthly revenue on delivery month, not booking month", () => {
    const orders: BakeryFinancialOrder[] = [
      {
        deliveryDate: "2024-06-03",
        totalPrice: 250000,
        totalPaidAmount: 250000,
        paymentStatus: "Paid",
        orderStatus: "Completed",
        createdAt: new Date("2024-05-28"),
        items: [
          {
            productName: "Kue Coklat",
            quantity: 1,
            basePrice: 250000,
            lineTotal: 250000,
          },
        ],
      },
    ];

    const maySummary = calculateBakeryFinancialSummary({
      orders,
      products: mockProducts,
      fromDate: "2024-05-01",
      toDate: "2024-05-31",
    });

    const juneSummary = calculateBakeryFinancialSummary({
      orders,
      products: mockProducts,
      fromDate: "2024-06-01",
      toDate: "2024-06-30",
    });

    expect(maySummary.totalRevenue).toBe(0);
    expect(juneSummary.totalRevenue).toBe(250000);
  });
});
