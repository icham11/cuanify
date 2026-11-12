import { describe, expect, it } from "vitest";
import {
  BOOKING_ADD_ON_CATALOG,
  BOOKING_PRODUCT_CATALOG,
  type PricelistCategory,
} from "@/lib/bookings/pricelist";
import {
  buildBookingAutoFillFromParsed,
  parseWhatsAppOrderText,
} from "@/lib/bookings/whatsapp-parser";

function catalogWithSeasonalProducts(names: string[]): PricelistCategory[] {
  const catalog = JSON.parse(
    JSON.stringify(BOOKING_PRODUCT_CATALOG),
  ) as PricelistCategory[];
  const seasonal = catalog.find((entry) => entry.category === "Seasonal Event");
  if (!seasonal) throw new Error("Seasonal Event category missing");
  const subcategory = seasonal.subcategories[0];
  for (const name of names) {
    subcategory.products.push({
      name,
      keywords: [],
      defaultVariant: "Standard",
      variants: [{ label: "Standard", price: 250000, keywords: [] }],
    });
  }
  return catalog;
}

function recapText(productName: string): string {
  return [
    "REKAP ORDER",
    "ITEM 1",
    "",
    `Nama Produk: ${productName}`,
    "Harga Satuan: 250.000",
    "Qty: 2",
    "Add On:",
    "Subtotal: 500.000",
    "",
    "TOTAL: 500.000",
    "",
    "Tanggal Pengiriman : 20 november 2026",
    "Nama Penerima : Test",
  ].join("\n");
}

function parseFirstItem(productName: string, productCatalog: PricelistCategory[]) {
  const parsed = parseWhatsAppOrderText(recapText(productName), {
    sourceType: "text",
  });
  const autoFill = buildBookingAutoFillFromParsed(parsed, {
    productCatalog,
    addOnCatalog: BOOKING_ADD_ON_CATALOG,
  });
  return autoFill.items[0];
}

describe("whatsapp parser recap: Nama Produk matches catalog product", () => {
  const catalog = catalogWithSeasonalProducts([
    "SET A - Seasonal",
    "SET B - Seasonal",
    "Christmas 2025 - Set A (Per pcs)",
  ]);

  it.each(["Set A", "SET A", "set a - seasonal", "SET A - Seasonal"])(
    "maps %j to the seasonal product instead of falling back to Cake",
    (input) => {
      const item = parseFirstItem(input, catalog);
      expect(item?.category).toBe("Seasonal Event");
      expect(item?.productName).toBe("SET A - Seasonal");
      expect(item?.quantity).toBe(2);
    },
  );

  it("does not partially match other products (Set B stays Set B)", () => {
    const item = parseFirstItem("Set B", catalog);
    expect(item?.productName).toBe("SET B - Seasonal");
  });

  it("keeps the old fallback when the product is not in the catalog", () => {
    const item = parseFirstItem("Set Z", catalog);
    expect(item?.category).not.toBe("Seasonal Event");
  });
});
