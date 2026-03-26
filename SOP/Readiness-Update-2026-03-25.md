# Readiness Update - 2026-03-25

## Test Commands Executed

- `npm run check:ready:sandbox`
- `npm run check:ready:prod`

## Result Summary

- Sandbox readiness: Failed
- Production readiness: Failed

## Sandbox Blocking Items

- `GOOGLE_CALENDAR_OAUTH_REDIRECT_URI` missing

## Production Blocking Items

- `NODE_ENV` missing
- `GOOGLE_CALENDAR_OAUTH_REDIRECT_URI` missing
- `NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION` missing
- `MIDTRANS_IS_PRODUCTION` is not `true`

## Non-Blocking Warnings (Both Targets)

- `NEXT_PUBLIC_BAKERY_BLOCKED_DATES` empty
- `GOOGLE_SHEETS_ID` empty

## Remaining Execution Items Before Production

1. Fill `GOOGLE_CALENDAR_OAUTH_REDIRECT_URI` with final deployed callback URL.
2. Set production runtime flags:
   - `NODE_ENV=production`
   - `MIDTRANS_IS_PRODUCTION=true`
   - `NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION=true`
3. Fill operation-critical config:
   - `NEXT_PUBLIC_BAKERY_BLOCKED_DATES`
   - `GOOGLE_SHEETS_ID`
4. Re-run checks until pass:
   - `npm run check:ready:sandbox`
   - `npm run check:ready:prod`
5. Continue UAT smoke flow after env pass:
   - login -> new booking -> approve -> WA -> calendar -> sheets export

## Draft PM Update (Ready to Send)

Pak, update progress hari ini:

- Saya sudah eksekusi readiness check sandbox dan production.
- Hasil saat ini: masih ada beberapa blocker env sebelum switch production.

Blocker yang tersisa:

- `GOOGLE_CALENDAR_OAUTH_REDIRECT_URI`
- `NODE_ENV` (production)
- `NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION`
- `MIDTRANS_IS_PRODUCTION` harus `true`

Warning operasional:

- `NEXT_PUBLIC_BAKERY_BLOCKED_DATES` masih kosong
- `GOOGLE_SHEETS_ID` masih kosong

Setelah item di atas dilengkapi, saya langsung re-run check dan lanjutkan smoke UAT end-to-end lalu kirim rekap final untuk keputusan switch production.
