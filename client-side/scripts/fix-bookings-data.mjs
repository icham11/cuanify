import prisma from "../lib/prisma.ts";

const JAKARTA_TZ = "Asia/Jakarta";
const FULL_BOOKING_CODE_PATTERN = /^[A-Z]{2}\d{3}-\d{6}-\d{3}$/;

function normalizeIsoDate(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";

  const directMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (directMatch) {
    return `${directMatch[1]}-${directMatch[2]}-${directMatch[3]}`;
  }

  const parsed = new Date(text);
  if (!Number.isFinite(parsed.getTime())) return "";

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: JAKARTA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

function extractDateFromReference(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized) return "";

  const match = normalized.match(/-(\d{2})(\d{2})(\d{2})-(\d{3})$/);
  if (!match) return "";

  const [, day, month, year] = match;
  return normalizeIsoDate(`20${year}-${month}-${day}`);
}

function toBookingDatePart(isoDate) {
  const normalizedDate = normalizeIsoDate(isoDate);
  const match = normalizedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "000000";
  return `${match[3]}${match[2]}${match[1].slice(-2)}`;
}

function generateBookingCode(customerName, customerPhone, deliveryDate, sequence) {
  const initials = String(customerName ?? "")
    .replace(/[^a-zA-Z]/g, "")
    .slice(0, 2)
    .toUpperCase()
    .padEnd(2, "X");
  const phoneDigits = String(customerPhone ?? "").replace(/\D/g, "");
  const lastThree = phoneDigits.slice(-3).padStart(3, "0");
  const datePart = toBookingDatePart(deliveryDate);
  const sequencePart = String(sequence).padStart(3, "0");
  return `${initials}${lastThree}-${datePart}-${sequencePart}`;
}

