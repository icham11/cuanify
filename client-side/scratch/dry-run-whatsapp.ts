import dotenv from "dotenv";
import path from "path";
import { buildProductionCaption } from "@/lib/whatsapp/sendOrderToWhatsApp";

// Load env from client-side/.env for fidelity (but we won't send anything)
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Example payload mimicking parsed order where both template and user-upload exist
const examplePayload = {
  customerName: "Deni",
  phone: "085776999088",
  deliveryDate: "2026-05-09",
  deliveryTime: "20.00",
  item: "1x Real Cake (D14-T10)",
  notes: "",
  address: "Jl. Pademangan 3 Gang 3 A No 45",
  bookingCode: "DE088-090526-001",
  recipientName: "Deni",
  recipientPhone: "085776999088",
  shippingMethod: "gosend",
  fullAddress: "Jl. Pademangan 3 Gang 3 A No 45",
  captionItems: [
    {
      productName: "Real Cake (D14-T10)",
      unitPrice: 610000,
      quantity: 1,
      subtotal: 610000,
      orderLabel: "Real Cake (D14-T10)",
      detailLines: [
        { label: "Nama di Cake", value: "Happy Birth Day Ayangku🩷" },
        { label: "Umur di cake", value: "26" },
        { label: "Ukuran cake", value: "D14-T10" },
        { label: "Rasa cake", value: "Double choco" },
      ],
    },
  ],
  // Simulate both template-generated and user-uploaded images
  imageUrl:
    "https://res.cloudinary.com/demo/image/upload/orders/generated/template-123.jpg",
  imageUrls: [
    "data:image/png;base64,AAAA...",
    "https://uploads.example.com/user-uploads/order-456.jpg",
  ],
  referenceImages: [
    {
      url: "https://uploads.example.com/user-uploads/ref-1.jpg",
      label: "Design 1",
    },
  ],
};

function normalizeReferenceImageUrl(url) {
  if (!url) return null;
  const trimmed = String(url).trim();
  if (!trimmed) return null;
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(trimmed)) return trimmed;

  try {
    const parsed = new URL(trimmed);
    if (parsed.pathname.includes("/orders/generated/")) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeReferenceImageUrls(order) {
  const candidates = [order.imageUrl ?? "", ...(order.imageUrls ?? [])];
  const normalized = candidates
    .map((value) => normalizeReferenceImageUrl(value))
    .filter((v) => Boolean(v));
  return Array.from(new Set(normalized));
}

function selectOriginalImage(order) {
  const selectedImageUrls = normalizeReferenceImageUrls(order);
  const structuredReferenceImages = Array.isArray(order.referenceImages)
    ? order.referenceImages
    : [];
  const sourceImageCandidates = [
    ...selectedImageUrls,
    ...structuredReferenceImages.map((r) => r.url),
  ].filter(
    (url) =>
      url &&
      !url.includes("/orders/generated/") &&
      !url.includes("via.placeholder.com"),
  );

  // Prefer only HTTP/HTTPS user-uploaded images
  const originalImageUrl = sourceImageCandidates.find((u) =>
    /^https?:\/\//i.test(String(u)),
  );
  return { selectedImageUrls, sourceImageCandidates, originalImageUrl };
}

const selection = selectOriginalImage(examplePayload as any);
console.log("Selected image URLs:", selection.selectedImageUrls);
console.log("Source image candidates:", selection.sourceImageCandidates);
console.log(
  "Chosen original image (should be user-upload HTTP):",
  selection.originalImageUrl,
);

const caption = buildProductionCaption(examplePayload as any);
console.log("\n=== Generated Caption ===\n");
console.log(caption);
