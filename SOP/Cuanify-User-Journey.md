# Crumbella User Journey

Versi visual siap presentasi:

- `SOP/Crumbella-User-Journey-Map-Visual.html`
- `SOP/Crumbella-User-Journey-Map-Visual.pdf`

Dokumen ini menjabarkan alur end-to-end pengguna Crumbella dari onboarding sampai operasi harian dan evaluasi bisnis.

## 1. Tujuan User Journey

- Menyamakan pemahaman lintas tim product, engineering, dan operasional.
- Menjadi acuan prioritas UX, SOP, dan automasi.
- Mengurangi gap antara proses di lapangan dan flow di aplikasi.

## 2. Persona Utama

### 2.1 Owner UMKM

Kebutuhan:

- Setup cepat, tidak ribet teknis.
- Melihat performa bisnis harian dan margin.
- Kontrol stok, kas, dan keputusan pembelian/produksi.

Risiko utama:

- Data tidak lengkap karena setup awal tidak rapi.
- Insight tidak dipakai karena tidak actionable.

### 2.2 Cashier / Admin Operasional

Kebutuhan:

- Proses transaksi cepat dan minim klik.
- Shift kas jelas (opening, closing, selisih).
- Error handling sederhana dan mudah dipahami.

Risiko utama:

- Salah input saat jam ramai.
- Stok tidak sinkron karena transaksi tidak terekam benar.

### 2.3 Admin Bakery / Tim Produksi

Kebutuhan:

- Tangkap order dari WhatsApp dengan cepat.
- Validasi jadwal, kapasitas, metode pengiriman, dan DP.
- Notifikasi otomatis ke tim produksi dan sinkron ke kalender/sheet.

Risiko utama:

- Jadwal bentrok atau order masuk di tanggal libur.
- Detail pesanan hilang saat handover ke produksi.

### 2.4 Customer (Indirect Journey)

Kebutuhan:

- Konfirmasi order cepat.
- Info status pesanan jelas.
- Pengiriman sesuai slot dan ekspektasi.

Risiko utama:

- Miskomunikasi detail order/pengiriman.
- Telat konfirmasi atau notifikasi tidak terkirim.

## 3. Journey Peta Besar

## 3.1 Fase A - Onboarding dan Aktivasi

1. Owner registrasi/login.
2. Owner membuat business profile.
3. Owner mengisi master data awal: kategori, produk, bahan baku, resep.
4. Owner mengatur payment, staff role, dan konfigurasi dasar operasional.
5. Owner menjalankan transaksi/simulasi pertama.

Output fase:

- Toko siap operasional.
- Data inti untuk analitik sudah terbentuk.

## 3.2 Fase B - Operasi Harian POS

1. Cashier membuka shift dengan opening cash.
2. Cashier memproses transaksi penjualan.
3. Sistem mengurangi stok sesuai resep/FIFO.
4. Jika ada kasbon, sistem mencatat debt.
5. Cashier menutup shift dan rekonsiliasi kas.

Output fase:

- Pendapatan dan stok tercatat real-time.
- Selisih kas terdeteksi lebih dini.

## 3.3 Fase C - Operasi Harian Bakery Booking

1. Admin bakery menerima order dari chat/image/pesan manual.
2. Admin parse order ke form booking.
3. Sistem hitung harga, add-on, ongkir/berat, DP, dan validasi slot.
4. Admin menyimpan order.
5. Sistem menjalankan automasi (WA produksi/customer sesuai rule, Calendar, Sheets).
6. Admin monitor status order hingga selesai.

Output fase:

- Order terdokumentasi rapi.
- Risiko miss komunikasi produksi menurun.

## 3.4 Fase D - Monitoring dan Optimasi

1. Owner membuka dashboard analytics.
2. Owner memonitor health score, tren penjualan, top products, waste.
3. Owner memakai insight AI untuk keputusan restock/pricing/produksi.
4. Owner melakukan aksi korektif (ubah harga, ubah stok minimum, promosi).

Output fase:

- Keputusan lebih cepat dan berbasis data.
- Margin dan efisiensi operasional meningkat.

## 4. Detail Journey Per Persona

## 4.1 Owner Journey (E2E)

1. Trigger: ingin digitalisasi pencatatan bisnis.
2. Masuk aplikasi dan setup bisnis.
3. Menambahkan tim (owner/cashier).
4. Menjalankan toko 1-2 minggu sambil memvalidasi data.
5. Menggunakan analytics + AI untuk keputusan.
6. Menstandarkan SOP berdasarkan data aktual.

