# Cuanify

**Bikin bisnis makin cuan.**

Cuanify adalah platform **AI-powered Point of Sale (POS)** dan **inventory dinamis** untuk UMKM/MSME—berperan sebagai _virtual business consultant_ yang membantu bisnis lebih rapi tanpa ribet. Dari catatan penjualan sampai insight yang bikin kamu lebih paham bisnis sendiri, semuanya dibuat simpel dan enak dipakai supaya kamu nggak cuma “jalanin usaha”, tapi juga bisa ngarahin biar makin cuan.

---

## Complete Documentation

- Dokumentasi teknis + operasional lengkap tersedia di `SOP/Cuanify-Complete-Documentation.md`.
- User Journey tersedia di `SOP/Cuanify-User-Journey.md`.

---

## Who Is It For

- Pemilik UMKM (terutama F&B / retail) yang butuh POS cepat + stok rapi
- Tim operasional/kasir yang butuh flow transaksi yang sat-set
- Owner yang ingin kontrol **HPP/COGS** dan keputusan bisnis berbasis data

---

## Problem Solved

- Stok dan bahan baku sering tidak akurat → rawan kebocoran & overstock/stockout
- HPP/COGS susah dihitung real-time → margin tidak terkontrol
- Data transaksi ada tapi insight kurang actionable
- SOP/dokumen bisnis sulit dicari & dipakai operasional harian

---

## Core Features

- **Manajemen Produk & Resep Berbasis AI**
  - Buat produk dari nama atau foto (AI)
  - Auto-generate resep, bahan baku, dan rekomendasi harga jual
  - CRUD produk, kategori, bahan baku
  - Pelacakan inventaris batch **FIFO**
- **Smart POS & Manajemen Inventori Dinamis**
  - POS terintegrasi (Ready Stock & Pre-Order/PO)
  - Potong stok bahan baku otomatis saat transaksi dibayar
  - Hitung **HPP/COGS real-time** berdasarkan resep (ingredients)
- **Analitik Bisnis & Dashboard Berbasis AI**
  - Skor kesehatan bisnis harian
  - Tren penjualan, insight performa produk, alert inventaris
  - Optimasi biaya resep berbasis AI (**Groq**)
- **AI Assistant Berbasis RAG (Dokumen + Data Internal)**
  - Chatbot konsultan bisnis dengan pencarian semantik (vector search)
  - Menjawab pertanyaan berdasarkan transaksi, produk, dan dokumen PDF (SOP, dll)
- **Authentication & Onboarding Bisnis**
  - Login Google OAuth + Email/Password (JWT)
  - Pembuatan profil bisnis dan manajemen sesi

---

## MVP Scope

### In Scope (MVP)

1. **AI Product & Recipe Management** (generate dari nama/foto) + CRUD + FIFO batches
2. **Smart POS** dengan potong stok otomatis + **HPP/COGS real-time**
3. **AI Analytics Dashboard** (health score, tren penjualan, insight, alert inventori) via Groq
4. **RAG AI Assistant** (data internal + PDF business docs)
5. **Auth & onboarding bisnis** (Google OAuth + Email/Password, JWT)

### Out of Scope (Post-MVP)

- Offline-first POS sync
- Multi-outlet enterprise (RBAC kompleks lintas outlet)
- Integrasi akuntansi lengkap & pajak/efaktur
- Omnichannel inventory sync (marketplace) dan loyalty program penuh

---

## System Architecture (High-Level)

```text
+-----------------------------+
|  Web App (Next.js + React)  |
|  UI + POS + Dashboard       |
+--------------+--------------+
               |
               | HTTPS (App Router / API Routes)
               v
+-----------------------------+      +---------------------------+
| App Server (Next.js)        |      | External Services         |
| - Auth (NextAuth/JWT)       |----->| - Groq (LLM Insights)     |
| - POS & Inventory Engine    |      | - ImageKit (images/files) |
| - COGS/HPP FIFO calculator  |      | - Midtrans (payments)     |
| - RAG Orchestrator          |      +---------------------------+
+--------------+--------------+
               |
               | SQL
               v
+-----------------------------+
| PostgreSQL (pg)             |
| - Prisma ORM                |
| - pgvector for embeddings   |
+-----------------------------+
```

---

## Tech Stack

### Frontend

