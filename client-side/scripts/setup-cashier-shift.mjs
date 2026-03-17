import 'dotenv/config';
import pkg from 'pg';

const { Client } = pkg;
const connString = process.env.DIRECT_URL || process.env.DATABASE_URL;
console.log('DB URL found:', !!connString);

const client = new Client({
  connectionString: connString,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  await client.connect();
  console.log('Connected!');

  await client.query(`
    DO $$ BEGIN
      CREATE TYPE "ShiftStatus" AS ENUM ('Open', 'Closed');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);
  console.log('ShiftStatus enum OK');

  await client.query(`
    CREATE TABLE IF NOT EXISTS "CashierShift" (
      id SERIAL PRIMARY KEY,
      "businessId" INT NOT NULL REFERENCES "Business"(id) ON DELETE CASCADE,
      "userId" INT NOT NULL REFERENCES "User"(id),
      "closedByUserId" INT REFERENCES "User"(id),
      status "ShiftStatus" NOT NULL DEFAULT 'Open',
      "openingCash" DECIMAL(14,2) NOT NULL,
      "expectedCash" DECIMAL(14,2),
      "actualCash" DECIMAL(14,2),
      discrepancy DECIMAL(14,2),
      "cashSalesTotal" DECIMAL(14,2),
      "qrisSalesTotal" DECIMAL(14,2),
      "transferSalesTotal" DECIMAL(14,2),
      "digitalSalesTotal" DECIMAL(14,2),
      "kasbonTotal" DECIMAL(14,2),
      "totalRevenue" DECIMAL(14,2),
      "transactionCount" INT,
      notes TEXT,
      "openedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "closedAt" TIMESTAMP,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  console.log('CashierShift table OK');

  await client.query(`ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "cashierShiftId" INT REFERENCES "CashierShift"(id) ON DELETE SET NULL`);
  console.log('cashierShiftId column OK');

  await client.query(`CREATE INDEX IF NOT EXISTS "CashierShift_businessId_status_idx" ON "CashierShift" ("businessId", status)`);
  await client.query(`CREATE INDEX IF NOT EXISTS "CashierShift_businessId_openedAt_idx" ON "CashierShift" ("businessId", "openedAt" DESC)`);
  await client.query(`CREATE INDEX IF NOT EXISTS "CashierShift_userId_idx" ON "CashierShift" ("userId")`);
  await client.query(`CREATE INDEX IF NOT EXISTS "Sale_cashierShiftId_idx" ON "Sale" ("cashierShiftId")`);
  console.log('Indexes OK');

  await client.end();
  console.log('Done!');
}

run().catch(e => { console.error(e); process.exit(1); });