Momen kritis:

- Hari 1: setup data master.
- Minggu 1: konsistensi input transaksi.
- Minggu 2: keputusan berbasis dashboard.

North-star outcome:

- Owner percaya data aplikasi dan rutin memakainya untuk mengambil keputusan.

## 4.2 Cashier Journey (Shift)

1. Login sebagai cashier.
2. Open shift dengan nominal awal.
3. Input transaksi pelanggan sepanjang hari.
4. Tangani edge case (split payment, kasbon, cancel/confirm).
5. Close shift dan konfirmasi actual cash.
6. Lihat selisih kas dan catatan shift.

Momen kritis:

- Jam ramai: form transaksi harus cepat.
- Tutup kas: validasi selisih harus jelas.

Outcome:

- Proses kasir tetap cepat tanpa mengorbankan akurasi data.

## 4.3 Bakery Ops Journey (Order-to-Fulfillment)

1. Menerima order dari WhatsApp/email/manual.
2. Parse data order ke booking form.
3. Verifikasi item, qty, catatan custom, alamat, slot, dan metode kirim.
4. Cek rule operasional (libur, kapasitas, GrabCar only, berat kirim).
5. Simpan order dan pastikan notifikasi produksi terkirim.
6. Follow-up status: confirmed, in-progress, delivered/finished.

Momen kritis:

- Validasi tanggal libur.
- Ketepatan data handover ke produksi.
- Keberhasilan automasi WA/Calendar/Sheets.

Outcome:

- Error operasional menurun, SLA pengiriman lebih konsisten.

## 4.4 Customer Journey (Indirect)

1. Customer mengirim kebutuhan order.
2. Admin memproses dan mengonfirmasi detail.
3. Customer menerima konfirmasi status.
4. Pesanan diproduksi dan dikirim sesuai jadwal.
5. Customer menerima pesanan dan melakukan pelunasan jika ada sisa.

Outcome:

- Pengalaman order lebih jelas, minim miss komunikasi.

## 5. Pain Points dan Solusi di Produk

1. Pain: data transaksi tercecer.
   Solusi: POS terpusat + sinkron analytics otomatis.
2. Pain: stok tidak akurat.
   Solusi: pemotongan stok berbasis resep/FIFO.
3. Pain: order bakery dari chat sulit distandardisasi.
   Solusi: parser WhatsApp + booking form terstruktur.
4. Pain: notifikasi produksi manual dan mudah lupa.
   Solusi: automasi WA/Calendar/Sheets.
5. Pain: keputusan owner berdasarkan feeling.
   Solusi: dashboard metrik + insight AI.

## 6. Unhappy Path dan Recovery

1. WA automasi gagal kirim.
   Recovery: tampilkan status gagal + retry manual + fallback kanal lain.
2. Shipping quote gagal.
   Recovery: simpan order dulu, retry quote/resi setelah data alamat diperbaiki.
3. Sinkron order timeout.
   Recovery: gunakan timeout transaksi lebih longgar + snapshot fallback.
4. Google Calendar/Sheets tidak tersinkron.
   Recovery: cek OAuth/service account env, lakukan re-auth/sync ulang.

## 7. KPI User Journey

## 7.1 Aktivasi

- Waktu dari signup ke transaksi pertama.
- Persentase business yang setup master data lengkap.

## 7.2 Operasional

- Rata-rata waktu input transaksi kasir.
- Persentase shift yang closed tanpa selisih signifikan.
- Persentase order bakery yang on-time.

## 7.3 Reliabilitas

- Delivery rate notifikasi automasi.
- Error rate endpoint kritikal (orders, shipping, payment).
- Rata-rata waktu recovery insiden.

## 7.4 Nilai Bisnis

- Growth omzet mingguan/bulanan.
- Margin improvement pasca optimasi pricing/recipe.
- Penurunan waste dan stockout.

## 8. Prioritas UX Lanjutan

1. Wizard onboarding step-by-step agar owner tidak skip setup penting.
2. Mode kasir ultra-cepat untuk jam puncak.
3. Booking validation checklist sebelum save order.
4. Halaman observability automasi (WA/Calendar/Sheets) dengan retry terpusat.
5. Insight AI yang langsung punya rekomendasi aksi operasional.

---

Dokumen ini disarankan direview per 2 minggu bersama tim operasional agar selalu selaras dengan SOP lapangan.
