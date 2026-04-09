# Calendar Token-Based Refactor - Implementation TODO

## Steps

- [ ] 1. Create `client-side/lib/calendar/getCalendarStatus.ts` — Pure utility function
- [ ] 2. Create `client-side/hooks/useCalendarCapacity.ts` — Custom hook for fetching capacity data
- [ ] 3. Create `client-side/components/calendar/CalendarCell.tsx` — Calendar cell component
- [ ] 4. Refactor `client-side/app/(dashboard)/bakery/calendar/page.tsx` — Remove old logic, integrate token system

## Adjustments Confirmed
- Token system is the ONLY source of truth
- Priority: FULL → CUTOFF → WARNING → AVAILABLE
- BAKERY_BLOCKED_DATES NOT used for calendar blocking
- Missing capacity data defaults: usedToken=0, maxToken=500
- Local date handling (YYYY-MM-DD), no timezone shift
- Disable interaction for FULL and CUTOFF
- UI shows token usage clearly (e.g., "480 / 500")
