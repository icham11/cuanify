/**
 * WhatsApp Parser — Mixed Order Autofill Tests
 *
 * These tests focus on mixed-order extraction rules so legacy and
 * multi-category WhatsApp orders are mapped into booking items correctly.
 */

declare const describe: {
  (name: string, fn: () => void): void;
  skip: (name: string, fn: () => void) => void;
};
declare const it: (name: string, fn: () => void | Promise<void>) => void;
declare const expect: (value: unknown) => {
  toBe: (expected: unknown) => void;
  toEqual: (expected: unknown) => void;
  toHaveLength: (expected: number) => void;
};

import {
  buildBookingAutoFillFromParsed,
  parseWhatsAppOrderText,
} from "../whatsapp-parser";

function buildAutoFillFromOrderLine(orderLine: string) {
  const text = [
    "Data Cake",
    "Tanggal Pengiriman: 26 Maret 2026",
    "KODE BOOKING: BK-123",
    `Order: ${orderLine}`,
    "Nama di Cake: A",
    "Umur di cake: 10",
    "Ukuran cake: 18 cm",
    "Rasa cake: Coklat",
    "Design cake: Simple",
    "Jam Pengiriman: 10:00",
    "Metode Pengiriman: Gocar",
    "Nama penerima: Test Customer",
    "No. telp penerima: 081234567890",
    "Alamat lengkap: Central City",
  ].join("\n");

  const parsed = parseWhatsAppOrderText(text, {
    preferredOrderType: "cake",
    sourceType: "manual",
  });

  return buildBookingAutoFillFromParsed(parsed);
}

describe("WhatsApp Parser — Mixed Order Autofill", () => {
  it("adds supplemental categories with mapped quantities", () => {
    const autoFill = buildAutoFillFromOrderLine(
      "1 cake + 2 buket + 3 cookies + 1 cookies tower",
    );

    const categories = autoFill.items.map((item) => item.category).sort();
    expect(categories).toEqual(["Buket", "Cake", "Cookies", "Cookies Tower"]);

    const quantitiesByCategory = new Map(
      autoFill.items.map((item) => [item.category, item.quantity]),
    );

    expect(quantitiesByCategory.get("Cake")).toBe(1);
    expect(quantitiesByCategory.get("Buket")).toBe(2);
    expect(quantitiesByCategory.get("Cookies")).toBe(3);
    expect(quantitiesByCategory.get("Cookies Tower")).toBe(1);
  });

  it("splits cupcakes into dozen and individual items", () => {
    const autoFill = buildAutoFillFromOrderLine(
      "1 cake + 2 dozen cupcakes + 4 individual cupcakes",
    );

    const cupcakeQuantities = autoFill.items
      .filter((item) => item.category === "Cupcakes")
      .map((item) => item.quantity)
      .sort((a, b) => a - b);

    expect(cupcakeQuantities).toHaveLength(2);
    expect(cupcakeQuantities).toEqual([2, 4]);
  });

  it("does not create cookies item for topper cookies phrase", () => {
    const autoFill = buildAutoFillFromOrderLine("1 cake + 8 topper cookies");

    const hasCookiesSupplement = autoFill.items.some(
      (item) => item.category === "Cookies",
    );

    expect(hasCookiesSupplement).toBe(false);
    expect(autoFill.items.map((item) => item.category)).toEqual(["Cake"]);
  });
});
