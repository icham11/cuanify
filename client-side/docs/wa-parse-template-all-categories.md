# Template WA Parse - Semua Kategori

Dokumen ini dipakai untuk copy-paste format order WhatsApp agar parser membaca data dengan stabil.

## Aturan Umum

- Gunakan label persis seperti template.
- Untuk field kosong, isi dengan `-` (jangan hapus label).
- Untuk order Buket, gunakan pola `Hbq isi X` atau `Sbq isi X`.
- Gunakan format tanggal `DD/MM/YY` atau `DD/MM/YYYY`.
- Gunakan satu blok `Item` per produk.

---

## Header Order

```
Tanggal Pengiriman: DD/MM/YY
KODE BOOKING: XXX-00
```

---

## Template Item - Cake

```
Item 1
Order: 1 cake

Nama di Cake: ...
Umur di cake: ...
Ukuran cake: ...
Rasa cake: ...
Design cake: ...
```

---

## Template Item - Cookies

```
Item 2
Order: 20 pcs cookies

Design Cookies: ...
To From Notes: ...
```

Contoh breakdown design cookies (opsional):

```
Breakdown: 10 pcs SIMPLE, 10 pcs HARD
```

---

## Template Item - Cupcakes

```
Item 3
Order: 1 dozen cupcakes

Jumlah Cupcakes: 1 dozen
Rasa Cupcakes: ...
Warna Cupcakes: ...
Jumlah Topper Cookies: ...
```

Untuk individual cupcakes:

```
Order: 10 individual cupcakes
Jumlah Cupcakes: 10 indv
```

---

## Template Item - Buket

```
Item 4
Order: Hbq isi 10
Design: ...

Warna kertas bouquet: ...
Ribbon: ...
Jumlah Bunga: ...
Warna Bunga: ...
Warna Pita: ...
Kartu ucapan: ...
```

Catatan:

- `Hbq` = Hand Bouquet (7-10)
- `Sbq` = Standing Bouquet (12-20)
- Harga Buket menggunakan formula: `(harga cookie x qty) + base bouquet`.
- Harga cookie bisa custom, default 17.000.

---

## Template Item - Cookies Tower

```
Item 5
Order: 1 cookies tower

Tema Design: ...
Tema Warna: ...
Nama: ...
Umur: ...
```

---

## Footer Pengiriman

```
From: ...
Jam Pengiriman: 10:00
Metode Pengiriman: gocar
Nama Penerima: ...
No telp Penerima: 08xxxxxxxxxx
Alamat Lengkap: ...
Note: ...
```

---

## Template Multiple Order (1 Chat, Banyak Item)

```
Tanggal Pengiriman: DD/MM/YY
KODE BOOKING: XXX-00

Item 1
Order: Hbq isi 10
Design: ...
Warna kertas bouquet: ...
Ribbon: ...
Jumlah Bunga: ...
Warna Bunga: ...
Warna Pita: ...
Kartu ucapan: ...

Item 2
Order: 1 dozen cupcakes
Jumlah Cupcakes: 1 dozen
Rasa Cupcakes: ...
Warna Cupcakes: ...
Jumlah Topper Cookies: ...

Item 3
Order: 20 pcs cookies
Design Cookies: ...
To From Notes: ...

From: ...
Jam Pengiriman: 10:00
Metode Pengiriman: gocar
Nama Penerima: ...
No telp Penerima: 08xxxxxxxxxx
Alamat Lengkap: ...
Note: ...
```

Tips multiple order:

- Selalu pakai `Item 1`, `Item 2`, `Item 3`, dst secara urut.
- Jangan gabung 2 produk dalam 1 blok item.
- Jika ada field yang tidak dipakai, isi `-`.
- Gunakan satu footer pengiriman untuk satu alamat tujuan yang sama.

---

## Contoh Full Format Siap Parse

```
Tanggal Pengiriman: 18/04/26
KODE BOOKING: SA-26

Item 1
Order: Hbq isi 10
Design:
- 9pcs karakter digimon (full body)
- 1 pokeball dengan nama ELLIORA dan angka 14

Warna kertas bouquet: No 13
Ribbon: Satin
Jumlah Bunga: -
Warna Bunga: -
Warna Pita: Blue pastel
Kartu ucapan: Happy Birthday Elliora!

From: kuku & kim2
Jam Pengiriman: 10:00
Metode Pengiriman: gocar
Nama Penerima: Sansan
No telp Penerima: 08174922926
Alamat Lengkap: Perumahan Riviera at Puri, Riviera East 10, blok F2 no 16, Tangerang
Note: Masuk lewat gerbang besar
```
