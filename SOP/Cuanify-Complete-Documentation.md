# Crumbella Complete Documentation

Dokumen ini adalah referensi teknis dan operasional lengkap untuk aplikasi Crumbella (frontend, backend API, database, integrasi eksternal, deployment, dan runbook).

Dokumen pendamping:

- User Journey: `SOP/Crumbella-User-Journey.md`

## 1. Ringkasan Produk

Crumbella adalah platform POS + inventory + analytics berbasis AI untuk UMKM (terutama F&B/bakery/retail). Aplikasi menyediakan:

- Pencatatan transaksi dan kasir shift.
- Manajemen produk, kategori, bahan baku, resep, dan stok.
- Analitik bisnis, forecasting, dan insight AI.
- Flow bakery booking end-to-end (order, shipping quote/resi, automasi WhatsApp/Google Calendar/Sheets).
- Integrasi pembayaran (Midtrans dan Xendit).
- Asisten AI dengan RAG berbasis dokumen dan data bisnis internal.

## 2. Arsitektur Sistem

### 2.1 Arsitektur High-Level

- Frontend dan backend berada dalam satu aplikasi Next.js (App Router).
- API routes berada pada `client-side/app/api/**`.
- Data utama disimpan di PostgreSQL via Prisma.
- Embedding RAG menggunakan pgvector (`vector` extension).
- Integrasi eksternal dipanggil dari server-side route/service.

### 2.2 Komponen Utama

- UI/SSR/Server Actions: Next.js 16 + React 19.
- API Layer: Next.js Route Handler.
- ORM/DB: Prisma + `@prisma/adapter-pg` + pool PG.
- Auth: NextAuth JWT + custom JWT fallback.
- AI: Groq (dan dukungan env Gemini).
- Integrasi: Fonnte, Google Calendar, Google Sheets, Biteship, Midtrans, Xendit, ImageKit.

## 3. Tech Stack

### 3.1 Frontend

- Next.js 16
- React 19
- TypeScript 5
- Tailwind CSS 4
- react-hook-form + zod
- recharts, framer-motion, sonner, lucide-react

### 3.2 Backend

- Next.js API Routes
- Prisma 7 + `@prisma/client`
- PostgreSQL (`pg`)
- next-auth, jsonwebtoken, bcryptjs
- nodemailer
- groq-sdk

### 3.3 Data dan AI

- PostgreSQL + pgvector
- pdf-parse untuk ekstraksi dokumen

## 4. Struktur Proyek

### 4.1 Workspace

- `README.md`: profil produk global.
- `client-side/`: aplikasi utama Next.js.
- `data/`: data seed/reference JSON.
- `SOP/`: dokumen operasional/go-live.

### 4.2 Struktur App Utama (`client-side`)

- `app/`: page/layout/error + API routes.
- `components/`: komponen UI domain.
- `context/`: context provider aplikasi.
- `lib/`: domain service/helper/integrasi.
- `prisma/`: schema + migrations.
- `scripts/`: utilitas setup, readiness, seed, smoke test.
- `public/`: static assets + PWA manifest/SW.

## 5. Domain Fitur dan Modul

### 5.1 Authentication & Authorization

- Endpoint auth ada di `app/api/auth/**`.
- Resolusi user menggunakan:
  - NextAuth JWT (`next-auth/jwt`).
  - Fallback custom JWT (`token` cookie / Bearer).
- Resolusi business aktif:
  - Prioritas cookie `active_business_id`.
  - Fallback ke business owner pertama.
  - Fallback membership kasir (`BusinessMember`).

### 5.2 POS, Inventory, Recipe, Production

- Produk, kategori, bahan baku, dan recipe terhubung dengan transaksi sales.
- Movement stok mengikuti flow restock/consume/sale.
- Produksi dan batch tersedia untuk kebutuhan manufaktur ringan bakery/F&B.

### 5.3 Analytics dan Forecasting

- API analytics berada pada `app/api/analytics/**`.
- Tersedia dashboard metrik, growth, health, hourly/daily/monthly, top products, waste, forecasting.
- Ada endpoint cached untuk optimasi response tertentu.

