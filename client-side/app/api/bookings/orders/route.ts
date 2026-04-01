import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { AuthError, requireAuth } from "@/lib/auth/session";
import { z } from "zod";
import {
  ensureCapacityTable,
  consumeToken,
  getCapacityForDate,
  releaseToken,
  DEFAULT_MAX_TOKEN,
} from "@/lib/bookings/token-capacity-service";
import { summarizeProductionTokensByItems } from "@/lib/bookings/operations";
import { getCalendarStatus, isPastDate } from "@/lib/calendar/getCalendarStatus";

// ─── Custom Error for capacity-full rejections ───────────────────────────────

class CapacityFullError extends Error {
  public readonly date: string;
  public readonly usedToken: number;
  public readonly maxToken: number;
  public readonly tokenNeeded: number;

  constructor(
    message: string,
    date: string,
    usedToken: number,
    maxToken: number,
    tokenNeeded: number,
  ) {
    super(message);
    this.name = "CapacityFullError";
    this.date = date;
    this.usedToken = usedToken;
    this.maxToken = maxToken;
    this.tokenNeeded = tokenNeeded;
  }
}

class CapacityCutoffError extends Error {
  public readonly date: string;

  constructor(date: string) {
    super("Pemesanan H-1 sudah ditutup (setelah jam 10 pagi)");
    this.name = "CapacityCutoffError";
    this.date = date;
  }
}

class PastDateError extends Error {
  public readonly date: string;

  constructor(date: string) {
    super("Tanggal sudah terlewat");
    this.name = "PastDateError";
    this.date = date;
  }
}

const INACTIVE_STATUSES = ["Cancelled", "Completed", "Delivered"];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SNAPSHOT_SOURCE_TYPE = "bakery_orders_snapshot";

type JsonRecord = Record<string, unknown>;

interface NormalizedOrder {
  id: string;
  bookingCode: string;
  resi: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  deliveryDate: string;
  deliverySlot: string;
  notes: string;
  basePrice: number;
  addOnTotal: number;
  deliveryFee: number;
  manualAdjustment: number;
  dpPaidAmount: number;
  finalPaidAmount: number;
  totalPaidAmount: number;
  downPaymentAmount: number;
  remainingBalance: number;
  product: string;
  totalPrice: number;
  paymentStatus: string;
  orderStatus: string;
  shippingQuote: unknown;
  shipment: unknown;
  simulations: unknown;
  whatsAppParsedData: unknown;
  statusHistory: unknown;
  automationLogs: unknown;
  paymentTransactions: unknown;
  items: JsonRecord[];
  deliveryAddresses: JsonRecord[];
}

interface DbOrderRow {
  external_id: string;
  booking_code: string | null;
  resi: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  delivery_date: string | null;
  delivery_slot: string | null;
  notes: string | null;
  base_price: unknown;
  add_on_total: unknown;
  delivery_fee: unknown;
  manual_adjustment: unknown;
  dp_paid_amount: unknown;
  final_paid_amount: unknown;
  total_paid_amount: unknown;
  down_payment_amount: unknown;
  remaining_balance: unknown;
  product: string | null;
  total_price: unknown;
  payment_status: string | null;
  order_status: string | null;
  shipping_quote: unknown;
  shipment: unknown;
  simulations: unknown;
  whatsapp_parsed_data: unknown;
  status_history: unknown;
  automation_logs: unknown;
  payment_transactions: unknown;
  created_at: Date;
  updated_at: Date;
}

interface DbItemRow {
  order_external_id: string;
  item_index: number;
  payload: unknown;
}

interface DbAddressRow {
  order_external_id: string;
  address_index: number;
  payload: unknown;
}

type SnapshotSource = "rows" | "snapshot-fallback";
type SnapshotStore = Pick<typeof prisma, "businessDocument">;

