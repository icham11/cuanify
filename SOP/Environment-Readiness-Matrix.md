# Environment Readiness Matrix (PM / Client / Engineer)

Tujuan: memastikan konfigurasi environment rapi untuk development, staging, dan production tanpa memakai akun personal.

## 1) Status Definition

- Not Started: belum dibuat/belum diisi.
- In Progress: sudah dibuat, belum tervalidasi end-to-end.
- Ready: key ada dan lolos smoke test.
- Blocked: menunggu pihak lain (akses, billing, approval).

## 2) Ownership Rule

- PM: tracking, deadline, blocker escalation.
- Client: memberikan credential production dan approval bisnis.
- Engineer: implementasi, validasi, dan hardening teknis.

## 3) Env Key Matrix

| Group           | Key                                                         | Dev      | Staging  | Prod     | Owner             | Source of Truth      | Validation Step               | Status      |
| --------------- | ----------------------------------------------------------- | -------- | -------- | -------- | ----------------- | -------------------- | ----------------------------- | ----------- |
| App/Auth        | NEXTAUTH_URL                                                | Required | Required | Required | Engineer          | Deployment env       | Login/session works           | Not Started |
| App/Auth        | NEXTAUTH_SECRET                                             | Required | Required | Required | Engineer          | Secret manager       | Session token valid           | Not Started |
| App/Auth        | JWT_SECRET                                                  | Required | Required | Required | Engineer          | Secret manager       | API auth token verify         | Not Started |
| Database        | DATABASE_URL                                                | Required | Required | Required | Engineer + PM     | Managed DB           | Prisma connect + migration    | Not Started |
| Google OAuth    | GOOGLE_CLIENT_ID                                            | Required | Required | Required | Client + Engineer | Google Cloud         | OAuth connect success         | Not Started |
| Google OAuth    | GOOGLE_CLIENT_SECRET                                        | Required | Required | Required | Client + Engineer | Google Cloud         | OAuth callback success        | Not Started |
| Google OAuth    | GOOGLE_CALENDAR_OAUTH_REDIRECT_URI                          | Optional | Required | Required | Engineer          | Deployment env       | No redirect mismatch          | Not Started |
| Calendar        | GOOGLE_CALENDAR_ID                                          | Optional | Required | Required | Client            | Google Calendar      | Event create/update ok        | Not Started |
| Service Account | GOOGLE_SERVICE_ACCOUNT_EMAIL                                | Optional | Optional | Optional | Engineer          | Google Cloud IAM     | Fallback token works          | Not Started |
| Service Account | GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY                          | Optional | Optional | Optional | Engineer          | Secret manager       | Fallback API call works       | Not Started |
| Sheets          | GOOGLE_SHEETS_ID                                            | Optional | Required | Required | Client + Engineer | Google Sheets        | Append row success            | Not Started |
| Sheets          | GOOGLE_SHEETS_RANGE                                         | Optional | Required | Required | Client + Engineer | Google Sheets        | Data lands in expected tab    | Not Started |
| WhatsApp        | FONNTE_TOKEN                                                | Optional | Required | Required | Client + Engineer | WA gateway dashboard | Send message success          | Not Started |
| WhatsApp        | FONNTE_PRODUCTION_TARGET                                    | Optional | Required | Required | Client            | Ops config           | Group receives message        | Not Started |
| WhatsApp        | FONNTE_SEND_PRODUCTION_ON_CREATE                            | Optional | Optional | Optional | Engineer          | Env config           | Trigger behavior as expected  | Not Started |
| WhatsApp        | FONNTE_SEND_CUSTOMER_ON_CONFIRM                             | Optional | Optional | Optional | Engineer + Client | Env config           | Trigger behavior as expected  | Not Started |
| WhatsApp        | FONNTE_NOTIFY_RESCHEDULE_PRODUCTION                         | Optional | Optional | Optional | Engineer + Client | Env config           | Trigger behavior as expected  | Not Started |
| Bakery Public   | NEXT_PUBLIC_BAKERY_DOWN_PAYMENT_PERCENT                     | Required | Required | Required | Client + PM       | SOP                  | UI calculation correct        | Not Started |
| Bakery Public   | NEXT_PUBLIC_BAKERY_BLOCKED_DATES                            | Required | Required | Required | Client            | SOP                  | Blocked date validation works | Not Started |
| Shipping        | BITESHIP_API_KEY                                            | Optional | Required | Required | Client + Engineer | Biteship dashboard   | Quote/resi success            | Not Started |
| Shipping        | SHIPPING*ORIGIN*\*                                          | Optional | Required | Required | Client            | Ops data             | Shipping quote valid          | Not Started |
| Midtrans        | MIDTRANS_SERVER_KEY                                         | Optional | Optional | Optional | Client + Engineer | Midtrans dashboard   | Token/payment flow ok         | Not Started |
| Midtrans        | NEXT_PUBLIC_MIDTRANS_CLIENT_KEY                             | Optional | Optional | Optional | Client + Engineer | Midtrans dashboard   | Frontend snap init ok         | Not Started |
| Midtrans        | MIDTRANS_IS_PRODUCTION / NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION | Optional | Required | Required | Engineer          | Env config           | Correct mode per env          | Not Started |
| Xendit          | XENDIT_SECRET_KEY                                           | Optional | Optional | Optional | Client + Engineer | Xendit dashboard     | Invoice create success        | Not Started |
| AI              | GROQ_API_KEY                                                | Optional | Optional | Optional | Engineer          | AI provider          | Analyze route works           | Not Started |
| AI              | GEMINI_API_KEY                                              | Optional | Optional | Optional | Engineer          | AI provider          | Embedding route works         | Not Started |
| Email           | EMAIL_HOST/PORT/SECURE                                      | Optional | Optional | Optional | Engineer          | SMTP provider        | Send test email success       | Not Started |
| Email           | EMAIL_USER/EMAIL_PASSWORD/EMAIL_FROM                        | Optional | Optional | Optional | Client + Engineer | SMTP provider        | Invoice email delivered       | Not Started |
| Media           | IMAGEKIT_PUBLIC_KEY                                         | Optional | Optional | Optional | Engineer          | ImageKit dashboard   | Upload works                  | Not Started |
| Media           | IMAGEKIT_PRIVATE_KEY                                        | Optional | Optional | Optional | Engineer          | Secret manager       | Upload signed request works   | Not Started |
| Media           | IMAGEKIT_URL_ENDPOINT                                       | Optional | Optional | Optional | Engineer          | ImageKit dashboard   | URL render works              | Not Started |
| Cron            | CRON_SECRET                                                 | Required | Required | Required | Engineer          | Secret manager       | Cron endpoint auth works      | Not Started |
| Cron            | ENABLE_AUTO_CLEANUP                                         | Optional | Optional | Optional | Engineer          | Env config           | Cleanup trigger as expected   | Not Started |
| Logging         | LOG_LEVEL                                                   | Optional | Optional | Optional | Engineer          | Env config           | Proper log verbosity          | Not Started |

## 4) Meeting Checklist (Execution Order)

1. Confirm owner of each key group (PM/Client/Engineer).
2. Fill production values first for critical path: Auth, DB, Google OAuth, Calendar, Sheets, WhatsApp.
3. Run readiness checker in project root:
   - `npm run check:ready:sandbox`
   - `npm run check:ready:prod`
4. Run smoke test end-to-end: login -> new booking -> approve -> WA -> calendar -> sheets export.
5. Mark status Ready only if evidence link exists.
6. Freeze env changes 24h before go-live except critical fixes.

## 5) Evidence Checklist (Copy During UAT)

- [ ] OAuth connect/callback
      Evidence Link:
      Verified By:
      Date:
- [ ] Gmail marketplace fetch
      Evidence Link:
      Verified By:
      Date:
- [ ] Calendar sync create/update
      Evidence Link:
      Verified By:
      Date:
- [ ] WA production message
      Evidence Link:
      Verified By:
      Date:
- [ ] Sheets append/export
      Evidence Link:
      Verified By:
      Date:
- [ ] Resi generation
      Evidence Link:
      Verified By:
      Date:
