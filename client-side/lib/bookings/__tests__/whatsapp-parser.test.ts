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

  it("detects cake supplement when primary parse is cupcakes", () => {
    const text = [
      "Data Cupcakes",
      "Tanggal Pengiriman: 26 Maret 2026",
      "KODE BOOKING: BK-456",
      "Order: 1 dozen cupcakes + 1 cookies",
      "Jumlah Cupcakes: 1 dozen",
      "Rasa Cupcakes: Vanilla",
      "Warna Cupcakes: Pink",
      "Jumlah Topper Cookies: 0",
      "Nama di Cake: Alya",
      "Ukuran cake: 16 cm",
      "Jam Pengiriman: 10:00",
      "Metode Pengiriman: Gocar",
      "Nama penerima: Test Mixed",
      "No. telp penerima: 081234567891",
      "Alamat lengkap: Central City",
    ].join("\n");

    const parsed = parseWhatsAppOrderText(text, {
      preferredOrderType: "unknown",
      sourceType: "manual",
    });
    const autoFill = buildBookingAutoFillFromParsed(parsed);

    const categories = autoFill.items.map((item) => item.category).sort();
    expect(categories).toEqual(["Cake", "Cookies", "Cupcakes"]);

    const quantitiesByCategory = new Map(
      autoFill.items.map((item) => [item.category, item.quantity]),
    );

    expect(quantitiesByCategory.get("Cupcakes")).toBe(1);
    expect(quantitiesByCategory.get("Cookies")).toBe(1);
    expect(quantitiesByCategory.get("Cake")).toBe(1);
  });

  it("auto-checks dark color buttercream add-on with parsed color", () => {
    const text = [
      "Data Cupcakes",
      "Tanggal Pengiriman: 26 Maret 2026",
      "KODE BOOKING: BK-999",
      "Order: 1 individual cupcakes dengan dark color buttercream warna black",
      "Jumlah Cupcakes: 1 indv",
      "Rasa Cupcakes: Vanilla",
      "Warna Cupcakes: black",
      "Jumlah Topper Cookies: 0",
      "Jam Pengiriman: 10:00",
      "Metode Pengiriman: Gocar",
      "Nama penerima: Test Cupcake",
      "No. telp penerima: 081234567892",
      "Alamat lengkap: Central City",
    ].join("\n");

    const parsed = parseWhatsAppOrderText(text, {
      preferredOrderType: "cupcakes",
      sourceType: "manual",
    });
    const autoFill = buildBookingAutoFillFromParsed(parsed);
    const cupcakeItem = autoFill.items.find(
      (item) => item.category === "Cupcakes",
    );

    expect(Boolean(cupcakeItem)).toBe(true);
    if (!cupcakeItem) {
      throw new Error("Cupcakes item was not generated");
    }

    expect(cupcakeItem.addOns.includes("dark-color-buttercream")).toBe(true);
    expect(cupcakeItem.darkColorButtercreamColors).toEqual(["Black"]);
    expect(cupcakeItem.darkColorButtercreamColor).toBe("Black");
  });

  it("prioritizes order individual cupcakes and quantity even with detail default dozen", () => {
    const text = [
      "Data Cupcakes",
      "Tanggal Pengiriman: 5/4/26",
      "KODE BOOKING: ST-28",
      "Order:",
      "2 indivial cupcakes dengan dark color buttercream warna red",
      "Jumlah Cupcakes: 1 dozen +",
      "Rasa Cupcakes: -",
      "Warna Cupcakes: red",
      "Jumlah Topper Cookies: -",
      "Jam Pengiriman: 10:00",
      "Metode Pengiriman: Gocar",
      "Nama penerima: Test Individual",
      "No. telp penerima: 081234567893",
      "Alamat lengkap: Central City",
    ].join("\n");

    const parsed = parseWhatsAppOrderText(text, {
      preferredOrderType: "cupcakes",
      sourceType: "manual",
    });
    const autoFill = buildBookingAutoFillFromParsed(parsed);

    const cupcakeItems = autoFill.items.filter(
      (item) => item.category === "Cupcakes",
    );
    expect(cupcakeItems.length).toBe(1);

    const cupcakeItem = cupcakeItems[0];
    expect(cupcakeItem.productName).toBe("Individual Cupcakes");
    expect(cupcakeItem.quantity).toBe(2);
    expect(cupcakeItem.addOns.includes("dark-color-buttercream")).toBe(true);
    expect(cupcakeItem.darkColorButtercreamColors).toEqual(["Red"]);
    expect(cupcakeItem.darkColorButtercreamColor).toBe("Red");
  });

  it("treats 12 pcs individual cupcakes as individual quantity, not dozen", () => {
    const text = [
      "Data Cupcakes",
      "Tanggal Pengiriman: 6/4/26",
      "KODE BOOKING: ST-29",
      "Order:",
      "12 pcs individual cupcakes dengan dark color buttercream warna navy",
      "Jumlah Cupcakes: 1 dozen +",
      "Rasa Cupcakes: Vanilla",
      "Warna Cupcakes: navy",
      "Jumlah Topper Cookies: -",
      "Jam Pengiriman: 11:00",
      "Metode Pengiriman: Gocar",
      "Nama penerima: Test 12 Pcs Individual",
      "No. telp penerima: 081234567894",
      "Alamat lengkap: Central City",
    ].join("\n");

    const parsed = parseWhatsAppOrderText(text, {
      preferredOrderType: "cupcakes",
      sourceType: "manual",
    });
    const autoFill = buildBookingAutoFillFromParsed(parsed);

    const cupcakeItems = autoFill.items.filter(
      (item) => item.category === "Cupcakes",
    );
    expect(cupcakeItems.length).toBe(1);

    const cupcakeItem = cupcakeItems[0];
    expect(cupcakeItem.productName).toBe("Individual Cupcakes");
    expect(cupcakeItem.quantity).toBe(12);
    expect(cupcakeItem.darkColorButtercreamColors).toEqual(["Navy Blue"]);
    expect(cupcakeItem.darkColorButtercreamColor).toBe("Navy Blue");
  });

  it("detects up to 3 dark buttercream colors from order text", () => {
    const text = [
      "Data Cupcakes",
      "Tanggal Pengiriman: 7/4/26",
      "KODE BOOKING: ST-30",
      "Order:",
      "1 dozen cupcakes dark color buttercream black red navy blue forest green",
      "Jumlah Cupcakes: 1 dozen",
      "Rasa Cupcakes: Vanilla",
      "Warna Cupcakes: black red navy",
      "Jumlah Topper Cookies: -",
      "Jam Pengiriman: 11:00",
      "Metode Pengiriman: Gocar",
      "Nama penerima: Test Multi Color",
      "No. telp penerima: 081234567895",
      "Alamat lengkap: Central City",
    ].join("\n");

    const parsed = parseWhatsAppOrderText(text, {
      preferredOrderType: "cupcakes",
      sourceType: "manual",
    });
    const autoFill = buildBookingAutoFillFromParsed(parsed);

    const cupcakeItems = autoFill.items.filter(
      (item) => item.category === "Cupcakes",
    );
    expect(cupcakeItems.length).toBe(1);

    const cupcakeItem = cupcakeItems[0];
    expect(cupcakeItem.darkColorButtercreamColors).toEqual([
      "Black",
      "Red",
      "Navy Blue",
    ]);
    expect(cupcakeItem.darkColorButtercreamColor).toBe("Black");
  });

  it("captures multiline cupcake color and pickup wording from compact WhatsApp text", () => {
    const text = [
      "Tanggal Pengiriman: (4/5/26)",
      "KODE BOOKING : ST-28",
      "Order:",
      "1 dozen",
      "cupcakes",
      "4pcs indv cupcakes",
      "Jumlah Cupcakes : 1 dozen +",
      "40pcs indv",
      "20 cake",
      "20 cookies",
      "Rasa Cupcakes : dozen : dc, indv :",
      "CV",
      "Warna Cupcakes : ungu muda ,",
      "biru, pink muda",
      "Jumlah Topper Cookies : -",
      "Jam Pengiriman : 10.00",
      "Metode Pengiriman : ambil Nama penerima : stella delvia",
      "No. telp penerima : 08119882528",
      "Alamat lengkap : pik",
    ].join("\n");

    const parsed = parseWhatsAppOrderText(text, {
      preferredOrderType: "cupcakes",
      sourceType: "manual",
    });

    expect(parsed.details.cupcakeFlavor).toBe("dozen : dc, indv : CV");
    expect(parsed.details.cupcakeColor).toBe("ungu muda, biru, pink muda");
    expect(parsed.common.deliveryMethod).toBe("Pickup");
    expect(parsed.common.recipientName).toBe("stella delvia");
  });

  it("keeps parser area blank for GoSend input so shipping uses full address", () => {
    const text = [
      "Tanggal Pengiriman : (8/4/26)",
      "KODE BOOKING : GA-56",
      "Order:",
      "20pcs indv cookies",
      "Jam Pengiriman : 10.00 WIB",
      "Metode Pengiriman : GoSend",
      "Nama penerima : Gara BFM",
      "No. telp penerima : 082381297556",
      "Alamat lengkap : AGRO PLAZA - Jl. H. R. Rasuna Said X-2 No. 1 Kec. Setiabudi - Jakarta Selatan DKI Jakarta",
    ].join("\n");

    const parsed = parseWhatsAppOrderText(text, {
      preferredOrderType: "cookies",
      sourceType: "manual",
    });
    const autoFill = buildBookingAutoFillFromParsed(parsed);

    const primaryAddress = autoFill.deliveryAddresses[0];
    expect(autoFill.deliveryMethod).toBe("ASSISTED_GOSEND");
    expect(primaryAddress?.area).toBe("");
  });

  it("defaults bare Gocar text to assisted GoCar so address can trigger live shipping", () => {
    const autoFill = buildAutoFillFromOrderLine("1 cake");
    expect(autoFill.deliveryMethod).toBe("ASSISTED_GOCAR");
  });

  it("keeps explicit customer-arranged courier as customer app courier", () => {
    const text = [
      "Tanggal Pengiriman : (9/4/26)",
      "KODE BOOKING : GA-57",
      "Order:",
      "1 cake",
      "Jam Pengiriman : 10.00",
      "Metode Pengiriman : Grab/GoCar (pesan customer)",
      "Nama penerima : Gara BFM",
      "No. telp penerima : 082381297556",
      "Alamat lengkap : PIK",
    ].join("\n");

    const parsed = parseWhatsAppOrderText(text, {
      preferredOrderType: "cake",
      sourceType: "manual",
    });
    const autoFill = buildBookingAutoFillFromParsed(parsed);

    expect(autoFill.deliveryMethod).toBe("CUSTOMER_APP_COURIER");
  });

  it("maps same day wording to assisted same day", () => {
    const text = [
      "Tanggal Pengiriman : (10/4/26)",
      "KODE BOOKING : GA-58",
      "Order:",
      "20pcs indv cookies",
      "Jam Pengiriman : 10.00",
      "Metode Pengiriman : Same Day",
      "Nama penerima : Gara BFM",
      "No. telp penerima : 082381297556",
      "Alamat lengkap : PIK",
    ].join("\n");

    const parsed = parseWhatsAppOrderText(text, {
      preferredOrderType: "cookies",
      sourceType: "manual",
    });
    const autoFill = buildBookingAutoFillFromParsed(parsed);

    expect(parsed.common.deliveryMethod).toBe("Same Day");
    expect(autoFill.deliveryMethod).toBe("ASSISTED_SAME_DAY");
  });
});
