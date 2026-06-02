import { normalizeDateInput } from './lib/helpers/date-normalization';
import prisma from './lib/prisma';
import { getCapacityForDate } from './lib/bookings/token-capacity-service';

async function main() {
  const cap = await getCapacityForDate(36, '2026-06-02');
  console.log('API getCapacityForDate returns:', cap);
}

main().catch(console.error);
