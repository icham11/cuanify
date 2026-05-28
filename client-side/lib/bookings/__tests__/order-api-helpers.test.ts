declare const describe: {
  (name: string, fn: () => void): void;
};
declare const it: (name: string, fn: () => void | Promise<void>) => void;
declare const expect: (value: unknown) => {
  toBe: (expected: unknown) => void;
};

import {
  buildCaptionItems,
  buildWhatsAppDesignNotes,
  type NormalizedOrder,
} from "../order-api-helpers";

function createNormalizedOrder(
  overrides: Partial<NormalizedOrder> = {},
): NormalizedOrder {
  return {
    id: "order-1",
    bookingCode: "VI-36",
    resi: "",
    customerName: "Vivi",
    customerPhone: "08990788136",
    customerAddress: "Jakarta",
    deliveryDate: "2026-05-30",
    deliverySlot: "10:00",
    notes: "",
    basePrice: 0,
    addOnTotal: 0,
    deliveryFee: 0,
    manualAdjustment: 0,
    dpPaidAmount: 0,
    finalPaidAmount: 0,
    totalPaidAmount: 0,
    downPaymentAmount: 0,
    remainingBalance: 0,
    product: "Custom Cookies",
    totalPrice: 529000,
    insuranceFee: 0,
    sales_channel: "direct",
    paymentStatus: "Pending",
    orderStatus: "Pending",
    assignedStaffUserId: null,
    assignedStaffName: "",
    productionAssignedAt: null,
    shippingQuote: null,
    shipment: null,
    simulations: null,
    whatsAppParsedData: null,
    imageUrl: "",
    imageUrls: [],
    referenceImages: [],
    statusHistory: [],
    automationLogs: [],
    paymentTransactions: [],
    productionStages: [],
    items: [],
    deliveryAddresses: [],
    deletedAt: null,
    ...overrides,
  };
}

describe("order api helpers whatsapp caption", () => {
  it("extracts the original design block from raw whatsapp text", () => {
    const order = createNormalizedOrder({
      whatsAppParsedData: {
        orderType: "cookies",
        rawText: [
          "Order:",
          "- 13pcs advance cookies",
          "- 7 simple cookies",
          "",
          "Design :",
          "1. pinguin",
          "2. Kucing hijau",
          "3. panda",
          "(All design full body)",
          "",
          "Jam Pengiriman : 10.00",
        ].join("\n"),
        detailsByOrderType: {
          cookies: {
            cookieDesign: "6 (extra 1 x Rp 10.000)",
            cookieCount: "7",
          },
        },
      },
    });

    expect(buildWhatsAppDesignNotes(order)).toBe(
      ["1. pinguin", "2. Kucing hijau", "3. panda", "(All design full body)"].join(
        "\n",
      ),
    );
  });

  it("keeps only one detailed design section for cookie caption items", () => {
    const order = createNormalizedOrder({
      whatsAppParsedData: {
        orderType: "cookies",
        rawText: [
          "Design :",
          "1. pinguin",
          "2. Kucing hijau",
          "3. panda",
          "",
          "Jam Pengiriman : 10.00",
        ].join("\n"),
        detailsByOrderType: {
          cookies: {
            cookieDesign: "6 (extra 1 x Rp 10.000)",
            cookieCount: "7",
          },
        },
      },
      items: [
        {
          productType: "COOKIE",
          productName: "Advanced Cookies",
          quantity: 13,
          selectedPrice: 30000,
        },
        {
          productType: "COOKIE",
          productName: "Simple Cookies",
          quantity: 7,
          selectedPrice: 17000,
        },
      ],
    });

    const captionItems = buildCaptionItems(order);

    expect(JSON.stringify(captionItems[0]?.detailLines ?? [])).toBe(
      JSON.stringify([
        {
          label: "Design",
          value: ["1. pinguin", "2. Kucing hijau", "3. panda"].join("\n"),
        },
      ]),
    );
    expect(JSON.stringify(captionItems[1]?.detailLines ?? [])).toBe(
      JSON.stringify([]),
    );
  });

  it("uses requested image labels as design fallback when parser design is empty", () => {
    const order = createNormalizedOrder({
      whatsAppParsedData: {
        orderType: "cookies",
        requestedImageLabels: ["Design pertama", "Design kedua"],
        referenceImages: [
          {
            url: "https://example.com/1.jpg",
            note: "Design pertama",
            orderIndex: 0,
          },
          {
            url: "https://example.com/2.jpg",
            note: "Design kedua",
            orderIndex: 1,
          },
        ],
      },
      referenceImages: [
        {
          url: "https://example.com/1.jpg",
          note: "Design pertama",
          orderIndex: 0,
        },
        {
          url: "https://example.com/2.jpg",
          note: "Design kedua",
          orderIndex: 1,
        },
      ],
    });

    expect(buildWhatsAppDesignNotes(order)).toBe(
      ["Design pertama", "Design kedua"].join("\n"),
    );
  });
});
