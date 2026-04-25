import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireAuth, AuthError } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import {
  buildEffectiveProductCatalog,
  normalizeCatalogAdminState,
} from "@/lib/bookings/catalog-state";
import { syncBakeryCatalogToDashboardProducts } from "@/lib/bookings/product-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const catalogStateSchema = z.object({
  productVariantPriceOverrides: z.record(z.string(), z.number()),
  addOnPriceOverrides: z.record(z.string(), z.number()),
  inactiveProducts: z.array(z.string()),
  inactiveAddOns: z.array(z.string()),
  customProducts: z.array(
    z.object({
      category: z.string(),
      subcategory: z.string(),
      productName: z.string(),
      variantLabel: z.string(),
      price: z.number(),
    }),
  ),
  customAddOns: z.array(
    z.object({
      category: z.string(),
      id: z.string(),
      label: z.string(),
      price: z.number(),
    }),
  ),
});

function normalizeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function isExpiredTransactionError(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2028"
  ) {
    return true;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("expired transaction") ||
      message.includes("transaction api error")
    );
  }

  return false;
}

export async function GET() {
  try {
    const { businessId } = await requireAuth();

    const rows = await prisma.$queryRaw<
      Array<{ id: number; metadata: unknown }>
    >`SELECT id, metadata
       FROM "BusinessDocument"
       WHERE "businessId" = ${businessId}
         AND "sourceType" = 'bakery_catalog_config'
       ORDER BY "updatedAt" DESC
       LIMIT 1`;

    if (!rows[0]) {
      return NextResponse.json({ success: true, data: null }, { status: 200 });
    }

    const parsed = catalogStateSchema.safeParse(rows[0].metadata);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Stored catalog config is invalid.",
          details: parsed.error.issues,
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { success: true, data: parsed.data },
      { status: 200 },
    );
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { error: normalizeError(error) || "Failed to load catalog config." },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { businessId } = await requireAuth();
    const body = await request.json();
    const parsed = catalogStateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid payload.",
          details: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    const payload = parsed.data;
    const content = "bakery catalog config";
    const contentHash = createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex");
    const metadataJson = JSON.stringify(payload);

    const existing = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT id
      FROM "BusinessDocument"
      WHERE "businessId" = ${businessId}
        AND "sourceType" = 'bakery_catalog_config'
      ORDER BY "updatedAt" DESC
      LIMIT 1`;

    if (existing[0]) {
      await prisma.$executeRaw`
        UPDATE "BusinessDocument"
        SET content = ${content},
            "contentHash" = ${contentHash},
            metadata = ${metadataJson}::jsonb,
            "updatedAt" = NOW()
        WHERE id = ${existing[0].id}`;
    } else {
      await prisma.$executeRaw`
        INSERT INTO "BusinessDocument"
          ("businessId", content, "contentHash", "sourceType", metadata, "chunkIndex", "createdAt", "updatedAt")
        VALUES
          (${businessId}, ${content}, ${contentHash}, 'bakery_catalog_config', ${metadataJson}::jsonb, 0, NOW(), NOW())`;
    }

    const normalizedState = normalizeCatalogAdminState(payload);
    const productSync = await syncBakeryCatalogToDashboardProducts({
      businessId,
      productCatalog: buildEffectiveProductCatalog(normalizedState),
    });

    return NextResponse.json({ success: true, productSync }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (isExpiredTransactionError(error)) {
      return NextResponse.json(
        {
          error:
            "Sinkronisasi catalog masih diproses dan database sedang sibuk. Coba lagi beberapa detik lagi.",
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { error: normalizeError(error) || "Failed to save catalog config." },
      { status: 500 },
    );
  }
}
