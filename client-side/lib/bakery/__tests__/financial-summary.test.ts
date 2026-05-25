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

const seasonalProducts: BakeryFinancialProduct[] = [
  { name: "Lotus Box - Seasonal", cogs: 30333 },
  { name: "Sharing Box (isi 2) - Seasonal", cogs: 9358 },
  { name: "3 in 1 Mini Cookies - Per Pack (isi 3)", cogs: 2300 },
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

  it("should subtract cancelled revenue and recover its cogs through return refund", () => {
    const orders: BakeryFinancialOrder[] = [
      {
        deliveryDate: "2026-05-10",
        totalPrice: 300000,
        totalPaidAmount: 300000,
        paymentStatus: "Paid",
        orderStatus: "Cancelled",
        createdAt: new Date("2026-05-01"),
        items: [
          {
            productName: "Kue Coklat",
            quantity: 1,
            basePrice: 300000,
            lineTotal: 300000,
          },
        ],
      },
    ];

    const result = calculateBakeryFinancialSummary({
      orders,
      products: mockProducts,
      fromDate: "2026-05-01",
      toDate: "2026-05-31",
    });

    expect(result.totalRevenue).toBe(-300000);
    expect(result.cogsCost).toBe(0);
    expect(result.cancelledCogsCost).toBe(5000);
    expect(result.returnRefundAmount).toBe(5000);
    expect(result.totalCost).toBe(-5000);
    expect(result.netProfit).toBe(-295000);
    expect(result.cogsBreakdown).toHaveLength(0);
  });

  it("should recognize delivered revenue even when payment is still partial", () => {
    const orders: BakeryFinancialOrder[] = [
      {
        deliveryDate: "2024-05-10",
        totalPrice: 300000,
        totalPaidAmount: 100000,
        paymentStatus: "DP Paid",
        orderStatus: "Completed",
        createdAt: new Date("2024-05-01"),
        items: [
          {
            productName: "Kue Coklat",
            quantity: 1,
            basePrice: 300000,
            lineTotal: 300000,
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

    expect(result.totalRevenue).toBe(300000);
    expect(result.totalCashFlowIn).toBe(0);
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

  it("should recognize revenue from total sales value, not overpaid cash", () => {
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

  it("should match seasonal product cogs from product name aliases", () => {
    const orders: BakeryFinancialOrder[] = [
      {
        deliveryDate: "2024-05-10",
        totalPrice: 175000,
        totalPaidAmount: 175000,
        paymentStatus: "Paid",
        orderStatus: "Completed",
        createdAt: new Date("2024-05-01"),
        product: "1 item(s)",
        items: [
          {
            productName: "Lotus Box",
            quantity: 1,
            size: "Lotus Box",
            basePrice: 175000,
            lineTotal: 175000,
          },
        ],
      },
      {
        deliveryDate: "2024-05-11",
        totalPrice: 550000,
        totalPaidAmount: 550000,
        paymentStatus: "Paid",
        orderStatus: "Completed",
        createdAt: new Date("2024-05-01"),
        product: "1 item(s)",
        items: [
          {
            productName: "Sharing Box (isi 2)",
            quantity: 10,
            size: "Box isi 2",
            basePrice: 550000,
            lineTotal: 550000,
          },
        ],
      },
      {
        deliveryDate: "2024-05-12",
        totalPrice: 90000,
        totalPaidAmount: 90000,
        paymentStatus: "Paid",
        orderStatus: "Completed",
        createdAt: new Date("2024-05-01"),
        product: "1 item(s)",
        items: [
          {
            productName: "Christmas 2025",
            quantity: 3,
            size: "3 in 1 Mini Cookies (Per pack)",
            basePrice: 90000,
            lineTotal: 90000,
          },
        ],
      },
    ];

    const result = calculateBakeryFinancialSummary({
      orders,
      products: seasonalProducts,
      fromDate: "2024-05-01",
      toDate: "2024-05-31",
    });

    expect(result.cogsCost).toBe(30333 + 9358 * 10 + 2300 * 3);
    expect(result.itemsWithMissingCogs).toBe(0);
  });

  it("should count bouquet cookie-fill quantity as one bouquet unit in cogs", () => {
    const bouquetProducts: BakeryFinancialProduct[] = [
      { name: "Hand Bouquet (7-10 pcs)", cogs: 20000 },
      { name: "Standing Bouquet (12-20 pcs)", cogs: 40000 },
    ];
    const orders: BakeryFinancialOrder[] = [
      {
        deliveryDate: "2024-05-10",
        totalPrice: 150000,
        totalPaidAmount: 150000,
        paymentStatus: "Paid",
        orderStatus: "Completed",
        createdAt: new Date("2024-05-01"),
        items: [
          {
            category: "Buket",
            subcategory: "Hand Bouquet",
            productName: "Hand Bouquet (7-10 pcs)",
            quantity: 9,
            basePrice: 150000,
            lineTotal: 150000,
          },
        ],
      },
      {
        deliveryDate: "2024-05-11",
        totalPrice: 250000,
        totalPaidAmount: 250000,
        paymentStatus: "Paid",
        orderStatus: "Completed",
        createdAt: new Date("2024-05-01"),
        items: [
          {
            category: "Buket",
            subcategory: "Standing Bouquet",
            productName: "Standing Bouquet (12-20 pcs)",
            quantity: 12,
            basePrice: 250000,
            lineTotal: 250000,
          },
        ],
      },
    ];

    const result = calculateBakeryFinancialSummary({
      orders,
      products: bouquetProducts,
      fromDate: "2024-05-01",
      toDate: "2024-05-31",
    });

    expect(result.cogsCost).toBe(60000);
    expect(result.cogsBreakdown).toEqual([
      {
        productName: "Standing Bouquet (12-20 pcs)",
        quantity: 1,
        cogsPerItem: 40000,
        totalCogs: 40000,
      },
      {
        productName: "Hand Bouquet (7-10 pcs)",
        quantity: 1,
        cogsPerItem: 20000,
        totalCogs: 20000,
      },
    ]);
  });
});
