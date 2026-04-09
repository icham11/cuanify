# Production Workflow QA Checklist

Tanggal update: 2026-04-09
Scope: validasi aturan assignment, status progression, transfer owner-only, dan batas token harian staff 500.

## Setup Data Uji

- Siapkan minimal 3 user:
  - Owner 1
  - Staff A
  - Staff B
- Siapkan minimal 6 order aktif pada tanggal kirim yang sama.
- Siapkan minimal 1 order status Delivered dan 1 order status Completed.
- Pastikan setiap order punya token terhitung (gunakan kombinasi token kecil dan besar).

## Checklist Owner

### 1) Owner dapat transfer order yang sudah assigned

- Login sebagai Owner.
- Buka halaman Production.
- Pilih order yang sudah assigned ke Staff A.
- Klik tombol Transfer.
- Pilih Staff B di modal.
- Klik Konfirmasi Transfer.
- Expected:
  - Assignment berpindah ke Staff B.
  - Toast sukses muncul: Order berhasil dipindahkan.
  - Tidak ada error Forbidden dari API.

### 2) Owner tidak dapat transfer jika tidak ada kandidat staff lain

- Login sebagai Owner.
- Pilih order assigned saat hanya ada satu staff aktif di daftar.
- Expected:
  - Tombol Transfer dalam kondisi disabled.
  - Modal tidak bisa dipakai untuk transfer.

### 3) Owner tetap tidak bisa ubah status jika order unassigned

- Login sebagai Owner.
- Pilih order dengan badge Unassigned.
- Coba ubah status dari dropdown.
- Expected:
  - Dropdown disabled.
  - Pesan helper muncul: Ambil order terlebih dahulu sebelum mengubah status.

## Checklist Staff

### 4) Staff hanya bisa ambil order unassigned untuk dirinya

- Login sebagai Staff A.
- Cari order unassigned.
- Klik Ambil.
- Expected:
  - Order assigned ke Staff A.
  - Status belum berubah otomatis.
  - Tidak ada error authorization.

### 5) Staff tidak bisa lepas assignment

- Login sebagai Staff A.
- Pilih order yang sudah diambil Staff A.
- Expected:
  - Tidak ada tombol Lepas di UI.
  - Staff tidak punya alur unassign.

### 6) Staff tidak bisa transfer order ke staff lain

- Login sebagai Staff A.
- Pada order milik Staff A, cari aksi transfer.
- Expected:
  - Tidak ada tombol Transfer untuk Staff.
  - Jika payload dimanipulasi manual, API menolak dengan 403.

### 7) Staff hanya bisa ubah status order miliknya

- Login sebagai Staff A.
- Coba ubah status order yang assigned ke Staff B.
- Expected:
  - Dropdown disabled.
  - Pesan helper: Hanya staff yang ditugaskan dapat mengubah status.

### 8) Staff dapat ubah status order miliknya sesuai allowed statuses

- Login sebagai Staff A.
- Pilih order assigned ke Staff A.
- Ubah status berurutan sesuai opsi dropdown.
- Expected:
  - Opsi status mengikuti flow UI.
  - API menerima perubahan ke In Production, Ready, Delivered, Completed.

### 9) Tombol Ambil disable jika proyeksi token harian staff > 500

- Login sebagai Staff A.
- Buat kondisi total token aktif Staff A pada tanggal D mendekati 500.
- Cari order unassigned tanggal D dengan token yang membuat total melewati 500.
- Expected:
  - Tombol Ambil disabled.
  - Pesan muncul: Token harian melebihi batas (500).

## Checklist Cashier

### 10) Cashier tidak memiliki akses pengambilan order produksi

- Login sebagai Cashier.
- Buka halaman Production.
- Expected:
  - Teks informasi role kasir tampil.
  - Tidak bisa Ambil/Transfer.

## Validasi Backend Guardrail

### 11) API menolak status change jika order belum assigned

- Kirim payload update order yang mengubah status tetapi assignedStaffUserId null.
- Expected:
  - Response 403.
  - Error: Order must be assigned before changing status.

### 12) API menolak transfer oleh non-owner

- Login sebagai Staff A.
- Kirim payload transfer order dari Staff A ke Staff B.
- Expected:
  - Response 403.
  - Error: Hanya owner yang dapat memindahkan assignment order.

### 13) API menolak proyeksi token staff di atas 500

- Kirim payload assignment yang menyebabkan total token aktif staff/date lebih dari 500.
- Expected:
  - Response 403.
  - Error mengandung: Token harian staff melebihi limit.

## Indikator UI Staff Productivity

### 14) Warna indikator token harian sesuai persentase

- Buka panel Staff Productivity.
- Expected:
  - Hijau untuk < 70% dari limit.
  - Kuning untuk 70% sampai 99%.
  - Merah untuk >= 100%.
  - Label menampilkan format: X / 500 token.

## Catatan Eksekusi

- Jalankan checklist ini untuk 2 mode filter:
  - Tanpa filter tanggal.
  - Dengan filter tanggal spesifik.
- Ulangi skenario utama setelah hard refresh untuk memastikan state sinkron dengan server.