### 5.4 Debts (Kasbon/Piutang)

- Manajemen hutang pelanggan dan pembayaran cicilan.
- Endpoint ada di `app/api/debts/**`.

### 5.5 Bakery Booking & Automations

- Domain file utama: `lib/bookings/**`, `components/bakery/**`, `app/api/bookings/**`.
- Fitur utama:
  - Parse order dari chat/image WhatsApp.
  - Kalkulasi harga, add-on, DP, slot delivery.
  - Rule pengiriman (termasuk item tertentu GrabCar only).
  - Quote shipping + pembuatan resi via Biteship.
  - Persist order via API `bookings/orders`.
  - Automasi notifikasi WhatsApp produksi/customer.
  - Integrasi Google Calendar dan Google Sheets.

### 5.6 AI Assistant (RAG)

- Endpoint AI ada di `app/api/ai/**`.
- Subdomain:
  - Chat sessions.
  - RAG index/upload/search/documents.
  - Insight generation.

## 6. Database Model (Ringkas)

Skema utama ada di `client-side/prisma/schema.prisma`.

### 6.1 Entitas Core

- `User`
- `Business`
- `BusinessMember` (RBAC Owner/Cashier)

### 6.2 Entitas Operasional

- `Product`, `Category`, `Ingredient`
- `Sale` dan detail turunan
- `StockDocument`, inventory movements
- `CashierShift`
- `Debt`, `DebtPayment`

### 6.3 Entitas AI/RAG

- `BusinessDocument` (content, metadata, embedding vector)
- `ChatSession`, `ChatMessage`

### 6.4 Catatan Khusus Bakery Orders

- Persist order bakery menggunakan tabel khusus row-based (`bakery_orders`, `bakery_order_items`, `bakery_order_addresses`) plus snapshot fallback melalui `BusinessDocument`.
- Pendekatan ini dipakai untuk sinkronisasi cepat UI booking dan resilience fallback.

## 7. API Catalog

### 7.1 AI

- `/api/ai/chat`
- `/api/ai/insights`
- `/api/ai/sessions`
- `/api/ai/rag/documents`
- `/api/ai/rag/index`
- `/api/ai/rag/search`
- `/api/ai/rag/upload`

### 7.2 Analytics

- `/api/analytics/category`
- `/api/analytics/daily`
- `/api/analytics/dashboard`
- `/api/analytics/debts-stats`
- `/api/analytics/forecast`
- `/api/analytics/forecast-cached`
- `/api/analytics/growth`
- `/api/analytics/health`
- `/api/analytics/hourly`
- `/api/analytics/insight`
- `/api/analytics/insights-cached`
- `/api/analytics/last-updated`
- `/api/analytics/monthly`
- `/api/analytics/products`
- `/api/analytics/top-products`
- `/api/analytics/waste`

### 7.3 Auth

- `/api/auth/[...nextauth]`
- `/api/auth/login`
- `/api/auth/logout`
- `/api/auth/me`
- `/api/auth/post-login`
- `/api/auth/profile`
- `/api/auth/profile/password`
- `/api/auth/register`

### 7.4 Bookings

- `/api/bookings/automations`
- `/api/bookings/catalog-config`
- `/api/bookings/orders`
- `/api/bookings/parse-whatsapp`
- `/api/bookings/marketplace-email/latest`
- `/api/bookings/shipping/quote`
- `/api/bookings/shipping/create-resi`
- `/api/bookings/google-calendar/connect`
- `/api/bookings/google-calendar/callback`
- `/api/bookings/google-calendar/status`
- `/api/bookings/google-calendar/events`
- `/api/bookings/google-calendar/disconnect`

### 7.5 Business dan Master Data

- `/api/businesses`
- `/api/businesses/[id]`
- `/api/business-analytics`
- `/api/categories`
- `/api/products`
- `/api/products/[id]`
- `/api/products/[id]/recipe`
- `/api/products/generate/name`
- `/api/products/generate/image`
- `/api/products/generate/recipe-image`
- `/api/products/generate/recommend-price`
- `/api/ingredients`
- `/api/ingredients/[id]`
- `/api/ingredients/[id]/restock`
- `/api/ingredients/[id]/consume`

