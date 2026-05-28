declare const describe: {
  (name: string, fn: () => void): void;
};
declare const it: (name: string, fn: () => void | Promise<void>) => void;
declare const expect: (value: unknown) => {
  toBe: (expected: unknown) => void;
};

import { buildProductionCaption } from "@/lib/whatsapp/sendOrderToWhatsApp";

describe("sendOrderToWhatsApp production caption", () => {
  it("uses delivery-style group template instead of recap template", () => {
    const caption = buildProductionCaption({
      bookingCode: "TA540-300526-004",
      deliveryDate: "2026-05-30",
      deliveryTime: "09:00",
      shippingMethod: "Paxel (dibantu admin)",
      recipientName: "Tassja",
      recipientPhone: "08561234540",
      fullAddress:
        "Jl. Setu Cipayung Blok Kili No.35, RT.1/RW.4, Cipayung, East Jakarta City, Jakarta 13840, Indonesia",
      captionItems: [
        {
          productName: "Hand Bouquet (7-10 pcs)",
          orderLabel: "Hand Bouquet (7-10 pcs)",
          quantity: 7,
          detailLines: [
            {
              label: "Design",
              value: [
                "1. Shape bulat, background bebas, tulisan Happy birthday natassja",
                "2. Shape bulat, background bebas, tulisan 3",
                "3. Shape bulat, background bebas, tulisan 0",
                "4. Roket",
                "5. Planet",
                "6. Astronot",
                "7. Bulan",
              ].join("\n"),
            },
            {
              label: "Jumlah Bunga / Isi Bouquet",
              value: "1",
            },
          ],
        },
      ],
    });

    expect(caption).toBe(
      [
        "Tanggal Pengiriman :",
        "30 Mei 2026",
        "",
        "KODE BOOKING : TA540-300526-004",
        "",
        "Order :",
        "7x Hand Bouquet (7-10 pcs)",
        "",
        "Design :",
        "1. Shape bulat, background bebas, tulisan Happy birthday natassja",
        "2. Shape bulat, background bebas, tulisan 3",
        "3. Shape bulat, background bebas, tulisan 0",
        "4. Roket",
        "5. Planet",
        "6. Astronot",
        "7. Bulan",
        "Jumlah Bunga / Isi Bouquet : 1",
        "",
        "Jam Pengiriman: 09.00",
        "Metode Pengiriman : Paxel (dibantu admin)",
        "Nama penerima : Tassja",
        "No. telp penerima : 08561234540",
        "Alamat lengkap : Jl. Setu Cipayung Blok Kili No.35, RT.1/RW.4, Cipayung, East Jakarta City, Jakarta 13840, Indonesia",
      ].join("\n"),
    );
  });

  it("groups multiple order lines under one heading and preserves design fallback", () => {
    const caption = buildProductionCaption({
      bookingCode: "VI136-310526-005",
      deliveryDate: "2026-05-31",
      deliveryTime: "10:00",
      shippingMethod: "Same Day (dibantu admin)",
      recipientName: "Vivi",
      recipientPhone: "08990788136",
      fullAddress:
        "Jl. TMP Kalibata Gg Langgar No 45 RT 10 RW 07 Duren Tiga, Pancoran Jaksel. | (Kontrakan Ibu Tika Pintu ke-4)",
      designNotes: [
        "1. pinguin",
        "2. Kucing hijau",
        "3. panda",
        "4. bebek",
      ].join("\n"),
      captionItems: [
        {
          productName: "Custom Cookies",
          orderLabel: "Custom Cookies",
          quantity: 13,
          detailLines: [],
        },
        {
          productName: "Custom Cookies",
          orderLabel: "Custom Cookies",
          quantity: 7,
          detailLines: [],
        },
      ],
    });

    expect(caption).toBe(
      [
        "Tanggal Pengiriman :",
        "31 Mei 2026",
        "",
        "KODE BOOKING : VI136-310526-005",
        "",
        "Order :",
        "13x Custom Cookies",
        "7x Custom Cookies",
        "",
        "Design :",
        "1. pinguin",
        "2. Kucing hijau",
        "3. panda",
        "4. bebek",
        "",
        "Jam Pengiriman: 10.00",
        "Metode Pengiriman : Same Day (dibantu admin)",
        "Nama penerima : Vivi",
        "No. telp penerima : 08990788136",
        "Alamat lengkap : Jl. TMP Kalibata Gg Langgar No 45 RT 10 RW 07 Duren Tiga, Pancoran Jaksel. | (Kontrakan Ibu Tika Pintu ke-4)",
      ].join("\n"),
    );
  });
});
