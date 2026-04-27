import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import { createShippingResi } from "@/lib/bookings/shipping-service";
import { inferScheduledProviderFromQuote } from "@/lib/bookings/shipping-schedule";
import { calculateShippingInsuranceFee } from "@/lib/bookings/shipping-insurance";
import type {
  ShippingResiRequest,
  ShippingShipment,
  ShippingQuote,
} from "@/lib/bookings/shipping-types";

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
  provider: z.enum(SHIPPING_PROVIDER_VALUES).optional(),
  courierCode: z.string().min(1),
  courierServiceCode: z.string().min(1),
  courierServiceName: z.string().min(1),
  price: z.number().min(0),
  priceWithoutInsurance: z.number().min(0).optional(),
  eta: z.string().default("-"),
  distanceKm: z.number().min(0).default(0),
  source: z.enum(["biteship", "fallback"]).default("biteship"),
  destinationPostalCode: z.string().optional(),
  destinationLatitude: z.number().optional(),
  destinationLongitude: z.number().optional(),
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

function parseExistingShipment(value: unknown): ShippingShipment | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return parseExistingShipment(JSON.parse(value));
    } catch {
      return null;
    }
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const trackingNumber =
    typeof record.trackingNumber === "string"
      ? record.trackingNumber.trim()
      : "";
  if (!trackingNumber) return null;

  return record as unknown as ShippingShipment;
}

async function findExistingShipment(args: {
  businessId: number;
  orderId: string;
}): Promise<ShippingShipment | null> {
  const rows = await prisma.$queryRaw<{ shipment: unknown }[]>`
    SELECT shipment
    FROM bakery_orders
    WHERE business_id = ${args.businessId}
      AND external_id = ${args.orderId}
    LIMIT 1
  `;

  const shipment = rows[0]?.shipment;
  return parseExistingShipment(shipment);
}

export async function POST(request: NextRequest) {
  try {
    const { businessId } = await requireAuth();

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

    const selectedQuoteProvider =
      parsed.data.selectedQuote.provider ||
      inferScheduledProviderFromQuote(parsed.data.selectedQuote);

    if (!selectedQuoteProvider) {
      return NextResponse.json(
        {
          success: false,
          error:
            "selectedQuote.provider tidak dikenali. Pastikan quote berasal dari GOJEK/GRAB/PAXEL/JNE/JNT yang valid.",
        },
        { status: 400 },
      );
    }

    const priceWithoutInsurance = Math.max(
      0,
      Number(
        parsed.data.selectedQuote.priceWithoutInsurance ??
          parsed.data.selectedQuote.price,
      ) || 0,
    );
    const insuranceFee = calculateShippingInsuranceFee({
      provider: selectedQuoteProvider,
      transactionValue: parsed.data.totalValue,
    });

    const normalizedSelectedQuote: ShippingQuote = {
      ...parsed.data.selectedQuote,
      provider: selectedQuoteProvider,
      priceWithoutInsurance,
      insuranceFee,
      price: priceWithoutInsurance + insuranceFee,
    };

    const normalizedPayload: ShippingResiRequest = {
      ...parsed.data,
      selectedQuote: normalizedSelectedQuote,
    };

    const existingShipment = await findExistingShipment({
      businessId,
      orderId: parsed.data.orderId,
    });

    if (existingShipment) {
      return NextResponse.json(
        {
          success: true,
          shipment: existingShipment,
          warning: "Order ini sudah memiliki resi aktif.",
        },
        { status: 200 },
      );
    }

    const result = await createShippingResi(normalizedPayload);
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
