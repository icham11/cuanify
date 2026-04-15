import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/session";
import { createShippingResi } from "@/lib/bookings/shipping-service";
import { estimateOperationalWeightGram } from "@/lib/bookings/delivery-rules";
import { normalizeDateInput } from "@/lib/helpers/date-normalization";
import { getJakartaTodayIsoDate, isDueForScheduledShipment } from "@/lib/bookings/shipping-schedule";
import type {
  ShippingQuote,
  ShippingQuoteItemInput,
  ShippingResiRequest,
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
  provider: z.enum(SHIPPING_PROVIDER_VALUES),
  courierCode: z.string().min(1),
  courierServiceCode: z.string().min(1),
  courierServiceName: z.string().min(1),
  price: z.number().min(0),
  eta: z.string().default("-"),
  distanceKm: z.number().min(0).default(0),
  source: z.enum(["biteship", "fallback"]).default("biteship"),
  destinationPostalCode: z.string().optional(),
  destinationLatitude: z.number().optional(),
  destinationLongitude: z.number().optional(),
});

type DueOrderRow = {
  business_id: number;
  external_id: string;
  booking_code: string | null;
  resi: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  delivery_date: string | null;
  delivery_slot: string | null;
  notes: string | null;
  total_price: unknown;
  order_status: string | null;
  shipping_quote: unknown;
  shipment: unknown;
};

type PayloadRow = {
  payload: unknown;
};

type CronResultItem = {
  businessId: number;
  orderId: string;
  bookingCode: string;
  status: "created" | "skipped" | "failed";
  message: string;
  trackingNumber?: string;
};

type JsonRecord = Record<string, unknown>;

function parseJsonField(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as JsonRecord;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
}

function normalizePhoneForPayload(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 6) return phone;
  return "081111111111";
}

function sanitizeReferenceId(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const fallback = `AUTO-${Date.now()}`;
  const candidate = (sanitized || fallback).toUpperCase();
  return candidate.slice(0, 60);
}

function buildReferenceId(row: DueOrderRow): string {
  const bookingCode = asString(row.booking_code).trim();
  const externalId = asString(row.external_id).trim();
  return sanitizeReferenceId(`${bookingCode || externalId}-SCHEDULED`);
}

function buildShippingItems(itemsPayload: JsonRecord[]): ShippingQuoteItemInput[] {
  const items = itemsPayload
    .map((item) => {
      const quantity = Math.max(1, Math.round(asNumber(item.quantity) || 1));
      const basePrice = asNumber(item.basePrice);
      const addOnTotal = asNumber(item.addOnTotal);
      const lineTotal = asNumber(item.lineTotal);
      const valuePerItemRaw =
        lineTotal > 0 && quantity > 0
          ? lineTotal / quantity
          : basePrice + addOnTotal;
      const value = Math.max(1000, Math.round(valuePerItemRaw || 1000));

      const nameRaw = `${asString(item.productName).trim()} (${asString(item.size).trim()})`
        .replace(/\(\s*\)/g, "")
        .trim();
      const name = nameRaw || "Order Item";

      const weightGram = Math.max(
        100,
        estimateOperationalWeightGram({
          category: asString(item.category),
          subcategory: asString(item.subcategory),
          productName: asString(item.productName),
          size: asString(item.size),
          quantity,
        }),
      );

      return {
        name,
        quantity,
        weightGram,
        value,
      };
    })
    .filter((item) => item.quantity > 0);

  return items;
}

function extractPrimaryAddress(
  addressPayloads: JsonRecord[],
  fallbackAddress: string,
): string {
  const fromAddressTable = addressPayloads
    .map((entry) => asString(entry.addressLine).trim())
    .find((entry) => entry.length > 0);

  return fromAddressTable || fallbackAddress.trim();
}

function parseShippingQuote(value: unknown): ShippingQuote | null {
  const raw = parseJsonField(value);
  const parsed = shippingQuoteSchema.safeParse(raw);
  if (!parsed.success) return null;
  return parsed.data;
}

function parseDueDate(value: string | null): string {
  return normalizeDateInput(value || "") || "";
}