### 7.6 Sales, Payment, Staff, Operations

- `/api/sales`
- `/api/sales/[saleId]/confirm`
- `/api/sales/[saleId]/invoice`
- `/api/sales/midtrans-token`
- `/api/sales/midtrans-notification`
- `/api/debts`
- `/api/debts/[id]/pay`
- `/api/cashier-shift`
- `/api/cashier-shift/open`
- `/api/cashier-shift/close`
- `/api/cashier-shift/current`
- `/api/staff`
- `/api/staff/register`
- `/api/production`

### 7.7 Support / Utility

- `/api/export/inventory`
- `/api/export/sales`
- `/api/analyze-image`
- `/api/cleanup-images`
- `/api/cron/generate-analytics`
- `/api/mock-business`
- `/api/mock-business/create`
- `/api/mock-ingredients`
- `/api/debug/business/[id]`

## 8. Integrasi Eksternal

### 8.1 WhatsApp (Fonnte)

- Digunakan untuk notifikasi produksi/customer pada flow booking.
- Konfigurasi env:
  - `FONNTE_TOKEN`
  - `FONNTE_PRODUCTION_TARGET`
  - `FONNTE_SEND_PRODUCTION_ON_CREATE`
  - `FONNTE_SEND_CUSTOMER_ON_CONFIRM`
  - `FONNTE_NOTIFY_RESCHEDULE_PRODUCTION`
- Catatan penting:
  - Tetap membutuhkan sender nomor WhatsApp aktif.
  - `FONNTE_PRODUCTION_TARGET` dapat nomor atau group id `...@g.us`.

### 8.2 Google Calendar / Sheets

- Calendar dipakai untuk event jadwal booking.
- Sheets dipakai sinkronisasi order operasional.
- Mendukung OAuth callback + service account fallback sesuai konfigurasi.

### 8.3 Shipping (Biteship)

- Quote ongkir dan create resi.
- Provider aktif saat ini mencakup JNE, J&T, Paxel (tergantung konfigurasi/coverage).

### 8.4 Payment

- Midtrans untuk tokenisasi dan notification payment gateway.
- Xendit untuk flow invoice tambahan.

### 8.5 Media dan AI

- ImageKit untuk asset gambar.
- Groq API untuk insight AI.

## 9. Environment Variables

Sumber acuan utama: `client-side/.env.example`.

### 9.1 Wajib Minimum (Baseline App)

- `NODE_ENV`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `JWT_SECRET`
- `DATABASE_URL`

### 9.2 Booking Automation