const normalizedOrderSchema = z.object({
  id: z.string().trim().min(1, "id is required"),
  bookingCode: z.string(),
  resi: z.string(),
  customerName: z.string(),
  customerPhone: z.string(),
  customerAddress: z.string(),
  deliveryDate: z.string(),
  deliverySlot: z.string(),
  notes: z.string(),
  basePrice: z.number().finite().min(0, "basePrice must be >= 0"),
  addOnTotal: z.number().finite().min(0, "addOnTotal must be >= 0"),
  deliveryFee: z.number().finite().min(0, "deliveryFee must be >= 0"),
  manualAdjustment: z.number().finite(),
  dpPaidAmount: z.number().finite().min(0, "dpPaidAmount must be >= 0"),
  finalPaidAmount: z.number().finite().min(0, "finalPaidAmount must be >= 0"),
  totalPaidAmount: z.number().finite().min(0, "totalPaidAmount must be >= 0"),
  downPaymentAmount: z
    .number()
    .finite()
    .min(0, "downPaymentAmount must be >= 0"),
  remainingBalance: z.number().finite().min(0, "remainingBalance must be >= 0"),
  product: z.string(),
  totalPrice: z.number().finite().min(0, "totalPrice must be >= 0"),
  paymentStatus: z.string().trim().min(1, "paymentStatus is required"),
  orderStatus: z.string().trim().min(1, "orderStatus is required"),
  shippingQuote: z.unknown().nullable(),
  shipment: z.unknown().nullable(),
  simulations: z.unknown().nullable(),
  whatsAppParsedData: z.unknown().nullable(),
  statusHistory: z.array(z.record(z.string(), z.unknown())),
  automationLogs: z.array(z.record(z.string(), z.unknown())),
  paymentTransactions: z.array(z.record(z.string(), z.unknown())),
  items: z.array(z.record(z.string(), z.unknown())),
  deliveryAddresses: z.array(z.record(z.string(), z.unknown())),
});

function formatValidationIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "root";
    return `${path}: ${issue.message}`;
  });
}

