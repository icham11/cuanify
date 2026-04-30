import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { AuthError, ForbiddenError, requireAuth } from "@/lib/auth/session";
import {
  evaluateProductionTokenCapacity,
  type BookingItemForOperations,
  summarizeProductionTokensByItems,
} from "@/lib/bookings/operations";
import { z } from "zod";
import {
  ensureCapacityTable,
  consumeToken,
  getCapacityForDate,
  releaseToken,
  DEFAULT_MAX_TOKEN,
  calculateOrderTokenFromItems,
} from "@/lib/bookings/token-capacity-service";
import { BAKERY_STAFF_DAILY_TOKEN_LIMIT } from "@/lib/bookings/config";
import {
  getCalendarStatus,
  isPastDate,
} from "@/lib/calendar/getCalendarStatus";
import { normalizeDateInput } from "@/lib/helpers/date-normalization";
import {
  sendOrderToWhatsApp,
  type SendOrderToWhatsAppInput,
} from "@/lib/whatsapp/sendOrderToWhatsApp";
import { syncBakeryOrderInventory } from "@/lib/bookings/inventory-sync";
import {
  detailFieldDefinitions,
  type WhatsAppOrderType,
} from "@/lib/bookings/whatsapp-parser";
import { getBakeryBusinessSettings } from "@/lib/bakery/settings";
import { calculateShippingInsuranceFee } from "@/lib/bookings/shipping-insurance";
import {
  distributeProductionTokens,
  normalizeProductionStageAssignments,
  type ProductionStageAssignment,
  type ProductionStage,
} from "@/lib/bookings/production-stages";

import { JsonRecord, NormalizedOrder, DbOrderRow, DbItemRow, DbAddressRow, DbProductionStageRow, ExistingAssignmentState, StaffValidationOrder, SnapshotSource, SnapshotStore, normalizedOrderSchema, ParsedOrderInput, ParsedOrder, formatValidationIssues, parseOrdersContent, normalizeOrderProductionStages, asRecord, asString, asNumber, asPositiveIntOrNull, normalizeSalesChannel, normalizeIncomingSalesChannel, resolveInsuranceProvider, computeInsuranceFee, deterministicUuid, orderTaskUuid, productionTaskUuid, staffUuid, buildStaffIdByUuid, normalizeProductionStages, mergeStaffClaimableProductionStages, getOrderStaffTokenAssignmentsForLimit, toIsoOrNull, asArrayOfRecords, asStringArray, parseJsonField, PRIORITY_IMAGE_VALUE_KEYS, PRIORITY_IMAGE_LIST_KEYS, IMAGE_VALUE_KEYS, IMAGE_LIST_KEYS, IMAGE_COLLECTION_KEYS, IMAGE_LABEL_KEYS, IMAGE_ORDER_KEYS, DESIGN_REQUEST_KEYS, parseImageOrderIndex, pushReferenceImage, collectReferenceImagesFromValue, dedupeReferenceImages, extractNotificationReferenceImages, collectProductTags, inferTemplateKeyFromSignals, extractRequestedImageLabels, normalizeParsedOrderTypeKey, formatTemplateDate, formatTemplateTime, getParsedCommonFields, getParsedDetailsForTemplate, mapProductTypeToDetailOrderType, escapeRegex, getParsedDetailsForItem, buildCaptionItemDetailLines, formatCaptionAddOns, resolveCaptionItemSubtotal, buildCaptionItems, resolveShippingMethodLabel, resolvePreferredBookingCode, buildTemplateFields, buildTemplateSlotNotes, normalizeWhatsAppCaptionValue, buildWhatsAppCustomerNotes, buildWhatsAppDesignNotes, toWhatsAppPayload, extractErrorDetails, toTokenOpsOrders, validateDailyTokenCapacity, calculateOrderTokenForLimit, buildStaffDailyTokenMap, validateAssignmentTransitionRules, validateProjectedStaffDailyTokenLimit, getSnapshotSource, normalizeOrder, readOrdersSnapshot, upsertOrdersSnapshot } from '@/lib/bookings/order-api-helpers';

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

class CapacityBlockedDateError extends Error {
  public readonly date: string;

