import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendWhatsAppSequence: vi.fn(async () => {}),
  sendWhatsAppText: vi.fn(async () => {}),
  sendWhatsAppImage: vi.fn(async () => {}),
}));

vi.mock("@/lib/whatsapp/sendWhatsApp", () => mocks);
vi.mock("@/lib/whatsapp/uploadToCloudinary", () => ({
  uploadToCloudinary: vi.fn(),
}));

import { sendOrderToWhatsApp } from "@/lib/whatsapp/sendOrderToWhatsApp";

describe("sendOrderToWhatsApp recap override (update order)", () => {
  beforeEach(() => {
    vi.stubEnv("FONNTE_TOKEN", "test-token");
    vi.stubEnv("FONNTE_PRODUCTION_TARGET", "120363000000000000@g.us");
    mocks.sendWhatsAppSequence.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sends the update recap text instead of the default caption", async () => {
    const result = await sendOrderToWhatsApp({
      bookingCode: "TES-WA-01",
      deliveryDate: "2026-10-12",
      recipientName: "Tes",
      recipientPhone: "081234567890",
      captionItems: [{ productName: "Cake", orderLabel: "Cake", detailLines: [] }],
      recapTextOverride: "*UPDATE ORDER*\n\nRekap terbaru",
    });

    expect(result.ok).toBe(true);
    expect(mocks.sendWhatsAppSequence).toHaveBeenCalledTimes(1);
    expect(mocks.sendWhatsAppSequence).toHaveBeenCalledWith([
      { message: "*UPDATE ORDER*\n\nRekap terbaru" },
    ]);
  });
});
