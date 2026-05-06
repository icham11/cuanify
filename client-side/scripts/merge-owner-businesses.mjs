import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: path.join(process.cwd(), ".env") });

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [rawKey, rawValue] = arg.slice(2).split("=");
    parsed[rawKey] = rawValue === undefined ? "true" : rawValue;
  }
  return parsed;
}

function toInt(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Argumen ${label} harus berupa integer positif.`);
  }
  return parsed;
}

function parseSourceBusinessIds(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("Argumen --sourceBusinessIds wajib diisi.");
  }

  const ids = value
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isInteger(entry) && entry > 0);

  if (!ids.length) {
    throw new Error("Argumen --sourceBusinessIds tidak valid.");
  }

  return Array.from(new Set(ids));
}

function normalizeCategoryName(name) {
  return String(name || "").trim().toLowerCase();
}

function roleRank(role) {
  switch (role) {
    case "Owner":
      return 4;
    case "Admin":
      return 3;
    case "Staff":
      return 2;
    case "Cashier":
      return 1;
    default:
      return 0;
  }
}

function sumNumber(a, b) {
  return Number(a || 0) + Number(b || 0);
}

const TARGET_PREFERRED_DOCUMENT_SOURCE_TYPES = new Set([
  "bakery_settings",
  "bakery_catalog_config",
  "google_calendar_oauth",
  "business",
  "category",
  "bakery_orders_snapshot",
]);

async function queryRows(client, query, params = []) {
  const result = await client.query(query, params);
  return result.rows;
}

async function queryValue(client, query, params = []) {
  const result = await client.query(query, params);
  return result.rows[0];
}

async function collectBusinessSummary(client, businessIds) {
  const rows = await queryRows(
    client,
    `
      select
        b.id,
        b.name,
        b."userId" as "userId",
        coalesce(p.product_count, 0)::int as product_count,
        coalesce(c.category_count, 0)::int as category_count,
        coalesce(s.sale_count, 0)::int as sale_count,
        coalesce(o.order_count, 0)::int as bakery_order_count,
        coalesce(m.member_count, 0)::int as member_count
      from "Business" b
      left join (
        select "businessId", count(*) as product_count
        from "Product"
        group by "businessId"
      ) p on p."businessId" = b.id
      left join (
        select "businessId", count(*) as category_count
        from "Category"
        group by "businessId"
      ) c on c."businessId" = b.id
      left join (
        select "businessId", count(*) as sale_count
        from "Sale"
        group by "businessId"
      ) s on s."businessId" = b.id
      left join (
        select business_id, count(*) as order_count
        from bakery_orders
        group by business_id
      ) o on o.business_id = b.id
      left join (
        select "businessId", count(*) as member_count
        from "BusinessMember"
        group by "businessId"
      ) m on m."businessId" = b.id
      where b.id = any($1::int[])
      order by b.id
    `,
    [businessIds],
  );

  return rows;
}

async function ensureBusinessesOwnedByUser(client, ownerUserId, targetBusinessId, sourceBusinessIds) {
  const allIds = [targetBusinessId, ...sourceBusinessIds];
  const businesses = await queryRows(
    client,
    `
      select id, name, "userId"
      from "Business"
      where id = any($1::int[])
      order by id
    `,
    [allIds],
  );

  if (businesses.length !== allIds.length) {
    const foundIds = new Set(businesses.map((business) => Number(business.id)));
    const missingIds = allIds.filter((id) => !foundIds.has(id));
    throw new Error(`Business tidak ditemukan: ${missingIds.join(", ")}`);
  }

  for (const business of businesses) {
    if (Number(business.userId) !== ownerUserId) {
      throw new Error(
        `Business ${business.id} (${business.name}) tidak dimiliki owner ${ownerUserId}.`,
      );
    }
  }
}

async function mergeBusinessMembers(client, targetBusinessId, sourceBusinessIds) {
  for (const sourceBusinessId of sourceBusinessIds) {
    const sourceMembers = await queryRows(
      client,
      `
        select id, "userId", role, "createdAt"
        from "BusinessMember"
        where "businessId" = $1
        order by "createdAt" asc, id asc
      `,
      [sourceBusinessId],
    );

    for (const member of sourceMembers) {
      const targetMember = await queryValue(
        client,
        `
          select id, role
          from "BusinessMember"
          where "businessId" = $1 and "userId" = $2
          limit 1
        `,
        [targetBusinessId, member.userId],
      );

      if (!targetMember) {
        await client.query(
          `
            update "BusinessMember"
            set "businessId" = $1
            where id = $2
          `,
          [targetBusinessId, member.id],
        );
        continue;
      }

      if (roleRank(member.role) > roleRank(targetMember.role)) {
        await client.query(
          `
            update "BusinessMember"
            set role = $1
            where id = $2
          `,
          [member.role, targetMember.id],
        );
      }

      await client.query(`delete from "BusinessMember" where id = $1`, [member.id]);
    }
  }
}

async function mergeCategories(client, targetBusinessId, sourceBusinessIds) {
  const targetCategories = await queryRows(
    client,
    `
      select id, name
      from "Category"
      where "businessId" = $1
      order by id asc
    `,
    [targetBusinessId],
  );

  const targetCategoryMap = new Map(
    targetCategories.map((category) => [normalizeCategoryName(category.name), Number(category.id)]),
  );

  for (const sourceBusinessId of sourceBusinessIds) {
    const sourceCategories = await queryRows(
      client,
      `
        select id, name
        from "Category"
        where "businessId" = $1
        order by id asc
      `,
      [sourceBusinessId],
    );

    for (const category of sourceCategories) {
      const existingTargetCategoryId = targetCategoryMap.get(
        normalizeCategoryName(category.name),
      );

      if (existingTargetCategoryId) {
        await client.query(
          `
            update "Product"
            set "categoryId" = $1
            where "categoryId" = $2
          `,
          [existingTargetCategoryId, category.id],
        );

        await client.query(`delete from "Category" where id = $1`, [category.id]);
        continue;
      }

      await client.query(
        `
          update "Category"
          set "businessId" = $1
          where id = $2
        `,
        [targetBusinessId, category.id],
      );

      targetCategoryMap.set(normalizeCategoryName(category.name), Number(category.id));
    }
  }
}

async function mergeBusinessMetrics(client, targetBusinessId, sourceBusinessIds) {
  for (const sourceBusinessId of sourceBusinessIds) {
    const sourceRows = await queryRows(
      client,
      `
        select *
        from "BusinessMetrics"
        where "businessId" = $1
        order by date asc, id asc
      `,
      [sourceBusinessId],
    );

    for (const row of sourceRows) {
      const targetRow = await queryValue(
        client,
        `
          select *
          from "BusinessMetrics"
          where "businessId" = $1 and date = $2
          limit 1
        `,
        [targetBusinessId, row.date],
      );

      if (!targetRow) {
        await client.query(
          `update "BusinessMetrics" set "businessId" = $1 where id = $2`,
          [targetBusinessId, row.id],
        );
        continue;
      }

      const totalRevenue = sumNumber(targetRow.totalRevenue, row.totalRevenue);
      const totalCost = sumNumber(targetRow.totalCost, row.totalCost);
      const totalProfit = sumNumber(targetRow.totalProfit, row.totalProfit);
      const marginAvg = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

      await client.query(
        `
          update "BusinessMetrics"
          set "totalRevenue" = $1,
              "totalCost" = $2,
              "totalProfit" = $3,
              "marginAvg" = $4
          where id = $5
        `,
        [totalRevenue, totalCost, totalProfit, marginAvg, targetRow.id],
      );

      await client.query(`delete from "BusinessMetrics" where id = $1`, [row.id]);
    }
  }
}

async function moveOrDropUniqueByDateTable(client, tableName, targetBusinessId, sourceBusinessIds) {
  for (const sourceBusinessId of sourceBusinessIds) {
    const sourceRows = await queryRows(
      client,
      `select id, date from "${tableName}" where "businessId" = $1 order by date asc, id asc`,
      [sourceBusinessId],
    );

    for (const row of sourceRows) {
      const conflict = await queryValue(
        client,
        `select id from "${tableName}" where "businessId" = $1 and date = $2 limit 1`,
        [targetBusinessId, row.date],
      );

      if (conflict) {
        await client.query(`delete from "${tableName}" where id = $1`, [row.id]);
      } else {
        await client.query(
          `update "${tableName}" set "businessId" = $1 where id = $2`,
          [targetBusinessId, row.id],
        );
      }
    }
  }
}

async function moveOrDropUniqueByKeyTable(client, tableName, keyColumn, targetBusinessId, sourceBusinessIds) {
  for (const sourceBusinessId of sourceBusinessIds) {
    const sourceRows = await queryRows(
      client,
      `select id, "${keyColumn}" as merge_key from "${tableName}" where "businessId" = $1 order by id asc`,
      [sourceBusinessId],
    );

    for (const row of sourceRows) {
      const conflict = await queryValue(
        client,
        `select id from "${tableName}" where "businessId" = $1 and "${keyColumn}" = $2 limit 1`,
        [targetBusinessId, row.merge_key],
      );

      if (conflict) {
        await client.query(`delete from "${tableName}" where id = $1`, [row.id]);
      } else {
        await client.query(
          `update "${tableName}" set "businessId" = $1 where id = $2`,
          [targetBusinessId, row.id],
        );
      }
    }
  }
}

async function mergeForecastAccuracy(client, targetBusinessId, sourceBusinessIds) {
  const targetRow = await queryValue(
    client,
    `select id from "ForecastAccuracy" where "businessId" = $1 limit 1`,
    [targetBusinessId],
  );

  for (const sourceBusinessId of sourceBusinessIds) {
    const sourceRows = await queryRows(
      client,
      `select id from "ForecastAccuracy" where "businessId" = $1 order by id asc`,
      [sourceBusinessId],
    );

    for (const row of sourceRows) {
      if (targetRow) {
        await client.query(`delete from "ForecastAccuracy" where id = $1`, [row.id]);
      } else {
        await client.query(
          `update "ForecastAccuracy" set "businessId" = $1 where id = $2`,
          [targetBusinessId, row.id],
        );
      }
    }
  }
}

async function moveBusinessDocuments(client, targetBusinessId, sourceBusinessIds) {
  for (const sourceBusinessId of sourceBusinessIds) {
    await client.query(
      `
        delete from "BusinessDocument"
        where "businessId" = $1
          and "sourceType" = any($2::text[])
      `,
      [sourceBusinessId, Array.from(TARGET_PREFERRED_DOCUMENT_SOURCE_TYPES)],
    );

    await client.query(
      `
        update "BusinessDocument"
        set "businessId" = $1
        where "businessId" = $2
      `,
      [targetBusinessId, sourceBusinessId],
    );
  }
}

async function moveSimpleBusinessIdTables(client, targetBusinessId, sourceBusinessIds) {
  const tableNames = [
    "CashierShift",
    "ChatMessage",
    "ChatSession",
    "Debt",
    "Ingredient",
    "MarketplaceSale",
    "Product",
    "ProductionBatch",
    "Sale",
    "StockDocument",
  ];

  for (const tableName of tableNames) {
    await client.query(
      `
        update "${tableName}"
        set "businessId" = $1
        where "businessId" = any($2::int[])
      `,
      [targetBusinessId, sourceBusinessIds],
    );
  }
}

async function buildUniqueExternalId(client, targetBusinessId, sourceBusinessId, externalId) {
  const base = `legacy-${sourceBusinessId}-${externalId}`;
  let candidate = base;
  let counter = 1;

  while (true) {
    const exists = await queryValue(
      client,
      `
        select 1
        from bakery_orders
        where business_id = $1 and external_id = $2
        limit 1
      `,
      [targetBusinessId, candidate],
    );

    if (!exists) return candidate;
    counter += 1;
    candidate = `${base}-${counter}`;
  }
}

async function renameConflictingBakeryOrders(client, targetBusinessId, sourceBusinessIds) {
  for (const sourceBusinessId of sourceBusinessIds) {
    const conflicts = await queryRows(
      client,
      `
        select s.external_id
        from bakery_orders s
        join bakery_orders t
          on t.business_id = $1
         and t.external_id = s.external_id
        where s.business_id = $2
        order by s.external_id asc
      `,
      [targetBusinessId, sourceBusinessId],
    );

    for (const conflict of conflicts) {
      const nextExternalId = await buildUniqueExternalId(
        client,
        targetBusinessId,
        sourceBusinessId,
        conflict.external_id,
      );

      await client.query(
        `
          update bakery_order_items
          set order_external_id = $1
          where business_id = $2 and order_external_id = $3
        `,
        [nextExternalId, sourceBusinessId, conflict.external_id],
      );

      await client.query(
        `
          update bakery_order_addresses
          set order_external_id = $1
          where business_id = $2 and order_external_id = $3
        `,
        [nextExternalId, sourceBusinessId, conflict.external_id],
      );

      await client.query(
        `
          update bakery_orders
          set external_id = $1
          where business_id = $2 and external_id = $3
        `,
        [nextExternalId, sourceBusinessId, conflict.external_id],
      );
    }
  }
}

async function moveBakeryOrders(client, targetBusinessId, sourceBusinessIds) {
  await renameConflictingBakeryOrders(client, targetBusinessId, sourceBusinessIds);

  await client.query(
    `
      update bakery_order_items
      set business_id = $1
      where business_id = any($2::int[])
    `,
    [targetBusinessId, sourceBusinessIds],
  );

  await client.query(
    `
      update bakery_order_addresses
      set business_id = $1
      where business_id = any($2::int[])
    `,
    [targetBusinessId, sourceBusinessIds],
  );

  await client.query(
    `
      update bakery_orders
      set business_id = $1,
          "businessId" = $1
      where business_id = any($2::int[])
         or "businessId" = any($2::int[])
    `,
    [targetBusinessId, sourceBusinessIds],
  );

  await client.query(
    `
      update bakery_orders
      set "businessId" = $1
      where business_id = $1
        and ("businessId" is distinct from $1)
    `,
    [targetBusinessId],
  );
}

async function moveMonthlyTokenResets(client, targetBusinessId, sourceBusinessIds) {
  for (const sourceBusinessId of sourceBusinessIds) {
    const sourceRows = await queryRows(
      client,
      `
        select *
        from bakery_staff_monthly_token_resets
        where business_id = $1
        order by month_key asc, staff_user_id asc, id asc
      `,
      [sourceBusinessId],
    );

    for (const row of sourceRows) {
      const targetRow = await queryValue(
        client,
        `
          select *
          from bakery_staff_monthly_token_resets
          where business_id = $1 and staff_user_id = $2 and month_key = $3
          limit 1
        `,
        [targetBusinessId, row.staff_user_id, row.month_key],
      );

      if (!targetRow) {
        await client.query(
          `
            update bakery_staff_monthly_token_resets
            set business_id = $1
            where id = $2
          `,
          [targetBusinessId, row.id],
        );
        continue;
      }

      await client.query(
        `
          update bakery_staff_monthly_token_resets
          set baseline_token = greatest(coalesce(baseline_token, 0), $1),
              reset_at = greatest(reset_at, $2),
              updated_at = greatest(updated_at, $3)
          where id = $4
        `,
        [row.baseline_token, row.reset_at, row.updated_at, targetRow.id],
      );

      await client.query(`delete from bakery_staff_monthly_token_resets where id = $1`, [
        row.id,
      ]);
    }
  }
}

async function moveProductionCapacity(client, targetBusinessId, sourceBusinessIds) {
  for (const sourceBusinessId of sourceBusinessIds) {
    const sourceRows = await queryRows(
      client,
      `
        select *
        from production_capacity
        where business_id = $1
        order by date asc, id asc
      `,
      [sourceBusinessId],
    );

    for (const row of sourceRows) {
      const targetRow = await queryValue(
        client,
        `
          select *
          from production_capacity
          where business_id = $1 and date = $2
          limit 1
        `,
        [targetBusinessId, row.date],
      );

      if (!targetRow) {
        await client.query(
          `
            update production_capacity
            set business_id = $1,
                "businessId" = $1
            where id = $2
          `,
          [targetBusinessId, row.id],
        );
        continue;
      }

      await client.query(
        `
          update production_capacity
          set used_token = coalesce(used_token, 0) + $1,
              max_token = greatest(coalesce(max_token, 0), $2),
              "businessId" = $3
          where id = $4
        `,
        [row.used_token, row.max_token, targetBusinessId, targetRow.id],
      );

      await client.query(`delete from production_capacity where id = $1`, [row.id]);
    }
  }

  await client.query(
    `
      update production_capacity
      set "businessId" = $1
      where business_id = $1
        and ("businessId" is distinct from $1)
    `,
    [targetBusinessId],
  );
}

async function moveProductionTasks(client, targetBusinessId, sourceBusinessIds) {
  await client.query(
    `
      update production_tasks
      set "businessId" = $1
      where "businessId" = any($2::int[])
    `,
    [targetBusinessId, sourceBusinessIds],
  );
}

async function deleteSourceBusinesses(client, sourceBusinessIds) {
  await client.query(`delete from "Business" where id = any($1::int[])`, [sourceBusinessIds]);
}

function printSummary(title, rows) {
  console.log(`\n${title}`);
  for (const row of rows) {
    console.log(
      `- business ${row.id} (${row.name}): products=${row.product_count}, categories=${row.category_count}, sales=${row.sale_count}, bakeryOrders=${row.bakery_order_count}, members=${row.member_count}`,
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const ownerUserId = toInt(args.ownerUserId ?? args.userId, "--ownerUserId");
  const targetBusinessId = toInt(args.targetBusinessId, "--targetBusinessId");
  const sourceBusinessIds = parseSourceBusinessIds(args.sourceBusinessIds);
  const execute = args.execute === "true";

  if (sourceBusinessIds.includes(targetBusinessId)) {
    throw new Error("Target business tidak boleh ada di dalam sourceBusinessIds.");
  }

  const rawUrl = process.env.DATABASE_URL ?? "";
  const cleanUrl = rawUrl.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
  const pool = new pg.Pool({
    connectionString: cleanUrl,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();

  try {
    await ensureBusinessesOwnedByUser(
      client,
      ownerUserId,
      targetBusinessId,
      sourceBusinessIds,
    );

    const beforeSummary = await collectBusinessSummary(client, [
      targetBusinessId,
      ...sourceBusinessIds,
    ]);
    printSummary("Ringkasan sebelum merge", beforeSummary);

    if (!execute) {
      console.log(
        "\nDry run selesai. Tambahkan --execute=true untuk benar-benar menjalankan merge.",
      );
      return;
    }

    await client.query("begin");

    await client.query(
      `
        select id
        from "Business"
        where id = any($1::int[])
        order by id
        for update
      `,
      [[targetBusinessId, ...sourceBusinessIds]],
    );

    await mergeBusinessMembers(client, targetBusinessId, sourceBusinessIds);
    await mergeCategories(client, targetBusinessId, sourceBusinessIds);
    await mergeBusinessMetrics(client, targetBusinessId, sourceBusinessIds);
    await moveOrDropUniqueByDateTable(
      client,
      "BusinessForecast",
      targetBusinessId,
      sourceBusinessIds,
    );
    await moveOrDropUniqueByDateTable(
      client,
      "BusinessHealthScores",
      targetBusinessId,
      sourceBusinessIds,
    );
    await moveOrDropUniqueByKeyTable(
      client,
      "AnalyticsInsight",
      "section",
      targetBusinessId,
      sourceBusinessIds,
    );
    await mergeForecastAccuracy(client, targetBusinessId, sourceBusinessIds);
    await moveBusinessDocuments(client, targetBusinessId, sourceBusinessIds);
    await moveSimpleBusinessIdTables(client, targetBusinessId, sourceBusinessIds);
    await moveBakeryOrders(client, targetBusinessId, sourceBusinessIds);
    await moveMonthlyTokenResets(client, targetBusinessId, sourceBusinessIds);
    await moveProductionCapacity(client, targetBusinessId, sourceBusinessIds);
    await moveProductionTasks(client, targetBusinessId, sourceBusinessIds);
    await deleteSourceBusinesses(client, sourceBusinessIds);

    await client.query("commit");

    const afterSummary = await collectBusinessSummary(client, [targetBusinessId]);
    printSummary("Ringkasan setelah merge", afterSummary);
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // noop
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("\nMerge gagal:");
  console.error(error);
  process.exit(1);
});
