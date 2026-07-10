import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { AuthError, ForbiddenError, requireAuth } from "@/lib/auth/session";
import {
  isPrismaConnectionTimeout,
  prismaConnectionErrorResponse,
} from "@/lib/prisma-errors";
import {
  asRecord,
  asNumber,
  asPositiveIntOrNull,
  asString,
  asArrayOfRecords,
  parseJsonField,
  normalizeSalesChannel,
  buildStaffIdByUuid,
  orderTaskUuid,
  hydrateOrderItemsWithProductTokens,
  loadOrderProductTokenLookup,
  resolvePersistedImageFields,
  toIsoOrNull,
} from "../order-helpers";
import { normalizeOrderStatus } from "@/lib/bookings/order-status";
import { staffUuid } from "@/lib/bookings/order-api-helpers";
import {
  type NormalizedOrder,
  type DbOrderRow,
  type DbItemRow,
  type DbAddressRow,
  type DbProductionStageRow,
} from "../route";
import { getBakeryBusinessSettings } from "@/lib/bakery/settings";
import {
  getProductionStagePercentagesFromTemplates,
  resolvePrimaryProductionCategory,
  resolveProductionStageTemplatesForCategory,
} from "@/lib/bookings/production-stages";
import { calculateOrderFinancialBreakdown } from "@/lib/bookings/financial-breakdown";
import {
  isDateInPreviousMonth,
  normalizeDateInput,
} from "@/lib/helpers/date-normalization";
import { canUpdateLockedHistoricalOrderStatus } from "@/lib/bookings/historical-order-status-lock";
import {
  buildBookingAuditDocument,
  buildBookingAuditOrderSummary,
} from "@/lib/bookings/booking-audit";
import { resolveStoredDownPaymentAmount } from "@/lib/bookings/down-payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const SNAPSHOT_SOURCE_TYPE = "bakery_orders_snapshot";

const PATCHABLE_ORDER_STATUSES = new Set([
  "In Production",
  "Ready",
  "Delivery",
  "Delivered",
  "Completed",
  "Cancelled",
]);

const PATCHABLE_PAYMENT_STATUSES = new Set(["Pending", "DP Paid", "Paid"]);

type PaymentPatchResult = {
  paymentStatus: string;
  dpPaidAmount: number;
  finalPaidAmount: number;
  totalPaidAmount: number;
  downPaymentAmount: number;
  remainingBalance: number;
  paymentTransactions: Array<Record<string, unknown>>;
};

function appendStatusHistory(
  currentValue: unknown,
  params: {
    status: string;
    note: string;
    userId: number | null;
    actorName: string;
  },
) {
  const currentHistory = asArrayOfRecords(parseJsonField(currentValue)).map(
    (entry) => ({
      ...entry,
      id: asString(entry.id),
      status: asString(entry.status),
      timestamp: asString(entry.timestamp),
      note: asString(entry.note),
      userId: asPositiveIntOrNull(entry.userId),
      actorName: asString(entry.actorName),
    }),
  );

  return [
    ...currentHistory,
    {
      id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      status: params.status,
      timestamp: new Date().toISOString(),
      note: params.note,
      userId: params.userId,
      actorName: params.actorName,
    },
  ];
}

type SnapshotStore =
  | Pick<typeof prisma, "businessDocument">
  | Pick<Prisma.TransactionClient, "businessDocument">;

type SnapshotRemovalUpdate = {
  id: number;
  content: string;
  metadata: Prisma.InputJsonObject;
};

