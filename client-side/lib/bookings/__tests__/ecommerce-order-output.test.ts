import { describe, expect, it } from "vitest";
import type { BakeryOrder } from "@/components/bakery/store";
import { buildLabelHtml } from "@/components/bakery/bookings/LabelTemplate";
import { toNormalizedAutomationOrder } from "@/lib/bookings/automation-service";
import { toWhatsAppPayload } from "@/lib/bookings/order-api-helpers";
import { buildProductionCaption } from "@/lib/whatsapp/sendOrderToWhatsApp";

const ecommerceNotes = [
  "Order Shopee: 2610159ABCXYZ",
  "Tanggal Order Masuk: 2026-10-15",
  "Pengiriman Shopee: Regular",
  "Tolong bubble wrap dobel",
].join("\n");

describe("E-commerce order output", () => {
  it("includes add-ons and notes in the production WA caption", () => {
    const caption = buildProductionCaption(
      toWhatsAppPayload(
        toNormalizedAutomationOrder({
          id: "1",
          bookingCode: "BU000-181026-001",
          resi: "2610159ABCXYZ",
          customerName: "Budi",
          customerPhone: "",
          deliveryDate: "2026-10-18",
          deliverySlot: "09:00",
          deliveryMethod: "PICKUP",
          paymentStatus: "Paid",
          orderStatus: "In Production",
          totalPrice: 120000,
          notes: ecommerceNotes,
          items: [
            {
              id: "item-1",
              category: "Cookies",
              subcategory: "Event Cookies",
              productName: "Bauble",
              size: "Standard",
              quantity: 5,
              addOns: ["dark-color", "gift-card"],
              addOnQuantities: { "dark-color": 1, "gift-card": 2 },
              addOnLabels: { "gift-card": "Kartu Ucapan" },
            },
          ],
          deliveryAddresses: [],
        }),
      ),
    );

    expect(caption).toContain("Bauble - Standard");
    expect(caption).toContain("+ Add On: Dark Color, 2x Kartu Ucapan");
    expect(caption).toContain("Order Shopee: 2610159ABCXYZ");
    expect(caption).toContain("Tolong bubble wrap dobel");
  });

  it("prints the platform booking code on the label", () => {
    const order: BakeryOrder = {
      id: "1",
      resi: "2610159ABCXYZ",
      bookingCode: "BU000-181026-001",
      customerName: "Budi",
      customerPhone: "",
      deliveryDate: "2026-10-18",
      deliverySlot: "09:00",
      items: [],
      deliveryAddresses: [],
      product: "1 item(s)",
      totalPrice: 120000,
      sales_channel: "shopee",
      paymentStatus: "Paid",
      orderStatus: "In Production",
      statusHistory: [],
      notes: ecommerceNotes,
    };

    expect(buildLabelHtml(order)).toContain(
      '<div class="booking-code">2610159ABCXYZ</div>',
    );
    // Order lama tanpa resi: kode dibaca dari notes.
    expect(buildLabelHtml({ ...order, resi: "" })).toContain(
      '<div class="booking-code">2610159ABCXYZ</div>',
    );
    // Booking biasa tetap memakai format lama.
    expect(
      buildLabelHtml({ ...order, sales_channel: "direct" }),
    ).not.toContain("2610159ABCXYZ</div>");
  });
});
