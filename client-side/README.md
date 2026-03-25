This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Booking Automation Env

Untuk fitur end-to-end booking flow (WhatsApp produksi, Google Calendar, Google Sheets), tambahkan env berikut di `.env`:

```bash
# WhatsApp (Fonnte)
FONNTE_TOKEN=
# Bisa nomor (62812xxxx) atau group id (...@g.us)
FONNTE_PRODUCTION_TARGET=
FONNTE_SEND_PRODUCTION_ON_CREATE=true
FONNTE_SEND_CUSTOMER_ON_CONFIRM=false
FONNTE_NOTIFY_RESCHEDULE_PRODUCTION=true

# Google Service Account
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=\"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n\"

# Google Calendar
GOOGLE_CALENDAR_ID=

# Google Sheets
GOOGLE_SHEETS_ID=
GOOGLE_SHEETS_RANGE=Orders!A:Z

# Shipping (JNE/Paxel via Biteship, optional)
BITESHIP_API_KEY=
SHIPPING_ORIGIN_ADDRESS=
SHIPPING_ORIGIN_POSTAL_CODE=
SHIPPING_ORIGIN_LATITUDE=
SHIPPING_ORIGIN_LONGITUDE=
SHIPPING_ORIGIN_CONTACT_NAME=
SHIPPING_ORIGIN_CONTACT_PHONE=
SHIPPING_ORIGIN_CONTACT_EMAIL=

# Bakery Booking UI Config (opsional)
# Default 50 jika tidak diisi
NEXT_PUBLIC_BAKERY_DOWN_PAYMENT_PERCENT=50
# Format: YYYY-MM-DD dipisah koma
NEXT_PUBLIC_BAKERY_BLOCKED_DATES=2026-03-31,2026-04-18
```

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
