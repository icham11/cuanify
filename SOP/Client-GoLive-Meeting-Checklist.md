# Client Go-Live Meeting Checklist (Crumbella)

Tujuan dokumen ini: memastikan sistem siap dipakai penuh oleh client (bukan lagi mode test/personal account).

## 0) Mapping Peran (3 Tim)

- PM: owner timeline, prioritas, risk log, dan keputusan final jika ada trade-off.
- Tim Crumbella (Client): owner kebutuhan bisnis, SOP operasional, approval UAT/go-live.
- Engineer: owner implementasi teknis, integrasi, quality check, dan release readiness.

Aturan praktis:

- Business decision: diputuskan Client, difasilitasi PM.
- Technical decision: diputuskan Engineer, divalidasi PM terhadap timeline.
- Jika conflict scope vs waktu: PM final call setelah input Client + Engineer.

## 1) Meeting Objective

- Finalisasi ownership akun integrasi (Google, WhatsApp gateway, logistik).
- Finalisasi rule operasional (slot, blocked dates, kapasitas, parser policy).
- Menentukan gate UAT dan tanggal go-live.

## 2) Action Items (Wajib Dibawa Saat Meeting)

| No  | Item                       | Data/Keputusan yang Dibutuhkan                                              | Owner             | Target Date | Status |
| --- | -------------------------- | --------------------------------------------------------------------------- | ----------------- | ----------- | ------ |
| 1   | Google Cloud ownership     | Project production milik client, daftar admin (Owner/Editor), billing aktif | Client + PM       | \_\_\_\_    | ☐      |
| 2   | OAuth app production       | Consent screen, domain, test users -> production users, redirect URI final  | Engineer          | \_\_\_\_    | ☐      |
| 3   | Gmail parser account       | Inbox resmi order marketplace, label/folder standar, policy arsip email     | Client            | \_\_\_\_    | ☐      |
| 4   | Email parser whitelist     | Sender/domain valid Tokopedia/Shopee, subject pattern valid order           | Client + Engineer | \_\_\_\_    | ☐      |
| 5   | Email parser blocklist     | Daftar notifikasi non-order (billing/promo/pinjaman/topup)                  | Client + Engineer | \_\_\_\_    | ☐      |
| 6   | Google Calendar production | Calendar ID final, permission tim produksi, timezone final                  | Client            | \_\_\_\_    | ☐      |
| 7   | WhatsApp gateway           | Nomor pengirim, group target produksi, template message yang disetujui      | Client + Engineer | \_\_\_\_    | ☐      |
| 8   | Google Sheets finance      | Spreadsheet ID production, struktur kolom final, akses owner                | Client + Engineer | \_\_\_\_    | ☐      |
| 9   | Shipping integration       | Provider live (Biteship/JNE/Paxel), API key production, fallback policy     | Client + Engineer | \_\_\_\_    | ☐      |
| 10  | Slot & capacity            | Limit per jam, kapasitas per kategori, beda weekday/weekend (jika ada)      | Client            | \_\_\_\_    | ☐      |
| 11  | Blocked dates              | Hari libur/buka khusus (minimal 6-12 bulan)                                 | Client            | \_\_\_\_    | ☐      |
| 12  | Payment policy             | DP %, deadline pelunasan H-5, refund/cancellation rule final                | Client + PM       | \_\_\_\_    | ☐      |
| 13  | Label/resi format          | Format print label final (thermal/paper), field wajib, ukuran kertas        | Client + Engineer | \_\_\_\_    | ☐      |
| 14  | User & role matrix         | Daftar user Admin/Owner/Production + scope akses                            | Client + PM       | \_\_\_\_    | ☐      |
| 15  | Data persistence plan      | Keputusan migrasi dari browser local storage ke database terpusat           | PM + Engineer     | \_\_\_\_    | ☐      |
| 16  | Backup & audit             | Backup schedule, restore SOP, audit trail requirement                       | Engineer + PM     | \_\_\_\_    | ☐      |

## 3) UAT Sign-Off Matrix

| Scenario                | Pass Criteria                                       | PIC Client | PIC Engineer | Status |
| ----------------------- | --------------------------------------------------- | ---------- | ------------ | ------ |
| New booking manual      | Harga, DP, slot, status tersimpan benar             | \_\_\_\_   | \_\_\_\_     | ☐      |
| Parse WhatsApp          | Draft order terbentuk, field penting terbaca        | \_\_\_\_   | \_\_\_\_     | ☐      |
| Parse email marketplace | Email order valid terambil, non-order terfilter     | \_\_\_\_   | \_\_\_\_     | ☐      |
| Approve order           | Booking code/resi generate, status Confirmed        | \_\_\_\_   | \_\_\_\_     | ☐      |
| Automation WA produksi  | Pesan masuk ke target group sesuai template         | \_\_\_\_   | \_\_\_\_     | ☐      |
| Calendar sync           | Event terbuat/ter-update dengan tanggal & jam benar | \_\_\_\_   | \_\_\_\_     | ☐      |
| Reschedule flow         | Update slot + notifikasi + calendar update          | \_\_\_\_   | \_\_\_\_     | ☐      |
| Print label/resi        | Output sesuai format operasional                    | \_\_\_\_   | \_\_\_\_     | ☐      |
| Owner report export     | CSV/XLS berisi kolom finansial yang disepakati      | \_\_\_\_   | \_\_\_\_     | ☐      |

Catatan eksekusi UAT:

- PM hadir sebagai observer dan mencatat blocker, tetapi approval hasil test tetap dari Client.
- Jika ada bug severity tinggi, Engineer berhak menahan go-live sampai fix tervalidasi.

## 4) Go-Live Gate (Semua Harus True)

- [ ] Semua credential production sudah di akun milik client.
- [ ] Semua integrasi kritikal lulus UAT (WA, Calendar, Email parser, Export).
- [ ] Role & akses user sudah diverifikasi.
- [ ] SOP operasional harian sudah disetujui client.
- [ ] Rencana rollback + support window pasca go-live sudah disepakati.

## 5) Meeting Output yang Harus Keluar

- Tanggal go-live target.
- Daftar blocker + owner + deadline.
- Daftar scope pasca go-live (phase berikutnya).
- PIC final dari pihak client untuk approval harian + backup PIC.
