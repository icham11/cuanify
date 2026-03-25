import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { getShippingQuote } from "@/lib/bookings/shipping-service";
import type { ShippingQuoteRequest } from "@/lib/bookings/shipping-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const quoteSchema = z.object({
  destinationAddress: z.string().min(5),
  destinationPostalCode: z.string().optional(),
  destinationArea: z.string().optional(),
  destinationLatitude: z.number().optional(),
  destinationLongitude: z.number().optional(),
  totalValue: z.number().min(0),
  items: z
    .array(
      z.object({
        name: z.string().min(1),
        quantity: z.number().min(1),
        weightGram: z.number().min(1),
        value: z.number().min(0),
      })
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

    const body = (await request.json()) as ShippingQuoteRequest;
    const parsed = quoteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid shipping quote payload.",
          details: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const result = await getShippingQuote(parsed.data);
    const status = result.success ? 200 : 400;
    return NextResponse.json(result, { status });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error),
      },
      { status: 500 }
    );
  }
}