function parseSnapshotOrders(content: string | null | undefined): unknown[] {
  if (!content) return [];
  try {
    const parsed = JSON.parse(content) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isUuidLike(value: string | null | undefined): value is string {
  return typeof value === "string"
    ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      )
    : false;
}

async function loadBookingAuditOrderSummary(params: {
  businessId: number;
  orderId: string;
  fallbackLabel?: string | null;
}) {
  const itemRows = await prisma.$queryRaw<Array<{ payload: Prisma.JsonValue }>>`
    SELECT payload
    FROM bakery_order_items
    WHERE business_id = ${params.businessId}
      AND order_external_id = ${params.orderId}
    ORDER BY item_index ASC
  `;

  return buildBookingAuditOrderSummary({
    items: itemRows.map((row) => asRecord(parseJsonField(row.payload))),
    fallbackLabel: params.fallbackLabel,
  });
}

async function prepareSnapshotRemovalUpdate(params: {
  businessId: number;
  orderId: string;
}): Promise<SnapshotRemovalUpdate | null> {
  const existingSnapshot = await prisma.businessDocument.findFirst({
    where: {
      businessId: params.businessId,
      sourceType: SNAPSHOT_SOURCE_TYPE,
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      content: true,
      metadata: true,
    },
  });

  if (!existingSnapshot) return null;

  const currentOrders = parseSnapshotOrders(existingSnapshot.content);
  const nextOrders = currentOrders.filter((entry) => {
    const record = asRecord(entry);
    return record?.id !== params.orderId;
  });

  if (nextOrders.length === currentOrders.length) return null;

  const metadataRecord = (asRecord(existingSnapshot.metadata) ??
    {}) as Prisma.InputJsonObject;

  return {
    id: existingSnapshot.id,
    content: JSON.stringify(nextOrders),
    metadata: {
      ...metadataRecord,
      itemCount: nextOrders.length,
      updatedAt: new Date().toISOString(),
      source: "rows",
    } as Prisma.InputJsonObject,
  };
}

async function updateOrderStatusInSnapshot(
  db: SnapshotStore,
  params: {
    businessId: number;
    orderId: string;
    orderStatus: string;
    updatedAt: string;
    statusHistory: unknown;
  },
) {
  const existingSnapshot = await db.businessDocument.findFirst({
    where: {
      businessId: params.businessId,
      sourceType: SNAPSHOT_SOURCE_TYPE,
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      content: true,
      metadata: true,
    },
  });

  if (!existingSnapshot) return;

  let hasChanged = false;
  const currentOrders = parseSnapshotOrders(existingSnapshot.content);
  const nextOrders = currentOrders.map((entry) => {
    const record = asRecord(entry);
    if (!record || record.id !== params.orderId) return entry;
    hasChanged = true;
    return {
      ...record,
      orderStatus: params.orderStatus,
      updatedAt: params.updatedAt,
      statusHistory: params.statusHistory,
    };
  });

  if (!hasChanged) return;

  const metadataRecord = asRecord(existingSnapshot.metadata) ?? {};
  await db.businessDocument.update({
    where: { id: existingSnapshot.id },
    data: {
      content: JSON.stringify(nextOrders),
      metadata: {
        ...metadataRecord,
        itemCount: nextOrders.length,
        updatedAt: params.updatedAt,
        source: "rows",
      },
    },
  });
}

function normalizeMoney(value: unknown): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.max(0, Math.round(numericValue));
}

function buildPaymentPatch(params: {
  orderId: string;
  requestedPaymentStatus: string;
  totalPrice: unknown;
  dpPaidAmount: unknown;
  finalPaidAmount: unknown;
  downPaymentAmount: unknown;
  remainingBalance: unknown;
  paymentTransactions: unknown;
  actorUserId: number | null;
  actorName: string;
}): PaymentPatchResult {
  const total = normalizeMoney(params.totalPrice);
  const previousDpPaid = normalizeMoney(params.dpPaidAmount);
  const previousFinalPaid = normalizeMoney(params.finalPaidAmount);
  let dpPaidAmount = previousDpPaid;
  let finalPaidAmount = previousFinalPaid;
  const preservedDpPaid = Math.min(total, previousDpPaid);

  if (params.requestedPaymentStatus === "Pending") {
    dpPaidAmount = 0;
    finalPaidAmount = 0;
  } else if (params.requestedPaymentStatus === "DP Paid") {
    dpPaidAmount = resolveStoredDownPaymentAmount({
      downPaymentAmount: params.downPaymentAmount,
      dpPaidAmount: previousDpPaid,
      totalPrice: total,
    });
    finalPaidAmount = 0;
  } else {
    dpPaidAmount = preservedDpPaid;
    finalPaidAmount = Math.max(0, total - preservedDpPaid);
  }

  const totalPaidAmount = Math.min(total, dpPaidAmount + finalPaidAmount);
  const remainingBalance = Math.max(0, total - totalPaidAmount);
  const deltaDp = normalizeMoney(dpPaidAmount - previousDpPaid);
  const deltaFinal = normalizeMoney(finalPaidAmount - previousFinalPaid);
  const paymentTransactions = asArrayOfRecords(
    parseJsonField(params.paymentTransactions),
  );
  const nowIso = new Date().toISOString();
  const appendedTransactions: Array<Record<string, unknown>> = [];

  if (deltaDp !== 0) {
    appendedTransactions.push({
      id: `pay-${params.orderId}-dp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: nowIso,
      amount: deltaDp,
      type: "DP",
      note: `Status set to ${params.requestedPaymentStatus}`,
      userId: params.actorUserId,
      actorName: params.actorName,
    });
  }

  if (deltaFinal !== 0) {
    appendedTransactions.push({
      id: `pay-${params.orderId}-final-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: nowIso,
      amount: deltaFinal,
      type: "Final",
      note: `Status set to ${params.requestedPaymentStatus}`,
      userId: params.actorUserId,
      actorName: params.actorName,
    });
  }

  return {
    paymentStatus: params.requestedPaymentStatus,
    dpPaidAmount,
    finalPaidAmount,
    totalPaidAmount,
    downPaymentAmount: dpPaidAmount,
    remainingBalance,
    paymentTransactions: [...paymentTransactions, ...appendedTransactions],
  };
}

