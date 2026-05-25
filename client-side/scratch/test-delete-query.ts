import prisma from "../lib/prisma";

async function main() {
  try {
    const businessId = 1; // Assuming businessId is 1 for testing
    const deliveryDate = "2026-04-24";
    const INACTIVE_STATUSES = ["Completed", "Delivered", "Cancelled", "Inquiry"];

    console.log("Running tx");
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
          WITH daily_totals AS (
            SELECT delivery_date::date as delivery_date, COALESCE(SUM(token_used), 0) AS total_token_amount
            FROM bakery_orders
            WHERE business_id = ${businessId}
              AND delivery_date = ${deliveryDate}::date
              AND deleted_at IS NULL
              AND order_status NOT IN (${INACTIVE_STATUSES[0]}, ${INACTIVE_STATUSES[1]}, ${INACTIVE_STATUSES[2]}, ${INACTIVE_STATUSES[3]})
            GROUP BY delivery_date::date
          )
          UPDATE production_capacity
          SET
            used_token = COALESCE((SELECT total_token_amount FROM daily_totals LIMIT 1), 0),
            updated_at = NOW()
          WHERE business_id = ${businessId}
            AND date = ${deliveryDate}::date
        `;
    });
    console.log("Success");
  } catch (e) {
    console.error("Error:", e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
