# Checklist QA Visual Admin (Siap Pakai)

Tanggal update: 2026-04-12
Rilis: ____________________
Tester: ____________________
Branch/Commit: ____________________

## A. Pre-Check

- [ ] App bisa dibuka di desktop dan mobile viewport.
- [ ] Tidak ada error fatal di console pada halaman utama.
- [ ] Asset branding (logo/mascot) tampil normal dan tidak pecah.

## B. Halaman Wajib (Desktop + Mobile)

- [ ] Login: hierarchy rapi, card tidak boxy, CTA utama jelas.
- [ ] Dashboard: header premium, KPI card konsisten radius/border/shadow.
- [ ] Bakery Calendar: toolbar, card, popup, legend konsisten tone warna.
- [ ] Bakery Production: panel utama selaras dengan dashboard/calendar.

## C. Konsistensi Design System

- [ ] Radius komponen sesuai guideline (`xl/2xl/3xl`).
- [ ] Border utama pakai tone `#ffd8b7` atau token turunan.
- [ ] Shadow lembut, tidak terlalu keras/gelap.
- [ ] Tidak ada komponen baru dengan warna ungu/indigo lama.
- [ ] Active/hover/focus state konsisten antar halaman.

## D. Sidebar & Navigasi

- [ ] Sidebar desktop tetap sticky dan punya scroll sendiri.
- [ ] Main content punya scroll sendiri.
- [ ] Tidak ada scrollbar ketiga yang tidak diinginkan.
- [ ] Mobile bottom nav active state terlihat jelas.
- [ ] Mobile drawer sejalan dengan style sidebar desktop.

## E. Aksesibilitas Dasar

- [ ] Fokus keyboard terlihat jelas pada button/link/input.
- [ ] Teks di atas gradient tetap terbaca (kontras memadai).
- [ ] Komponen interaktif penting punya area sentuh yang nyaman di mobile.
- [ ] Jalankan smoke test a11y: `npm run visual:a11y`.

## F. Visual Regression

- [ ] Jalankan baseline: `npm run visual:baseline`.
- [ ] Jalankan compare: `npm run visual:test`.
- [ ] Jika ada diff, validasi: bug visual atau perubahan disengaja.
- [ ] Jika disengaja, update baseline lalu commit snapshot.

## G. Sign-off

- [ ] QA Visual PASS
- [ ] Tidak ada regresi mayor
- [ ] Siap merge

Catatan temuan:

- _________________________________________________
- _________________________________________________
- _________________________________________________
