# Third-Party Pricing and User Journey Demo (Crumbella)

Tanggal: 2026-03-31
Dokumen ini dipakai untuk 2 kebutuhan:
1. Transparansi penggunaan layanan 3rd-party (termasuk skema biaya).
2. Narasi user journey end-to-end saat demo ke client.

## 1) Prinsip Dokumentasi Biaya 3rd-Party

- Semua layanan eksternal wajib dicatat: dipakai atau tidak dipakai.
- Jika dipakai, wajib ada unit biaya (per request, per pesan, per transaksi, per GB, dst).
- Jika belum ada angka final, tulis placeholder dan sumber verifikasi (invoice/dashboard provider).
- Untuk demo sandbox, biaya aktual bisa nol/kecil, tetapi model biaya production tetap harus dijelaskan.

## 2) Matriks 3rd-Party yang Digunakan

| Layanan | Fungsi di Sistem | Status Saat Ini | Trigger Utama | Unit Biaya | Estimasi Biaya per Trigger | Catatan Verifikasi |
| --- | --- | --- | --- | --- | --- | --- |
| Biteship (JNE/Paxel) | Quote ongkir, create shipment/resi | Aktif (Sandbox/Test Key) | Cek ongkir, generate resi | Per request API / per order shipment | ~Rp5/request API (observasi billing: 26 req = Rp130, 65 req = Rp325) | Cek tab API Transactions Biteship + invoice bulanan |
| Fonnte | Notifikasi WhatsApp (produksi/customer) | Aktif | Automasi order create/confirm/reschedule | Per pesan terkirim | ~Rp16,5/pesan, dibulatkan Rp17/pesan (paket Rp165.000/10.000 pesan) | Cek halaman paket/device Fonnte per periode |
| Google Calendar API | Sinkron event produksi/pengiriman | Aktif | Approve order, reschedule | Umumnya kuota API | Rp0/event (selama dalam kuota API) | Cek Google Cloud quota usage |
| Google Sheets API | Sinkron data operasional/finance | Aktif (tergantung env) | Event automasi tertentu | Umumnya kuota API | Rp0/sinkron (selama dalam kuota API) | Cek Google Cloud quota usage |
| ImageKit | Upload/hosting gambar parser/asset | Aktif | Upload image chat/asset | Storage + bandwidth + transform | ~Rp25/upload setara alokasi paket | Cek usage dashboard bulanan |
| Groq / LLM API | Parsing/analisis teks order | Aktif sesuai route AI | Parse dari chat/email | Per request parse | ~Rp300/parse order (asumsi request menengah) | Catat model + rata-rata token/request |
| Gemini API | Embedding/AI support tertentu | Aktif opsional | Fitur AI tertentu | Per token / kuota model | ~Rp150/request (opsional, tergantung fitur aktif) | Cek billing GCP AI |
| Midtrans | Payment gateway | Non-aktif (ditunda) | Checkout payment online | Per transaksi sukses | N/A saat ini | Aktifkan saat flow payment online disetujui client |
| Xendit | Invoice/payment alternatif | Non-aktif (opsional) | Create invoice | Per invoice/transaksi | N/A saat ini | Aktifkan jika disetujui dalam scope |

## 3) Estimasi Pricing Detail (Siap Kirim ke PM/Client)

Asumsi baseline untuk kebutuhan demo (sementara, belum angka invoice final).

| Layanan | Satuan Billing | Harga Satuan | Rata-rata Pemakaian per 1 Order | Perkiraan Biaya per 1 Order | Perkiraan Biaya per 100 Order |
| --- | --- | --- | --- | --- | --- |
| LLM Parser | per request parse | Rp300 | 0.7 request/order | Rp210 | Rp21.000 |
| Biteship Quote | per request | Rp5 | 1.2 request/order | Rp6 | Rp600 |
| Biteship Create Resi | per shipment API call | Rp5 | 0.8 shipment/order | Rp4 | Rp400 |
| Fonnte WA | per pesan | Rp17 | 2 pesan/order | Rp34 | Rp3.400 |
| ImageKit | per upload (alokasi paket) | Rp25 | 0.4 upload/order | Rp10 | Rp1.000 |

Rumus cepat:
- Biaya per order = Harga Satuan x Rata-rata Pemakaian per order
- Biaya per 100 order = Biaya per order x 100

Ringkasan baseline:
- Total estimasi biaya platform eksternal (di luar ongkir kurir dan payment gateway) = **Rp264 per order**.
- Simulasi 100 order = **Rp26.400**.
- Komponen dominan tetap di LLM Parser (`~79,5%` dari total biaya baseline).

## 4) User Journey End-to-End (Untuk Narasi Demo)

### A. Entry Order

1. Admin input order manual atau parse dari WhatsApp/email.
2. Sistem mengisi data customer, item, alamat, jadwal.
3. Admin review dan koreksi data jika perlu.

### B. Shipping Calculation

1. Admin isi alamat + kode pos.
2. Sistem hitung ongkir live dari Biteship (JNE/Paxel).
3. Sistem hitung estimasi jarak origin ke tujuan.
4. Admin pilih service kurir yang paling sesuai.

### C. Booking Creation

1. Booking disimpan dengan item, harga, ongkir, jadwal.
2. Sistem generate booking code.
3. Sistem jalankan automasi sesuai event (jika aktif).

### D. Approval and Fulfillment

1. Admin approve order.
2. Sistem kirim notifikasi WA produksi/customer sesuai policy.
3. Sistem sinkron ke Google Calendar dan/atau Google Sheets.
4. Generate resi pengiriman saat dibutuhkan.

### E. Post-Order Tracking

1. Status order bergerak: Inquiry -> Confirmed -> In Production -> Ready -> Delivered/Completed.
2. Semua perubahan status tercatat di history/log.
3. Data order masuk ke reporting/export.

## 5) Checklist Responsiveness (Titipan Khusus untuk Demo)

Tujuan: client bisa lihat konteks utuh di desktop dan mobile.

- Sidebar/navigation masih terbaca di viewport mobile.
- Form booking (item, address, shipping) tidak overflow horizontal.
- Tabel order memiliki fallback mobile (stack/card) bila kolom banyak.
- Tombol aksi utama (Create Booking, Approve, Generate Resi) tetap terlihat jelas di mobile.
- Komponen penting (price summary, shipping options, status timeline) tidak terpotong di layar kecil.
- Loading/error state tetap informatif di semua breakpoint.

## 6) Scope Demo Malam Ini

- Gunakan data yang mendekati data operasional Crumbella (produk dan kategori).
- Tetap jalankan di sandbox untuk keamanan flow testing.
- Jelaskan batasan saat ini secara jujur:
  - Integrasi payment gateway belum diaktifkan production flow.
  - Angka pricing di dokumen ini masih estimasi baseline dan akan disinkronkan ke invoice/dashboard provider.

## 7) Action Items Setelah Demo

1. Validasi angka estimasi pricing terhadap invoice/dashboard provider.
2. Finalisasi daftar layanan aktif vs non-aktif sesuai keputusan client.
3. Simpan snapshot hasil demo (screen + catatan pertanyaan client).
4. Update dokumen ini sebagai baseline handover ke PM dan client.