- **Next.js** (scripts: `next dev/build/start`)
- **React**
- **TypeScript**
- **Tailwind CSS**
- UI/UX: `framer-motion`, `lucide-react`, `sonner`, tooltips
- Forms/validation: `react-hook-form`, `@hookform/resolvers`, `zod`
- Charts/analytics UI: `recharts`
- Markdown rendering: `react-markdown`, `remark-gfm`

### Backend (within the Next.js app)

- Auth: `next-auth` + `jsonwebtoken` + `bcryptjs`
- Database: `pg` (PostgreSQL)
- ORM: `prisma` + `@prisma/client` + `@prisma/adapter-pg`
- Email: `nodemailer`
- Payments: `midtrans-client`
- AI/LLM: `groq-sdk`
- RAG/document: `pdf-parse`, `pgvector`
- Utilities: `dotenv`, `xlsx`

### Database

- **PostgreSQL** + **Prisma**
- **pgvector** (embeddings untuk RAG)

### Deployment Platform

- Vercel - [link](https://cuanify-chi.vercel.app/)

### Additional Tools

- **ImageKit** (asset/image management)

---

## Environment Variables

> Jika kamu belum punya `.env.example`, pakai tabel ini sebagai baseline dan sesuaikan nama variabelnya dengan implementasi.

| Variable               | Required | Description                             | Example                                         |
| ---------------------- | -------: | --------------------------------------- | ----------------------------------------------- |
| `NODE_ENV`             |       No | Environment mode                        | `development`                                   |
| `APP_URL`              |      Yes | Base URL aplikasi (untuk callback/auth) | `http://localhost:3000`                         |
| `DATABASE_URL`         |      Yes | Connection string DB utama              | `postgresql://user:pass@localhost:5432/cuanify` |
| `JWT_SECRET`           |      Yes | Secret untuk signing JWT                | `change-me`                                     |
| `GOOGLE_CLIENT_ID`     |     No\* | OAuth Google Client ID                  | `...`                                           |
| `GOOGLE_CLIENT_SECRET` |     No\* | OAuth Google Client Secret              | `...`                                           |
| `GROQ_API_KEY`         |      Yes | API key Groq untuk LLM/insight          | `gsk_...`                                       |
| `VECTOR_DB_URL`        |     No\* | Endpoint vector database                | `http://localhost:6333`                         |
| `VECTOR_DB_API_KEY`    |     No\* | API key vector database (jika managed)  | `...`                                           |
| `STORAGE_BUCKET`       |     No\* | Bucket untuk file/PDF upload            | `cuanify-docs`                                  |
| `STORAGE_ACCESS_KEY`   |     No\* | Credentials storage                     | `...`                                           |
| `STORAGE_SECRET_KEY`   |     No\* | Credentials storage                     | `...`                                           |

\* Tergantung fitur yang kamu aktifkan (OAuth, RAG docs, storage).

---

## Project Structure (Example)

> Berikut contoh struktur yang umum untuk TypeScript SaaS. Akan saya sesuaikan persis dengan repo jika kamu share tree/paths.

```text
UMKM-helper/
├─ src/
│  ├─ app/                 # UI routes/pages (if Next.js) / app modules
│  ├─ modules/
│  │  ├─ auth/
│  │  ├─ pos/
│  │  ├─ inventory/
│  │  ├─ analytics/
│  │  └─ rag/
│  ├─ lib/
│  │  ├─ db/
│  │  ├─ ai/
│  │  └─ utils/
│  └─ types/
├─ public/
├─ docs/
├─ prisma/                 # schema + migrations (if Prisma)
├─ .env.example
├─ package.json
└─ README.md
```

---

## Roadmap

- Multi-outlet + role-based access control yang lebih granular
- Integrasi pembayaran (QRIS/payment gateway) & rekonsiliasi
- Forecasting produksi yang lebih presisi (seasonality + events)
- Advanced alerting (margin drop, shrinkage detection, anomaly sales)
- Omnichannel inventory sync (marketplace/online orders)

---

## Contributors

- **Dimas Budi Nugraha**
- **Halim Ornest Asriandy Putra**
- **Wahid Nurhisyam**

---

## License

**TBD** (mis. MIT / Apache-2.0 / Proprietary)

---

## Contact / Ownership

**TBD** (mis. email, LinkedIn, dsb)
