import { buildCaptionItems } from "./lib/bookings/order-api-helpers";

const order: any = {
  items: [
    {
      productName: "Hand Bouquet (7-10 pcs)",
      quantity: 2,
      productType: "BOUQUET",
      notes: "Design: 1 : pokemon mix\n2 : 1. miffy muka coklat\nWarna kertas bouquet: design 1 pokemon : wrapping paper 1, ribbon 8 | design 2 miffy : wrapping paper 4, ribbon 1\nJumlah Bunga: 3\nKartu ucapan: design 1 pokemon : keep going, big boy! | design 2 miffy : happy graduation, big girl!"
    }
  ],
  whatsAppParsedData: {
    orderType: "bouquet"
  }
};

console.log(JSON.stringify(buildCaptionItems(order), null, 2));
