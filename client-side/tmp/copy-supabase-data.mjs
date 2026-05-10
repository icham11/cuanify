import "dotenv/config";
import { Client } from "pg";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const sourceUrl = process.env.SOURCE_DATABASE_URL;
const targetUrl = process.env.DATABASE_URL;

if (!sourceUrl) {
  throw new Error("SOURCE_DATABASE_URL is required.");
}

if (!targetUrl) {
  throw new Error("DATABASE_URL is required.");
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function qualifiedTable(tableName) {
  return `public.${quoteIdentifier(tableName)}`;
}

function normalizeValue(column, value) {
  if (value == null) return value;

  if (column.dataType === "json" || column.dataType === "jsonb") {
    return JSON.stringify(value);
  }

  return value;
}

function buildInsertPlaceholders(rows, columns) {
  const values = [];
  const placeholders = rows.map((row) => {
    const rowPlaceholders = columns.map((column) => {
      values.push(normalizeValue(column, row[column.name]));
      return `$${values.length}`;
    });
    return `(${rowPlaceholders.join(", ")})`;
  });

  return {
    values,
    sql: placeholders.join(", "),
  };
}

async function createClient(connectionString) {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  return client;
}

async function ensureBakeryAttendanceTable(target) {
  await target.query(`
    CREATE TABLE IF NOT EXISTS bakery_attendance (
      id BIGSERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      attendance_date DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'present',
      check_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      notes TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (business_id, user_id, attendance_date)
    );
  `);

  await target.query(`
    CREATE INDEX IF NOT EXISTS idx_bakery_attendance_business_month
    ON bakery_attendance (business_id, attendance_date);
  `);
}

async function listTables(client) {
  const result = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  return result.rows.map((row) => row.table_name);
}

async function loadColumns(client, tableName) {
  const result = await client.query(
    `
      SELECT column_name, ordinal_position, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position
    `,
    [tableName],
  );

  return result.rows.map((row) => ({
    name: row.column_name,
    dataType: row.data_type,
  }));
}

async function loadPrimaryKeyColumns(client, tableName) {
  const result = await client.query(
    `
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
       AND tc.table_name = kcu.table_name
      WHERE tc.table_schema = 'public'
        AND tc.table_name = $1
        AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY kcu.ordinal_position
    `,
    [tableName],
  );

  return result.rows.map((row) => row.column_name);
}

async function loadForeignKeyEdges(client, tables) {
  const result = await client.query(
    `
      SELECT tc.table_name AS child_table, ccu.table_name AS parent_table
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
       AND tc.table_schema = ccu.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.constraint_type = 'FOREIGN KEY'
    `,
  );

  const tableSet = new Set(tables);
  return result.rows.filter(
    (row) =>
      tableSet.has(row.child_table) &&
      tableSet.has(row.parent_table) &&
      row.child_table !== row.parent_table,
  );
}

function topoSortTables(tables, edges) {
  const incoming = new Map(tables.map((table) => [table, new Set()]));
  const outgoing = new Map(tables.map((table) => [table, new Set()]));

  for (const edge of edges) {
    incoming.get(edge.child_table)?.add(edge.parent_table);
    outgoing.get(edge.parent_table)?.add(edge.child_table);
  }

  const ready = tables.filter((table) => incoming.get(table)?.size === 0).sort();
  const ordered = [];

  while (ready.length > 0) {
    const table = ready.shift();
    ordered.push(table);

    for (const child of outgoing.get(table) ?? []) {
      const parents = incoming.get(child);
      parents?.delete(table);
      if (parents?.size === 0) {
        ready.push(child);
        ready.sort();
      }
    }
  }

  if (ordered.length === tables.length) {
    return ordered;
  }

  const remaining = tables.filter((table) => !ordered.includes(table)).sort();
  return [...ordered, ...remaining];
}

async function tableRowCount(client, tableName) {
  const result = await client.query(
    `SELECT COUNT(*)::bigint AS count FROM ${qualifiedTable(tableName)}`,
  );
  return Number(result.rows[0].count);
}

async function verifyTargetIsEmpty(target, tables) {
  const nonEmpty = [];

  for (const table of tables) {
    const count = await tableRowCount(target, table);
    if (count > 0) {
      nonEmpty.push(`${table}=${count}`);
    }
  }

  if (nonEmpty.length > 0) {
    throw new Error(
      `Target database is not empty for application tables: ${nonEmpty.join(", ")}`,
    );
  }
}

async function resetTargetTables(target, tables) {
  if (tables.length === 0) return;

  await target.query(
    `TRUNCATE TABLE ${tables.map(qualifiedTable).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

async function fetchRows(source, tableName, columns, primaryKeyColumns) {
  const orderBy =
    primaryKeyColumns.length > 0
      ? ` ORDER BY ${primaryKeyColumns.map(quoteIdentifier).join(", ")}`
      : "";
  const sql = `SELECT ${columns.map((column) => quoteIdentifier(column.name)).join(", ")} FROM ${qualifiedTable(
    tableName,
  )}${orderBy}`;
  const result = await source.query(sql);
  return result.rows;
}

async function copyTable(source, target, tableName) {
  const [sourceColumns, targetColumns, primaryKeyColumns] = await Promise.all([
    loadColumns(source, tableName),
    loadColumns(target, tableName),
    loadPrimaryKeyColumns(source, tableName),
  ]);

  const targetColumnSet = new Set(targetColumns.map((column) => column.name));
  const commonColumns = sourceColumns.filter((column) => targetColumnSet.has(column.name));

  if (commonColumns.length === 0) {
    console.log(`skip ${tableName}: no common columns`);
    return;
  }

  const sourceCount = await tableRowCount(source, tableName);
  if (sourceCount === 0) {
    console.log(`copy ${tableName}: 0 rows`);
    return;
  }

  const rows = await fetchRows(source, tableName, commonColumns, primaryKeyColumns);
  const batchSize = 250;
  const columnList = commonColumns.map((column) => quoteIdentifier(column.name)).join(", ");

  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const { values, sql } = buildInsertPlaceholders(batch, commonColumns);
    await target.query(
      `INSERT INTO ${qualifiedTable(tableName)} (${columnList}) VALUES ${sql}`,
      values,
    );
  }

  console.log(`copy ${tableName}: ${rows.length} rows`);
}

async function syncSequences(target, tables) {
  const result = await target.query(
    `
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_default LIKE 'nextval(%'
      ORDER BY table_name, column_name
    `,
  );

  const tableSet = new Set(tables);
  for (const row of result.rows) {
    if (!tableSet.has(row.table_name)) continue;

    const maxResult = await target.query(
      `SELECT MAX(${quoteIdentifier(row.column_name)}) AS max_value FROM ${qualifiedTable(
        row.table_name,
      )}`,
    );
    const maxValue = maxResult.rows[0]?.max_value;
    if (maxValue == null) continue;

    const sequence = await target.query(
      `SELECT pg_get_serial_sequence($1, $2) AS sequence_name`,
      [qualifiedTable(row.table_name), row.column_name],
    );
    const sequenceName = sequence.rows[0]?.sequence_name;
    if (!sequenceName) continue;

    await target.query(
      `SELECT setval($1, $2::bigint, true)`,
      [sequenceName, Number(maxValue)],
    );
  }
}

async function verifyCounts(source, target, tables) {
  const mismatches = [];

  for (const table of tables) {
    const [sourceCount, targetCount] = await Promise.all([
      tableRowCount(source, table),
      tableRowCount(target, table),
    ]);

    if (sourceCount !== targetCount) {
      mismatches.push(`${table}: source=${sourceCount}, target=${targetCount}`);
    }
  }

  if (mismatches.length > 0) {
    throw new Error(`Row count mismatch detected: ${mismatches.join("; ")}`);
  }
}

const source = await createClient(sourceUrl);
const target = await createClient(targetUrl);

try {
  await ensureBakeryAttendanceTable(target);

  const sourceTables = (await listTables(source)).filter(
    (table) => table !== "_prisma_migrations",
  );
  const targetTables = (await listTables(target)).filter(
    (table) => table !== "_prisma_migrations",
  );

  const missingOnTarget = sourceTables.filter((table) => !targetTables.includes(table));
  if (missingOnTarget.length > 0) {
    throw new Error(`Missing tables on target: ${missingOnTarget.join(", ")}`);
  }

  if (process.env.FINALIZE_ONLY !== "1") {
    if (process.env.RESET_TARGET === "1") {
      await resetTargetTables(target, sourceTables);
    } else {
      await verifyTargetIsEmpty(target, sourceTables);
    }

    const orderedTables = topoSortTables(
      sourceTables,
      await loadForeignKeyEdges(target, sourceTables),
    );

    console.log(`table order: ${orderedTables.join(", ")}`);

    for (const tableName of orderedTables) {
      await copyTable(source, target, tableName);
    }
  }

  await syncSequences(target, sourceTables);
  await verifyCounts(source, target, sourceTables);
  console.log("data copy complete");
} finally {
  await Promise.all([source.end(), target.end()]);
}