  constructor(date: string) {
    super("Tanggal libur admin, tidak menerima pesanan");
    this.name = "CapacityBlockedDateError";
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

const INACTIVE_STATUSES = ["Cancelled", "Completed", "Delivery", "Delivered"];
const STAFF_DAILY_TOKEN_LIMIT = BAKERY_STAFF_DAILY_TOKEN_LIMIT;
const STAFF_DAILY_TOKEN_LIMIT_MESSAGE =
  "Token harian staff melebihi limit assignment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SNAPSHOT_SOURCE_TYPE = "bakery_orders_snapshot";


let tablesEnsured = false;
async function ensureBakeryTables() {
  if (tablesEnsured) return;
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
      insurance_fee NUMERIC(14,2) NOT NULL DEFAULT 0,
      sales_channel TEXT NOT NULL DEFAULT 'direct',
      deleted_at TIMESTAMPTZ,
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

  await prisma.$executeRawUnsafe(`
    ALTER TABLE bakery_orders
    ADD COLUMN IF NOT EXISTS assigned_staff_user_id INTEGER;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE bakery_orders
    ADD COLUMN IF NOT EXISTS assigned_staff_name TEXT;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE bakery_orders
    ADD COLUMN IF NOT EXISTS production_assigned_at TIMESTAMPTZ;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE bakery_orders
    ADD COLUMN IF NOT EXISTS insurance_fee NUMERIC(14,2) NOT NULL DEFAULT 0;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE bakery_orders
    ADD COLUMN IF NOT EXISTS sales_channel TEXT NOT NULL DEFAULT 'direct';
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE bakery_orders
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE bakery_orders
    SET sales_channel = 'direct'
    WHERE sales_channel IS NULL
      OR sales_channel NOT IN ('direct', 'tokopedia', 'shopee');
  `);

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'bakery_orders_sales_channel_check'
      ) THEN
        ALTER TABLE bakery_orders
          ADD CONSTRAINT bakery_orders_sales_channel_check
          CHECK (sales_channel IN ('direct', 'tokopedia', 'shopee'));
      END IF;
    END
    $$;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE bakery_orders
    ADD COLUMN IF NOT EXISTS order_uuid UUID;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS production_tasks (
      id UUID PRIMARY KEY,
      order_id UUID NOT NULL,
      stage TEXT NOT NULL CHECK (stage IN ('listing', 'filling', 'finishing')),
      staff_id UUID,
      token_amount DECIMAL(10,2) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (order_id, stage)
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_production_tasks_order_id
    ON production_tasks (order_id);
  `);

  await prisma.$executeRawUnsafe(`
    DELETE FROM production_tasks a
    USING production_tasks b
    WHERE a.order_id = b.order_id
      AND a.stage = b.stage
      AND a.ctid < b.ctid;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'production_tasks_order_stage_unique'
      ) THEN
        ALTER TABLE production_tasks
        ADD CONSTRAINT production_tasks_order_stage_unique
        UNIQUE (order_id, stage);
      END IF;
    END $$;
  `);

  // ── Ensure production_capacity table exists ──
  await ensureCapacityTable();

  tablesEnsured = true;
}

export async function GET() {
  try {
    const { businessId } = await requireAuth();

    let rowReadFailed = false;
    try {
      await ensureBakeryTables();

      const orderRows = await prisma.$queryRaw<DbOrderRow[]>`
        SELECT
          order_uuid,
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
          insurance_fee,
          sales_channel,
          payment_status,
          order_status,
          assigned_staff_user_id,
          assigned_staff_name,
          production_assigned_at,
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

        const staffMembers = await prisma.businessMember.findMany({
          where: { businessId },
          select: { userId: true },
        });
        const staffIdByUuid = buildStaffIdByUuid(staffMembers.map((member) => member.userId));
        const orderExternalByUuid = new Map(
          orderRows.map((row) => [
            row.order_uuid ?? orderTaskUuid(businessId, row.external_id),
            row.external_id,
          ]),
        );
        const orderUuids = [...orderExternalByUuid.keys()];
        const stageRows =
          orderUuids.length > 0
            ? await prisma.$queryRaw<DbProductionStageRow[]>`
                SELECT order_id::text AS order_id, stage, staff_id::text AS staff_id, token_amount
                FROM production_tasks
                WHERE order_id::text IN (${Prisma.join(orderUuids)})
                ORDER BY order_id ASC, stage ASC
              `
            : [];

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

        const stagesMap = new Map<string, ProductionStageAssignment[]>();
        for (const row of stageRows) {
          const externalId = orderExternalByUuid.get(row.order_id);
          if (!externalId) continue;
          const current = stagesMap.get(externalId) ?? [];
          current.push({
            stage: row.stage,
            staffId: row.staff_id ? staffIdByUuid.get(row.staff_id) ?? null : null,
            tokenAmount: asNumber(row.token_amount),
            percentage: row.stage === "finishing" ? 50 : 25,
          });
          stagesMap.set(externalId, current);
        }

        const orders = orderRows.map((row) =>
          normalizeOrderProductionStages({
          id: row.external_id,
          bookingCode: row.booking_code ?? "",
          resi: row.resi ?? "",
          customerName: row.customer_name ?? "",
          customerPhone: row.customer_phone ?? "",
          customerAddress: row.customer_address ?? "",
          deliveryDate:
            normalizeDateInput(row.delivery_date ?? "") ??
            row.delivery_date ??
            "",
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
          insuranceFee: asNumber(row.insurance_fee),
          sales_channel: normalizeSalesChannel(row.sales_channel),
          paymentStatus: row.payment_status ?? "Pending",
          orderStatus: row.order_status ?? "Inquiry",
          assignedStaffUserId: asPositiveIntOrNull(row.assigned_staff_user_id),
          assignedStaffName: row.assigned_staff_name ?? "",
          productionAssignedAt: toIsoOrNull(row.production_assigned_at),
          shippingQuote: parseJsonField(row.shipping_quote),
          shipment: parseJsonField(row.shipment),
          simulations: parseJsonField(row.simulations),
          whatsAppParsedData: parseJsonField(row.whatsapp_parsed_data),
          statusHistory: parseJsonField(row.status_history) ?? [],
          automationLogs: parseJsonField(row.automation_logs) ?? [],
          paymentTransactions: parseJsonField(row.payment_transactions) ?? [],
          productionStages: stagesMap.get(row.external_id) ?? [],
          items: itemsMap.get(row.external_id) ?? [],
          deliveryAddresses: addressesMap.get(row.external_id) ?? [],
        }));

        const snapshot = await readOrdersSnapshot(businessId);
        const snapshotSource = getSnapshotSource(snapshot?.metadata);
        const rowUpdatedAt = orderRows[0]?.updated_at?.toISOString() ?? null;
        const snapshotUpdatedAt = snapshot?.updatedAt?.toISOString() ?? null;

        if (snapshotSource === "snapshot-fallback") {
          return NextResponse.json({
            success: true,
            data: {
              source: "snapshot-fallback",
              id: snapshot?.id ?? null,
              orders: parseOrdersContent(snapshot?.content).map(
                (entry) => normalizeOrderProductionStages(entry as ParsedOrder),
              ),
              updatedAt: snapshotUpdatedAt,
            },
          });
        }

        if (
          snapshotUpdatedAt &&
          rowUpdatedAt &&
          new Date(snapshotUpdatedAt).getTime() > new Date(rowUpdatedAt).getTime()
        ) {
          return NextResponse.json({
            success: true,
            data: {
              source: "snapshot-newer-than-rows",
              id: snapshot?.id ?? null,
              orders: parseOrdersContent(snapshot?.content).map(
                (entry) => normalizeOrderProductionStages(entry as ParsedOrder),
              ),
              updatedAt: snapshotUpdatedAt,
            },
          });
        }

        return NextResponse.json({
          success: true,
          data: {
            source: "rows",
            orders,
            updatedAt: rowUpdatedAt,
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
        orders: parseOrdersContent(snapshot?.content).map((entry) =>
          normalizeOrderProductionStages(entry as ParsedOrder),
        ),
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
    const { businessId, userId, role } = await requireAuth();
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
      skipWhatsAppNotification?: unknown;
    };
    if (!Array.isArray(body.orders)) {
      return NextResponse.json(
        { error: "Invalid payload. 'orders' must be an array." },
        { status: 400 },
      );
    }

    const MAX_ORDERS_PER_SYNC = 500;
    if (body.orders.length > MAX_ORDERS_PER_SYNC) {
      return NextResponse.json(
        { error: `Maks ${MAX_ORDERS_PER_SYNC} order per sync.` },
        { status: 400 }
      );
    }
    const skipWhatsAppNotification = body.skipWhatsAppNotification === true;

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

    const dateNormalizationIssues: string[] = [];
    let orders: ParsedOrder[] = parsedOrders.data.map((order) => {
      const withComputedInsurance: ParsedOrder = {
        ...order,
        insuranceFee: computeInsuranceFee({
          shippingQuote: order.shippingQuote,
          shipment: order.shipment,
          totalPrice: order.totalPrice,
        }),
      };

      if (!order.deliveryDate) return withComputedInsurance;

      const normalizedDeliveryDate = normalizeDateInput(order.deliveryDate);
      if (!normalizedDeliveryDate) {
        dateNormalizationIssues.push(
          `order ${order.id}: deliveryDate '${order.deliveryDate}' is invalid. Use YYYY-MM-DD.`,
        );
        return withComputedInsurance;
      }

      if (normalizedDeliveryDate === order.deliveryDate) {
        return withComputedInsurance;
      }

      return {
        ...withComputedInsurance,
        deliveryDate: normalizedDeliveryDate,
      };
    });

    if (dateNormalizationIssues.length > 0) {
      return NextResponse.json(
        {
          error: "Validation error for deliveryDate.",
          details: dateNormalizationIssues,
        },
        { status: 400 },
      );
    }

    const roleName = role as unknown as string;
    const isStaffRequest = roleName === "Staff";
    const bakerySettings = await getBakeryBusinessSettings(businessId);

    const staffMembers = await prisma.businessMember.findMany({
      where: { businessId },
      select: { userId: true },
    });
    const staffIdByUuid = buildStaffIdByUuid(
      staffMembers.map((member) => member.userId),
    );

    await ensureBakeryTables();

    const existingAssignmentRows = await prisma.$queryRaw<
      {
        external_id: string;
        order_status: string | null;
        assigned_staff_user_id: number | null;
      }[]
    >`
      SELECT external_id, order_status, assigned_staff_user_id
      FROM bakery_orders
      WHERE business_id = ${businessId}
    `;

    // Preserve the original intent from the request for Staff claim merging
    const intentOrdersById = new Map(orders.map((o) => [o.id, o]));

    const staffUpdatableStatuses = new Set([
      "In Production",
      "Ready",
      "Delivery",
      "Delivered",
      "Completed",
    ]);

    if (isStaffRequest) {
      const existingRows = await prisma.$queryRaw<DbOrderRow[]>`
        SELECT
          order_uuid,
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
          insurance_fee,
          sales_channel,
          payment_status,
          order_status,
          assigned_staff_user_id,
          assigned_staff_name,
          production_assigned_at,
          shipping_quote,
          shipment,
          simulations,
          whatsapp_parsed_data,
          status_history,
          automation_logs,
          payment_transactions,
          updated_at,
          deleted_at
        FROM bakery_orders
        WHERE business_id = ${businessId}
          AND deleted_at IS NULL
        ORDER BY updated_at DESC
      `;

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

      const orderExternalByUuid = new Map(
        existingRows.map((row) => [
          row.order_uuid ?? orderTaskUuid(businessId, row.external_id),
          row.external_id,
        ]),
      );
      const orderUuids = [...orderExternalByUuid.keys()];
      const stageRows =
        orderUuids.length > 0
          ? await prisma.$queryRaw<DbProductionStageRow[]>`
              SELECT order_id::text AS order_id, stage, staff_id::text AS staff_id, token_amount
              FROM production_tasks
              WHERE order_id::text IN (${Prisma.join(orderUuids)})
              ORDER BY order_id ASC, stage ASC
            `
          : [];

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

      const stagesMap = new Map<string, ProductionStageAssignment[]>();
      for (const row of stageRows) {
        const externalId = orderExternalByUuid.get(row.order_id);
        if (!externalId) continue;
        const current = stagesMap.get(externalId) ?? [];
        current.push({
          stage: row.stage,
          staffId: row.staff_id ? staffIdByUuid.get(row.staff_id) ?? null : null,
          tokenAmount: asNumber(row.token_amount),
          percentage: row.stage === "finishing" ? 50 : 25,
        });
        stagesMap.set(externalId, current);
      }

      const existingOrders: ParsedOrder[] = existingRows.map((row) =>
        normalizeOrderProductionStages({
        id: row.external_id,
        bookingCode: row.booking_code ?? "",
        resi: row.resi ?? "",
        customerName: row.customer_name ?? "",
        customerPhone: row.customer_phone ?? "",
        customerAddress: row.customer_address ?? "",
        deliveryDate:
          normalizeDateInput(row.delivery_date ?? "") ??
          row.delivery_date ??
          "",
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
        insuranceFee: asNumber(row.insurance_fee),
        sales_channel: normalizeSalesChannel(row.sales_channel),
        paymentStatus: row.payment_status ?? "Pending",
        orderStatus: row.order_status ?? "Inquiry",
        assignedStaffUserId: asPositiveIntOrNull(row.assigned_staff_user_id),
        assignedStaffName: row.assigned_staff_name ?? "",
        productionAssignedAt: toIsoOrNull(row.production_assigned_at),
        shippingQuote: parseJsonField(row.shipping_quote),
        shipment: parseJsonField(row.shipment),
        simulations: parseJsonField(row.simulations),
        whatsAppParsedData: parseJsonField(row.whatsapp_parsed_data),
        statusHistory: asArrayOfRecords(parseJsonField(row.status_history)),
        automationLogs: asArrayOfRecords(parseJsonField(row.automation_logs)),
        paymentTransactions: asArrayOfRecords(
          parseJsonField(row.payment_transactions),
        ),
        productionStages: stagesMap.get(row.external_id) ?? [],
        items: itemsMap.get(row.external_id) ?? [],
        deliveryAddresses: addressesMap.get(row.external_id) ?? [],
        deletedAt: toIsoOrNull(row.deleted_at),
      }),
      );

      const existingById = new Map(
        existingOrders.map((order) => [order.id, order]),
      );
      const incomingById = new Map(orders.map((order) => [order.id, order]));

      const unauthorizedCreate = orders
        .map((order) => order.id)
        .filter((id) => !existingById.has(id));
      if (unauthorizedCreate.length > 0) {
        return NextResponse.json(
          {
            error:
              "Role Staff tidak diizinkan membuat booking/order baru melalui endpoint ini.",
            details: unauthorizedCreate.map((id) => `create denied: ${id}`),
          },
          { status: 403 },
        );
      }

      orders = existingOrders.map((existingOrder) => {
        const incomingOrder = incomingById.get(existingOrder.id);
        if (!incomingOrder) return existingOrder;

        const currentAssignee = existingOrder.assignedStaffUserId;
        const statusChanged =
          incomingOrder.orderStatus !== existingOrder.orderStatus;
        const { mergedStages, claimedByUser } =
          mergeStaffClaimableProductionStages({
            existingStages: existingOrder.productionStages,
            incomingStages: incomingOrder.productionStages,
            userId,
          });
        const viewerOwnsAnyStage = mergedStages.some(
          (stage) => stage.staffId === userId,
        );
        const nextAssignee = incomingOrder.assignedStaffUserId;

        const sameAssignee = currentAssignee === nextAssignee;
        const staffClaimingUnassignedOwnOrder =
          currentAssignee === null && nextAssignee === userId;

        // Staff payload can be stale for unrelated orders; keep server truth
        // and only apply changes that are explicitly allowed.
        if (!sameAssignee && !staffClaimingUnassignedOwnOrder) {
          return existingOrder;
        }

        if (statusChanged) {
          if (!nextAssignee && !viewerOwnsAnyStage) {
            return existingOrder;
          }
          if (!staffUpdatableStatuses.has(incomingOrder.orderStatus)) {
            return existingOrder;
          }
          if (nextAssignee && nextAssignee !== userId && !viewerOwnsAnyStage) {
            return existingOrder;
          }
        }

        let nextAssignedName = existingOrder.assignedStaffName;
        if (nextAssignee === null) {
          nextAssignedName = "";
        } else if (nextAssignee === userId) {
          nextAssignedName =
            incomingOrder.assignedStaffName.trim() ||
            existingOrder.assignedStaffName ||
            `Staff #${userId}`;
        }

        let nextAssignedAt = existingOrder.productionAssignedAt;
        if (nextAssignee === null) {
          nextAssignedAt = null;
        } else if (nextAssignee === userId && currentAssignee === null) {
          nextAssignedAt =
            incomingOrder.productionAssignedAt || new Date().toISOString();
        } else if (nextAssignee === userId) {
          nextAssignedAt =
            incomingOrder.productionAssignedAt ||
            existingOrder.productionAssignedAt ||
            new Date().toISOString();
        } else if (claimedByUser && !existingOrder.productionAssignedAt) {
          nextAssignedAt = new Date().toISOString();
        }

        return {
          ...existingOrder,
          orderStatus: statusChanged
            ? incomingOrder.orderStatus
            : existingOrder.orderStatus,
          assignedStaffUserId: nextAssignee,
          assignedStaffName: nextAssignedName,
          productionAssignedAt: nextAssignedAt,
          productionStages: mergedStages,
        };
      });
    } else {
      validateAssignmentTransitionRules({
        orders,
        existingAssignments: existingAssignmentRows,
        roleName,
        userId,
      });
    }

    orders = orders.map((order) =>
      normalizeOrderProductionStages({
        ...order,
        insuranceFee: computeInsuranceFee({
          shippingQuote: order.shippingQuote,
          shipment: order.shipment,
          totalPrice: order.totalPrice,
        }),
      }),
    );

    validateProjectedStaffDailyTokenLimit({
      orders,
      existingAssignments: existingAssignmentRows,
      limit: bakerySettings.staffDailyTokenLimit,
    });

    const tokenValidation = validateDailyTokenCapacity(orders);
    if (!tokenValidation.isValid) {
      return NextResponse.json(
        {
          error:
            "Payload ditolak karena melebihi kapasitas token produksi harian pada satu atau lebih tanggal.",
          details: tokenValidation.overflows.map((entry) => {
            return `Tanggal ${entry.deliveryDate}: ${entry.used}/${entry.allowed} (overflow ${entry.overflow})`;
          }),
        },
        { status: 409 },
      );
    }

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
          const deletedOrderCount = 0;
          let upsertedOrderCount = 0;
          let insertedItemCount = 0;
          let insertedAddressCount = 0;
          const inventoryWarnings = new Set<string>();
          const createdOrdersForWhatsApp: SendOrderToWhatsAppInput[] = [];

          const existingRows = await tx.$queryRaw<
            {
              external_id: string;
              delivery_date: string | null;
              token_used: number;
              order_status: string | null;
            }[]
          >`
          SELECT external_id, delivery_date, token_used, order_status
          FROM bakery_orders
          WHERE business_id = ${businessId}
            AND deleted_at IS NULL
        `;

          const existingOrderMap = new Map(
            existingRows.map((row) => [row.external_id, row]),
          );

          // Keep existing rows that are missing from incoming payload.
          // Clients can send stale/partial snapshots across tabs/devices; hard
          // delete here can drop valid orders created/edited by other users.

          for (const order of orders) {
            upsertedOrderCount += 1;
            const orderUuid = orderTaskUuid(businessId, order.id);

            const orderLockKey = `bakery_orders:${businessId}:${order.id}`;
            await tx.$executeRaw`
              SELECT pg_advisory_xact_lock(hashtext(${orderLockKey}))
            `;

            const lockedExistingRows = await tx.$queryRaw<
              {
                external_id: string;
                delivery_date: string | null;
                token_used: number;
                order_status: string | null;
                assigned_staff_user_id: number | null;
                assigned_staff_name: string | null;
                production_assigned_at: string | null;
              }[]
            >`
              SELECT 
                external_id, 
                delivery_date, 
                token_used, 
                order_status,
                assigned_staff_user_id,
                assigned_staff_name,
                production_assigned_at
              FROM bakery_orders
              WHERE business_id = ${businessId}
                AND external_id = ${order.id}
                AND deleted_at IS NULL
              FOR UPDATE
            `;

            // Staff: Hard merge to prevent race conditions during claims.
            // We re-fetch fresh production tasks and re-apply merging logic 
            // while holding the row lock.
            if (isStaffRequest) {
              const existingOrderRow = lockedExistingRows[0];
              if (existingOrderRow) {
                const incomingOrder = intentOrdersById.get(order.id) || order;
                const freshStageRows = await tx.$queryRaw<DbProductionStageRow[]>`
                  SELECT stage, staff_id::text AS staff_id, token_amount
                  FROM production_tasks
                  WHERE order_id = ${orderUuid}::uuid
                `;

                const existingStages: ProductionStageAssignment[] = freshStageRows.map((row) => ({
                  stage: row.stage,
                  staffId: row.staff_id ? staffIdByUuid.get(row.staff_id) ?? null : null,
                  tokenAmount: asNumber(row.token_amount),
                  percentage: row.stage === "finishing" ? 50 : 25,
                }));

                const normalizedExistingStages = normalizeProductionStageAssignments({
                  totalTokens: asNumber(existingOrderRow.token_used),
                  stages: existingStages,
                });

                const { mergedStages, claimedByUser } = mergeStaffClaimableProductionStages({
                  existingStages: normalizedExistingStages,
                  incomingStages: incomingOrder.productionStages,
                  userId,
                });

                const viewerOwnsAnyStage = mergedStages.some((s) => s.staffId === userId);
                const statusChanged = incomingOrder.orderStatus !== existingOrderRow.order_status;
                const currentAssignee = asPositiveIntOrNull(existingOrderRow.assigned_staff_user_id);
                const nextAssignee = incomingOrder.assignedStaffUserId;

                // Re-apply staff permissions and status logic with FRESH data
                const sameAssignee = currentAssignee === nextAssignee;
                const staffClaimingUnassignedOwnOrder = currentAssignee === null && nextAssignee === userId;

                if (!sameAssignee && !staffClaimingUnassignedOwnOrder) {
                  // Revert to DB truth if illegal assignment change attempted
                  order.assignedStaffUserId = currentAssignee;
                  order.assignedStaffName = existingOrderRow.assigned_staff_name || "";
                  order.productionAssignedAt = toIsoOrNull(existingOrderRow.production_assigned_at);
                } else {
                  // Assignment allowed, update name and timestamp
                  if (nextAssignee === null) {
                    order.assignedStaffName = "";
                    order.productionAssignedAt = null;
                  } else if (nextAssignee === userId) {
                    order.assignedStaffName = incomingOrder.assignedStaffName.trim() || existingOrderRow.assigned_staff_name || `Staff #${userId}`;
                    if (currentAssignee === null) {
                      order.productionAssignedAt = incomingOrder.productionAssignedAt || new Date().toISOString();
                    }
                  } else if (claimedByUser && !existingOrderRow.production_assigned_at) {
                    order.productionAssignedAt = new Date().toISOString();
                  }
                }

                if (statusChanged) {
                  const canUpdateStatus = (nextAssignee === userId || viewerOwnsAnyStage) && staffUpdatableStatuses.has(incomingOrder.orderStatus);
                  if (!canUpdateStatus) {
                    order.orderStatus = existingOrderRow.order_status || "Inquiry";
                  } else {
                    order.orderStatus = incomingOrder.orderStatus;
                  }
                } else {
                  order.orderStatus = existingOrderRow.order_status || "Inquiry";
                }

                order.productionStages = mergedStages;
              }
            }

            // ── Token capacity: calculate tokens for this order ──
            const orderItems = (order.items || []).map((item) => ({
              category: typeof item.category === "string" ? item.category : "",
              subcategory:
                typeof item.subcategory === "string"
                  ? item.subcategory
                  : undefined,
              productName:
                typeof item.productName === "string"
                  ? item.productName
                  : undefined,
              size: typeof item.size === "string" ? item.size : undefined,
              quantity:
                typeof item.quantity === "number" ? item.quantity : undefined,
              tokenDifficulty:
                typeof item.tokenDifficulty === "string"
                  ? item.tokenDifficulty
                  : undefined,
              customTokenPerUnit:
                typeof item.customTokenPerUnit === "number"
                  ? item.customTokenPerUnit
                  : undefined,
              cookieDifficultyBreakdown:
                typeof item.cookieDifficultyBreakdown === "string"
                  ? item.cookieDifficultyBreakdown
                  : undefined,
            }));
            const tokenForOrder = calculateOrderTokenFromItems(orderItems);
            const staffByStage = Object.fromEntries(
              order.productionStages.map((stage) => [
                stage.stage,
                stage.staffId ?? order.assignedStaffUserId ?? null,
              ]),
            ) as Partial<Record<ProductionStage, number | null>>;
            const productionStages = distributeProductionTokens({
              totalTokens: tokenForOrder,
              staffByStage,
            });
            const insuranceFee = computeInsuranceFee({
              shippingQuote: order.shippingQuote,
              shipment: order.shipment,
              totalPrice: order.totalPrice,
            });

            // Determine difficulty label based on token per item ratio
            let difficulty: string | null = null;
            if (tokenForOrder > 0) {
              const avgToken =
                orderItems.length > 0
                  ? tokenForOrder / orderItems.length
                  : tokenForOrder;
              if (avgToken >= 3) difficulty = "difficult";
              else if (avgToken >= 2) difficulty = "medium";
              else difficulty = "simple";
            }

            // ── Handle token changes for existing orders ──
            const existingOrder =
              lockedExistingRows[0] ?? existingOrderMap.get(order.id);
            const isActiveStatus = !INACTIVE_STATUSES.includes(
              order.orderStatus || "",
            );
            const wasActive = existingOrder
              ? !INACTIVE_STATUSES.includes(existingOrder.order_status || "")
              : false;

            const shouldValidateSchedule =
              isActiveStatus &&
              (!existingOrder ||
                !wasActive ||
                existingOrder.delivery_date !== (order.deliveryDate || null));

            // Enforce H-1 cutoff policy in backend as final authority.
            if (shouldValidateSchedule && order.deliveryDate) {
              if (isPastDate(order.deliveryDate)) {
                throw new PastDateError(order.deliveryDate);
              }

              const capacity = await getCapacityForDate(
                businessId,
                order.deliveryDate,
                tx,
              );
              const status = getCalendarStatus(
                {
                  usedToken: capacity.usedToken,
                  maxToken: capacity.maxToken,
                  date: order.deliveryDate,
                },
                undefined,
                {
                  blockedDates: bakerySettings.blockedDates,
                },
              );

              if (status === "BLOCKED") {
                throw new CapacityBlockedDateError(order.deliveryDate);
              }

              if (status === "CUTOFF") {
                throw new CapacityCutoffError(order.deliveryDate);
              }
            }

            // ── Release token lama jika ada perubahan pada order yang sudah ada ──
            // Kasus: tanggal berubah, status jadi inactive, atau jumlah token berubah.
            // Harus dilakukan sebelum consume token baru agar slot terbebas dulu.
            let tokenWasReleased = false;
            let releasedFromDate: string | null = null;

            if (
              existingOrder &&
              existingOrder.delivery_date &&
              existingOrder.token_used > 0 &&
              wasActive
            ) {
              // Release old tokens if date changed, status changed to inactive, or token amount changed
              const dateChanged =
                existingOrder.delivery_date !== (order.deliveryDate || null);
              const becameInactive = !isActiveStatus;
              const tokenChanged = existingOrder.token_used !== tokenForOrder;

              if (dateChanged || becameInactive || tokenChanged) {
                await releaseToken(
                  businessId,
                  existingOrder.delivery_date,
                  existingOrder.token_used,
                  tx,
                );
                tokenWasReleased = true;
                releasedFromDate = existingOrder.delivery_date;
              }
            }

            // ── Consume token baru untuk order aktif dengan tanggal delivery ──
            let finalTokenUsed = 0;
            if (isActiveStatus && order.deliveryDate && tokenForOrder > 0) {
              const existingTokenUsed = existingOrder?.token_used ?? 0;
              const existingDeliveryDate = existingOrder?.delivery_date ?? null;
              const dateChanged = existingDeliveryDate !== (order.deliveryDate || null);
              const tokenChanged = existingTokenUsed !== tokenForOrder;
              const wasAlreadyActive = existingOrder ? wasActive : false;

              const shouldConsume =
                !existingOrder ||
                !wasAlreadyActive ||
                dateChanged ||
                tokenChanged;

              if (shouldConsume) {
                // Kasus khusus: token berubah, tanggal sama, order sudah ada dan aktif.
                // Token lama sudah di-release di atas (tokenWasReleased = true).
                // Gunakan atomic direct-set daripada consumeToken yang bisa gagal
                // karena ledger stale setelah reconcile.
                const tokenOnlySameDate =
                  tokenWasReleased &&
                  releasedFromDate === (order.deliveryDate || null) &&
                  !dateChanged;

                if (tokenOnlySameDate) {
                  // Direct atomic set: kita tahu slot sudah dibebaskan, aman langsung tulis
                  await tx.$executeRaw`
                    INSERT INTO production_capacity (business_id, date, max_token, used_token, created_at, updated_at)
                    VALUES (
                      ${businessId},
                      ${order.deliveryDate}::date,
                      ${bakerySettings.dailyProductionTokenLimit},
                      LEAST(${bakerySettings.dailyProductionTokenLimit}, GREATEST(0, COALESCE(
                        (SELECT used_token FROM production_capacity WHERE business_id = ${businessId} AND date = ${order.deliveryDate}::date),
                        0
                      ) + ${tokenForOrder})),
                      NOW(),
                      NOW()
                    )
                    ON CONFLICT (business_id, date) DO UPDATE SET
                      used_token = LEAST(
                        production_capacity.max_token,
                        GREATEST(0, production_capacity.used_token + ${tokenForOrder})
                      ),
                      updated_at = NOW()
                  `;
                  finalTokenUsed = tokenForOrder;
                } else {
                  // Standard consume path: order baru atau tanggal berubah
                  const consumeResult = await consumeToken(
                    businessId,
                    order.deliveryDate,
                    tokenForOrder,
                    tx,
                  );
                  if (!consumeResult.success) {
                    // Kapasitas penuh — tolak seluruh sync ini
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
                }
              } else {
                // Tidak ada perubahan — pertahankan token yang ada
                finalTokenUsed = existingOrder?.token_used ?? 0;
              }
            }

            await tx.$executeRaw`
            INSERT INTO bakery_orders (
              business_id,
              order_uuid,
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
              insurance_fee,
              sales_channel,
              payment_status,
              order_status,
              assigned_staff_user_id,
              assigned_staff_name,
              production_assigned_at,
              shipping_quote,
              shipment,
              simulations,
              whatsapp_parsed_data,
              status_history,
              automation_logs,
              payment_transactions,
              difficulty,
              token_used,
              updated_at,
              deleted_at
            ) VALUES (
              ${businessId},
              ${orderUuid}::uuid,
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
              ${insuranceFee},
              ${order.sales_channel},
              ${order.paymentStatus || null},
              ${order.orderStatus || null},
              ${order.assignedStaffUserId},
              ${order.assignedStaffName || null},
              ${order.productionAssignedAt ? new Date(order.productionAssignedAt) : null},
              ${JSON.stringify(order.shippingQuote ?? null)}::jsonb,
              ${JSON.stringify(order.shipment ?? null)}::jsonb,
              ${JSON.stringify(order.simulations ?? null)}::jsonb,
              ${JSON.stringify(order.whatsAppParsedData ?? null)}::jsonb,
              ${JSON.stringify(order.statusHistory ?? [])}::jsonb,
              ${JSON.stringify(order.automationLogs ?? [])}::jsonb,
              ${JSON.stringify(order.paymentTransactions ?? [])}::jsonb,
              ${difficulty},
              ${finalTokenUsed},
              NOW(),
              ${order.deletedAt ? new Date(order.deletedAt) : null}
            )
            ON CONFLICT (business_id, external_id)
            DO UPDATE SET
              booking_code = EXCLUDED.booking_code,
              order_uuid = EXCLUDED.order_uuid,
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
              insurance_fee = EXCLUDED.insurance_fee,
              sales_channel = EXCLUDED.sales_channel,
              payment_status = EXCLUDED.payment_status,
              order_status = EXCLUDED.order_status,
              assigned_staff_user_id = EXCLUDED.assigned_staff_user_id,
              assigned_staff_name = EXCLUDED.assigned_staff_name,
              production_assigned_at = EXCLUDED.production_assigned_at,
              shipping_quote = EXCLUDED.shipping_quote,
              shipment = EXCLUDED.shipment,
              simulations = EXCLUDED.simulations,
              whatsapp_parsed_data = EXCLUDED.whatsapp_parsed_data,
              status_history = EXCLUDED.status_history,
              automation_logs = EXCLUDED.automation_logs,
              payment_transactions = EXCLUDED.payment_transactions,
              difficulty = EXCLUDED.difficulty,
              token_used = EXCLUDED.token_used,
              updated_at = NOW(),
              deleted_at = EXCLUDED.deleted_at
          `;

            await tx.$executeRaw`
              DELETE FROM production_tasks
              WHERE order_id = ${orderUuid}::uuid
            `;

            for (const stage of productionStages) {
              await tx.$executeRaw`
                INSERT INTO production_tasks (
                  id,
                  order_id,
                  stage,
                  staff_id,
                  token_amount,
                  created_at
                ) VALUES (
                  ${productionTaskUuid(orderUuid, stage.stage)}::uuid,
                  ${orderUuid}::uuid,
                  ${stage.stage},
                  ${staffUuid(stage.staffId)}::uuid,
                  ${stage.tokenAmount},
                  NOW()
                )
                ON CONFLICT (order_id, stage)
                DO UPDATE SET
                  staff_id = EXCLUDED.staff_id,
                  token_amount = EXCLUDED.token_amount
              `;
            }

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

            const inventorySync = await syncBakeryOrderInventory(tx, {
              businessId,
              orderId: order.id,
              orderStatus: order.orderStatus || "",
              items: order.items.map((item) => ({
                category: typeof item.category === "string" ? item.category : "",
                subcategory:
                  typeof item.subcategory === "string" ? item.subcategory : "",
                productName:
                  typeof item.productName === "string" ? item.productName : "",
                size: typeof item.size === "string" ? item.size : "",
                quantity:
                  typeof item.quantity === "number" ? item.quantity : 0,
              })),
            });

            inventorySync.unresolvedProducts.forEach((name) => {
              inventoryWarnings.add(
                `Inventory sync skipped for "${name}" on order ${order.id}`,
              );
            });

            const isNewOrder = !existingOrder;
            if (isNewOrder && isActiveStatus) {
              createdOrdersForWhatsApp.push(toWhatsAppPayload(order));
            }

            existingOrderMap.set(order.id, {
              external_id: order.id,
              delivery_date: order.deliveryDate || null,
              token_used: finalTokenUsed,
              order_status: order.orderStatus || null,
            });
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
                AND deleted_at IS NULL
                AND order_status NOT IN (${INACTIVE_STATUSES[0]}, ${INACTIVE_STATUSES[1]}, ${INACTIVE_STATUSES[2]}, ${INACTIVE_STATUSES[3]})
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
                  AND bo.deleted_at IS NULL
                  AND bo.delivery_date::date = pc.date
                  AND bo.order_status NOT IN (${INACTIVE_STATUSES[0]}, ${INACTIVE_STATUSES[1]}, ${INACTIVE_STATUSES[2]}, ${INACTIVE_STATUSES[3]})
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
            inventoryWarnings: Array.from(inventoryWarnings),
            createdOrdersForWhatsApp,
          };
        },
        {
          maxWait: 10_000,
          timeout: 30_000,
        },
      );

      const { createdOrdersForWhatsApp, ...summaryStats } = transactionSummary;

      console.info("[api/bookings/orders] database upsert complete", {
        businessId,
        userId,
        durationMs,
        ...summaryStats,
        waNotificationEligible: createdOrdersForWhatsApp.length,
        waNotificationQueued: skipWhatsAppNotification
          ? 0
          : createdOrdersForWhatsApp.length,
        waNotificationMode: skipWhatsAppNotification ? "skipped" : "sent",
      });

      if (skipWhatsAppNotification) {
        console.info("[api/bookings/orders] WA notification skipped by request", {
          businessId,
          userId,
          eligibleCount: createdOrdersForWhatsApp.length,
        });
      } else {
        // Wait for WA delivery so image generation/upload/send is not cut off by serverless teardown.
        await Promise.allSettled(
          createdOrdersForWhatsApp.map((orderPayload) =>
            sendOrderToWhatsApp(orderPayload),
          ),
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          mode: "rows",
          itemCount: orders.length,
          durationMs,
          ...summaryStats,
          waNotificationMode: skipWhatsAppNotification ? "skipped" : "sent",
          waNotificationEligible: createdOrdersForWhatsApp.length,
          waNotificationQueued: skipWhatsAppNotification
            ? 0
            : createdOrdersForWhatsApp.length,
          skipWhatsAppNotification,
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

      if (rowError instanceof CapacityBlockedDateError) {
        return NextResponse.json(
          {
            error: rowError.message,
            details: `Tanggal ${rowError.date} merupakan tanggal libur yang diblokir admin.`,
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

    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
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

    if (error instanceof CapacityBlockedDateError) {
      return NextResponse.json(
        {
          error: error.message,
          details: `Tanggal ${error.date} merupakan tanggal libur yang diblokir admin.`,
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
