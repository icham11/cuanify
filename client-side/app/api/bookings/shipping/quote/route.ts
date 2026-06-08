import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import {
  applyWeightOverridesToShippingItems,
  normalizeProductLookupKey,
} from "@/lib/bookings/product-weight";
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
  deliveryMethod: z
    .enum([
      "REGULAR_JNE_JNT",
      "ASSISTED_PAXEL",
      "ASSISTED_GOSEND",
      "ASSISTED_GOCAR",
      "ASSISTED_GRAB",
      "ASSISTED_SAME_DAY",
    ])
    .optional(),
  totalValue: z.number().min(0),
  items: z
    .array(
      z.object({
        name: z.string().min(1),
        productLookupKey: z.string().optional(),
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
    const { businessId } = await requireAuth();

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

    const productWeights = await prisma.product.findMany({
      where: {
        businessId,
        deletedAt: null,
      },
      select: {
        name: true,
        weightGram: true,
      },
    });

    const weightByProductName = new Map(
      productWeights.map((product) => [
        normalizeProductLookupKey(product.name),
        Math.max(0, Number(product.weightGram ?? 0)),
      ]),
    );

    const normalizedPayload: ShippingQuoteRequest = {
      ...parsed.data,
      items: applyWeightOverridesToShippingItems(
        parsed.data.items,
        weightByProductName,
      ),
    };

    const result = await getShippingQuote(normalizedPayload);
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
