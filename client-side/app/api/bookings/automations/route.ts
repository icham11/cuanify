import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { runBookingAutomations } from "@/lib/bookings/automation-service";
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
  notes: z.string().optional(),
});

const addressSchema = z.object({
  id: z.string(),
  label: z.string(),
  area: z.string(),
  addressLine: z.string(),
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
    deliveryDate: z.string().default(""),
    deliverySlot: z.string().default(""),
    paymentStatus: z.string().default("Pending"),
    orderStatus: z.string().default("Inquiry"),
    totalPrice: z.number(),
    deliveryFee: z.number().default(0),
    notes: z.string().optional(),
    items: z.array(orderItemSchema),
    deliveryAddresses: z.array(addressSchema),
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

    const result = await runBookingAutomations(
      eventType,
      order,
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
    return NextResponse.json({
      status: "ok",
      integrations: {
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
