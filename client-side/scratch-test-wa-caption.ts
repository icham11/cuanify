import { buildProductionCaption } from "./lib/whatsapp/sendOrderToWhatsApp";
import { SendOrderToWhatsAppInput } from "./lib/whatsapp/sendOrderToWhatsApp";

const order: SendOrderToWhatsAppInput = {
  internalOrderId: "123",
  deliveryDate: "2026-05-02",
  bookingCode: "",
  deliveryTime: "10.00",
  shippingMethod: "Paxel (dibantu admin)",
  recipientName: "Feli",
  recipientPhone: "0818518354",
  fullAddress: "Wisata bukit mas D2 no 5 | Cluster madrid Surabaya barat",
  postalCode: "60213",
  captionItems: [
    {
      productName: "Hand Bouquet (7-10 pcs)",
      quantity: 2,
      detailLines: [
        { label: "Design", value: "1 : pokemon mix\n2 : 1. miffy muka coklat" },
        { label: "Warna kertas bouquet", value: "design 1 pokemon : wrapping paper 1, ribbon 8 | design 2 miffy : wrapping paper 4, ribbon 1" },
        { label: "Jumlah Bunga", value: "3" },
        { label: "Kartu ucapan", value: "design 1 pokemon : keep going, big boy! | design 2 miffy : happy graduation, big girl!" },
      ],
      addOnText: "Extra Bubblewrap Bouquet, Additional 3 Bunga"
    }
  ]
};

console.log("=== OUTPUT ===");
console.log(buildProductionCaption(order));