function extractSequenceForDate(code, datePart) {
  const normalized = String(code ?? "").replace(/\s+/g, "").toUpperCase();
  if (!normalized || !datePart || datePart === "000000") return 0;
  const pattern = new RegExp(`^[A-Z]{2}\\d{3}-${datePart}-(\\d{3})$`);
  const match = normalized.match(pattern);
  if (!match?.[1]) return 0;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveEffectiveDeliveryDate(row) {
  const fromDeliveryDate = normalizeIsoDate(row.delivery_date);
  if (fromDeliveryDate) {
    return { date: fromDeliveryDate, source: "delivery_date", ambiguous: false };
  }

  const fromBookingCode = extractDateFromReference(row.booking_code);
  if (fromBookingCode) {
    return { date: fromBookingCode, source: "booking_code", ambiguous: false };
  }

  const fromResi = extractDateFromReference(row.resi);
  if (fromResi) {
    return { date: fromResi, source: "resi", ambiguous: false };
  }

  const fromCreatedAt = normalizeIsoDate(row.created_at);
  if (fromCreatedAt) {
    return { date: fromCreatedAt, source: "created_at", ambiguous: true };
  }

  const fromUpdatedAt = normalizeIsoDate(row.updated_at);
  if (fromUpdatedAt) {
    return { date: fromUpdatedAt, source: "updated_at", ambiguous: true };
  }

  return { date: "", source: "unresolved", ambiguous: true };
}

function nextDataFixState(simulations, patch) {
  const current =
    simulations && typeof simulations === "object" && !Array.isArray(simulations)
      ? simulations
      : {};
  const currentDataFix =
    current.dataFix &&
    typeof current.dataFix === "object" &&
    !Array.isArray(current.dataFix)
      ? current.dataFix
      : {};

  return {
    ...current,
    dataFix: {
      ...currentDataFix,
      ...patch,
    },
  };
}

function buildUsedCodeSet(rows) {
  return new Map(
    rows.reduce((acc, row) => {
      const businessId = Number(row.business_id);
      const current = acc.get(businessId) ?? new Set();
      const bookingCode = String(row.booking_code ?? "").trim();
      if (bookingCode) current.add(bookingCode);
      acc.set(businessId, current);
      return acc;
    }, new Map()),
  );
}

function generateNextUniqueBookingCode(row, effectiveDate, usedCodes) {
  const datePart = toBookingDatePart(effectiveDate);
  let sequence = 1;

  for (const existingCode of usedCodes) {
    sequence = Math.max(sequence, extractSequenceForDate(existingCode, datePart) + 1);
  }

  let nextCode = generateBookingCode(
    row.customer_name,
    row.customer_phone,
    effectiveDate,
    sequence,
  );

  while (usedCodes.has(nextCode)) {
    sequence += 1;
    nextCode = generateBookingCode(
      row.customer_name,
      row.customer_phone,
      effectiveDate,
      sequence,
    );
  }

  return nextCode;
}

function buildOrderKey(businessId, externalId) {
  return `${Number(businessId)}::${String(externalId)}`;
}

async function main() {
  const nowIso = new Date().toISOString();

  const activeOrders = await prisma.$queryRaw`
    SELECT
      business_id,
      external_id,
      booking_code,
      resi,
      customer_name,
      customer_phone,
      delivery_date,
      delivery_slot,
      simulations,
      created_at::text AS created_at,
      updated_at::text AS updated_at
    FROM bakery_orders
    WHERE deleted_at IS NULL
    ORDER BY business_id ASC, created_at ASC, external_id ASC
  `;

  const rows = activeOrders.map((row) => ({
    ...row,
    business_id: Number(row.business_id),
  }));

  const updates = [];
  const resolvedByOrderKey = new Map();

  for (const row of rows) {
    const resolved = resolveEffectiveDeliveryDate(row);
    resolvedByOrderKey.set(buildOrderKey(row.business_id, row.external_id), resolved);

    if (normalizeIsoDate(row.delivery_date)) {
      continue;
    }
    if (!resolved.date) continue;

    updates.push({
      businessId: row.business_id,
      externalId: row.external_id,
      nextDeliveryDate: resolved.date,
      nextBookingCode: null,
      nextSimulations: nextDataFixState(row.simulations, {
        deliveryDateBackfilledAt: nowIso,
        deliveryDateSource: resolved.source,
        deliveryDateReviewRequired: resolved.ambiguous,
        originalDeliveryDateWasNull: true,
      }),
    });
  }

  const rowsByBusinessAndCode = new Map();
  for (const row of rows) {
    const bookingCode = String(row.booking_code ?? "").trim();
    if (!bookingCode) continue;
    const key = `${row.business_id}::${bookingCode}`;
    const current = rowsByBusinessAndCode.get(key) ?? [];
    current.push(row);
    rowsByBusinessAndCode.set(key, current);
  }

  const usedCodesByBusiness = buildUsedCodeSet(rows);

  for (const [key, duplicateRows] of rowsByBusinessAndCode.entries()) {
    if (duplicateRows.length <= 1) continue;

    const [businessIdText, originalCode] = key.split("::");
    const businessId = Number(businessIdText);
    const usedCodes = usedCodesByBusiness.get(businessId) ?? new Set();
    const keepFirstExistingCode = FULL_BOOKING_CODE_PATTERN.test(originalCode);

    const sortedRows = duplicateRows
      .slice()
      .sort((left, right) => {
        const leftCreated = new Date(left.created_at).getTime();
        const rightCreated = new Date(right.created_at).getTime();
        if (leftCreated !== rightCreated) return leftCreated - rightCreated;
        return String(left.external_id).localeCompare(String(right.external_id));
      });

    for (let index = 0; index < sortedRows.length; index += 1) {
      if (keepFirstExistingCode && index === 0) continue;

      const row = sortedRows[index];
      const resolved = resolvedByOrderKey.get(
        buildOrderKey(row.business_id, row.external_id),
      );
      if (!resolved?.date) continue;

      const nextBookingCode = generateNextUniqueBookingCode(
        row,
        resolved.date,
        usedCodes,
      );
      usedCodes.add(nextBookingCode);

      updates.push({
        businessId,
        externalId: row.external_id,
        nextDeliveryDate: null,
        nextBookingCode,
        nextSimulations: nextDataFixState(row.simulations, {
          bookingCodeNormalizedAt: nowIso,
          bookingCodeNormalizationReason: "duplicate_in_business",
          originalBookingCode: row.booking_code,
          bookingCodeReviewRequired: false,
        }),
      });
    }
  }

  const mergedUpdates = new Map();
  for (const update of updates) {
    const orderKey = buildOrderKey(update.businessId, update.externalId);
    const existing = mergedUpdates.get(orderKey);
    if (!existing) {
      mergedUpdates.set(orderKey, update);
      continue;
    }

    mergedUpdates.set(orderKey, {
      ...existing,
      nextDeliveryDate: update.nextDeliveryDate ?? existing.nextDeliveryDate,
      nextBookingCode: update.nextBookingCode ?? existing.nextBookingCode,
      nextSimulations: update.nextSimulations ?? existing.nextSimulations,
    });
  }

  const finalUpdates = Array.from(mergedUpdates.values()).filter(
    (entry) => entry.nextDeliveryDate || entry.nextBookingCode,
  );

  let deliveryDateBackfilled = 0;
  let ambiguousTagged = 0;
  let bookingCodesNormalized = 0;

  for (const update of finalUpdates) {
    const current = rows.find(
      (row) =>
        row.business_id === update.businessId &&
        row.external_id === update.externalId,
    );
    if (!current) continue;

    const currentDeliveryDate = normalizeIsoDate(current.delivery_date);
    const currentBookingCode = String(current.booking_code ?? "").trim();
    const nextDeliveryDate =
      update.nextDeliveryDate ?? currentDeliveryDate ?? null;
    const nextBookingCode =
      update.nextBookingCode ?? (currentBookingCode || null);

    await prisma.$executeRaw`
      UPDATE bakery_orders
      SET
        delivery_date = ${nextDeliveryDate}::date,
        booking_code = ${nextBookingCode},
        simulations = ${JSON.stringify(update.nextSimulations ?? current.simulations ?? null)}::jsonb,
        updated_at = NOW()
      WHERE business_id = ${update.businessId}
        AND external_id = ${update.externalId}
    `;

    if (update.nextDeliveryDate && !normalizeIsoDate(current.delivery_date)) {
      deliveryDateBackfilled += 1;
      const source =
        update.nextSimulations?.dataFix?.deliveryDateSource ??
        current.simulations?.dataFix?.deliveryDateSource;
      if (source === "created_at" || source === "updated_at") {
        ambiguousTagged += 1;
      }
    }
    if (
      update.nextBookingCode &&
      update.nextBookingCode !== current.booking_code
    ) {
      bookingCodesNormalized += 1;
    }
  }

  const summary = await prisma.$queryRaw`
    SELECT
      COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS active_orders,
      COUNT(*) FILTER (WHERE deleted_at IS NULL AND delivery_date IS NULL)::int AS remaining_null_delivery_date
    FROM bakery_orders
  `;

  const remainingDuplicates = await prisma.$queryRaw`
    SELECT business_id, booking_code, COUNT(*)::int AS duplicate_count
    FROM bakery_orders
    WHERE deleted_at IS NULL AND booking_code IS NOT NULL AND booking_code <> ''
    GROUP BY business_id, booking_code
    HAVING COUNT(*) > 1
    ORDER BY duplicate_count DESC, business_id ASC, booking_code ASC
  `;

  console.log(
    JSON.stringify(
      {
        updatedOrders: finalUpdates.length,
        deliveryDateBackfilled,
        ambiguousTagged,
        bookingCodesNormalized,
        summary,
        remainingDuplicates,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
