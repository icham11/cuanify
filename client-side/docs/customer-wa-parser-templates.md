# Template Form Customer untuk WA Parser Crumbella

Dokumen ini berisi template yang bisa dikirim ke customer lalu hasilnya di-copy oleh admin ke WA Parser Crumbella.

Tujuan template ini:
- label field konsisten dengan parser
- data booking bisa terpopulate otomatis dengan lebih rapi
- order campuran beda kategori bisa terbaca jadi beberapa item

## Aturan pakai

1. Customer isi nilai setelah tanda `:`
2. Jangan ubah nama label field
3. Satu field satu baris
4. Kalau field tidak dipakai, boleh isi `-`
5. Untuk `Metode Pengiriman`, pakai salah satu:
   `Pickup`, `GoCar`, `Grab`, `GoSend`, `Paxel`, `Same Day`, `JNE/J&T`, `Grab/GoCar (pesan customer)`
6. Untuk multi-order beda kategori, isi 1 template gabungan dan tulis semua produk di field `Order:`
7. Untuk multi-order dengan kategori sama tapi detail berbeda, lebih aman kirim 2 template terpisah
   Contoh: `1 cake tema A + 1 cake tema B`

## Template Cake

```text
Tanggal Pengiriman:
KODE BOOKING:
Order:
Nama di Cake:
Umur di cake:
Ukuran cake:
Rasa cake:
Design cake:
Jam Pengiriman:
Metode Pengiriman:
Nama penerima:
No. telp penerima:
Alamat lengkap:
```

Contoh `Order:`:
- `1 cake`
- `1 cake 16 cm`
- `1 real cake 15 cm`

## Template Cookies

```text
Tanggal Pengiriman:
KODE BOOKING:
Order:
To From Notes:
Jam Pengiriman:
Metode Pengiriman:
Nama penerima:
No. telp penerima:
Alamat lengkap:
```

Contoh `Order:`:
- `20 pcs cookies`
- `50 pcs individual cookies`

## Template Cupcakes

```text
Tanggal Pengiriman:
KODE BOOKING:
Order:
Jumlah Cupcakes:
Rasa Cupcakes:
Warna Cupcakes:
Jumlah Topper Cookies:
Jam Pengiriman:
Metode Pengiriman:
Nama penerima:
No. telp penerima:
Alamat lengkap:
```

Contoh isi:
- `Order: 1 dozen cupcakes + 6 indv cupcakes`
- `Jumlah Cupcakes: 1 dozen + 6 indv`
- `Rasa Cupcakes: dozen: vanilla, indv: chocolate`
- `Warna Cupcakes: pink muda, lilac`

## Template Buket

```text
Tanggal Pengiriman:
KODE BOOKING:
Order:
Design:
Warna kertas bouquet:
Jumlah Cookies (isi bouquet):
Harga Cookie / pcs:
Warna Bunga:
Kartu ucapan:
Jam Pengiriman:
Metode Pengiriman:
Nama penerima:
No. telp penerima:
Alamat lengkap:
```

Contoh `Order:`:
- `1 hand bouquet`
- `1 standing bouquet`
- `1 hand bouquet isi 10`

## Template Cookies Tower

```text
Tanggal Pengiriman:
KODE BOOKING:
Order:
Tema Design:
Tema Warna:
Nama:
Umur:
Jam Pengiriman:
Metode Pengiriman:
Nama penerima:
No. telp penerima:
Alamat lengkap:
```

Contoh `Order:`:
- `1 cookies tower`

## Template Multi-Order Beda Kategori

Pakai template ini kalau customer pesan beberapa produk beda kategori sekaligus.

Contoh yang didukung dengan baik:
- `1 cake + 1 dozen cupcakes`
- `1 hand bouquet + 20 cookies`
- `1 cake + 1 cookies tower + 6 indv cupcakes`

```text
Tanggal Pengiriman:
KODE BOOKING:
Order:

Nama di Cake:
Umur di cake:
Ukuran cake:
Rasa cake:
Design cake:

Jumlah Cupcakes:
Rasa Cupcakes:
Warna Cupcakes:
Jumlah Topper Cookies:

To From Notes:

Design:
Warna kertas bouquet:
Jumlah Cookies (isi bouquet):
Harga Cookie / pcs:
Warna Bunga:
Kartu ucapan:

Tema Design:
Tema Warna:
Nama:
Umur:

Jam Pengiriman:
Metode Pengiriman:
Nama penerima:
No. telp penerima:
Alamat lengkap:
```

