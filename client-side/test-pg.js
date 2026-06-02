const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://neondb_owner:npg_A9njiyBV8HPl@ep-raspy-boat-aqvh6da7.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require' });
async function run() {
  await client.connect();
  const res = await client.query("SELECT count(*) FROM bakery_orders WHERE payment_transactions::text LIKE '%2026-06-01%'");
  console.log('2026-06-01 count:', res.rows[0].count);
  const res2 = await client.query("SELECT count(*) FROM bakery_orders WHERE payment_transactions::text LIKE '%2026-05-31%'");
  console.log('2026-05-31 count:', res2.rows[0].count);
  await client.end();
}
run();
