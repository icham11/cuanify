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
  buildParsedDetectedItems,
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

  it("captures secondary cake details from mixed cupcake order", () => {
    const text = [
      "Data Cupcakes",
      "Tanggal Pengiriman: 26 Maret 2026",
      "KODE BOOKING: BK-457",
      "Order: 1 dozen cupcakes + 1 cake",
      "Jumlah Cupcakes: 1 dozen",
      "Rasa Cupcakes: Vanilla",
      "Warna Cupcakes: Pink",
      "Jumlah Topper Cookies: 0",
      "Nama di Cake: Alya",
      "Umur di cake: 7",
      "Ukuran cake: 16 cm",
      "Rasa cake: Coklat",
      "Design cake: Floral",
      "Jam Pengiriman: 10:00",
      "Metode Pengiriman: Gocar",
      "Nama penerima: Test Mixed Detail",
      "No. telp penerima: 081234567896",
      "Alamat lengkap: Central City",
    ].join("\n");

    const parsed = parseWhatsAppOrderText(text, {
      preferredOrderType: "unknown",
      sourceType: "manual",
    });
    const autoFill = buildBookingAutoFillFromParsed(parsed);
    const cakeItem = autoFill.items.find((item) => item.category === "Cake");
    const detectedItems = buildParsedDetectedItems(autoFill.items);

    expect(parsed.detailsByOrderType?.cake?.cakeSize).toBe("16 cm");
    expect(parsed.detailsByOrderType?.cupcakes?.cupcakeColor).toBe("Pink");
    expect(detectedItems.map((item) => item.category).sort()).toEqual([
      "Cake",
      "Cupcakes",
    ]);
    expect(Boolean(cakeItem)).toBe(true);
    if (!cakeItem) {
      throw new Error("Cake item was not generated");
    }
    expect(cakeItem.notes.includes("Ukuran cake: 16 cm")).toBe(true);
    expect(cakeItem.notes.includes("Design cake: Floral")).toBe(true);
  });

  it("captures secondary cupcake details from mixed cake order", () => {
    const text = [
      "Data Cake",
      "Tanggal Pengiriman: 27 Maret 2026",
      "KODE BOOKING: BK-458",
      "Order: 1 cake + 1 dozen cupcakes",
      "Nama di Cake: Nara",
      "Umur di cake: 9",
      "Ukuran cake: 18 cm",
      "Rasa cake: Vanilla",
      "Design cake: Butterflies",
      "Jumlah Cupcakes: 1 dozen",
      "Rasa Cupcakes: Strawberry",
      "Warna Cupcakes: Lilac",
      "Jumlah Topper Cookies: 2",
      "Jam Pengiriman: 11:00",
      "Metode Pengiriman: Gocar",
      "Nama penerima: Test Mixed Cake",
      "No. telp penerima: 081234567897",
      "Alamat lengkap: Central City",
    ].join("\n");

    const parsed = parseWhatsAppOrderText(text, {
      preferredOrderType: "unknown",
      sourceType: "manual",
    });
    const autoFill = buildBookingAutoFillFromParsed(parsed);
    const cupcakeItem = autoFill.items.find(
      (item) => item.category === "Cupcakes",
    );

    expect(parsed.detailsByOrderType?.cupcakes?.cupcakeFlavor).toBe(
      "Strawberry",
    );
    expect(Boolean(cupcakeItem)).toBe(true);
    if (!cupcakeItem) {
      throw new Error("Cupcakes item was not generated");
    }
    expect(cupcakeItem.notes.includes("Rasa Cupcakes: Strawberry")).toBe(true);
    expect(cupcakeItem.notes.includes("Warna Cupcakes: Lilac")).toBe(true);
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

  it("auto-checks choose color from cupcake color field even without explicit dark buttercream phrase", () => {
    const text = [
      "Tanggal Pengiriman: (4/5/26)",
      "KODE BOOKING : ST-28",
      "Order:",
      "1 dozen",
      "cupcakes",
      "4ppcs indv cupcakes",
      "Jumlah Cupcakes : 1 dozen +",
      "40pcs indv",
      "Rasa Cupcakes : dozen : dc, indv :",
      "CV",
      "Warna Cupcakes : Black, Navy Blue, Fuschia Pink",
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
    const autoFill = buildBookingAutoFillFromParsed(parsed);

    const cupcakeItems = autoFill.items.filter(
      (item) => item.category === "Cupcakes",
    );
    expect(cupcakeItems.length).toBe(2);

    for (const cupcakeItem of cupcakeItems) {
      expect(cupcakeItem.addOns.includes("dark-color-buttercream")).toBe(true);
      expect(cupcakeItem.darkColorButtercreamColors).toEqual([
        "Black",
        "Navy Blue",
        "Fuschia Pink",
      ]);
    }

    const dozenItem = cupcakeItems.find((item) =>
      item.productName.toLowerCase().includes("dozen"),
    );
    const individualItem = cupcakeItems.find((item) =>
      item.productName.toLowerCase().includes("individual"),
    );

    expect(Boolean(dozenItem)).toBe(true);
    expect(Boolean(individualItem)).toBe(true);
    if (!dozenItem || !individualItem) {
      throw new Error("Cupcake split items were not generated");
    }

    expect(dozenItem.addOns.includes("flavor-cupcake-double-choco")).toBe(true);
    expect(
      individualItem.addOns.includes("flavor-cupcake-classic-vanilla"),
    ).toBe(true);
  });

  it("maps flavor shorthand separately for cake and cupcakes in mixed order", () => {
    const text = [
      "Data Cake",
      "Tanggal Pengiriman: 9/5/26",
      "KODE BOOKING: MX-77",
      "Order: 1 cake + 1 dozen cupcakes",
      "Nama di Cake: Mila",
      "Umur di cake: 8",
      "Ukuran cake: 16 cm",
      "Rasa cake: CB",
      "Design cake: simple",
      "Jumlah Cupcakes: 1 dozen",
      "Rasa Cupcakes: DC",
      "Warna Cupcakes: -",
      "Jumlah Topper Cookies: -",
      "Jam Pengiriman: 10:00",
      "Metode Pengiriman: Gocar",
      "Nama penerima: Test Mixed Flavor",
      "No. telp penerima: 081234567898",
      "Alamat lengkap: Central City",
    ].join("\n");

    const parsed = parseWhatsAppOrderText(text, {
      preferredOrderType: "unknown",
      sourceType: "manual",
    });
    const autoFill = buildBookingAutoFillFromParsed(parsed);

    const cakeItem = autoFill.items.find((item) => item.category === "Cake");
    const cupcakeItem = autoFill.items.find(
      (item) => item.category === "Cupcakes",
    );

    expect(Boolean(cakeItem)).toBe(true);
    expect(Boolean(cupcakeItem)).toBe(true);
    if (!cakeItem || !cupcakeItem) {
      throw new Error("Mixed flavor items were not generated");
    }

    expect(cakeItem.addOns.includes("flavor-cake-choco-banana")).toBe(true);
    expect(cupcakeItem.addOns.includes("flavor-cupcake-double-choco")).toBe(
      true,
    );
  });

  it("maps premium cake flavor to premium flavor add-on", () => {
    const text = [
      "Data Cake",
      "Tanggal Pengiriman: 10/5/26",
      "KODE BOOKING: CK-88",
      "Order: 1 cake",
      "Nama di Cake: Naya",
      "Umur di cake: 7",
      "Ukuran cake: 16 cm",
      "Rasa cake: Red Velvet",
      "Design cake: simple",
      "Jam Pengiriman: 10:00",
      "Metode Pengiriman: Gocar",
      "Nama penerima: Test Premium Flavor",
      "No. telp penerima: 081234567899",
      "Alamat lengkap: Central City",
    ].join("\n");

    const parsed = parseWhatsAppOrderText(text, {
      preferredOrderType: "cake",
      sourceType: "manual",
    });
    const autoFill = buildBookingAutoFillFromParsed(parsed);
    const cakeItem = autoFill.items.find((item) => item.category === "Cake");

    expect(Boolean(cakeItem)).toBe(true);
    if (!cakeItem) {
      throw new Error("Cake item was not generated");
    }

    expect(cakeItem.addOns.includes("flavor-cake-red-velvet-premium")).toBe(
      true,
    );
  });

  it("maps compact cake size code like d16t15 to the correct tall variant", () => {
    const text = [
      "Data Cake",
      "Tanggal Pengiriman: 11/5/26",
      "KODE BOOKING: CK-89",
      "Order: 1 cake",
      "Nama di Cake: Atlas",
      "Umur di cake: 6",
      "Ukuran cake: d16t15",
      "Rasa cake: DC",
      "Design cake: mario",
      "Jam Pengiriman: 10:00",
      "Metode Pengiriman: Pickup",
      "Nama penerima: Atlas",
      "No. telp penerima: 081234567800",
      "Alamat lengkap: Jakarta",
    ].join("\n");

    const parsed = parseWhatsAppOrderText(text, {
      preferredOrderType: "cake",
      sourceType: "manual",
    });
    const autoFill = buildBookingAutoFillFromParsed(parsed);
    const cakeItem = autoFill.items.find((item) => item.category === "Cake");

    expect(Boolean(cakeItem)).toBe(true);
    if (!cakeItem) {
      throw new Error("Cake item was not generated");
    }

    expect(cakeItem.size).toBe("D16-T15");
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

  it("uses bouquet quantity from order marker when flower count field is empty", () => {
    const text = [
      "Data Buket",
      "Tanggal Pengiriman: 18/04/2026",
      "KODE BOOKING: SA-26",
      "Order: Hbq isi 10",
      "Design: 9pcs karakter digimon (full body)",
      "Warna kertas bouquet: no 13",
      "Jumlah Cookies: -",
      "Harga Cookie / pcs: -",
      "Warna Bunga: -",
      "Kartu ucapan: Happy Birthday Elliora",
      "Jam Pengiriman: 10:00",
      "Metode Pengiriman: GoCar",
      "Nama penerima: Sansan",
      "No. telp penerima: 08174922926",
      "Alamat lengkap: Tangerang",
    ].join("\n");

    const parsed = parseWhatsAppOrderText(text, {
      preferredOrderType: "buket",
      sourceType: "manual",
    });
    const autoFill = buildBookingAutoFillFromParsed(parsed);

    expect(parsed.details.flowerCount).toBe("");
    expect(autoFill.items[0]?.category).toBe("Buket");
    expect(autoFill.items[0]?.quantity).toBe(10);
  });

  it("extracts mixed-order bouquet quantity from hbq marker", () => {
    const autoFill = buildAutoFillFromOrderLine("1 cake + hbq isi 10");
    const bouquetItem = autoFill.items.find(
      (item) => item.category === "Buket",
    );

    expect(Boolean(bouquetItem)).toBe(true);
    if (!bouquetItem) {
      throw new Error("Bouquet item was not generated");
    }
    expect(bouquetItem.quantity).toBe(10);
  });

  it("infers bouquet token difficulty from Harga Cookie / pcs", () => {
    const text = [
      "Data Buket",
      "Tanggal Pengiriman: 20/04/2026",
      "KODE BOOKING: BK-590",
      "Order: hand bouquet isi 10",
      "Design: karakter pokemon",
      "Warna kertas bouquet: peach",
      "Jumlah Cookies: 10",
      "Harga Cookie / pcs: 25k",
      "Warna Bunga: putih",
      "Kartu ucapan: Happy Birthday",
      "Jam Pengiriman: 11:00",
      "Metode Pengiriman: GoCar",
      "Nama penerima: Naya",
      "No. telp penerima: 081234567890",
      "Alamat lengkap: Jakarta",
    ].join("\n");

    const parsed = parseWhatsAppOrderText(text, {
      preferredOrderType: "buket",
      sourceType: "manual",
    });
    const autoFill = buildBookingAutoFillFromParsed(parsed);
    const bouquetItem = autoFill.items.find(
      (item) => item.category === "Buket",
    );

    expect(Boolean(bouquetItem)).toBe(true);
    if (!bouquetItem) {
      throw new Error("Bouquet item was not generated");
    }

    expect(bouquetItem.quantity).toBe(10);
    expect(bouquetItem.tokenDifficulty).toBe("HARD");
    expect(bouquetItem.cookiePrice).toBe(25000);
  });

  it("does not treat low Jumlah Bunga as cookie quantity", () => {
    const text = [
      "Data Buket",
      "Tanggal Pengiriman: 21/04/2026",
      "KODE BOOKING: BK-591",
      "Order: Hbq isi 9",
      "Design: simple",
      "Warna kertas bouquet: ivory",
      "Jumlah Bunga: 3",
      "Harga Cookie / pcs: 20k",
      "Warna Bunga: pink",
      "Kartu ucapan: Happy Birthday",
      "Jam Pengiriman: 10:00",
      "Metode Pengiriman: GoCar",
      "Nama penerima: Ara",
      "No. telp penerima: 081234567891",
      "Alamat lengkap: Tangerang",
    ].join("\n");

    const parsed = parseWhatsAppOrderText(text, {
      preferredOrderType: "buket",
      sourceType: "manual",
    });
    const autoFill = buildBookingAutoFillFromParsed(parsed);

    expect(parsed.details.flowerCount).toBe("3");
    expect(autoFill.items[0]?.category).toBe("Buket");
    expect(autoFill.items[0]?.quantity).toBe(9);
  });

  it("reads structured recap order items and pricing overrides", () => {
    const text = [
      "REKAP ORDER",
      "Customer: Elliora",
      "Tanggal Pengiriman: 18/04/2026",
      "Jam Pengiriman: 10:00",
      "Metode Pengiriman: GoCar",
      "",
      "ITEM 1",
      "Kategori: Cake",
      "Nama Produk: Custom Cake",
      "Qty: 1",
      "Size/Varian: 16 cm",
      "Design/Notes: Pokeball, nama Elliora, angka 14",
      "Add On: -",
      "Harga Satuan: 450000",
      "Subtotal: 450000",
      "",
      "ITEM 2",
      "Kategori: Cupcakes",
      "Nama Produk: 1 Dozen Cupcakes",
      "Qty: 1",
      "Size/Varian: Dozen",
      "Design/Notes: pink muda, biru muda",
      "Add On: -",
      "Harga Satuan: 240000",
      "Subtotal: 240000",
      "",
      "Subtotal Produk: 690000",
      "Ongkir: 0",
      "Total: 690000",
      "DP: 345000",
      "Sisa: 345000",
      "",
      "Nama di Cake: Elliora",
      "Umur di cake: 14",
      "Ukuran cake: 16 cm",
      "Rasa cake: Vanilla",
      "Design cake: Pokeball",
      "Jumlah Cupcakes: 1 dozen",
      "Rasa Cupcakes: Vanilla",
      "Warna Cupcakes: Pink muda, biru muda",
      "Jumlah Topper Cookies: 0",
      "Nama penerima: Sansan",
      "No. telp penerima: 08174922926",
      "Alamat lengkap: Tangerang",
    ].join("\n");

    const parsed = parseWhatsAppOrderText(text, {
      preferredOrderType: "unknown",
      sourceType: "manual",
    });
    const autoFill = buildBookingAutoFillFromParsed(parsed);

    expect(parsed.orderRecap?.items).toHaveLength(2);
    expect(parsed.orderRecap?.totals.total).toBe(690000);
    expect(autoFill.items).toHaveLength(2);
    expect(autoFill.items.map((item) => item.category)).toEqual([
      "Cake",
      "Cupcakes",
    ]);
    expect(autoFill.items.map((item) => item.pricingSource)).toEqual([
      "RECAP",
      "RECAP",
    ]);
    expect(autoFill.items.map((item) => item.parsedSubtotal)).toEqual([
      450000, 240000,
    ]);
    expect(autoFill.paymentStatus).toBe("DP Paid");
    expect(autoFill.dpPaidAmount).toBe(345000);
    expect(autoFill.finalPaidAmount).toBe(345000);
    expect(autoFill.manualAdjustment).toBe(0);
  });

  it("keeps separate recap items even when category is the same", () => {
    const text = [
      "REKAP ORDER",
      "Tanggal Pengiriman: 19/04/2026",
      "Jam Pengiriman: 11:00",
      "Metode Pengiriman: Pickup",
      "",
      "ITEM 1",
      "Kategori: Cake",
      "Nama Produk: Custom Cake",
      "Qty: 1",
      "Size/Varian: 16 cm",
      "Design/Notes: Tema Spiderman",
      "Harga Satuan: 450000",
      "Subtotal: 450000",
      "",
      "ITEM 2",
      "Kategori: Cake",
      "Nama Produk: Custom Cake",
      "Qty: 1",
      "Size/Varian: 16 cm",
      "Design/Notes: Tema Princess",
      "Harga Satuan: 450000",
      "Subtotal: 450000",
      "",
      "Nama di Cake: Naya",
      "Umur di cake: 7",
      "Ukuran cake: 16 cm",
      "Rasa cake: Vanilla",
      "Design cake: Spiderman + Princess",
      "Nama penerima: Naya",
      "No. telp penerima: 081234567890",
      "Alamat lengkap: Jakarta",
    ].join("\n");

    const parsed = parseWhatsAppOrderText(text, {
      preferredOrderType: "unknown",
      sourceType: "manual",
    });
    const autoFill = buildBookingAutoFillFromParsed(parsed);

    expect(parsed.orderRecap?.items).toHaveLength(2);
    expect(autoFill.items).toHaveLength(2);
    expect(autoFill.items.map((item) => item.parsedSubtotal)).toEqual([
      450000, 450000,
    ]);
  });

  it("reads one combined message with recap block without repeating common fields", () => {
    const text = [
      "Tanggal Pengiriman: 18/04/2026",
      "KODE BOOKING: SA-26",
      "Order: 1 cake + 1 dozen cupcakes",
      "Nama di Cake: Elliora",
      "Umur di cake: 14",
      "Ukuran cake: 16 cm",
      "Rasa cake: Vanilla",
      "Design cake:",
      "1. Pokeball",
      "2. Karakter digimon",
      "Jumlah Cupcakes: 1 dozen",
      "Rasa Cupcakes: Vanilla",
      "Warna Cupcakes: Pink muda, biru muda",
      "Jumlah Topper Cookies: 0",
      "Jam Pengiriman: 10:00",
      "Metode Pengiriman: GoCar",
      "Nama penerima: Sansan",
      "No. telp penerima: 08174922926",
      "Alamat lengkap: Tangerang",
      "",
      "REKAP ORDER",
      "",
      "ITEM 1",
      "Kategori: Cake",
      "Nama Produk: Custom Cake",
      "Qty: 1",
      "Size/Varian: 16 cm",
      "Design/Notes: Pokeball, nama Elliora, angka 14",
      "Add On: -",
      "Harga Satuan: 450000",
      "Subtotal: 450000",
      "",
      "ITEM 2",
      "Kategori: Cupcakes",
      "Nama Produk: 1 Dozen Cupcakes",
      "Qty: 1",
      "Size/Varian: Dozen",
      "Design/Notes: pink muda, biru muda",
      "Add On: -",
      "Harga Satuan: 240000",
      "Subtotal: 240000",
      "",
      "Subtotal Produk: 690000",
      "Ongkir: 0",
      "Total: 690000",
      "DP: 345000",
      "Sisa: 345000",
    ].join("\n");

    const parsed = parseWhatsAppOrderText(text, {
      preferredOrderType: "unknown",
      sourceType: "manual",
    });
    const autoFill = buildBookingAutoFillFromParsed(parsed);

    expect(parsed.common.recipientName).toBe("Sansan");
    expect(parsed.orderRecap?.items).toHaveLength(2);
    expect(parsed.orderRecap?.items.map((item) => item.category)).toEqual([
      "Cake",
      "Cupcakes",
    ]);
    expect(autoFill.items).toHaveLength(2);
    expect(autoFill.items.map((item) => item.parsedSubtotal)).toEqual([
      450000, 240000,
    ]);
    expect(autoFill.dpPaidAmount).toBe(345000);
    expect(autoFill.finalPaidAmount).toBe(345000);
  });

  it("parses ci feli mixed cake and cookies recap sample with pickup and mixed token cookies", () => {
    const text = [
      "Tanggal Pengiriman: 8 April 2026",
      "KODE BOOKING: AD-06",
      "Order: 1 cake , 20 cookies",
      "",
      "Nama di Cake : Atlas (large cookies)",
      "Umur di cake : 6",
      "Ukuran cake : d16t15",
      "Rasa cake : DC",
      "Design cake :",
      "• 3 large cookies (2 mario half body topi merah , full body topi hijau , nama Atlas)",
      "• 5 medium cookies (dinosaurus full body ,2 pot bunga, bunga belakang mario)",
      "• 4 small cookies ( 3 jamur ,angka 8)",
      "• fondant decoration ( awan, bintang sampai belakang)",
      "",
      "Cookies :",
      "• 20pcs individual cookies",
      "Design Cookies : muka mario topi merah , tanda tanya kuning kotak , muka mario topi hijau , bunga lingkaran merah , bunga kuncup polkadot , jamur coklat , jamur merah , jamur hijau , bintang kuning , telur putih polkadot hijau",
      "",
      "Jam Pengiriman: jam 10 pagi",
      "Metode Pengiriman : pickup",
      "Nama penerima : adina",
      "No. telp penerima : 08118402606",
      "Alamat lengkap : jl buncit persada no.B2 jaksel 12740",
      "",
      "REKAP ORDER",
      "ITEM 1",
      "Kategori: Cake",
      "Nama Produk: Custom Cake",
      "Qty: 1",
      "Size/Varian: D16T15",
      "Design/Notes: Mario",
      "Add On:",
      "• 3 large cookies (2 mario , nama) @70k = 210",
      "• 5 medium cookies (dinosaurus ,2 pot bunga, bunga belakang mario)@40k = 200k",
      "• 4 small cookies ( 3 jamur ,angka 8) @20k = 80k",
      "• fondant decoration 100k ( awan, bintang)",
      "Harga Satuan: 1140000",
      "Subtotal: 1140000",
      "",
      "ITEM 2",
      "Kategori: Cookies",
      "Nama Produk: Cookies",
      "Qty: 20",
      "Size/Varian:",
      "• 18 pcs Hard",
      "Harga Satuan: 17000",
      "Subtotal: 450000",
      "• 2 pcs Expert",
      "Harga Satuan: 35000",
      "Subtotal: 70000",
      "",
      "Subtotal Produk: 1660000",
      "Ongkir: 0",
      "Adjustment: 0",
      "Total: 1660000",
      "DP: 0",
      "Sisa: 1660000",
    ].join("\n");

    const parsed = parseWhatsAppOrderText(text, {
      preferredOrderType: "unknown",
      sourceType: "manual",
    });
    const autoFill = buildBookingAutoFillFromParsed(parsed);

    expect(parsed.common.deliveryMethod).toBe("Pickup");
    expect(parsed.orderRecap?.items).toHaveLength(3);
    expect(autoFill.deliveryMethod).toBe("PICKUP");
    expect(autoFill.customNotes).toBe("");
    expect(autoFill.manualAdjustment).toBe(0);

    const cakeItem = autoFill.items.find((item) => item.category === "Cake");
    const hardCookieItem = autoFill.items.find(
      (item) => item.category === "Cookies" && item.tokenDifficulty === "HARD",
    );
    const expertCookieItem = autoFill.items.find(
      (item) =>
        item.category === "Cookies" && item.tokenDifficulty === "EXPERT",
    );

    expect(Boolean(cakeItem)).toBe(true);
    expect(Boolean(hardCookieItem)).toBe(true);
    expect(Boolean(expertCookieItem)).toBe(true);

    if (!cakeItem || !hardCookieItem || !expertCookieItem) {
      throw new Error("Expected recap items were not generated");
    }

    expect(cakeItem.size.includes("Tinggi 15 cm")).toBe(true);
    expect(cakeItem.parsedSubtotal).toBe(1140000);
    expect(cakeItem.notes.includes("Total Biaya Item")).toBe(false);
    expect(cakeItem.notes.includes("3 large cookies")).toBe(true);
    expect(cakeItem.addOns.includes("large-cookies")).toBe(true);
    expect(cakeItem.addOns.includes("medium-cookies")).toBe(true);
    expect(cakeItem.addOns.includes("small-cookies")).toBe(true);
    expect(cakeItem.addOns.includes("fondant-decor")).toBe(true);
    expect(cakeItem.addOnQuantities?.["large-cookies"]).toBe(3);
    expect(cakeItem.addOnQuantities?.["medium-cookies"]).toBe(5);
    expect(cakeItem.addOnQuantities?.["small-cookies"]).toBe(4);
    expect(hardCookieItem.quantity).toBe(18);
    expect(hardCookieItem.parsedSubtotal).toBe(450000);
    expect(expertCookieItem.quantity).toBe(2);
    expect(expertCookieItem.parsedSubtotal).toBe(70000);
  });

  it("maps AD-06 cake size d18t10 consistently from both details and recap", () => {
    const text = [
      "Tanggal Pengiriman: 8 April 2026",
      "KODE BOOKING: AD-06",
      "Order: 1 cake , 20 cookies",
      "",
      "Nama di Cake : Atlas (large cookies)",
      "Umur di cake : 6",
      "Ukuran cake : d18t10",
      "Rasa cake : DC",
      "Design cake :",
      "• 3 large cookies",
      "• 5 medium cookies",
      "• 4 small cookies",
      "• fondant decoration",
      "",
      "Jam Pengiriman: jam 10 pagi",
      "Metode Pengiriman : pickup",
      "Nama penerima : adina",
      "No. telp penerima : 08118402606",
      "Alamat lengkap : jl buncit persada no.B2 jaksel 12740",
      "",
      "REKAP ORDER",
      "ITEM 1",
      "Kategori: Cake",
      "Nama Produk: Custom Cake",
      "Qty: 1",
      "Size/Varian: D18T10",
      "Design/Notes: Mario",
      "Add On: -",
      "Harga Satuan: 1140000",
      "Subtotal: 1140000",
    ].join("\n");

    const parsed = parseWhatsAppOrderText(text, {
      preferredOrderType: "unknown",
      sourceType: "manual",
    });
    const autoFill = buildBookingAutoFillFromParsed(parsed);
    const cakeItem = autoFill.items.find((item) => item.category === "Cake");

    expect(Boolean(cakeItem)).toBe(true);
    if (!cakeItem) {
      throw new Error("Cake item was not generated");
    }

    expect(cakeItem.size).toBe("D18-T10");
  });

  it("only fills custom notes from special note fields instead of full parsed order", () => {
    const text = [
      "Tanggal Pengiriman: 18/04/2026",
      "KODE BOOKING: CK-01",
      "Order: 20pcs indv cookies",
      "To From Notes: Happy Birthday Elliora | From kuku & kim2",
      "Jam Pengiriman: 10:00",
      "Metode Pengiriman: Pickup",
      "Nama penerima: Sansan",
      "No. telp penerima: 08174922926",
      "Alamat lengkap: Tangerang",
    ].join("\n");

    const parsed = parseWhatsAppOrderText(text, {
      preferredOrderType: "cookies",
      sourceType: "manual",
    });
    const autoFill = buildBookingAutoFillFromParsed(parsed);

    expect(autoFill.customNotes).toBe(
      "To From Notes: Happy Birthday Elliora | From kuku & kim2",
    );
  });
});