Cara isi:
- isi `Order:` dengan ringkasan semua item
- isi hanya blok yang relevan
- field yang tidak dipakai isi `-`

Contoh multi-order:

```text
Tanggal Pengiriman: 18/04/2026
KODE BOOKING: SA-26
Order: 1 cake + 1 dozen cupcakes

Nama di Cake: Elliora
Umur di cake: 14
Ukuran cake: 16 cm
Rasa cake: vanilla
Design cake: pokeball dan karakter digimon

Jumlah Cupcakes: 1 dozen
Rasa Cupcakes: vanilla
Warna Cupcakes: pink muda, biru muda
Jumlah Topper Cookies: 0

To From Notes: -

Design: -
Warna kertas bouquet: -
Jumlah Cookies (isi bouquet): -
Harga Cookie / pcs: -
Warna Bunga: -
Kartu ucapan: -

Tema Design: -
Tema Warna: -
Nama: -
Umur: -

Jam Pengiriman: 10:00
Metode Pengiriman: GoCar
Nama penerima: Sansan
No. telp penerima: 08174922926
Alamat lengkap: Perumahan Riviera at Puri, Riviera East 10, blok F2 no 16, Cipondoh, Tangerang
```

## Template Multi-Order dengan Kategori Sama

Kalau customer pesan 2 item dengan kategori sama tetapi detail berbeda, jangan digabung dalam 1 template.

Contoh yang sebaiknya dipisah:
- `1 cake tema spiderman + 1 cake tema princess`
- `1 dozen cupcakes pink + 1 dozen cupcakes blue`

Format yang disarankan:
- kirim 2 template terpisah
- atau admin input manual jadi 2 item setelah parse

## Template Rekap Order Admin

Kalau admin mau harga item ikut kebaca lebih akurat, tambahkan blok `REKAP ORDER` dengan format terstruktur seperti ini.

```text
REKAP ORDER

Customer:
Tanggal Pengiriman:
Jam Pengiriman:
Metode Pengiriman:

ITEM 1
Kategori:
Nama Produk:
Qty:
Size/Varian:
Design/Notes:
Add On:
Harga Satuan:
Subtotal:

ITEM 2
Kategori:
Nama Produk:
Qty:
Size/Varian:
Design/Notes:
Add On:
Harga Satuan:
Subtotal:

SUBTOTAL PRODUK:
ONGKIR:
ADJUSTMENT:
TOTAL:
DP:
SISA:
```

Contoh:

```text
REKAP ORDER

Customer: Elliora
Tanggal Pengiriman: 18/04/2026
Jam Pengiriman: 10:00
Metode Pengiriman: GoCar

ITEM 1
Kategori: Cake
Nama Produk: Custom Cake
Qty: 1
Size/Varian: 16 cm
Design/Notes: Pokeball, nama Elliora, angka 14
Add On: -
Harga Satuan: 450000
Subtotal: 450000

ITEM 2
Kategori: Cupcakes
Nama Produk: 1 Dozen Cupcakes
Qty: 1
Size/Varian: Dozen
Design/Notes: pink muda, biru muda
Add On: -
Harga Satuan: 240000
Subtotal: 240000

Subtotal Produk: 690000
Ongkir: 0
Adjustment: 0
Total: 690000
DP: 345000
Sisa: 345000
```

Catatan:
- parser sekarang akan baca `ITEM 1`, `ITEM 2`, dan seterusnya sebagai item terpisah
- `Subtotal` item akan dipakai sebagai override harga item di form booking
- kalau admin mengubah produk, varian, atau qty setelah parse, override harga recap akan otomatis direset supaya tidak salah
- `Ongkir`, `DP`, dan `Sisa` dibaca sebagai referensi recap dan ditampilkan di preview parser
- untuk 2 item kategori sama dengan design berbeda, format recap ini tetap aman karena tiap `ITEM` dipertahankan terpisah

## Tips untuk Admin

- Jika customer chat berantakan, pindahkan dulu ke template di atas sebelum paste ke parser
- Untuk order campuran, pilih `Auto Detect` saat parse
- Setelah parser selesai, cek bagian preview item dan detail yang terdeteksi
- Kalau ada 2 item tetapi salah satu detail belum cocok, edit item di form sebelum submit booking
