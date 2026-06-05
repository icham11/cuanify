import { z } from "zod";
import { usesShippingEngine } from "@/lib/bookings/delivery-rules";
import {
  sanitizePostalCodeInput,
  extractPostalCodeFromAddress,
  areaLooksValid,
  addressLooksStructured,
  ADDRESS_CONTACT_LABEL_PATTERN,
  ADDRESS_PHONE_PATTERN,
} from "./booking-form-helpers";

export const itemSchema = z.object({
  category: z.string().min(1, "Category is required"),
  subcategory: z.string().min(1, "Subcategory is required"),
  productName: z.string().min(1, "Product is required"),
  size: z.string().min(1, "Size is required"),
  quantity: z.number().int().min(1, "Minimum quantity is 1"),
  tokenDifficulty: z
    .enum(["SIMPLE", "NORMAL", "HARD", "ADVANCED", "EXPERT"])
    .optional(),
  customTokenPerUnit: z.number().int().min(1).max(999).optional(),
  bouquetPriceOverride: z.number().min(0).optional(),
  sharingBoxPriceOverride: z.number().min(0).optional(),
  cookiePrice: z.number().min(0).optional(),
  designCount: z.number().int().min(1).max(100).optional(),
  additionalDesignCount: z.number().int().min(0).max(100).optional(),
  addOns: z.array(z.string()),
  addOnQuantities: z
    .record(z.string(), z.number().int().min(1).max(999))
    .optional(),
  addOnPriceOverrides: z
    .record(z.string(), z.number().min(0).max(10_000_000))
    .optional(),
  customAddOns: z
    .array(
      z.object({
        label: z.string().max(80).optional().or(z.literal("")),
        price: z.number().min(0).max(10_000_000).default(0),
      }),
    )
    .optional(),
  darkColorButtercreamColors: z.array(z.string()).optional(),
  parsedUnitPrice: z.number().min(0).optional(),
  parsedSubtotal: z.number().min(0).optional(),
  pricingSource: z.enum(["RECAP"]).optional(),
  cookieDifficultyBreakdown: z.string().max(400).optional().or(z.literal("")),
  greetingCard: z.string().max(400).optional().or(z.literal("")),
  bouquetPaperColor: z.string().max(200).optional().or(z.literal("")),
  ribbon: z.string().max(200).optional().or(z.literal("")),
  flowerCount: z.string().max(200).optional().or(z.literal("")),
  flowerColor: z.string().max(200).optional().or(z.literal("")),
  ribbonColor: z.string().max(200).optional().or(z.literal("")),
  notes: z.string().max(400).optional().or(z.literal("")),
});

export const addressSchema = z.object({
  label: z.string().min(1, "Address label is required"),
  area: z.string().default(""),
  postalCode: z
    .string()
    .default("")
    .refine(
      (value) =>
        value.trim().length === 0 ||
        sanitizePostalCodeInput(value).length === 5,
      "Kode pos harus 5 digit.",
    ),
  addressLine: z.string().default(""),
});

export const bookingSchema = z
  .object({
    customerName: z.string().min(2, "Customer name is required"),
    phoneNumber: z.string().min(8, "Phone number is required"),
    deliveryDate: z.string().min(1, "Delivery date is required"),
    deliverySlot: z.string().min(1, "Delivery slot is required"),
    deliveryMethod: z.enum([
      "PICKUP",
      "CUSTOMER_APP_COURIER",
      "ASSISTED_GOSEND",
      "ASSISTED_GRAB",
      "ASSISTED_GOCAR",
      "ASSISTED_PAXEL",
      "ASSISTED_SAME_DAY",
      "REGULAR_JNE_JNT",
    ]),
    sales_channel: z.enum(["direct", "tokopedia", "shopee"], {
      error: "Sales channel wajib dipilih.",
    }),
    customNotes: z.string().max(1200).optional().or(z.literal("")),
    paymentStatus: z.enum(["DP Paid", "Paid"]),
    dpPaidAmount: z.number().default(0),
    finalPaidAmount: z.number().default(0),
    wholesaleDiscountPercent: z
      .union([z.literal(0), z.literal(10), z.literal(15), z.literal(20)])
      .default(0),
    productAdjustment: z.number().default(0),
    nonProductAdjustment: z.number().default(0),
    items: z.array(itemSchema).min(1, "At least one item is required"),
    deliveryAddresses: z
      .array(addressSchema)
      .min(1, "At least one address is required"),
    isManualShippingOverride: z.boolean().default(false),
    manualShippingFee: z.number().default(0),
    isManualDpOverride: z.boolean().default(false),
    manualDpAmount: z.number().default(0),
  })
  .superRefine((values, ctx) => {
    values.deliveryAddresses.forEach((address, index) => {
      const addressLine = (address.addressLine || "").trim();
      const postalCode = sanitizePostalCodeInput(address.postalCode || "");
      const embeddedPostalCode = extractPostalCodeFromAddress(
        addressLine,
      );
      const requiresPrimaryAddress = values.deliveryMethod !== "PICKUP";
      const shouldValidateAddressDetails =
        index === 0 ? requiresPrimaryAddress : addressLine.length > 0;

      if (index === 0 && requiresPrimaryAddress && addressLine.length < 5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["deliveryAddresses", index, "addressLine"],
          message: "Alamat wajib diisi untuk metode pengiriman ini.",
        });
      }

      if (
        shouldValidateAddressDetails &&
        address.postalCode.trim().length > 0 &&
        postalCode.length !== 5
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["deliveryAddresses", index, "postalCode"],
          message: "Kode pos harus 5 digit.",
        });
      }

      if (
        shouldValidateAddressDetails &&
        (ADDRESS_CONTACT_LABEL_PATTERN.test(addressLine) ||
          ADDRESS_PHONE_PATTERN.test(addressLine))
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["deliveryAddresses", index, "addressLine"],
          message:
            "Alamat jangan dicampur dengan nama penerima atau nomor telepon.",
        });
      }

      if (usesShippingEngine(values.deliveryMethod) && index === 0) {
        if (!areaLooksValid(address.area || "")) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["deliveryAddresses", index, "area"],
            message:
              "Area wajib diisi minimal Kecamatan / Kota untuk metode shipping otomatis.",
          });
        }

        if (!postalCode && !embeddedPostalCode) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["deliveryAddresses", index, "postalCode"],
            message:
              "Isi kode pos 5 digit agar ongkir dan pembuatan resi lebih akurat.",
          });
        }

        if (addressLine.length < 15) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["deliveryAddresses", index, "addressLine"],
            message:
              "Alamat utama terlalu singkat untuk shipping. Isi alamat lengkap.",
          });
        } else if (!addressLooksStructured(addressLine)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["deliveryAddresses", index, "addressLine"],
            message:
              "Alamat utama perlu memuat jalan/perumahan/apartemen dan nomor/unit.",
          });
        }
      }
    });
  });

export type BookingFormInput = z.input<typeof bookingSchema>;
export type BookingFormValues = z.output<typeof bookingSchema>;
