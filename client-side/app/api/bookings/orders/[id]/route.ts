import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { AuthError, ForbiddenError, requireAuth } from "@/lib/auth/session";
import { isPrismaConnectionTimeout, prismaConnectionErrorResponse } from "@/lib/prisma-errors";
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
import { getProductionStagePercentagesFromTemplates, resolvePrimaryProductionCategory, resolveProductionStageTemplatesForCategory } from "@/lib/bookings/production-stages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PATCHABLE_ORDER_STATUSES = new Set([
  "In Production",
  "Ready",
  "Delivery",
  "Delivered",
  "Completed",
  "Cancelled",
]);

function appendStatusHistory(
  currentValue: unknown,
  params: {
    status: string;
    note: string;
    userId: number | null;
    actorName: string;
  },
) {
  const currentHistory = asArrayOfRecords(parseJsonField(currentValue)).map((entry) => ({
    ...entry,
    id: asString(entry.id),
    status: asString(entry.status),
    timestamp: asString(entry.timestamp),
    note: asString(entry.note),
    userId: asPositiveIntOrNull(entry.userId),
    actorName: asString(entry.actorName),
  }));

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
      return NextResponse.json({ error: "Order ID tidak valid." }, { status: 400 });
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
    const orderUuid = row.order_uuid ?? orderTaskUuid(businessId, row.external_id);

    const stageRows = await prisma.$queryRaw<DbProductionStageRow[]>`
      SELECT order_id::text AS order_id, stage, staff_id::text AS staff_id, token_amount
      FROM production_tasks
      WHERE order_id::text = ${orderUuid}
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
        staffId: stageRow.staff_id ? (staffIdByUuid.get(stageRow.staff_id) ?? null) : null,
        tokenAmount: asNumber(stageRow.token_amount),
        percentage: stagePercentages[stage] ?? 0,
      };
    });

    // 9. Gabungkan menjadi satu objek NormalizedOrder lengkap dengan JSONB kolom berat
    const order: NormalizedOrder = {
      id: row.external_id,
      bookingCode: row.booking_code ?? "",
      resi: row.resi ?? "",
      customerName: row.customer_name ?? "",
      customerPhone: row.customer_phone ?? "",
      customerAddress: row.customer_address ?? "",
      // Pertahankan string asli YYYY-MM-DD dari DB agar parsing tanggal di kalender/UI frontend tidak rusak/null
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
      paymentTransactions: asArrayOfRecords(parseJsonField(row.payment_transactions)),
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
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json({ error: "Order ID tidak valid." }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      orderStatus?: unknown;
      actorName?: unknown;
    };
    const requestedStatus = normalizeOrderStatus(asString(body.orderStatus));

    if (!PATCHABLE_ORDER_STATUSES.has(requestedStatus)) {
      return NextResponse.json(
        { error: "Status order tidak valid untuk disimpan." },
        { status: 400 },
      );
    }

    const rows = await prisma.$queryRaw<
      Array<{
        external_id: string;
        order_uuid: string | null;
        order_status: string | null;
        status_history: unknown;
        assigned_staff_user_id: number | null;
      }>
    >`
      SELECT
        external_id,
        order_uuid,
        order_status,
        status_history,
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
    const currentStatus = normalizeOrderStatus(existingOrder.order_status);
    if (currentStatus === requestedStatus) {
      return NextResponse.json({
        success: true,
        data: {
          orderStatus: requestedStatus,
          statusHistory: asArrayOfRecords(parseJsonField(existingOrder.status_history)),
          updatedAt: new Date().toISOString(),
        },
      });
    }

    const roleName = String(role);
    const isPrivilegedRequest = roleName === "Owner" || roleName === "Admin";

    if (!isPrivilegedRequest) {
      const isAssignedStaff = existingOrder.assigned_staff_user_id === userId;
      let ownsProductionStage = false;
      const orderUuid = existingOrder.order_uuid;
      const viewerStaffUuid = staffUuid(userId);

      if (!isAssignedStaff && orderUuid && viewerStaffUuid) {
        const stageRows = await prisma.$queryRaw<Array<{ count: number }>>`
          SELECT COUNT(*)::int AS count
          FROM production_tasks
          WHERE order_id::text = ${orderUuid}
            AND staff_id::text = ${viewerStaffUuid}
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
    const note =
      requestedStatus === "In Production"
        ? "Order masuk produksi"
        : `Status changed to ${requestedStatus}`;
    const nextStatusHistory = appendStatusHistory(existingOrder.status_history, {
      status: requestedStatus,
      note,
      userId,
      actorName,
    });

    await prisma.$executeRaw`
      UPDATE bakery_orders
      SET
        order_status = ${requestedStatus},
        status_history = ${JSON.stringify(nextStatusHistory)}::jsonb,
        updated_at = NOW()
      WHERE business_id = ${businessId}
        AND external_id = ${id}
    `;

    return NextResponse.json({
      success: true,
      data: {
        orderStatus: requestedStatus,
        statusHistory: nextStatusHistory,
        updatedAt: new Date().toISOString(),
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
