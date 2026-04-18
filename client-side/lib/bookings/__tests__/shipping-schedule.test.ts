declare const describe: {
  (name: string, fn: () => void): void;
  skip: (name: string, fn: () => void) => void;
};
declare const it: (name: string, fn: () => void | Promise<void>) => void;
declare const expect: (value: unknown) => {
  toBe: (expected: unknown) => void;
};

import {
  getJakartaTodayIsoDate,
  inferScheduledProviderFromQuote,
  isDueForScheduledShipment,
  isScheduledShipmentOrder,
  isTodayScheduledReminderOrder,
  resolveShippingProvider,
} from "../shipping-schedule";

describe("Shipping schedule provider inference", () => {
  it("infers provider from explicit provider value (case-insensitive)", () => {
    expect(inferScheduledProviderFromQuote({ provider: "grab" })).toBe("GRAB");
    expect(inferScheduledProviderFromQuote({ provider: "gojek" })).toBe(
      "GOJEK",
    );
    expect(inferScheduledProviderFromQuote({ provider: "paxel" })).toBe(
      "PAXEL",
    );
  });

  it("infers GRAB from service name variants like Same Day / Instant / Instant Car", () => {
    expect(
      inferScheduledProviderFromQuote({ courierServiceName: "GRAB - Same Day" }),
    ).toBe("GRAB");
    expect(
      inferScheduledProviderFromQuote({ courierServiceName: "Grab - Instant" }),
    ).toBe("GRAB");
    expect(
      inferScheduledProviderFromQuote({ courierServiceName: "GRAB - Instant Car" }),
    ).toBe("GRAB");
  });

  it("infers GOJEK and PAXEL from courier code/service code variants", () => {
    expect(
      inferScheduledProviderFromQuote({ courierCode: "gosend_instant" }),
    ).toBe("GOJEK");
    expect(
      inferScheduledProviderFromQuote({ courierServiceCode: "gocar_sameday" }),
    ).toBe("GOJEK");
    expect(
      inferScheduledProviderFromQuote({ courierServiceCode: "pxl_sameday" }),
    ).toBe("PAXEL");
  });
});

describe("Shipping schedule due and reminder", () => {
  it("treats recognized quote variants as scheduled shipment order", () => {
    const order = {
      deliveryDate: "2026-05-01",
      deliverySlot: "10:00",
      orderStatus: "In Production",
      shippingQuote: {
        courierServiceName: "GRAB - Instant Car",
      },
    };

    expect(isScheduledShipmentOrder(order)).toBe(true);
    expect(resolveShippingProvider(order)).toBe("GRAB");
  });

  it("marks past GOJEK/GRAB/PAXEL variant order as due even when provider field is absent", () => {
    const order = {
      deliveryDate: "2020-01-01",
      deliverySlot: "10:00",
      orderStatus: "In Production",
      shippingQuote: {
        courierCode: "gosend",
        courierServiceCode: "instant",
        courierServiceName: "GoSend - Instant",
      },
      shipment: null,
    };

    expect(isDueForScheduledShipment(order, "2026-04-18")).toBe(true);
  });

  it("shows reminder for today Paxel variant even with provider inferred from service name", () => {
    const today = getJakartaTodayIsoDate();
    const order = {
      deliveryDate: today,
      orderStatus: "In Production",
      shippingQuote: {
        courierServiceName: "Paxel - Same Day",
      },
      shipment: null,
    };

    expect(isTodayScheduledReminderOrder(order, today)).toBe(true);
  });
});
