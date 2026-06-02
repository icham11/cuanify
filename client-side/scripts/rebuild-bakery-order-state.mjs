import "dotenv/config";
import crypto from "crypto";
import { Client } from "pg";

const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL or DIRECT_URL is required.");
}

const SNAPSHOT_SOURCE_TYPE = "bakery_orders_snapshot";
const INACTIVE_CAPACITY_STATUSES = [
  "Cancelled",
  "Completed",
  "Delivery",
  "Delivered",
];

function toDateKey(value) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asString(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function asPositiveIntOrNull(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeSalesChannel(value) {
  const normalized = asString(value).trim().toLowerCase();
  if (normalized === "tokopedia" || normalized === "shopee") return normalized;
  return "direct";
}

function deterministicUuid(input) {
  const hash = crypto.createHash("md5").update(input).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

async function loadOrderRows(client, businessId) {
  const ordersRes = await client.query(
    `
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
        updated_at,
        token_used
      FROM bakery_orders
      WHERE business_id = $1
        AND deleted_at IS NULL
      ORDER BY updated_at DESC
    `,
    [businessId],
  );

  const itemsRes = await client.query(
    `
      SELECT order_external_id, item_index, payload
      FROM bakery_order_items
      WHERE business_id = $1
      ORDER BY order_external_id ASC, item_index ASC
    `,
    [businessId],
  );

  const addressesRes = await client.query(
    `
      SELECT order_external_id, address_index, payload
      FROM bakery_order_addresses
      WHERE business_id = $1
      ORDER BY order_external_id ASC, address_index ASC
    `,
    [businessId],
  );

  const staffMembersRes = await client.query(
    `
      SELECT "userId"
      FROM "BusinessMember"
      WHERE "businessId" = $1
    `,
    [businessId],
  );

  const orderUuidMap = new Map(
    ordersRes.rows.map((row) => [
      row.order_uuid || null,
      row.external_id,
    ]),
  );

  const orderUuids = ordersRes.rows
    .map((row) => row.order_uuid)
    .filter(Boolean);

  const stagesRes =
    orderUuids.length > 0
      ? await client.query(
          `
            SELECT order_id::text AS order_id, stage, staff_id::text AS staff_id, token_amount
            FROM production_tasks
            WHERE order_id::text = ANY($1::text[])
            ORDER BY order_id ASC, stage ASC
          `,
          [orderUuids],
        )
      : { rows: [] };

  const staffIdByUuid = new Map(
    staffMembersRes.rows.map((row) => {
      const userId = Number(row.userId);
      return [deterministicUuid(`staff:${userId}`), userId];
    }),
  );

  const itemsMap = new Map();
  for (const row of itemsRes.rows) {
    const current = itemsMap.get(row.order_external_id) ?? [];
    current.push(parseJson(row.payload, {}));
    itemsMap.set(row.order_external_id, current);
  }

  const addressesMap = new Map();
  for (const row of addressesRes.rows) {
    const current = addressesMap.get(row.order_external_id) ?? [];
    current.push(parseJson(row.payload, {}));
    addressesMap.set(row.order_external_id, current);
  }

  const stageAssignmentsMap = new Map();
  for (const row of stagesRes.rows) {
    const externalId = orderUuidMap.get(row.order_id) || null;
    if (!externalId) continue;
    const current = stageAssignmentsMap.get(externalId) ?? [];
    current.push({
      stage: asString(row.stage),
      staffId: row.staff_id ? (staffIdByUuid.get(asString(row.staff_id)) ?? null) : null,
      tokenAmount: asNumber(row.token_amount),
      percentage: 0,
    });
    stageAssignmentsMap.set(externalId, current);
  }

  return ordersRes.rows.map((row) => ({
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
    insuranceFee: asNumber(row.insurance_fee),
    sales_channel: normalizeSalesChannel(row.sales_channel),
    paymentStatus: row.payment_status ?? "Pending",
    orderStatus: row.order_status ?? "Inquiry",
    assignedStaffUserId: asPositiveIntOrNull(row.assigned_staff_user_id),
    assignedStaffName: row.assigned_staff_name ?? "",
    productionAssignedAt: row.production_assigned_at
      ? new Date(row.production_assigned_at).toISOString()
      : null,
    shippingQuote: parseJson(row.shipping_quote, null),
    shipment: parseJson(row.shipment, null),
    simulations: parseJson(row.simulations, null),
    whatsAppParsedData: parseJson(row.whatsapp_parsed_data, null),
    statusHistory: parseJson(row.status_history, []),
    automationLogs: parseJson(row.automation_logs, []),
    paymentTransactions: parseJson(row.payment_transactions, []),
    productionStages: stageAssignmentsMap.get(row.external_id) ?? [],
    items: itemsMap.get(row.external_id) ?? [],
    deliveryAddresses: addressesMap.get(row.external_id) ?? [],
    tokenUsed: asNumber(row.token_used),
  }));
}

async function upsertSnapshot(client, businessId, orders) {
  const content = JSON.stringify(orders);
  const existing = await client.query(
    `
      SELECT id
      FROM "BusinessDocument"
      WHERE "businessId" = $1
        AND "sourceType" = $2
      ORDER BY "updatedAt" DESC
      LIMIT 1
    `,
    [businessId, SNAPSHOT_SOURCE_TYPE],
  );

  if (existing.rows[0]?.id) {
    await client.query(
      `
        UPDATE "BusinessDocument"
        SET content = $1,
            "updatedAt" = NOW()
        WHERE id = $2
      `,
      [content, existing.rows[0].id],
    );
    return "updated";
  }

  await client.query(
    `
      INSERT INTO "BusinessDocument" (
        "businessId",
        "title",
        content,
        "sourceType",
        "createdAt",
        "updatedAt"
      ) VALUES ($1, $2, $3, $4, NOW(), NOW())
    `,
    [businessId, "Bakery Orders Snapshot", content, SNAPSHOT_SOURCE_TYPE],
  );
  return "created";
}

async function reconcileCapacity(client, businessId) {
  const defaultMaxTokenRes = await client.query(
    `
      SELECT COALESCE(MAX(max_token), 500)::integer AS max_token
      FROM production_capacity
      WHERE business_id = $1
    `,
    [businessId],
  );
  const defaultMaxToken = Number(defaultMaxTokenRes.rows[0]?.max_token || 500);

  await client.query(
    `
      WITH active_tokens AS (
        SELECT
          delivery_date AS delivery_date,
          GREATEST(0, COALESCE(SUM(token_used), 0))::integer AS used_token
        FROM bakery_orders
        WHERE business_id = $1
          AND delivery_date IS NOT NULL
          AND deleted_at IS NULL
          AND order_status NOT IN ($2, $3, $4, $5)
        GROUP BY delivery_date
      )
      INSERT INTO production_capacity (
        business_id,
        "businessId",
        date,
        max_token,
        used_token,
        created_at,
        updated_at
      )
      SELECT
        $1,
        $1,
        active_tokens.delivery_date,
        $6,
        LEAST($6, active_tokens.used_token),
        NOW(),
        NOW()
      FROM active_tokens
      ON CONFLICT (business_id, date)
      DO UPDATE SET
        "businessId" = EXCLUDED."businessId",
        used_token = LEAST(
          production_capacity.max_token,
          GREATEST(0, EXCLUDED.used_token)
        ),
        updated_at = NOW()
    `,
    [
      businessId,
      ...INACTIVE_CAPACITY_STATUSES,
      defaultMaxToken,
    ],
  );

  await client.query(
    `
      UPDATE production_capacity pc
      SET used_token = 0,
          updated_at = NOW()
      WHERE pc.business_id = $1
        AND NOT EXISTS (
          SELECT 1
          FROM bakery_orders bo
          WHERE bo.business_id = pc.business_id
            AND bo.delivery_date IS NOT NULL
            AND bo.deleted_at IS NULL
            AND bo.delivery_date = pc.date
            AND bo.order_status NOT IN ($2, $3, $4, $5)
            AND bo.token_used > 0
        )
    `,
    [businessId, ...INACTIVE_CAPACITY_STATUSES],
  );
}

async function main() {
  const client = new Client({ connectionString });
  await client.connect();

  const requestedBusinessId = process.argv
    .find((arg) => arg.startsWith("--businessId="))
    ?.split("=")[1];

  const businessIdsRes = requestedBusinessId
    ? { rows: [{ business_id: Number(requestedBusinessId) }] }
    : await client.query(
        `
          SELECT DISTINCT business_id
          FROM bakery_orders
          WHERE deleted_at IS NULL
          ORDER BY business_id ASC
        `,
      );

  for (const row of businessIdsRes.rows) {
    const businessId = Number(row.business_id);
    if (!Number.isFinite(businessId) || businessId <= 0) continue;

    const orders = await loadOrderRows(client, businessId);
    const snapshotResult = await upsertSnapshot(client, businessId, orders);
    await reconcileCapacity(client, businessId);

    console.log(
      JSON.stringify({
        businessId,
        snapshot: snapshotResult,
        orderCount: orders.length,
        minDeliveryDate: orders.reduce((min, order) => {
          if (!order.deliveryDate) return min;
          if (!min || order.deliveryDate < min) return order.deliveryDate;
          return min;
        }, ""),
        maxDeliveryDate: orders.reduce((max, order) => {
          if (!order.deliveryDate) return max;
          if (!max || order.deliveryDate > max) return order.deliveryDate;
          return max;
        }, ""),
      }),
    );
  }

  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
