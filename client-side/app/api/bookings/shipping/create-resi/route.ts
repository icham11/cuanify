import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { createShippingResi } from "@/lib/bookings/shipping-service";
import type { ShippingResiRequest } from "@/lib/bookings/shipping-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHIPPING_PROVIDER_VALUES = [
  "JNE",
  "PAXEL",
  "JNT",
  "GOJEK",
  "GRAB",
] as const;

const shippingQuoteSchema = z.object({
  id: z.string().default(""),
  provider: z.enum(SHIPPING_PROVIDER_VALUES),
  courierCode: z.string().min(1),
  courierServiceCode: z.string().min(1),
  courierServiceName: z.string().min(1),
  price: z.number().min(0),
  eta: z.string().default("-"),
  distanceKm: z.number().min(0).default(0),
  source: z.enum(["biteship", "fallback"]).default("biteship"),
});

const createResiSchema = z.object({
  orderId: z.string().min(1),
  bookingCode: z.string().min(1),
  referenceId: z.string().min(1).optional(),
  customerName: z.string().min(1),
  customerPhone: z.string().min(6),
  destinationAddress: z.string().min(5),
  destinationPostalCode: z.string().optional(),
  destinationLatitude: z.number().optional(),
  destinationLongitude: z.number().optional(),
  deliveryDate: z.string().optional(),
  deliveryTime: z.string().optional(),
  totalValue: z.number().min(0),
  selectedQuote: shippingQuoteSchema,
  items: z
    .array(
      z.object({
        name: z.string().min(1),
        quantity: z.number().min(1),
        weightGram: z.number().min(1),
        value: z.number().min(0),
      }),
    )
    .min(1),
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
    await requireAuth();

    const body = (await request.json()) as ShippingResiRequest;
    const parsed = createResiSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid create-resi payload.",
          details: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    const result = await createShippingResi(parsed.data);
    const status = result.success ? 200 : 400;
    return NextResponse.json(result, { status });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
