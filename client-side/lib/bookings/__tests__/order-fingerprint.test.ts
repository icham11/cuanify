import { describe, expect, it } from "vitest";

import { buildOrderFingerprint } from "@/lib/bookings/order-fingerprint";

const baseOrder = {
  customerName: "Krisna",
  customerPhone: "080790774773",
  deliveryDate: "2026-07-22",
  deliverySlot: "11.00",
  notes: "Design: chopper",
  totalPrice: 500000,
  items: [
    {
      category: "Cookies",
      productName: "Custom Cookies",
      quantity: 40,
      lineTotal: 500000,
    },
  ],
  deliveryAddresses: [
    {
      label: "Alamat 1",
      addressLine: "Apartment Bintaro Parkview",
    },
  ],
};

describe("buildOrderFingerprint", () => {
  it("changes when delivery method changes", () => {
    const pickup = buildOrderFingerprint({
      ...baseOrder,
      deliveryMethod: "Pickup",
    });
    const assistedDelivery = buildOrderFingerprint({
      ...baseOrder,
      deliveryMethod: "Gojek/Grab (dibantu admin)",
    });

    expect(assistedDelivery).not.toBe(pickup);
  });

  it("changes when shipping quote provider changes", () => {
    const goSend = buildOrderFingerprint({
      ...baseOrder,
      deliveryMethod: "Gosend (dibantu admin)",
      shippingQuote: {
        provider: "GoSend",
        courierServiceName: "Instant",
        price: 45000,
      },
    });
    const grab = buildOrderFingerprint({
      ...baseOrder,
      deliveryMethod: "Grab (dibantu admin)",
      shippingQuote: {
        provider: "Grab",
        courierServiceName: "Instant",
        price: 45000,
      },
    });

    expect(grab).not.toBe(goSend);
  });
});
