import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { runBookingAutomations } from "@/lib/bookings/automation-service";
import { loadEffectiveBookingCatalog } from "@/lib/bookings/catalog-config-server";
import { calculateOrderPriceSafe } from "@/lib/bookings/pricing-service";
import type {
  BookingAutomationEvent,
  BookingAutomationOrderPayload,
  BookingAutomationRequest,
} from "@/lib/bookings/automation-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const orderItemSchema = z.object({
  id: z.string(),
  category: z.string(),
  subcategory: z.string(),
  productName: z.string(),
  size: z.string(),
  quantity: z.number(),
  tokenDifficulty: z
    .enum([
      "SIMPLE",
      "NORMAL",
      "HARD",
      "ADVANCED",
      "EXPERT",
      "MEDIUM",
      "DIFFICULT",
    ])
    .optional(),
  notes: z.string().optional(),
  productType: z
    .enum(["COOKIE", "BOUQUET", "CAKE", "CUPCAKE", "TOWER"])
    .optional(),
  selectedPrice: z.number().optional(),
  basePrice: z.number().optional(),
  cookiePrice: z.number().optional(),
  designCount: z.number().int().optional(),
  additionalDesignCount: z.number().int().optional(),
  additionalCost: z.number().optional(),
  bouquetType: z.enum(["HAND", "STANDING"]).optional(),
  bouquetCost: z.number().optional(),
  cakeDiameterCm: z.number().int().optional(),
  cakeHeightCm: z.number().int().optional(),
  cakeType: z.enum(["DUMMY", "REAL"]).optional(),
  cupcakePackType: z.enum(["DOZEN", "INDIVIDUAL"]).optional(),
  hasCookieTopper: z.boolean().optional(),
  lineTotal: z.number().optional(),
});

const addressSchema = z.object({
  id: z.string(),
  label: z.string(),
  area: z.string(),
  addressLine: z.string(),
});

const referenceImageSchema = z.object({
  url: z.string(),
  label: z.string().optional(),
  note: z.string().optional(),
  orderIndex: z.number().optional(),
});

const changeInfoSchema = z.object({
  summary: z.string().optional(),
  lines: z.array(z.string()).optional(),
});

const requestSchema = z.object({
  eventType: z.enum([
    "order_created",
    "order_confirmed",
    "order_completed",
    "order_rescheduled",
    "order_calendar_sync",
  ]),
  order: z.object({
    id: z.string(),
    bookingCode: z.string().default(""),
    resi: z.string().default(""),
    customerName: z.string(),
    customerPhone: z.string().default(""),
    customerAddress: z.string().default(""),
    deliveryDate: z.string().default(""),
    deliverySlot: z.string().default(""),
    deliveryMethod: z.string().default(""),
    paymentStatus: z.string().default("Pending"),
    orderStatus: z.string().default("Inquiry"),
    totalPrice: z.number(),
    deliveryFee: z.number().default(0),
    manualAdjustment: z.number().default(0),
    downPaymentAmount: z.number().default(0),
    remainingBalance: z.number().default(0),
    notes: z.string().optional(),
    items: z.array(orderItemSchema),
    deliveryAddresses: z.array(addressSchema),
    imageUrl: z.string().optional(),
    imageUrls: z.array(z.string()).optional(),
    referenceImages: z.array(referenceImageSchema).optional(),
    changeInfo: changeInfoSchema.optional(),
    shippingQuote: z.unknown().optional(),
    shipment: z.unknown().optional(),
    whatsAppParsedData: z.unknown().optional(),
  }),
});

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();

    const body = (await request.json()) as BookingAutomationRequest;
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid automation request payload.",
          details: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    const eventType = parsed.data.eventType as BookingAutomationEvent;
    const order = parsed.data.order as BookingAutomationOrderPayload;

    const { productCatalog } = await loadEffectiveBookingCatalog(
      auth.businessId,
    );
    const pricing = calculateOrderPriceSafe({
      items: order.items,
      fallbackTotal: order.totalPrice,
      deliveryFee: order.deliveryFee,
      manualAdjustment: order.manualAdjustment,
      catalog: productCatalog,
    });
    const hasStructuredPricingSignals = order.items.some((item) => {
      return (
        Boolean(item.productType) ||
        item.selectedPrice !== undefined ||
        item.basePrice !== undefined ||
        item.tokenDifficulty !== undefined ||
        item.cookiePrice !== undefined ||
        item.designCount !== undefined ||
        item.additionalDesignCount !== undefined ||
        item.additionalCost !== undefined ||
        item.bouquetType !== undefined ||
        item.bouquetCost !== undefined ||
        item.cakeDiameterCm !== undefined ||
        item.cakeHeightCm !== undefined ||
        item.cakeType !== undefined ||
        item.cupcakePackType !== undefined ||
        item.hasCookieTopper !== undefined ||
        item.lineTotal !== undefined
      );
    });

    const orderForAutomation: BookingAutomationOrderPayload = {
      ...order,
      totalPrice:
        hasStructuredPricingSignals && !pricing.usedOrderFallback
          ? pricing.total
          : order.totalPrice,
    };

    const result = await runBookingAutomations(
      eventType,
      orderForAutomation,
      auth.businessId,
    );

    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    const message = getErrorMessage(error);
    const lowered = message.toLowerCase();
    const status =
      lowered.includes("connection error") ||
      lowered.includes("fetch failed") ||
      lowered.includes("network")
        ? 503
        : 500;

    return NextResponse.json(
      {
        error: message || "Failed to execute booking automations",
        details: message,
      },
      { status },
    );
  }
}

export async function GET() {
  try {
    await requireAuth();
    const bookingCalendarSyncMode =
      String(process.env.BOOKING_CALENDAR_SYNC_MODE || "internal")
        .trim()
        .toLowerCase() === "google"
        ? "google"
        : "internal";
    return NextResponse.json({
      status: "ok",
      integrations: {
        bookingCalendarSyncMode,
        internalCalendarBackedByBookings: true,
        fonnteConfigured: Boolean(process.env.FONNTE_TOKEN),
        productionTargetConfigured: Boolean(
          process.env.FONNTE_PRODUCTION_TARGET,
        ),
        googleServiceAccountConfigured: Boolean(
          process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
          process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
        ),
        googleCalendarConfigured: Boolean(process.env.GOOGLE_CALENDAR_ID),
        googleSheetsConfigured: Boolean(process.env.GOOGLE_SHEETS_ID),
      },
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to check automation status" },
      { status: 500 },
    );
  }
}
