# Admin Visual Regression Guide

Tanggal update: 2026-04-12
Tujuan: membekukan baseline visual dan mendeteksi pergeseran UI secara otomatis.

## Prasyarat

- Dependencies sudah terpasang: `npm install`
- Browser Playwright Chromium: `npm run visual:install`
- Untuk halaman protected, isi env berikut:
  - `VISUAL_TEST_EMAIL`
  - `VISUAL_TEST_PASSWORD`

Contoh file env: [.env.visual.example](.env.visual.example)

## Scope Baseline

Baseline screenshot dibuat untuk:

- `/login`
- `/dashboard`
- `/bakery/calendar`
- `/bakery/production`

Semua route difoto untuk 2 device profile:

- desktop-chromium
- mobile-chromium

## Perintah Utama

- Generate atau refresh baseline:
  - `npm run visual:baseline`
- Jalankan regression compare terhadap baseline:
  - `npm run visual:test`
- Lihat report HTML:
  - `npm run visual:report`

## Catatan Auth

- Jika env login tidak diisi, route protected akan di-skip otomatis.
- Untuk freeze baseline final release, wajib jalankan dengan akun owner/staff yang punya business aktif.

## Lokasi Artefak

- Test spec: [tests/visual/admin-baseline.spec.ts](tests/visual/admin-baseline.spec.ts)
- Baseline snapshots: folder `tests/visual/admin-baseline.spec.ts-snapshots/`
- HTML report: folder `playwright-report/` (ignored oleh git)

## Rekomendasi Workflow Release

1. Jalankan `npm run visual:baseline` saat redesign selesai.
2. Commit snapshot baseline bersama perubahan UI.
3. Pada PR berikutnya, jalankan `npm run visual:test`.
4. Jika diff valid (perubahan memang disengaja), refresh baseline lalu commit lagi.