async function updatePaymentStatusInSnapshot(
  db: SnapshotStore,
  params: {
    businessId: number;
    orderId: string;
    updatedAt: string;
    payment: PaymentPatchResult;
  },
) {
  const existingSnapshot = await db.businessDocument.findFirst({
    where: {
      businessId: params.businessId,
      sourceType: SNAPSHOT_SOURCE_TYPE,
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      content: true,
      metadata: true,
    },
  });

  if (!existingSnapshot) return;

  let hasChanged = false;
  const currentOrders = parseSnapshotOrders(existingSnapshot.content);
  const nextOrders = currentOrders.map((entry) => {
    const record = asRecord(entry);
    if (!record || record.id !== params.orderId) return entry;
    hasChanged = true;
    return {
      ...record,
      paymentStatus: params.payment.paymentStatus,
      dpPaidAmount: params.payment.dpPaidAmount,
      finalPaidAmount: params.payment.finalPaidAmount,
      totalPaidAmount: params.payment.totalPaidAmount,
      downPaymentAmount: params.payment.downPaymentAmount,
      remainingBalance: params.payment.remainingBalance,
      paymentTransactions: params.payment.paymentTransactions,
      updatedAt: params.updatedAt,
    };
  });

  if (!hasChanged) return;

  const metadataRecord = asRecord(existingSnapshot.metadata) ?? {};
  await db.businessDocument.update({
    where: { id: existingSnapshot.id },
    data: {
      content: JSON.stringify(nextOrders),
      metadata: {
        ...metadataRecord,
        itemCount: nextOrders.length,
        updatedAt: params.updatedAt,
        source: "rows",
      },
    },
  });
}

async function recalculateProductionCapacityForDate(
  tx: Prisma.TransactionClient,
  params: {
    businessId: number;
    deliveryDate: string;
  },
) {
  const INACTIVE_STATUSES = ["Completed", "Delivered", "Cancelled", "Inquiry"];
  await tx.$executeRaw`
    WITH daily_totals AS (
      SELECT delivery_date AS delivery_date, COALESCE(SUM(token_used), 0) AS total_token_amount
      FROM bakery_orders
      WHERE business_id = ${params.businessId}
        AND delivery_date = ${params.deliveryDate}::date
        AND deleted_at IS NULL
        AND order_status NOT IN (${INACTIVE_STATUSES[0]}, ${INACTIVE_STATUSES[1]}, ${INACTIVE_STATUSES[2]}, ${INACTIVE_STATUSES[3]})
      GROUP BY delivery_date
    )
    UPDATE production_capacity
    SET
      used_token = COALESCE((SELECT total_token_amount FROM daily_totals LIMIT 1), 0),
      updated_at = NOW()
    WHERE business_id = ${params.businessId}
      AND date = ${params.deliveryDate}::date
  `;

  await tx.$executeRaw`
    UPDATE production_capacity
    SET used_token = 0, updated_at = NOW()
    WHERE business_id = ${params.businessId}
      AND date = ${params.deliveryDate}::date
      AND NOT EXISTS (
        SELECT 1
        FROM bakery_orders
        WHERE business_id = ${params.businessId}
          AND delivery_date = ${params.deliveryDate}::date
          AND deleted_at IS NULL
          AND order_status NOT IN (${INACTIVE_STATUSES[0]}, ${INACTIVE_STATUSES[1]}, ${INACTIVE_STATUSES[2]}, ${INACTIVE_STATUSES[3]})
      )
  `;
}