function parseOrdersContent(content: string | null | undefined): unknown[] {
  if (!content) return [];
  try {
    const parsed = JSON.parse(content) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asArrayOfRecords(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asRecord(entry))
    .filter((entry): entry is JsonRecord => Boolean(entry));
}

function parseJsonField(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function extractErrorDetails(error: unknown): {
  message: string;
  name?: string;
  code?: string;
  meta?: unknown;
} {
  const message = error instanceof Error ? error.message : "Unknown error";
  const name = error instanceof Error ? error.name : undefined;
  const record = asRecord(error);
  const code = typeof record?.code === "string" ? record.code : undefined;
  const meta = record?.meta;
  return { message, name, code, meta };
}

async function readOrdersSnapshot(businessId: number) {
  return prisma.businessDocument.findFirst({
    where: {
      businessId,
      sourceType: SNAPSHOT_SOURCE_TYPE,
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      content: true,
      updatedAt: true,
    },
  });
}

async function upsertOrdersSnapshot(
  db: SnapshotStore,
  params: {
    businessId: number;
    userId: number;
    orders: NormalizedOrder[];
    source: SnapshotSource;
  },
) {
  const { businessId, userId, orders, source } = params;
  const existingSnapshot = await db.businessDocument.findFirst({
    where: {
      businessId,
      sourceType: SNAPSHOT_SOURCE_TYPE,
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });

  const content = JSON.stringify(orders);
  const metadata = {
    kind: SNAPSHOT_SOURCE_TYPE,
    itemCount: orders.length,
    updatedByUserId: userId,
    updatedAt: new Date().toISOString(),
    source,
  };

  if (existingSnapshot) {
    await db.businessDocument.update({
      where: { id: existingSnapshot.id },
      data: {
        content,
        metadata,
        sourceId: businessId,
        chunkIndex: 0,
      },
    });
    return;
  }

  await db.businessDocument.create({
    data: {
      businessId,
      sourceType: SNAPSHOT_SOURCE_TYPE,
      sourceId: businessId,
      content,
      chunkIndex: 0,
      metadata,
    },
  });
}

function normalizeOrder(raw: unknown, index: number): NormalizedOrder | null {
  const record = asRecord(raw);
  if (!record) return null;

  const id = asString(record.id).trim() || `legacy-${index + 1}`;

  return {
    id,
    bookingCode: asString(record.bookingCode),
    resi: asString(record.resi),
    customerName: asString(record.customerName),
    customerPhone: asString(record.customerPhone),
    customerAddress: asString(record.customerAddress),
    deliveryDate: asString(record.deliveryDate),
    deliverySlot: asString(record.deliverySlot),
    notes: asString(record.notes),
    basePrice: asNumber(record.basePrice),
    addOnTotal: asNumber(record.addOnTotal),
    deliveryFee: asNumber(record.deliveryFee),
    manualAdjustment: asNumber(record.manualAdjustment),
    dpPaidAmount: asNumber(record.dpPaidAmount),
    finalPaidAmount: asNumber(record.finalPaidAmount),
    totalPaidAmount: asNumber(record.totalPaidAmount),
    downPaymentAmount: asNumber(record.downPaymentAmount),
    remainingBalance: asNumber(record.remainingBalance),
    product: asString(record.product),
    totalPrice: asNumber(record.totalPrice),
    paymentStatus: asString(record.paymentStatus),
    orderStatus: asString(record.orderStatus),
    shippingQuote: record.shippingQuote ?? null,
    shipment: record.shipment ?? null,
    simulations: record.simulations ?? null,
    whatsAppParsedData: record.whatsAppParsedData ?? null,
    statusHistory: record.statusHistory ?? [],
    automationLogs: record.automationLogs ?? [],
    paymentTransactions: record.paymentTransactions ?? [],
    items: asArrayOfRecords(record.items),
    deliveryAddresses: asArrayOfRecords(record.deliveryAddresses),
  };
}

async function ensureBakeryTables() {
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
      base_price NUMERIC(14,2) NOT NULL DEFAULT 0,
      add_on_total NUMERIC(14,2) NOT NULL DEFAULT 0,
      delivery_fee NUMERIC(14,2) NOT NULL DEFAULT 0,
      manual_adjustment NUMERIC(14,2) NOT NULL DEFAULT 0,
      dp_paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      final_paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      total_paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      down_payment_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      remaining_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
      product TEXT,
      total_price NUMERIC(14,2) NOT NULL DEFAULT 0,
      payment_status TEXT,
      order_status TEXT,
      shipping_quote JSONB,
      shipment JSONB,
      simulations JSONB,
      whatsapp_parsed_data JSONB,
      status_history JSONB,
      automation_logs JSONB,
      payment_transactions JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (business_id, external_id)
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_bakery_orders_business_updated
    ON bakery_orders (business_id, updated_at DESC);
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
    CREATE INDEX IF NOT EXISTS idx_bakery_order_items_lookup
    ON bakery_order_items (business_id, order_external_id, item_index);
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

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_bakery_order_addresses_lookup
    ON bakery_order_addresses (business_id, order_external_id, address_index);
  `);

  // ── Token capacity columns on bakery_orders ──
  await prisma.$executeRawUnsafe(`
    ALTER TABLE bakery_orders
    ADD COLUMN IF NOT EXISTS difficulty TEXT DEFAULT NULL;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE bakery_orders
    ADD COLUMN IF NOT EXISTS token_used INTEGER NOT NULL DEFAULT 0;
  `);

  // ── Ensure production_capacity table exists ──
  await ensureCapacityTable();
}

export async function GET() {
  try {
    const { businessId } = await requireAuth();

    let rowReadFailed = false;
    try {
      await ensureBakeryTables();

      const orderRows = await prisma.$queryRaw<DbOrderRow[]>`
        SELECT
          external_id,
          booking_code,
          resi,
          customer_name,
          customer_phone,
          customer_address,
          delivery_date,
          delivery_slot,
          notes,
          base_price,
          add_on_total,
          delivery_fee,
          manual_adjustment,
          dp_paid_amount,
          final_paid_amount,
          total_paid_amount,
          down_payment_amount,
          remaining_balance,
          product,
          total_price,
          payment_status,
          order_status,
          shipping_quote,
          shipment,
          simulations,
          whatsapp_parsed_data,
          status_history,
          automation_logs,
          payment_transactions,
          created_at,
          updated_at
        FROM bakery_orders
        WHERE business_id = ${businessId}
        ORDER BY updated_at DESC
      `;

      if (orderRows.length > 0) {
        const itemRows = await prisma.$queryRaw<DbItemRow[]>`
          SELECT order_external_id, item_index, payload
          FROM bakery_order_items
          WHERE business_id = ${businessId}
          ORDER BY order_external_id ASC, item_index ASC
        `;

        const addressRows = await prisma.$queryRaw<DbAddressRow[]>`
          SELECT order_external_id, address_index, payload
          FROM bakery_order_addresses
          WHERE business_id = ${businessId}
          ORDER BY order_external_id ASC, address_index ASC
        `;

        const itemsMap = new Map<string, JsonRecord[]>();
        for (const row of itemRows) {
          const current = itemsMap.get(row.order_external_id) ?? [];
          const payload = asRecord(parseJsonField(row.payload));
          if (payload) current.push(payload);
          itemsMap.set(row.order_external_id, current);
        }

        const addressesMap = new Map<string, JsonRecord[]>();
        for (const row of addressRows) {
          const current = addressesMap.get(row.order_external_id) ?? [];
          const payload = asRecord(parseJsonField(row.payload));
          if (payload) current.push(payload);
          addressesMap.set(row.order_external_id, current);
        }

        const orders = orderRows.map((row) => ({
          id: row.external_id,
          bookingCode: row.booking_code ?? "",
          resi: row.resi ?? "",
          customerName: row.customer_name ?? "",
          customerPhone: row.customer_phone ?? "",
          customerAddress: row.customer_address ?? "",
          deliveryDate: row.delivery_date ?? "",
          deliverySlot: row.delivery_slot ?? "",
          notes: row.notes ?? "",
          basePrice: asNumber(row.base_price),
          addOnTotal: asNumber(row.add_on_total),
          deliveryFee: asNumber(row.delivery_fee),
          manualAdjustment: asNumber(row.manual_adjustment),
          dpPaidAmount: asNumber(row.dp_paid_amount),
          finalPaidAmount: asNumber(row.final_paid_amount),
          totalPaidAmount: asNumber(row.total_paid_amount),
          downPaymentAmount: asNumber(row.down_payment_amount),
          remainingBalance: asNumber(row.remaining_balance),
          product: row.product ?? "",
          totalPrice: asNumber(row.total_price),
          paymentStatus: row.payment_status ?? "Pending",
          orderStatus: row.order_status ?? "Inquiry",
          shippingQuote: parseJsonField(row.shipping_quote),
          shipment: parseJsonField(row.shipment),
          simulations: parseJsonField(row.simulations),
          whatsAppParsedData: parseJsonField(row.whatsapp_parsed_data),
          statusHistory: parseJsonField(row.status_history) ?? [],
          automationLogs: parseJsonField(row.automation_logs) ?? [],
          paymentTransactions: parseJsonField(row.payment_transactions) ?? [],
          items: itemsMap.get(row.external_id) ?? [],
          deliveryAddresses: addressesMap.get(row.external_id) ?? [],
        }));

        return NextResponse.json({
          success: true,
          data: {
            source: "rows",
            orders,
            updatedAt: orderRows[0]?.updated_at?.toISOString() ?? null,
          },
        });
      }
    } catch (rowError) {
      rowReadFailed = true;
      const detail = extractErrorDetails(rowError);
      console.warn(
        "[api/bookings/orders] rows read failed, fallback to snapshot",
        {
          businessId,
          ...detail,
        },
      );
    }

    const snapshot = await readOrdersSnapshot(businessId);

    return NextResponse.json({
      success: true,
      data: {
        source: rowReadFailed ? "snapshot-fallback" : "snapshot",
        id: snapshot?.id ?? null,
        orders: parseOrdersContent(snapshot?.content),
        updatedAt: snapshot?.updatedAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to load bakery orders." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const requestStartedAt = Date.now();

  try {
    const { businessId, userId } = await requireAuth();
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return NextResponse.json(
        {
          error:
            "Invalid content type. Use 'application/json' for bookings sync payload.",
        },
        { status: 415 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      orders?: unknown;
    };
    if (!Array.isArray(body.orders)) {
      return NextResponse.json(
        { error: "Invalid payload. 'orders' must be an array." },
        { status: 400 },
      );
    }

    const normalizedOrders = body.orders
      .map((entry, index) => normalizeOrder(entry, index))
      .filter((entry): entry is NormalizedOrder => Boolean(entry));

    if (normalizedOrders.length !== body.orders.length) {
      return NextResponse.json(
        {
          error: "Invalid payload. One or more orders could not be normalized.",
        },
        { status: 400 },
      );
    }

    const parsedOrders = z
      .array(normalizedOrderSchema)
      .safeParse(normalizedOrders);
    if (!parsedOrders.success) {
      const details = formatValidationIssues(parsedOrders.error);
      console.warn("[api/bookings/orders] validation failed", {
        businessId,
        userId,
        detailCount: details.length,
        details,
      });
      return NextResponse.json(
        {
          error: "Validation error for bookings payload.",
          details,
        },
        { status: 400 },
      );
    }

    const orders = parsedOrders.data;

    console.info("[api/bookings/orders] request received", {
      businessId,
      userId,
      orderCount: orders.length,
      ids: orders.map((order) => order.id),
    });

    const durationMs = Date.now() - requestStartedAt;
    try {
      await ensureBakeryTables();

      const transactionSummary = await prisma.$transaction(
        async (tx) => {
          let deletedOrderCount = 0;
          let upsertedOrderCount = 0;
          let insertedItemCount = 0;
          let insertedAddressCount = 0;

          const existingRows = await tx.$queryRaw<{ external_id: string; delivery_date: string | null; token_used: number; order_status: string | null }[]>`
          SELECT external_id, delivery_date, token_used, order_status
          FROM bakery_orders
          WHERE business_id = ${businessId}
        `;

          const existingIds = new Set(
            existingRows.map((row) => row.external_id),
          );
          const existingOrderMap = new Map(
            existingRows.map((row) => [row.external_id, row]),
          );
          const incomingIds = new Set(orders.map((order) => order.id));

          // ── Release tokens for deleted orders ──
          for (const externalId of existingIds) {
            if (incomingIds.has(externalId)) continue;
            const oldOrder = existingOrderMap.get(externalId);
            if (oldOrder && oldOrder.delivery_date && oldOrder.token_used > 0) {
              await releaseToken(
                businessId,
                oldOrder.delivery_date,
                oldOrder.token_used,
                tx,
              );
            }
            await tx.$executeRaw`
            DELETE FROM bakery_order_items
            WHERE business_id = ${businessId} AND order_external_id = ${externalId}
          `;
            await tx.$executeRaw`
            DELETE FROM bakery_order_addresses
            WHERE business_id = ${businessId} AND order_external_id = ${externalId}
          `;
            await tx.$executeRaw`
            DELETE FROM bakery_orders
            WHERE business_id = ${businessId} AND external_id = ${externalId}
          `;
            deletedOrderCount += 1;
          }

          for (const order of orders) {
            upsertedOrderCount += 1;

            // ── Token capacity: calculate tokens for this order ──
            const orderItems = (order.items || []).map((item) => ({
              category: typeof item.category === "string" ? item.category : "",
              subcategory: typeof item.subcategory === "string" ? item.subcategory : undefined,
              productName: typeof item.productName === "string" ? item.productName : undefined,
              size: typeof item.size === "string" ? item.size : undefined,
              quantity: typeof item.quantity === "number" ? item.quantity : undefined,
            }));
            const tokenForOrder = summarizeProductionTokensByItems(orderItems);

            // Determine difficulty label based on token per item ratio
            let difficulty: string | null = null;
            if (tokenForOrder > 0) {
              const avgToken = orderItems.length > 0 ? tokenForOrder / orderItems.length : tokenForOrder;
              if (avgToken >= 3) difficulty = "difficult";
              else if (avgToken >= 2) difficulty = "medium";
              else difficulty = "simple";
            }

            // ── Handle token changes for existing orders ──
            const existingOrder = existingOrderMap.get(order.id);
            const isActiveStatus = !INACTIVE_STATUSES.includes(order.orderStatus || "");
            const wasActive = existingOrder
              ? !INACTIVE_STATUSES.includes(existingOrder.order_status || "")
              : false;

            // Enforce H-1 cutoff policy in backend as final authority.
            if (isActiveStatus && order.deliveryDate) {
              if (isPastDate(order.deliveryDate)) {
                throw new PastDateError(order.deliveryDate);
              }

              const capacity = await getCapacityForDate(
                businessId,
                order.deliveryDate,
                tx,
              );
              const status = getCalendarStatus({
                usedToken: capacity.usedToken,
                maxToken: capacity.maxToken,
                date: order.deliveryDate,
              });

              if (status === "CUTOFF") {
                throw new CapacityCutoffError(order.deliveryDate);
              }
            }

            if (existingOrder && existingOrder.delivery_date && existingOrder.token_used > 0 && wasActive) {
              // Release old tokens if date changed, status changed to inactive, or token amount changed
              const dateChanged = existingOrder.delivery_date !== (order.deliveryDate || null);
              const becameInactive = !isActiveStatus;
              const tokenChanged = existingOrder.token_used !== tokenForOrder;

              if (dateChanged || becameInactive || tokenChanged) {
                await releaseToken(
                  businessId,
                  existingOrder.delivery_date,
                  existingOrder.token_used,
                  tx,
                );
              }
            }

            // Consume tokens for active orders with a delivery date
            let finalTokenUsed = 0;
            if (isActiveStatus && order.deliveryDate && tokenForOrder > 0) {
              const shouldConsume = !existingOrder
                || !wasActive
                || existingOrder.delivery_date !== (order.deliveryDate || null)
                || existingOrder.token_used !== tokenForOrder;

              if (shouldConsume) {
                const consumeResult = await consumeToken(
                  businessId,
                  order.deliveryDate,
                  tokenForOrder,
                  tx,
                );
                if (!consumeResult.success) {
                  // Capacity full — reject this entire sync
                  throw new CapacityFullError(
                    `Production capacity full for ${order.deliveryDate}. ` +
                    `Used: ${consumeResult.usedToken}/${consumeResult.maxToken}, ` +
                    `Needed: ${tokenForOrder} for order ${order.id}.`,
                    order.deliveryDate,
                    consumeResult.usedToken,
                    consumeResult.maxToken,
                    tokenForOrder,
                  );
                }
                finalTokenUsed = tokenForOrder;
              } else {
                // No change needed, keep existing token
                finalTokenUsed = existingOrder?.token_used ?? 0;
              }
            }

            await tx.$executeRaw`
            INSERT INTO bakery_orders (
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
              base_price,
              add_on_total,
              delivery_fee,
              manual_adjustment,
              dp_paid_amount,
              final_paid_amount,
              total_paid_amount,
              down_payment_amount,
              remaining_balance,
              product,
              total_price,
              payment_status,
              order_status,
              shipping_quote,
              shipment,
              simulations,
              whatsapp_parsed_data,
              status_history,
              automation_logs,
              payment_transactions,
              difficulty,
              token_used,
              updated_at
            ) VALUES (
              ${businessId},
              ${order.id},
              ${order.bookingCode || null},
              ${order.resi || null},
              ${order.customerName || null},
              ${order.customerPhone || null},
              ${order.customerAddress || null},
              ${order.deliveryDate || null},
              ${order.deliverySlot || null},
              ${order.notes || null},
              ${order.basePrice},
              ${order.addOnTotal},
              ${order.deliveryFee},
              ${order.manualAdjustment},
              ${order.dpPaidAmount},
              ${order.finalPaidAmount},
              ${order.totalPaidAmount},
              ${order.downPaymentAmount},
              ${order.remainingBalance},
              ${order.product || null},
              ${order.totalPrice},
              ${order.paymentStatus || null},
              ${order.orderStatus || null},
              ${JSON.stringify(order.shippingQuote ?? null)}::jsonb,
              ${JSON.stringify(order.shipment ?? null)}::jsonb,
              ${JSON.stringify(order.simulations ?? null)}::jsonb,
              ${JSON.stringify(order.whatsAppParsedData ?? null)}::jsonb,
              ${JSON.stringify(order.statusHistory ?? [])}::jsonb,
              ${JSON.stringify(order.automationLogs ?? [])}::jsonb,
              ${JSON.stringify(order.paymentTransactions ?? [])}::jsonb,
              ${difficulty},
              ${finalTokenUsed},
              NOW()
            )
            ON CONFLICT (business_id, external_id)
            DO UPDATE SET
              booking_code = EXCLUDED.booking_code,
              resi = EXCLUDED.resi,
              customer_name = EXCLUDED.customer_name,
              customer_phone = EXCLUDED.customer_phone,
              customer_address = EXCLUDED.customer_address,
              delivery_date = EXCLUDED.delivery_date,
              delivery_slot = EXCLUDED.delivery_slot,
              notes = EXCLUDED.notes,
              base_price = EXCLUDED.base_price,
              add_on_total = EXCLUDED.add_on_total,
              delivery_fee = EXCLUDED.delivery_fee,
              manual_adjustment = EXCLUDED.manual_adjustment,
              dp_paid_amount = EXCLUDED.dp_paid_amount,
              final_paid_amount = EXCLUDED.final_paid_amount,
              total_paid_amount = EXCLUDED.total_paid_amount,
              down_payment_amount = EXCLUDED.down_payment_amount,
              remaining_balance = EXCLUDED.remaining_balance,
              product = EXCLUDED.product,
              total_price = EXCLUDED.total_price,
              payment_status = EXCLUDED.payment_status,
              order_status = EXCLUDED.order_status,
              shipping_quote = EXCLUDED.shipping_quote,
              shipment = EXCLUDED.shipment,
              simulations = EXCLUDED.simulations,
              whatsapp_parsed_data = EXCLUDED.whatsapp_parsed_data,
              status_history = EXCLUDED.status_history,
              automation_logs = EXCLUDED.automation_logs,
              payment_transactions = EXCLUDED.payment_transactions,
              difficulty = EXCLUDED.difficulty,
              token_used = EXCLUDED.token_used,
              updated_at = NOW()
          `;

            await tx.$executeRaw`
            DELETE FROM bakery_order_items
            WHERE business_id = ${businessId} AND order_external_id = ${order.id}
          `;

            for (let index = 0; index < order.items.length; index += 1) {
              const item = order.items[index];
              await tx.$executeRaw`
              INSERT INTO bakery_order_items (
                business_id,
                order_external_id,
                item_index,
                payload
              ) VALUES (
                ${businessId},
                ${order.id},
                ${index},
                ${JSON.stringify(item)}::jsonb
              )
            `;
              insertedItemCount += 1;
            }

            await tx.$executeRaw`
            DELETE FROM bakery_order_addresses
            WHERE business_id = ${businessId} AND order_external_id = ${order.id}
          `;

            for (
              let index = 0;
              index < order.deliveryAddresses.length;
              index += 1
            ) {
              const address = order.deliveryAddresses[index];
              await tx.$executeRaw`
              INSERT INTO bakery_order_addresses (
                business_id,
                order_external_id,
                address_index,
                payload
              ) VALUES (
                ${businessId},
                ${order.id},
                ${index},
                ${JSON.stringify(address)}::jsonb
              )
            `;
              insertedAddressCount += 1;
            }
          }

          // Hard reconcile token ledger to guarantee DB consistency.
          await tx.$executeRaw`
            WITH active_tokens AS (
              SELECT
                delivery_date::date AS delivery_date,
                GREATEST(0, COALESCE(SUM(token_used), 0))::integer AS used_token
              FROM bakery_orders
              WHERE business_id = ${businessId}
                AND delivery_date IS NOT NULL
                AND order_status NOT IN (${INACTIVE_STATUSES[0]}, ${INACTIVE_STATUSES[1]}, ${INACTIVE_STATUSES[2]})
              GROUP BY delivery_date::date
            )
            INSERT INTO production_capacity (
              business_id,
              date,
              max_token,
              used_token,
              created_at,
              updated_at
            )
            SELECT
              ${businessId},
              active_tokens.delivery_date,
              ${DEFAULT_MAX_TOKEN},
              LEAST(${DEFAULT_MAX_TOKEN}, active_tokens.used_token),
              NOW(),
              NOW()
            FROM active_tokens
            ON CONFLICT (business_id, date)
            DO UPDATE SET
              used_token = LEAST(
                production_capacity.max_token,
                GREATEST(0, EXCLUDED.used_token)
              ),
              updated_at = NOW()
          `;

          await tx.$executeRaw`
            UPDATE production_capacity pc
            SET used_token = 0,
                updated_at = NOW()
            WHERE pc.business_id = ${businessId}
              AND NOT EXISTS (
                SELECT 1
                FROM bakery_orders bo
                WHERE bo.business_id = pc.business_id
                  AND bo.delivery_date IS NOT NULL
                  AND bo.delivery_date::date = pc.date
                  AND bo.order_status NOT IN (${INACTIVE_STATUSES[0]}, ${INACTIVE_STATUSES[1]}, ${INACTIVE_STATUSES[2]})
                  AND bo.token_used > 0
              )
          `;

          await upsertOrdersSnapshot(tx, {
            businessId,
            userId,
            orders,
            source: "rows",
          });

          return {
            deletedOrderCount,
            upsertedOrderCount,
            insertedItemCount,
            insertedAddressCount,
          };
        },
        {
          maxWait: 10_000,
          timeout: 30_000,
        },
      );

      console.info("[api/bookings/orders] database upsert complete", {
        businessId,
        userId,
        durationMs,
        ...transactionSummary,
      });

      return NextResponse.json({
        success: true,
        data: {
          mode: "rows",
          itemCount: orders.length,
          durationMs,
          ...transactionSummary,
        },
      });
    } catch (rowError) {
      // ── Handle capacity-full errors with 409 ──
      if (rowError instanceof CapacityFullError) {
        return NextResponse.json(
          {
            error: "Production capacity full",
            details: rowError.message,
            capacity: {
              date: rowError.date,
              usedToken: rowError.usedToken,
              maxToken: rowError.maxToken,
              tokenNeeded: rowError.tokenNeeded,
            },
          },
          { status: 409 },
        );
      }

      if (rowError instanceof CapacityCutoffError) {
        return NextResponse.json(
          {
            error: rowError.message,
            details: `Tanggal ${rowError.date} termasuk cutoff H-1 setelah jam 10 pagi.`,
          },
          { status: 409 },
        );
      }

      if (rowError instanceof PastDateError) {
        return NextResponse.json(
          {
            error: "Tanggal sudah terlewat",
            details: `Tanggal ${rowError.date} berada di masa lalu.`,
          },
          { status: 400 },
        );
      }

      const detail = extractErrorDetails(rowError);
      console.warn(
        "[api/bookings/orders] rows write failed, fallback to snapshot",
        {
          businessId,
          userId,
          durationMs,
          ...detail,
        },
      );
    }

    await upsertOrdersSnapshot(prisma, {
      businessId,
      userId,
      orders,
      source: "snapshot-fallback",
    });

    return NextResponse.json({
      success: true,
      data: {
        mode: "snapshot-fallback",
        itemCount: orders.length,
        durationMs,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof CapacityFullError) {
      return NextResponse.json(
        {
          error: "Production capacity full",
          details: error.message,
          capacity: {
            date: error.date,
            usedToken: error.usedToken,
            maxToken: error.maxToken,
            tokenNeeded: error.tokenNeeded,
          },
        },
        { status: 409 },
      );
    }

    if (error instanceof CapacityCutoffError) {
      return NextResponse.json(
        {
          error: error.message,
          details: `Tanggal ${error.date} termasuk cutoff H-1 setelah jam 10 pagi.`,
        },
        { status: 409 },
      );
    }

    if (error instanceof PastDateError) {
      return NextResponse.json(
        {
          error: "Tanggal sudah terlewat",
          details: `Tanggal ${error.date} berada di masa lalu.`,
        },
        { status: 400 },
      );
    }

    const detail = extractErrorDetails(error);
    console.error("[api/bookings/orders] failed", {
      ...detail,
    });

    return NextResponse.json(
      {
        error: "Failed to persist bakery orders.",
        details:
          detail.message ||
          "Unexpected server error while writing to database.",
      },
      { status: 500 },
    );
  }
}
