import { describe, expect, it } from "vitest";
import {
  buildBookingAutoFillFromParsed,
  parseWhatsAppOrderText,
} from "@/lib/bookings/whatsapp-parser";
import { calculateOrderTokenFromItems } from "@/lib/bookings/order-token-calculator";

describe("whatsapp parser recap regressions", () => {
  it("keeps compact custom card qty and ignores summary design lines", () => {
    const text = [
      "REKAP ORDER",
      "ITEM 1",
      "",
      "Nama Produk: hard cookies",
      "Harga Satuan: 25.000",
      "Qty: 55pcs",
      "Add On: 55pcs custom card",
      "Subtotal: 1.485.000",
      "",
      "ONGKIR:",
      "ADJUSTMENT:",
      "TOTAL: 1.485.000",
      "DP:",
      "SISA:",
      "",
      "Tanggal Pengiriman : 5 juni 2026",
      "",
      "KODE BOOKING : DI-32",
      "",
      "Order:",
      "- 55pcs hard cookies",
      "- 55pcs custom card (design c , EXO PLANET #6",
      "EXhOrizon in JAKARTA)",
      "",
      "Design :",
      "- kelinci",
      "- penguin",
      "- beruang",
      "- anjing",
      "- ayam",
      "(All design face only)",
      "",
      "Jam Pengiriman : 15.00",
      "Metode Pengiriman : Gojek/Grab",
      "Nama penerima : Dini Oktaviani",
      "No. telp penerima : 082125161232",
      "Alamat lengkap : Dini Oktaviani",
      "Jl. Kayu Manis VI No. 31 RT 03/05",
      "Kel. Kayu Manis Kec. Matraman, Jakarta Timur",
      "Kode pos : 13130",
    ].join("\n");

    const parsed = parseWhatsAppOrderText(text, {
      preferredOrderType: "cookies",
      sourceType: "manual",
    });
    const autoFill = buildBookingAutoFillFromParsed(parsed);
    const item = autoFill.items[0];

    expect(parsed.orderRecap?.items).toHaveLength(1);
    expect(parsed.orderRecap?.items[0]?.quantity).toBe(55);
    expect(autoFill.items).toHaveLength(1);
    expect(item?.quantity).toBe(55);
    expect(item?.tokenDifficulty).toBe("HARD");
    expect(item?.addOns).toEqual(["custom-card"]);
    expect(item?.addOnQuantities?.["custom-card"]).toBe(55);
    expect(item?.designCount).toBe(5);
    expect(item?.additionalDesignCount).toBe(0);
  });

  it("parses Syifa hbq recap into a dated hand bouquet order with production token", () => {
    const text = [
      "REKAP ORDER",
      "ITEM 1",
      "",
      "Nama Produk: hbq isi 7",
      "Harga Satuan: 360.000",
      "Qty:",
      "Add On:",
      "Subtotal:",
      "",
      "ONGKIR:",
      "ADJUSTMENT:",
      "TOTAL:",
      "DP:",
      "SISA:",
      "",
      "Tanggal Pengiriman",
      "10 september 2026",
      "",
      "KODE BOOKING : SY-96",
      "",
      "Order :",
      "- hbq isi 7",
      "",
      "Design :",
      "1. Logo real madrid (edible)",
      "2. Jersey putih",
      "3. Stadion (edible)",
      "4. Piala 1 (edible)",
      "5. Angka 23 , font sesuai gambar tanpa logo kecil dibawah nya",
      "6. Piala 2 (edible)",
      "7. Piala 3 (edible)",
      "",
      "Warna kertas bouquet : di sesuaikan untuk cowo",
      "Jumlah Bunga : -",
      "Warna Bunga : -",
      "Kartu ucapan : happy 23rd birthday mas",
      "",
      "Jam Pengiriman :",
      "Metode Pengiriman : pick up",
      "Nama Penerima : Syifa",
      "No telp Penerima : 081231010096",
      "Alamat Lengkap :",
      "Kode pos :",
    ].join("\n");

    const parsed = parseWhatsAppOrderText(text, {
      preferredOrderType: "buket",
      sourceType: "manual",
    });
    const autoFill = buildBookingAutoFillFromParsed(parsed);
    const item = autoFill.items[0];

    expect(parsed.common.deliveryDate).toBe("2026-09-10");
    expect(parsed.common.recipientName).toBe("Syifa");
    expect(autoFill.items).toHaveLength(1);
    expect(item?.category).toBe("Buket");
    expect(item?.productName).toBe("Hand Bouquet (7-10 pcs)");
    expect(item?.quantity).toBe(7);
    expect(calculateOrderTokenFromItems(autoFill.items)).toBe(20);
  });
});