/**
 * Handler GET untuk memuat detail lengkap sebuah order bakery beserta
 * semua kolom JSONB berat, item, alamat pengiriman, dan staff assignment.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    // 1. Autentikasi dan dapatkan businessId
    const { businessId } = await requireAuth();

    // 2. Dapatkan order external ID dari parameter route Next.js
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { error: "Order ID tidak valid." },
        { status: 400 },
      );
    }

    // 3. Query satu baris data bakery_orders lengkap dengan seluruh kolom JSONB berat
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
        design_adjustment_total,
        add_on_total,
        product_adjustment,
        non_product_adjustment,
        product_subtotal,
        product_discount_amount,
        service_charge,
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
        AND external_id = ${id}
      LIMIT 1
    `;

    // Jika order tidak ditemukan, kembalikan 404
    if (orderRows.length === 0) {
      return NextResponse.json(
        { error: "Order tidak ditemukan atau Anda tidak memiliki akses." },
        { status: 404 },
      );
    }

    const row = orderRows[0];
    const financialBreakdown = calculateOrderFinancialBreakdown({
      basePrice: asNumber(row.base_price),
      designAdjustmentTotal: asNumber(row.design_adjustment_total),
      addOnTotal: asNumber(row.add_on_total),
      productAdjustment: asNumber(row.product_adjustment),
      nonProductAdjustment: asNumber(row.non_product_adjustment),
      productSubtotal: asNumber(row.product_subtotal),
      productDiscountAmount: asNumber(row.product_discount_amount),
      serviceCharge: asNumber(row.service_charge),
      deliveryFee: asNumber(row.delivery_fee),
      insuranceFee: asNumber(row.insurance_fee),
      totalPrice: asNumber(row.total_price),
      legacyManualAdjustment: asNumber(row.manual_adjustment),
      notes: row.notes ?? "",
    });

    // 4. Load produk untuk pencarian token diffculty (DRY dengan list API)
    const productTokenLookup = await loadOrderProductTokenLookup(businessId);

    // 5. Query data items terkait order ini dari bakery_order_items
    const itemRows = await prisma.$queryRaw<DbItemRow[]>`
      SELECT order_external_id, item_index, payload
      FROM bakery_order_items
      WHERE business_id = ${businessId}
        AND order_external_id = ${id}
      ORDER BY item_index ASC
    `;

    const items = hydrateOrderItemsWithProductTokens(
      itemRows.map((itemRow) => {
        const payload = asRecord(parseJsonField(itemRow.payload));
        return payload ?? {};
      }),
      productTokenLookup,
    );

    // 6. Query data alamat terkait order ini dari bakery_order_addresses
    const addressRows = await prisma.$queryRaw<DbAddressRow[]>`
      SELECT order_external_id, address_index, payload
      FROM bakery_order_addresses
      WHERE business_id = ${businessId}
        AND order_external_id = ${id}
      ORDER BY address_index ASC
    `;

    const deliveryAddresses = addressRows.map((addrRow) => {
      const payload = asRecord(parseJsonField(addrRow.payload));
      return payload ?? {};
    });

    // 7. Ambil pengaturan produksi bisnis untuk menghitung persentase tahapan produksi
    const bakerySettings = await getBakeryBusinessSettings(businessId);

    // 8. Query data tahapan tugas produksi (production_tasks) untuk order ini
    const staffMembers = await prisma.businessMember.findMany({
      where: { businessId },
      select: { userId: true },
    });
    const staffIdByUuid = buildStaffIdByUuid(
      staffMembers.map((member) => member.userId),
    );
    const orderUuid =
      row.order_uuid ?? orderTaskUuid(businessId, row.external_id);

    const stageRows = await prisma.$queryRaw<DbProductionStageRow[]>`
      SELECT order_id::text AS order_id, stage, staff_id::text AS staff_id, token_amount, completed_at, completed_by_staff_id::text AS completed_by_staff_id
      FROM production_tasks
      WHERE order_id = ${orderUuid}::uuid
      ORDER BY stage ASC
    `;

    const productionStages = stageRows.map((stageRow) => {
      const stage = stageRow.stage;
      const stagePercentages = getProductionStagePercentagesFromTemplates(
        resolveProductionStageTemplatesForCategory({
          category: resolvePrimaryProductionCategory(items),
          profiles: bakerySettings.productionStageProfiles,
        }),
      );

      return {
        stage,
        staffId: stageRow.staff_id
          ? (staffIdByUuid.get(stageRow.staff_id) ?? null)
          : null,
        tokenAmount: asNumber(stageRow.token_amount),
        percentage: stagePercentages[stage] ?? 0,
        completedAt: toIsoOrNull(stageRow.completed_at),
        completedByUserId: stageRow.completed_by_staff_id
          ? (staffIdByUuid.get(stageRow.completed_by_staff_id) ?? null)
          : null,
      };
    });

    // 9. Gabungkan menjadi satu objek NormalizedOrder lengkap dengan JSONB kolom berat
    const order: NormalizedOrder = {
      id: row.external_id,
      bookingCode: row.booking_code ?? "",
      resi: row.resi ?? "",
      createdAt: row.created_at?.toISOString?.() ?? "",
      updatedAt: row.updated_at?.toISOString?.() ?? "",
      customerName: row.customer_name ?? "",
      customerPhone: row.customer_phone ?? "",
      customerAddress: row.customer_address ?? "",
      deliveryDate:
        normalizeDateInput(row.delivery_date ?? "") ?? row.delivery_date ?? "",
      deliverySlot: row.delivery_slot ?? "",
      notes: row.notes ?? "",
      basePrice: financialBreakdown.basePrice,
      designAdjustmentTotal: financialBreakdown.designAdjustmentTotal,
      addOnTotal: financialBreakdown.addOnTotal,
      productAdjustment: financialBreakdown.productAdjustment,
      nonProductAdjustment: financialBreakdown.nonProductAdjustment,
      productSubtotal: financialBreakdown.productSubtotal,
      productDiscountAmount: financialBreakdown.productDiscountAmount,
      serviceCharge: financialBreakdown.serviceCharge,
      deliveryFee: financialBreakdown.deliveryFee,
      manualAdjustment: financialBreakdown.nonProductAdjustment,
      dpPaidAmount: asNumber(row.dp_paid_amount),
      finalPaidAmount: asNumber(row.final_paid_amount),
      totalPaidAmount: asNumber(row.total_paid_amount),
      downPaymentAmount: asNumber(row.down_payment_amount),
      remainingBalance: asNumber(row.remaining_balance),
      product: row.product ?? "",
      totalPrice: financialBreakdown.totalPrice,
      insuranceFee: financialBreakdown.insuranceFee,
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
      productionStages,
      items,
      deliveryAddresses,
    };

    // 10. Kembalikan data lengkap pesanan beserta image fields yang di-resolve
    return NextResponse.json({
      success: true,
      data: {
        ...order,
        ...resolvePersistedImageFields(order),
      },
    });
  } catch (error) {
    // Tangani error token/autentikasi
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    // Tangani error timeout database
    if (isPrismaConnectionTimeout(error)) {
      return prismaConnectionErrorResponse(
        "Koneksi database timeout saat memuat detail order bakery.",
      );
    }

    // Log error tak terduga dan kembalikan status 500
    console.error("GET /api/bookings/orders/[id] error:", error);
    return NextResponse.json(
      { error: "Gagal memuat detail pesanan." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { businessId, userId, role } = await requireAuth();
    const actorUser = await prisma.user
      .findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      })
      .catch(() => null);
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { error: "Order ID tidak valid." },
        { status: 400 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      orderStatus?: unknown;
      paymentStatus?: unknown;
      actorName?: unknown;
    };
    const rawOrderStatus = asString(body.orderStatus).trim();
    const rawPaymentStatus = asString(body.paymentStatus).trim();
    const requestedStatus = rawOrderStatus
      ? normalizeOrderStatus(rawOrderStatus)
      : null;
    const requestedPaymentStatus = rawPaymentStatus || null;

    if (!requestedStatus && !requestedPaymentStatus) {
      return NextResponse.json(
        { error: "Tidak ada perubahan status yang dikirim." },
        { status: 400 },
      );
    }

    if (requestedStatus && !PATCHABLE_ORDER_STATUSES.has(requestedStatus)) {
      return NextResponse.json(
        { error: "Status order tidak valid untuk disimpan." },
        { status: 400 },
      );
    }

    if (
      requestedPaymentStatus &&
      !PATCHABLE_PAYMENT_STATUSES.has(requestedPaymentStatus)
    ) {
      return NextResponse.json(
        { error: "Status pembayaran tidak valid untuk disimpan." },
        { status: 400 },
      );
    }

    const rows = await prisma.$queryRaw<
      Array<{
        external_id: string;
        order_uuid: string | null;
        booking_code: string | null;
        customer_name: string | null;
        order_status: string | null;
        payment_status: string | null;
        delivery_date: string | null;
        status_history: unknown;
        payment_transactions: unknown;
        total_price: unknown;
        dp_paid_amount: unknown;
        final_paid_amount: unknown;
        total_paid_amount: unknown;
        down_payment_amount: unknown;
        remaining_balance: unknown;
        assigned_staff_user_id: number | null;
      }>
    >`
      SELECT
        external_id,
        order_uuid,
        booking_code,
        customer_name,
        order_status,
        payment_status,
        delivery_date,
        status_history,
        payment_transactions,
        total_price,
        dp_paid_amount,
        final_paid_amount,
        total_paid_amount,
        down_payment_amount,
        remaining_balance,
        assigned_staff_user_id
      FROM bakery_orders
      WHERE business_id = ${businessId}
        AND external_id = ${id}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Order tidak ditemukan atau Anda tidak memiliki akses." },
        { status: 404 },
      );
    }

    const existingOrder = rows[0];
    const orderSummary = await loadBookingAuditOrderSummary({
      businessId,
      orderId: id,
      fallbackLabel: existingOrder.booking_code || id,
    });

    // Historical orders stay locked for status edits, except allowed closures.
    if (requestedStatus && existingOrder.delivery_date) {
      if (
        isDateInPreviousMonth(existingOrder.delivery_date) &&
        !canUpdateLockedHistoricalOrderStatus({
          deliveryDate: existingOrder.delivery_date,
          currentStatus: existingOrder.order_status,
          requestedStatus,
        })
      ) {
        throw new ForbiddenError(
          "Tidak dapat mengubah status order ini. Data historis tetap dikunci untuk detail order, namun perubahan status operasional harus diproses lewat endpoint status.",
        );
      }
    }

    const currentStatus = normalizeOrderStatus(existingOrder.order_status);
    const currentPaymentStatus = existingOrder.payment_status ?? "Pending";
    const isOrderStatusChanged =
      Boolean(requestedStatus) && currentStatus !== requestedStatus;
    const isPaymentStatusChanged =
      Boolean(requestedPaymentStatus) &&
      currentPaymentStatus !== requestedPaymentStatus;

    if (!isOrderStatusChanged && !isPaymentStatusChanged) {
      return NextResponse.json({
        success: true,
        data: {
          orderStatus: requestedStatus ?? currentStatus,
          paymentStatus: requestedPaymentStatus ?? currentPaymentStatus,
          statusHistory: asArrayOfRecords(
            parseJsonField(existingOrder.status_history),
          ),
          paymentTransactions: asArrayOfRecords(
            parseJsonField(existingOrder.payment_transactions),
          ),
          updatedAt: new Date().toISOString(),
        },
      });
    }

    const roleName = String(role);
    const isPrivilegedRequest = roleName === "Owner" || roleName === "Admin";

    if (requestedPaymentStatus && !isPrivilegedRequest) {
      throw new ForbiddenError(
        "Anda tidak diizinkan mengubah status pembayaran order ini.",
      );
    }

    if (isOrderStatusChanged && !isPrivilegedRequest) {
      const isAssignedStaff = existingOrder.assigned_staff_user_id === userId;
      let ownsProductionStage = false;
      const orderUuid = existingOrder.order_uuid;
      const viewerStaffUuid = staffUuid(userId);

      if (!isAssignedStaff && orderUuid && viewerStaffUuid) {
        const stageRows = await prisma.$queryRaw<Array<{ count: number }>>`
          SELECT COUNT(*)::int AS count
          FROM production_tasks
          WHERE order_id = ${orderUuid}::uuid
            AND staff_id = ${viewerStaffUuid}::uuid
        `;
        ownsProductionStage = Number(stageRows[0]?.count ?? 0) > 0;
      }

      if (!isAssignedStaff && !ownsProductionStage) {
        throw new ForbiddenError(
          "Anda tidak diizinkan mengubah status order ini.",
        );
      }
    }

    const actorName = asString(body.actorName).trim() || `User #${userId}`;
    const nextUpdatedAt = new Date().toISOString();
    const note =
      requestedStatus === "In Production"
        ? "Order masuk produksi"
        : `Status changed to ${requestedStatus}`;
    const nextStatusHistory =
      isOrderStatusChanged && requestedStatus
        ? appendStatusHistory(existingOrder.status_history, {
            status: requestedStatus,
            note,
            userId,
            actorName,
          })
        : asArrayOfRecords(parseJsonField(existingOrder.status_history));
    const paymentPatch =
      isPaymentStatusChanged && requestedPaymentStatus
        ? buildPaymentPatch({
            orderId: id,
            requestedPaymentStatus,
            totalPrice: existingOrder.total_price,
            dpPaidAmount: existingOrder.dp_paid_amount,
            finalPaidAmount: existingOrder.final_paid_amount,
            downPaymentAmount: existingOrder.down_payment_amount,
            remainingBalance: existingOrder.remaining_balance,
            paymentTransactions: existingOrder.payment_transactions,
            actorUserId: userId,
            actorName,
          })
        : null;

    await prisma.$transaction(
      async (tx) => {
        if (isOrderStatusChanged && requestedStatus) {
          await tx.$executeRaw`
            UPDATE bakery_orders
            SET
              order_status = ${requestedStatus},
              status_history = ${JSON.stringify(nextStatusHistory)}::jsonb,
              updated_at = NOW()
            WHERE business_id = ${businessId}
              AND external_id = ${id}
          `;

          await updateOrderStatusInSnapshot(tx, {
            businessId,
            orderId: id,
            orderStatus: requestedStatus,
            updatedAt: nextUpdatedAt,
            statusHistory: nextStatusHistory,
          });
        }

        if (paymentPatch) {
          await tx.$executeRaw`
            UPDATE bakery_orders
            SET
              payment_status = ${paymentPatch.paymentStatus},
              dp_paid_amount = ${paymentPatch.dpPaidAmount},
              final_paid_amount = ${paymentPatch.finalPaidAmount},
              total_paid_amount = ${paymentPatch.totalPaidAmount},
              down_payment_amount = ${paymentPatch.downPaymentAmount},
              remaining_balance = ${paymentPatch.remainingBalance},
              payment_transactions = ${JSON.stringify(paymentPatch.paymentTransactions)}::jsonb,
              updated_at = NOW()
            WHERE business_id = ${businessId}
              AND external_id = ${id}
          `;

          await updatePaymentStatusInSnapshot(tx, {
            businessId,
            orderId: id,
            updatedAt: nextUpdatedAt,
            payment: paymentPatch,
          });
        }

        await tx.businessDocument.create({
          data: buildBookingAuditDocument({
            businessId,
            action: "edited",
            orderId: id,
            bookingCode: existingOrder.booking_code || id,
            customerName: existingOrder.customer_name || "",
            orderSummary,
            actorUserId: userId,
            actorName:
              actorUser?.name || actorName || `User #${userId} (${String(role)})`,
            actorEmail: actorUser?.email || "",
          }),
        });

        if (isOrderStatusChanged && existingOrder.delivery_date) {
          await recalculateProductionCapacityForDate(tx, {
            businessId,
            deliveryDate: existingOrder.delivery_date,
          });
        }
      },
      {
        maxWait: 10_000,
        timeout: 60_000,
      },
    );

    return NextResponse.json({
      success: true,
      data: {
        orderStatus: requestedStatus ?? currentStatus,
        paymentStatus: paymentPatch?.paymentStatus ?? currentPaymentStatus,
        dpPaidAmount:
          paymentPatch?.dpPaidAmount ?? asNumber(existingOrder.dp_paid_amount),
        finalPaidAmount:
          paymentPatch?.finalPaidAmount ??
          asNumber(existingOrder.final_paid_amount),
        totalPaidAmount:
          paymentPatch?.totalPaidAmount ??
          asNumber(existingOrder.total_paid_amount),
        downPaymentAmount:
          paymentPatch?.downPaymentAmount ??
          asNumber(existingOrder.down_payment_amount),
        remainingBalance:
          paymentPatch?.remainingBalance ??
          asNumber(existingOrder.remaining_balance),
        statusHistory: nextStatusHistory,
        paymentTransactions:
          paymentPatch?.paymentTransactions ??
          asArrayOfRecords(parseJsonField(existingOrder.payment_transactions)),
        updatedAt: nextUpdatedAt,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (isPrismaConnectionTimeout(error)) {
      return prismaConnectionErrorResponse(
        "Koneksi database timeout saat menyimpan status order bakery.",
      );
    }

    console.error("PATCH /api/bookings/orders/[id] error:", error);
    return NextResponse.json(
      { error: "Gagal menyimpan status pesanan." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { businessId, role, userId } = await requireAuth();
    const actorUser = await prisma.user
      .findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      })
      .catch(() => null);
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { error: "Order ID tidak valid." },
        { status: 400 },
      );
    }

    const roleName = String(role);
    if (roleName !== "Owner" && roleName !== "Admin") {
      throw new ForbiddenError("Hanya Owner/Admin yang dapat menghapus order.");
    }

    const rows = await prisma.$queryRaw<
      Array<{
        delivery_date: string | null;
        order_uuid: string | null;
        booking_code: string | null;
        customer_name: string | null;
      }>
    >`
      SELECT delivery_date, order_uuid, booking_code, customer_name
      FROM bakery_orders
      WHERE business_id = ${businessId}
        AND external_id = ${id}
        AND deleted_at IS NULL
      LIMIT 1
    `;

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Order tidak ditemukan atau sudah dihapus." },
        { status: 404 },
      );
    }

    const deliveryDate = rows[0].delivery_date;
    const orderSummary = await loadBookingAuditOrderSummary({
      businessId,
      orderId: id,
      fallbackLabel: rows[0].booking_code || id,
    });

    // Mencegah penghapusan data untuk order di bulan-bulan sebelumnya demi integritas laporan
    if (deliveryDate) { // Pastikan pesanan punya delivery date
      if (isDateInPreviousMonth(deliveryDate)) { // Jika masuk kategori bulan sebelumnya
        throw new ForbiddenError(
          "Tidak dapat menghapus order dari bulan sebelumnya. Data telah dikunci."
        ); // Batalkan proses hapus dan keluarkan peringatan
      }
    }

    const orderUuid = isUuidLike(rows[0].order_uuid)
      ? rows[0].order_uuid
      : null;
    const snapshotRemovalUpdate = await prepareSnapshotRemovalUpdate({
      businessId,
      orderId: id,
    });

    const transactionSteps: Prisma.PrismaPromise<unknown>[] = [
      prisma.$executeRaw`
        DELETE FROM bakery_order_items
        WHERE business_id = ${businessId}
          AND order_external_id = ${id}
      `,
      prisma.$executeRaw`
        DELETE FROM bakery_order_addresses
        WHERE business_id = ${businessId}
          AND order_external_id = ${id}
      `,
      prisma.$executeRaw`
        DELETE FROM bakery_orders
        WHERE business_id = ${businessId}
          AND external_id = ${id}
      `,
    ];

    if (orderUuid) {
      transactionSteps.unshift(
        prisma.$executeRaw`
          DELETE FROM production_tasks
          WHERE order_id = ${orderUuid}::uuid
        `,
      );
    }

    if (snapshotRemovalUpdate) {
      transactionSteps.push(
        prisma.businessDocument.update({
          where: { id: snapshotRemovalUpdate.id },
          data: {
            content: snapshotRemovalUpdate.content,
            metadata: snapshotRemovalUpdate.metadata,
          },
        }),
      );
    }

    transactionSteps.push(
      prisma.businessDocument.create({
        data: buildBookingAuditDocument({
          businessId,
          action: "deleted",
          orderId: id,
          bookingCode: rows[0].booking_code || id,
          customerName: rows[0].customer_name || "",
          orderSummary,
          actorUserId: userId,
          actorName:
            actorUser?.name || `User #${userId} (${String(role)})`,
          actorEmail: actorUser?.email || "",
        }),
      }),
    );
    if (deliveryDate) {
      const INACTIVE_STATUSES = [
        "Cancelled",
        "Completed",
        "Delivery",
        "Delivered",
      ] as const;
      transactionSteps.push(
        prisma.$executeRaw`
          WITH daily_totals AS (
            SELECT delivery_date AS delivery_date, COALESCE(SUM(token_used), 0) AS total_token_amount
            FROM bakery_orders
            WHERE business_id = ${businessId}
              AND delivery_date = ${deliveryDate}::date
              AND deleted_at IS NULL
              AND order_status NOT IN (${INACTIVE_STATUSES[0]}, ${INACTIVE_STATUSES[1]}, ${INACTIVE_STATUSES[2]}, ${INACTIVE_STATUSES[3]})
            GROUP BY delivery_date
          )
          UPDATE production_capacity
          SET
            used_token = COALESCE((SELECT total_token_amount FROM daily_totals LIMIT 1), 0),
            updated_at = NOW()
          WHERE business_id = ${businessId}
            AND date = ${deliveryDate}::date
        `,
        prisma.$executeRaw`
          UPDATE production_capacity
          SET used_token = 0, updated_at = NOW()
          WHERE business_id = ${businessId}
            AND date = ${deliveryDate}::date
            AND NOT EXISTS (
              SELECT 1
              FROM bakery_orders
              WHERE business_id = ${businessId}
                AND delivery_date = ${deliveryDate}::date
                AND deleted_at IS NULL
                AND order_status NOT IN (${INACTIVE_STATUSES[0]}, ${INACTIVE_STATUSES[1]}, ${INACTIVE_STATUSES[2]}, ${INACTIVE_STATUSES[3]})
            )
        `,
      );
    }

    await prisma.$transaction(transactionSteps);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("DELETE /api/bookings/orders/[id] error:", error);
    const errorDetails =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
    fs.writeFileSync(path.join(process.cwd(), "last-error.log"), errorDetails);
    return NextResponse.json(
      { error: "Gagal menghapus pesanan." },
      { status: 500 },
    );
  }
}