async function ensureBakeryOrderTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS bakery_orders (
      id BIGSERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      external_id TEXT NOT NULL,
      booking_code TEXT,
      resi TEXT,
      customer_name TEXT,
      customer_phone TEXT,
      customer_address TEXT,
      delivery_date TEXT,
      delivery_slot TEXT,
      notes TEXT,
      total_price NUMERIC(14,2) NOT NULL DEFAULT 0,
      order_status TEXT,
      shipping_quote JSONB,
      shipment JSONB,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (business_id, external_id)
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS bakery_order_items (
      id BIGSERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      order_external_id TEXT NOT NULL,
      item_index INTEGER NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS bakery_order_addresses (
      id BIGSERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      order_external_id TEXT NOT NULL,
      address_index INTEGER NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function loadOrderPayloadRows(args: {
  businessId: number;
  orderId: string;
}): Promise<{ items: JsonRecord[]; addresses: JsonRecord[] }> {
  const { businessId, orderId } = args;

  const itemRows = await prisma.$queryRaw<PayloadRow[]>`
    SELECT payload
    FROM bakery_order_items
    WHERE business_id = ${businessId}
      AND order_external_id = ${orderId}
    ORDER BY item_index ASC
  `;

  const addressRows = await prisma.$queryRaw<PayloadRow[]>`
    SELECT payload
    FROM bakery_order_addresses
    WHERE business_id = ${businessId}
      AND order_external_id = ${orderId}
    ORDER BY address_index ASC
  `;

  return {
    items: itemRows
      .map((row) => asRecord(parseJsonField(row.payload)))
      .filter((row): row is JsonRecord => Boolean(row)),
    addresses: addressRows
      .map((row) => asRecord(parseJsonField(row.payload)))
      .filter((row): row is JsonRecord => Boolean(row)),
  };
}

async function processOrder(row: DueOrderRow): Promise<CronResultItem> {
  const businessId = Number(row.business_id);
  const orderId = asString(row.external_id);
  const bookingCode =
    asString(row.booking_code).trim() ||
    asString(row.resi).trim() ||
    orderId;

  const selectedQuote = parseShippingQuote(row.shipping_quote);
  if (!selectedQuote) {
    return {
      businessId,
      orderId,
      bookingCode,
      status: "skipped",
      message: "shippingQuote tidak valid atau tidak lengkap.",
    };
  }

  const payloadRows = await loadOrderPayloadRows({ businessId, orderId });
  const items = buildShippingItems(payloadRows.items);

  if (items.length === 0) {
    return {
      businessId,
      orderId,
      bookingCode,
      status: "skipped",
      message: "Item order kosong, tidak bisa membuat resi.",
    };
  }

  const primaryAddress = extractPrimaryAddress(
    payloadRows.addresses,
    asString(row.customer_address),
  );
  if (!primaryAddress) {
    return {
      businessId,
      orderId,
      bookingCode,
      status: "skipped",
      message: "Alamat tujuan tidak tersedia.",
    };
  }

  const referenceId = buildReferenceId(row);
  const totalValue = Math.max(1000, Math.round(asNumber(row.total_price)));

  const requestPayload: ShippingResiRequest = {
    orderId,
    bookingCode,
    referenceId,
    customerName: asString(row.customer_name).trim() || "Customer",
    customerPhone: normalizePhoneForPayload(asString(row.customer_phone)),
    destinationAddress: primaryAddress,
    destinationPostalCode:
      selectedQuote.destinationPostalCode ||
      primaryAddress.match(/\b\d{5}\b/)?.[0],
    destinationLatitude: selectedQuote.destinationLatitude,
    destinationLongitude: selectedQuote.destinationLongitude,
    deliveryDate: parseDueDate(row.delivery_date),
    deliveryTime: asString(row.delivery_slot).trim() || undefined,
    selectedQuote,
    items,
    totalValue,
  };

  const createResult = await createShippingResi(requestPayload);
  if (!createResult.success || !createResult.shipment) {
    return {
      businessId,
      orderId,
      bookingCode,
      status: "failed",
      message: createResult.error || "Gagal membuat resi dari Biteship.",
    };
  }

  const shipment = createResult.shipment;
  const shipmentJson = JSON.stringify(shipment);
  const trackingNumber = shipment.trackingNumber || "";

  await prisma.$executeRawUnsafe(
    `
      UPDATE bakery_orders
      SET
        shipment = $1::jsonb,
        resi = CASE
          WHEN COALESCE(NULLIF(TRIM(resi), ''), '') = '' THEN $2
          ELSE resi
        END,
        updated_at = NOW()
      WHERE business_id = $3
        AND external_id = $4
        AND shipment IS NULL
    `,
    shipmentJson,
    trackingNumber,
    businessId,
    orderId,
  );

  return {
    businessId,
    orderId,
    bookingCode,
    status: "created",
    message: "Resi berhasil dibuat.",
    trackingNumber,
  };
}

async function handleCronRequest(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const hasCronSecret = Boolean(
    cronSecret && authHeader === `Bearer ${cronSecret}`,
  );

  let businessIdScope: number | null = null;
  if (!hasCronSecret) {
    try {
      const auth = await requireAuth();
      businessIdScope = auth.businessId;
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const todayJakarta = getJakartaTodayIsoDate();

  try {
    await ensureBakeryOrderTables();

    const candidateRows = businessIdScope
      ? await prisma.$queryRaw<DueOrderRow[]>`
          SELECT
            business_id,
            external_id,
            booking_code,
            resi,
            customer_name,
            customer_phone,
            customer_address,
            delivery_date,
            delivery_slot,
            notes,
            total_price,
            order_status,
            shipping_quote,
            shipment
          FROM bakery_orders
          WHERE business_id = ${businessIdScope}
            AND shipment IS NULL
            AND shipping_quote IS NOT NULL
            AND COALESCE(LOWER(order_status), '') NOT IN ('delivered', 'cancelled')
            AND UPPER(COALESCE(shipping_quote->>'provider', '')) IN ('GOJEK', 'GRAB', 'PAXEL')
          ORDER BY updated_at ASC
          LIMIT 250
        `
      : await prisma.$queryRaw<DueOrderRow[]>`
          SELECT
            business_id,
            external_id,
            booking_code,
            resi,
            customer_name,
            customer_phone,
            customer_address,
            delivery_date,
            delivery_slot,
            notes,
            total_price,
            order_status,
            shipping_quote,
            shipment
          FROM bakery_orders
          WHERE shipment IS NULL
            AND shipping_quote IS NOT NULL
            AND COALESCE(LOWER(order_status), '') NOT IN ('delivered', 'cancelled')
            AND UPPER(COALESCE(shipping_quote->>'provider', '')) IN ('GOJEK', 'GRAB', 'PAXEL')
          ORDER BY updated_at ASC
          LIMIT 500
        `;

    const dueRows = candidateRows.filter((row) => {
      const shippingQuote = parseShippingQuote(row.shipping_quote);
      const candidate = {
        deliveryDate: parseDueDate(row.delivery_date),
        orderStatus: row.order_status,
        notes: row.notes,
        shippingQuote,
        shipment: parseJsonField(row.shipment),
      };
      return isDueForScheduledShipment(candidate, todayJakarta);
    });

    const results: CronResultItem[] = [];
    for (const row of dueRows) {
      try {
        const result = await processOrder(row);
        results.push(result);
      } catch (error) {
        results.push({
          businessId: Number(row.business_id),
          orderId: asString(row.external_id),
          bookingCode:
            asString(row.booking_code).trim() || asString(row.external_id),
          status: "failed",
          message:
            error instanceof Error
              ? error.message
              : "Terjadi error saat memproses order.",
        });
      }
    }

    const createdCount = results.filter((item) => item.status === "created").length;
    const skippedCount = results.filter((item) => item.status === "skipped").length;
    const failedCount = results.filter((item) => item.status === "failed").length;

    return NextResponse.json({
      success: true,
      generatedAt: new Date().toISOString(),
      todayJakarta,
      scopedBusinessId: businessIdScope,
      scannedCandidateCount: candidateRows.length,
      dueCount: dueRows.length,
      createdCount,
      skippedCount,
      failedCount,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to process scheduled shipments.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  return handleCronRequest(req);
}

export async function POST(req: NextRequest) {
  return handleCronRequest(req);
}