- `FONNTE_TOKEN`
- `FONNTE_PRODUCTION_TARGET`
- `GOOGLE_CALENDAR_OAUTH_REDIRECT_URI`
- `GOOGLE_CALENDAR_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `GOOGLE_SHEETS_ID`
- `GOOGLE_SHEETS_RANGE`

### 9.3 Shipping

- `BITESHIP_API_KEY`
- `SHIPPING_ORIGIN_ADDRESS`
- `SHIPPING_ORIGIN_POSTAL_CODE`
- `SHIPPING_ORIGIN_LATITUDE`
- `SHIPPING_ORIGIN_LONGITUDE`
- `SHIPPING_ORIGIN_CONTACT_NAME`
- `SHIPPING_ORIGIN_CONTACT_PHONE`
- `SHIPPING_ORIGIN_CONTACT_EMAIL`

### 9.4 Payment

- Midtrans:
  - `MIDTRANS_SERVER_KEY`
  - `MIDTRANS_CLIENT_KEY`
  - `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY`
  - `MIDTRANS_IS_PRODUCTION`
  - `NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION`
- Xendit:
  - `XENDIT_SECRET_KEY`

### 9.5 AI, Email, Storage, Cron

- `GROQ_API_KEY`, `GEMINI_API_KEY`
- `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USER`, `EMAIL_PASSWORD`, `EMAIL_FROM`
- `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT`
- `CRON_SECRET`, `ENABLE_AUTO_CLEANUP`, `LOG_LEVEL`

### 9.6 Public Bakery Config

- `NEXT_PUBLIC_BAKERY_DOWN_PAYMENT_PERCENT`
- `NEXT_PUBLIC_BAKERY_BLOCKED_DATES`

## 10. Setup Development

Dari folder `client-side`:

1. Install dependency:
   - `npm install`
2. Siapkan env:
   - copy `.env.example` ke `.env`
   - isi variabel minimum
3. Prisma generate + migrate sesuai kebutuhan DB.
4. Jalankan dev server:
   - `npm run dev`

## 11. Build, Deploy, dan Readiness

### 11.1 Build

- `npm run build`

### 11.2 Start Production Mode Lokal

- `npm run start`

### 11.3 Readiness Check

- Sandbox: `npm run check:ready:sandbox`
- Production: `npm run check:ready:prod`

Readiness checker memvalidasi env wajib, mode Midtrans, dan warning operasional (mis. blocked dates dan Google Sheets).

### 11.4 Deploy Vercel

- Build command di `vercel.json`:
  - `npx prisma generate && npx next build --webpack`
- Cron terdaftar:
  - `/api/cron/generate-analytics` pada `0 3 * * *`

## 12. Runbook Operasional

### 12.1 Daily Checks

- Pastikan login/auth normal.
- Cek transaksi POS masuk ke dashboard analytics.
- Cek stok bahan baku berkurang sesuai sales.
- Untuk bakery:
  - Cek blocked dates, slot delivery, quote shipping.
  - Cek automasi WA/Calendar/Sheets berjalan.

### 12.2 Incident Response (Umum)

1. Cek Vercel logs (status code, stack trace).
2. Cek env di Vercel Project Settings.
3. Validasi koneksi DB dan schema/migration.
4. Jalankan smoke script terkait (`test-email`, `xendit:smoke`, dst).
5. Jika perlu, rollback ke deployment stable terakhir.

### 12.3 Kasus Bakery Orders Gagal Persist

Gejala:

- `POST /api/bookings/orders` status 500.

Kemungkinan penyebab:

- Transaction timeout terlalu kecil untuk payload besar.
- Koneksi DB lambat atau lock contention.
- Env DB tidak stabil.

Mitigasi yang sudah diterapkan:

- Timeout interactive transaction diperbesar pada endpoint orders sync.

## 13. Security & Compliance Checklist

- Jangan commit `.env` ke repository publik.
- Rotasi secret jika pernah terekspos (WA token, DB URL, OAuth secret, payment keys).
- Gunakan channel WA resmi/berizin dan opt-in pelanggan.
- Batasi akses endpoint sensitif dengan auth/role check.
- Pastikan webhook payment tervalidasi signature.
- Gunakan principle of least privilege untuk service account Google.

## 14. Script Operasional Penting

- `npm run check:ready:sandbox`
- `npm run check:ready:prod`
- `npm run seed:mock-sales`
- `npm run test:email`
- `npm run xendit:smoke`
- Script utilitas lain ada di folder `client-side/scripts`.

## 15. Known Constraints

- Integrasi WhatsApp outbound tetap membutuhkan sender nomor WA bisnis aktif.
- Beberapa fitur automation bergantung pada konfigurasi env lengkap; jika env kosong, fitur akan skip/fallback.
- Performa endpoint sinkronisasi data besar sensitif terhadap latency DB.

## 16. Rekomendasi Lanjutan

1. Tambahkan dokumentasi OpenAPI/typed contract untuk endpoint prioritas.
2. Tambahkan test integrasi untuk alur booking end-to-end (orders + automations + shipping).
3. Tambahkan observability terstruktur (request id, business id, latency tracing).
4. Buat runbook recovery khusus per integrasi (Midtrans, Fonnte, Biteship, Google API).

---

Dokumen ini harus di-update setiap ada perubahan arsitektur, endpoint kritikal, env, atau flow operasional.
